import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  activityLog,
  authUsers,
  companies,
  createDb,
  emailNotifications,
  instanceSettings,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import {
  enqueueIssueCompletionEmailNotification,
  processEmailNotificationOutbox,
} from "../services/email-notifications.ts";

const sendMailMock = vi.hoisted(() => vi.fn(async () => undefined));
const createTransportMock = vi.hoisted(() => vi.fn(() => ({ sendMail: sendMailMock })));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres email notification tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

async function seedIssue(db: ReturnType<typeof createDb>, input?: {
  companySmtp?: boolean;
}) {
  const now = new Date();
  const companyId = randomUUID();
  const creatorUserId = `user-${randomUUID()}`;
  const issueId = randomUUID();
  await db.insert(companies).values({
    id: companyId,
    name: "Acme Operations",
    issuePrefix: `M${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    requireBoardApprovalForNewAgents: false,
    smtpHost: input?.companySmtp ? "smtp.example.com" : null,
    smtpPort: input?.companySmtp ? 587 : null,
    smtpFrom: input?.companySmtp ? "noreply@acme.example" : null,
  });
  await db.insert(authUsers).values({
    id: creatorUserId,
    name: "Creator User",
    email: "creator@example.com",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(issues).values({
    id: issueId,
    companyId,
    title: "Ship report",
    description: "Write the final report.",
    status: "done",
    createdByUserId: creatorUserId,
    identifier: "ACME-1",
    completedAt: now,
  });
  return { companyId, creatorUserId, issueId, now };
}

describeEmbeddedPostgres("email notification outbox", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const previousSmtpHost = process.env.SMTP_HOST;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-email-notifications-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  beforeEach(() => {
    delete process.env.SMTP_HOST;
    createTransportMock.mockClear();
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await db.delete(emailNotifications);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(authUsers);
    await db.delete(companies);
    await db.delete(instanceSettings);
  });

  afterAll(async () => {
    if (previousSmtpHost !== undefined) process.env.SMTP_HOST = previousSmtpHost;
    await tempDb?.cleanup();
  });

  it("records a queued notification instead of sending inline", async () => {
    const seeded = await seedIssue(db, { companySmtp: true });

    const notification = await enqueueIssueCompletionEmailNotification(db, {
      issue: {
        id: seeded.issueId,
        companyId: seeded.companyId,
        title: "Ship report",
        identifier: "ACME-1",
        description: "Write the final report.",
        completedAt: seeded.now,
      },
      creatorUserId: seeded.creatorUserId,
      actor: { actorType: "user", actorId: "local-board" },
      agentComment: "Done.",
      previousStatus: "in_progress",
      requestedStatus: "done",
      processAfterEnqueue: false,
    });

    expect(notification.status).toBe("pending");
    expect(sendMailMock).not.toHaveBeenCalled();
    const [row] = await db.select().from(emailNotifications).where(eq(emailNotifications.id, notification.id));
    expect(row?.recipientEmail).toBe("creator@example.com");
    expect(row?.payload?.agentComment).toBe("Done.");
    const activities = await db.select().from(activityLog).where(eq(activityLog.entityId, seeded.issueId));
    expect(activities.map((activity) => activity.action)).toContain("issue.email_notification_queued");
  });

  it("records a skipped notification when the creator recipient cannot be resolved", async () => {
    const seeded = await seedIssue(db, { companySmtp: true });

    const notification = await enqueueIssueCompletionEmailNotification(db, {
      issue: {
        id: seeded.issueId,
        companyId: seeded.companyId,
        title: "Ship report",
        identifier: "ACME-1",
        description: null,
        completedAt: seeded.now,
      },
      creatorUserId: null,
      actor: { actorType: "user", actorId: "local-board" },
      processAfterEnqueue: false,
    });

    expect(notification.status).toBe("skipped");
    expect(notification.skipReason).toBe("recipient_missing");
    const activities = await db.select().from(activityLog).where(eq(activityLog.entityId, seeded.issueId));
    expect(activities).toEqual([
      expect.objectContaining({
        action: "issue.email_notification_skipped",
        details: expect.objectContaining({ reason: "recipient_missing" }),
      }),
    ]);
  });

  it("sends pending notifications and records sent activity", async () => {
    const seeded = await seedIssue(db, { companySmtp: true });
    const notification = await enqueueIssueCompletionEmailNotification(db, {
      issue: {
        id: seeded.issueId,
        companyId: seeded.companyId,
        title: "Ship report",
        identifier: "ACME-1",
        description: "Write the final report.",
        completedAt: seeded.now,
      },
      creatorUserId: seeded.creatorUserId,
      actor: { actorType: "user", actorId: "local-board" },
      processAfterEnqueue: false,
    });

    const result = await processEmailNotificationOutbox(db, { limit: 1 });

    expect(result.sent).toBe(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const [row] = await db.select().from(emailNotifications).where(eq(emailNotifications.id, notification.id));
    expect(row?.status).toBe("sent");
    expect(row?.attempts).toBe(1);
    const activities = await db.select().from(activityLog).where(eq(activityLog.entityId, seeded.issueId));
    expect(activities.map((activity) => activity.action)).toContain("issue.email_notification_attempted");
    expect(activities.map((activity) => activity.action)).toContain("issue.email_notification_sent");
  });

  it("marks notifications skipped when SMTP is not configured", async () => {
    const seeded = await seedIssue(db, { companySmtp: false });
    const notification = await enqueueIssueCompletionEmailNotification(db, {
      issue: {
        id: seeded.issueId,
        companyId: seeded.companyId,
        title: "Ship report",
        identifier: "ACME-1",
        description: null,
        completedAt: seeded.now,
      },
      creatorUserId: seeded.creatorUserId,
      actor: { actorType: "user", actorId: "local-board" },
      processAfterEnqueue: false,
    });

    const result = await processEmailNotificationOutbox(db, { limit: 1 });

    expect(result.skipped).toBe(1);
    expect(createTransportMock).not.toHaveBeenCalled();
    const [row] = await db.select().from(emailNotifications).where(eq(emailNotifications.id, notification.id));
    expect(row?.status).toBe("skipped");
    expect(row?.skipReason).toBe("smtp_not_configured");
  });

  it("records a final failure after the last SMTP attempt", async () => {
    const seeded = await seedIssue(db, { companySmtp: true });
    const notification = await enqueueIssueCompletionEmailNotification(db, {
      issue: {
        id: seeded.issueId,
        companyId: seeded.companyId,
        title: "Ship report",
        identifier: "ACME-1",
        description: null,
        completedAt: seeded.now,
      },
      creatorUserId: seeded.creatorUserId,
      actor: { actorType: "user", actorId: "local-board" },
      processAfterEnqueue: false,
    });
    await db
      .update(emailNotifications)
      .set({ attempts: 2, maxAttempts: 3 })
      .where(eq(emailNotifications.id, notification.id));
    sendMailMock.mockRejectedValueOnce(new Error("SMTP rejected"));

    const result = await processEmailNotificationOutbox(db, { limit: 1 });

    expect(result.failed).toBe(1);
    const [row] = await db.select().from(emailNotifications).where(eq(emailNotifications.id, notification.id));
    expect(row?.status).toBe("failed");
    expect(row?.attempts).toBe(3);
    expect(row?.lastError).toContain("SMTP rejected");
    const activities = await db.select().from(activityLog).where(eq(activityLog.entityId, seeded.issueId));
    expect(activities.map((activity) => activity.action)).toContain("issue.email_notification_failed");
  });
});
