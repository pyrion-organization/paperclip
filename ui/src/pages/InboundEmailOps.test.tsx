// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Company,
  InboundEmailExternalIntakeRecord,
  InboundEmailMessage,
  InboundEmailOpsDashboard,
} from "@paperclipai/shared";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemoryRouter } from "@/lib/router";
import { InboundEmailOps } from "./InboundEmailOps";

const mockCompaniesApi = vi.hoisted(() => ({
  getInboundEmailOpsDashboard: vi.fn(),
  listInboundEmailMessages: vi.fn(),
  retryInboundEmailMessage: vi.fn(),
  retryInboundEmailJob: vi.fn(),
  pollInboundEmailMailbox: vi.fn(),
  listExternalInboundEmailIntake: vi.fn(),
  importExternalInboundEmailMessage: vi.fn(),
  importExternalInboundEmailMessagesBatch: vi.fn(),
}));
const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());
let selectedCompany: Company;

vi.mock("../api/companies", () => ({ companiesApi: mockCompaniesApi }));
vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mockSetBreadcrumbs }),
}));
vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompany,
    selectedCompanyId: selectedCompany.id,
  }),
}));

const emptyClassification = {
  classificationCategory: null,
  classificationConfidence: null,
  classificationSeverity: null,
  classificationRecommendedAction: null,
  classificationFinalAction: null,
  classificationSummary: null,
  classificationSafetyFlags: null,
  classificationRuleVersion: null,
  classifiedAt: null,
} satisfies Pick<
  InboundEmailMessage,
  | "classificationCategory"
  | "classificationConfidence"
  | "classificationSeverity"
  | "classificationRecommendedAction"
  | "classificationFinalAction"
  | "classificationSummary"
  | "classificationSafetyFlags"
  | "classificationRuleVersion"
  | "classifiedAt"
>;

const emptySupportReply = {
  supportReplyStatus: null,
  supportReplyReason: null,
  supportReplyAttemptedAt: null,
  supportReplySentAt: null,
  supportReplyError: null,
} satisfies Pick<
  InboundEmailMessage,
  | "supportReplyStatus"
  | "supportReplyReason"
  | "supportReplyAttemptedAt"
  | "supportReplySentAt"
  | "supportReplyError"
>;

function makeCompany(): Company {
  return {
    id: "company-1",
    name: "Paperclip",
    description: null,
    status: "active",
    pauseReason: null,
    pausedAt: null,
    issuePrefix: "PAP",
    issueCounter: 1,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    attachmentMaxBytes: 10 * 1024 * 1024,
    requireBoardApprovalForNewAgents: false,
    feedbackDataSharingEnabled: false,
    feedbackDataSharingConsentAt: null,
    feedbackDataSharingConsentByUserId: null,
    feedbackDataSharingTermsVersion: null,
    brandColor: "#0f766e",
    smtpHost: null,
    smtpPort: null,
    smtpUser: null,
    smtpFrom: null,
    smtpPasswordSet: false,
    emailSignatureHtml: null,
    logoAssetId: null,
    logoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeDashboard(): InboundEmailOpsDashboard {
  const now = new Date("2026-05-19T12:00:00.000Z");
  return {
    generatedAt: now,
    sourceDelete: { supported: false, errorCount: 0, lastError: null },
    summary: {
      mailboxCount: 1,
      enabledMailboxCount: 1,
      healthyMailboxCount: 0,
      warningMailboxCount: 0,
      errorMailboxCount: 1,
      pendingJobCount: 2,
      failedJobCount: 1,
      failedMessageCount: 1,
    },
    mailboxes: [
      {
        mailbox: {
          id: "mailbox-1",
          companyId: "company-1",
          name: "Support inbox",
          enabled: true,
          host: "imap.example.com",
          port: 993,
          username: "support@example.com",
          passwordSet: true,
          folder: "INBOX",
          tls: true,
          pollIntervalSeconds: 60,
          supportRepliesEnabled: true,
          allowProjectlessTriage: true,
          projectFallbackMode: "create_projectless_triage",
          agentAutomationEnabled: false,
          agentAutomationAssigneeId: null,
          agentAutomationMinConfidence: 80,
          agentAutomationWakeEnabled: true,
          externalIntakeEnabled: false,
          externalIntakeTokenHint: null,
          lastPollAt: new Date("2026-05-19T11:55:00.000Z"),
          lastSuccessAt: new Date("2026-05-19T11:50:00.000Z"),
          lastError: "IMAP authentication failed",
          createdAt: now,
          updatedAt: now,
        },
        health: "error",
        healthDetail: "IMAP authentication failed",
        nextPollDueAt: new Date("2026-05-19T11:56:00.000Z"),
        messageCounts: {
          discovered: 0,
          persisted: 1,
          processing: 1,
          processed: 3,
          skipped: 0,
          failed: 1,
          duplicate: 0,
        },
        jobCounts: {
          pending: 1,
          running: 1,
          retrying: 0,
          failed: 0,
          dead: 1,
        },
        lastFailedMessage: {
          id: "message-1",
          mailboxId: "mailbox-1",
          status: "failed",
          subject: "Need help",
          fromAddress: "customer@example.com",
          replyToAddress: null,
          createdIssueId: null,
          error: "Project authorization reply could not be sent",
          skipReason: null,
          ...emptyClassification,
          ...emptySupportReply,
          createdAt: now,
          updatedAt: now,
        },
        lastFailedJob: {
          id: "job-1",
          companyId: "company-1",
          kind: "email.process_message",
          status: "dead",
          mailboxId: "mailbox-1",
          messageId: "message-1",
          attempts: 3,
          maxAttempts: 3,
          runAfter: now,
          lockedBy: null,
          lockedAt: null,
          lastError: "Processing failed permanently",
          createdAt: now,
          updatedAt: now,
        },
      },
    ],
    recentFailedJobs: [],
    recentFailedMessages: [],
    orphanJobCounts: { pending: 0, running: 0, retrying: 0, failed: 0, dead: 0 },
  };
}

function withRecentFailures(dashboard: InboundEmailOpsDashboard): InboundEmailOpsDashboard {
  const older = new Date("2026-05-19T11:00:00.000Z");
  const newer = new Date("2026-05-19T12:30:00.000Z");
  return {
    ...dashboard,
    recentFailedJobs: Array.from({ length: 12 }, (_value, index) => ({
      id: `old-job-${index}`,
      companyId: "company-1",
      kind: "email.process_message",
      status: "dead",
      mailboxId: "mailbox-1",
      messageId: `old-message-${index}`,
      attempts: 3,
      maxAttempts: 3,
      runAfter: older,
      lockedBy: null,
      lockedAt: null,
      lastError: `Old job failure ${index}`,
      createdAt: older,
      updatedAt: older,
    })),
    recentFailedMessages: [
      {
        id: "new-message-1",
        mailboxId: "mailbox-1",
        status: "failed",
        subject: "New message failure",
        fromAddress: "customer@example.com",
        replyToAddress: null,
        createdIssueId: null,
        error: "Newest message failure should render first",
        skipReason: null,
        ...emptyClassification,
        ...emptySupportReply,
        createdAt: newer,
        updatedAt: newer,
      },
    ],
  };
}

function makeProcessedMessage(overrides: Partial<InboundEmailMessage> = {}): InboundEmailMessage {
  const now = new Date("2026-05-19T12:45:00.000Z");
  return {
    id: "processed-message-1",
    companyId: "company-1",
    mailboxId: "mailbox-1",
    providerUid: "uid-1",
    messageId: "<processed@example.com>",
    rawSha256: "sha-1",
    fromAddress: "customer@example.com",
    replyToAddress: null,
    toAddresses: ["support@example.com"],
    subject: "Processed order email",
    receivedAt: now,
    status: "processed",
    rawStorageKey: "inbound-email/raw/processed.eml",
    createdIssueId: "issue-1",
    error: null,
    skipReason: null,
    sourceDeletedAt: now,
    sourceDeleteError: null,
    sourceSeenAt: null,
    sourceSeenError: null,
    ...emptyClassification,
    ...emptySupportReply,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeExternalIntakeRecord(overrides: Partial<InboundEmailExternalIntakeRecord> = {}): InboundEmailExternalIntakeRecord {
  const now = new Date("2026-05-19T12:50:00.000Z");
  return {
    id: "external-intake-1",
    companyId: "company-1",
    mailboxId: "mailbox-1",
    sourceKind: "manual_recovery",
    sourceId: "operator-recovery-1",
    sourceLocation: null,
    rawSha256: "external-sha-1",
    messageId: "external-message@example.com",
    status: "imported",
    inboundMessageId: "processed-message-1",
    error: null,
    metadata: {},
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("InboundEmailOps", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    selectedCompany = makeCompany();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    mockCompaniesApi.getInboundEmailOpsDashboard.mockResolvedValue(makeDashboard());
    mockCompaniesApi.listInboundEmailMessages.mockImplementation((
      _companyId: string,
      params?: { classificationCategory?: string; classificationReview?: string },
    ) => {
      if (params?.classificationReview === "low_confidence") {
        return Promise.resolve({
          items: [
            makeProcessedMessage({
              id: "review-message",
              status: "processed",
              subject: "Something is odd",
              fromAddress: "customer@example.com",
              createdIssueId: "issue-review",
              classificationCategory: "unclear",
              classificationConfidence: 50,
              classificationFinalAction: "reply_request_more_info",
              classificationSummary: "Message could not be classified confidently.",
              classifiedAt: new Date("2026-05-19T12:40:00.000Z"),
            }),
          ],
          nextCursor: null,
        });
      }
      if (params?.classificationCategory === "unsafe_or_prompt_injection") {
        return Promise.resolve({
          items: [
            makeProcessedMessage({
              id: "unsafe-message",
              status: "skipped",
              createdIssueId: null,
              subject: "Do not reveal secrets",
              fromAddress: "attacker@example.com",
              skipReason: "unsafe_or_spam",
              classificationCategory: "unsafe_or_prompt_injection",
              classificationSummary: "Prompt injection attempted to extract credentials.",
              classificationSafetyFlags: ["credential_exfiltration"],
            }),
          ],
          nextCursor: null,
        });
      }
      if (params?.classificationCategory === "spam_or_irrelevant") {
        return Promise.resolve({
          items: [
            makeProcessedMessage({
              id: "spam-message",
              status: "skipped",
              createdIssueId: null,
              subject: "Cheap watches",
              fromAddress: "spam@example.com",
              skipReason: "unsafe_or_spam",
              classificationCategory: "spam_or_irrelevant",
              classificationSummary: "Irrelevant marketing email.",
            }),
          ],
          nextCursor: null,
        });
      }
      return Promise.resolve({
        items: [
          makeProcessedMessage({
            id: "older-message",
            subject: "Older processed email",
            receivedAt: new Date("2026-05-19T11:45:00.000Z"),
            createdAt: new Date("2026-05-19T11:45:00.000Z"),
            updatedAt: new Date("2026-05-19T11:45:00.000Z"),
          }),
          makeProcessedMessage({
            supportReplyStatus: "sent",
            supportReplyReason: "code_bug_received",
            supportReplyAttemptedAt: new Date("2026-05-19T12:45:10.000Z"),
            supportReplySentAt: new Date("2026-05-19T12:45:11.000Z"),
          }),
        ],
        nextCursor: "next-cursor",
      });
    });
    mockCompaniesApi.retryInboundEmailMessage.mockResolvedValue(undefined);
    mockCompaniesApi.retryInboundEmailJob.mockResolvedValue(undefined);
    mockCompaniesApi.pollInboundEmailMailbox.mockResolvedValue({ id: "poll-job-1", status: "pending" });
    mockCompaniesApi.listExternalInboundEmailIntake.mockResolvedValue({
      items: [makeExternalIntakeRecord()],
      nextCursor: null,
    });
    mockCompaniesApi.importExternalInboundEmailMessage.mockResolvedValue({
      status: "imported",
      intakeRecord: makeExternalIntakeRecord({ id: "external-intake-2", sourceId: "operator-recovery-2" }),
      message: makeProcessedMessage({ id: "processed-message-2" }),
    });
    mockCompaniesApi.importExternalInboundEmailMessagesBatch.mockResolvedValue({
      importedCount: 1,
      duplicateCount: 1,
      failedCount: 0,
      results: [
        {
          sourceKind: "manual_recovery",
          sourceId: "operator-recovery-batch-1",
          status: "imported",
          intakeRecord: makeExternalIntakeRecord({ id: "external-intake-batch-1", sourceId: "operator-recovery-batch-1" }),
          message: makeProcessedMessage({ id: "processed-message-batch-1" }),
          error: null,
        },
        {
          sourceKind: "manual_recovery",
          sourceId: "operator-recovery-batch-2",
          status: "duplicate",
          intakeRecord: makeExternalIntakeRecord({
            id: "external-intake-batch-2",
            sourceId: "operator-recovery-batch-2",
            status: "duplicate",
          }),
          message: makeProcessedMessage({ id: "processed-message-batch-1" }),
          error: null,
        },
      ],
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  async function renderPage() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <MemoryRouter>
              <InboundEmailOps />
            </MemoryRouter>
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
  }

  it("renders compact mailbox health, queue, and source-delete support state", async () => {
    await renderPage();

    expect(mockCompaniesApi.getInboundEmailOpsDashboard).toHaveBeenCalledWith("company-1");
    expect(mockSetBreadcrumbs).toHaveBeenCalledWith([
      { label: "Paperclip", href: "/dashboard" },
      { label: "Email Ops" },
    ]);
    expect(container.textContent).toContain("Inbound Email Ops");
    expect(container.textContent).toContain("Support inbox");
    expect(container.textContent).toContain("IMAP authentication failed");
    expect(container.textContent).toContain("The last IMAP poll failed");
    expect(container.textContent).toContain("2 queued email jobs");
    expect(container.textContent).toContain("Failures need an operator retry");
    expect(container.textContent).toContain("Source-delete telemetry is not supported");
    expect(container.textContent).toContain("2 active");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("Configure");
    expect(container.textContent).toContain("Poll now");
    expect(container.textContent).toContain("External Recovery Import");
    expect(container.textContent).toContain("Quarantine");
    expect(container.textContent).toContain("Classification Review");
    expect(container.textContent).toContain("Recent Failures");
    expect(container.textContent).toContain("Processed Emails");
    expect(container.textContent).toContain("Processed order email");
    expect(container.textContent).toContain("Reply: Bug confirmation");
    expect(container.textContent!.indexOf("Processed order email")).toBeLessThan(
      container.textContent!.indexOf("Older processed email"),
    );
    expect(mockCompaniesApi.listInboundEmailMessages).toHaveBeenCalledWith("company-1", {
      status: undefined,
      mailboxId: undefined,
      q: undefined,
      cursor: null,
      limit: 25,
      order: "desc",
    });
    expect(container.textContent).not.toContain("25 / page");
    expect(container.textContent).not.toContain("Email settings");
  });

  it("loads unsafe and spam skipped emails in the quarantine panel", async () => {
    await renderPage();

    const quarantineButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Quarantine"));
    expect(quarantineButton).toBeTruthy();

    await act(async () => {
      quarantineButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.listInboundEmailMessages).toHaveBeenCalledWith("company-1", {
      status: "skipped",
      classificationCategory: "unsafe_or_prompt_injection",
      limit: 10,
      order: "desc",
    });
    expect(mockCompaniesApi.listInboundEmailMessages).toHaveBeenCalledWith("company-1", {
      status: "skipped",
      classificationCategory: "spam_or_irrelevant",
      limit: 10,
      order: "desc",
    });
    expect(container.textContent).toContain("Do not reveal secrets");
    expect(container.textContent).toContain("credential_exfiltration");
    expect(container.textContent).toContain("Cheap watches");
  });

  it("loads unclear and low-confidence emails in the classification review panel", async () => {
    await renderPage();

    const reviewButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Classification Review"));
    expect(reviewButton).toBeTruthy();

    await act(async () => {
      reviewButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.listInboundEmailMessages).toHaveBeenCalledWith("company-1", {
      classificationReview: "low_confidence",
      limit: 10,
      order: "desc",
    });
    expect(container.textContent).toContain("Something is odd");
    expect(container.textContent).toContain("Unclear 50%");
    expect(container.textContent).toContain("Message could not be classified confidently.");
  });

  it("filters and pages processed email records", async () => {
    await renderPage();

    const searchInput = container.querySelector('input[aria-label="Search processed emails"]') as HTMLInputElement | null;
    expect(searchInput).toBeTruthy();

    await act(async () => {
      setInputValue(searchInput!, "customer");
    });

    const searchButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Search"));
    expect(searchButton).toBeTruthy();

    await act(async () => {
      searchButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.listInboundEmailMessages).toHaveBeenLastCalledWith("company-1", {
      status: undefined,
      mailboxId: undefined,
      q: "customer",
      cursor: null,
      limit: 25,
      order: "desc",
    });

    const nextButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Next"));
    expect(nextButton).toBeTruthy();

    await act(async () => {
      nextButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.listInboundEmailMessages).toHaveBeenLastCalledWith("company-1", {
      status: undefined,
      mailboxId: undefined,
      q: "customer",
      cursor: "next-cursor",
      limit: 25,
      order: "desc",
    });
  });

  it("sorts mixed recent job and message failures by recency before truncating", async () => {
    mockCompaniesApi.getInboundEmailOpsDashboard.mockResolvedValue(withRecentFailures(makeDashboard()));

    await renderPage();

    const text = container.textContent ?? "";
    expect(text).toContain("Newest message failure should render first");
    expect(text.indexOf("Newest message failure should render first")).toBeLessThan(text.indexOf("Old job failure 0"));
  });

  it("surfaces retry failures from the API", async () => {
    mockCompaniesApi.getInboundEmailOpsDashboard.mockResolvedValue(withRecentFailures(makeDashboard()));
    mockCompaniesApi.retryInboundEmailMessage.mockRejectedValue(new Error("Message is no longer retryable"));

    await renderPage();

    const retryButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Retry"));
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.retryInboundEmailMessage).toHaveBeenCalledWith("company-1", "new-message-1");
    expect(container.textContent).toContain("Retry failed.");
    expect(container.textContent).toContain("Message is no longer retryable");
  });

  it("refreshes inbound email state after retrying a failure", async () => {
    mockCompaniesApi.getInboundEmailOpsDashboard.mockResolvedValue(withRecentFailures(makeDashboard()));
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await renderPage();

    const retryButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Retry"));
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.retryInboundEmailMessage).toHaveBeenCalledWith("company-1", "new-message-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "ops"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "messages"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "jobs"] });
  });

  it("queues an immediate mailbox poll from the mailbox row", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await renderPage();

    const pollButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Poll now"));
    expect(pollButton).toBeTruthy();

    await act(async () => {
      pollButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.pollInboundEmailMailbox).toHaveBeenCalledWith("company-1", "mailbox-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "ops"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "messages"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "jobs"] });
  });

  it("imports preserved external support email from the recovery panel", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await renderPage();

    const panelButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("External Recovery Import"));
    expect(panelButton).toBeTruthy();

    await act(async () => {
      panelButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.listExternalInboundEmailIntake).toHaveBeenCalledWith("company-1", {
      limit: 10,
      order: "desc",
    });
    expect(container.textContent).toContain("operator-recovery-1");

    const sourceIdInput = container.querySelector("#external-intake-source-id") as HTMLInputElement | null;
    const rawEmailInput = container.querySelector("#external-intake-raw-email") as HTMLTextAreaElement | null;
    expect(sourceIdInput).toBeTruthy();
    expect(rawEmailInput).toBeTruthy();

    await act(async () => {
      setInputValue(sourceIdInput!, "operator-recovery-2");
      setTextareaValue(
        rawEmailInput!,
        "Message-ID: <operator-recovery-2@example.com>\nFrom: customer@example.com\nTo: support@example.com\nSubject: Recovery\n\nBody",
      );
    });

    const importButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Import preserved email"));
    expect(importButton).toBeTruthy();

    await act(async () => {
      importButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.importExternalInboundEmailMessage).toHaveBeenCalledWith("company-1", {
      mailboxId: "mailbox-1",
      sourceKind: "manual_recovery",
      sourceId: "operator-recovery-2",
      sourceLocation: null,
      rawEmail: "Message-ID: <operator-recovery-2@example.com>\nFrom: customer@example.com\nTo: support@example.com\nSubject: Recovery\n\nBody",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "ops"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "messages"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "jobs"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "external-intake"] });
    expect(container.textContent).toContain("External intake recorded as imported");
  });

  it("filters and pages recent external intake records from the recovery panel", async () => {
    mockCompaniesApi.listExternalInboundEmailIntake.mockImplementation((_companyId: string, params?: {
      status?: string;
      cursor?: string | null;
    }) => {
      if (params?.cursor === "failed-next") {
        return Promise.resolve({
          items: [
            makeExternalIntakeRecord({
              id: "external-intake-failed-older",
              sourceId: "backup/older-failed.eml",
              sourceLocation: "s3://support-backup/older-failed.eml",
              status: "failed",
              error: "Older message failed",
            }),
          ],
          nextCursor: null,
        });
      }
      if (params?.status === "failed") {
        return Promise.resolve({
          items: [
            makeExternalIntakeRecord({
              id: "external-intake-failed",
              sourceId: "backup/failed.eml",
              sourceLocation: "s3://support-backup/failed.eml",
              status: "failed",
              error: "Message could not be parsed",
            }),
          ],
          nextCursor: "failed-next",
        });
      }
      return Promise.resolve({
        items: [makeExternalIntakeRecord()],
        nextCursor: null,
      });
    });
    await renderPage();

    const panelButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("External Recovery Import"));
    expect(panelButton).toBeTruthy();

    await act(async () => {
      panelButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.listExternalInboundEmailIntake).toHaveBeenLastCalledWith("company-1", {
      limit: 10,
      order: "desc",
    });

    const failedFilter = container.querySelector('button[aria-label="Show failed external intake"]') as HTMLButtonElement | null;
    expect(failedFilter).toBeTruthy();

    await act(async () => {
      failedFilter!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.listExternalInboundEmailIntake).toHaveBeenLastCalledWith("company-1", {
      status: "failed",
      limit: 10,
      order: "desc",
    });
    expect(container.textContent).toContain("backup/failed.eml");
    expect(container.textContent).toContain("s3://support-backup/failed.eml");
    expect(container.textContent).toContain("Message could not be parsed");

    const olderButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Older"));
    expect(olderButton).toBeTruthy();

    await act(async () => {
      olderButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.listExternalInboundEmailIntake).toHaveBeenLastCalledWith("company-1", {
      status: "failed",
      cursor: "failed-next",
      limit: 10,
      order: "desc",
    });
    expect(container.textContent).toContain("backup/older-failed.eml");
    expect(container.textContent).toContain("Older message failed");
  });

  it("imports preserved external support email batches from the recovery panel", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    mockCompaniesApi.importExternalInboundEmailMessagesBatch.mockResolvedValueOnce({
      importedCount: 1,
      duplicateCount: 1,
      failedCount: 1,
      results: [
        {
          sourceKind: "manual_recovery",
          sourceId: "operator-recovery-batch-1",
          status: "imported",
          intakeRecord: makeExternalIntakeRecord({ id: "external-intake-batch-1", sourceId: "operator-recovery-batch-1" }),
          message: makeProcessedMessage({ id: "processed-message-batch-1" }),
          error: null,
        },
        {
          sourceKind: "manual_recovery",
          sourceId: "operator-recovery-batch-2",
          status: "duplicate",
          intakeRecord: makeExternalIntakeRecord({
            id: "external-intake-batch-2",
            sourceId: "operator-recovery-batch-2",
            status: "duplicate",
          }),
          message: makeProcessedMessage({ id: "processed-message-batch-1" }),
          error: null,
        },
        {
          sourceKind: "object_storage",
          sourceId: "backup/messages/bad.eml",
          status: "failed",
          intakeRecord: null,
          message: null,
          error: "Message could not be parsed",
        },
      ],
    });
    await renderPage();

    const panelButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("External Recovery Import"));
    expect(panelButton).toBeTruthy();

    await act(async () => {
      panelButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    const batchInput = container.querySelector('textarea[aria-label="External intake batch JSON"]') as HTMLTextAreaElement | null;
    expect(batchInput).toBeTruthy();

    await act(async () => {
      setTextareaValue(
        batchInput!,
        JSON.stringify([
          {
            sourceId: "operator-recovery-batch-1",
            rawEmail: "Message-ID: <batch-1@example.com>\nFrom: customer@example.com\nTo: support@example.com\nSubject: Batch 1\n\nBody",
          },
          {
            sourceId: "operator-recovery-batch-2",
            rawEmail: "Message-ID: <batch-2@example.com>\nFrom: customer@example.com\nTo: support@example.com\nSubject: Batch 2\n\nBody",
          },
          {
            sourceKind: "object_storage",
            sourceId: "backup/messages/bad.eml",
            rawEmail: "Message-ID: <bad@example.com>\nFrom: customer@example.com\nTo: support@example.com\nSubject: Bad\n\nBody",
          },
        ]),
      );
    });

    const importBatchButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Import batch"));
    expect(importBatchButton).toBeTruthy();

    await act(async () => {
      importBatchButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.importExternalInboundEmailMessagesBatch).toHaveBeenCalledWith("company-1", {
      messages: [
        {
          mailboxId: "mailbox-1",
          sourceKind: "manual_recovery",
          sourceId: "operator-recovery-batch-1",
          sourceLocation: null,
          rawEmail: "Message-ID: <batch-1@example.com>\nFrom: customer@example.com\nTo: support@example.com\nSubject: Batch 1\n\nBody",
        },
        {
          mailboxId: "mailbox-1",
          sourceKind: "manual_recovery",
          sourceId: "operator-recovery-batch-2",
          sourceLocation: null,
          rawEmail: "Message-ID: <batch-2@example.com>\nFrom: customer@example.com\nTo: support@example.com\nSubject: Batch 2\n\nBody",
        },
        {
          mailboxId: "mailbox-1",
          sourceKind: "object_storage",
          sourceId: "backup/messages/bad.eml",
          sourceLocation: null,
          rawEmail: "Message-ID: <bad@example.com>\nFrom: customer@example.com\nTo: support@example.com\nSubject: Bad\n\nBody",
        },
      ],
    });
    expect(container.textContent).toContain("Batch recorded: 1 imported, 1 duplicate, 1 failed.");
    expect(container.textContent).toContain("Batch item results");
    expect(container.textContent).toContain("operator-recovery-batch-1");
    expect(container.textContent).toContain("backup/messages/bad.eml");
    expect(container.textContent).toContain("Message could not be parsed");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "ops"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "messages"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "jobs"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "external-intake"] });
  });
});
