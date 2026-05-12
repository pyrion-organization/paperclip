import { asc, and, eq, lt, lte, sql } from "drizzle-orm";
import type { Db, IssueCompletionEmailNotificationPayload } from "@paperclipai/db";
import { agents, authUsers, emailNotifications } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import { sendIssueCompletionEmailWithResult } from "./email.js";

const ISSUE_COMPLETION_KIND = "issue_completion";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 60_000;
const DEFAULT_OUTBOX_LIMIT = 10;
const DEFAULT_STALE_SENDING_MS = 5 * 60_000;
const DEFAULT_WORKER_INTERVAL_MS = 30_000;
const MAX_ERROR_LENGTH = 1_000;

type IssueCompletionNotificationIssue = {
  id: string;
  companyId: string;
  title: string;
  identifier?: string | null;
  description?: string | null;
  completedAt?: Date | string | null;
};

type NotificationActor = {
  actorType: "agent" | "user" | "system" | "plugin";
  actorId: string;
  agentId?: string | null;
  runId?: string | null;
};

export type EmailNotificationOutboxResult = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  requeued: number;
};

function truncateError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}...` : message;
}

function maskEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  if (!trimmed) return null;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return "***";
  const localMask = local.length <= 2 ? `${local[0] ?? "*"}***` : `${local.slice(0, 2)}***`;
  return `${localMask}@${domain}`;
}

function parseCompletedAt(value: string | null | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildSubject(issue: IssueCompletionNotificationIssue): string {
  const subjectIdent = issue.identifier ? `${issue.identifier} ` : "";
  return `Issue done: ${subjectIdent}${issue.title}`.slice(0, 200);
}

async function resolveCompletedByName(db: Db, actor: NotificationActor): Promise<{
  completedByName: string;
  completedByKind: "agent" | "user";
}> {
  if (actor.actorType === "agent" && actor.agentId) {
    const actorAgent = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, actor.agentId))
      .then((rows) => rows[0] ?? null);
    return {
      completedByName: actorAgent?.name ?? "Agent",
      completedByKind: "agent",
    };
  }

  if (actor.actorType === "user" && actor.actorId) {
    const actorUser = await db
      .select({ name: authUsers.name })
      .from(authUsers)
      .where(eq(authUsers.id, actor.actorId))
      .then((rows) => rows[0] ?? null);
    return {
      completedByName: actorUser?.name ?? "User",
      completedByKind: "user",
    };
  }

  return {
    completedByName: "Someone",
    completedByKind: "user",
  };
}

async function logNotificationActivity(db: Db, input: {
  companyId: string;
  issueId: string;
  action: string;
  actor: NotificationActor;
  details: Record<string, unknown>;
}) {
  await logActivity(db, {
    companyId: input.companyId,
    actorType: input.actor.actorType,
    actorId: input.actor.actorId,
    agentId: input.actor.agentId ?? null,
    runId: input.actor.runId ?? null,
    action: input.action,
    entityType: "issue",
    entityId: input.issueId,
    details: input.details,
  });
}

export async function enqueueIssueCompletionEmailNotification(db: Db, input: {
  issue: IssueCompletionNotificationIssue;
  creatorUserId: string | null;
  actor: NotificationActor;
  agentComment?: string | null;
  previousStatus?: string | null;
  requestedStatus?: string | null;
  processAfterEnqueue?: boolean;
}): Promise<{ id: string; status: string; skipReason: string | null }> {
  const now = new Date();
  const completedAt = input.issue.completedAt ? new Date(input.issue.completedAt) : now;
  const completedAtIso = Number.isNaN(completedAt.getTime()) ? now.toISOString() : completedAt.toISOString();
  const recipient = input.creatorUserId
    ? await db
      .select({ email: authUsers.email, name: authUsers.name })
      .from(authUsers)
      .where(eq(authUsers.id, input.creatorUserId))
      .then((rows) => rows[0] ?? null)
    : null;
  const completedBy = await resolveCompletedByName(db, input.actor);
  const payload: IssueCompletionEmailNotificationPayload = {
    issueTitle: input.issue.title,
    issueIdentifier: input.issue.identifier ?? null,
    completedByName: completedBy.completedByName,
    completedByKind: completedBy.completedByKind,
    agentComment: input.agentComment?.trim() ? input.agentComment : null,
    issueDescription: input.issue.description?.trim() ? input.issue.description : null,
    completedAt: completedAtIso,
  };
  const skipReason = recipient?.email ? null : "recipient_missing";
  const status = skipReason ? "skipped" : "pending";
  const [notification] = await db
    .insert(emailNotifications)
    .values({
      companyId: input.issue.companyId,
      kind: ISSUE_COMPLETION_KIND,
      status,
      issueId: input.issue.id,
      recipientUserId: input.creatorUserId,
      recipientEmail: recipient?.email ?? null,
      subject: buildSubject(input.issue),
      payload,
      requestedByActorType: input.actor.actorType,
      requestedByActorId: input.actor.actorId,
      requestedByAgentId: input.actor.agentId ?? null,
      requestedByRunId: input.actor.runId ?? null,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      scheduledAt: now,
      skippedAt: skipReason ? now : null,
      skipReason,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: emailNotifications.id,
      status: emailNotifications.status,
      skipReason: emailNotifications.skipReason,
    });

  const activityDetails = {
    kind: ISSUE_COMPLETION_KIND,
    notificationId: notification.id,
    status,
    recipientUserId: input.creatorUserId,
    recipientEmailMasked: maskEmail(recipient?.email),
    previousStatus: input.previousStatus ?? null,
    requestedStatus: input.requestedStatus ?? null,
  };

  if (skipReason) {
    await logNotificationActivity(db, {
      companyId: input.issue.companyId,
      issueId: input.issue.id,
      action: "issue.email_notification_skipped",
      actor: input.actor,
      details: {
        ...activityDetails,
        reason: skipReason,
      },
    });
  } else {
    await logNotificationActivity(db, {
      companyId: input.issue.companyId,
      issueId: input.issue.id,
      action: "issue.email_notification_queued",
      actor: input.actor,
      details: activityDetails,
    });
    if (input.processAfterEnqueue !== false) {
      void processEmailNotificationOutbox(db, { limit: 1 }).catch((err) => {
        logger.warn({ err, notificationId: notification.id, issueId: input.issue.id }, "email notification outbox processing failed after enqueue");
      });
    }
  }

  return notification;
}

async function requeueStaleSendingNotifications(db: Db, now: Date, staleSendingMs: number): Promise<number> {
  const cutoff = new Date(now.getTime() - staleSendingMs);
  const rows = await db
    .update(emailNotifications)
    .set({
      status: "pending",
      scheduledAt: now,
      updatedAt: now,
      lastError: "Requeued after stale sending state",
    })
    .where(and(eq(emailNotifications.status, "sending"), lt(emailNotifications.updatedAt, cutoff)))
    .returning({ id: emailNotifications.id });
  return rows.length;
}

async function markNotificationSkipped(db: Db, notification: typeof emailNotifications.$inferSelect, reason: string) {
  const now = new Date();
  await db
    .update(emailNotifications)
    .set({
      status: "skipped",
      skippedAt: now,
      skipReason: reason,
      updatedAt: now,
    })
    .where(eq(emailNotifications.id, notification.id));
  await logNotificationActivity(db, {
    companyId: notification.companyId,
    issueId: notification.issueId ?? notification.id,
    action: "issue.email_notification_skipped",
    actor: {
      actorType: notification.requestedByActorType as NotificationActor["actorType"],
      actorId: notification.requestedByActorId,
      agentId: notification.requestedByAgentId,
      runId: notification.requestedByRunId,
    },
    details: {
      kind: notification.kind,
      notificationId: notification.id,
      status: "skipped",
      reason,
      attempts: notification.attempts,
      recipientUserId: notification.recipientUserId,
      recipientEmailMasked: maskEmail(notification.recipientEmail),
    },
  });
}

async function logNotificationAttempted(db: Db, notification: typeof emailNotifications.$inferSelect) {
  await logNotificationActivity(db, {
    companyId: notification.companyId,
    issueId: notification.issueId ?? notification.id,
    action: "issue.email_notification_attempted",
    actor: {
      actorType: notification.requestedByActorType as NotificationActor["actorType"],
      actorId: notification.requestedByActorId,
      agentId: notification.requestedByAgentId,
      runId: notification.requestedByRunId,
    },
    details: {
      kind: notification.kind,
      notificationId: notification.id,
      status: "sending",
      attempts: notification.attempts,
      recipientUserId: notification.recipientUserId,
      recipientEmailMasked: maskEmail(notification.recipientEmail),
    },
  });
}

async function markNotificationSent(db: Db, notification: typeof emailNotifications.$inferSelect) {
  const now = new Date();
  await db
    .update(emailNotifications)
    .set({
      status: "sent",
      sentAt: now,
      updatedAt: now,
      lastError: null,
    })
    .where(eq(emailNotifications.id, notification.id));
  await logNotificationActivity(db, {
    companyId: notification.companyId,
    issueId: notification.issueId ?? notification.id,
    action: "issue.email_notification_sent",
    actor: {
      actorType: notification.requestedByActorType as NotificationActor["actorType"],
      actorId: notification.requestedByActorId,
      agentId: notification.requestedByAgentId,
      runId: notification.requestedByRunId,
    },
    details: {
      kind: notification.kind,
      notificationId: notification.id,
      status: "sent",
      attempts: notification.attempts,
      recipientUserId: notification.recipientUserId,
      recipientEmailMasked: maskEmail(notification.recipientEmail),
    },
  });
}

async function markNotificationFailed(db: Db, notification: typeof emailNotifications.$inferSelect, err: unknown, retryDelayMs: number): Promise<"failed" | "requeued"> {
  const now = new Date();
  const lastError = truncateError(err);
  const finalFailure = notification.attempts >= notification.maxAttempts;
  if (finalFailure) {
    await db
      .update(emailNotifications)
      .set({
        status: "failed",
        failedAt: now,
        lastError,
        updatedAt: now,
      })
      .where(eq(emailNotifications.id, notification.id));
    await logNotificationActivity(db, {
      companyId: notification.companyId,
      issueId: notification.issueId ?? notification.id,
      action: "issue.email_notification_failed",
      actor: {
        actorType: notification.requestedByActorType as NotificationActor["actorType"],
        actorId: notification.requestedByActorId,
        agentId: notification.requestedByAgentId,
        runId: notification.requestedByRunId,
      },
      details: {
        kind: notification.kind,
        notificationId: notification.id,
        status: "failed",
        attempts: notification.attempts,
        recipientUserId: notification.recipientUserId,
        recipientEmailMasked: maskEmail(notification.recipientEmail),
        error: lastError,
      },
    });
    return "failed";
  }

  await db
    .update(emailNotifications)
    .set({
      status: "pending",
      scheduledAt: new Date(now.getTime() + retryDelayMs),
      lastError,
      updatedAt: now,
    })
    .where(eq(emailNotifications.id, notification.id));
  return "requeued";
}

async function claimNotification(db: Db, id: string, now: Date): Promise<typeof emailNotifications.$inferSelect | null> {
  const [notification] = await db
    .update(emailNotifications)
    .set({
      status: "sending",
      attempts: sql`${emailNotifications.attempts} + 1`,
      lastAttemptAt: now,
      updatedAt: now,
    })
    .where(and(eq(emailNotifications.id, id), eq(emailNotifications.status, "pending")))
    .returning();
  return notification ?? null;
}

async function deliverNotification(db: Db, notification: typeof emailNotifications.$inferSelect): Promise<"sent" | "skipped"> {
  if (notification.kind !== ISSUE_COMPLETION_KIND) {
    await markNotificationSkipped(db, notification, "unsupported_kind");
    return "skipped";
  }
  if (!notification.issueId) {
    await markNotificationSkipped(db, notification, "issue_missing");
    return "skipped";
  }
  if (!notification.recipientEmail) {
    await markNotificationSkipped(db, notification, "recipient_missing");
    return "skipped";
  }
  if (!notification.payload) {
    await markNotificationSkipped(db, notification, "payload_missing");
    return "skipped";
  }

  const result = await sendIssueCompletionEmailWithResult({
    to: notification.recipientEmail,
    issueTitle: notification.payload.issueTitle,
    issueId: notification.issueId,
    issueIdentifier: notification.payload.issueIdentifier,
    completedByName: notification.payload.completedByName,
    completedByKind: notification.payload.completedByKind,
    agentComment: notification.payload.agentComment,
    issueDescription: notification.payload.issueDescription,
    completedAt: parseCompletedAt(notification.payload.completedAt),
    db,
    companyId: notification.companyId,
  });
  if (result.status === "skipped") {
    await markNotificationSkipped(db, notification, result.reason);
    return "skipped";
  }
  await markNotificationSent(db, notification);
  return "sent";
}

export async function processEmailNotificationOutbox(db: Db, opts?: {
  limit?: number;
  now?: Date;
  retryDelayMs?: number;
  staleSendingMs?: number;
}): Promise<EmailNotificationOutboxResult> {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? DEFAULT_OUTBOX_LIMIT;
  const retryDelayMs = opts?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const requeuedStale = await requeueStaleSendingNotifications(db, now, opts?.staleSendingMs ?? DEFAULT_STALE_SENDING_MS);
  const due = await db
    .select({ id: emailNotifications.id })
    .from(emailNotifications)
    .where(and(eq(emailNotifications.status, "pending"), lte(emailNotifications.scheduledAt, now)))
    .orderBy(asc(emailNotifications.scheduledAt))
    .limit(limit);

  const result: EmailNotificationOutboxResult = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    requeued: requeuedStale,
  };

  for (const item of due) {
    const notification = await claimNotification(db, item.id, now);
    if (!notification) continue;
    result.claimed += 1;
    try {
      await logNotificationAttempted(db, notification);
      const delivery = await deliverNotification(db, notification);
      if (delivery === "sent") result.sent += 1;
      if (delivery === "skipped") result.skipped += 1;
    } catch (err) {
      const status = await markNotificationFailed(db, notification, err, retryDelayMs);
      if (status === "failed") result.failed += 1;
      if (status === "requeued") result.requeued += 1;
    }
  }

  return result;
}

export function startEmailNotificationOutboxWorker(db: Db, opts?: {
  intervalMs?: number;
  limit?: number;
}): { stop(): void } {
  let running = false;
  let stopped = false;
  const tick = () => {
    if (running || stopped) return;
    running = true;
    void processEmailNotificationOutbox(db, { limit: opts?.limit ?? DEFAULT_OUTBOX_LIMIT })
      .then((result) => {
        if (result.sent > 0 || result.skipped > 0 || result.failed > 0 || result.requeued > 0) {
          logger.info(result, "email notification outbox processed");
        }
      })
      .catch((err) => {
        logger.error({ err }, "email notification outbox worker tick failed");
      })
      .finally(() => {
        running = false;
      });
  };

  const timer = setInterval(tick, opts?.intervalMs ?? DEFAULT_WORKER_INTERVAL_MS);
  timer.unref?.();
  tick();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
