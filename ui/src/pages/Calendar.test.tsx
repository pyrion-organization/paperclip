// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarDashboard, CalendarItem, CalendarItemDetail } from "@paperclipai/shared";
import { Calendar, requiresActivePayablePaymentDetails, requiresGovernedSaveApproval } from "./Calendar";

const mockCalendarApi = vi.hoisted(() => ({
  dashboard: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  complete: vi.fn(),
  pause: vi.fn(),
  activate: vi.fn(),
  archive: vi.fn(),
  cancel: vi.fn(),
  addDocument: vi.fn(),
}));
const mockClientsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockProjectsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockPaymentsApi = vi.hoisted(() => ({ profiles: vi.fn() }));
const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());

vi.mock("../api/calendar", () => ({ calendarApi: mockCalendarApi }));
vi.mock("../api/clients", () => ({ clientsApi: mockClientsApi }));
vi.mock("../api/projects", () => ({ projectsApi: mockProjectsApi }));
vi.mock("../api/payments", () => ({ paymentsApi: mockPaymentsApi }));
vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mockSetBreadcrumbs }),
}));
vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));

function makeItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "item-1",
    companyId: "company-1",
    title: "Domain renewal",
    description: null,
    category: "domain",
    status: "active",
    riskLevel: "critical",
    priority: "high",
    providerName: "RegistrarCo",
    relatedClientId: null,
    relatedProjectId: null,
    dueDate: null,
    dueTime: null,
    timezone: "America/Sao_Paulo",
    recurrenceType: "yearly",
    recurrenceRule: null,
    nextDueDate: "2026-06-30",
    amountCents: 12000,
    currency: "BRL",
    paymentProfileId: null,
    autoRenew: true,
    manualActionRequired: true,
    paymentMethodLabel: "Company card",
    paymentOwner: null,
    costCenter: "Ops",
    purchaseEmail: "owner@example.com",
    accountLoginEmail: "login@example.com",
    billingEmail: "billing@example.com",
    recoveryEmail: null,
    technicalContactEmail: null,
    serviceUrl: "https://example.com",
    loginUrl: null,
    billingUrl: null,
    documentationUrl: null,
    sourceKind: "manual",
    sourceEmailMessageId: null,
    confidenceScore: null,
    metadata: null,
    notes: "Primary domain",
    internalNotes: null,
    createdByAgentId: null,
    createdByUserId: null,
    updatedByAgentId: null,
    updatedByUserId: null,
    lastCheckedAt: null,
    lastReminderScannedAt: null,
    lastDetailsScannedAt: null,
    lastCompletedAt: null,
    reminderPolicy: {
      daysBefore: [90, 60, 30, 15, 7, 1],
      createsIssue: true,
      sendsEmail: true,
      overdueCreatesIssue: true,
      overdueSendsEmail: true,
      summary: "90/60/30/15/7/1 days before due; creates issue; sends email. Overdue items create an issue and email.",
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeDetail(item: CalendarItem, overrides: Partial<CalendarItemDetail> = {}): CalendarItemDetail {
  return { ...item, documents: [], activity: [], ...overrides };
}

function makeDashboard(items: CalendarItem[]): CalendarDashboard {
  const missingDetails = [
    {
      itemId: items[0]!.id,
      title: items[0]!.title,
      category: items[0]!.category,
      riskLevel: items[0]!.riskLevel,
      severity: "high" as const,
      missingFields: ["registrar", "domain/service URL"],
      message: "Domain renewal is missing registrar, domain/service URL",
    },
  ];
  return {
    companyId: "company-1",
    generatedAt: "2026-05-26T00:00:00.000Z",
    overdue: { label: "Overdue", items: [], count: 1 },
    dueToday: { label: "Due today", items: [], count: 2 },
    dueIn7Days: { label: "Due in 7 days", items: [], count: 3 },
    dueIn30Days: { label: "Due in 30 days", items, count: items.length },
    criticalItems: { label: "Critical items", items: items.filter((item) => item.riskLevel === "critical"), count: 1 },
    pendingReview: { label: "Pending review", items: [], count: 0 },
    missingDetails,
    reminderStatus: {
      lastScanAt: "2026-05-26T12:00:00.000Z",
      scannedItems: 4,
      createdIssues: 1,
      updatedIssues: 2,
      queuedEmails: 3,
      skippedEmails: 1,
      pendingEmails: 2,
      sentEmails: 5,
      failedEmails: 0,
      skippedDeliveryEmails: 0,
      latestEmailFailureAt: null,
      latestEmailFailureError: null,
      failedEmailDetails: [],
    },
    recentlyCompleted: { label: "Recently completed", items: [], count: 0 },
    costSummary: {
      monthlyRecurringCents: 0,
      annualRenewalCents: 12000,
      upcoming30DaysCents: 12000,
      currency: "BRL",
    },
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function flushDebouncedSearch() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 300));
  });
  await flushReact();
}

function itemMatchesQuery(item: CalendarItem, q: string | undefined) {
  if (!q?.trim()) return true;
  const haystack = [
    item.title,
    item.providerName,
    item.category,
    item.riskLevel,
    item.nextDueDate,
    item.paymentMethodLabel,
    item.purchaseEmail,
    item.accountLoginEmail,
    item.billingEmail,
    item.notes,
  ].filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((token) => {
    if (token === "missing") return item.id === "item-1";
    if (token.startsWith("category:")) return item.category.includes(token.slice("category:".length));
    if (token.startsWith("risk:")) return item.riskLevel.includes(token.slice("risk:".length));
    if (token.startsWith("email:")) return [
      item.purchaseEmail,
      item.accountLoginEmail,
      item.billingEmail,
      item.recoveryEmail,
      item.technicalContactEmail,
    ].some((email) => (email ?? "").toLowerCase().includes(token.slice("email:".length)));
    return haystack.includes(token);
  });
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Calendar", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;
  let items: CalendarItem[];

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    items = [
      makeItem(),
      makeItem({
        id: "item-2",
        title: "SaaS renewal",
        category: "software_subscription",
        riskLevel: "medium",
        providerName: "SaaSBox",
        nextDueDate: "2026-07-15",
        amountCents: 4900,
        autoRenew: false,
        paymentMethodLabel: "Invoice",
        purchaseEmail: "ops@example.com",
        accountLoginEmail: null,
        billingEmail: "ap@example.com",
        notes: "Team license",
      }),
    ];
    mockCalendarApi.dashboard.mockImplementation(async () => makeDashboard(items));
    mockCalendarApi.list.mockImplementation(async (_companyId: string, filters?: { q?: string }) => {
      const filtered = items.filter((candidate) => itemMatchesQuery(candidate, filters?.q));
      return { items: filtered, total: filtered.length };
    });
    mockCalendarApi.detail.mockImplementation(async (_companyId: string, itemId: string) => {
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error("missing item");
      return makeDetail(item);
    });
    mockCalendarApi.create.mockImplementation(async (_companyId: string, payload: Partial<CalendarItem>) => makeItem({
      id: "created-item",
      title: String(payload.title),
      category: payload.category as CalendarItem["category"],
      riskLevel: payload.riskLevel as CalendarItem["riskLevel"],
    }));
    mockClientsApi.list.mockResolvedValue({ data: [] });
    mockProjectsApi.list.mockResolvedValue([]);
    mockPaymentsApi.profiles.mockResolvedValue([]);
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
          <Calendar />
        </QueryClientProvider>,
      );
    });
    await flushReact();
  }

  it("requires governed save approval for payment profile changes", () => {
    expect(requiresGovernedSaveApproval(makeItem({ paymentProfileId: null }), {
      title: "Domain renewal",
      category: "domain",
      paymentProfileId: "11111111-1111-4111-8111-111111111111",
    })).toBe(true);
  });

  it("only requires payment details for active payable items", () => {
    expect(requiresActivePayablePaymentDetails({
      category: "payment_payable",
      status: "pending_review",
      paymentProfileId: null,
      amountCents: null,
      nextDueDate: null,
    })).toBe(false);
    expect(requiresActivePayablePaymentDetails({
      category: "payment_payable",
      status: "active",
      paymentProfileId: null,
      amountCents: null,
      nextDueDate: null,
    })).toBe(true);
  });

  it("opens the create dialog from New Item", async () => {
    await renderPage();

    await act(async () => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(document.body.textContent).toContain("New Item");
    expect(document.body.textContent).toContain("Create");
    expect(document.body.textContent).toContain("Sao Paulo");

    await act(async () => {
      (document.body.querySelector("[data-testid='calendar-tab-payment']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect((document.body.querySelector("input[value='BRL']") as HTMLInputElement | null)).not.toBeNull();
  });

  it("keeps new item field edits local and visible across tabs", async () => {
    await renderPage();

    await act(async () => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });
    await flushReact();

    const dialog = document.body.querySelector("[data-testid='calendar-item-dialog']") as HTMLElement;
    const title = dialog.querySelector("input") as HTMLInputElement;
    const description = dialog.querySelector("textarea") as HTMLTextAreaElement;
    const dueDate = dialog.querySelector("input[type='date']") as HTMLInputElement;

    await act(async () => {
      setInputValue(title, "SSL certificate renewal");
      setInputValue(description, "Renew before production cert expires");
      setInputValue(dueDate, "2026-08-01");
    });
    await flushReact();

    expect(title.value).toBe("SSL certificate renewal");
    expect(description.value).toBe("Renew before production cert expires");
    expect(dueDate.value).toBe("2026-08-01");

    await act(async () => {
      (document.body.querySelector("[data-testid='calendar-tab-payment']") as HTMLButtonElement).click();
    });
    await flushReact();

    await act(async () => {
      (document.body.querySelector("[data-testid='calendar-tab-overview']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(title.value).toBe("SSL certificate renewal");
    expect(description.value).toBe("Renew before production cert expires");
    expect(dueDate.value).toBe("2026-08-01");
  });

  it("opens the edit dialog from row click and keyboard activation", async () => {
    await renderPage();

    await act(async () => {
      (container.querySelector("[data-testid='calendar-item-row-item-1']") as HTMLTableRowElement).click();
    });
    await flushReact();

    expect(document.body.textContent).toContain("Item Detail");
    expect((document.body.querySelector("input[value='Domain renewal']") as HTMLInputElement | null)).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await flushReact();

    await act(async () => {
      (container.querySelector("[data-testid='calendar-item-row-item-2']") as HTMLTableRowElement)
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flushReact();

    expect(document.body.textContent).toContain("SaaS renewal");
  });

  it("refreshes the open dialog form from completed recurring item responses", async () => {
    const completed = makeItem({
      ...items[1]!,
      status: "active",
      nextDueDate: "2027-07-15",
      updatedAt: "2026-06-01T00:00:00.000Z",
      lastCompletedAt: "2026-06-01T00:00:00.000Z",
    });
    mockCalendarApi.complete.mockImplementationOnce(async () => {
      items = items.map((item) => item.id === completed.id ? completed : item);
      return completed;
    });

    await renderPage();

    await act(async () => {
      (container.querySelector("[data-testid='calendar-item-row-item-2']") as HTMLTableRowElement).click();
    });
    await flushReact();

    const dueDate = () => document.body.querySelector("input[type='date']") as HTMLInputElement;
    expect(dueDate().value).toBe("2026-07-15");

    const completeButton = Array.from(document.body.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Complete")) as HTMLButtonElement;
    expect(completeButton).toBeTruthy();

    await act(async () => {
      completeButton.click();
    });
    await flushReact();

    expect(mockCalendarApi.complete).toHaveBeenCalledWith("company-1", "item-2", {}, false);
    expect(dueDate().value).toBe("2027-07-15");
  });

  it("filters rows through one smart search box", async () => {
    await renderPage();

    const search = container.querySelector("input[placeholder='Search calendar items']") as HTMLInputElement;
    await act(async () => {
      setInputValue(search, "SaaSBox ap@example.com invoice 2026-07 medium");
    });
    await flushDebouncedSearch();

    expect(container.querySelector("[data-testid='calendar-item-row-item-2']")).not.toBeNull();
    expect(container.querySelector("[data-testid='calendar-item-row-item-1']")).toBeNull();
    expect(mockCalendarApi.list).toHaveBeenLastCalledWith("company-1", expect.objectContaining({
      q: "SaaSBox ap@example.com invoice 2026-07 medium",
    }));
  });

  it("supports smart filter tokens in the single search box", async () => {
    await renderPage();

    const search = container.querySelector("input[placeholder='Search calendar items']") as HTMLInputElement;
    await act(async () => {
      setInputValue(search, "missing critical domain");
    });
    await flushDebouncedSearch();

    expect(container.querySelector("[data-testid='calendar-item-row-item-1']")).not.toBeNull();
    expect(container.querySelector("[data-testid='calendar-item-row-item-2']")).toBeNull();

    await act(async () => {
      setInputValue(search, "category:software risk:medium email:ap@example.com");
    });
    await flushDebouncedSearch();

    expect(container.querySelector("[data-testid='calendar-item-row-item-2']")).not.toBeNull();
    expect(container.querySelector("[data-testid='calendar-item-row-item-1']")).toBeNull();
  });

  it("shows automatic missing details UI without manual scan controls", async () => {
    await renderPage();

    expect(document.body.textContent).not.toContain("Reminder Scan");
    expect(document.body.textContent).not.toContain("Metadata Scan");
    expect(document.body.textContent).toContain("Automatic reminders");
    expect(document.body.textContent).toContain("Backend controlled");
    expect(document.body.textContent).toContain("2 pending, 5 sent");
    expect(document.body.textContent).toContain("Missing Details");
    expect(document.body.textContent).toContain("Details");
    expect(container.querySelector("[data-testid='calendar-item-missing-details-item-1']")).not.toBeNull();
  });

  it("surfaces reminder email failures", async () => {
    mockCalendarApi.dashboard.mockImplementation(async () => ({
      ...makeDashboard(items),
      reminderStatus: {
        ...makeDashboard(items).reminderStatus,
        failedEmails: 2,
        latestEmailFailureAt: "2026-05-26T13:00:00.000Z",
        latestEmailFailureError: "SMTP rejected message",
        failedEmailDetails: [{
          id: "email-1",
          calendarItemId: "item-1",
          title: "Domain renewal",
          recipientEmail: "ops@example.com",
          dueDate: "2026-06-30",
          failedAt: "2026-05-26T13:00:00.000Z",
          attempts: 3,
          lastError: "SMTP rejected message",
        }],
      },
    }));

    await renderPage();

    expect(document.body.textContent).toContain("Email attention needed");
    expect(document.body.textContent).toContain("Failures");
    expect(document.body.textContent).toContain("2");

    await act(async () => {
      (document.body.querySelector("button.text-destructive") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(document.body.textContent).toContain("Failed reminder emails");
    expect(document.body.textContent).toContain("ops@example.com");
    expect(document.body.textContent).toContain("SMTP rejected message");
  });

  it("opens an item from a missing details card", async () => {
    await renderPage();

    await act(async () => {
      (container.querySelector("[data-testid='calendar-missing-details-item-1']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(document.body.textContent).toContain("Item Detail");
    expect(document.body.textContent).toContain("Domain renewal");
  });

  it("opens a missing details item even when it is not in the current list", async () => {
    const hiddenItem = makeItem({ id: "stale-item", title: "Hidden renewal", providerName: "HiddenCo" });
    mockCalendarApi.dashboard.mockImplementation(async () => makeDashboard([hiddenItem]));
    mockCalendarApi.detail.mockImplementation(async (_companyId: string, itemId: string) => {
      if (itemId !== hiddenItem.id) throw new Error("missing item");
      return makeDetail(hiddenItem);
    });

    await renderPage();

    await act(async () => {
      (container.querySelector("[data-testid='calendar-missing-details-stale-item']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(mockCalendarApi.detail).toHaveBeenCalledWith("company-1", "stale-item");
    expect(document.body.textContent).toContain("Item Detail");
    expect(document.body.textContent).toContain("Hidden renewal");
    expect((document.body.querySelector("input[value='Hidden renewal']") as HTMLInputElement | null)).not.toBeNull();
  });

  it("organizes item editing into tabs", async () => {
    await renderPage();

    expect(container.firstElementChild?.className).toContain("overflow-y-auto");

    await act(async () => {
      (container.querySelector("[data-testid='calendar-item-row-item-1']") as HTMLTableRowElement).click();
    });
    await flushReact();

    const dialog = document.body.querySelector("[data-testid='calendar-item-dialog']") as HTMLElement;
    expect(dialog.className).toContain("h-[calc(100dvh-2rem)]");
    expect(dialog.className).toContain("overflow-hidden");
    expect(document.body.textContent).toContain("Overview");
    expect(document.body.textContent).toContain("Payment");
    expect(document.body.textContent).toContain("Contacts");
    expect(document.body.textContent).toContain("Links");
    expect(document.body.textContent).toContain("Notes");
    expect(document.body.textContent).toContain("Documents");
    expect(document.body.textContent).toContain("History");
    expect(document.body.textContent).toContain("Next occurrence");
    expect(document.body.textContent).toContain("Completing advances to 2027-06-30");
    expect(document.body.textContent).toContain("Reminder policy");
    expect(document.body.textContent).toContain("90/60/30/15/7/1 days before due");

    await act(async () => {
      (document.body.querySelector("[data-testid='calendar-tab-payment']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(dialog.className).toContain("h-[calc(100dvh-2rem)]");
    expect(document.body.textContent).toContain("Payment Profile");
    expect(document.body.textContent).toContain("Cost Center");
  });

  it("preserves document and history access in the item dialog", async () => {
    const detail = makeDetail(items[0]!, {
      documents: [{
        id: "doc-link-1",
        companyId: "company-1",
        calendarItemId: "item-1",
        documentType: "invoice",
        documentId: null,
        assetId: null,
        sourceEmailMessageId: null,
        sourceEmailAttachmentId: null,
        title: "Renewal invoice",
        url: "https://example.com/invoice.pdf",
        notes: "Proof of renewal",
        metadata: null,
        createdByAgentId: null,
        createdByUserId: "user-1",
        createdAt: "2026-05-26T10:00:00.000Z",
        updatedAt: "2026-05-26T10:00:00.000Z",
      }],
      activity: [{
        id: "activity-1",
        companyId: "company-1",
        actorType: "user",
        actorId: "user-1",
        action: "calendar_item.document_attached",
        entityType: "calendar_item",
        entityId: "item-1",
        agentId: null,
        runId: null,
        details: null,
        createdAt: "2026-05-26T10:05:00.000Z",
      }],
    });
    mockCalendarApi.detail.mockResolvedValueOnce(detail);

    await renderPage();

    await act(async () => {
      (container.querySelector("[data-testid='calendar-item-row-item-1']") as HTMLTableRowElement).click();
    });
    await flushReact();

    await act(async () => {
      (document.body.querySelector("[data-testid='calendar-tab-documents']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(document.body.textContent).toContain("Renewal invoice");
    expect(document.body.textContent).toContain("Proof of renewal");

    await act(async () => {
      (document.body.querySelector("[data-testid='calendar-tab-history']") as HTMLButtonElement).click();
    });
    await flushReact();

    expect(document.body.textContent).toContain("Document Attached");
    expect(document.body.textContent).toContain("User - user-1");
  });
});
