import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  assets,
  backgroundJobs,
  inboundEmailAttachments,
  inboundEmailMailboxes,
  inboundEmailMessages,
  inboundEmailRules,
  issueAttachments,
  projects,
} from "@paperclipai/db";
import type {
  CreateInboundEmailMailbox,
  CreateInboundEmailRule,
  InboundEmailMailbox as MailboxView,
  UpdateInboundEmailMailbox,
  UpdateInboundEmailRule,
} from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";
import { logger } from "../middleware/logger.js";
import type { StorageService } from "../storage/types.js";
import { backgroundJobService } from "./background-jobs.js";
import { fetchUnreadMessages, testImapConnection } from "./inbound-email-imap.js";
import { parseInboundEmail } from "./inbound-email-mime.js";
import { issueService } from "./issues.js";
import { logActivity } from "./activity-log.js";
import { secretService } from "./secrets.js";

export const INBOUND_EMAIL_PASSWORD_SECRET_PREFIX = "__inbound_email_password__";
export const EMAIL_POLL_MAILBOX_JOB_KIND = "email.poll_mailbox";
export const EMAIL_PROCESS_MESSAGE_JOB_KIND = "email.process_message";

const DEFAULT_EMAIL_WORKER_BATCH_SIZE = 10;
const DEFAULT_EMAIL_FETCH_LIMIT = 20;
const INBOUND_EMAIL_ACTOR = {
  actorType: "system" as const,
  actorId: "inbound-email-worker",
};

export type ListPageOptions = {
  limit?: number;
  cursor?: string | null;
};

export type ListPage<T> = {
  items: T[];
  nextCursor: string | null;
};

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-zA-Z]+);/g, (_m, name) => HTML_ENTITIES[name.toLowerCase()] ?? `&${name};`);
}

function htmlToPlain(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function secretNameForMailbox(mailboxId: string): string {
  return `${INBOUND_EMAIL_PASSWORD_SECRET_PREFIX}:${mailboxId}`;
}

function redactMailbox(row: typeof inboundEmailMailboxes.$inferSelect): MailboxView {
  const { passwordSecretName, ...safeRow } = row;
  return {
    ...safeRow,
    passwordSet: Boolean(passwordSecretName),
  } as MailboxView;
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function matchesPattern(value: string | null | undefined, pattern: string | null | undefined): boolean {
  const normalizedPattern = pattern?.trim().toLowerCase();
  if (!normalizedPattern) return true;
  return (value ?? "").toLowerCase().includes(normalizedPattern);
}

function clampLimit(limit: number | undefined, fallback = 50, max = 200): number {
  if (!Number.isFinite(limit ?? NaN)) return fallback;
  const value = Math.floor(limit as number);
  if (value <= 0) return fallback;
  return Math.min(value, max);
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const [iso, id] = decoded.split("|");
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function formatIssueDescription(input: {
  message: typeof inboundEmailMessages.$inferSelect;
  attachmentCount: number;
}): string {
  const bodyFallback =
    input.message.bodyText?.trim() ||
    (input.message.bodyHtml ? htmlToPlain(input.message.bodyHtml) : "") ||
    "(No body text)";
  const lines = [
    "Created from an inbound email.",
    "",
    `From: ${input.message.fromAddress ?? "unknown"}`,
    `To: ${input.message.toAddresses.length > 0 ? input.message.toAddresses.join(", ") : "unknown"}`,
    `Received: ${input.message.receivedAt?.toISOString() ?? "unknown"}`,
    `Message-ID: ${input.message.messageId ?? "none"}`,
    `Inbound message: ${input.message.id}`,
    "",
    "Body:",
    bodyFallback,
  ];
  if (input.attachmentCount > 0) {
    lines.push("", `Attachments imported: ${input.attachmentCount}`);
  }
  return lines.join("\n");
}

export function inboundEmailService(db: Db, storage?: StorageService) {
  const jobs = backgroundJobService(db);
  const secrets = secretService(db);
  const issues = issueService(db);

  async function assertProjectBelongsToCompany(companyId: string, projectId: string | null | undefined) {
    if (!projectId) return;
    const row = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!row) throw unprocessable("targetProjectId must belong to the same company");
  }

  async function loadMailbox(companyId: string, mailboxId: string) {
    const mailbox = await db
      .select()
      .from(inboundEmailMailboxes)
      .where(and(eq(inboundEmailMailboxes.id, mailboxId), eq(inboundEmailMailboxes.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!mailbox) throw notFound("Inbound email mailbox not found");
    return mailbox;
  }

  async function resolveMailboxPassword(mailbox: typeof inboundEmailMailboxes.$inferSelect): Promise<string | null> {
    if (!mailbox.passwordSecretName) return null;
    const secret = await secrets.getByName(mailbox.companyId, mailbox.passwordSecretName);
    if (!secret) return null;
    return secrets.resolveSecretValue(mailbox.companyId, secret.id, "latest");
  }

  async function writeOrRotateMailboxSecret(
    companyId: string,
    secretName: string,
    plaintext: string,
    actor?: { userId?: string | null; agentId?: string | null },
  ): Promise<void> {
    const existing = await secrets.getByName(companyId, secretName);
    if (existing) {
      await secrets.rotate(existing.id, { value: plaintext }, actor);
    } else {
      await secrets.create(
        companyId,
        { name: secretName, provider: "local_encrypted", value: plaintext },
        actor,
      );
    }
  }

  async function clearMailboxSecret(companyId: string, secretName: string): Promise<void> {
    const existing = await secrets.getByName(companyId, secretName);
    if (existing) await secrets.remove(existing.id);
  }

  async function enqueueProcessMessage(companyId: string, messageId: string) {
    return jobs.enqueue({
      companyId,
      kind: EMAIL_PROCESS_MESSAGE_JOB_KIND,
      dedupeKey: messageId,
      payload: { messageId },
      maxAttempts: 5,
    });
  }

  async function findDuplicate(input: {
    companyId: string;
    mailboxId: string;
    providerUid?: string | null;
    rawSha256: string;
    messageId?: string | null;
  }) {
    return db
      .select()
      .from(inboundEmailMessages)
      .where(
        and(
          eq(inboundEmailMessages.companyId, input.companyId),
          or(
            eq(inboundEmailMessages.rawSha256, input.rawSha256),
            input.messageId ? eq(inboundEmailMessages.messageId, input.messageId) : undefined,
            input.providerUid
              ? and(
                eq(inboundEmailMessages.mailboxId, input.mailboxId),
                eq(inboundEmailMessages.providerUid, input.providerUid),
              )
              : undefined,
          ),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  async function storeRawEmail(companyId: string, raw: Buffer, messageId: string | null): Promise<string | null> {
    if (!storage) return null;
    const stored = await storage.putFile({
      companyId,
      namespace: "inbound-email/raw",
      contentType: "message/rfc822",
      originalFilename: `${(messageId ?? randomUUID()).replace(/[^a-zA-Z0-9._-]+/g, "_")}.eml`,
      body: raw,
    });
    return stored.objectKey;
  }

  async function storeAttachment(input: {
    companyId: string;
    messageId: string;
    filename: string | null;
    contentType: string;
    body: Buffer;
    createdIssueId?: string | null;
  }) {
    const sha = hashBuffer(input.body);
    let assetId: string | null = null;
    if (storage) {
      const stored = await storage.putFile({
        companyId: input.companyId,
        namespace: "inbound-email/attachments",
        contentType: input.contentType,
        originalFilename: input.filename,
        body: input.body,
      });
      const [asset] = await db
        .insert(assets)
        .values({
          companyId: input.companyId,
          provider: stored.provider,
          objectKey: stored.objectKey,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          sha256: stored.sha256,
          originalFilename: stored.originalFilename,
        })
        .returning({ id: assets.id });
      assetId = asset.id;
    }
    const [attachment] = await db
      .insert(inboundEmailAttachments)
      .values({
        companyId: input.companyId,
        messageId: input.messageId,
        assetId,
        filename: input.filename,
        contentType: input.contentType,
        byteSize: input.body.length,
        sha256: sha,
        status: "stored",
      })
      .returning();
    return attachment;
  }

  async function selectRule(message: typeof inboundEmailMessages.$inferSelect) {
    const rules = await db
      .select()
      .from(inboundEmailRules)
      .where(
        and(
          eq(inboundEmailRules.companyId, message.companyId),
          eq(inboundEmailRules.enabled, true),
          or(eq(inboundEmailRules.mailboxId, message.mailboxId), isNull(inboundEmailRules.mailboxId)),
        ),
      )
      .orderBy(asc(inboundEmailRules.createdAt), asc(inboundEmailRules.id));
    return rules.find((rule) =>
      matchesPattern(message.fromAddress, rule.senderPattern) &&
      matchesPattern(message.subject, rule.subjectPattern),
    ) ?? null;
  }

  async function createIssueFromMessage(message: typeof inboundEmailMessages.$inferSelect) {
    const mailbox = await loadMailbox(message.companyId, message.mailboxId);
    const rule = await selectRule(message);
    const attachmentRows = await db
      .select()
      .from(inboundEmailAttachments)
      .where(eq(inboundEmailAttachments.messageId, message.id));
    const targetProjectId = rule?.targetProjectId ?? mailbox.targetProjectId ?? null;
    const issue = await issues.create(message.companyId, {
      title: (message.subject?.trim() || `Inbound email from ${message.fromAddress ?? "unknown sender"}`).slice(0, 300),
      description: formatIssueDescription({ message, attachmentCount: attachmentRows.length }),
      status: "backlog",
      priority: rule?.priority ?? "medium",
      projectId: targetProjectId,
      labelIds: rule?.labelIds ?? [],
      originKind: "inbound_email",
      originId: message.id,
      originFingerprint: message.rawSha256,
    });
    const attachmentsWithAssets = attachmentRows.filter((row) => row.assetId);
    if (attachmentsWithAssets.length > 0) {
      await db.insert(issueAttachments).values(
        attachmentsWithAssets.map((row) => ({
          companyId: message.companyId,
          issueId: issue.id,
          assetId: row.assetId!,
        })),
      );
    }
    return issue;
  }

  // Cursor-paginated select where rows are ordered by (createdAt asc, id asc).
  async function paginated<T extends { id: string; createdAt: Date }>(
    rows: (limit: number, cursor: { createdAt: Date; id: string } | null) => Promise<T[]>,
    options: ListPageOptions | undefined,
  ): Promise<ListPage<T>> {
    const limit = clampLimit(options?.limit);
    const cursor = decodeCursor(options?.cursor);
    const fetched = await rows(limit + 1, cursor);
    const items = fetched.slice(0, limit);
    const nextCursor =
      fetched.length > limit
        ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
        : null;
    return { items, nextCursor };
  }

  const api = {
    listMailboxes: async (companyId: string, options?: ListPageOptions): Promise<ListPage<MailboxView>> => {
      const page = await paginated(async (limit, cursor) => {
        return db
          .select()
          .from(inboundEmailMailboxes)
          .where(
            and(
              eq(inboundEmailMailboxes.companyId, companyId),
              cursor
                ? or(
                  sql`${inboundEmailMailboxes.createdAt} > ${cursor.createdAt.toISOString()}::timestamptz`,
                  and(
                    eq(inboundEmailMailboxes.createdAt, cursor.createdAt),
                    sql`${inboundEmailMailboxes.id} > ${cursor.id}::uuid`,
                  ),
                )
                : undefined,
            ),
          )
          .orderBy(asc(inboundEmailMailboxes.createdAt), asc(inboundEmailMailboxes.id))
          .limit(limit);
      }, options);
      return { items: page.items.map(redactMailbox), nextCursor: page.nextCursor };
    },

    createMailbox: async (
      companyId: string,
      input: CreateInboundEmailMailbox,
      actor?: { userId?: string | null; agentId?: string | null },
    ): Promise<MailboxView> => {
      await assertProjectBelongsToCompany(companyId, input.targetProjectId);

      const mailboxId = randomUUID();
      const trimmedPassword = input.password?.trim() ?? "";
      let passwordSecretName: string | null = null;

      if (trimmedPassword.length > 0) {
        const secretName = secretNameForMailbox(mailboxId);
        await writeOrRotateMailboxSecret(companyId, secretName, trimmedPassword, actor);
        passwordSecretName = secretName;
      }

      try {
        const [mailbox] = await db
          .insert(inboundEmailMailboxes)
          .values({
            id: mailboxId,
            companyId,
            name: input.name,
            provider: input.provider,
            enabled: input.enabled,
            host: input.host,
            port: input.port,
            username: input.username,
            folder: input.folder,
            tls: input.tls,
            pollIntervalSeconds: input.pollIntervalSeconds,
            targetProjectId: input.targetProjectId ?? null,
            createMode: input.createMode,
            markSeen: input.markSeen,
            passwordSecretName,
          })
          .returning();
        return redactMailbox(mailbox);
      } catch (error) {
        if (passwordSecretName) {
          await clearMailboxSecret(companyId, passwordSecretName).catch((cleanupError) => {
            logger.warn(
              { err: cleanupError, mailboxId, companyId },
              "failed to roll back orphan mailbox secret",
            );
          });
        }
        throw error;
      }
    },

    updateMailbox: async (
      companyId: string,
      mailboxId: string,
      input: UpdateInboundEmailMailbox,
      actor?: { userId?: string | null; agentId?: string | null },
    ): Promise<MailboxView> => {
      const existing = await loadMailbox(companyId, mailboxId);
      await assertProjectBelongsToCompany(companyId, input.targetProjectId);

      // Update the row first so a validation failure (unique name, FK, etc.)
      // surfaces before we mutate the stored secret. The password field is
      // applied in a follow-up write below.
      const { password: _password, ...patch } = input;
      const [updated] = await db
        .update(inboundEmailMailboxes)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(and(eq(inboundEmailMailboxes.id, mailboxId), eq(inboundEmailMailboxes.companyId, companyId)))
        .returning();
      if (!updated) throw notFound("Inbound email mailbox not found");

      if (input.password === undefined) {
        return redactMailbox(updated);
      }

      const secretName = secretNameForMailbox(existing.id);
      const trimmed = input.password?.trim() ?? "";
      let passwordSecretNameUpdate: string | null;
      if (trimmed.length === 0) {
        await clearMailboxSecret(companyId, secretName);
        passwordSecretNameUpdate = null;
      } else {
        await writeOrRotateMailboxSecret(companyId, secretName, trimmed, actor);
        passwordSecretNameUpdate = secretName;
      }

      if (passwordSecretNameUpdate === updated.passwordSecretName) {
        return redactMailbox(updated);
      }
      const [reflected] = await db
        .update(inboundEmailMailboxes)
        .set({ passwordSecretName: passwordSecretNameUpdate, updatedAt: new Date() })
        .where(eq(inboundEmailMailboxes.id, mailboxId))
        .returning();
      return redactMailbox(reflected);
    },

    listRules: async (companyId: string, options?: ListPageOptions) => {
      return paginated(async (limit, cursor) => {
        return db
          .select()
          .from(inboundEmailRules)
          .where(
            and(
              eq(inboundEmailRules.companyId, companyId),
              cursor
                ? or(
                  sql`${inboundEmailRules.createdAt} > ${cursor.createdAt.toISOString()}::timestamptz`,
                  and(
                    eq(inboundEmailRules.createdAt, cursor.createdAt),
                    sql`${inboundEmailRules.id} > ${cursor.id}::uuid`,
                  ),
                )
                : undefined,
            ),
          )
          .orderBy(asc(inboundEmailRules.createdAt), asc(inboundEmailRules.id))
          .limit(limit);
      }, options);
    },

    createRule: async (companyId: string, input: CreateInboundEmailRule) => {
      if (input.mailboxId) await loadMailbox(companyId, input.mailboxId);
      await assertProjectBelongsToCompany(companyId, input.targetProjectId);
      const [rule] = await db
        .insert(inboundEmailRules)
        .values({
          companyId,
          mailboxId: input.mailboxId ?? null,
          enabled: input.enabled,
          senderPattern: asNullableString(input.senderPattern),
          subjectPattern: asNullableString(input.subjectPattern),
          targetProjectId: input.targetProjectId ?? null,
          createMode: input.createMode,
          priority: input.priority,
          labelIds: input.labelIds ?? [],
        })
        .returning();
      return rule;
    },

    updateRule: async (companyId: string, ruleId: string, input: UpdateInboundEmailRule) => {
      if (input.mailboxId) await loadMailbox(companyId, input.mailboxId);
      await assertProjectBelongsToCompany(companyId, input.targetProjectId);
      const [rule] = await db
        .update(inboundEmailRules)
        .set({
          ...input,
          senderPattern: input.senderPattern === undefined ? undefined : asNullableString(input.senderPattern),
          subjectPattern: input.subjectPattern === undefined ? undefined : asNullableString(input.subjectPattern),
          updatedAt: new Date(),
        })
        .where(and(eq(inboundEmailRules.id, ruleId), eq(inboundEmailRules.companyId, companyId)))
        .returning();
      if (!rule) throw notFound("Inbound email rule not found");
      return rule;
    },

    listMessages: async (
      companyId: string,
      status?: string,
      options?: ListPageOptions,
    ) => {
      return paginated(async (limit, cursor) => {
        const conditions = [eq(inboundEmailMessages.companyId, companyId)];
        if (status) {
          conditions.push(
            eq(
              inboundEmailMessages.status,
              status as typeof inboundEmailMessages.$inferSelect.status,
            ),
          );
        }
        if (cursor) {
          conditions.push(
            or(
              sql`${inboundEmailMessages.createdAt} > ${cursor.createdAt.toISOString()}::timestamptz`,
              and(
                eq(inboundEmailMessages.createdAt, cursor.createdAt),
                sql`${inboundEmailMessages.id} > ${cursor.id}::uuid`,
              ),
            )!,
          );
        }
        return db
          .select()
          .from(inboundEmailMessages)
          .where(and(...conditions))
          .orderBy(asc(inboundEmailMessages.createdAt), asc(inboundEmailMessages.id))
          .limit(limit);
      }, options);
    },

    enqueueDueMailboxPollJobs: async (now = new Date()) => {
      const mailboxes = await db
        .select()
        .from(inboundEmailMailboxes)
        .where(eq(inboundEmailMailboxes.enabled, true));
      let enqueued = 0;
      for (const mailbox of mailboxes) {
        const intervalMs = mailbox.pollIntervalSeconds * 1000;
        if (mailbox.lastPollAt && now.getTime() - mailbox.lastPollAt.getTime() < intervalMs) continue;
        await jobs.enqueue({
          companyId: mailbox.companyId,
          kind: EMAIL_POLL_MAILBOX_JOB_KIND,
          payload: { mailboxId: mailbox.id },
          dedupeKey: `${mailbox.id}:${Math.floor(now.getTime() / intervalMs)}`,
          maxAttempts: 3,
        });
        enqueued += 1;
      }
      return enqueued;
    },

    enqueueMailboxPoll: async (companyId: string, mailboxId: string) => {
      await loadMailbox(companyId, mailboxId);
      return jobs.enqueue({
        companyId,
        kind: EMAIL_POLL_MAILBOX_JOB_KIND,
        payload: { mailboxId },
        dedupeKey: `${mailboxId}:manual`,
        maxAttempts: 3,
      });
    },

    testMailboxConnection: async (companyId: string, mailboxId: string) => {
      const mailbox = await loadMailbox(companyId, mailboxId);
      const password = await resolveMailboxPassword(mailbox);
      if (!password) throw unprocessable("Inbound mailbox password is not configured");
      await testImapConnection({
        host: mailbox.host,
        port: mailbox.port,
        username: mailbox.username,
        password,
        folder: mailbox.folder,
        tls: mailbox.tls,
      });
    },

    pollMailbox: async (companyId: string, mailboxId: string, options?: { fetchLimit?: number }) => {
      const mailbox = await loadMailbox(companyId, mailboxId);
      const password = await resolveMailboxPassword(mailbox);
      if (!password) throw unprocessable("Inbound mailbox password is not configured");

      const now = new Date();
      await db
        .update(inboundEmailMailboxes)
        .set({ lastPollAt: now, lastError: null, updatedAt: now })
        .where(eq(inboundEmailMailboxes.id, mailbox.id));

      let imported = 0;
      let session: Awaited<ReturnType<typeof fetchUnreadMessages>> | null = null;
      try {
        session = await fetchUnreadMessages(
          {
            host: mailbox.host,
            port: mailbox.port,
            username: mailbox.username,
            password,
            folder: mailbox.folder,
            tls: mailbox.tls,
          },
          options?.fetchLimit ?? DEFAULT_EMAIL_FETCH_LIMIT,
        );
        for (const message of session.messages) {
          const result = await api.submitRawMessage({
            companyId,
            mailboxId: mailbox.id,
            providerUid: message.providerUid,
            rawEmail: message.raw,
            processAfterImport: true,
          });
          if (result.status !== "duplicate") imported += 1;
          if (mailbox.markSeen) {
            try {
              await message.markSeen();
            } catch (flagError) {
              logger.warn(
                { err: flagError, mailboxId: mailbox.id, uid: message.providerUid },
                "failed to mark IMAP message seen",
              );
            }
          }
        }
        await db
          .update(inboundEmailMailboxes)
          .set({ lastSuccessAt: new Date(), lastError: null, updatedAt: new Date() })
          .where(eq(inboundEmailMailboxes.id, mailbox.id));
      } catch (error) {
        await db
          .update(inboundEmailMailboxes)
          .set({ lastError: error instanceof Error ? error.message : String(error), updatedAt: new Date() })
          .where(eq(inboundEmailMailboxes.id, mailbox.id));
        throw error;
      } finally {
        if (session) await session.close();
      }
      return { imported };
    },

    submitRawMessage: async (input: {
      companyId: string;
      mailboxId: string;
      providerUid?: string | null;
      rawEmail: Buffer | string;
      processAfterImport?: boolean;
    }) => {
      await loadMailbox(input.companyId, input.mailboxId);
      const raw = Buffer.isBuffer(input.rawEmail) ? input.rawEmail : Buffer.from(input.rawEmail, "utf8");
      const parsed = await parseInboundEmail(raw);
      const duplicate = await findDuplicate({
        companyId: input.companyId,
        mailboxId: input.mailboxId,
        providerUid: input.providerUid,
        rawSha256: parsed.rawSha256,
        messageId: parsed.messageId,
      });
      if (duplicate) {
        // A message row already exists but never reached "processed". This
        // happens when a prior import insert succeeded but a later step
        // (attachment storage, activity log, or job enqueue) failed before
        // the process job was scheduled. Re-enqueue so the worker retry
        // doesn't strand the message.
        if (
          input.processAfterImport !== false &&
          duplicate.status !== "processed" &&
          duplicate.status !== "duplicate" &&
          !duplicate.createdIssueId
        ) {
          await enqueueProcessMessage(duplicate.companyId, duplicate.id);
        }
        return { message: duplicate, status: "duplicate" as const };
      }
      const rawStorageKey = await storeRawEmail(input.companyId, raw, parsed.messageId);
      const [message] = await db
        .insert(inboundEmailMessages)
        .values({
          companyId: input.companyId,
          mailboxId: input.mailboxId,
          providerUid: input.providerUid ?? null,
          messageId: parsed.messageId,
          rawSha256: parsed.rawSha256,
          fromAddress: parsed.fromAddress,
          toAddresses: parsed.toAddresses,
          subject: parsed.subject,
          receivedAt: parsed.receivedAt,
          status: "persisted",
          bodyText: parsed.bodyText,
          bodyHtml: parsed.bodyHtml,
          rawStorageKey,
        })
        .returning();
      for (const attachment of parsed.attachments) {
        await storeAttachment({
          companyId: input.companyId,
          messageId: message.id,
          filename: attachment.filename,
          contentType: attachment.contentType,
          body: attachment.body,
        });
      }
      await logActivity(db, {
        companyId: input.companyId,
        ...INBOUND_EMAIL_ACTOR,
        action: "inbound_email.message_imported",
        entityType: "inbound_email_message",
        entityId: message.id,
        details: {
          mailboxId: input.mailboxId,
          messageId: parsed.messageId,
          rawSha256: parsed.rawSha256,
          attachmentCount: parsed.attachments.length,
        },
      });
      if (input.processAfterImport !== false) {
        await enqueueProcessMessage(input.companyId, message.id);
      }
      return { message, status: "persisted" as const };
    },

    processMessage: async (companyId: string, messageId: string) => {
      const message = await db
        .select()
        .from(inboundEmailMessages)
        .where(and(eq(inboundEmailMessages.id, messageId), eq(inboundEmailMessages.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!message) throw notFound("Inbound email message not found");
      if (message.status === "processed" || message.status === "duplicate") return message;
      await db
        .update(inboundEmailMessages)
        .set({ status: "processing", error: null, updatedAt: new Date() })
        .where(eq(inboundEmailMessages.id, message.id));
      try {
        const issue = await createIssueFromMessage(message);
        await db
          .update(inboundEmailMessages)
          .set({
            status: "processed",
            createdIssueId: issue.id,
            error: null,
            updatedAt: new Date(),
          })
          .where(eq(inboundEmailMessages.id, message.id));
        await logActivity(db, {
          companyId: message.companyId,
          ...INBOUND_EMAIL_ACTOR,
          action: "inbound_email.issue_created",
          entityType: "issue",
          entityId: issue.id,
          details: {
            messageId: message.id,
            identifier: issue.identifier,
            subject: message.subject,
          },
        });
        return { ...message, status: "processed" as const, createdIssueId: issue.id };
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        await db
          .update(inboundEmailMessages)
          .set({ status: "failed", error: messageText, updatedAt: new Date() })
          .where(eq(inboundEmailMessages.id, message.id));
        throw error;
      }
    },

    runNextEmailJob: async (workerId: string) => {
      const job = await jobs.claimNext({ workerId, kindPrefix: "email." });
      if (!job) return { claimed: false };
      try {
        if (job.kind === EMAIL_POLL_MAILBOX_JOB_KIND) {
          const mailboxId = asNullableString(job.payload.mailboxId);
          if (!mailboxId) throw new Error("email.poll_mailbox job missing mailboxId");
          await api.pollMailbox(job.companyId, mailboxId);
        } else if (job.kind === EMAIL_PROCESS_MESSAGE_JOB_KIND) {
          const messageId = asNullableString(job.payload.messageId);
          if (!messageId) throw new Error("email.process_message job missing messageId");
          await api.processMessage(job.companyId, messageId);
        } else {
          throw new Error(`Unsupported email job kind: ${job.kind}`);
        }
        await jobs.complete(job.id);
        return { claimed: true, status: "succeeded" as const, jobId: job.id };
      } catch (error) {
        logger.warn({ err: error, jobId: job.id, kind: job.kind }, "inbound email job failed");
        await jobs.fail(job, error);
        return { claimed: true, status: "failed" as const, jobId: job.id };
      }
    },

    runEmailWorkerOnce: async (
      workerId: string,
      batchSize = DEFAULT_EMAIL_WORKER_BATCH_SIZE,
      options?: { runScheduler?: boolean },
    ) => {
      await jobs.requeueStaleRunning(5 * 60_000);
      if (options?.runScheduler !== false) {
        await api.enqueueDueMailboxPollJobs();
      }
      let processed = 0;
      for (let i = 0; i < batchSize; i += 1) {
        const result = await api.runNextEmailJob(workerId);
        if (!result.claimed) break;
        processed += 1;
      }
      return processed;
    },

    listJobs: async (companyId: string, options?: ListPageOptions) => {
      return paginated(async (limit, cursor) => {
        const conditions = [
          eq(backgroundJobs.companyId, companyId),
          inArray(backgroundJobs.kind, [
            EMAIL_POLL_MAILBOX_JOB_KIND,
            EMAIL_PROCESS_MESSAGE_JOB_KIND,
          ]),
        ];
        if (cursor) {
          conditions.push(
            or(
              sql`${backgroundJobs.createdAt} > ${cursor.createdAt.toISOString()}::timestamptz`,
              and(
                eq(backgroundJobs.createdAt, cursor.createdAt),
                sql`${backgroundJobs.id} > ${cursor.id}::uuid`,
              ),
            )!,
          );
        }
        return db
          .select()
          .from(backgroundJobs)
          .where(and(...conditions))
          .orderBy(asc(backgroundJobs.createdAt), asc(backgroundJobs.id))
          .limit(limit);
      }, options);
    },

    // Exposed for tests.
    _selectRule: selectRule,
  };
  return api;
}

// Re-export the rule matcher for unit tests.
export { matchesPattern };
