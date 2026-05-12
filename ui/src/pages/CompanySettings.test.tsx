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
    emailTemplateBrandName: null,
    emailTemplateTagline: null,
    emailTemplateWebsiteUrl: null,
    emailTemplateFooterText: null,
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

  it("renders SMTP and email template settings sections", async () => {
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
    expect(container.querySelector("[data-testid='company-settings-email-template-section']")).not.toBeNull();
  });

  it("saves email template fields through the company update API", async () => {
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

    const brandInput = container.querySelector("[data-testid='company-settings-email-template-brand-name']") as HTMLInputElement;
    const taglineInput = container.querySelector("[data-testid='company-settings-email-template-tagline']") as HTMLInputElement;
    const websiteInput = container.querySelector("[data-testid='company-settings-email-template-website-url']") as HTMLInputElement;
    const footerInput = container.querySelector("[data-testid='company-settings-email-template-footer-text']") as HTMLInputElement;

    await act(async () => {
      setInputValue(brandInput, "Acme Ops");
      setInputValue(taglineInput, "Autonomous operations desk");
      setInputValue(websiteInput, "https://ops.example.com");
      setInputValue(footerInput, "Do not reply to this automated email.");
    });
    await flushReact();

    const saveButton = container.querySelector("[data-testid='company-settings-email-template-save']") as HTMLButtonElement;
    expect(saveButton).not.toBeNull();

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(mockCompaniesApi.update).toHaveBeenCalledWith("company-1", {
      emailTemplateBrandName: "Acme Ops",
      emailTemplateTagline: "Autonomous operations desk",
      emailTemplateWebsiteUrl: "https://ops.example.com",
      emailTemplateFooterText: "Do not reply to this automated email.",
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

    expect(container.textContent).toContain("Installed sandbox providers:");
    expect(container.textContent).toContain("Secure Sandbox");
    expect(container.textContent).toContain("These are not adapter types.");

    const editButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Edit");
    expect(editButton).toBeTruthy();

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

  it("shows a URL validation error and disables save when the website URL is invalid", async () => {
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

    const websiteInput = container.querySelector("[data-testid='company-settings-email-template-website-url']") as HTMLInputElement;

    await act(async () => {
      setInputValue(websiteInput, "not-a-url");
    });
    await flushReact();

    expect(container.textContent).toContain("Website URL must start with http:// or https://");
    const saveButton = container.querySelector("[data-testid='company-settings-email-template-save']") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
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
