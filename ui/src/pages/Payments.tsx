import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, ReceiptText, WalletCards } from "lucide-react";
import { PAYMENT_METHODS, type PaymentEntry, type PaymentEntrySortField, type PaymentMethod, type PaymentProfile, type PaymentRecord } from "@paperclipai/shared";
import { paymentsApi } from "../api/payments";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const NO_COMPANY = "__none__";
const NONE = "__none__";
const EMPTY_PROFILE_FORM = { method: "credit_card" as PaymentMethod, accountLabel: "", ownerName: "", notes: "", active: true };

const moneyFormatters = new Map<string, Intl.NumberFormat>();
function getMoneyFormatter(currency: string) {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
    moneyFormatters.set(currency, formatter);
  }
  return formatter;
}

function money(cents: number | null | undefined, currency = "BRL") {
  if (cents == null) return "-";
  try {
    return getMoneyFormatter(currency).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function moneyTotals(totals: Array<{ currency: string; amountCents: number }> | null | undefined) {
  if (!totals || totals.length === 0) return "-";
  return totals.map((total) => money(total.amountCents, total.currency)).join(" / ");
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function cents(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function profileLabel(profile: { method: string; accountLabel: string; ownerName?: string | null }) {
  return `${titleCase(profile.method)} · ${profile.accountLabel}${profile.ownerName ? ` · ${profile.ownerName}` : ""}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function Payments() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? NO_COMPANY;

  const [tab, setTab] = useState<"open" | "paid" | "profiles">("open");
  const [q, setQ] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [payingEntry, setPayingEntry] = useState<PaymentEntry | null>(null);
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<PaymentRecord | null>(null);
  const [profileForm, setProfileForm] = useState({ ...EMPTY_PROFILE_FORM });
  const [entryForm, setEntryForm] = useState({ title: "", providerName: "", dueDate: "", amount: "", currency: "BRL", paymentProfileId: "", notes: "" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", currency: "BRL", paidAt: "", paymentProfileId: "", proofUrl: "", notes: "", approvalConfirmed: false });
  const [recordForm, setRecordForm] = useState({ amount: "", currency: "BRL", paidAt: "", paymentProfileId: "", proofUrl: "", notes: "", approvalConfirmed: false });
  const [filterProfileId, setFilterProfileId] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [sort, setSort] = useState<{ field: PaymentEntrySortField; dir: "asc" | "desc" }>({ field: "dueDate", dir: "asc" });
  const [operationError, setOperationError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Payments" }]);
  }, [setBreadcrumbs]);

  const entryFilters = useMemo(() => ({
    q: q.trim() || undefined,
    status: tab === "paid" ? "paid" : "open,partially_paid",
    profileId: filterProfileId || undefined,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
    sort: sort.field,
    dir: sort.dir,
    limit: 500,
  }), [q, tab, filterProfileId, dueFrom, dueTo, sort]);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.payments.dashboard(companyId),
    queryFn: () => paymentsApi.dashboard(companyId),
    enabled: !!selectedCompanyId,
  });
  const profilesQuery = useQuery({
    queryKey: queryKeys.payments.profiles(companyId),
    queryFn: () => paymentsApi.profiles(companyId),
    enabled: !!selectedCompanyId,
  });
  const entriesQuery = useQuery({
    queryKey: queryKeys.payments.entries(companyId, entryFilters),
    queryFn: () => paymentsApi.entries(companyId, entryFilters),
    enabled: !!selectedCompanyId,
  });
  const detailQuery = useQuery({
    queryKey: detailEntryId ? queryKeys.payments.detail(companyId, detailEntryId) : ["payments", companyId, "no-detail"],
    queryFn: () => paymentsApi.detail(companyId, detailEntryId!),
    enabled: !!selectedCompanyId && !!detailEntryId,
  });

  const invalidatePayments = () => {
    queryClient.invalidateQueries({ queryKey: ["payments", companyId] });
    queryClient.invalidateQueries({ queryKey: ["calendar", companyId] });
  };

  const profileMutation = useMutation({
    onMutate: () => setOperationError(null),
    mutationFn: () => {
      const payload = {
        method: profileForm.method,
        accountLabel: profileForm.accountLabel,
        ownerName: profileForm.ownerName || null,
        notes: profileForm.notes || null,
        active: profileForm.active,
      };
      return editingProfileId
        ? paymentsApi.updateProfile(companyId, editingProfileId, payload)
        : paymentsApi.createProfile(companyId, payload);
    },
    onSuccess: () => {
      setProfileDialogOpen(false);
      setEditingProfileId(null);
      setProfileForm({ ...EMPTY_PROFILE_FORM });
      invalidatePayments();
    },
    onError: (error) => setOperationError(errorMessage(error, "Payment profile save failed")),
  });
  const entryMutation = useMutation({
    onMutate: () => setOperationError(null),
    mutationFn: () => paymentsApi.createEntry(companyId, {
      title: entryForm.title,
      providerName: entryForm.providerName || null,
      dueDate: entryForm.dueDate || null,
      expectedAmountCents: cents(entryForm.amount),
      currency: entryForm.currency || "BRL",
      paymentProfileId: entryForm.paymentProfileId || null,
      notes: entryForm.notes || null,
    }),
    onSuccess: () => {
      setEntryDialogOpen(false);
      setEntryForm({ title: "", providerName: "", dueDate: "", amount: "", currency: "BRL", paymentProfileId: "", notes: "" });
      invalidatePayments();
    },
    onError: (error) => setOperationError(errorMessage(error, "Payment entry save failed")),
  });
  const recordMutation = useMutation({
    onMutate: () => setOperationError(null),
    mutationFn: () => paymentsApi.recordPayment(companyId, payingEntry!.id, {
      amountCents: cents(paymentForm.amount) ?? 0,
      currency: paymentForm.currency || payingEntry!.currency,
      paidAt: paymentForm.paidAt ? new Date(`${paymentForm.paidAt}T12:00:00.000Z`).toISOString() : undefined,
      paymentProfileId: paymentForm.paymentProfileId === "" ? null : paymentForm.paymentProfileId,
      proofUrl: paymentForm.proofUrl || null,
      notes: paymentForm.notes || null,
      approvalConfirmed: paymentForm.approvalConfirmed,
    }),
    onSuccess: () => {
      setPayingEntry(null);
      setPaymentForm({ amount: "", currency: "BRL", paidAt: "", paymentProfileId: "", proofUrl: "", notes: "", approvalConfirmed: false });
      invalidatePayments();
    },
    onError: (error) => setOperationError(errorMessage(error, "Payment record failed")),
  });
  const recordEditMutation = useMutation({
    onMutate: () => setOperationError(null),
    mutationFn: () => paymentsApi.updateRecord(companyId, editingRecord!.paymentEntryId, editingRecord!.id, {
      amountCents: cents(recordForm.amount) ?? 0,
      currency: recordForm.currency || undefined,
      paidAt: recordForm.paidAt ? new Date(`${recordForm.paidAt}T12:00:00.000Z`).toISOString() : undefined,
      paymentProfileId: recordForm.paymentProfileId === "" ? null : recordForm.paymentProfileId,
      proofUrl: recordForm.proofUrl || null,
      notes: recordForm.notes || null,
      approvalConfirmed: recordForm.approvalConfirmed,
    }),
    onSuccess: () => {
      setEditingRecord(null);
      invalidatePayments();
    },
    onError: (error) => setOperationError(errorMessage(error, "Payment record update failed")),
  });
  const recordDeleteMutation = useMutation({
    onMutate: () => setOperationError(null),
    mutationFn: (record: PaymentRecord) => paymentsApi.deleteRecord(companyId, record.paymentEntryId, record.id),
    onSuccess: () => invalidatePayments(),
    onError: (error) => setOperationError(errorMessage(error, "Payment record delete failed")),
  });

  const openProfileCreate = () => {
    setOperationError(null);
    setEditingProfileId(null);
    setProfileForm({ ...EMPTY_PROFILE_FORM });
    setProfileDialogOpen(true);
  };
  const openProfileEdit = (profile: PaymentProfile) => {
    setOperationError(null);
    setEditingProfileId(profile.id);
    setProfileForm({
      method: profile.method,
      accountLabel: profile.accountLabel,
      ownerName: profile.ownerName ?? "",
      notes: profile.notes ?? "",
      active: profile.active,
    });
    setProfileDialogOpen(true);
  };
  const openRecordEdit = (record: PaymentRecord) => {
    setOperationError(null);
    setRecordForm({
      amount: String(record.amountCents / 100),
      currency: record.currency,
      paidAt: record.paidAt.slice(0, 10),
      paymentProfileId: record.paymentProfileId ?? "",
      proofUrl: record.proofUrl ?? "",
      notes: record.notes ?? "",
      approvalConfirmed: false,
    });
    setEditingRecord(record);
  };
  const toggleSort = (field: PaymentEntrySortField) => {
    setSort((current) => current.field === field
      ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
      : { field, dir: "asc" });
  };

  const entries = entriesQuery.data?.entries ?? [];
  const profiles = profilesQuery.data ?? [];
  const detailEntry = detailQuery.data ?? null;

  if (!selectedCompanyId) {
    return <EmptyState icon={ReceiptText} message="Create or select a company to track payments." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Payments</h1>
          <p className="text-sm text-muted-foreground">Calendar-linked payables, standalone payments, and reusable payment profiles.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openProfileCreate}><WalletCards className="mr-2 size-4" />Profile</Button>
          <Button onClick={() => { setOperationError(null); setEntryDialogOpen(true); }}><Plus className="mr-2 size-4" />Payment</Button>
        </div>
      </div>

      {operationError ? (
        <div className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{operationError}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-6">
        {[
          ["Open", dashboardQuery.data?.openCount ?? 0],
          ["Overdue", dashboardQuery.data?.overdueCount ?? 0],
          ["Due 7d", dashboardQuery.data?.dueSoonCount ?? 0],
          ["Partial", dashboardQuery.data?.partiallyPaidCount ?? 0],
          ["Open balance", moneyTotals(dashboardQuery.data?.openBalances)],
          ["Paid month", moneyTotals(dashboardQuery.data?.paidThisMonth)],
        ].map(([label, value]) => (
          <div key={label} className="border border-border p-3">
            <div className="text-xs uppercase text-muted-foreground">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="min-h-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="open">Payables</TabsTrigger>
            <TabsTrigger value="paid">Paid history</TabsTrigger>
            <TabsTrigger value="profiles">Profiles</TabsTrigger>
          </TabsList>
          {tab !== "profiles" ? (
            <Input className="w-full sm:w-72" placeholder="Filter payments" value={q} onChange={(event) => setQ(event.target.value)} />
          ) : null}
        </div>

        {tab !== "profiles" ? (
          <div className="mt-3 flex flex-wrap items-end gap-3 border border-border bg-muted/20 p-3">
            <div className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Profile</span>
              <Select value={filterProfileId || NONE} onValueChange={(value) => setFilterProfileId(value === NONE ? "" : value)}>
                <SelectTrigger className="w-56"><SelectValue placeholder="All profiles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All profiles</SelectItem>
                  {profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profileLabel(profile)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Due from</span>
              <Input type="date" className="w-40" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} />
            </div>
            <div className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Due to</span>
              <Input type="date" className="w-40" value={dueTo} onChange={(event) => setDueTo(event.target.value)} />
            </div>
            {(filterProfileId || dueFrom || dueTo) ? (
              <Button variant="ghost" size="sm" onClick={() => { setFilterProfileId(""); setDueFrom(""); setDueTo(""); }}>Clear filters</Button>
            ) : null}
          </div>
        ) : null}

        <TabsContent value="open" className="mt-3 min-h-0">
          <PaymentTable entries={entries} sort={sort} onSort={toggleSort} onDetails={setDetailEntryId} onPay={(entry) => {
            setOperationError(null);
            setPayingEntry(entry);
            setPaymentForm({
              amount: entry.expectedAmountCents == null ? "" : String(Math.max(entry.expectedAmountCents - entry.paidAmountCents, 0) / 100),
              currency: entry.currency,
              paidAt: new Date().toISOString().slice(0, 10),
              paymentProfileId: entry.paymentProfileId ?? "",
              proofUrl: "",
              notes: "",
              approvalConfirmed: false,
            });
          }} />
        </TabsContent>
        <TabsContent value="paid" className="mt-3 min-h-0">
          <PaymentTable entries={entries} sort={sort} onSort={toggleSort} onDetails={setDetailEntryId} onPay={() => {}} paid />
        </TabsContent>
        <TabsContent value="profiles" className="mt-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {profiles.map((profile) => (
              <div key={profile.id} className={cn("flex items-start justify-between gap-2 border border-border p-3", !profile.active && "opacity-60")}>
                <div className="min-w-0">
                  <div className="truncate font-medium">{profileLabel(profile)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{profile.notes || "No notes"}</div>
                  {!profile.active ? <div className="mt-1 text-xs text-muted-foreground">Inactive</div> : null}
                </div>
                <Button variant="outline" size="sm" onClick={() => openProfileEdit(profile)}>Edit</Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={profileDialogOpen} onOpenChange={(open) => { setProfileDialogOpen(open); if (!open) setEditingProfileId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingProfileId ? "Edit payment profile" : "Payment profile"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Method">
              <Select value={profileForm.method} onValueChange={(method) => setProfileForm((current) => ({ ...current, method: method as PaymentMethod }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{titleCase(method)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Account"><Input value={profileForm.accountLabel} onChange={(event) => setProfileForm((current) => ({ ...current, accountLabel: event.target.value }))} /></Field>
            <Field label="Owner"><Input value={profileForm.ownerName} onChange={(event) => setProfileForm((current) => ({ ...current, ownerName: event.target.value }))} /></Field>
            <Field label="Notes"><Textarea value={profileForm.notes} onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={profileForm.active} onChange={(event) => setProfileForm((current) => ({ ...current, active: event.target.checked }))} />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => profileMutation.mutate()} disabled={!profileForm.accountLabel.trim() || profileMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Standalone payment</DialogTitle></DialogHeader>
          <PaymentEntryFields form={entryForm} setForm={setEntryForm} profiles={profiles} />
          <DialogFooter>
            <Button onClick={() => entryMutation.mutate()} disabled={!entryForm.title.trim() || entryMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payingEntry} onOpenChange={(open) => !open && setPayingEntry(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <Field label="Amount"><Input value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} /></Field>
              <Field label="Currency"><Input value={paymentForm.currency} onChange={(event) => setPaymentForm((current) => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))} /></Field>
            </div>
            <Field label="Paid date"><Input type="date" value={paymentForm.paidAt} onChange={(event) => setPaymentForm((current) => ({ ...current, paidAt: event.target.value }))} /></Field>
            <ProfileSelect value={paymentForm.paymentProfileId} onChange={(paymentProfileId) => setPaymentForm((current) => ({ ...current, paymentProfileId }))} profiles={profiles} />
            <Field label="Proof URL"><Input value={paymentForm.proofUrl} onChange={(event) => setPaymentForm((current) => ({ ...current, proofUrl: event.target.value }))} /></Field>
            <Field label="Notes"><Textarea value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
            {payingEntry?.calendarItemId ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={paymentForm.approvalConfirmed}
                  onChange={(event) => setPaymentForm((current) => ({ ...current, approvalConfirmed: event.target.checked }))}
                />
                Approval confirmed
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => recordMutation.mutate()} disabled={(cents(paymentForm.amount) ?? 0) <= 0 || recordMutation.isPending}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailEntryId} onOpenChange={(open) => !open && setDetailEntryId(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{detailEntry?.title ?? "Payment history"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge status={detailEntry?.status ?? "open"} />
              <span className="text-muted-foreground">Expected {money(detailEntry?.expectedAmountCents, detailEntry?.currency)}</span>
              <span className="text-muted-foreground">Paid {money(detailEntry?.paidAmountCents, detailEntry?.currency)}</span>
            </div>
            {detailQuery.isLoading ? (
              <div className="border border-border p-3 text-sm text-muted-foreground">Loading records…</div>
            ) : (detailEntry?.records.length ?? 0) === 0 ? (
              <div className="border border-border p-3 text-sm text-muted-foreground">No payment records yet.</div>
            ) : (
              <div className="grid gap-2">
                {detailEntry!.records.map((record) => (
                  <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 border border-border p-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium tabular-nums">{money(record.amountCents, record.currency)}</div>
                      <div className="text-xs text-muted-foreground">
                        {record.paidAt.slice(0, 10)}{record.profile ? ` · ${profileLabel(record.profile)}` : ""}
                      </div>
                      {record.notes ? <div className="mt-1 text-xs text-muted-foreground">{record.notes}</div> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openRecordEdit(record)}>Edit</Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        disabled={recordDeleteMutation.isPending}
                        onClick={() => { if (window.confirm("Delete this payment record? The entry total will be recomputed.")) recordDeleteMutation.mutate(record); }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingRecord} onOpenChange={(open) => !open && setEditingRecord(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit payment record</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <Field label="Amount"><Input value={recordForm.amount} onChange={(event) => setRecordForm((current) => ({ ...current, amount: event.target.value }))} /></Field>
              <Field label="Currency"><Input value={recordForm.currency} onChange={(event) => setRecordForm((current) => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))} /></Field>
            </div>
            <Field label="Paid date"><Input type="date" value={recordForm.paidAt} onChange={(event) => setRecordForm((current) => ({ ...current, paidAt: event.target.value }))} /></Field>
            <ProfileSelect value={recordForm.paymentProfileId} onChange={(paymentProfileId) => setRecordForm((current) => ({ ...current, paymentProfileId }))} profiles={profiles} />
            <Field label="Proof URL"><Input value={recordForm.proofUrl} onChange={(event) => setRecordForm((current) => ({ ...current, proofUrl: event.target.value }))} /></Field>
            <Field label="Notes"><Textarea value={recordForm.notes} onChange={(event) => setRecordForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={recordForm.approvalConfirmed} onChange={(event) => setRecordForm((current) => ({ ...current, approvalConfirmed: event.target.checked }))} />
              Approval confirmed (required when this completes a high-risk obligation)
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => recordEditMutation.mutate()} disabled={(cents(recordForm.amount) ?? 0) <= 0 || recordEditMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortHeader({
  label, field, sort, onSort, align = "left",
}: {
  label: string; field: PaymentEntrySortField;
  sort?: { field: PaymentEntrySortField; dir: "asc" | "desc" }; onSort?: (field: PaymentEntrySortField) => void;
  align?: "left" | "right";
}) {
  const active = sort?.field === field;
  const arrow = active ? (sort!.dir === "asc" ? " ↑" : " ↓") : "";
  if (!onSort) return <th className={cn("px-3 py-2", align === "right" ? "text-right" : "text-left")}>{label}</th>;
  return (
    <th className={cn("px-3 py-2", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        className={cn("uppercase hover:text-foreground", active && "text-foreground")}
        onClick={() => onSort(field)}
      >
        {label}{arrow}
      </button>
    </th>
  );
}

function PaymentTable({ entries, onPay, onDetails, sort, onSort, paid = false }: {
  entries: PaymentEntry[];
  onPay: (entry: PaymentEntry) => void;
  onDetails?: (entryId: string) => void;
  sort?: { field: PaymentEntrySortField; dir: "asc" | "desc" };
  onSort?: (field: PaymentEntrySortField) => void;
  paid?: boolean;
}) {
  if (entries.length === 0) return <EmptyState icon={CreditCard} message="No payment entries match this view." />;
  return (
    <div className="min-h-0 overflow-auto border border-border">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border">
            <SortHeader label="Payment" field="title" sort={sort} onSort={onSort} />
            <SortHeader label="Due" field="dueDate" sort={sort} onSort={onSort} />
            <SortHeader label="Expected" field="amount" sort={sort} onSort={onSort} align="right" />
            <th className="px-3 py-2 text-right">Paid</th>
            <th className="px-3 py-2 text-left">Profile</th>
            <SortHeader label="Status" field="status" sort={sort} onSort={onSort} />
            <th className="px-3 py-2 text-right"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2">
                <div className="font-medium">{entry.title}</div>
                <div className="text-xs text-muted-foreground">{entry.providerName ?? (entry.calendarItemId ? "Calendar linked" : "Standalone")}</div>
              </td>
              <td className="px-3 py-2">{entry.dueDate ?? "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(entry.expectedAmountCents, entry.currency)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(entry.paidAmountCents, entry.currency)}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{entry.profile ? profileLabel(entry.profile) : "-"}</td>
              <td className="px-3 py-2"><StatusBadge status={entry.status} /></td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-2">
                  {onDetails ? <Button variant="outline" size="sm" onClick={() => onDetails(entry.id)}>History</Button> : null}
                  {!paid && entry.status !== "paid" && entry.status !== "cancelled" ? <Button size="sm" onClick={() => onPay(entry)}>Pay</Button> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfileSelect({ value, onChange, profiles }: { value: string; onChange: (value: string) => void; profiles: Array<{ id: string; method: string; accountLabel: string; ownerName?: string | null }> }) {
  return (
    <Field label="Payment profile">
      <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profileLabel(profile)}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

function PaymentEntryFields({
  form,
  setForm,
  profiles,
}: {
  form: { title: string; providerName: string; dueDate: string; amount: string; currency: string; paymentProfileId: string; notes: string };
  setForm: Dispatch<SetStateAction<{ title: string; providerName: string; dueDate: string; amount: string; currency: string; paymentProfileId: string; notes: string }>>;
  profiles: Array<{ id: string; method: string; accountLabel: string; ownerName?: string | null }>;
}) {
  return (
    <div className="grid gap-3">
      <Field label="Title"><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></Field>
      <Field label="Provider"><Input value={form.providerName} onChange={(event) => setForm((current) => ({ ...current, providerName: event.target.value }))} /></Field>
      <Field label="Due date"><Input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
      <div className="grid grid-cols-[1fr_90px] gap-3">
        <Field label="Expected amount"><Input value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></Field>
        <Field label="Currency"><Input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))} /></Field>
      </div>
      <ProfileSelect value={form.paymentProfileId} onChange={(paymentProfileId) => setForm((current) => ({ ...current, paymentProfileId }))} profiles={profiles} />
      <Field label="Notes"><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
    </div>
  );
}
