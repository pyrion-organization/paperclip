import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  activityLog,
  assets,
  authUsers,
  calendarItemDocuments,
  calendarItems,
  clients,
  companies,
  companyMemberships,
  documents,
  emailNotifications,
  inboundEmailAttachments,
  inboundEmailMessages,
  issues,
  paymentProfiles,
  projects,
} from "@paperclipai/db";
import {
  CALENDAR_EMAIL_NOTIFICATION_KIND,
  CALENDAR_EMAIL_PROPOSAL_ISSUE_ORIGIN_KIND,
  CALENDAR_MISSING_DETAILS_ISSUE_ORIGIN_KIND,
  CALENDAR_ITEM_CATEGORIES,
  CALENDAR_ITEM_STATUSES,
  CALENDAR_RECURRENCE_TYPES,
  CALENDAR_RISK_LEVELS,
  CALENDAR_REMINDER_ISSUE_ORIGIN_KIND,
  type CalendarItemCategory,
  type CalendarRiskLevel,
  type CalendarSourceKind,
  type CreateCalendarItem,
  type CreateCalendarItemDocument,
  type UpdateCalendarItem,
} from "@paperclipai/shared";
import { badRequest, notFound, unprocessable } from "../errors.js";
import { logActivity, type LogActivityInput } from "./activity-log.js";
import { issueService } from "./issues.js";
import { paymentService } from "./payments.js";

type Actor = {
  actorType: LogActivityInput["actorType"];
  actorId: string;
  agentId?: string | null;
  userId?: string | null;
  runId?: string | null;
};

type CalendarItemRow = typeof calendarItems.$inferSelect;
type CalendarDocumentRow = typeof calendarItemDocuments.$inferSelect;
type CalendarScanOptions = {
  now?: Date;
  recipientEmail?: string | null;
  recipientEmails?: string[] | null;
  sendEmail?: boolean;
  createIssues?: boolean;
  actor?: Actor;
};

const OPEN_ISSUE_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked"];
const TERMINAL_CALENDAR_STATUSES = ["cancelled", "archived"];
const DASHBOARD_ACTIVE_STATUSES = ["active", "overdue"];
const GOVERNED_CATEGORIES = new Set(["fiscal", "legal", "domain", "certificate", "hosting"]);
const HIGH_RISK = new Set(["high", "critical"]);
const LOW_CONFIDENCE_THRESHOLD = 80;

const REMINDER_DEFAULTS: Array<{
  category?: CalendarItemCategory;
  riskLevel?: CalendarRiskLevel;
  daysBefore: number[];
  createIssue: boolean;
  sendEmail: boolean;
}> = [
  { category: "domain", riskLevel: "critical", daysBefore: [90, 60, 30, 15, 7, 1], createIssue: true, sendEmail: true },
  { category: "hosting", riskLevel: "critical", daysBefore: [30, 15, 7, 3, 1], createIssue: true, sendEmail: true },
  { category: "fiscal", riskLevel: "high", daysBefore: [15, 7, 3, 1], createIssue: true, sendEmail: true },
  { category: "certificate", riskLevel: "high", daysBefore: [60, 30, 15, 7, 1], createIssue: true, sendEmail: true },
  { category: "api_token", daysBefore: [30, 14, 7, 3, 1], createIssue: true, sendEmail: true },
  { category: "software_subscription", daysBefore: [7, 3, 1], createIssue: false, sendEmail: true },
  { category: "contract", daysBefore: [60, 30, 15, 7], createIssue: true, sendEmail: true },
  { category: "payment_receivable", daysBefore: [7, 3, 1], createIssue: true, sendEmail: true },
  { category: "payment_payable", daysBefore: [7, 3, 1], createIssue: true, sendEmail: true },
];

const CALENDAR_CATEGORY_SET = new Set<string>(CALENDAR_ITEM_CATEGORIES);
const CALENDAR_STATUS_SET = new Set<string>(CALENDAR_ITEM_STATUSES);
const CALENDAR_RISK_SET = new Set<string>(CALENDAR_RISK_LEVELS);
const CALENDAR_RECURRENCE_SET = new Set<string>(CALENDAR_RECURRENCE_TYPES);

function dateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function parseDateOnly(value: string | Date | null | undefined): Date | null {
  const text = dateOnly(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function daysBetween(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function compactToken(value: string) {
  return value.toLowerCase().replace(/[_\s-]+/g, "");
}

function tokenizeSearch(query: string | null | undefined) {
  return (query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function calendarItemSearchText(item: CalendarItemRow) {
  return [
    item.title,
    item.description,
    item.notes,
    item.internalNotes,
    item.category,
    item.status,
    item.riskLevel,
    item.providerName,
    dateOnly(item.nextDueDate),
    item.dueTime,
    item.timezone,
    item.amountCents == null ? null : String(item.amountCents / 100),
    item.currency,
    item.autoRenew ? "auto renew autorenew" : "manual renew",
    item.manualActionRequired ? "manual action" : "automatic",
    item.paymentMethodLabel,
    item.paymentOwner,
    item.costCenter,
    item.purchaseEmail,
    item.accountLoginEmail,
    item.billingEmail,
    item.recoveryEmail,
    item.technicalContactEmail,
    item.serviceUrl,
    item.loginUrl,
    item.billingUrl,
    item.documentationUrl,
  ].filter(Boolean).join(" ").toLowerCase();
}

function calendarItemDaysUntilDue(item: CalendarItemRow, now: Date) {
  const due = parseDateOnly(item.nextDueDate);
  return due ? daysBetween(now, due) : null;
}

function matchesCalendarSearchToken(item: CalendarItemRow, rawToken: string, now: Date) {
  const token = rawToken.trim().toLowerCase();
  if (!token) return true;
  const [prefix, ...rest] = token.split(":");
  const prefixedValue = rest.join(":").trim();
  const dueDiff = calendarItemDaysUntilDue(item, now);
  const withinDays = (days: number) => dueDiff != null && dueDiff >= 0 && dueDiff <= days;
  const compactValue = prefixedValue ? compactToken(prefixedValue) : "";

  if (prefixedValue) {
    if (prefix === "status") return compactToken(item.status).includes(compactValue);
    if (prefix === "risk") return compactToken(item.riskLevel).includes(compactValue);
    if (prefix === "category") return compactToken(item.category).includes(compactValue);
    if (prefix === "provider") return compactToken(item.providerName ?? "").includes(compactValue);
    if (prefix === "email") {
      return [
        item.purchaseEmail,
        item.accountLoginEmail,
        item.billingEmail,
        item.recoveryEmail,
        item.technicalContactEmail,
      ].some((email) => compactToken(email ?? "").includes(compactValue));
    }
    if (prefix === "due") {
      if (compactValue === "overdue") return dueDiff != null && dueDiff < 0;
      if (compactValue === "today") return dueDiff === 0;
      if (compactValue === "7d" || compactValue === "7days") return withinDays(7);
      if (compactValue === "30d" || compactValue === "30days") return withinDays(30);
      return compactToken(dateOnly(item.nextDueDate) ?? "").includes(compactValue);
    }
  }

  const compact = compactToken(token);
  if (token === "overdue") return item.status === "overdue" || (dueDiff != null && dueDiff < 0);
  if (token === "today") return dueDiff === 0;
  if (token === "7d" || token === "7days") return withinDays(7);
  if (token === "30d" || token === "30days") return withinDays(30);
  if (CALENDAR_RISK_SET.has(token)) return item.riskLevel === token;
  if (token === "review") return item.status === "pending_review";
  if (token === "missing") return missingDetailsForItem(item) !== null;
  if (token === "autorenew" || token === "auto-renew") return item.autoRenew;
  if (token === "manual") return item.manualActionRequired;
  if (CALENDAR_CATEGORY_SET.has(token)) return item.category === token;
  if (token === "software") return item.category === "software_subscription";
  if (CALENDAR_STATUS_SET.has(token)) return item.status === token;
  if (CALENDAR_RECURRENCE_SET.has(token)) return item.recurrenceType === token;
  const searchText = calendarItemSearchText(item);
  return searchText.includes(token) || compactToken(searchText).includes(compact);
}

function calendarItemMatchesSearch(item: CalendarItemRow, query: string | null | undefined, now: Date) {
  const tokens = tokenizeSearch(query);
  return tokens.length === 0 || tokens.every((token) => matchesCalendarSearchToken(item, token, now));
}

function currentWeekKey(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value || Object.keys(value).length === 0) return null;
  return value;
}

function mergeMetadata(
  value: Record<string, unknown> | null | undefined,
  extra: Record<string, unknown>,
) {
  return normalizeMetadata({ ...(value ?? {}), ...extra });
}

function assertTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw unprocessable(`Invalid timezone: ${timeZone}`);
  }
}

function advanceByRRule(anchor: Date, rule: string | null | undefined): string | null {
  if (!rule) return null;
  const parts = new Map(
    rule
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, value] = part.split("=");
        return [key?.toUpperCase() ?? "", value ?? ""] as const;
      }),
  );
  const freq = parts.get("FREQ")?.toUpperCase();
  const interval = Math.max(1, Number.parseInt(parts.get("INTERVAL") ?? "1", 10) || 1);
  if (freq === "DAILY") {
    const next = new Date(anchor);
    next.setUTCDate(next.getUTCDate() + interval);
    return formatDateOnly(next);
  }
  if (freq === "WEEKLY") {
    const next = new Date(anchor);
    next.setUTCDate(next.getUTCDate() + interval * 7);
    return formatDateOnly(next);
  }
  if (freq === "MONTHLY") {
    const next = addMonths(anchor, interval);
    const byMonthDay = Number.parseInt(parts.get("BYMONTHDAY") ?? "", 10);
    if (Number.isFinite(byMonthDay) && byMonthDay >= 1 && byMonthDay <= 31) {
      const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(byMonthDay, lastDay));
    }
    return formatDateOnly(next);
  }
  if (freq === "YEARLY") return formatDateOnly(addMonths(anchor, interval * 12));
  return null;
}

export function calculateNextDueDate(item: Pick<CalendarItemRow, "nextDueDate" | "dueDate" | "recurrenceType" | "recurrenceRule">): string | null {
  const anchor = parseDateOnly(item.nextDueDate ?? item.dueDate);
  if (!anchor) return null;
  switch (item.recurrenceType) {
    case "monthly":
      return formatDateOnly(addMonths(anchor, 1));
    case "quarterly":
      return formatDateOnly(addMonths(anchor, 3));
    case "semiannual":
      return formatDateOnly(addMonths(anchor, 6));
    case "yearly":
      return formatDateOnly(addMonths(anchor, 12));
    case "custom_rrule":
      return advanceByRRule(anchor, item.recurrenceRule);
    case "none":
    case "manual":
    default:
      return null;
  }
}

function rowToItem<T extends CalendarItemRow>(row: T) {
  return {
    ...row,
    dueDate: dateOnly(row.dueDate),
    nextDueDate: dateOnly(row.nextDueDate),
    metadata: normalizeMetadata(row.metadata),
    reminderPolicy: reminderPolicyFor(row),
  };
}

function rowToDocument<T extends CalendarDocumentRow>(row: T) {
  return {
    ...row,
    metadata: normalizeMetadata(row.metadata),
  };
}

function changedKeys(input: Record<string, unknown>) {
  return Object.keys(input).filter((key) => input[key] !== undefined);
}

function requiresApprovalForPatch(existing: CalendarItemRow, patch: UpdateCalendarItem): string | null {
  if (patch.status === "cancelled" && existing.status !== "cancelled") return "Cancelling an obligation requires approval";
  if (patch.nextDueDate !== undefined && patch.nextDueDate !== dateOnly(existing.nextDueDate) && (
    GOVERNED_CATEGORIES.has(existing.category) || HIGH_RISK.has(existing.riskLevel)
  )) {
    return "Changing the due date of governed or high-risk items requires approval";
  }
  if (patch.dueDate !== undefined && patch.dueDate !== dateOnly(existing.dueDate) && (
    GOVERNED_CATEGORIES.has(existing.category) || HIGH_RISK.has(existing.riskLevel)
  )) {
    return "Changing the due date of governed or high-risk items requires approval";
  }
  if (patch.accountLoginEmail !== undefined && patch.accountLoginEmail !== existing.accountLoginEmail) return "Changing login email requires approval";
  if (patch.recoveryEmail !== undefined && patch.recoveryEmail !== existing.recoveryEmail) return "Changing recovery email requires approval";
  if (patch.billingEmail !== undefined && patch.billingEmail !== existing.billingEmail) return "Changing billing email requires approval";
  if (patch.paymentMethodLabel !== undefined && patch.paymentMethodLabel !== existing.paymentMethodLabel) return "Changing payment method requires approval";
  return null;
}

function normalizeCreateInput(input: CreateCalendarItem, actor?: Actor): Omit<typeof calendarItems.$inferInsert, "companyId"> {
  const nextDueDate = input.nextDueDate ?? input.dueDate ?? null;
  return {
    ...input,
    nextDueDate,
    metadata: normalizeMetadata(input.metadata),
    createdByAgentId: actor?.agentId ?? null,
    createdByUserId: actor?.userId ?? null,
    updatedByAgentId: actor?.agentId ?? null,
    updatedByUserId: actor?.userId ?? null,
  };
}

function normalizePatchInput(input: UpdateCalendarItem, actor?: Actor): Partial<typeof calendarItems.$inferInsert> {
  const patch: Partial<typeof calendarItems.$inferInsert> = {
    ...input,
    metadata: input.metadata === undefined ? undefined : normalizeMetadata(input.metadata),
    updatedByAgentId: actor?.agentId ?? null,
    updatedByUserId: actor?.userId ?? null,
    updatedAt: new Date(),
  };
  if (input.dueDate && input.nextDueDate === undefined) {
    patch.nextDueDate = input.dueDate;
  }
  return patch;
}

function reminderDefaultsFor(item: CalendarItemRow, daysUntilDue: number) {
  return REMINDER_DEFAULTS.filter((rule) => {
    if (rule.category && rule.category !== item.category) return false;
    if (rule.riskLevel && rule.riskLevel !== item.riskLevel) return false;
    return rule.daysBefore.includes(daysUntilDue);
  });
}

function reminderPolicyFor(item: CalendarItemRow) {
  const matching = REMINDER_DEFAULTS.filter((rule) => {
    if (rule.category && rule.category !== item.category) return false;
    if (rule.riskLevel && rule.riskLevel !== item.riskLevel) return false;
    return true;
  });
  const daysBefore = [...new Set(matching.flatMap((rule) => rule.daysBefore))].sort((a, b) => b - a);
  const createsIssue = matching.some((rule) => rule.createIssue);
  const sendsEmail = matching.some((rule) => rule.sendEmail);
  const summary = daysBefore.length === 0
    ? "No scheduled pre-due reminders. Overdue items still create an issue and email."
    : `${daysBefore.join("/")} days before due; ${createsIssue ? "creates issue" : "email only"}; ${sendsEmail ? "sends email" : "no email"}. Overdue items create an issue and email.`;
  return {
    daysBefore,
    createsIssue,
    sendsEmail,
    overdueCreatesIssue: true,
    overdueSendsEmail: true,
    summary,
  };
}

function issuePriorityForRisk(risk: string): "critical" | "high" | "medium" | "low" {
  if (risk === "critical") return "critical";
  if (risk === "high") return "high";
  if (risk === "low") return "low";
  return "medium";
}

function formatMoney(cents: number | null, currency: string) {
  if (cents == null) return null;
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function reminderIssueDescription(item: CalendarItemRow, daysUntilDue: number): string {
  const amount = formatMoney(item.amountCents, item.currency);
  const due = dateOnly(item.nextDueDate) ?? "unknown";
  return [
    daysUntilDue < 0
      ? `This calendar item is overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"}.`
      : `This calendar item is due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}.`,
    "",
    `Provider: ${item.providerName ?? "Not set"}`,
    `Category: ${item.category}`,
    `Risk: ${item.riskLevel}`,
    `Due date: ${due}`,
    amount ? `Amount: ${amount}` : null,
    item.purchaseEmail ? `Purchase email: ${item.purchaseEmail}` : null,
    item.accountLoginEmail ? `Login email: ${item.accountLoginEmail}` : null,
    item.billingEmail ? `Billing email: ${item.billingEmail}` : null,
    item.billingUrl ? `Billing URL: ${item.billingUrl}` : null,
    "",
    "Checklist:",
    "- Confirm the due date and owner.",
    item.autoRenew ? "- Confirm auto-renew is active and the payment method is valid." : "- Complete the required manual renewal or payment.",
    "- Attach receipt, invoice, or proof when available.",
    "- Mark the calendar item complete.",
    "- Confirm the next due date was advanced if this is recurring.",
  ].filter(Boolean).join("\n");
}

function calendarEmailPayload(item: CalendarItemRow, daysUntilDue: number) {
  return {
    calendarItemId: item.id,
    title: item.title,
    category: item.category,
    riskLevel: item.riskLevel,
    dueDate: dateOnly(item.nextDueDate),
    providerName: item.providerName,
    amountCents: item.amountCents,
    currency: item.currency,
    purchaseEmail: item.purchaseEmail,
    accountLoginEmail: item.accountLoginEmail,
    billingEmail: item.billingEmail,
    loginUrl: item.loginUrl,
    billingUrl: item.billingUrl,
    documentationUrl: item.documentationUrl,
    notes: item.notes,
    daysUntilDue,
  };
}

function normalizeRecipientEmails(input: Array<string | null | undefined>) {
  return [...new Set(input.map((email) => email?.trim().toLowerCase()).filter((email): email is string => Boolean(email)))];
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

function readDetailNumber(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readDetailString(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function missingDetailsForItem(item: CalendarItemRow) {
  const missing: string[] = [];
  if (!item.nextDueDate) missing.push("next due date");
  if (HIGH_RISK.has(item.riskLevel) && !item.providerName) missing.push("provider");
  if (item.category === "software_subscription" && item.amountCents == null) missing.push("amount");
  if (item.category === "software_subscription" && !item.billingEmail) missing.push("billing email");
  if (!item.purchaseEmail && !item.accountLoginEmail && !item.billingEmail) missing.push("purchase/login/billing email");
  if (item.category === "domain") {
    const metadata = normalizeMetadata(item.metadata);
    if (!metadata?.registrar) missing.push("registrar");
    if (!metadata?.domainName && !item.serviceUrl) missing.push("domain/service URL");
  }
  if (item.category === "certificate" && !item.nextDueDate) missing.push("certificate expiration date");
  if (item.category === "api_token" && !item.relatedProjectId && !item.technicalContactEmail) missing.push("token owner/project/contact");
  if (item.autoRenew && !item.paymentMethodLabel) missing.push("payment method");
  if (item.amountCents != null && !item.costCenter) missing.push("cost center");
  if (item.sourceKind !== "manual" && (item.confidenceScore ?? 100) < LOW_CONFIDENCE_THRESHOLD) missing.push("human review for low-confidence extraction");
  if (missing.length === 0) return null;
  const severity = HIGH_RISK.has(item.riskLevel) || !item.nextDueDate ? "high" : missing.length > 1 ? "medium" : "low";
  return {
    itemId: item.id,
    title: item.title,
    category: item.category,
    riskLevel: item.riskLevel,
    severity,
    missingFields: [...new Set(missing)],
    message: `${item.title} is missing ${[...new Set(missing)].join(", ")}`,
  };
}

function missingDetailsReportDescription(findings: Array<NonNullable<ReturnType<typeof missingDetailsForItem>>>) {
  const grouped = {
    high: findings.filter((finding) => finding.severity === "high"),
    medium: findings.filter((finding) => finding.severity === "medium"),
    low: findings.filter((finding) => finding.severity === "low"),
  };
  const renderGroup = (label: string, rows: typeof findings) => {
    if (rows.length === 0) return `${label}:\n- None`;
    return `${label}:\n${rows.map((row) => `- ${row.title}: ${row.missingFields.join(", ")}`).join("\n")}`;
  };
  return [
    "Weekly Calendar Paperclip missing details report.",
    "",
    renderGroup("High priority", grouped.high),
    "",
    renderGroup("Medium priority", grouped.medium),
    "",
    renderGroup("Low priority", grouped.low),
  ].join("\n");
}

export function calendarService(db: Db) {
  const issuesSvc = issueService(db);
  const payments = paymentService(db);

  async function assertCompanyRow(table: any, id: string, companyId: string, label: string) {
    const row = await db.select().from(table).where(eq(table.id, id)).then((rows) => rows[0] ?? null);
    if (!row) throw notFound(`${label} not found`);
    if ((row as { companyId?: string }).companyId !== companyId) throw unprocessable(`${label} does not belong to company`);
    return row;
  }

  async function assertItem(companyId: string, itemId: string) {
    const item = await db
      .select()
      .from(calendarItems)
      .where(and(eq(calendarItems.id, itemId), eq(calendarItems.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!item) throw notFound("Calendar item not found");
    return item;
  }

  async function validateReferences(companyId: string, data: Partial<CreateCalendarItem | UpdateCalendarItem>) {
    if (data.timezone) assertTimeZone(data.timezone);
    if (data.relatedClientId) await assertCompanyRow(clients, data.relatedClientId, companyId, "Client");
    if (data.relatedProjectId) await assertCompanyRow(projects, data.relatedProjectId, companyId, "Project");
    if (data.paymentProfileId) await assertCompanyRow(paymentProfiles, data.paymentProfileId, companyId, "Payment profile");
    if (data.sourceEmailMessageId) await assertCompanyRow(inboundEmailMessages, data.sourceEmailMessageId, companyId, "Inbound email message");
  }

  async function logCalendarActivity(companyId: string, actor: Actor | undefined, action: string, entityId: string, details: Record<string, unknown>) {
    await logActivity(db, {
      companyId,
      actorType: actor?.actorType ?? "system",
      actorId: actor?.actorId ?? "calendar",
      agentId: actor?.agentId ?? null,
      runId: actor?.runId ?? null,
      action,
      entityType: "calendar_item",
      entityId,
      details,
    });
  }

  async function reminderStatus(companyId: string) {
    const [latestScan] = await db
      .select({
        details: activityLog.details,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .where(and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, "calendar.reminder_scan_completed"),
      ))
      .orderBy(desc(activityLog.createdAt))
      .limit(1);
    const emailRows = await db
      .select({
        id: emailNotifications.id,
        status: emailNotifications.status,
        recipientEmail: emailNotifications.recipientEmail,
        payload: emailNotifications.payload,
        attempts: emailNotifications.attempts,
        failedAt: emailNotifications.failedAt,
        lastError: emailNotifications.lastError,
      })
      .from(emailNotifications)
      .where(and(
        eq(emailNotifications.companyId, companyId),
        eq(emailNotifications.kind, CALENDAR_EMAIL_NOTIFICATION_KIND),
      ));
    const failedEmailDetails = emailRows
      .filter((row) => row.status === "failed")
      .sort((a, b) => (b.failedAt?.getTime() ?? 0) - (a.failedAt?.getTime() ?? 0))
      .slice(0, 5)
      .map((row) => {
        const payload = row.payload && "calendarItemId" in row.payload ? row.payload : null;
        return {
          id: row.id,
          calendarItemId: payload?.calendarItemId ?? null,
          title: payload?.title ?? null,
          recipientEmail: row.recipientEmail ?? null,
          dueDate: payload?.dueDate ?? null,
          failedAt: toIso(row.failedAt),
          attempts: row.attempts,
          lastError: row.lastError ?? null,
        };
      });
    let latestFailureAt: Date | null = null;
    let latestEmailFailureError: string | null = null;
    for (const row of emailRows) {
      if (!row.failedAt) continue;
      if (!latestFailureAt || row.failedAt > latestFailureAt) {
        latestFailureAt = row.failedAt;
        latestEmailFailureError = row.lastError ?? null;
      }
    }
    return {
      lastScanAt: readDetailString(latestScan?.details, "scannedAt") ?? toIso(latestScan?.createdAt),
      scannedItems: readDetailNumber(latestScan?.details, "scannedItems"),
      createdIssues: readDetailNumber(latestScan?.details, "createdIssues"),
      updatedIssues: readDetailNumber(latestScan?.details, "updatedIssues"),
      queuedEmails: readDetailNumber(latestScan?.details, "queuedEmails"),
      skippedEmails: readDetailNumber(latestScan?.details, "skippedEmails"),
      pendingEmails: emailRows.filter((row) => row.status === "pending" || row.status === "sending").length,
      sentEmails: emailRows.filter((row) => row.status === "sent").length,
      failedEmails: emailRows.filter((row) => row.status === "failed").length,
      skippedDeliveryEmails: emailRows.filter((row) => row.status === "skipped").length,
      latestEmailFailureAt: toIso(latestFailureAt),
      latestEmailFailureError,
      failedEmailDetails,
    };
  }

  async function findOpenIssue(companyId: string, originKind: string, originId: string, originFingerprint: string) {
    return db
      .select()
      .from(issues)
      .where(and(
        eq(issues.companyId, companyId),
        eq(issues.originKind, originKind),
        eq(issues.originId, originId),
        eq(issues.originFingerprint, originFingerprint),
        inArray(issues.status, OPEN_ISSUE_STATUSES),
        isNull(issues.hiddenAt),
      ))
      .then((rows) => rows[0] ?? null);
  }

  async function upsertIssue(input: {
    companyId: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    originKind: string;
    originId: string;
    originFingerprint: string;
    actor?: Actor;
  }) {
    const existing = await findOpenIssue(input.companyId, input.originKind, input.originId, input.originFingerprint);
    if (existing) {
      const [updated] = await db
        .update(issues)
        .set({
          title: input.title,
          description: input.description,
          priority: input.priority,
          updatedAt: new Date(),
        })
        .where(eq(issues.id, existing.id))
        .returning();
      return { issue: updated ?? existing, created: false };
    }
    const issue = await issuesSvc.create(input.companyId, {
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: "todo",
      originKind: input.originKind,
      originId: input.originId,
      originFingerprint: input.originFingerprint,
      createdByAgentId: input.actor?.agentId ?? null,
      createdByUserId: input.actor?.userId ?? null,
    });
    return { issue, created: true };
  }

  async function listScheduledReminderRecipients(companyId: string) {
    const rows = await db
      .select({ email: authUsers.email })
      .from(companyMemberships)
      .innerJoin(authUsers, eq(authUsers.id, companyMemberships.principalId))
      .where(and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.status, "active"),
        inArray(companyMemberships.membershipRole, ["owner", "admin"]),
      ));
    return normalizeRecipientEmails(rows.map((row) => row.email));
  }

  return {
    async list(companyId: string, filters: {
      status?: string;
      category?: string;
      riskLevel?: string;
      provider?: string;
      dueFrom?: string | null;
      dueTo?: string | null;
      autoRenew?: boolean;
      paymentMethod?: string;
      purchaseEmail?: string;
      billingEmail?: string;
      relatedClientId?: string;
      relatedProjectId?: string;
      q?: string;
      limit?: number;
      offset?: number;
    } = {}) {
      const conditions = [eq(calendarItems.companyId, companyId)];
      if (filters.status) conditions.push(eq(calendarItems.status, filters.status));
      if (filters.category) conditions.push(eq(calendarItems.category, filters.category));
      if (filters.riskLevel) conditions.push(eq(calendarItems.riskLevel, filters.riskLevel));
      if (filters.provider) conditions.push(ilike(calendarItems.providerName, `%${filters.provider}%`));
      if (filters.dueFrom) conditions.push(gte(calendarItems.nextDueDate, filters.dueFrom));
      if (filters.dueTo) conditions.push(lte(calendarItems.nextDueDate, filters.dueTo));
      if (filters.autoRenew !== undefined) conditions.push(eq(calendarItems.autoRenew, filters.autoRenew));
      if (filters.paymentMethod) conditions.push(ilike(calendarItems.paymentMethodLabel, `%${filters.paymentMethod}%`));
      if (filters.purchaseEmail) conditions.push(ilike(calendarItems.purchaseEmail, `%${filters.purchaseEmail}%`));
      if (filters.billingEmail) conditions.push(ilike(calendarItems.billingEmail, `%${filters.billingEmail}%`));
      if (filters.relatedClientId) conditions.push(eq(calendarItems.relatedClientId, filters.relatedClientId));
      if (filters.relatedProjectId) conditions.push(eq(calendarItems.relatedProjectId, filters.relatedProjectId));
      const where = and(...conditions);
      if (filters.q?.trim()) {
        const rows = await db
          .select()
          .from(calendarItems)
          .where(where)
          .orderBy(asc(calendarItems.nextDueDate), asc(calendarItems.title));
        const now = new Date();
        const matched = rows.filter((row) => calendarItemMatchesSearch(row, filters.q, now));
        const offset = filters.offset ?? 0;
        const limit = filters.limit ?? 100;
        return {
          items: matched.slice(offset, offset + limit).map(rowToItem),
          total: matched.length,
        };
      }
      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(calendarItems).where(where);
      const rows = await db
        .select()
        .from(calendarItems)
        .where(where)
        .orderBy(asc(calendarItems.nextDueDate), asc(calendarItems.title))
        .limit(filters.limit ?? 100)
        .offset(filters.offset ?? 0);
      return { items: rows.map(rowToItem), total: countRow?.count ?? 0 };
    },

    async getById(companyId: string, itemId: string) {
      const item = await assertItem(companyId, itemId);
      const docs = await db
        .select()
        .from(calendarItemDocuments)
        .where(and(eq(calendarItemDocuments.companyId, companyId), eq(calendarItemDocuments.calendarItemId, itemId)))
        .orderBy(desc(calendarItemDocuments.createdAt));
      const activity = await db
        .select()
        .from(activityLog)
        .where(and(
          eq(activityLog.companyId, companyId),
          eq(activityLog.entityType, "calendar_item"),
          eq(activityLog.entityId, itemId),
        ))
        .orderBy(desc(activityLog.createdAt))
        .limit(50);
      return { ...rowToItem(item), documents: docs.map(rowToDocument), activity };
    },

    async create(companyId: string, input: CreateCalendarItem, actor?: Actor) {
      await validateReferences(companyId, input);
      const [item] = await db
        .insert(calendarItems)
        .values({ ...normalizeCreateInput(input, actor), companyId })
        .returning();
      await logCalendarActivity(companyId, actor, "calendar_item.created", item.id, {
        title: item.title,
        category: item.category,
        riskLevel: item.riskLevel,
      });
      await payments.ensureEntryForCalendarItem(item);
      return rowToItem(item);
    },

    async createEmailProposal(companyId: string, input: CreateCalendarItem & { sourceEmailMessageId: string; confidenceScore: number; matchingKey?: string }, actor?: Actor) {
      await validateReferences(companyId, input);
      const fingerprint = input.matchingKey ?? `${input.providerName ?? "unknown"}:${input.sourceEmailMessageId}`;
      const existingProposal = await db
        .select()
        .from(calendarItems)
        .where(and(
          eq(calendarItems.companyId, companyId),
          eq(calendarItems.sourceKind, "email_agent"),
          eq(calendarItems.sourceEmailMessageId, input.sourceEmailMessageId),
          sql`${calendarItems.metadata}->>'proposalMatchingKey' = ${fingerprint}`,
        ))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      if (existingProposal) {
        await upsertIssue({
          companyId,
          title: `Review calendar proposal: ${existingProposal.title}`,
          description: [
            "An inbound email produced a calendar item proposal.",
            "",
            `Calendar item: ${existingProposal.title}`,
            `Category: ${existingProposal.category}`,
            `Risk: ${existingProposal.riskLevel}`,
            `Confidence: ${existingProposal.confidenceScore ?? input.confidenceScore}`,
            `Source email: ${input.sourceEmailMessageId}`,
            "",
            "Review the pending calendar item and either activate it or archive it.",
          ].join("\n"),
          priority: (existingProposal.confidenceScore ?? input.confidenceScore) < LOW_CONFIDENCE_THRESHOLD
            ? "high"
            : issuePriorityForRisk(existingProposal.riskLevel),
          originKind: CALENDAR_EMAIL_PROPOSAL_ISSUE_ORIGIN_KIND,
          originId: input.sourceEmailMessageId,
          originFingerprint: fingerprint,
          actor,
        });
        return rowToItem(existingProposal);
      }
      const item = await this.create(companyId, {
        ...input,
        metadata: mergeMetadata(input.metadata, { proposalMatchingKey: fingerprint }),
        sourceKind: "email_agent" as CalendarSourceKind,
        status: "pending_review",
      }, actor);
      await upsertIssue({
        companyId,
        title: `Review calendar proposal: ${item.title}`,
        description: [
          "An inbound email produced a calendar item proposal.",
          "",
          `Calendar item: ${item.title}`,
          `Category: ${item.category}`,
          `Risk: ${item.riskLevel}`,
          `Confidence: ${input.confidenceScore}`,
          `Source email: ${input.sourceEmailMessageId}`,
          "",
          "Review the pending calendar item and either activate it or archive it.",
        ].join("\n"),
        priority: input.confidenceScore < LOW_CONFIDENCE_THRESHOLD ? "high" : issuePriorityForRisk(item.riskLevel),
        originKind: CALENDAR_EMAIL_PROPOSAL_ISSUE_ORIGIN_KIND,
        originId: input.sourceEmailMessageId,
        originFingerprint: fingerprint,
        actor,
      });
      return item;
    },

    async update(companyId: string, itemId: string, input: UpdateCalendarItem, actor?: Actor, opts?: { approvalConfirmed?: boolean }) {
      const existing = await assertItem(companyId, itemId);
      await validateReferences(companyId, input);
      const approvalReason = requiresApprovalForPatch(existing, input);
      if (approvalReason && !opts?.approvalConfirmed) {
        throw unprocessable(approvalReason);
      }
      const [updated] = await db
        .update(calendarItems)
        .set(normalizePatchInput(input, actor))
        .where(and(eq(calendarItems.id, itemId), eq(calendarItems.companyId, companyId)))
        .returning();
      await logCalendarActivity(companyId, actor, "calendar_item.updated", itemId, {
        changedKeys: changedKeys(input),
        approvalConfirmed: Boolean(approvalReason),
      });
      await payments.ensureEntryForCalendarItem(updated);
      return rowToItem(updated);
    },

    async complete(companyId: string, itemId: string, input: { completedAt?: Date; nextDueDate?: string | null; notes?: string | null }, actor?: Actor, opts?: { approvalConfirmed?: boolean }) {
      const existing = await assertItem(companyId, itemId);
      if (HIGH_RISK.has(existing.riskLevel) && !opts?.approvalConfirmed) {
        throw unprocessable("Completing high-risk or critical items requires approval confirmation");
      }
      const nextDueDate = input.nextDueDate ?? calculateNextDueDate(existing);
      const status = nextDueDate ? "active" : "done";
      const [updated] = await db
        .update(calendarItems)
        .set({
          status,
          nextDueDate,
          dueDate: nextDueDate ?? existing.dueDate,
          lastCompletedAt: input.completedAt ?? new Date(),
          notes: input.notes ? [existing.notes, input.notes].filter(Boolean).join("\n\n") : existing.notes,
          updatedByAgentId: actor?.agentId ?? null,
          updatedByUserId: actor?.userId ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(calendarItems.id, itemId), eq(calendarItems.companyId, companyId)))
        .returning();
      await logCalendarActivity(companyId, actor, "calendar_item.completed", itemId, {
        previousDueDate: dateOnly(existing.nextDueDate),
        nextDueDate,
        status,
      });
      await payments.ensureEntryForCalendarItem(updated);
      return rowToItem(updated);
    },

    async setStatus(companyId: string, itemId: string, status: "paused" | "cancelled" | "archived" | "active", actor?: Actor, opts?: { approvalConfirmed?: boolean }) {
      const existing = await assertItem(companyId, itemId);
      if (status === "cancelled" && !opts?.approvalConfirmed) {
        throw unprocessable("Cancelling an obligation requires approval confirmation");
      }
      const [updated] = await db
        .update(calendarItems)
        .set({
          status,
          updatedByAgentId: actor?.agentId ?? null,
          updatedByUserId: actor?.userId ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(calendarItems.id, existing.id), eq(calendarItems.companyId, companyId)))
        .returning();
      await logCalendarActivity(companyId, actor, `calendar_item.${status}`, itemId, { previousStatus: existing.status });
      return rowToItem(updated);
    },

    async addDocument(companyId: string, itemId: string, input: CreateCalendarItemDocument, actor?: Actor) {
      await assertItem(companyId, itemId);
      if (input.documentId) await assertCompanyRow(documents, input.documentId, companyId, "Document");
      if (input.assetId) await assertCompanyRow(assets, input.assetId, companyId, "Asset");
      if (input.sourceEmailMessageId) await assertCompanyRow(inboundEmailMessages, input.sourceEmailMessageId, companyId, "Inbound email message");
      if (input.sourceEmailAttachmentId) await assertCompanyRow(inboundEmailAttachments, input.sourceEmailAttachmentId, companyId, "Inbound email attachment");
      if (!input.documentId && !input.assetId && !input.sourceEmailAttachmentId && !input.url) {
        throw badRequest("Document link must include a document, asset, source email attachment, or URL");
      }
      const [doc] = await db
        .insert(calendarItemDocuments)
        .values({
          ...input,
          companyId,
          calendarItemId: itemId,
          metadata: normalizeMetadata(input.metadata),
          createdByAgentId: actor?.agentId ?? null,
          createdByUserId: actor?.userId ?? null,
        })
        .returning();
      await logCalendarActivity(companyId, actor, "calendar_item.document_attached", itemId, {
        documentLinkId: doc.id,
        documentType: doc.documentType,
      });
      return rowToDocument(doc);
    },

    async dashboard(companyId: string, now = new Date()) {
      const rows = await db
        .select()
        .from(calendarItems)
        .where(and(eq(calendarItems.companyId, companyId), inArray(calendarItems.status, ["active", "pending_review", "overdue", "done"])))
        .orderBy(asc(calendarItems.nextDueDate), asc(calendarItems.title));
      const today = formatDateOnly(now);
      const in7 = new Date(now);
      in7.setUTCDate(in7.getUTCDate() + 7);
      const in30 = new Date(now);
      in30.setUTCDate(in30.getUTCDate() + 30);
      const activeRows = rows.filter((row) => DASHBOARD_ACTIVE_STATUSES.includes(row.status));
      const status = await reminderStatus(companyId);
      const dueInRange = (max: Date) => activeRows.filter((row) => {
        const due = parseDateOnly(row.nextDueDate);
        return due && daysBetween(now, due) >= 0 && due <= max;
      });
      const itemRows = rows.map(rowToItem);
      const upcoming30Rows = activeRows.filter((row) => {
        const due = parseDateOnly(row.nextDueDate);
        return due && daysBetween(now, due) >= 0 && due <= in30;
      });
      const monthlyRecurringCents = activeRows
        .filter((row) => row.recurrenceType === "monthly" && row.amountCents != null)
        .reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
      const annualRenewalCents = activeRows
        .filter((row) => row.recurrenceType === "yearly" && row.amountCents != null)
        .reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
      const upcoming30DaysCents = upcoming30Rows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
      const missing = activeRows.map(missingDetailsForItem).filter((finding): finding is NonNullable<typeof finding> => Boolean(finding));
      const bucket = (label: string, bucketRows: CalendarItemRow[]) => ({
        label,
        items: bucketRows.map(rowToItem),
        count: bucketRows.length,
      });
      return {
        companyId,
        generatedAt: now.toISOString(),
        overdue: bucket("Overdue", activeRows.filter((row) => {
          const due = parseDateOnly(row.nextDueDate);
          return row.status === "overdue" || Boolean(due && due < parseDateOnly(today)!);
        })),
        dueToday: bucket("Due today", activeRows.filter((row) => dateOnly(row.nextDueDate) === today)),
        dueIn7Days: bucket("Due in 7 days", dueInRange(in7)),
        dueIn30Days: bucket("Due in 30 days", dueInRange(in30)),
        criticalItems: bucket("Critical items", activeRows.filter((row) => row.riskLevel === "critical")),
        pendingReview: bucket("Pending review", rows.filter((row) => row.status === "pending_review")),
        missingDetails: missing,
        reminderStatus: status,
        recentlyCompleted: bucket("Recently completed", rows.filter((row) => row.status === "done").slice(0, 10)),
        costSummary: {
          monthlyRecurringCents,
          annualRenewalCents,
          upcoming30DaysCents,
          currency: itemRows.find((row) => row.currency)?.currency ?? "USD",
        },
      };
    },

    async missingDetails(companyId: string) {
      const rows = await db
        .select()
        .from(calendarItems)
        .where(and(eq(calendarItems.companyId, companyId), inArray(calendarItems.status, ["active", "pending_review", "overdue"])))
        .orderBy(asc(calendarItems.nextDueDate), asc(calendarItems.title));
      return rows.map(missingDetailsForItem).filter((finding): finding is NonNullable<typeof finding> => Boolean(finding));
    },

    async runDetailsScan(companyId: string, opts: { now?: Date; actor?: Actor } = {}) {
      const now = opts.now ?? new Date();
      const rows = await db
        .select()
        .from(calendarItems)
        .where(and(eq(calendarItems.companyId, companyId), inArray(calendarItems.status, ["active", "pending_review", "overdue"])));
      const findings = rows.map(missingDetailsForItem).filter((finding): finding is NonNullable<typeof finding> => Boolean(finding));
      await db
        .update(calendarItems)
        .set({ lastDetailsScannedAt: now, updatedAt: now })
        .where(and(eq(calendarItems.companyId, companyId), inArray(calendarItems.status, ["active", "pending_review", "overdue"])));

      let createdIssueId: string | null = null;
      let updatedIssueId: string | null = null;
      if (findings.length > 0) {
        const { issue, created } = await upsertIssue({
          companyId,
          title: `Calendar missing details report (${currentWeekKey(now)})`,
          description: missingDetailsReportDescription(findings),
          priority: findings.some((finding) => finding.severity === "high") ? "high" : "medium",
          originKind: CALENDAR_MISSING_DETAILS_ISSUE_ORIGIN_KIND,
          originId: companyId,
          originFingerprint: currentWeekKey(now),
          actor: opts.actor,
        });
        if (created) createdIssueId = issue.id;
        else updatedIssueId = issue.id;
      }

      await logActivity(db, {
        companyId,
        actorType: opts.actor?.actorType ?? "system",
        actorId: opts.actor?.actorId ?? "calendar",
        agentId: opts.actor?.agentId ?? null,
        runId: opts.actor?.runId ?? null,
        action: "calendar.details_scan_completed",
        entityType: "company",
        entityId: companyId,
        details: { weekKey: currentWeekKey(now), findingCount: findings.length, createdIssueId, updatedIssueId },
      });

      return {
        companyId,
        scannedAt: now.toISOString(),
        scannedItems: rows.length,
        findingCount: findings.length,
        createdIssueId,
        updatedIssueId,
      };
    },

    async runReminderScan(companyId: string, opts: CalendarScanOptions = {}) {
      const now = opts.now ?? new Date();
      const createIssues = opts.createIssues !== false;
      const sendEmail = opts.sendEmail === true;
      const rows = await db
        .select()
        .from(calendarItems)
        .where(and(eq(calendarItems.companyId, companyId), inArray(calendarItems.status, ["active", "pending_review", "overdue"])))
        .orderBy(asc(calendarItems.nextDueDate));
      let createdIssues = 0;
      let updatedIssues = 0;
      let queuedEmails = 0;
      let skippedEmails = 0;
      let markedOverdue = 0;
      let skipped = 0;
      const recipientEmails = normalizeRecipientEmails([
        opts.recipientEmail,
        ...(opts.recipientEmails ?? []),
      ]);

      for (const item of rows) {
        const due = parseDateOnly(item.nextDueDate);
        if (!due || item.status === "pending_review") {
          skipped += 1;
          continue;
        }
        const daysUntilDue = daysBetween(now, due);
        if (daysUntilDue < 0 && item.status !== "overdue") {
          await db
            .update(calendarItems)
            .set({ status: "overdue", lastReminderScannedAt: now, updatedAt: now })
            .where(eq(calendarItems.id, item.id));
          markedOverdue += 1;
        } else {
          await db
            .update(calendarItems)
            .set({ lastReminderScannedAt: now, updatedAt: now })
            .where(eq(calendarItems.id, item.id));
        }
        const matchingRules = daysUntilDue < 0
          ? [{ createIssue: true, sendEmail: true }]
          : reminderDefaultsFor(item, daysUntilDue);
        if (matchingRules.length === 0) continue;

        for (const rule of matchingRules) {
          const dueText = dateOnly(item.nextDueDate) ?? "unknown";
          const fingerprint = daysUntilDue < 0 && rule.createIssue
            ? `${dueText}:overdue:issue`
            : `${dueText}:${daysUntilDue}:${rule.createIssue ? "issue" : "email"}`;
          let linkedIssueId: string | null = null;
          if (createIssues && rule.createIssue) {
            const { issue, created } = await upsertIssue({
              companyId,
              title: daysUntilDue < 0 ? `Overdue: ${item.title}` : `Calendar reminder: ${item.title}`,
              description: reminderIssueDescription(item, daysUntilDue),
              priority: issuePriorityForRisk(item.riskLevel),
              originKind: CALENDAR_REMINDER_ISSUE_ORIGIN_KIND,
              originId: item.id,
              originFingerprint: fingerprint,
              actor: opts.actor,
            });
            linkedIssueId = issue.id;
            if (created) createdIssues += 1;
            else updatedIssues += 1;
          }

          if (sendEmail && rule.sendEmail) {
            if (recipientEmails.length === 0) {
              skippedEmails += 1;
              continue;
            }
            const subject = daysUntilDue < 0
              ? `[Calendar Paperclip] OVERDUE: ${item.title}`
              : `[Calendar Paperclip] Upcoming deadline: ${item.title} - due ${dueText}`;
            for (const recipientEmail of recipientEmails) {
              const emailTimingCondition = daysUntilDue < 0
                ? sql`(${emailNotifications.payload}->>'daysUntilDue') ~ '^-?[0-9]+$' and (${emailNotifications.payload}->>'daysUntilDue')::int < 0`
                : eq(sql<string>`${emailNotifications.payload}->>'daysUntilDue'`, String(daysUntilDue));
              const existingEmail = await db
                .select({ id: emailNotifications.id, issueId: emailNotifications.issueId })
                .from(emailNotifications)
                .where(and(
                  eq(emailNotifications.companyId, companyId),
                  eq(emailNotifications.kind, CALENDAR_EMAIL_NOTIFICATION_KIND),
                  eq(emailNotifications.recipientEmail, recipientEmail),
                  eq(sql<string>`${emailNotifications.payload}->>'calendarItemId'`, item.id),
                  eq(sql<string>`${emailNotifications.payload}->>'dueDate'`, dueText),
                  emailTimingCondition,
                ))
                .limit(1)
                .then((emailRows) => emailRows[0] ?? null);
              if (existingEmail && linkedIssueId && !existingEmail.issueId) {
                await db
                  .update(emailNotifications)
                  .set({ issueId: linkedIssueId, updatedAt: now })
                  .where(eq(emailNotifications.id, existingEmail.id));
              } else if (!existingEmail) {
                await db.insert(emailNotifications).values({
                  companyId,
                  kind: CALENDAR_EMAIL_NOTIFICATION_KIND,
                  status: "pending",
                  issueId: linkedIssueId,
                  recipientEmail,
                  subject,
                  payload: calendarEmailPayload(item, daysUntilDue),
                  requestedByActorType: opts.actor?.actorType ?? "system",
                  requestedByActorId: opts.actor?.actorId ?? "calendar",
                  requestedByAgentId: opts.actor?.agentId ?? null,
                  requestedByRunId: opts.actor?.runId ?? null,
                  scheduledAt: now,
                });
                queuedEmails += 1;
              }
            }
          }
        }
      }

      await logActivity(db, {
        companyId,
        actorType: opts.actor?.actorType ?? "system",
        actorId: opts.actor?.actorId ?? "calendar",
        agentId: opts.actor?.agentId ?? null,
        runId: opts.actor?.runId ?? null,
        action: "calendar.reminder_scan_completed",
        entityType: "company",
        entityId: companyId,
        details: {
          scannedAt: now.toISOString(),
          scanDate: formatDateOnly(now),
          scannedItems: rows.length,
          createdIssues,
          updatedIssues,
          queuedEmails,
          skippedEmails,
          markedOverdue,
          skipped,
        },
      });

      return {
        companyId,
        scannedAt: now.toISOString(),
        scannedItems: rows.length,
        createdIssues,
        updatedIssues,
        queuedEmails,
        skippedEmails,
        markedOverdue,
        skipped,
      };
    },

    async runScheduledScans(now = new Date()) {
      const today = formatDateOnly(now);
      const week = currentWeekKey(now);
      const companyRows = await db
        .selectDistinct({ companyId: calendarItems.companyId })
        .from(calendarItems)
        .innerJoin(companies, eq(companies.id, calendarItems.companyId))
        .where(inArray(calendarItems.status, ["active", "overdue", "pending_review"]));

      let companiesScanned = 0;
      let reminderScans = 0;
      let detailsScans = 0;
      let reminderIssuesCreated = 0;
      let reminderIssuesUpdated = 0;
      let reminderEmailsQueued = 0;
      let reminderEmailsSkipped = 0;
      let detailsIssuesCreated = 0;
      let detailsIssuesUpdated = 0;

      for (const row of companyRows) {
        companiesScanned += 1;
        const reminderAlreadyRan = await db
          .select({ id: activityLog.id })
          .from(activityLog)
          .where(and(
            eq(activityLog.companyId, row.companyId),
            eq(activityLog.action, "calendar.reminder_scan_completed"),
            sql`${activityLog.details}->>'scanDate' = ${today}`,
          ))
          .limit(1)
          .then((rows) => Boolean(rows[0]));
        if (!reminderAlreadyRan) {
          const recipientEmails = await listScheduledReminderRecipients(row.companyId);
          const result = await this.runReminderScan(row.companyId, {
            now,
            createIssues: true,
            sendEmail: true,
            recipientEmails,
            actor: { actorType: "system", actorId: "calendar_scheduler" },
          });
          reminderScans += 1;
          reminderIssuesCreated += result.createdIssues;
          reminderIssuesUpdated += result.updatedIssues;
          reminderEmailsQueued += result.queuedEmails;
          reminderEmailsSkipped += result.skippedEmails;
        }

        const detailsAlreadyRan = await db
          .select({ id: activityLog.id })
          .from(activityLog)
          .where(and(
            eq(activityLog.companyId, row.companyId),
            eq(activityLog.action, "calendar.details_scan_completed"),
            sql`${activityLog.details}->>'weekKey' = ${week}`,
          ))
          .limit(1)
          .then((rows) => Boolean(rows[0]));
        if (!detailsAlreadyRan) {
          const result = await this.runDetailsScan(row.companyId, {
            now,
            actor: { actorType: "system", actorId: "calendar_scheduler" },
          });
          detailsScans += 1;
          if (result.createdIssueId) detailsIssuesCreated += 1;
          if (result.updatedIssueId) detailsIssuesUpdated += 1;
        }
      }

      return {
        scannedAt: now.toISOString(),
        companiesScanned,
        reminderScans,
        detailsScans,
        reminderIssuesCreated,
        reminderIssuesUpdated,
        reminderEmailsQueued,
        reminderEmailsSkipped,
        detailsIssuesCreated,
        detailsIssuesUpdated,
      };
    },
  };
}
