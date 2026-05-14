// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Company } from "@paperclipai/shared";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompanySettings } from "./CompanySettings";

const mockCompaniesApi = vi.hoisted(() => ({
  update: vi.fn(),
  archive: vi.fn(),
  listInboundEmailMailboxes: vi.fn(),
  saveInboundEmailMailbox: vi.fn(),
  testInboundEmailMailbox: vi.fn(),
  pollInboundEmailMailbox: vi.fn(),
  listInboundEmailMessages: vi.fn(),
}));

const mockAccessApi = vi.hoisted(() => ({
  createOpenClawInvitePrompt: vi.fn(),
  getInviteOnboarding: vi.fn(),
}));

const mockAssetsApi = vi.hoisted(() => ({
  uploadCompanyLogo: vi.fn(),
}));

const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());
let selectedCompany: Company;

vi.mock("../api/companies", () => ({
  companiesApi: mockCompaniesApi,
}));

vi.mock("../api/access", () => ({
  accessApi: mockAccessApi,
}));

vi.mock("../api/assets", () => ({
  assetsApi: mockAssetsApi,
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mockSetBreadcrumbs }),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    companies: [selectedCompany],
    selectedCompany,
    selectedCompanyId: selectedCompany.id,
    setSelectedCompanyId: vi.fn(),
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

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("CompanySettings email settings", () => {
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
    mockCompaniesApi.listInboundEmailMailboxes.mockResolvedValue([]);
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
    mockCompaniesApi.listInboundEmailMessages.mockResolvedValue([]);
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

  it("renders SMTP and email signature settings sections", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <CompanySettings />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();

    expect(container.querySelector("[data-testid='company-settings-smtp-section']")).not.toBeNull();
    expect(container.querySelector("[data-testid='company-settings-inbound-email-section']")).not.toBeNull();
    expect(container.querySelector("[data-testid='company-settings-email-signature-section']")).not.toBeNull();
  });

  it("saves inbound mailbox settings through the inbound email API", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <CompanySettings />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();

    const hostInput = container.querySelector("[data-testid='company-settings-inbound-host']") as HTMLInputElement;
    const usernameInput = container.querySelector("[data-testid='company-settings-inbound-username']") as HTMLInputElement;
    const passwordInput = container.querySelector("[data-testid='company-settings-inbound-password']") as HTMLInputElement;
    await act(async () => {
      setInputValue(hostInput, "imap.example.com");
      setInputValue(usernameInput, "support@example.com");
      setInputValue(passwordInput, "mailbox-secret");
    });
    await flushReact();

    const saveButton = container.querySelector("[data-testid='company-settings-inbound-save']") as HTMLButtonElement;
    expect(saveButton).not.toBeNull();

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

  it("preserves existing inbound mailbox routing and configured password when saving", async () => {
    mockCompaniesApi.listInboundEmailMailboxes.mockResolvedValue([
      {
        id: "mailbox-1",
        companyId: "company-1",
        name: "Existing inbox",
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
        markSeen: false,
        lastPollAt: null,
        lastSuccessAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <CompanySettings />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();

    const nameInput = container.querySelector("[data-testid='company-settings-inbound-name']") as HTMLInputElement;
    const passwordInput = container.querySelector("[data-testid='company-settings-inbound-password']") as HTMLInputElement;
    await act(async () => {
      setInputValue(nameInput, "Updated inbox");
      setInputValue(passwordInput, "temporary-password");
      setInputValue(passwordInput, "");
    });
    await flushReact();

    const saveButton = container.querySelector("[data-testid='company-settings-inbound-save']") as HTMLButtonElement;
    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    const payload = mockCompaniesApi.saveInboundEmailMailbox.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(mockCompaniesApi.saveInboundEmailMailbox).toHaveBeenCalledWith("company-1", "mailbox-1", expect.any(Object));
    expect(payload).toMatchObject({
      name: "Updated inbox",
      targetProjectId: "project-1",
      createMode: "issue",
      markSeen: false,
    });
    expect(payload).not.toHaveProperty("password");
  });

  it("saves email signature HTML through the company update API", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <CompanySettings />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();

    const signatureInput = container.querySelector("[data-testid='company-settings-email-signature-html']") as HTMLTextAreaElement;

    await act(async () => {
      setTextareaValue(signatureInput, "<table><tr><td>Acme signature</td></tr></table>");
    });
    await flushReact();

    const saveButton = container.querySelector("[data-testid='company-settings-email-signature-save']") as HTMLButtonElement;
    expect(saveButton).not.toBeNull();

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.update).toHaveBeenCalledWith("company-1", {
      emailSignatureHtml: "<table><tr><td>Acme signature</td></tr></table>",
    });
  });

  it("saves SMTP credentials through the company update API", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <CompanySettings />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();

    const hostInput = container.querySelector("[data-testid='company-settings-smtp-host']") as HTMLInputElement;
    const portInput = container.querySelector("[data-testid='company-settings-smtp-port']") as HTMLInputElement;
    const fromInput = container.querySelector("[data-testid='company-settings-smtp-from']") as HTMLInputElement;
    const userInput = container.querySelector("[data-testid='company-settings-smtp-user']") as HTMLInputElement;

    await act(async () => {
      setInputValue(hostInput, "smtp.example.com");
      setInputValue(portInput, "587");
      setInputValue(fromInput, "noreply@example.com");
      setInputValue(userInput, "mailer");
    });
    await flushReact();

    const saveButton = container.querySelector("[data-testid='company-settings-smtp-save']") as HTMLButtonElement;
    expect(saveButton).not.toBeNull();

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.update).toHaveBeenCalledWith("company-1", {
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpUser: "mailer",
      smtpFrom: "noreply@example.com",
    });
  });

  it("omits smtpPassword from the payload when the password field has not been touched", async () => {
    selectedCompany = { ...makeCompany(), smtpHost: "smtp.example.com", smtpPasswordSet: true };

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <CompanySettings />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();

    const fromInput = container.querySelector("[data-testid='company-settings-smtp-from']") as HTMLInputElement;
    await act(async () => {
      setInputValue(fromInput, "noreply@example.com");
    });
    await flushReact();

    const saveButton = container.querySelector("[data-testid='company-settings-smtp-save']") as HTMLButtonElement;
    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    const payload = mockCompaniesApi.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("smtpPassword");
    expect(payload.smtpFrom).toBe("noreply@example.com");
  });

  it("includes smtpPassword in the payload when the password field has been touched", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <CompanySettings />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();

    const hostInput = container.querySelector("[data-testid='company-settings-smtp-host']") as HTMLInputElement;
    const passwordInput = container.querySelector("[data-testid='company-settings-smtp-password']") as HTMLInputElement;
    await act(async () => {
      setInputValue(hostInput, "smtp.example.com");
      setInputValue(passwordInput, "fresh-pass");
    });
    await flushReact();

    const saveButton = container.querySelector("[data-testid='company-settings-smtp-save']") as HTMLButtonElement;
    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    const payload = mockCompaniesApi.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.smtpPassword).toBe("fresh-pass");
  });
});
