import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CALENDAR_ITEM_CATEGORIES,
  CALENDAR_ITEM_STATUSES,
  CALENDAR_RECURRENCE_TYPES,
  CALENDAR_RISK_LEVELS,
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
  ClipboardCheck,
  Pause,
  Play,
  RefreshCw,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NO_COMPANY = "__none__";
const ALL = "__all__";
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

function BucketTile({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "danger" | "warn" }) {
  return (
    <div className={cn(
      "border border-border p-4",
      tone === "danger" && "border-destructive/40 bg-destructive/5",
      tone === "warn" && "border-amber-500/40 bg-amber-500/5",
    )}>
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
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

export function Calendar() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ?? NO_COMPANY;
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<ItemFormState>(() => emptyForm());
  const [filters, setFilters] = useState({
    status: ALL,
    category: ALL,
    riskLevel: ALL,
    autoRenew: ALL,
    provider: "",
    paymentMethod: "",
    purchaseEmail: "",
    billingEmail: "",
    dueFrom: "",
    dueTo: "",
    relatedClientId: ALL,
    relatedProjectId: ALL,
  });
  const [operationError, setOperationError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Calendar" }]);
  }, [setBreadcrumbs]);

  const normalizedFilters = useMemo(() => ({
    status: filters.status === ALL ? undefined : filters.status,
    category: filters.category === ALL ? undefined : filters.category,
    riskLevel: filters.riskLevel === ALL ? undefined : filters.riskLevel,
    autoRenew: filters.autoRenew === ALL ? undefined : filters.autoRenew === "true",
    provider: filters.provider || undefined,
    paymentMethod: filters.paymentMethod || undefined,
    purchaseEmail: filters.purchaseEmail || undefined,
    billingEmail: filters.billingEmail || undefined,
    dueFrom: filters.dueFrom || undefined,
    dueTo: filters.dueTo || undefined,
    relatedClientId: filters.relatedClientId === ALL ? undefined : filters.relatedClientId,
    relatedProjectId: filters.relatedProjectId === ALL ? undefined : filters.relatedProjectId,
    limit: 200,
  }), [filters]);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.calendar.dashboard(companyId),
    queryFn: () => calendarApi.dashboard(companyId),
    enabled: !!selectedCompanyId,
  });
  const itemsQuery = useQuery({
    queryKey: queryKeys.calendar.items(companyId, normalizedFilters),
    queryFn: () => calendarApi.list(companyId, normalizedFilters),
    enabled: !!selectedCompanyId,
  });
  const detailQuery = useQuery({
    queryKey: selectedItemId ? queryKeys.calendar.detail(companyId, selectedItemId) : ["calendar", companyId, "no-detail"],
    queryFn: () => calendarApi.detail(companyId, selectedItemId!),
    enabled: !!selectedCompanyId && !!selectedItemId,
  });
  const clientsQuery = useQuery({
    queryKey: queryKeys.clients.list(companyId),
    queryFn: () => clientsApi.list(companyId, { limit: 200 }),
    enabled: !!selectedCompanyId,
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
    enabled: !!selectedCompanyId,
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
      if (formMode === "edit" && selectedItemId) {
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
      setFormMode("edit");
      setForm(formFromItem(item));
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
  const scanMutation = useMutation({
    mutationFn: async (kind: "reminders" | "metadata") => {
      if (kind === "reminders") {
        await calendarApi.runReminderScan(companyId, { createIssues: true, sendEmail: false });
        return;
      }
      await calendarApi.runMetadataScan(companyId);
    },
    onSuccess: () => {
      setOperationError(null);
      invalidateCalendar();
    },
    onError: (err) => setOperationError(err instanceof Error ? err.message : "Scan failed"),
  });

  const items = itemsQuery.data?.items ?? [];
  const selectedItem = detailQuery.data ?? items.find((item) => item.id === selectedItemId) ?? null;

  useEffect(() => {
    if (formMode !== "edit" || !selectedItem) return;
    setForm(formFromItem(selectedItem));
  }, [formMode, selectedItem?.id]);

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
          <Button variant="outline" size="sm" onClick={() => scanMutation.mutate("metadata")} disabled={scanMutation.isPending}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Metadata Scan
          </Button>
          <Button variant="outline" size="sm" onClick={() => scanMutation.mutate("reminders")} disabled={scanMutation.isPending}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reminder Scan
          </Button>
          <Button size="sm" onClick={() => { setFormMode("create"); setSelectedItemId(null); setForm(emptyForm()); }}>
            <CalendarDays className="mr-2 h-4 w-4" />
            New Item
          </Button>
        </div>
      </div>

      {operationError ? (
        <div className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{operationError}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <BucketTile label="Overdue" value={dashboard?.overdue.count ?? 0} tone={(dashboard?.overdue.count ?? 0) > 0 ? "danger" : "default"} />
        <BucketTile label="Today" value={dashboard?.dueToday.count ?? 0} tone={(dashboard?.dueToday.count ?? 0) > 0 ? "warn" : "default"} />
        <BucketTile label="7 days" value={dashboard?.dueIn7Days.count ?? 0} />
        <BucketTile label="30 days" value={dashboard?.dueIn30Days.count ?? 0} />
        <BucketTile label="Critical" value={dashboard?.criticalItems.count ?? 0} tone={(dashboard?.criticalItems.count ?? 0) > 0 ? "danger" : "default"} />
        <BucketTile label="Review" value={dashboard?.pendingReview.count ?? 0} />
        <BucketTile label="Missing" value={dashboard?.missingMetadata.length ?? 0} tone={(dashboard?.missingMetadata.length ?? 0) > 0 ? "warn" : "default"} />
        <BucketTile label="30d Cost" value={formatCents(dashboard?.costSummary.upcoming30DaysCents ?? 0)} />
      </div>

      {dashboard?.missingMetadata.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Missing Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {dashboard.missingMetadata.slice(0, 9).map((finding) => (
              <button
                key={finding.itemId}
                type="button"
                className="border border-border p-3 text-left text-sm hover:bg-muted/40"
                onClick={() => { setSelectedItemId(finding.itemId); setFormMode("edit"); }}
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

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="min-h-0">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Items</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="h-9 w-52 pl-8"
                    placeholder="Provider"
                    value={filters.provider}
                    onChange={(event) => setFilters((current) => ({ ...current, provider: event.target.value }))}
                  />
                </div>
                <Select value={filters.status} onValueChange={(status) => setFilters((current) => ({ ...current, status }))}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All status</SelectItem>
                    {CALENDAR_ITEM_STATUSES.map((status) => <SelectItem key={status} value={status}>{titleCase(status)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.category} onValueChange={(category) => setFilters((current) => ({ ...current, category }))}>
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All categories</SelectItem>
                    {CALENDAR_ITEM_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{titleCase(category)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.riskLevel} onValueChange={(riskLevel) => setFilters((current) => ({ ...current, riskLevel }))}>
                  <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All risk</SelectItem>
                    {CALENDAR_RISK_LEVELS.map((risk) => <SelectItem key={risk} value={risk}>{titleCase(risk)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.autoRenew} onValueChange={(autoRenew) => setFilters((current) => ({ ...current, autoRenew }))}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any renew</SelectItem>
                    <SelectItem value="true">Auto-renew</SelectItem>
                    <SelectItem value="false">Manual</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-9 w-40"
                  type="date"
                  value={filters.dueFrom}
                  onChange={(event) => setFilters((current) => ({ ...current, dueFrom: event.target.value }))}
                />
                <Input
                  className="h-9 w-40"
                  type="date"
                  value={filters.dueTo}
                  onChange={(event) => setFilters((current) => ({ ...current, dueTo: event.target.value }))}
                />
                <Input
                  className="h-9 w-44"
                  placeholder="Payment method"
                  value={filters.paymentMethod}
                  onChange={(event) => setFilters((current) => ({ ...current, paymentMethod: event.target.value }))}
                />
                <Input
                  className="h-9 w-44"
                  placeholder="Purchase email"
                  value={filters.purchaseEmail}
                  onChange={(event) => setFilters((current) => ({ ...current, purchaseEmail: event.target.value }))}
                />
                <Input
                  className="h-9 w-44"
                  placeholder="Billing email"
                  value={filters.billingEmail}
                  onChange={(event) => setFilters((current) => ({ ...current, billingEmail: event.target.value }))}
                />
                <Select value={filters.relatedClientId} onValueChange={(relatedClientId) => setFilters((current) => ({ ...current, relatedClientId }))}>
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All clients</SelectItem>
                    {(clientsQuery.data?.data ?? []).map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.relatedProjectId} onValueChange={(relatedProjectId) => setFilters((current) => ({ ...current, relatedProjectId }))}>
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All projects</SelectItem>
                    {(projectsQuery.data ?? []).map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 overflow-auto p-0">
            {items.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={CalendarDays} message="Create an item to start tracking obligations." />
              </div>
            ) : (
              <table className="w-full min-w-[1280px] text-sm">
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
                      className={cn("cursor-pointer border-b border-border hover:bg-muted/40", selectedItemId === item.id && "bg-muted")}
                      onClick={() => { setSelectedItemId(item.id); setFormMode("edit"); setForm(formFromItem(item)); }}
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">{item.nextDueDate ?? "Unset"}</div>
                        <div className="text-xs text-muted-foreground">{dueLabel(item)}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">{item.title}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">{item.notes}</div>
                      </td>
                      <td className="px-4 py-3 align-top">{titleCase(item.category)}</td>
                      <td className="px-4 py-3 align-top">{item.providerName ?? "Not set"}</td>
                      <td className="px-4 py-3 align-top">
                        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", item.riskLevel === "critical" && "text-destructive")}>
                          {item.riskLevel === "critical" ? <ShieldAlert className="h-3.5 w-3.5" /> : null}
                          {titleCase(item.riskLevel)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">{item.amountCents == null ? "-" : formatCents(item.amountCents)}</td>
                      <td className="px-4 py-3 align-top">{item.autoRenew ? "Yes" : "No"}</td>
                      <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                        <div>{item.paymentMethodLabel ?? "-"}</div>
                        <div>{item.costCenter ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-muted-foreground">{item.purchaseEmail ?? "-"}</td>
                      <td className="px-4 py-3 align-top text-xs text-muted-foreground">{item.accountLoginEmail ?? "-"}</td>
                      <td className="px-4 py-3 align-top text-xs text-muted-foreground">{item.billingEmail ?? "-"}</td>
                      <td className="px-4 py-3 align-top"><StatusBadge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <div className="min-h-0 overflow-auto">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">{formMode === "edit" ? "Item Detail" : "New Item"}</CardTitle>
              {selectedItem ? <StatusBadge status={selectedItem.status} /> : null}
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3">
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
                <div className="grid grid-cols-[1fr_90px] gap-3">
                  <Field label="Amount">
                    <Input inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
                  </Field>
                  <Field label="Currency">
                    <Input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))} />
                  </Field>
                </div>
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
                <div className="grid gap-3">
                  <Field label="Payment Method"><Input value={form.paymentMethodLabel} onChange={(event) => setForm((current) => ({ ...current, paymentMethodLabel: event.target.value }))} /></Field>
                  <Field label="Payment Owner"><Input value={form.paymentOwner} onChange={(event) => setForm((current) => ({ ...current, paymentOwner: event.target.value }))} /></Field>
                  <Field label="Cost Center"><Input value={form.costCenter} onChange={(event) => setForm((current) => ({ ...current, costCenter: event.target.value }))} /></Field>
                </div>
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
                <div className="grid gap-3">
                  <Field label="Purchase Email"><Input value={form.purchaseEmail} onChange={(event) => setForm((current) => ({ ...current, purchaseEmail: event.target.value }))} /></Field>
                  <Field label="Login Email"><Input value={form.accountLoginEmail} onChange={(event) => setForm((current) => ({ ...current, accountLoginEmail: event.target.value }))} /></Field>
                  <Field label="Billing Email"><Input value={form.billingEmail} onChange={(event) => setForm((current) => ({ ...current, billingEmail: event.target.value }))} /></Field>
                  <Field label="Recovery Email"><Input value={form.recoveryEmail} onChange={(event) => setForm((current) => ({ ...current, recoveryEmail: event.target.value }))} /></Field>
                  <Field label="Technical Contact"><Input value={form.technicalContactEmail} onChange={(event) => setForm((current) => ({ ...current, technicalContactEmail: event.target.value }))} /></Field>
                </div>
                <div className="grid gap-3">
                  <Field label="Service URL"><Input value={form.serviceUrl} onChange={(event) => setForm((current) => ({ ...current, serviceUrl: event.target.value }))} /></Field>
                  <Field label="Login URL"><Input value={form.loginUrl} onChange={(event) => setForm((current) => ({ ...current, loginUrl: event.target.value }))} /></Field>
                  <Field label="Billing URL"><Input value={form.billingUrl} onChange={(event) => setForm((current) => ({ ...current, billingUrl: event.target.value }))} /></Field>
                  <Field label="Documentation URL"><Input value={form.documentationUrl} onChange={(event) => setForm((current) => ({ ...current, documentationUrl: event.target.value }))} /></Field>
                </div>
                <Field label="Notes">
                  <Textarea rows={4} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
                </Field>
                <Field label="Internal Notes">
                  <Textarea rows={3} value={form.internalNotes} onChange={(event) => setForm((current) => ({ ...current, internalNotes: event.target.value }))} />
                </Field>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {formMode === "edit" ? "Save" : "Create"}
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

              {selectedItem ? (
                <div className="border-t border-border pt-4">
                  <div className="mb-2 text-sm font-medium">Documents</div>
                  {detailQuery.data?.documents.length ? (
                    <div className="grid gap-2">
                      {detailQuery.data.documents.map((doc) => (
                        <div key={doc.id} className="border border-border p-2 text-sm">
                          <div className="font-medium">{doc.title ?? titleCase(doc.documentType)}</div>
                          <div className="text-xs text-muted-foreground">{doc.url ?? doc.documentId ?? doc.assetId ?? doc.sourceEmailAttachmentId}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No documents linked.</div>
                  )}
                </div>
              ) : null}
              {selectedItem ? (
                <div className="border-t border-border pt-4">
                  <div className="mb-2 text-sm font-medium">History</div>
                  {detailQuery.data?.activity.length ? (
                    <div className="grid gap-2">
                      {detailQuery.data.activity.map((entry) => (
                        <div key={entry.id} className="border border-border p-2 text-sm">
                          <div className="font-medium">{entry.action.replaceAll("_", " ").replaceAll(".", " ")}</div>
                          <div className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No activity recorded.</div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
