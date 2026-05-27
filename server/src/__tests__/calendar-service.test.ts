import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  authUsers,
  calendarItemDocuments,
  calendarItems,
  clients,
  companies,
  companyMemberships,
  createDb,
  emailNotifications,
  inboundEmailMailboxes,
  inboundEmailMessages,
  issues,
  paymentEntries,
  paymentProfiles,
  paymentRecords,
  projects,
} from "@paperclipai/db";
import {
  CALENDAR_EMAIL_PROPOSAL_ISSUE_ORIGIN_KIND,
  CALENDAR_EMAIL_NOTIFICATION_KIND,
  CALENDAR_MISSING_DETAILS_ISSUE_ORIGIN_KIND,
  CALENDAR_REMINDER_ISSUE_ORIGIN_KIND,
  createCalendarItemSchema,
} from "@paperclipai/shared";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { calendarService, calculateNextDueDate } from "../services/calendar.ts";
import { paymentService } from "../services/payments.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres calendar service tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("calendarService", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof calendarService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const clientId = randomUUID();
  const otherClientId = randomUUID();
  const projectId = randomUUID();
  const mailboxId = randomUUID();
  const sourceEmailMessageId = randomUUID();
  const ownerUserId = "calendar-owner-user";
  const adminUserId = "calendar-admin-user";
  const viewerUserId = "calendar-viewer-user";

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-calendar-service-");
    db = createDb(tempDb.connectionString);
    svc = calendarService(db);

    await db.insert(companies).values([
      {
        id: companyId,
        name: "Calendar Co",
        issuePrefix: "CAL",
        requireBoardApprovalForNewAgents: false,
      },
      {
        id: otherCompanyId,
        name: "Other Co",
        issuePrefix: "OTH",
        requireBoardApprovalForNewAgents: false,
      },
    ]);

    const now = new Date("2026-05-01T00:00:00.000Z");
    await db.insert(authUsers).values([
      { id: ownerUserId, name: "Calendar Owner", email: "owner-admin@example.com", createdAt: now, updatedAt: now },
      { id: adminUserId, name: "Calendar Admin", email: "admin@example.com", createdAt: now, updatedAt: now },
      { id: viewerUserId, name: "Calendar Viewer", email: "viewer@example.com", createdAt: now, updatedAt: now },
    ]);
    await db.insert(companyMemberships).values([
      { companyId, principalType: "user", principalId: ownerUserId, status: "active", membershipRole: "owner" },
      { companyId, principalType: "user", principalId: adminUserId, status: "active", membershipRole: "admin" },
      { companyId, principalType: "user", principalId: viewerUserId, status: "active", membershipRole: "viewer" },
    ]);

    await db.insert(clients).values([
      { id: clientId, companyId, name: "Calendar Client" },
      { id: otherClientId, companyId: otherCompanyId, name: "Other Client" },
    ]);

    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Calendar Project",
      status: "in_progress",
    });

    await db.insert(inboundEmailMailboxes).values({
      id: mailboxId,
      companyId,
      name: "Calendar inbox",
      host: "imap.example.com",
      username: "calendar@example.com",
    });

    await db.insert(inboundEmailMessages).values({
      id: sourceEmailMessageId,
      companyId,
      mailboxId,
      rawSha256: "calendar-source-message",
      subject: "Renewal receipt",
      toAddresses: ["calendar@example.com"],
    });
  }, 20_000);

  afterEach(async () => {
    await db.delete(calendarItemDocuments);
    await db.delete(emailNotifications);
    await db.delete(paymentRecords);
    await db.delete(paymentEntries);
    await db.delete(paymentProfiles);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(calendarItems);
  });

  afterAll(async () => {
    await db.delete(inboundEmailMessages);
    await db.delete(inboundEmailMailboxes);
    await db.delete(projects);
    await db.delete(clients);
    await db.delete(companyMemberships);
    await db.delete(companies);
    await db.delete(authUsers);
    await tempDb?.cleanup();
  });

  function item(input: Parameters<typeof createCalendarItemSchema.parse>[0]) {
    return createCalendarItemSchema.parse(input);
  }

  it("creates, lists, and fetches company-scoped calendar items", async () => {
    const created = await svc.create(companyId, item({
      title: "Domain renewal",
      category: "domain",
      riskLevel: "critical",
      providerName: "Example Registrar",
      relatedClientId: clientId,
      relatedProjectId: projectId,
      nextDueDate: "2026-06-30",
      purchaseEmail: "owner@example.com",
      serviceUrl: "https://example.com",
      metadata: { registrar: "Example Registrar", domainName: "example.com" },
    }));

    const listed = await svc.list(companyId, { category: "domain" });
    const detail = await svc.getById(companyId, created.id);

    expect(listed.total).toBe(1);
    expect(listed.items[0]!.id).toBe(created.id);
    expect(detail.companyId).toBe(companyId);
    expect(detail.documents).toEqual([]);
    expect(detail.activity.some((entry) => entry.action === "calendar_item.created")).toBe(true);
  });

  it("filters by operational ownership, payment, renewal, and due fields", async () => {
    const matching = await svc.create(companyId, item({
      title: "Filtered SaaS renewal",
      category: "software_subscription",
      riskLevel: "medium",
      providerName: "Filter Vendor",
      relatedClientId: clientId,
      relatedProjectId: projectId,
      nextDueDate: "2026-06-15",
      autoRenew: true,
      paymentMethodLabel: "Company card",
      purchaseEmail: "ops@example.com",
      billingEmail: "billing@example.com",
    }));
    await svc.create(companyId, item({
      title: "Other SaaS renewal",
      category: "software_subscription",
      riskLevel: "medium",
      providerName: "Other Vendor",
      nextDueDate: "2026-08-15",
      autoRenew: false,
      paymentMethodLabel: "Invoice",
      purchaseEmail: "owner@example.com",
      billingEmail: "ap@example.com",
    }));

    const listed = await svc.list(companyId, {
      autoRenew: true,
      paymentMethod: "company",
      purchaseEmail: "ops@",
      billingEmail: "billing@",
      relatedClientId: clientId,
      relatedProjectId: projectId,
      dueFrom: "2026-06-01",
      dueTo: "2026-06-30",
    });

    expect(listed.total).toBe(1);
    expect(listed.items[0]!.id).toBe(matching.id);
  });

  it("applies server-side smart text filters", async () => {
    const matching = await svc.create(companyId, item({
      title: "Smart filter domain",
      category: "domain",
      riskLevel: "critical",
      providerName: "Smart Registrar",
      nextDueDate: "2026-07-01",
      purchaseEmail: "owner@example.com",
    }));
    await svc.create(companyId, item({
      title: "Smart filter saas",
      category: "software_subscription",
      riskLevel: "medium",
      providerName: "Smart SaaS",
      nextDueDate: "2026-07-01",
      billingEmail: "ap@example.com",
    }));

    const listed = await svc.list(companyId, { q: "missing critical domain provider:smart" });

    expect(listed.total).toBe(1);
    expect(listed.items[0]!.id).toBe(matching.id);
  });

  it("rejects references that belong to another company", async () => {
    await expect(
      svc.create(companyId, item({
        title: "Wrong client",
        category: "software_subscription",
        relatedClientId: otherClientId,
        nextDueDate: "2026-06-01",
        billingEmail: "billing@example.com",
      })),
    ).rejects.toThrow(/does not belong to company/);
  });

  it("advances recurring items when completed", async () => {
    const created = await svc.create(companyId, item({
      title: "Monthly subscription",
      category: "software_subscription",
      recurrenceType: "monthly",
      nextDueDate: "2026-01-31",
      amountCents: 1200,
      billingEmail: "billing@example.com",
    }));

    const completed = await svc.complete(companyId, created.id, {
      completedAt: new Date("2026-01-31T12:00:00.000Z"),
      notes: "Paid",
    });

    expect(calculateNextDueDate({
      nextDueDate: "2026-01-31",
      dueDate: null,
      recurrenceType: "monthly",
      recurrenceRule: null,
    })).toBe("2026-02-28");
    expect(completed.status).toBe("active");
    expect(completed.nextDueDate).toBe("2026-02-28");
    expect(completed.notes).toContain("Paid");
  });

  it("creates and advances linked payment entries for payable calendar items", async () => {
    const [profile] = await db
      .insert(paymentProfiles)
      .values({
        companyId,
        method: "pix",
        accountLabel: "Finance PIX",
        ownerName: "Finance",
      })
      .returning();

    const created = await svc.create(companyId, item({
      title: "Monthly hosting payment",
      category: "payment_payable",
      providerName: "Hosting Co",
      recurrenceType: "monthly",
      nextDueDate: "2026-06-10",
      amountCents: 12500,
      currency: "BRL",
      paymentProfileId: profile!.id,
    }));

    const firstEntries = await db
      .select()
      .from(paymentEntries)
      .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.calendarItemId, created.id)));

    expect(firstEntries).toHaveLength(1);
    expect(firstEntries[0]).toMatchObject({
      title: "Monthly hosting payment",
      providerName: "Hosting Co",
      dueDate: "2026-06-10",
      expectedAmountCents: 12500,
      currency: "BRL",
      paymentProfileId: profile!.id,
      status: "open",
    });

    const completed = await svc.complete(
      companyId,
      created.id,
      { completedAt: new Date("2026-06-10T12:00:00.000Z"), notes: "Paid" },
      undefined,
      { approvalConfirmed: true },
    );
    const advancedEntries = await db
      .select()
      .from(paymentEntries)
      .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.calendarItemId, created.id)))
      .orderBy(paymentEntries.dueDate);

    expect(completed.nextDueDate).toBe("2026-07-10");
    expect(advancedEntries.map((entry) => entry.dueDate)).toEqual(["2026-06-10", "2026-07-10"]);
    expect(advancedEntries[1]).toMatchObject({
      expectedAmountCents: 12500,
      paymentProfileId: profile!.id,
      status: "open",
    });
  });

  it("updates an existing unpaid linked payment when a payable due date changes", async () => {
    const [profile] = await db
      .insert(paymentProfiles)
      .values({
        companyId,
        method: "pix",
        accountLabel: "Finance PIX",
      })
      .returning();

    const created = await svc.create(companyId, item({
      title: "Correctable hosting payment",
      category: "payment_payable",
      providerName: "Hosting Co",
      nextDueDate: "2026-06-10",
      amountCents: 12500,
      currency: "BRL",
      paymentProfileId: profile!.id,
    }));

    await svc.update(
      companyId,
      created.id,
      { nextDueDate: "2026-06-12" },
      undefined,
      { approvalConfirmed: true },
    );

    const entries = await db
      .select()
      .from(paymentEntries)
      .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.calendarItemId, created.id)));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      dueDate: "2026-06-12",
      status: "open",
    });
  });

  it("records partial and full payments against a payment entry", async () => {
    const payments = paymentService(db);
    const profile = await payments.createProfile(companyId, {
      method: "credit_card",
      accountLabel: "Corporate card",
      ownerName: "Finance",
      notes: null,
      active: true,
    });
    const entry = await payments.createEntry(companyId, {
      title: "Cloud invoice",
      providerName: "Cloud Co",
      dueDate: "2026-06-15",
      expectedAmountCents: 10000,
      currency: "BRL",
      paymentProfileId: profile.id,
      calendarItemId: null,
      notes: null,
    });

    const partial = await payments.recordPayment(companyId, entry.id, {
      amountCents: 4000,
      currency: "BRL",
      paymentProfileId: null,
      paidAt: "2026-06-15T10:00:00.000Z",
      proofUrl: null,
      notes: "First payment",
    });
    const full = await payments.recordPayment(companyId, entry.id, {
      amountCents: 6000,
      currency: "BRL",
      paymentProfileId: null,
      paidAt: "2026-06-16T10:00:00.000Z",
      proofUrl: null,
      notes: "Remainder",
    });

    expect(partial.completed).toBe(false);
    expect(partial.entry).toMatchObject({ paidAmountCents: 4000, status: "partially_paid" });
    expect(full.completed).toBe(true);
    expect(full.entry).toMatchObject({ paidAmountCents: 10000, status: "paid" });

    const dashboard = await payments.dashboard(companyId, new Date("2026-06-20T00:00:00.000Z"));
    expect(dashboard.paidThisMonthCents).toBe(10000);
  });

  it("allows metadata-only paid entry edits but rejects explicit reopen attempts", async () => {
    const payments = paymentService(db);
    const entry = await payments.createEntry(companyId, {
      title: "Paid invoice",
      providerName: "Cloud Co",
      dueDate: "2026-06-15",
      expectedAmountCents: 10000,
      currency: "BRL",
      paymentProfileId: null,
      calendarItemId: null,
      notes: null,
    });

    await payments.recordPayment(companyId, entry.id, {
      amountCents: 10000,
      currency: "BRL",
      paymentProfileId: null,
      paidAt: "2026-06-15T10:00:00.000Z",
      proofUrl: null,
      notes: "Paid in full",
    });

    const updated = await payments.updateEntry(companyId, entry.id, {
      notes: "Receipt reconciled",
    });

    expect(updated).toMatchObject({
      status: "paid",
      notes: "Receipt reconciled",
    });
    await expect(payments.updateEntry(companyId, entry.id, { status: "open" }))
      .rejects.toThrow(/cannot be reopened/);
  });

  it("rejects governed mutations unless approval is explicitly confirmed", async () => {
    const created = await svc.create(companyId, item({
      title: "Critical certificate",
      category: "certificate",
      riskLevel: "critical",
      nextDueDate: "2026-06-30",
      dueDate: "2026-06-30",
      billingEmail: "billing@example.com",
      paymentMethodLabel: "Company card",
    }));

    await expect(
      svc.update(companyId, created.id, { nextDueDate: "2026-07-30" }),
    ).rejects.toThrow(/requires approval/);
    await expect(
      svc.update(companyId, created.id, { nextDueDate: null }),
    ).rejects.toThrow(/requires approval/);
    await expect(
      svc.update(companyId, created.id, { dueDate: null }),
    ).rejects.toThrow(/requires approval/);
    await expect(
      svc.update(companyId, created.id, { billingEmail: null }),
    ).rejects.toThrow(/requires approval/);
    await expect(
      svc.update(companyId, created.id, { paymentMethodLabel: null }),
    ).rejects.toThrow(/requires approval/);
    await expect(
      svc.complete(companyId, created.id, { completedAt: new Date("2026-06-30T12:00:00.000Z") }),
    ).rejects.toThrow(/requires approval/);

    const updated = await svc.update(
      companyId,
      created.id,
      { nextDueDate: "2026-07-30" },
      undefined,
      { approvalConfirmed: true },
    );
    expect(updated.nextDueDate).toBe("2026-07-30");
  });

  it("creates deterministic reminder issues and queues reminder emails", async () => {
    const created = await svc.create(companyId, item({
      title: "Critical domain renewal",
      category: "domain",
      riskLevel: "critical",
      providerName: "Registrar",
      nextDueDate: "2026-06-30",
      purchaseEmail: "owner@example.com",
      serviceUrl: "https://example.com",
      metadata: { registrar: "Registrar", domainName: "example.com" },
    }));

    const first = await svc.runReminderScan(companyId, {
      now: new Date("2026-05-31T00:00:00.000Z"),
      createIssues: true,
      sendEmail: true,
      recipientEmail: "ops@example.com",
    });
    const second = await svc.runReminderScan(companyId, {
      now: new Date("2026-05-31T00:00:00.000Z"),
      createIssues: true,
      sendEmail: true,
      recipientEmail: "ops@example.com",
    });

    const reminderIssues = await db
      .select()
      .from(issues)
      .where(and(
        eq(issues.companyId, companyId),
        eq(issues.originKind, CALENDAR_REMINDER_ISSUE_ORIGIN_KIND),
        eq(issues.originId, created.id),
      ));
    const queuedEmails = await db
      .select()
      .from(emailNotifications)
      .where(and(
        eq(emailNotifications.companyId, companyId),
        eq(emailNotifications.kind, CALENDAR_EMAIL_NOTIFICATION_KIND),
      ));

    expect(first.createdIssues).toBe(1);
    expect(first.queuedEmails).toBe(1);
    expect(second.createdIssues).toBe(0);
    expect(second.updatedIssues).toBe(1);
    expect(second.queuedEmails).toBe(0);
    expect(reminderIssues).toHaveLength(1);
    expect(queuedEmails).toHaveLength(1);
  });

  it("updates the same overdue issue across daily scans", async () => {
    const created = await svc.create(companyId, item({
      title: "Overdue certificate",
      category: "certificate",
      riskLevel: "critical",
      nextDueDate: "2026-05-30",
      billingEmail: "billing@example.com",
    }));

    const first = await svc.runReminderScan(companyId, {
      now: new Date("2026-05-31T00:00:00.000Z"),
      createIssues: true,
      sendEmail: false,
    });
    const second = await svc.runReminderScan(companyId, {
      now: new Date("2026-06-01T00:00:00.000Z"),
      createIssues: true,
      sendEmail: false,
    });

    const overdueIssues = await db
      .select()
      .from(issues)
      .where(and(
        eq(issues.companyId, companyId),
        eq(issues.originKind, CALENDAR_REMINDER_ISSUE_ORIGIN_KIND),
        eq(issues.originId, created.id),
      ));

    expect(first.createdIssues).toBe(1);
    expect(second.createdIssues).toBe(0);
    expect(second.updatedIssues).toBe(1);
    expect(overdueIssues).toHaveLength(1);
    expect(overdueIssues[0]!.originFingerprint).toBe("2026-05-30:overdue:issue");
  });

  it("dedupes overdue reminder emails across daily scans", async () => {
    await svc.create(companyId, item({
      title: "Overdue email renewal",
      category: "certificate",
      riskLevel: "critical",
      nextDueDate: "2026-05-30",
      billingEmail: "billing@example.com",
    }));

    const first = await svc.runReminderScan(companyId, {
      now: new Date("2026-05-31T00:00:00.000Z"),
      createIssues: true,
      sendEmail: true,
      recipientEmail: "ops@example.com",
    });
    const second = await svc.runReminderScan(companyId, {
      now: new Date("2026-06-01T00:00:00.000Z"),
      createIssues: true,
      sendEmail: true,
      recipientEmail: "ops@example.com",
    });
    const queuedEmails = await db
      .select()
      .from(emailNotifications)
      .where(and(
        eq(emailNotifications.companyId, companyId),
        eq(emailNotifications.kind, CALENDAR_EMAIL_NOTIFICATION_KIND),
      ));

    expect(first.queuedEmails).toBe(1);
    expect(second.queuedEmails).toBe(0);
    expect(queuedEmails).toHaveLength(1);
  });

  it("dedupes reminder emails by calendar identity even without linked issues", async () => {
    await svc.create(companyId, item({
      title: "Shared SaaS renewal",
      category: "software_subscription",
      riskLevel: "medium",
      nextDueDate: "2026-06-07",
      billingEmail: "billing@example.com",
    }));
    await svc.create(companyId, item({
      title: "Shared SaaS renewal",
      category: "software_subscription",
      riskLevel: "medium",
      nextDueDate: "2026-06-07",
      billingEmail: "billing@example.com",
    }));

    const first = await svc.runReminderScan(companyId, {
      now: new Date("2026-06-04T00:00:00.000Z"),
      createIssues: false,
      sendEmail: true,
      recipientEmail: "ops@example.com",
    });
    const second = await svc.runReminderScan(companyId, {
      now: new Date("2026-06-04T00:00:00.000Z"),
      createIssues: false,
      sendEmail: true,
      recipientEmail: "ops@example.com",
    });
    const queuedEmails = await db
      .select()
      .from(emailNotifications)
      .where(and(
        eq(emailNotifications.companyId, companyId),
        eq(emailNotifications.kind, CALENDAR_EMAIL_NOTIFICATION_KIND),
      ));

    expect(first.queuedEmails).toBe(2);
    expect(second.queuedEmails).toBe(0);
    expect(queuedEmails).toHaveLength(2);
  });

  it("dedupes reminder emails when a later scan links an issue", async () => {
    const created = await svc.create(companyId, item({
      title: "Email before issue renewal",
      category: "domain",
      riskLevel: "critical",
      nextDueDate: "2026-06-30",
      purchaseEmail: "owner@example.com",
      serviceUrl: "https://example.com",
      metadata: { registrar: "Registrar", domainName: "example.com" },
    }));

    const emailOnly = await svc.runReminderScan(companyId, {
      now: new Date("2026-05-31T00:00:00.000Z"),
      createIssues: false,
      sendEmail: true,
      recipientEmail: "ops@example.com",
    });
    const withIssue = await svc.runReminderScan(companyId, {
      now: new Date("2026-05-31T01:00:00.000Z"),
      createIssues: true,
      sendEmail: true,
      recipientEmail: "ops@example.com",
    });

    const queuedEmails = await db
      .select()
      .from(emailNotifications)
      .where(and(
        eq(emailNotifications.companyId, companyId),
        eq(emailNotifications.kind, CALENDAR_EMAIL_NOTIFICATION_KIND),
        eq(emailNotifications.recipientEmail, "ops@example.com"),
      ));
    const reminderIssues = await db
      .select()
      .from(issues)
      .where(and(
        eq(issues.companyId, companyId),
        eq(issues.originKind, CALENDAR_REMINDER_ISSUE_ORIGIN_KIND),
        eq(issues.originId, created.id),
      ));

    expect(emailOnly.queuedEmails).toBe(1);
    expect(withIssue.createdIssues).toBe(1);
    expect(withIssue.queuedEmails).toBe(0);
    expect(queuedEmails).toHaveLength(1);
    expect(queuedEmails[0]!.issueId).toBe(reminderIssues[0]!.id);
  });

  it("reports missing details through a weekly issue", async () => {
    await svc.create(companyId, item({
      title: "Incomplete domain",
      category: "domain",
      riskLevel: "high",
      nextDueDate: "2026-07-01",
    }));

    const first = await svc.runDetailsScan(companyId, { now: new Date("2026-05-23T00:00:00.000Z") });
    const second = await svc.runDetailsScan(companyId, { now: new Date("2026-05-23T01:00:00.000Z") });

    const reportIssues = await db
      .select()
      .from(issues)
      .where(and(
        eq(issues.companyId, companyId),
        eq(issues.originKind, CALENDAR_MISSING_DETAILS_ISSUE_ORIGIN_KIND),
      ));

    expect(first.findingCount).toBe(1);
    expect(first.createdIssueId).toBeTruthy();
    expect(second.updatedIssueId).toBe(first.createdIssueId);
    expect(reportIssues).toHaveLength(1);
  });

  it("excludes inactive items from dashboard missing details and cost summaries", async () => {
    await svc.create(companyId, item({
      title: "Active monthly cost",
      category: "software_subscription",
      riskLevel: "medium",
      recurrenceType: "monthly",
      amountCents: 5000,
      nextDueDate: "2026-06-15",
      billingEmail: "billing@example.com",
    }));
    const doneItem = await svc.create(companyId, item({
      title: "Completed one-off without next date",
      category: "software_subscription",
      riskLevel: "medium",
      nextDueDate: "2026-06-10",
    }));
    await svc.setStatus(companyId, doneItem.id, "active");
    await db
      .update(calendarItems)
      .set({ status: "done", nextDueDate: null, updatedAt: new Date("2026-05-23T00:00:00.000Z") })
      .where(eq(calendarItems.id, doneItem.id));
    await svc.createEmailProposal(companyId, {
      ...item({
        title: "Pending proposal cost",
        category: "software_subscription",
        riskLevel: "medium",
        recurrenceType: "monthly",
        amountCents: 9000,
        nextDueDate: "2026-06-20",
        billingEmail: "billing@example.com",
        sourceKind: "email_agent",
        sourceEmailMessageId,
        confidenceScore: 85,
      }),
      sourceEmailMessageId,
      confidenceScore: 85,
      matchingKey: "pending-cost:2026-06-20",
    });

    const dashboard = await svc.dashboard(companyId, new Date("2026-05-23T00:00:00.000Z"));

    expect(dashboard.costSummary.monthlyRecurringCents).toBe(5000);
    expect(dashboard.missingDetails.find((finding) => finding.itemId === doneItem.id)).toBeUndefined();
    expect(dashboard.pendingReview.count).toBe(1);
  });

  it("includes missing details and reminder email status on the dashboard", async () => {
    await svc.create(companyId, item({
      title: "Dashboard SaaS renewal",
      category: "software_subscription",
      riskLevel: "medium",
      nextDueDate: "2026-06-07",
      amountCents: 5000,
    }));
    await svc.runReminderScan(companyId, {
      now: new Date("2026-06-04T00:00:00.000Z"),
      createIssues: false,
      sendEmail: true,
      recipientEmail: "ops@example.com",
    });
    await db
      .update(emailNotifications)
      .set({
        status: "failed",
        failedAt: new Date("2026-06-04T01:00:00.000Z"),
        lastError: "SMTP rejected message",
      })
      .where(and(
        eq(emailNotifications.companyId, companyId),
        eq(emailNotifications.kind, CALENDAR_EMAIL_NOTIFICATION_KIND),
      ));

    const dashboard = await svc.dashboard(companyId, new Date("2026-06-04T02:00:00.000Z"));

    expect(dashboard.missingDetails).toHaveLength(1);
    expect(dashboard.reminderStatus).toMatchObject({
      scannedItems: 1,
      queuedEmails: 1,
      failedEmails: 1,
      pendingEmails: 0,
      latestEmailFailureError: "SMTP rejected message",
    });
    expect(dashboard.reminderStatus.failedEmailDetails[0]).toMatchObject({
      title: "Dashboard SaaS renewal",
      recipientEmail: "ops@example.com",
      dueDate: "2026-06-07",
      lastError: "SMTP rejected message",
    });
    expect(dashboard.reminderStatus.lastScanAt).toBe("2026-06-04T00:00:00.000Z");
    expect(dashboard.reminderStatus.latestEmailFailureAt).toBe("2026-06-04T01:00:00.000Z");
  });

  it("runs scheduled scans once per company day and details week", async () => {
    await svc.create(companyId, item({
      title: "Scheduled domain scan",
      category: "domain",
      riskLevel: "critical",
      nextDueDate: "2026-06-30",
      purchaseEmail: "owner@example.com",
      serviceUrl: "https://example.com",
      metadata: { registrar: "Registrar", domainName: "example.com" },
    }));

    const first = await svc.runScheduledScans(new Date("2026-05-31T08:00:00.000Z"));
    const second = await svc.runScheduledScans(new Date("2026-05-31T09:00:00.000Z"));

    expect(first.companiesScanned).toBe(1);
    expect(first.reminderScans).toBe(1);
    expect(first.detailsScans).toBe(1);
    expect(first.reminderIssuesCreated).toBe(1);
    expect(first.reminderEmailsQueued).toBe(2);
    expect(second.reminderScans).toBe(0);
    expect(second.detailsScans).toBe(0);

    const queuedEmails = await db
      .select()
      .from(emailNotifications)
      .where(and(
        eq(emailNotifications.companyId, companyId),
        eq(emailNotifications.kind, CALENDAR_EMAIL_NOTIFICATION_KIND),
      ));
    expect(queuedEmails.map((email) => email.recipientEmail).sort()).toEqual([
      "admin@example.com",
      "owner-admin@example.com",
    ]);
  });

  it("skips scheduled reminder emails when no owner or admin recipient is active", async () => {
    await db
      .update(companyMemberships)
      .set({ status: "inactive" })
      .where(eq(companyMemberships.companyId, companyId));
    try {
      await svc.create(companyId, item({
        title: "No recipient domain scan",
        category: "domain",
        riskLevel: "critical",
        nextDueDate: "2026-06-30",
        purchaseEmail: "owner@example.com",
        serviceUrl: "https://example.com",
        metadata: { registrar: "Registrar", domainName: "example.com" },
      }));

      const result = await svc.runScheduledScans(new Date("2026-05-31T08:00:00.000Z"));

      expect(result.reminderScans).toBe(1);
      expect(result.reminderEmailsQueued).toBe(0);
      expect(result.reminderEmailsSkipped).toBe(1);
    } finally {
      await db
        .update(companyMemberships)
        .set({ status: "active" })
        .where(eq(companyMemberships.companyId, companyId));
    }
  });

  it("creates email proposals as pending-review items with review issues", async () => {
    const proposal = await svc.createEmailProposal(companyId, {
      ...item({
        title: "Receipt renewal",
        category: "software_subscription",
        providerName: "Receipt Vendor",
        nextDueDate: "2026-08-01",
        billingEmail: "billing@example.com",
        sourceKind: "email_agent",
        sourceEmailMessageId,
        confidenceScore: 72,
      }),
      sourceEmailMessageId,
      confidenceScore: 72,
      matchingKey: "receipt-vendor:2026-08-01",
    });

    const reviewIssues = await db
      .select()
      .from(issues)
      .where(and(
        eq(issues.companyId, companyId),
        eq(issues.originKind, CALENDAR_EMAIL_PROPOSAL_ISSUE_ORIGIN_KIND),
        eq(issues.originId, sourceEmailMessageId),
      ));

    expect(proposal.status).toBe("pending_review");
    expect(proposal.sourceKind).toBe("email_agent");
    expect(reviewIssues).toHaveLength(1);
    expect(reviewIssues[0]!.priority).toBe("high");
  });

  it("dedupes repeated email proposals by source message and matching key", async () => {
    const payload = {
      ...item({
        title: "Duplicate proposal renewal",
        category: "software_subscription",
        providerName: "Duplicate Vendor",
        nextDueDate: "2026-08-01",
        billingEmail: "billing@example.com",
        sourceKind: "email_agent",
        sourceEmailMessageId,
        confidenceScore: 85,
      }),
      sourceEmailMessageId,
      confidenceScore: 85,
      matchingKey: "duplicate-vendor:2026-08-01",
    };

    const first = await svc.createEmailProposal(companyId, payload);
    const second = await svc.createEmailProposal(companyId, payload);
    const proposals = await db
      .select()
      .from(calendarItems)
      .where(and(
        eq(calendarItems.companyId, companyId),
        eq(calendarItems.sourceKind, "email_agent"),
        eq(calendarItems.sourceEmailMessageId, sourceEmailMessageId),
      ));
    const reviewIssues = await db
      .select()
      .from(issues)
      .where(and(
        eq(issues.companyId, companyId),
        eq(issues.originKind, CALENDAR_EMAIL_PROPOSAL_ISSUE_ORIGIN_KIND),
        eq(issues.originId, sourceEmailMessageId),
      ));

    expect(second.id).toBe(first.id);
    expect(proposals).toHaveLength(1);
    expect(reviewIssues).toHaveLength(1);
  });

  it("dedupes repeated email proposals after activation", async () => {
    const payload = {
      ...item({
        title: "Activated proposal renewal",
        category: "software_subscription",
        providerName: "Activated Vendor",
        nextDueDate: "2026-08-01",
        billingEmail: "billing@example.com",
        sourceKind: "email_agent",
        sourceEmailMessageId,
        confidenceScore: 85,
      }),
      sourceEmailMessageId,
      confidenceScore: 85,
      matchingKey: "activated-vendor:2026-08-01",
    };

    const first = await svc.createEmailProposal(companyId, payload);
    await svc.setStatus(companyId, first.id, "active");
    const second = await svc.createEmailProposal(companyId, payload);
    const proposals = await db
      .select()
      .from(calendarItems)
      .where(and(
        eq(calendarItems.companyId, companyId),
        eq(calendarItems.sourceKind, "email_agent"),
        eq(calendarItems.sourceEmailMessageId, sourceEmailMessageId),
      ));

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("active");
    expect(proposals).toHaveLength(1);
  });
});
