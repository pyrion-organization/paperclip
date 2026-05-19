import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backgroundJobs,
  activityLog,
  clientEmailDomains,
  clientEmployeeProjectLinks,
  clientEmployees,
  clientProjects,
  clients,
  companies,
  companySecrets,
  companySecretVersions,
  createDb,
  inboundEmailAttachments,
  inboundEmailMailboxes,
  inboundEmailMessages,
  inboundEmailRules,
  issues,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { inboundEmailService } from "../services/inbound-email.ts";
import { inboundEmailRoutes } from "../routes/inbound-email.ts";

const sendMailMock = vi.hoisted(() => vi.fn(async () => undefined));
const createTransportMock = vi.hoisted(() => vi.fn(() => ({ sendMail: sendMailMock })));
const fetchUnreadMessagesMock = vi.hoisted(() =>
  vi.fn(async () => ({ messages: [], close: vi.fn(async () => undefined) })),
);
const testImapConnectionMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));
vi.mock("../services/inbound-email-imap.js", () => ({
  fetchUnreadMessages: fetchUnreadMessagesMock,
  testImapConnection: testImapConnectionMock,
}));

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres inbound email tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

function rawEmail(input?: { subject?: string; messageId?: string; from?: string }) {
  return [
    `Message-ID: ${input?.messageId ?? `<${randomUUID()}@example.com>`}`,
    `From: Customer <${input?.from ?? "customer@example.com"}>`,
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

  beforeEach(() => {
    createTransportMock.mockClear();
    sendMailMock.mockClear();
    fetchUnreadMessagesMock.mockClear();
    testImapConnectionMock.mockClear();
  });

  afterEach(async () => {
    await db.delete(backgroundJobs);
    await db.delete(activityLog);
    await db.delete(inboundEmailAttachments);
    await db.delete(inboundEmailMessages);
    await db.delete(inboundEmailRules);
    await db.delete(inboundEmailMailboxes);
    await db.delete(issues);
    await db.delete(clientEmployeeProjectLinks);
    await db.delete(clientEmployees);
    await db.delete(clientEmailDomains);
    await db.delete(clientProjects);
    await db.delete(clients);
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

  async function seedClientIdentity(input: {
    companyId: string;
    clientName?: string;
    domain?: string;
    employeeEmail?: string;
    skipEmployee?: boolean;
    projectScope?: "all_linked_projects" | "selected_projects";
    clientProjectIds?: string[];
  }) {
    const [client] = await db
      .insert(clients)
      .values({
        companyId: input.companyId,
        name: input.clientName ?? "Acme Client",
        status: "active",
      })
      .returning();
    await db.insert(clientEmailDomains).values({
      companyId: input.companyId,
      clientId: client.id,
      domain: input.domain ?? "example.com",
    });
    let employee: typeof clientEmployees.$inferSelect | null = null;
    if (!input.skipEmployee) {
      [employee] = await db
        .insert(clientEmployees)
        .values({
          companyId: input.companyId,
          clientId: client.id,
          name: "Customer User",
          role: "User",
          email: input.employeeEmail ?? "customer@example.com",
          projectScope: input.projectScope ?? "all_linked_projects",
        })
        .returning();
      if (employee && input.projectScope === "selected_projects" && input.clientProjectIds?.length) {
        await db.insert(clientEmployeeProjectLinks).values(
          input.clientProjectIds.map((clientProjectId) => ({
            companyId: input.companyId,
            clientId: client.id,
            employeeId: employee!.id,
            clientProjectId,
          })),
        );
      }
    }
    return { client, employee };
  }

  async function seedProject(companyId: string, name = "Production") {
    const [project] = await db
      .insert(projects)
      .values({
        companyId,
        name,
        status: "active",
      })
      .returning();
    return project;
  }

  async function linkClientProject(input: { companyId: string; clientId: string; projectId: string }) {
    const [clientProject] = await db
      .insert(clientProjects)
      .values({
        companyId: input.companyId,
        clientId: input.clientId,
        projectId: input.projectId,
        status: "active",
      })
      .returning();
    return clientProject;
  }

  async function createMailbox(companyId: string, targetProjectId: string | null = null) {
    return svc.createMailbox(companyId, {
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
      targetProjectId,
      createMode: "issue",
      markSeen: true,
    });
  }

  async function createNamedMailbox(companyId: string, name: string) {
    return svc.createMailbox(companyId, {
      name,
      provider: "imap",
      enabled: false,
      host: "imap.example.com",
      port: 993,
      username: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@example.com`,
      password: "mailbox-secret",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      targetProjectId: null,
      createMode: "issue",
      markSeen: true,
    });
  }

  it("imports a raw inbound email, deduplicates it, and creates an issue through the queue", async () => {
    const companyId = await seedCompany();
    await seedClientIdentity({ companyId });
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

  it("skips unknown sender domains without sending a reply", async () => {
    const companyId = await seedCompany();
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<unknown-domain@example.com>", from: "user@unknown.example" }),
      providerUid: "unknown-domain",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("unknown_sender_domain");
    expect(await db.select().from(issues)).toEqual([]);
    expect(sendMailMock).not.toHaveBeenCalled();
  }, 20_000);

  it("does not authorize a sender through an inactive client", async () => {
    const companyId = await seedCompany();
    const { client } = await seedClientIdentity({ companyId });
    await db.update(clients).set({ status: "inactive" }).where(eq(clients.id, client.id));
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<inactive-client@example.com>" }),
      providerUid: "inactive-client",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("unknown_sender_domain");
    expect(await db.select().from(issues)).toEqual([]);
    expect(sendMailMock).not.toHaveBeenCalled();
  }, 20_000);

  it("replies in Portuguese when the domain is accepted but the employee is not registered", async () => {
    const companyId = await seedCompany();
    await db
      .update(companies)
      .set({ smtpHost: "smtp.example.com", smtpPort: 587, smtpFrom: "noreply@acme.example" })
      .where(eq(companies.id, companyId));
    await seedClientIdentity({ companyId, clientName: "Cliente Alfa", skipEmployee: true });
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<unregistered@example.com>", from: "new.user@example.com" }),
      providerUid: "unregistered",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("employee_not_registered");
    expect(await db.select().from(issues)).toEqual([]);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const email = sendMailMock.mock.calls[0]?.[0] as { to?: string; text?: string; html?: string } | undefined;
    expect(email?.to).toBe("new.user@example.com");
    expect(email?.text).toContain("não está autorizado a enviar solicitações por este canal");
    expect(email?.text).toContain("Peça para um usuário já cadastrado enviar uma solicitação pedindo o seu cadastro.");
    expect(email?.text).not.toContain("Cliente Alfa");
    expect(email?.html).toContain("Solicitação não processada");
  }, 20_000);

  it("creates an issue when a registered employee is allowed for the target project", async () => {
    const companyId = await seedCompany();
    const { client } = await seedClientIdentity({ companyId });
    const project = await seedProject(companyId);
    await linkClientProject({ companyId, clientId: client.id, projectId: project.id });
    const mailbox = await createMailbox(companyId, project.id);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<allowed-project@example.com>" }),
      providerUid: "allowed-project",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    const [createdIssue] = await db.select().from(issues);
    expect(storedMessage.status).toBe("processed");
    expect(createdIssue.projectId).toBe(project.id);
    expect(sendMailMock).not.toHaveBeenCalled();
  }, 20_000);

  it("replies when a registered employee targets a project not linked to the client", async () => {
    const companyId = await seedCompany();
    await db
      .update(companies)
      .set({ smtpHost: "smtp.example.com", smtpPort: 587, smtpFrom: "noreply@acme.example" })
      .where(eq(companies.id, companyId));
    await seedClientIdentity({ companyId });
    const project = await seedProject(companyId, "Private Project");
    const mailbox = await createMailbox(companyId, project.id);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<unlinked-project@example.com>" }),
      providerUid: "unlinked-project",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("project_not_authorized");
    expect(await db.select().from(issues)).toEqual([]);
    const email = sendMailMock.mock.calls[0]?.[0] as { text?: string } | undefined;
    expect(email?.text).toContain("não está autorizado a abrir solicitações para este projeto");
    expect(email?.text).not.toContain("Private Project");
  }, 20_000);

  it("replies when a selected-project employee targets a project outside their selected links", async () => {
    const companyId = await seedCompany();
    await db
      .update(companies)
      .set({ smtpHost: "smtp.example.com", smtpPort: 587, smtpFrom: "noreply@acme.example" })
      .where(eq(companies.id, companyId));
    const { client } = await seedClientIdentity({
      companyId,
      skipEmployee: true,
    });
    const allowedProject = await seedProject(companyId, "Allowed Project");
    const deniedProject = await seedProject(companyId, "Denied Project");
    const allowedClientProject = await linkClientProject({
      companyId,
      clientId: client.id,
      projectId: allowedProject.id,
    });
    await linkClientProject({ companyId, clientId: client.id, projectId: deniedProject.id });
    const [employee] = await db
      .insert(clientEmployees)
      .values({
        companyId,
        clientId: client.id,
        name: "Selected User",
        role: "User",
        email: "customer@example.com",
        projectScope: "selected_projects",
      })
      .returning();
    await db.insert(clientEmployeeProjectLinks).values({
      companyId,
      clientId: client.id,
      employeeId: employee.id,
      clientProjectId: allowedClientProject.id,
    });
    const mailbox = await createMailbox(companyId, deniedProject.id);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<selected-denied@example.com>" }),
      providerUid: "selected-denied",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("project_not_authorized");
    expect(await db.select().from(issues)).toEqual([]);
    const email = sendMailMock.mock.calls[0]?.[0] as { text?: string } | undefined;
    expect(email?.text).toContain("não está autorizado a abrir solicitações para este projeto");
    expect(email?.text).not.toContain("Denied Project");
  }, 20_000);

  it("still skips the message when an authorization reply is required but SMTP is not configured", async () => {
    const companyId = await seedCompany();
    await seedClientIdentity({ companyId, skipEmployee: true });
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<reply-required-no-smtp@example.com>", from: "new.user@example.com" }),
      providerUid: "reply-required-no-smtp",
      processAfterImport: false,
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("employee_not_registered");
    expect(sendMailMock).not.toHaveBeenCalled();
  }, 20_000);

  it("still skips the message when the authorization reply send throws", async () => {
    const companyId = await seedCompany();
    await db
      .update(companies)
      .set({ smtpHost: "smtp.example.com", smtpPort: 587, smtpFrom: "noreply@acme.example" })
      .where(eq(companies.id, companyId));
    await seedClientIdentity({ companyId, skipEmployee: true });
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<reply-send-fail@example.com>", from: "new.user@example.com" }),
      providerUid: "reply-send-fail",
      processAfterImport: false,
    });
    sendMailMock.mockImplementationOnce(async () => {
      throw new Error("SMTP exploded");
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("employee_not_registered");
  }, 20_000);

  it("collapses concurrent manual poll triggers into a single active job", async () => {
    const companyId = await seedCompany();
    const mailbox = await svc.createMailbox(companyId, {
      name: "Dedupe inbox",
      provider: "imap",
      enabled: false,
      host: "imap.example.com",
      port: 993,
      username: "dedupe@example.com",
      password: "secret-xyz",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      targetProjectId: null,
      createMode: "issue",
      markSeen: true,
    });

    const results = await Promise.all([
      svc.enqueueMailboxPoll(companyId, mailbox.id),
      svc.enqueueMailboxPoll(companyId, mailbox.id),
      svc.enqueueMailboxPoll(companyId, mailbox.id),
    ]);
    const jobIds = new Set(results.map((j) => j.id));
    expect(jobIds.size).toBe(1);
    const rows = await db.select().from(backgroundJobs);
    const active = rows.filter((r) =>
      r.status === "pending" || r.status === "running" || r.status === "retrying",
    );
    expect(active.length).toBe(1);
  }, 20_000);

  it("rolls back the mailbox secret if mailbox insert fails", async () => {
    const companyId = await seedCompany();
    // Create a mailbox using the unique (company_id, name) name first.
    await svc.createMailbox(companyId, {
      name: "Duplicate name",
      provider: "imap",
      enabled: false,
      host: "imap.example.com",
      port: 993,
      username: "first@example.com",
      password: "first-secret",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      targetProjectId: null,
      createMode: "issue",
      markSeen: true,
    });
    const secretCountBefore = (
      await db.select().from(companySecrets)
    ).length;

    await expect(svc.createMailbox(companyId, {
      name: "Duplicate name",
      provider: "imap",
      enabled: false,
      host: "imap.example.com",
      port: 993,
      username: "second@example.com",
      password: "second-secret",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      targetProjectId: null,
      createMode: "issue",
      markSeen: true,
    })).rejects.toThrow();

    const secretCountAfter = (
      await db.select().from(companySecrets)
    ).length;
    expect(secretCountAfter).toBe(secretCountBefore);
  }, 20_000);

  it("re-enqueues the process job when a retry sees a persisted orphan", async () => {
    const companyId = await seedCompany();
    const mailbox = await svc.createMailbox(companyId, {
      name: "Retry inbox",
      provider: "imap",
      enabled: false,
      host: "imap.example.com",
      port: 993,
      username: "retry@example.com",
      password: "secret",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      targetProjectId: null,
      createMode: "issue",
      markSeen: true,
    });

    const raw = rawEmail({ messageId: "<orphan@example.com>" });
    await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: raw,
      providerUid: "200",
    });
    // Simulate the worker losing the process job after persistence (e.g. crash
    // before enqueueProcessMessage). Drop all queued jobs so the duplicate
    // branch is what reschedules processing.
    await db.delete(backgroundJobs);

    const retry = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: raw,
      providerUid: "200",
    });
    expect(retry.status).toBe("duplicate");

    const queued = await db.select().from(backgroundJobs);
    expect(queued.some((j) => j.kind === "email.process_message")).toBe(true);
  }, 20_000);

  it("does not mutate the stored secret when a mailbox update fails", async () => {
    const companyId = await seedCompany();
    const first = await svc.createMailbox(companyId, {
      name: "First inbox",
      provider: "imap",
      enabled: false,
      host: "imap.example.com",
      port: 993,
      username: "first@example.com",
      password: "first-secret",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      targetProjectId: null,
      createMode: "issue",
      markSeen: true,
    });
    await svc.createMailbox(companyId, {
      name: "Second inbox",
      provider: "imap",
      enabled: false,
      host: "imap.example.com",
      port: 993,
      username: "second@example.com",
      password: "second-secret",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      targetProjectId: null,
      createMode: "issue",
      markSeen: true,
    });

    const secretsBefore = await db.select().from(companySecretVersions);
    // Try to rename "First inbox" to "Second inbox" with a fresh password —
    // the unique (company_id, name) index rejects the row update; the secret
    // value must remain untouched.
    await expect(
      svc.updateMailbox(companyId, first.id, {
        name: "Second inbox",
        password: "rotated-secret",
      }),
    ).rejects.toThrow();
    const secretsAfter = await db.select().from(companySecretVersions);
    expect(secretsAfter.map((v) => v.id).sort()).toEqual(
      secretsBefore.map((v) => v.id).sort(),
    );
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

  it("builds a company-scoped inbound email ops dashboard from mailboxes, messages, and jobs", async () => {
    const companyId = await seedCompany();
    const otherCompanyId = await seedCompany("Other Company");
    const mailbox = await createMailbox(companyId);
    const otherMailbox = await createMailbox(otherCompanyId);
    const now = new Date("2026-05-19T12:00:00.000Z");

    await db
      .update(inboundEmailMailboxes)
      .set({
        enabled: true,
        lastPollAt: new Date(),
        lastSuccessAt: new Date(),
      })
      .where(eq(inboundEmailMailboxes.id, mailbox.id));

    const [failedMessage] = await db
      .insert(inboundEmailMessages)
      .values({
        companyId,
        mailboxId: mailbox.id,
        rawSha256: randomUUID().replace(/-/g, ""),
        status: "failed",
        subject: "Cannot deploy",
        fromAddress: "customer@example.com",
        error: "Project authorization reply could not be sent",
      })
      .returning();
    await db.insert(inboundEmailMessages).values({
      companyId: otherCompanyId,
      mailboxId: otherMailbox.id,
      rawSha256: randomUUID().replace(/-/g, ""),
      status: "failed",
      subject: "Other company failure",
      error: "Must not leak",
    });
    await db.insert(backgroundJobs).values({
      companyId,
      kind: "email.process_message",
      status: "dead",
      payload: { messageId: failedMessage.id },
      attempts: 3,
      maxAttempts: 3,
      lastError: "Processing failed permanently",
    });
    await db.insert(backgroundJobs).values({
      companyId,
      kind: "email.poll_mailbox",
      status: "pending",
      payload: { mailboxId: mailbox.id },
      attempts: 0,
      maxAttempts: 3,
    });
    await db.insert(backgroundJobs).values({
      companyId: otherCompanyId,
      kind: "email.poll_mailbox",
      status: "dead",
      payload: { mailboxId: otherMailbox.id },
      attempts: 3,
      maxAttempts: 3,
      lastError: "Other failure",
    });

    const dashboard = await svc.getOpsDashboard(companyId, now);

    expect(dashboard.summary.mailboxCount).toBe(1);
    expect(dashboard.summary.enabledMailboxCount).toBe(1);
    expect(dashboard.summary.healthyMailboxCount).toBe(1);
    expect(dashboard.summary.failedMessageCount).toBe(1);
    expect(dashboard.summary.failedJobCount).toBe(1);
    expect(dashboard.sourceDelete.supported).toBe(false);
    expect(dashboard.mailboxes[0]?.mailbox.id).toBe(mailbox.id);
    expect(dashboard.mailboxes[0]?.messageCounts.failed).toBe(1);
    expect(dashboard.mailboxes[0]?.jobCounts.pending).toBe(1);
    expect(dashboard.mailboxes[0]?.jobCounts.dead).toBe(1);
    expect(dashboard.mailboxes[0]?.lastFailedMessage?.error).toBe("Project authorization reply could not be sent");
    expect(dashboard.mailboxes[0]?.lastFailedJob?.lastError).toBe("Processing failed permanently");
    expect(dashboard.recentFailedMessages).toHaveLength(1);
    expect(dashboard.recentFailedJobs).toHaveLength(1);
  });

  it("keeps per-mailbox failure detail when another mailbox owns the global recent failure window", async () => {
    const companyId = await seedCompany();
    const noisyMailbox = await createMailbox(companyId);
    const quietMailbox = await createNamedMailbox(companyId, "Quiet inbox");
    const baseTime = new Date("2026-05-19T12:00:00.000Z");

    for (let index = 0; index < 25; index += 1) {
      await db.insert(inboundEmailMessages).values({
        companyId,
        mailboxId: noisyMailbox.id,
        rawSha256: randomUUID().replace(/-/g, ""),
        status: "failed",
        subject: `Noisy failure ${index}`,
        error: `Noisy failure ${index}`,
        createdAt: new Date(baseTime.getTime() + index * 1_000),
        updatedAt: new Date(baseTime.getTime() + index * 1_000),
      });
    }

    const quietFailureAt = new Date(baseTime.getTime() - 60_000);
    const [quietMessage] = await db.insert(inboundEmailMessages).values({
      companyId,
      mailboxId: quietMailbox.id,
      rawSha256: randomUUID().replace(/-/g, ""),
      status: "failed",
      subject: "Quiet mailbox failure",
      error: "Quiet mailbox detail must remain visible",
      createdAt: quietFailureAt,
      updatedAt: quietFailureAt,
    }).returning();
    await db.insert(backgroundJobs).values({
      companyId,
      kind: "email.process_message",
      status: "dead",
      payload: { messageId: quietMessage.id },
      attempts: 3,
      maxAttempts: 3,
      lastError: "Quiet mailbox job detail must remain visible",
      createdAt: quietFailureAt,
      updatedAt: quietFailureAt,
    });

    const dashboard = await svc.getOpsDashboard(companyId, new Date(baseTime.getTime() + 120_000));
    const quietRow = dashboard.mailboxes.find((row) => row.mailbox.id === quietMailbox.id);

    expect(dashboard.recentFailedMessages.every((message) => message.mailboxId === noisyMailbox.id)).toBe(true);
    expect(quietRow?.messageCounts.failed).toBe(1);
    expect(quietRow?.jobCounts.dead).toBe(1);
    expect(quietRow?.lastFailedMessage?.error).toBe("Quiet mailbox detail must remain visible");
    expect(quietRow?.lastFailedJob?.lastError).toBe("Quiet mailbox job detail must remain visible");
  });

  it("serves the inbound email ops dashboard through the board API route", async () => {
    const companyId = await seedCompany();
    const mailbox = await createMailbox(companyId);
    await db
      .update(inboundEmailMailboxes)
      .set({
        enabled: true,
        lastPollAt: new Date(),
        lastSuccessAt: new Date(),
      })
      .where(eq(inboundEmailMailboxes.id, mailbox.id));

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.actor = {
        type: "board",
        source: "local_implicit",
        userId: "board-user",
        isInstanceAdmin: true,
      };
      next();
    });
    app.use(inboundEmailRoutes(db));

    const res = await request(app)
      .get(`/companies/${companyId}/inbound-email/ops`)
      .expect(200);

    expect(res.body.summary).toMatchObject({
      mailboxCount: 1,
      enabledMailboxCount: 1,
    });
    expect(res.body.mailboxes[0]).toMatchObject({
      health: "healthy",
      mailbox: {
        id: mailbox.id,
        name: "Support inbox",
        passwordSet: true,
      },
    });
    expect(res.body.mailboxes[0].mailbox).not.toHaveProperty("passwordSecretName");
  });

  it("deletes a mailbox, soft-deletes its secret, and cascades dependent rows", async () => {
    const companyId = await seedCompany();
    const mailbox = await createMailbox(companyId);
    await svc.createRule(companyId, {
      mailboxId: mailbox.id,
      enabled: true,
      senderPattern: null,
      subjectPattern: null,
      targetProjectId: null,
      createMode: "issue",
      priority: "medium",
      labelIds: [],
    });
    await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<delete-cascade@example.com>" }),
      providerUid: "delete-cascade",
      processAfterImport: false,
    });
    const liveSecretsBefore = await db
      .select()
      .from(companySecrets)
      .where(eq(companySecrets.companyId, companyId));
    expect(liveSecretsBefore.find((s) => s.status === "active" && s.name.startsWith("__inbound_email_password__:"))).toBeTruthy();

    await svc.deleteMailbox(companyId, mailbox.id);

    expect(await db.select().from(inboundEmailMailboxes).where(eq(inboundEmailMailboxes.id, mailbox.id))).toEqual([]);
    expect(await db.select().from(inboundEmailRules)).toEqual([]);
    expect(await db.select().from(inboundEmailMessages)).toEqual([]);
    const liveSecretsAfter = await db
      .select()
      .from(companySecrets)
      .where(eq(companySecrets.companyId, companyId));
    expect(liveSecretsAfter.find((s) => s.status === "active" && s.name === `__inbound_email_password__:${mailbox.id}`)).toBeUndefined();
  }, 20_000);

  it("retries a failed message by enqueueing a new process job", async () => {
    const companyId = await seedCompany();
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<retry-message@example.com>" }),
      providerUid: "retry-message",
      processAfterImport: false,
    });
    await db
      .update(inboundEmailMessages)
      .set({ status: "failed", error: "boom" })
      .where(eq(inboundEmailMessages.id, imported.message.id));
    await db.delete(backgroundJobs);

    const job = await svc.retryMessage(companyId, imported.message.id);

    expect(job.kind).toBe("email.process_message");
    expect((job.payload as { messageId?: string }).messageId).toBe(imported.message.id);
    const [stored] = await db.select().from(inboundEmailMessages).where(eq(inboundEmailMessages.id, imported.message.id));
    expect(stored.status).toBe("persisted");
    expect(stored.error).toBeNull();
  }, 20_000);

  it("rejects retryMessage when the message is not in failed status", async () => {
    const companyId = await seedCompany();
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<retry-not-failed@example.com>" }),
      providerUid: "retry-not-failed",
      processAfterImport: false,
    });

    await expect(svc.retryMessage(companyId, imported.message.id)).rejects.toThrow(/Only failed messages/);
  }, 20_000);

  it("retries a dead background job by resetting it to pending with a fresh attempt budget", async () => {
    const companyId = await seedCompany();
    const mailbox = await createMailbox(companyId);
    const job = await svc.enqueueMailboxPoll(companyId, mailbox.id);
    await db
      .update(backgroundJobs)
      .set({
        status: "dead",
        attempts: 3,
        maxAttempts: 3,
        lastError: "max attempts",
        lockedBy: "old",
        lockedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, job.id));

    const updated = await svc.retryJob(companyId, job.id);

    expect(updated.status).toBe("pending");
    expect(updated.attempts).toBe(0);
    expect(updated.lastError).toBeNull();
    expect(updated.lockedBy).toBeNull();
    expect(updated.lockedAt).toBeNull();
  }, 20_000);

  it("rejects retryJob for a job that is not failed or dead", async () => {
    const companyId = await seedCompany();
    const mailbox = await createMailbox(companyId);
    const job = await svc.enqueueMailboxPoll(companyId, mailbox.id);

    await expect(svc.retryJob(companyId, job.id)).rejects.toThrow(/Only failed or dead jobs/);
  }, 20_000);

  it("dedupes mailbox poll scheduling within a single poll interval window", async () => {
    const companyId = await seedCompany();
    const mailbox = await svc.createMailbox(companyId, {
      name: "Scheduler dedupe",
      provider: "imap",
      enabled: true,
      host: "imap.example.com",
      port: 993,
      username: "scheduler@example.com",
      password: "secret",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      targetProjectId: null,
      createMode: "issue",
      markSeen: true,
    });
    void mailbox;

    const fixedNow = new Date("2026-05-19T10:00:30Z");
    const enqueued1 = await svc.enqueueDueMailboxPollJobs(fixedNow);
    const enqueued2 = await svc.enqueueDueMailboxPollJobs(new Date(fixedNow.getTime() + 5_000));

    expect(enqueued1).toBe(1);
    // Same interval bucket — dedupe key collides.
    expect(enqueued2).toBe(1);
    const activeRows = await db.select().from(backgroundJobs);
    const active = activeRows.filter((r) => r.kind === "email.poll_mailbox" && (r.status === "pending" || r.status === "running" || r.status === "retrying"));
    expect(active.length).toBe(1);
  }, 20_000);

  it("marks a mailbox as polled before fetching unread messages", async () => {
    const companyId = await seedCompany();
    const mailbox = await createMailbox(companyId);
    const close = vi.fn(async () => undefined);
    let resolveFetch!: (session: { messages: never[]; close: typeof close }) => void;
    let resolveStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const fetchResult = new Promise<{ messages: never[]; close: typeof close }>((resolve) => {
      resolveFetch = resolve;
    });
    fetchUnreadMessagesMock.mockImplementationOnce(() => {
      resolveStarted();
      return fetchResult;
    });

    const pollPromise = svc.pollMailbox(companyId, mailbox.id);
    await fetchStarted;

    const [duringFetch] = await db
      .select()
      .from(inboundEmailMailboxes)
      .where(eq(inboundEmailMailboxes.id, mailbox.id));
    expect(duringFetch.lastPollAt).toBeInstanceOf(Date);
    expect(duringFetch.lastSuccessAt).toBeNull();

    resolveFetch({ messages: [], close });
    await expect(pollPromise).resolves.toEqual({ imported: 0 });
    expect(close).toHaveBeenCalledOnce();
  }, 20_000);

  it("aggregates orphan jobs in the ops dashboard payload", async () => {
    const companyId = await seedCompany();
    const deletedMailbox = await createMailbox(companyId);
    await db.insert(backgroundJobs).values({
      companyId,
      kind: "email.process_message",
      status: "failed",
      payload: { messageId: randomUUID() },
      attempts: 3,
      maxAttempts: 3,
      lastError: "orphaned",
    });
    await db.insert(backgroundJobs).values({
      companyId,
      kind: "email.poll_mailbox",
      status: "dead",
      payload: { mailboxId: deletedMailbox.id },
      attempts: 3,
      maxAttempts: 3,
      lastError: "deleted mailbox",
    });
    await svc.deleteMailbox(companyId, deletedMailbox.id);

    const dashboard = await svc.getOpsDashboard(companyId);

    expect(dashboard.orphanJobCounts.failed).toBe(1);
    expect(dashboard.orphanJobCounts.dead).toBe(1);
    expect(dashboard.summary.failedJobCount).toBeGreaterThanOrEqual(2);
    expect(dashboard.mailboxes).toHaveLength(0);
  }, 20_000);
});

describe("inbound email validators", () => {
  it("rejects rawEmail payloads larger than 10MB", async () => {
    const { importInboundEmailMessageSchema } = await import("@paperclipai/shared");
    const oversized = "a".repeat(10_000_001);
    const result = importInboundEmailMessageSchema.safeParse({
      mailboxId: "00000000-0000-0000-0000-000000000000",
      rawEmail: oversized,
    });
    expect(result.success).toBe(false);
  });

  it("accepts rawEmail payloads at the 10MB boundary", async () => {
    const { importInboundEmailMessageSchema } = await import("@paperclipai/shared");
    const ok = "a".repeat(10_000_000);
    const result = importInboundEmailMessageSchema.safeParse({
      mailboxId: "00000000-0000-0000-0000-000000000000",
      rawEmail: ok,
    });
    expect(result.success).toBe(true);
  });
});
