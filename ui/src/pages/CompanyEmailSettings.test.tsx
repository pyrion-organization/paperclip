// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Company, InboundEmailMailbox, InboundEmailRule } from "@paperclipai/shared";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompanyEmailSettings } from "./CompanyEmailSettings";

const mockCompaniesApi = vi.hoisted(() => ({
  update: vi.fn(),
  testEmail: vi.fn(),
  listInboundEmailMailboxes: vi.fn(),
  saveInboundEmailMailbox: vi.fn(),
  testInboundEmailMailbox: vi.fn(),
  deleteInboundEmailMailbox: vi.fn(),
  pollInboundEmailMailbox: vi.fn(),
  listInboundEmailMessages: vi.fn(),
  listInboundEmailRules: vi.fn(),
  saveInboundEmailRule: vi.fn(),
  deleteInboundEmailRule: vi.fn(),
}));
const mockIssuesApi = vi.hoisted(() => ({ listLabels: vi.fn() }));
const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());
let selectedCompany: Company;

vi.mock("../api/companies", () => ({ companiesApi: mockCompaniesApi }));
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
    priority: "high",
    labelIds: ["label-1"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMailbox(overrides: Partial<InboundEmailMailbox> = {}): InboundEmailMailbox {
  return {
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
    supportRepliesEnabled: false,
    lastPollAt: null,
    lastSuccessAt: null,
    lastError: null,
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
      passwordSet: Boolean(payload.password),
      lastPollAt: null,
      lastSuccessAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...payload,
    }));
    mockCompaniesApi.testInboundEmailMailbox.mockResolvedValue({ ok: true });
    mockCompaniesApi.deleteInboundEmailMailbox.mockResolvedValue(undefined);
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
    mockCompaniesApi.deleteInboundEmailRule.mockResolvedValue(undefined);
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

    setInputValue(container.querySelector("[data-testid='company-settings-inbound-name']") as HTMLInputElement, "  Shared inbox  ");
    setInputValue(container.querySelector("[data-testid='company-settings-inbound-host']") as HTMLInputElement, "  imap.example.com  ");
    setInputValue(container.querySelector("[data-testid='company-settings-inbound-username']") as HTMLInputElement, "  support@example.com  ");
    setInputValue(container.querySelector("[data-testid='company-settings-inbound-password']") as HTMLInputElement, "mailbox-secret");
    setInputValue(container.querySelector("[data-testid='company-settings-inbound-folder']") as HTMLInputElement, "  INBOX  ");
    (container.querySelector("[data-testid='company-settings-inbound-support-replies']") as HTMLInputElement).click();
    await flushReact();

    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-save']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(mockCompaniesApi.saveInboundEmailMailbox).toHaveBeenCalledWith("company-1", null, {
      name: "Shared inbox",
      enabled: false,
      host: "imap.example.com",
      port: 993,
      username: "support@example.com",
      folder: "INBOX",
      tls: true,
      pollIntervalSeconds: 60,
      supportRepliesEnabled: true,
      password: "mailbox-secret",
    });
    expect((container.querySelector("[data-testid='company-settings-inbound-name']") as HTMLInputElement).value).toBe("Shared inbox");
    expect((container.querySelector("[data-testid='company-settings-inbound-host']") as HTMLInputElement).value).toBe("imap.example.com");
    expect((container.querySelector("[data-testid='company-settings-inbound-username']") as HTMLInputElement).value).toBe("support@example.com");
    expect((container.querySelector("[data-testid='company-settings-inbound-folder']") as HTMLInputElement).value).toBe("INBOX");
    expect((container.querySelector("[data-testid='company-settings-inbound-support-replies']") as HTMLInputElement).checked).toBe(true);
  });

  it("refreshes related inbound email caches after mailbox mutations", async () => {
    mockCompaniesApi.listInboundEmailMailboxes.mockResolvedValue({ items: [makeMailbox()], nextCursor: null });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await renderPage();

    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-poll']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(mockCompaniesApi.pollInboundEmailMailbox).toHaveBeenCalledWith("company-1", "mailbox-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "messages"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "jobs"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "ops"] });

    invalidateSpy.mockClear();
    setInputValue(container.querySelector("[data-testid='company-settings-inbound-name']") as HTMLInputElement, "Escalation inbox");
    await flushReact();
    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-save']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(mockCompaniesApi.saveInboundEmailMailbox).toHaveBeenCalledWith(
      "company-1",
      "mailbox-1",
      expect.objectContaining({ name: "Escalation inbox" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "mailboxes"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "ops"] });

    invalidateSpy.mockClear();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-delete']") as HTMLButtonElement).click();
    });
    await flushReact();
    confirmSpy.mockRestore();

    expect(mockCompaniesApi.deleteInboundEmailMailbox).toHaveBeenCalledWith("company-1", "mailbox-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "mailboxes"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "messages"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "jobs"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "ops"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["companies", "company-1", "inbound-email", "rules"] });
  });

  it("disables mailbox actions that the inbound email API would reject", async () => {
    mockCompaniesApi.listInboundEmailMailboxes.mockResolvedValue({
      items: [makeMailbox({ enabled: false, passwordSet: true })],
      nextCursor: null,
    });
    await renderPage();

    expect((container.querySelector("[data-testid='company-settings-inbound-test']") as HTMLButtonElement).disabled).toBe(false);
    expect((container.querySelector("[data-testid='company-settings-inbound-poll']") as HTMLButtonElement).disabled).toBe(true);

    mockCompaniesApi.listInboundEmailMailboxes.mockResolvedValue({
      items: [makeMailbox({ enabled: true, passwordSet: false })],
      nextCursor: null,
    });
    queryClient.invalidateQueries({ queryKey: ["companies", "company-1", "inbound-email", "mailboxes"] });
    await flushReact();

    expect((container.querySelector("[data-testid='company-settings-inbound-test']") as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector("[data-testid='company-settings-inbound-poll']") as HTMLButtonElement).disabled).toBe(true);
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
      priority: "critical",
      labelIds: [],
    });
  });

  it("deletes inbound email rules after confirmation", async () => {
    mockCompaniesApi.listInboundEmailRules.mockResolvedValue({ items: [makeRule()], nextCursor: null });
    await renderPage();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-rule-delete-rule-1']") as HTMLButtonElement).click();
    });
    await flushReact();
    confirmSpy.mockRestore();

    expect(mockCompaniesApi.deleteInboundEmailRule).toHaveBeenCalledWith("company-1", "rule-1");
  });

  it("edits an existing rule", async () => {
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
      priority: "high",
      labelIds: ["label-1"],
    });
  });

  it("disables rule save when the rule would not change processing", async () => {
    await renderPage();

    await act(async () => {
      (container.querySelector("[data-testid='company-settings-inbound-rule-new']") as HTMLButtonElement).click();
    });
    await flushReact();

    const saveButton = container.querySelector("[data-testid='company-settings-inbound-rule-save']") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(container.textContent).toContain("Choose a priority change or at least one label before saving.");

    setInputValue(container.querySelector("[data-testid='company-settings-inbound-rule-sender']") as HTMLInputElement, "x@y.com");
    await flushReact();
    expect((container.querySelector("[data-testid='company-settings-inbound-rule-save']") as HTMLButtonElement).disabled).toBe(true);

    setInputValue(container.querySelector("[data-testid='company-settings-inbound-rule-priority']") as HTMLSelectElement, "critical");
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
