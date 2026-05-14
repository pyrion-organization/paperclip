// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Company, InboundEmailRule } from "@paperclipai/shared";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompanyEmailSettings } from "./CompanyEmailSettings";

const mockCompaniesApi = vi.hoisted(() => ({
  update: vi.fn(),
  testEmail: vi.fn(),
  listInboundEmailMailboxes: vi.fn(),
  saveInboundEmailMailbox: vi.fn(),
  testInboundEmailMailbox: vi.fn(),
  pollInboundEmailMailbox: vi.fn(),
  listInboundEmailMessages: vi.fn(),
  listInboundEmailRules: vi.fn(),
  saveInboundEmailRule: vi.fn(),
}));
const mockProjectsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockIssuesApi = vi.hoisted(() => ({ listLabels: vi.fn() }));
const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());
let selectedCompany: Company;

vi.mock("../api/companies", () => ({ companiesApi: mockCompaniesApi }));
vi.mock("../api/projects", () => ({ projectsApi: mockProjectsApi }));
vi.mock("../api/issues", () => ({ issuesApi: mockIssuesApi }));
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

function makeRule(overrides: Partial<InboundEmailRule> = {}): InboundEmailRule {
  return {
    id: "rule-1",
    companyId: "company-1",
    mailboxId: null,
    enabled: true,
    senderPattern: "client.com",
    subjectPattern: "urgent",
    targetProjectId: "project-1",
    createMode: "issue",
    priority: "high",
    labelIds: ["label-1"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : input instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("CompanyEmailSettings", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    selectedCompany = makeCompany();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockCompaniesApi.update.mockImplementation(async (_companyId: string, payload: Partial<Company>) => ({
      ...selectedCompany,
      ...payload,
    }));
    mockCompaniesApi.testEmail.mockResolvedValue({ ok: true });
    mockCompaniesApi.listInboundEmailMailboxes.mockResolvedValue({ items: [], nextCursor: null });
    mockCompaniesApi.saveInboundEmailMailbox.mockImplementation(async (_companyId: string, mailboxId: string | null, payload: Record<string, unknown>) => ({
      id: mailboxId ?? "mailbox-1",
      companyId: "company-1",
      provider: "imap",
      passwordSet: Boolean(payload.password),
      lastPollAt: null,
      lastSuccessAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...payload,
    }));
    mockCompaniesApi.testInboundEmailMailbox.mockResolvedValue({ ok: true });
    mockCompaniesApi.pollInboundEmailMailbox.mockResolvedValue({ id: "job-1", status: "pending" });
    mockCompaniesApi.listInboundEmailMessages.mockResolvedValue({ items: [], nextCursor: null });
    mockCompaniesApi.listInboundEmailRules.mockResolvedValue({ items: [], nextCursor: null });
    mockCompaniesApi.saveInboundEmailRule.mockImplementation(async (_companyId: string, ruleId: string | null, payload: Record<string, unknown>) => ({
      id: ruleId ?? "rule-1",
      companyId: "company-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...payload,
    }));
    mockProjectsApi.list.mockResolvedValue([{ id: "project-1", name: "Support" }]);
    mockIssuesApi.listLabels.mockResolvedValue([{ id: "label-1", name: "VIP" }]);
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
            <CompanyEmailSettings />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();
  }

  it("renders the email settings sections", async () => {
    await renderPage();

    expect(container.querySelector("[data-testid='company-settings-smtp-section']")).not.toBeNull();
    expect(container.querySelector("[data-testid='company-settings-inbound-email-section']")).not.toBeNull();
    expect(container.querySelector("[data-testid='company-settings-email-signature-section']")).not.toBeNull();
    expect(container.querySelector("[data-testid='company-settings-inbound-rules-section']")).not.toBeNull();
  });

  it("saves SMTP credentials and signature through the company API", async () => {
    await renderPage();

    setInputValue(container.querySelector("[data-testid='company-settings-smtp-host']") as HTMLInputElement, "smtp.example.com");
    setInputValue(container.querySelector("[data-testid='company-settings-smtp-port']") as HTMLInputElement, "587");
    setInputValue(container.querySelector("[data-testid='company-settings-smtp-from']") as HTMLInputElement, "noreply@example.com");
    setInputValue(container.querySelector("[data-testid='company-settings-smtp-user']") as HTMLInputElement, "mailer");
    setInputValue(container.querySelector("[data-testid='company-settings-smtp-password']") as HTMLInputElement, "secret");
    await flushReact();

    await act(async () => {
      (container.querySelector("[data-testid='company-settings-smtp-save']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(mockCompaniesApi.update).toHaveBeenCalledWith("company-1", {
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpUser: "mailer",
      smtpFrom: "noreply@example.com",
      smtpPassword: "secret",
    });

    setInputValue(container.querySelector("[data-testid='company-settings-email-signature-html']") as HTMLTextAreaElement, "<table><tr><td>Signature</td></tr></table>");
    await flushReact();
    await act(async () => {
      (container.querySelector("[data-testid='company-settings-email-signature-save']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(mockCompaniesApi.update).toHaveBeenCalledWith("company-1", {
      emailSignatureHtml: "<table><tr><td>Signature</td></tr></table>",
    });
  });

  it("saves inbound mailbox settings through the inbound email API", async () => {
    await renderPage();

    setInputValue(container.querySelector("[data-testid='company-settings-inbound-host']") as HTMLInputElement, "imap.example.com");
    setInputValue(container.querySelector("[data-testid='company-settings-inbound-username']") as HTMLInputElement, "support@example.com");
    setInputValue(container.querySelector("[data-testid='company-settings-inbound-password']") as HTMLInputElement, "mailbox-secret");
    await flushReact();

    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-save']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(mockCompaniesApi.saveInboundEmailMailbox).toHaveBeenCalledWith("company-1", null, {
      name: "Support inbox",
      provider: "imap",
      enabled: false,
      host: "imap.example.com",
      port: 993,
      username: "support@example.com",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      targetProjectId: null,
      createMode: "issue",
      markSeen: true,
      password: "mailbox-secret",
    });
  });

  it("creates and toggles inbound email rules", async () => {
    mockCompaniesApi.listInboundEmailRules.mockResolvedValue({ items: [makeRule()], nextCursor: null });
    await renderPage();

    expect(container.textContent).toContain("client.com");
    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-rule-toggle-rule-1']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(mockCompaniesApi.saveInboundEmailRule).toHaveBeenCalledWith("company-1", "rule-1", { enabled: false });

    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-rule-new']") as HTMLButtonElement).click();
    });
    await flushReact();

    setInputValue(container.querySelector("[data-testid='company-settings-inbound-rule-sender']") as HTMLInputElement, "partner.com");
    setInputValue(container.querySelector("[data-testid='company-settings-inbound-rule-subject']") as HTMLInputElement, "escalation");
    setInputValue(container.querySelector("[data-testid='company-settings-inbound-rule-project']") as HTMLSelectElement, "project-1");
    setInputValue(container.querySelector("[data-testid='company-settings-inbound-rule-priority']") as HTMLSelectElement, "critical");
    await flushReact();

    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-rule-save']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(mockCompaniesApi.saveInboundEmailRule).toHaveBeenCalledWith("company-1", null, {
      mailboxId: null,
      enabled: true,
      senderPattern: "partner.com",
      subjectPattern: "escalation",
      targetProjectId: "project-1",
      createMode: "issue",
      priority: "critical",
      labelIds: [],
    });
  });

  it("edits an existing rule and omits createMode on PATCH", async () => {
    mockCompaniesApi.listInboundEmailRules.mockResolvedValue({ items: [makeRule()], nextCursor: null });
    await renderPage();

    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-rule-edit-rule-1']") as HTMLButtonElement).click();
    });
    await flushReact();

    setInputValue(container.querySelector("[data-testid='company-settings-inbound-rule-subject']") as HTMLInputElement, "very urgent");
    await flushReact();

    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-rule-save']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(mockCompaniesApi.saveInboundEmailRule).toHaveBeenCalledWith("company-1", "rule-1", {
      mailboxId: null,
      enabled: true,
      senderPattern: "client.com",
      subjectPattern: "very urgent",
      targetProjectId: "project-1",
      priority: "high",
      labelIds: ["label-1"],
    });
  });

  it("disables rule save when no match or routing fields are set", async () => {
    await renderPage();

    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-rule-new']") as HTMLButtonElement).click();
    });
    await flushReact();

    const saveButton = container.querySelector("[data-testid='company-settings-inbound-rule-save']") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(container.textContent).toContain("Set at least one match or routing option before saving.");

    setInputValue(container.querySelector("[data-testid='company-settings-inbound-rule-priority']") as HTMLSelectElement, "critical");
    await flushReact();
    expect((container.querySelector("[data-testid='company-settings-inbound-rule-save']") as HTMLButtonElement).disabled).toBe(true);

    setInputValue(container.querySelector("[data-testid='company-settings-inbound-rule-sender']") as HTMLInputElement, "x@y.com");
    await flushReact();
    expect((container.querySelector("[data-testid='company-settings-inbound-rule-save']") as HTMLButtonElement).disabled).toBe(false);
  });

  it("sets breadcrumbs for the email settings page", async () => {
    await renderPage();

    expect(mockSetBreadcrumbs).toHaveBeenCalledWith([
      { label: "Paperclip", href: "/dashboard" },
      { label: "Settings", href: "/company/settings" },
      { label: "Email" },
    ]);
  });
});
