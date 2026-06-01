import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CALENDAR_ITEM_CATEGORIES,
  CALENDAR_RECURRENCE_TYPES,
  CALENDAR_RISK_LEVELS,
} from "@paperclipai/shared/constants";
import type {
  CalendarDashboard,
  CalendarItem,
  CalendarItemCategory,
  CalendarItemDetail,
  CalendarItemStatus,
  CalendarRecurrenceType,
  CalendarRiskLevel,
  CreateCalendarItemInput,
} from "@paperclipai/shared";
import {
  Archive,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Info,
  Pause,
  Play,
  Search,
  ShieldAlert,
} from "lucide-react";
import { calendarApi } from "../api/calendar";
import { clientsApi } from "../api/clients";
import { paymentsApi } from "../api/payments";
import { projectsApi } from "../api/projects";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { StatusBadge } from "../components/StatusBadge";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useInvalidatingMutation } from "../lib/useInvalidatingMutation";

const NO_COMPANY = "__none__";
const NONE = "__none_value__";
const CALENDAR_TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", label: "Sao Paulo" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York" },
  { value: "Europe/London", label: "London" },
  { value: "Asia/Tokyo", label: "Japan" },
] as const;

type ItemFormState = {
  title: string;
  description: string;
  category: CalendarItemCategory;
  riskLevel: CalendarRiskLevel;
  status: CalendarItemStatus;
  providerName: string;
  nextDueDate: string;
  dueTime: string;
  timezone: string;
  recurrenceType: CalendarRecurrenceType;
  recurrenceRule: string;
  amount: string;
  currency: string;
  paymentProfileId: string;
  autoRenew: boolean;
  manualActionRequired: boolean;
  paymentMethodLabel: string;
  paymentOwner: string;
  costCenter: string;
  purchaseEmail: string;
  accountLoginEmail: string;
  billingEmail: string;
  recoveryEmail: string;
  technicalContactEmail: string;
  serviceUrl: string;
  loginUrl: string;
  billingUrl: string;
  documentationUrl: string;
  relatedClientId: string;
  relatedProjectId: string;
  notes: string;
  internalNotes: string;
};

function emptyForm(): ItemFormState {
  return {
    title: "",
    description: "",
    category: "software_subscription",
    riskLevel: "medium",
    status: "active",
    providerName: "",
    nextDueDate: "",
    dueTime: "",
    timezone: "America/Sao_Paulo",
    recurrenceType: "none",
    recurrenceRule: "",
    amount: "",
    currency: "BRL",
    paymentProfileId: "",
    autoRenew: false,
    manualActionRequired: true,
    paymentMethodLabel: "",
    paymentOwner: "",
    costCenter: "",
    purchaseEmail: "",
    accountLoginEmail: "",
    billingEmail: "",
    recoveryEmail: "",
    technicalContactEmail: "",
    serviceUrl: "",
    loginUrl: "",
    billingUrl: "",
    documentationUrl: "",
    relatedClientId: "",
    relatedProjectId: "",
    notes: "",
    internalNotes: "",
  };
}

function formFromItem(item: CalendarItem): ItemFormState {
  return {
    title: item.title,
    description: item.description ?? "",
    category: item.category,
    riskLevel: item.riskLevel,
    status: item.status,
    providerName: item.providerName ?? "",
    nextDueDate: item.nextDueDate ?? "",
    dueTime: item.dueTime ?? "",
    timezone: item.timezone,
    recurrenceType: item.recurrenceType,
    recurrenceRule: item.recurrenceRule ?? "",
    amount: item.amountCents == null ? "" : String(item.amountCents / 100),
    currency: item.currency,
    paymentProfileId: item.paymentProfileId ?? "",
    autoRenew: item.autoRenew,
    manualActionRequired: item.manualActionRequired,
    paymentMethodLabel: item.paymentMethodLabel ?? "",
    paymentOwner: item.paymentOwner ?? "",
    costCenter: item.costCenter ?? "",
    purchaseEmail: item.purchaseEmail ?? "",
    accountLoginEmail: item.accountLoginEmail ?? "",
    billingEmail: item.billingEmail ?? "",
    recoveryEmail: item.recoveryEmail ?? "",
    technicalContactEmail: item.technicalContactEmail ?? "",
    serviceUrl: item.serviceUrl ?? "",
    loginUrl: item.loginUrl ?? "",
    billingUrl: item.billingUrl ?? "",
    documentationUrl: item.documentationUrl ?? "",
    relatedClientId: item.relatedClientId ?? "",
    relatedProjectId: item.relatedProjectId ?? "",
    notes: item.notes ?? "",
    internalNotes: item.internalNotes ?? "",
  };
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function amountToCents(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function payloadFromForm(form: ItemFormState): CreateCalendarItemInput {
  return {
    title: form.title.trim(),
    description: nullable(form.description),
    category: form.category,
    riskLevel: form.riskLevel,
    status: form.status,
    providerName: nullable(form.providerName),
    nextDueDate: nullable(form.nextDueDate),
    dueTime: nullable(form.dueTime),
    timezone: form.timezone.trim() || "America/Sao_Paulo",
    recurrenceType: form.recurrenceType,
    recurrenceRule: nullable(form.recurrenceRule),
    amountCents: amountToCents(form.amount),
    currency: form.currency.trim().toUpperCase() || "BRL",
    paymentProfileId: nullable(form.paymentProfileId),
    autoRenew: form.autoRenew,
    manualActionRequired: form.manualActionRequired,
    paymentMethodLabel: nullable(form.paymentMethodLabel),
    paymentOwner: nullable(form.paymentOwner),
    costCenter: nullable(form.costCenter),
    purchaseEmail: nullable(form.purchaseEmail),
    accountLoginEmail: nullable(form.accountLoginEmail),
    billingEmail: nullable(form.billingEmail),
    recoveryEmail: nullable(form.recoveryEmail),
    technicalContactEmail: nullable(form.technicalContactEmail),
    serviceUrl: nullable(form.serviceUrl),
    loginUrl: nullable(form.loginUrl),
    billingUrl: nullable(form.billingUrl),
    documentationUrl: nullable(form.documentationUrl),
    relatedClientId: nullable(form.relatedClientId),
    relatedProjectId: nullable(form.relatedProjectId),
    notes: nullable(form.notes),
    internalNotes: nullable(form.internalNotes),
  };
}

export function requiresActivePayablePaymentDetails(payload: Pick<CreateCalendarItemInput, "category" | "status" | "paymentProfileId" | "amountCents" | "nextDueDate">) {
  return payload.category === "payment_payable"
    && (payload.status === "active" || payload.status === "overdue")
    && (!payload.paymentProfileId || payload.amountCents == null || !payload.nextDueDate);
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();
function getMoneyFormatter(currency: string) {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
    moneyFormatters.set(currency, formatter);
  }
  return formatter;
}

function money(cents: number, currency = "BRL") {
  return getMoneyFormatter(currency).format(cents / 100);
}

function dueLabel(item: CalendarItem) {
  if (!item.nextDueDate) return "No date";
  const due = new Date(`${item.nextDueDate}T00:00:00Z`);
  const today = new Date();
  const diff = Math.round((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Today";
  return `${diff}d`;
}

export function requiresGovernedSaveApproval(item: CalendarItem | null, payload: CreateCalendarItemInput) {
  if (!item) return false;
  const highRisk = item.riskLevel === "high" || item.riskLevel === "critical";
  const governedCategory = ["fiscal", "legal", "domain", "certificate", "hosting"].includes(item.category);
  if (payload.status === "cancelled" && item.status !== "cancelled") return true;
  if (payload.nextDueDate !== undefined && payload.nextDueDate !== item.nextDueDate && (highRisk || governedCategory)) return true;
  if (payload.dueDate !== undefined && payload.dueDate !== item.dueDate && (highRisk || governedCategory)) return true;
  if (payload.accountLoginEmail !== undefined && payload.accountLoginEmail !== item.accountLoginEmail) return true;
  if (payload.recoveryEmail !== undefined && payload.recoveryEmail !== item.recoveryEmail) return true;
  if (payload.billingEmail !== undefined && payload.billingEmail !== item.billingEmail) return true;
  if (payload.paymentMethodLabel !== undefined && payload.paymentMethodLabel !== item.paymentMethodLabel) return true;
  if (payload.paymentProfileId !== undefined && payload.paymentProfileId !== item.paymentProfileId) return true;
  return false;
}

function confirmGovernedChange(message: string) {
  return window.confirm(message);
}

function BucketTile({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "danger" | "warn" }) {
  return (
    <div className={cn(
      "min-w-0 border border-border px-3 py-2",
      tone === "danger" && "border-destructive/40 bg-destructive/5",
      tone === "warn" && "border-amber-500/40 bg-amber-500/5",
    )}>
      <div className="truncate text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return next;
}

function nextDuePreview(form: ItemFormState) {
  if (!form.nextDueDate || form.recurrenceType === "none" || form.recurrenceType === "manual") {
    return "Completion will close this item unless you set the next date manually.";
  }
  const due = new Date(`${form.nextDueDate}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return "Set a valid due date to preview recurrence.";
  if (form.recurrenceType === "monthly") return `Completing advances to ${formatDateOnly(addMonths(due, 1))}.`;
  if (form.recurrenceType === "quarterly") return `Completing advances to ${formatDateOnly(addMonths(due, 3))}.`;
  if (form.recurrenceType === "semiannual") return `Completing advances to ${formatDateOnly(addMonths(due, 6))}.`;
  if (form.recurrenceType === "yearly") return `Completing advances to ${formatDateOnly(addMonths(due, 12))}.`;
  return form.recurrenceRule.trim()
    ? "Completion uses the custom RRULE to calculate the next due date."
    : "Add a custom RRULE before relying on automatic recurrence.";
}

function dashboardMissingDetails(dashboard: CalendarDashboard | undefined) {
  return dashboard?.missingDetails ?? [];
}

function itemDocuments(item: CalendarItem | CalendarItemDetail | null) {
  return item && "documents" in item ? item.documents : [];
}

function itemActivity(item: CalendarItem | CalendarItemDetail | null) {
  return item && "activity" in item ? item.activity : [];
}

function ReminderStatusPanel({ dashboard }: { dashboard: CalendarDashboard | undefined }) {
  const status = dashboard?.reminderStatus;
  const hasFailures = (status?.failedEmails ?? 0) > 0;
  return (
    <Card className={cn(hasFailures && "border-destructive/40 bg-destructive/5")}>
      <CardHeader className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm">Automatic reminders</CardTitle>
          <span className={cn("text-xs font-medium", hasFailures ? "text-destructive" : "text-muted-foreground")}>
            {hasFailures ? "Email attention needed" : "Backend controlled"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pb-3 text-sm sm:grid-cols-2 xl:grid-cols-6">
        <div>
          <div className="text-xs text-muted-foreground">Last scan</div>
          <div className="font-medium">{formatDateTime(status?.lastScanAt)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Items scanned</div>
          <div className="font-medium tabular-nums">{status?.scannedItems ?? 0}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Issues</div>
          <div className="font-medium tabular-nums">{status ? `${status.createdIssues}/${status.updatedIssues}` : "0/0"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Queued/skipped</div>
          <div className="font-medium tabular-nums">{status ? `${status.queuedEmails}/${status.skippedEmails}` : "0/0"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Email state</div>
          <div className="font-medium tabular-nums">{status ? `${status.pendingEmails} pending, ${status.sentEmails} sent` : "0 pending, 0 sent"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Failures</div>
          {hasFailures ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-auto p-0 font-medium tabular-nums text-destructive hover:bg-transparent">
                  <AlertTriangle className="mr-1 size-3.5" />
                  {status?.failedEmails ?? 0}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96">
                <div className="mb-2 text-sm font-medium">Failed reminder emails</div>
                <div className="grid gap-2">
                  {(status?.failedEmailDetails ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">No failure details were recorded.</div>
                  ) : status?.failedEmailDetails.map((failure) => (
                    <div key={failure.id} className="border border-border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{failure.title ?? "Calendar reminder"}</span>
                        <span className="text-muted-foreground">{failure.attempts} attempts</span>
                      </div>
                      <div className="mt-1 text-muted-foreground">{failure.recipientEmail ?? "No recipient"}{failure.dueDate ? ` - due ${failure.dueDate}` : ""}</div>
                      {failure.lastError ? <div className="mt-1 text-destructive">{failure.lastError}</div> : null}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="font-medium tabular-nums">{status?.failedEmails ?? 0}</div>
          )}
          {status?.latestEmailFailureAt ? (
            <div className="truncate text-xs text-muted-foreground" title={status.latestEmailFailureError ?? undefined}>
              {formatDateTime(status.latestEmailFailureAt)}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

type CalendarItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formKey: number;
  initialForm: ItemFormState;
  isEditing: boolean;
  selectedItem: CalendarItem | CalendarItemDetail | null;
  selectedDocuments: ReturnType<typeof itemDocuments>;
  selectedActivity: ReturnType<typeof itemActivity>;
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  paymentProfiles: { id: string; accountLabel: string; ownerName?: string | null }[];
  savePending: boolean;
  completePending: boolean;
  onSave: (form: ItemFormState) => void;
  onComplete: (itemId: string) => void;
  onStatusAction: (input: { itemId: string; action: "pause" | "activate" | "archive" }) => void;
};

const CalendarItemDialog = memo(function CalendarItemDialog({
  open,
  onOpenChange,
  formKey,
  initialForm,
  isEditing,
  selectedItem,
  selectedDocuments,
  selectedActivity,
  clients,
  projects,
  paymentProfiles,
  savePending,
  completePending,
  onSave,
  onComplete,
  onStatusAction,
}: CalendarItemDialogProps) {
  const [form, setForm] = useState<ItemFormState>(initialForm);
  const [itemDialogTab, setItemDialogTab] = useState("overview");

  useEffect(() => {
    if (!open) return;
    setForm(initialForm);
    setItemDialogTab("overview");
  }, [formKey, initialForm, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="calendar-item-dialog"
        className="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[min(820px,calc(100dvh-2rem))] sm:max-w-4xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3 pr-12">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{isEditing ? "Item Detail" : "New Item"}</DialogTitle>
            {selectedItem ? <StatusBadge status={selectedItem.status} /> : null}
          </div>
          <DialogDescription>
            Track the due date, owner, payment, account, and proof details for this obligation.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 px-5 py-3">
          <Tabs value={itemDialogTab} onValueChange={setItemDialogTab} className="flex h-full min-h-0 flex-col gap-3">
            <TabsList variant="line" className="w-full shrink-0 justify-start overflow-x-auto">
              <TabsTrigger value="overview" data-testid="calendar-tab-overview" onClick={() => setItemDialogTab("overview")}>Overview</TabsTrigger>
              <TabsTrigger value="payment" data-testid="calendar-tab-payment" onClick={() => setItemDialogTab("payment")}>Payment</TabsTrigger>
              <TabsTrigger value="contacts" data-testid="calendar-tab-contacts" onClick={() => setItemDialogTab("contacts")}>Contacts</TabsTrigger>
              <TabsTrigger value="links" data-testid="calendar-tab-links" onClick={() => setItemDialogTab("links")}>Links</TabsTrigger>
              <TabsTrigger value="notes" data-testid="calendar-tab-notes" onClick={() => setItemDialogTab("notes")}>Notes</TabsTrigger>
              {selectedItem ? <TabsTrigger value="documents" data-testid="calendar-tab-documents" onClick={() => setItemDialogTab("documents")}>Documents</TabsTrigger> : null}
              {selectedItem ? <TabsTrigger value="history" data-testid="calendar-tab-history" onClick={() => setItemDialogTab("history")}>History</TabsTrigger> : null}
            </TabsList>
            <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid content-start gap-3 md:grid-cols-2">
                <Field label="Title">
                  <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                </Field>
                <Field label="Description">
                  <Textarea rows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category">
                    <Select value={form.category} onValueChange={(category) => setForm((current) => ({ ...current, category: category as CalendarItemCategory }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CALENDAR_ITEM_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{titleCase(category)}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Risk">
                    <Select value={form.riskLevel} onValueChange={(riskLevel) => setForm((current) => ({ ...current, riskLevel: riskLevel as CalendarRiskLevel }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CALENDAR_RISK_LEVELS.map((risk) => <SelectItem key={risk} value={risk}>{titleCase(risk)}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-3 border border-border bg-muted/20 p-3 md:col-span-2 md:max-w-md">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Schedule</div>
                  <Field label="Due Date">
                    <Input type="date" value={form.nextDueDate} onChange={(event) => setForm((current) => ({ ...current, nextDueDate: event.target.value }))} />
                  </Field>
                  <Field label="Due Time">
                    <Input value={form.dueTime} placeholder="HH:mm" onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))} />
                  </Field>
                  <Field label="Timezone">
                    <Select value={form.timezone} onValueChange={(timezone) => setForm((current) => ({ ...current, timezone }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CALENDAR_TIMEZONE_OPTIONS.map((timezone) => (
                          <SelectItem key={timezone.value} value={timezone.value}>{timezone.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Recurrence">
                    <Select value={form.recurrenceType} onValueChange={(recurrenceType) => setForm((current) => ({ ...current, recurrenceType: recurrenceType as CalendarRecurrenceType }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CALENDAR_RECURRENCE_TYPES.map((type) => <SelectItem key={type} value={type}>{titleCase(type)}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  {form.recurrenceType === "custom_rrule" ? (
                    <Field label="Recurrence Rule">
                      <Input value={form.recurrenceRule} placeholder="FREQ=MONTHLY;INTERVAL=1" onChange={(event) => setForm((current) => ({ ...current, recurrenceRule: event.target.value }))} />
                    </Field>
                  ) : null}
                  <div className="text-xs font-medium uppercase text-muted-foreground">Recurrence behavior</div>
                  <div className="mt-1">{nextDuePreview(form)}</div>
                </div>
                {selectedItem?.reminderPolicy ? (
                  <div className="border border-border p-3 text-sm md:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium uppercase text-muted-foreground">Reminder policy</div>
                        <div className="mt-1">{selectedItem.reminderPolicy.summary}</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedItem.reminderPolicy.daysBefore.length ? selectedItem.reminderPolicy.daysBefore.map((day) => (
                          <span key={day} className="border border-border px-2 py-0.5 text-xs">{day}d</span>
                        )) : (
                          <span className="border border-border px-2 py-0.5 text-xs">overdue</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
                <Field label="Provider">
                  <Input value={form.providerName} onChange={(event) => setForm((current) => ({ ...current, providerName: event.target.value }))} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Client">
                    <Select value={form.relatedClientId || NONE} onValueChange={(relatedClientId) => setForm((current) => ({ ...current, relatedClientId: relatedClientId === NONE ? "" : relatedClientId }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Project">
                    <Select value={form.relatedProjectId || NONE} onValueChange={(relatedProjectId) => setForm((current) => ({ ...current, relatedProjectId: relatedProjectId === NONE ? "" : relatedProjectId }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="payment" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid content-start gap-3 md:grid-cols-2">
                <div className="grid grid-cols-[1fr_90px] gap-3">
                  <Field label="Amount">
                    <Input inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
                  </Field>
                  <Field label="Currency">
                    <Input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))} />
                  </Field>
                </div>
                <Field label="Payment Profile">
                  <Select value={form.paymentProfileId || NONE} onValueChange={(paymentProfileId) => setForm((current) => ({ ...current, paymentProfileId: paymentProfileId === NONE ? "" : paymentProfileId }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {paymentProfiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.accountLabel}{profile.ownerName ? ` · ${profile.ownerName}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Payment Method"><Input value={form.paymentMethodLabel} onChange={(event) => setForm((current) => ({ ...current, paymentMethodLabel: event.target.value }))} /></Field>
                <Field label="Payment Owner"><Input value={form.paymentOwner} onChange={(event) => setForm((current) => ({ ...current, paymentOwner: event.target.value }))} /></Field>
                <Field label="Cost Center"><Input value={form.costCenter} onChange={(event) => setForm((current) => ({ ...current, costCenter: event.target.value }))} /></Field>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.autoRenew}
                    onChange={(event) => setForm((current) => ({ ...current, autoRenew: event.target.checked }))}
                    aria-label="Auto Renew"
                  />
                  Auto-renew
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.manualActionRequired}
                    onChange={(event) => setForm((current) => ({ ...current, manualActionRequired: event.target.checked }))}
                    aria-label="Manual Action Required"
                  />
                  Manual action required
                </label>
              </div>
            </TabsContent>
            <TabsContent value="contacts" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid content-start gap-3 md:grid-cols-2">
                <Field label="Purchase Email"><Input value={form.purchaseEmail} onChange={(event) => setForm((current) => ({ ...current, purchaseEmail: event.target.value }))} /></Field>
                <Field label="Login Email"><Input value={form.accountLoginEmail} onChange={(event) => setForm((current) => ({ ...current, accountLoginEmail: event.target.value }))} /></Field>
                <Field label="Billing Email"><Input value={form.billingEmail} onChange={(event) => setForm((current) => ({ ...current, billingEmail: event.target.value }))} /></Field>
                <Field label="Recovery Email"><Input value={form.recoveryEmail} onChange={(event) => setForm((current) => ({ ...current, recoveryEmail: event.target.value }))} /></Field>
                <Field label="Technical Contact"><Input value={form.technicalContactEmail} onChange={(event) => setForm((current) => ({ ...current, technicalContactEmail: event.target.value }))} /></Field>
              </div>
            </TabsContent>
            <TabsContent value="links" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid content-start gap-3 md:grid-cols-2">
                <Field label="Service URL"><Input value={form.serviceUrl} onChange={(event) => setForm((current) => ({ ...current, serviceUrl: event.target.value }))} /></Field>
                <Field label="Login URL"><Input value={form.loginUrl} onChange={(event) => setForm((current) => ({ ...current, loginUrl: event.target.value }))} /></Field>
                <Field label="Billing URL"><Input value={form.billingUrl} onChange={(event) => setForm((current) => ({ ...current, billingUrl: event.target.value }))} /></Field>
                <Field label="Documentation URL"><Input value={form.documentationUrl} onChange={(event) => setForm((current) => ({ ...current, documentationUrl: event.target.value }))} /></Field>
              </div>
            </TabsContent>
            <TabsContent value="notes" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid content-start gap-3">
                <Field label="Notes">
                  <Textarea rows={5} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
                </Field>
                <Field label="Internal Notes">
                  <Textarea rows={5} value={form.internalNotes} onChange={(event) => setForm((current) => ({ ...current, internalNotes: event.target.value }))} />
                </Field>
              </div>
            </TabsContent>
            <TabsContent value="documents" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid content-start gap-2">
                {selectedDocuments.length === 0 ? (
                  <div className="border border-border p-3 text-sm text-muted-foreground">No documents linked.</div>
                ) : selectedDocuments.map((document) => (
                  <div key={document.id} className="border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{document.title ?? titleCase(document.documentType)}</div>
                      <div className="text-xs text-muted-foreground">{titleCase(document.documentType)}</div>
                    </div>
                    {document.url ? (
                      <a className="mt-1 block truncate text-xs text-primary hover:underline" href={document.url} target="_blank" rel="noreferrer">
                        {document.url}
                      </a>
                    ) : null}
                    {document.notes ? <div className="mt-2 text-xs text-muted-foreground">{document.notes}</div> : null}
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid content-start gap-2">
                {selectedActivity.length === 0 ? (
                  <div className="border border-border p-3 text-sm text-muted-foreground">No activity recorded.</div>
                ) : selectedActivity.map((entry) => (
                  <div key={entry.id} className="border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{titleCase(entry.action.replace(/^calendar_item\./, ""))}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {titleCase(entry.actorType)} - {entry.actorId}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
          <div className="flex flex-1 flex-wrap gap-2">
            <Button onClick={() => onSave(form)} disabled={savePending || (isEditing && !selectedItem)}>
              {isEditing ? "Save" : "Create"}
            </Button>
            {selectedItem ? (
              <>
                <Button variant="outline" onClick={() => onComplete(selectedItem.id)} disabled={completePending}>
                  <CheckCircle2 className="mr-2 size-4" /> Complete
                </Button>
                {selectedItem.status === "paused" || selectedItem.status === "pending_review" ? (
                  <Button variant="outline" onClick={() => onStatusAction({ itemId: selectedItem.id, action: "activate" })}>
                    <Play className="mr-2 size-4" /> Activate
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => onStatusAction({ itemId: selectedItem.id, action: "pause" })}>
                    <Pause className="mr-2 size-4" /> Pause
                  </Button>
                )}
                <Button variant="outline" onClick={() => onStatusAction({ itemId: selectedItem.id, action: "archive" })}>
                  <Archive className="mr-2 size-4" /> Archive
                </Button>
              </>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export function Calendar() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ?? NO_COMPANY;
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dialogFormKey, setDialogFormKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const isEditing = selectedItemId !== null;

  useEffect(() => {
    setBreadcrumbs([{ label: "Calendar" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.calendar.dashboard(companyId),
    queryFn: () => calendarApi.dashboard(companyId),
    enabled: !!selectedCompanyId,
  });
  const itemListFilters = useMemo(() => ({
    limit: 500,
    q: debouncedSearchQuery || undefined,
  }), [debouncedSearchQuery]);
  const itemsQuery = useQuery({
    queryKey: queryKeys.calendar.items(companyId, itemListFilters),
    queryFn: () => calendarApi.list(companyId, itemListFilters),
    enabled: !!selectedCompanyId,
  });
  const detailQuery = useQuery({
    queryKey: selectedItemId ? queryKeys.calendar.detail(companyId, selectedItemId) : ["calendar", companyId, "no-detail"],
    queryFn: () => calendarApi.detail(companyId, selectedItemId!),
    enabled: !!selectedCompanyId && itemDialogOpen && !!selectedItemId,
  });
  const clientsQuery = useQuery({
    queryKey: queryKeys.clients.list(companyId),
    queryFn: () => clientsApi.list(companyId, { limit: 200 }),
    enabled: !!selectedCompanyId && itemDialogOpen,
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
    enabled: !!selectedCompanyId && itemDialogOpen,
  });
  const paymentProfilesQuery = useQuery({
    queryKey: queryKeys.payments.profiles(companyId),
    queryFn: () => paymentsApi.profiles(companyId),
    enabled: !!selectedCompanyId && itemDialogOpen,
  });

  const invalidateCalendar = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: ["calendar", selectedCompanyId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
  };

  const saveMutation = useInvalidatingMutation({
    mutationFn: async (nextForm: ItemFormState) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const payload = payloadFromForm(nextForm);
      if (!payload.title) throw new Error("Title is required");
      if (requiresActivePayablePaymentDetails(payload)) {
        throw new Error("Payment payables require due date, amount, and payment profile");
      }
      if (isEditing && selectedItemId) {
        if (!selectedItem) throw new Error("Calendar item is still loading");
        const requiresApproval = requiresGovernedSaveApproval(selectedItem, payload);
        const approvalConfirmed = requiresApproval
          ? confirmGovernedChange("This governed calendar change requires operator approval. Continue?")
          : false;
        if (requiresApproval && !approvalConfirmed) {
          throw new Error("Governed change was not approved");
        }
        return calendarApi.update(selectedCompanyId, selectedItemId, payload, approvalConfirmed);
      }
      return calendarApi.create(selectedCompanyId, payload);
    },
    onSuccess: (item) => {
      setSelectedItemId(item.id);
      setItemDialogOpen(false);
      setOperationError(null);
      invalidateCalendar();
    },
    onError: (err) => setOperationError(err instanceof Error ? err.message : "Save failed"),
  });

  const completeMutation = useInvalidatingMutation({
    mutationFn: (itemId: string) => {
      const approvalConfirmed = selectedItem && ["high", "critical"].includes(selectedItem.riskLevel)
        ? confirmGovernedChange("Completing this high-risk calendar item requires operator approval. Continue?")
        : false;
      if (selectedItem && ["high", "critical"].includes(selectedItem.riskLevel) && !approvalConfirmed) {
        throw new Error("Completion was not approved");
      }
      return calendarApi.complete(companyId, itemId, {}, approvalConfirmed);
    },
    onSuccess: (item) => {
      setDialogFormKey((current) => current + 1);
      setOperationError(null);
      invalidateCalendar();
    },
    onError: (err) => setOperationError(err instanceof Error ? err.message : "Complete failed"),
  });
  const statusMutation = useInvalidatingMutation({
    mutationFn: ({ itemId, action }: { itemId: string; action: "pause" | "activate" | "archive" | "cancel" }) => {
      if (action === "pause") return calendarApi.pause(companyId, itemId);
      if (action === "activate") return calendarApi.activate(companyId, itemId);
      if (action === "archive") return calendarApi.archive(companyId, itemId);
      const approvalConfirmed = confirmGovernedChange("Cancelling this calendar item requires operator approval. Continue?");
      if (!approvalConfirmed) throw new Error("Cancellation was not approved");
      return calendarApi.cancel(companyId, itemId, approvalConfirmed);
    },
    onSuccess: (item) => {
      setDialogFormKey((current) => current + 1);
      setOperationError(null);
      invalidateCalendar();
    },
    onError: (err) => setOperationError(err instanceof Error ? err.message : "Status update failed"),
  });

  const items = itemsQuery.data?.items ?? [];
  const missingDetails = dashboardMissingDetails(dashboardQuery.data);
  const missingDetailsByItemId = useMemo(() => {
    return new Map(missingDetails.map((finding) => [finding.itemId, finding]));
  }, [missingDetails]);
  const selectedItem = detailQuery.data ?? items.find((item) => item.id === selectedItemId) ?? null;
  const selectedDocuments = itemDocuments(selectedItem);
  const selectedActivity = itemActivity(selectedItem);
  const initialDialogForm = useMemo(() => {
    return selectedItem ? formFromItem(selectedItem) : emptyForm();
  }, [selectedItem?.id, selectedItem?.updatedAt]);

  const openCreateDialog = () => {
    setSelectedItemId(null);
    setDialogFormKey((current) => current + 1);
    setOperationError(null);
    setItemDialogOpen(true);
  };

  const openEditDialog = (item: CalendarItem) => {
    setSelectedItemId(item.id);
    setDialogFormKey((current) => current + 1);
    setOperationError(null);
    setItemDialogOpen(true);
  };

  const openItemById = (itemId: string) => {
    setSelectedItemId(itemId);
    setDialogFormKey((current) => current + 1);
    setOperationError(null);
    setItemDialogOpen(true);
  };

  if (!selectedCompanyId) {
    return <EmptyState icon={CalendarDays} message="Create or select a company to manage calendar obligations." />;
  }

  if (dashboardQuery.isLoading && itemsQuery.isLoading) {
    return <PageSkeleton />;
  }

  const dashboard = dashboardQuery.data;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Obligations, renewals, documents, and reminder work.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openCreateDialog}>
            <CalendarDays className="mr-2 size-4" />
            New Item
          </Button>
        </div>
      </div>

      {operationError ? (
        <div className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{operationError}</div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        <BucketTile label="Overdue" value={dashboard?.overdue.count ?? 0} tone={(dashboard?.overdue.count ?? 0) > 0 ? "danger" : "default"} />
        <BucketTile label="Today" value={dashboard?.dueToday.count ?? 0} tone={(dashboard?.dueToday.count ?? 0) > 0 ? "warn" : "default"} />
        <BucketTile label="7 days" value={dashboard?.dueIn7Days.count ?? 0} />
        <BucketTile label="30 days" value={dashboard?.dueIn30Days.count ?? 0} />
        <BucketTile label="Critical" value={dashboard?.criticalItems.count ?? 0} tone={(dashboard?.criticalItems.count ?? 0) > 0 ? "danger" : "default"} />
        <BucketTile label="Review" value={dashboard?.pendingReview.count ?? 0} />
        <BucketTile label="Details" value={missingDetails.length} tone={missingDetails.length > 0 ? "warn" : "default"} />
        <BucketTile label="30d Cost" value={formatCents(dashboard?.costSummary.upcoming30DaysCents ?? 0)} />
      </div>

      <ReminderStatusPanel dashboard={dashboard} />

      {missingDetails.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Missing Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {missingDetails.slice(0, 9).map((finding) => (
              <button
                key={finding.itemId}
                type="button"
                data-testid={`calendar-missing-details-${finding.itemId}`}
                className="border border-border p-3 text-left text-sm hover:bg-muted/40"
                onClick={() => openItemById(finding.itemId)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{finding.title}</span>
                  <span className={cn("text-xs", finding.severity === "high" && "text-destructive", finding.severity === "medium" && "text-amber-600")}>
                    {titleCase(finding.severity)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{finding.missingFields.join(", ")}</div>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div>
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Items</CardTitle>
              <div className="relative w-full sm:w-96">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  className="h-9 pl-8"
                  placeholder="Search calendar items"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {items.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={CalendarDays} message={searchQuery.trim() ? "No calendar items match this search." : "Create an item to start tracking obligations."} />
              </div>
            ) : (
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="border-y border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Due</th>
                    <th className="px-4 py-2 text-left font-medium">Title</th>
                    <th className="px-4 py-2 text-left font-medium">Category</th>
                    <th className="px-4 py-2 text-left font-medium">Provider</th>
                    <th className="px-4 py-2 text-left font-medium">Risk</th>
                    <th className="px-4 py-2 text-left font-medium">Amount</th>
                    <th className="px-4 py-2 text-left font-medium">Auto-renew</th>
                    <th className="px-4 py-2 text-left font-medium">Payment</th>
                    <th className="px-4 py-2 text-left font-medium">Purchase Email</th>
                    <th className="px-4 py-2 text-left font-medium">Login Email</th>
                    <th className="px-4 py-2 text-left font-medium">Billing Email</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      data-testid={`calendar-item-row-${item.id}`}
                      className={cn("cursor-pointer border-b border-border hover:bg-muted/40 focus:bg-muted/40 focus:outline-none", selectedItemId === item.id && "bg-muted")}
                      onClick={() => openEditDialog(item)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        openEditDialog(item);
                      }}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{item.nextDueDate ?? "Unset"}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{dueLabel(item)}</span>
                          <span title={item.reminderPolicy.summary} aria-label="Reminder policy">
                            <Info className="size-3.5" />
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{item.title}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">{item.notes}</div>
                        {missingDetailsByItemId.has(item.id) ? (
                          <div
                            data-testid={`calendar-item-missing-details-${item.id}`}
                            className="mt-1 text-xs font-medium text-amber-600"
                          >
                            Missing details
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">{titleCase(item.category)}</td>
                      <td className="px-3 py-2 align-top">{item.providerName ?? "Not set"}</td>
                      <td className="px-3 py-2 align-top">
                        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", item.riskLevel === "critical" && "text-destructive")}>
                          {item.riskLevel === "critical" ? <ShieldAlert className="size-3.5" /> : null}
                          {titleCase(item.riskLevel)}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">{item.amountCents == null ? "-" : money(item.amountCents, item.currency)}</td>
                      <td className="px-3 py-2 align-top">{item.autoRenew ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                        <div>{item.paymentProfileId ? "Registered profile" : item.paymentMethodLabel ?? "-"}</div>
                        <div>{item.costCenter ?? ""}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{item.purchaseEmail ?? "-"}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{item.accountLoginEmail ?? "-"}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{item.billingEmail ?? "-"}</td>
                      <td className="px-3 py-2 align-top"><StatusBadge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <CalendarItemDialog
          open={itemDialogOpen}
          onOpenChange={setItemDialogOpen}
          formKey={dialogFormKey}
          initialForm={initialDialogForm}
          isEditing={isEditing}
          selectedItem={selectedItem}
          selectedDocuments={selectedDocuments}
          selectedActivity={selectedActivity}
          clients={clientsQuery.data?.data ?? []}
          projects={projectsQuery.data ?? []}
          paymentProfiles={paymentProfilesQuery.data ?? []}
          savePending={saveMutation.isPending}
          completePending={completeMutation.isPending}
          onSave={(nextForm) => saveMutation.mutate(nextForm)}
          onComplete={(itemId) => completeMutation.mutate(itemId)}
          onStatusAction={(input) => statusMutation.mutate(input)}
        />
      </div>
    </div>
  );
}
