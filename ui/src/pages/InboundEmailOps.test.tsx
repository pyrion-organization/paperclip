// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Company, InboundEmailMessage, InboundEmailOpsDashboard } from "@paperclipai/shared";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemoryRouter } from "@/lib/router";
import { InboundEmailOps } from "./InboundEmailOps";

const mockCompaniesApi = vi.hoisted(() => ({
  getInboundEmailOpsDashboard: vi.fn(),
  listInboundEmailMessages: vi.fn(),
  retryInboundEmailMessage: vi.fn(),
  retryInboundEmailJob: vi.fn(),
  pollInboundEmailMailbox: vi.fn(),
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
    mockCompaniesApi.listInboundEmailMessages.mockResolvedValue({
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
    mockCompaniesApi.retryInboundEmailMessage.mockResolvedValue(undefined);
    mockCompaniesApi.retryInboundEmailJob.mockResolvedValue(undefined);
    mockCompaniesApi.pollInboundEmailMailbox.mockResolvedValue({ id: "poll-job-1", status: "pending" });
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
});
