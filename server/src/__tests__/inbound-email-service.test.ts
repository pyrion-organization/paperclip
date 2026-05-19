import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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

const sendMailMock = vi.hoisted(() => vi.fn(async () => undefined));
const createTransportMock = vi.hoisted(() => vi.fn(() => ({ sendMail: sendMailMock })));
const deleteMessageFromMailboxMock = vi.hoisted(() => vi.fn(async () => undefined));
const markMessageSeenInMailboxMock = vi.hoisted(() => vi.fn(async () => undefined));
const fetchUnreadMessagesMock = vi.hoisted(() => vi.fn());
const testImapConnectionMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

vi.mock("../services/inbound-email-imap.js", () => ({
  deleteMessageFromMailbox: deleteMessageFromMailboxMock,
  fetchUnreadMessages: fetchUnreadMessagesMock,
  markMessageSeenInMailbox: markMessageSeenInMailboxMock,
  testImapConnection: testImapConnectionMock,
}));

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres inbound email tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

function rawEmail(input?: { subject?: string; messageId?: string; from?: string; body?: string }) {
  return [
    `Message-ID: ${input?.messageId ?? `<${randomUUID()}@example.com>`}`,
    `From: Customer <${input?.from ?? "customer@example.com"}>`,
    "To: intake@example.com",
    `Subject: ${input?.subject ?? "Need help with production deploy"}`,
    "Date: Tue, 12 May 2026 10:00:00 +0000",
    "Content-Type: text/plain; charset=utf-8",
    "",
    input?.body ?? "Please investigate the production deploy failure.",
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
    deleteMessageFromMailboxMock.mockClear();
    markMessageSeenInMailboxMock.mockClear();
    fetchUnreadMessagesMock.mockReset();
    testImapConnectionMock.mockClear();
  });

  afterEach(async () => {
    await db.delete(backgroundJobs);
    await db.delete(activityLog);
    await db.delete(inboundEmailMessages);
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

  async function linkClientProject(input: {
    companyId: string;
    clientId: string;
    projectId: string;
    projectNameOverride?: string | null;
    projectAliases?: string[];
  }) {
    const [clientProject] = await db
      .insert(clientProjects)
      .values({
        companyId: input.companyId,
        clientId: input.clientId,
        projectId: input.projectId,
        projectNameOverride: input.projectNameOverride ?? null,
        projectAliases: input.projectAliases ?? [],
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

  it("imports a raw inbound email, deduplicates it, and creates an issue through the queue", async () => {
    const companyId = await seedCompany();
    const { client } = await seedClientIdentity({ companyId });
    const project = await seedProject(companyId, "Production Deploy");
    await linkClientProject({ companyId, clientId: client.id, projectId: project.id });
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

    const message = rawEmail({ messageId: "<deploy-failure@example.com>", subject: "ProductionDeploy failure" });
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
    expect(storedMessage.sourceDeletedAt).toBeTruthy();
    expect(storedMessage.sourceDeleteError).toBeNull();

    const [createdIssue] = await db.select().from(issues);
    expect(createdIssue.title).toBe("ProductionDeploy failure");
    expect(createdIssue.projectId).toBe(project.id);
    expect(createdIssue.originKind).toBe("inbound_email");
    expect(createdIssue.originId).toBe(storedMessage.id);
    expect(deleteMessageFromMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "101",
    );
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
    expect(deleteMessageFromMailboxMock).not.toHaveBeenCalled();
    expect(markMessageSeenInMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "unknown-domain",
    );
    expect(storedMessage.sourceSeenAt).toBeTruthy();
    expect(storedMessage.sourceSeenError).toBeNull();
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
    expect(deleteMessageFromMailboxMock).not.toHaveBeenCalled();
    expect(markMessageSeenInMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "inactive-client",
    );
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
    expect(email?.text).toContain("não está cadastrado");
    expect(email?.text).toContain("Peça para um usuário já cadastrado enviar uma solicitação pedindo o seu cadastro.");
    expect(email?.html).toContain("Solicitação não processada");
    expect(storedMessage.sourceDeletedAt).toBeTruthy();
    expect(storedMessage.sourceDeleteError).toBeNull();
    expect(deleteMessageFromMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "unregistered",
    );
  }, 20_000);

  it("creates an issue when a registered employee mentions an allowed project", async () => {
    const companyId = await seedCompany();
    const { client } = await seedClientIdentity({ companyId });
    const project = await seedProject(companyId, "OC Importer");
    await linkClientProject({ companyId, clientId: client.id, projectId: project.id });
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<allowed-project@example.com>", subject: "Issue in oc-importer" }),
      providerUid: "allowed-project",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    const [createdIssue] = await db.select().from(issues);
    expect(storedMessage.status).toBe("processed");
    expect(createdIssue.projectId).toBe(project.id);
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(storedMessage.sourceDeletedAt).toBeTruthy();
    expect(storedMessage.sourceDeleteError).toBeNull();
    expect(deleteMessageFromMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "allowed-project",
    );
  }, 20_000);

  it("matches allowed projects by aliases in the email body", async () => {
    const companyId = await seedCompany();
    const { client } = await seedClientIdentity({ companyId });
    const project = await seedProject(companyId, "Long Internal Name");
    await linkClientProject({
      companyId,
      clientId: client.id,
      projectId: project.id,
      projectNameOverride: "Client Portal",
      projectAliases: ["Portal Azul"],
    });
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({
        messageId: "<alias-project@example.com>",
        subject: "New request",
        body: "Please review the PortalAzul onboarding issue.",
      }),
      providerUid: "alias-project",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [createdIssue] = await db.select().from(issues);
    expect(createdIssue.projectId).toBe(project.id);
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(deleteMessageFromMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "alias-project",
    );
  }, 20_000);

  it("does not match short project aliases inside unrelated words", async () => {
    const companyId = await seedCompany();
    await db
      .update(companies)
      .set({ smtpHost: "smtp.example.com", smtpPort: 587, smtpFrom: "noreply@acme.example" })
      .where(eq(companies.id, companyId));
    const { client } = await seedClientIdentity({ companyId });
    const project = await seedProject(companyId, "AI");
    await linkClientProject({ companyId, clientId: client.id, projectId: project.id, projectAliases: ["AI"] });
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({
        messageId: "<short-alias-substring@example.com>",
        subject: "Service failure",
        body: "The document parser is failing again.",
      }),
      providerUid: "short-alias-substring",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("project_not_identified");
    expect(await db.select().from(issues)).toEqual([]);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(deleteMessageFromMailboxMock).not.toHaveBeenCalled();
    expect(markMessageSeenInMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "short-alias-substring",
    );
  }, 20_000);

  it("matches short project aliases as whole tokens", async () => {
    const companyId = await seedCompany();
    const { client } = await seedClientIdentity({ companyId });
    const project = await seedProject(companyId, "AI");
    await linkClientProject({ companyId, clientId: client.id, projectId: project.id, projectAliases: ["AI"] });
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<short-alias-token@example.com>", subject: "AI outage" }),
      providerUid: "short-alias-token",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [createdIssue] = await db.select().from(issues);
    expect(createdIssue.projectId).toBe(project.id);
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(deleteMessageFromMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "short-alias-token",
    );
  }, 20_000);

  it("replies when project matching is ambiguous", async () => {
    const companyId = await seedCompany();
    await db
      .update(companies)
      .set({ smtpHost: "smtp.example.com", smtpPort: 587, smtpFrom: "noreply@acme.example" })
      .where(eq(companies.id, companyId));
    const { client } = await seedClientIdentity({ companyId });
    const firstProject = await seedProject(companyId, "North Portal");
    const secondProject = await seedProject(companyId, "South Portal");
    await linkClientProject({ companyId, clientId: client.id, projectId: firstProject.id, projectAliases: ["Portal"] });
    await linkClientProject({ companyId, clientId: client.id, projectId: secondProject.id, projectAliases: ["Portal"] });
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<ambiguous-project@example.com>", subject: "Portal request" }),
      providerUid: "ambiguous-project",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("project_match_ambiguous");
    expect(await db.select().from(issues)).toEqual([]);
    const email = sendMailMock.mock.calls[0]?.[0] as { text?: string } | undefined;
    expect(email?.text).toContain("mais de um projeto possível");
    expect(deleteMessageFromMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "ambiguous-project",
    );
    expect(markMessageSeenInMailboxMock).not.toHaveBeenCalled();
  }, 20_000);

  it("retries source deletion without recreating an already-created issue", async () => {
    const companyId = await seedCompany();
    const { client } = await seedClientIdentity({ companyId });
    const project = await seedProject(companyId, "Delete Retry");
    await linkClientProject({ companyId, clientId: client.id, projectId: project.id });
    const mailbox = await createMailbox(companyId);
    const raw = rawEmail({ messageId: "<delete-retry@example.com>", subject: "DeleteRetry incident" });
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: raw,
      providerUid: "delete-retry",
      processAfterImport: false,
    });
    deleteMessageFromMailboxMock.mockRejectedValueOnce(new Error("imap delete failed"));

    await expect(svc.processMessage(companyId, imported.message.id)).rejects.toThrow("imap delete failed");

    let [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("processed");
    expect(storedMessage.createdIssueId).toBeTruthy();
    expect(storedMessage.sourceDeletedAt).toBeNull();
    expect(storedMessage.sourceDeleteError).toBe("imap delete failed");
    expect((await db.select().from(issues)).length).toBe(1);

    await db.delete(backgroundJobs);
    const duplicate = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: raw,
      providerUid: "delete-retry",
      processAfterImport: true,
    });
    expect(duplicate.status).toBe("duplicate");
    expect((await db.select().from(backgroundJobs)).some((job) => job.kind === "email.process_message")).toBe(true);

    const processed = await svc.runEmailWorkerOnce("delete-retry-worker", 5, { runScheduler: false });
    expect(processed).toBe(1);

    [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("processed");
    expect(storedMessage.sourceDeletedAt).toBeTruthy();
    expect(storedMessage.sourceDeleteError).toBeNull();
    expect((await db.select().from(issues)).length).toBe(1);
    expect(deleteMessageFromMailboxMock).toHaveBeenCalledTimes(2);
  }, 20_000);

  it("replies with no-project guidance when the only named client project link is inactive", async () => {
    const companyId = await seedCompany();
    await db
      .update(companies)
      .set({ smtpHost: "smtp.example.com", smtpPort: 587, smtpFrom: "noreply@acme.example" })
      .where(eq(companies.id, companyId));
    const { client } = await seedClientIdentity({ companyId });
    const project = await seedProject(companyId, "Paused Portal");
    const clientProject = await linkClientProject({ companyId, clientId: client.id, projectId: project.id });
    await db.update(clientProjects).set({ status: "inactive" }).where(eq(clientProjects.id, clientProject.id));
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<inactive-client-project@example.com>", subject: "Paused Portal is down" }),
      providerUid: "inactive-client-project",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("project_not_identified");
    expect(await db.select().from(issues)).toEqual([]);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(markMessageSeenInMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "inactive-client-project",
    );
    expect(deleteMessageFromMailboxMock).not.toHaveBeenCalled();
  }, 20_000);

  it("replies with no-project guidance when no linked project is named", async () => {
    const companyId = await seedCompany();
    await db
      .update(companies)
      .set({ smtpHost: "smtp.example.com", smtpPort: 587, smtpFrom: "noreply@acme.example" })
      .where(eq(companies.id, companyId));
    await seedClientIdentity({ companyId });
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<selected-untargeted@example.com>" }),
      providerUid: "selected-untargeted",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("project_not_identified");
    expect(await db.select().from(issues)).toEqual([]);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const email = sendMailMock.mock.calls[0]?.[0] as { text?: string } | undefined;
    expect(email?.text).toContain("não conseguimos identificar com segurança");
    expect(markMessageSeenInMailboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com", username: "support@example.com" }),
      "selected-untargeted",
    );
    expect(deleteMessageFromMailboxMock).not.toHaveBeenCalled();
  }, 20_000);

  it("does not create an issue when the sender names a project from another client", async () => {
    const companyId = await seedCompany();
    await db
      .update(companies)
      .set({ smtpHost: "smtp.example.com", smtpPort: 587, smtpFrom: "noreply@acme.example" })
      .where(eq(companies.id, companyId));
    await seedClientIdentity({ companyId });
    const other = await seedClientIdentity({ companyId, clientName: "Other Client", domain: "other.example", employeeEmail: "other@other.example" });
    const project = await seedProject(companyId, "Private Project");
    await linkClientProject({ companyId, clientId: other.client.id, projectId: project.id });
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<unlinked-project@example.com>", subject: "Private Project request" }),
      providerUid: "unlinked-project",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("project_not_identified");
    expect(await db.select().from(issues)).toEqual([]);
    const email = sendMailMock.mock.calls[0]?.[0] as { text?: string } | undefined;
    expect(email?.text).toContain("não conseguimos identificar com segurança");
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
    const mailbox = await createMailbox(companyId);
    const imported = await svc.submitRawMessage({
      companyId,
      mailboxId: mailbox.id,
      rawEmail: rawEmail({ messageId: "<selected-denied@example.com>", subject: "DeniedProject request" }),
      providerUid: "selected-denied",
    });

    await svc.processMessage(companyId, imported.message.id);

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("skipped");
    expect(storedMessage.skipReason).toBe("project_not_authorized");
    expect(await db.select().from(issues)).toEqual([]);
    const email = sendMailMock.mock.calls[0]?.[0] as { text?: string } | undefined;
    expect(email?.text).toContain("não tem autorização para abrir solicitações para este projeto");
    expect(email?.text).not.toContain("Denied Project");
  }, 20_000);

  it("fails retryably when an authorization reply is required but SMTP is not configured", async () => {
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

    await expect(svc.processMessage(companyId, imported.message.id)).rejects.toThrow(
      "Could not send inbound authorization reply: smtp_not_configured",
    );

    const [storedMessage] = await db.select().from(inboundEmailMessages);
    expect(storedMessage.status).toBe("failed");
    expect(storedMessage.error).toBe("Could not send inbound authorization reply: smtp_not_configured");
    expect(storedMessage.sourceDeletedAt).toBeNull();
    expect(deleteMessageFromMailboxMock).not.toHaveBeenCalled();
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
});
