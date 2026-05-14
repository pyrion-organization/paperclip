import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  backgroundJobs,
  activityLog,
  companies,
  companySecrets,
  companySecretVersions,
  createDb,
  inboundEmailMailboxes,
  inboundEmailMessages,
  issues,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { inboundEmailService } from "../services/inbound-email.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres inbound email tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

function rawEmail(input?: { subject?: string; messageId?: string }) {
  return [
    `Message-ID: ${input?.messageId ?? `<${randomUUID()}@example.com>`}`,
    "From: Customer <customer@example.com>",
    "To: intake@example.com",
    `Subject: ${input?.subject ?? "Need help with production deploy"}`,
    "Date: Tue, 12 May 2026 10:00:00 +0000",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Please investigate the production deploy failure.",
  ].join("\r\n");
}

describeEmbeddedPostgres("inbound email service", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof inboundEmailService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-inbound-email-");
    db = createDb(tempDb.connectionString);
    svc = inboundEmailService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(backgroundJobs);
    await db.delete(activityLog);
    await db.delete(inboundEmailMessages);
    await db.delete(inboundEmailMailboxes);
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(companySecretVersions);
    await db.delete(companySecrets);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany(name = "Acme Operations") {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name,
      issuePrefix: `I${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  it("imports a raw inbound email, deduplicates it, and creates an issue through the queue", async () => {
    const companyId = await seedCompany();
    const mailbox = await svc.createMailbox(
      companyId,
      {
        name: "Support inbox",
        provider: "imap",
        enabled: false,
        host: "imap.example.com",
        port: 993,
        username: "support@example.com",
        password: "mailbox-secret",
        folder: "INBOX",
        tls: true,
        pollIntervalSeconds: 60,
        targetProjectId: null,
        createMode: "issue",
        markSeen: true,
      },
      { userId: "board-user" },
    );

    expect(mailbox.passwordSet).toBe(true);
    expect(mailbox).not.toHaveProperty("passwordSecretName");

    const message = rawEmail({ messageId: "<deploy-failure@example.com>" });
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: message,
      providerUid: "101",
    });
    expect(imported.status).toBe("persisted");

    const duplicate = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: message,
      providerUid: "101",
    });
    expect(duplicate.status).toBe("duplicate");

    const processed = await svc.runEmailWorkerOnce("test-worker", 5);
    expect(processed).toBe(1);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("processed");
    expect(storedMessage.createdIssueId).toBeTruthy();

    const [createdIssue] = await db.select().from(issues);
    expect(createdIssue.title).toBe("Need help with production deploy");
    expect(createdIssue.originKind).toBe("inbound_email");
    expect(createdIssue.originId).toBe(storedMessage.id);
  }, 20_000);

  it("rejects mailbox project targets from another company", async () => {
    const companyId = await seedCompany("Acme");
    const otherCompanyId = await seedCompany("Other");
    const [otherProject] = await db
      .insert(projects)
      .values({
        companyId: otherCompanyId,
        name: "Other project",
        status: "planned",
      })
      .returning();

    await expect(svc.createMailbox(companyId, {
      name: "Unsafe inbox",
      provider: "imap",
      enabled: false,
      host: "imap.example.com",
      port: 993,
      username: "unsafe@example.com",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      targetProjectId: otherProject.id,
      createMode: "issue",
      markSeen: true,
    })).rejects.toThrow("targetProjectId must belong to the same company");
  });
});
