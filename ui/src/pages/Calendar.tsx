import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CALENDAR_ITEM_CATEGORIES,
  CALENDAR_RECURRENCE_TYPES,
  CALENDAR_RISK_LEVELS,
  type CalendarDashboard,
  type CalendarItem,
  type CalendarItemCategory,
  type CalendarItemStatus,
  type CalendarRecurrenceType,
  type CalendarRiskLevel,
  type CreateCalendarItemInput,
} from "@paperclipai/shared";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Pause,
  Play,
  Search,
  ShieldAlert,
} from "lucide-react";
import { calendarApi } from "../api/calendar";
import { clientsApi } from "../api/clients";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const NO_COMPANY = "__none__";
const NONE = "__none_value__";

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
    timezone: "UTC",
    recurrenceType: "none",
    recurrenceRule: "",
    amount: "",
    currency: "USD",
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
    timezone: form.timezone.trim() || "UTC",
    recurrenceType: form.recurrenceType,
    recurrenceRule: nullable(form.recurrenceRule),
    amountCents: amountToCents(form.amount),
    currency: form.currency.trim().toUpperCase() || "USD",
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

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function daysUntilDue(item: CalendarItem) {
  if (!item.nextDueDate) return null;
  const due = new Date(`${item.nextDueDate}T00:00:00Z`);
  const today = new Date();
  return Math.round((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);
}

function compactToken(value: string) {
  return value.toLowerCase().replace(/[_\s-]+/g, "");
}

function matchesToken(item: CalendarItem, searchText: string, rawToken: string, missingDetailsIds: ReadonlySet<string>) {
  const token = rawToken.trim().toLowerCase();
  if (!token) return true;
  const [prefix, ...rest] = token.split(":");
  const prefixedValue = rest.join(":").trim();
  const dueDiff = daysUntilDue(item);
  const withinDays = (days: number) => dueDiff != null && dueDiff >= 0 && dueDiff <= days;
  if (prefixedValue) {
    const value = compactToken(prefixedValue);
    if (prefix === "status") return compactToken(item.status).includes(value);
    if (prefix === "risk") return compactToken(item.riskLevel).includes(value);
    if (prefix === "category") return compactToken(item.category).includes(value);
    if (prefix === "provider") return compactToken(item.providerName ?? "").includes(value);
    if (prefix === "email") {
      return [item.purchaseEmail, item.accountLoginEmail, item.billingEmail, item.recoveryEmail, item.technicalContactEmail]
        .some((email) => compactToken(email ?? "").includes(value));
    }
    if (prefix === "due") {
      if (value === "overdue") return dueDiff != null && dueDiff < 0;
      if (value === "today") return dueDiff === 0;
      if (value === "7d" || value === "7days") return withinDays(7);
      if (value === "30d" || value === "30days") return withinDays(30);
      return compactToken(item.nextDueDate ?? "").includes(value);
    }
  }
  if (token === "overdue") return item.status === "overdue" || (dueDiff != null && dueDiff < 0);
  if (token === "today") return dueDiff === 0;
  if (token === "7d" || token === "7days") return withinDays(7);
  if (token === "30d" || token === "30days") return withinDays(30);
  if (["critical", "high", "medium", "low"].includes(token)) return item.riskLevel === token;
  if (token === "review") return item.status === "pending_review";
  if (token === "missing") return missingDetailsIds.has(item.id);
  if (token === "autorenew" || token === "auto-renew") return item.autoRenew;
  if (token === "manual") return item.manualActionRequired;
  if (token === "domain") return item.category === "domain";
  if (token === "software") return item.category === "software_subscription";
  if (token === "monthly" || token === "yearly") return item.recurrenceType === token;
  return searchText.includes(token);
}

function requiresGovernedSaveApproval(item: CalendarItem | null, payload: CreateCalendarItemInput) {
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
  return false;
}

function confirmGovernedChange(message: string) {
  return window.confirm(message);
}

function itemSearchText(item: CalendarItem) {
  return [
    item.title,
    item.description,
    item.notes,
    item.internalNotes,
    titleCase(item.category),
    titleCase(item.status),
    titleCase(item.riskLevel),
    item.providerName,
    item.nextDueDate,
    item.dueTime,
    item.timezone,
    item.amountCents == null ? null : formatCents(item.amountCents),
    item.currency,
    item.autoRenew ? "auto renew" : "manual renew",
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

function dashboardMissingDetails(dashboard: CalendarDashboard | undefined) {
  return dashboard?.missingDetails ?? dashboard?.missingMetadata ?? [];
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
          <div className={cn("font-medium tabular-nums", hasFailures && "text-destructive")}>{status?.failedEmails ?? 0}</div>
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

export function Calendar() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ?? NO_COMPANY;
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemFormState>(() => emptyForm());
  const [searchQuery, setSearchQuery] = useState("");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemDialogTab, setItemDialogTab] = useState("overview");
  const [operationError, setOperationError] = useState<string | null>(null);
  const isEditing = selectedItemId !== null;

  useEffect(() => {
    setBreadcrumbs([{ label: "Calendar" }]);
  }, [setBreadcrumbs]);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.calendar.dashboard(companyId),
    queryFn: () => calendarApi.dashboard(companyId),
    enabled: !!selectedCompanyId,
  });
  const itemsQuery = useQuery({
    queryKey: queryKeys.calendar.items(companyId, { limit: 500 }),
    queryFn: () => calendarApi.list(companyId, { limit: 500 }),
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

  const invalidateCalendar = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: ["calendar", selectedCompanyId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const payload = payloadFromForm(form);
      if (!payload.title) throw new Error("Title is required");
      if (isEditing && selectedItemId) {
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
      setForm(formFromItem(item));
      setItemDialogOpen(false);
      setOperationError(null);
      invalidateCalendar();
    },
    onError: (err) => setOperationError(err instanceof Error ? err.message : "Save failed"),
  });

  const completeMutation = useMutation({
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
      setForm(formFromItem(item));
      setOperationError(null);
      invalidateCalendar();
    },
    onError: (err) => setOperationError(err instanceof Error ? err.message : "Complete failed"),
  });
  const statusMutation = useMutation({
    mutationFn: ({ itemId, action }: { itemId: string; action: "pause" | "activate" | "archive" | "cancel" }) => {
      if (action === "pause") return calendarApi.pause(companyId, itemId);
      if (action === "activate") return calendarApi.activate(companyId, itemId);
      if (action === "archive") return calendarApi.archive(companyId, itemId);
      const approvalConfirmed = confirmGovernedChange("Cancelling this calendar item requires operator approval. Continue?");
      if (!approvalConfirmed) throw new Error("Cancellation was not approved");
      return calendarApi.cancel(companyId, itemId, approvalConfirmed);
    },
    onSuccess: (item) => {
      setForm(formFromItem(item));
      setOperationError(null);
      invalidateCalendar();
    },
    onError: (err) => setOperationError(err instanceof Error ? err.message : "Status update failed"),
  });

  const items = itemsQuery.data?.items ?? [];
  const smartSearch = searchQuery.trim().toLowerCase();
  const missingDetails = dashboardMissingDetails(dashboardQuery.data);
  const missingDetailsByItemId = useMemo(() => {
    return new Map(missingDetails.map((finding) => [finding.itemId, finding]));
  }, [missingDetails]);
  const missingDetailsIds = useMemo(() => new Set(missingDetails.map((finding) => finding.itemId)), [missingDetails]);
  const searchRows = useMemo(() => items.map((item) => ({
    item,
    searchText: itemSearchText(item),
  })), [items]);
  const visibleItems = useMemo(() => {
    if (!smartSearch) return searchRows.map((row) => row.item);
    const terms = smartSearch.split(/\s+/).filter(Boolean);
    return searchRows
      .filter((row) => terms.every((term) => matchesToken(row.item, row.searchText, term, missingDetailsIds)))
      .map((row) => row.item);
  }, [missingDetailsIds, searchRows, smartSearch]);
  const selectedItem = detailQuery.data ?? items.find((item) => item.id === selectedItemId) ?? null;

  const openCreateDialog = () => {
    setSelectedItemId(null);
    setForm(emptyForm());
    setItemDialogTab("overview");
    setOperationError(null);
    setItemDialogOpen(true);
  };

  const openEditDialog = (item: CalendarItem) => {
    setSelectedItemId(item.id);
    setForm(formFromItem(item));
    setItemDialogTab("overview");
    setOperationError(null);
    setItemDialogOpen(true);
  };

  const openItemById = (itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId);
    setSelectedItemId(itemId);
    if (item) {
      setForm(formFromItem(item));
    }
    setItemDialogTab("overview");
    setOperationError(null);
    setItemDialogOpen(true);
  };

  useEffect(() => {
    if (!itemDialogOpen || !selectedItem) return;
    setForm(formFromItem(selectedItem));
  }, [itemDialogOpen, selectedItem?.id]);

  if (!selectedCompanyId) {
    return <EmptyState icon={CalendarDays} message="Create or select a company to manage calendar obligations." />;
  }

  if (dashboardQuery.isLoading && itemsQuery.isLoading) {
    return <PageSkeleton />;
  }

  const dashboard = dashboardQuery.data;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Obligations, renewals, documents, and reminder work.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openCreateDialog}>
            <CalendarDays className="mr-2 h-4 w-4" />
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

      <div className="min-h-0 flex-1">
        <Card className="min-h-0">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Items</CardTitle>
              <div className="relative w-full sm:w-96">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-9 pl-8"
                  placeholder="Search calendar items"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 overflow-auto p-0">
            {visibleItems.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={CalendarDays} message={items.length === 0 ? "Create an item to start tracking obligations." : "No calendar items match this search."} />
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
                  {visibleItems.map((item) => (
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
                        <div className="text-xs text-muted-foreground">{dueLabel(item)}</div>
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
                          {item.riskLevel === "critical" ? <ShieldAlert className="h-3.5 w-3.5" /> : null}
                          {titleCase(item.riskLevel)}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">{item.amountCents == null ? "-" : formatCents(item.amountCents)}</td>
                      <td className="px-3 py-2 align-top">{item.autoRenew ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                        <div>{item.paymentMethodLabel ?? "-"}</div>
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

        <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
            <DialogHeader className="border-b border-border px-6 py-4 pr-12">
              <div className="flex items-center justify-between gap-3">
                <DialogTitle>{isEditing ? "Item Detail" : "New Item"}</DialogTitle>
                {selectedItem ? <StatusBadge status={selectedItem.status} /> : null}
              </div>
              <DialogDescription>
                Track the due date, owner, payment, account, and proof details for this obligation.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 overflow-y-auto px-6 py-4">
              <Tabs value={itemDialogTab} onValueChange={setItemDialogTab} className="gap-4">
                <TabsList variant="line" className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="overview" data-testid="calendar-tab-overview" onClick={() => setItemDialogTab("overview")}>Overview</TabsTrigger>
                  <TabsTrigger value="payment" data-testid="calendar-tab-payment" onClick={() => setItemDialogTab("payment")}>Payment</TabsTrigger>
                  <TabsTrigger value="contacts" data-testid="calendar-tab-contacts" onClick={() => setItemDialogTab("contacts")}>Contacts</TabsTrigger>
                  <TabsTrigger value="links" data-testid="calendar-tab-links" onClick={() => setItemDialogTab("links")}>Links</TabsTrigger>
                  <TabsTrigger value="notes" data-testid="calendar-tab-notes" onClick={() => setItemDialogTab("notes")}>Notes</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="grid gap-3 md:grid-cols-2">
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
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Due Date">
                      <Input type="date" value={form.nextDueDate} onChange={(event) => setForm((current) => ({ ...current, nextDueDate: event.target.value }))} />
                    </Field>
                    <Field label="Due Time">
                      <Input value={form.dueTime} placeholder="HH:mm" onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Timezone">
                      <Input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} />
                    </Field>
                    <Field label="Recurrence">
                      <Select value={form.recurrenceType} onValueChange={(recurrenceType) => setForm((current) => ({ ...current, recurrenceType: recurrenceType as CalendarRecurrenceType }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CALENDAR_RECURRENCE_TYPES.map((type) => <SelectItem key={type} value={type}>{titleCase(type)}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                  </div>
                  {form.recurrenceType === "custom_rrule" ? (
                    <Field label="Recurrence Rule">
                      <Input value={form.recurrenceRule} placeholder="FREQ=MONTHLY;INTERVAL=1" onChange={(event) => setForm((current) => ({ ...current, recurrenceRule: event.target.value }))} />
                    </Field>
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
                          {(clientsQuery.data?.data ?? []).map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Project">
                      <Select value={form.relatedProjectId || NONE} onValueChange={(relatedProjectId) => setForm((current) => ({ ...current, relatedProjectId: relatedProjectId === NONE ? "" : relatedProjectId }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>None</SelectItem>
                          {(projectsQuery.data ?? []).map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </TabsContent>
                <TabsContent value="payment" className="grid gap-3 md:grid-cols-2">
                  <div className="grid grid-cols-[1fr_90px] gap-3">
                    <Field label="Amount">
                      <Input inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
                    </Field>
                    <Field label="Currency">
                      <Input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))} />
                    </Field>
                  </div>
                  <Field label="Payment Method"><Input value={form.paymentMethodLabel} onChange={(event) => setForm((current) => ({ ...current, paymentMethodLabel: event.target.value }))} /></Field>
                  <Field label="Payment Owner"><Input value={form.paymentOwner} onChange={(event) => setForm((current) => ({ ...current, paymentOwner: event.target.value }))} /></Field>
                  <Field label="Cost Center"><Input value={form.costCenter} onChange={(event) => setForm((current) => ({ ...current, costCenter: event.target.value }))} /></Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.autoRenew}
                      onChange={(event) => setForm((current) => ({ ...current, autoRenew: event.target.checked }))}
                    />
                    Auto-renew
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.manualActionRequired}
                      onChange={(event) => setForm((current) => ({ ...current, manualActionRequired: event.target.checked }))}
                    />
                    Manual action required
                  </label>
                </TabsContent>
                <TabsContent value="contacts" className="grid gap-3 md:grid-cols-2">
                  <Field label="Purchase Email"><Input value={form.purchaseEmail} onChange={(event) => setForm((current) => ({ ...current, purchaseEmail: event.target.value }))} /></Field>
                  <Field label="Login Email"><Input value={form.accountLoginEmail} onChange={(event) => setForm((current) => ({ ...current, accountLoginEmail: event.target.value }))} /></Field>
                  <Field label="Billing Email"><Input value={form.billingEmail} onChange={(event) => setForm((current) => ({ ...current, billingEmail: event.target.value }))} /></Field>
                  <Field label="Recovery Email"><Input value={form.recoveryEmail} onChange={(event) => setForm((current) => ({ ...current, recoveryEmail: event.target.value }))} /></Field>
                  <Field label="Technical Contact"><Input value={form.technicalContactEmail} onChange={(event) => setForm((current) => ({ ...current, technicalContactEmail: event.target.value }))} /></Field>
                </TabsContent>
                <TabsContent value="links" className="grid gap-3 md:grid-cols-2">
                  <Field label="Service URL"><Input value={form.serviceUrl} onChange={(event) => setForm((current) => ({ ...current, serviceUrl: event.target.value }))} /></Field>
                  <Field label="Login URL"><Input value={form.loginUrl} onChange={(event) => setForm((current) => ({ ...current, loginUrl: event.target.value }))} /></Field>
                  <Field label="Billing URL"><Input value={form.billingUrl} onChange={(event) => setForm((current) => ({ ...current, billingUrl: event.target.value }))} /></Field>
                  <Field label="Documentation URL"><Input value={form.documentationUrl} onChange={(event) => setForm((current) => ({ ...current, documentationUrl: event.target.value }))} /></Field>
                </TabsContent>
                <TabsContent value="notes" className="grid gap-3">
                  <Field label="Notes">
                    <Textarea rows={5} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
                  </Field>
                  <Field label="Internal Notes">
                    <Textarea rows={5} value={form.internalNotes} onChange={(event) => setForm((current) => ({ ...current, internalNotes: event.target.value }))} />
                  </Field>
                </TabsContent>
              </Tabs>
            </div>
            <DialogFooter className="border-t border-border px-6 py-4">
              <div className="flex flex-1 flex-wrap gap-2">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {isEditing ? "Save" : "Create"}
                </Button>
                {selectedItem ? (
                  <>
                    <Button variant="outline" onClick={() => completeMutation.mutate(selectedItem.id)} disabled={completeMutation.isPending}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Complete
                    </Button>
                    {selectedItem.status === "paused" || selectedItem.status === "pending_review" ? (
                      <Button variant="outline" onClick={() => statusMutation.mutate({ itemId: selectedItem.id, action: "activate" })}>
                        <Play className="mr-2 h-4 w-4" /> Activate
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => statusMutation.mutate({ itemId: selectedItem.id, action: "pause" })}>
                        <Pause className="mr-2 h-4 w-4" /> Pause
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => statusMutation.mutate({ itemId: selectedItem.id, action: "archive" })}>
                      <Archive className="mr-2 h-4 w-4" /> Archive
                    </Button>
                  </>
                ) : null}
              </div>
            </DialogFooter>

          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
