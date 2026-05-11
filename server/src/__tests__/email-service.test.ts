import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { companies, createDb } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { sendIssueCompletionEmail } from "../services/email.ts";

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
    `Skipping embedded Postgres email service tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("email service", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-email-service-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  beforeEach(() => {
    createTransportMock.mockClear();
    sendMailMock.mockClear();
  });

  afterEach(async () => {
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("renders company email template branding instead of hardcoded signature text", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Acme Operations",
      issuePrefix: `M${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
      brandColor: "#0f766e",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpFrom: "noreply@acme.example",
      emailTemplateBrandName: "Acme Ops",
      emailTemplateTagline: "Autonomous operations desk",
      emailTemplateWebsiteUrl: "https://ops.example.com",
      emailTemplateFooterText: "Do not reply to this automated email.",
    });

    await sendIssueCompletionEmail({
      to: "creator@example.com",
      issueTitle: "Ship report",
      issueId: randomUUID(),
      issueIdentifier: "ACME-1",
      completedByName: "CodexCoder",
      completedByKind: "agent",
      agentComment: "Done.",
      db,
      companyId,
    });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      auth: undefined,
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const message = sendMailMock.mock.calls[0]?.[0] as { html?: string; from?: string } | undefined;
    expect(message?.from).toBe("noreply@acme.example");
    expect(message?.html).toContain("Acme Ops");
    expect(message?.html).toContain("Autonomous operations desk");
    expect(message?.html).toContain("https://ops.example.com");
    expect(message?.html).toContain("Do not reply to this automated email.");
    expect(message?.html).not.toContain("Pyrion");
  });
});
