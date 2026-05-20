// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Company, InboundEmailOpsDashboard } from "@paperclipai/shared";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemoryRouter } from "@/lib/router";
import { InboundEmailOps } from "./InboundEmailOps";

const mockCompaniesApi = vi.hoisted(() => ({
  getInboundEmailOpsDashboard: vi.fn(),
  retryInboundEmailMessage: vi.fn(),
  retryInboundEmailJob: vi.fn(),
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
          provider: "imap",
          enabled: true,
          host: "imap.example.com",
          port: 993,
          username: "support@example.com",
          passwordSet: true,
          folder: "INBOX",
          tls: true,
          pollIntervalSeconds: 60,
          targetProjectId: "project-1",
          createMode: "issue",
          markSeen: true,
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
          createdIssueId: null,
          error: "Project authorization reply could not be sent",
          skipReason: null,
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
        createdIssueId: null,
        error: "Newest message failure should render first",
        skipReason: null,
        createdAt: newer,
        updatedAt: newer,
      },
    ],
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
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
    mockCompaniesApi.retryInboundEmailMessage.mockResolvedValue(undefined);
    mockCompaniesApi.retryInboundEmailJob.mockResolvedValue(undefined);
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
});
