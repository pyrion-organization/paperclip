import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, ReceiptText, WalletCards } from "lucide-react";
import { PAYMENT_METHODS, type PaymentEntry, type PaymentMethod } from "@paperclipai/shared";
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

function money(cents: number | null | undefined, currency = "BRL") {
  if (cents == null) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
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

export function Payments() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? NO_COMPANY;

  const [tab, setTab] = useState<"open" | "paid" | "profiles">("open");
  const [q, setQ] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [payingEntry, setPayingEntry] = useState<PaymentEntry | null>(null);
  const [profileForm, setProfileForm] = useState({ method: "credit_card" as PaymentMethod, accountLabel: "", ownerName: "", notes: "" });
  const [entryForm, setEntryForm] = useState({ title: "", providerName: "", dueDate: "", amount: "", currency: "BRL", paymentProfileId: "", notes: "" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", currency: "BRL", paidAt: "", paymentProfileId: "", proofUrl: "", notes: "" });

  useEffect(() => {
    setBreadcrumbs([{ label: "Payments" }]);
  }, [setBreadcrumbs]);

  const entryFilters = useMemo(() => ({
    q: q.trim() || undefined,
    status: tab === "paid" ? "paid" : undefined,
    limit: 500,
  }), [q, tab]);

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

  const invalidatePayments = () => {
    queryClient.invalidateQueries({ queryKey: ["payments", companyId] });
    queryClient.invalidateQueries({ queryKey: ["calendar", companyId] });
  };

  const profileMutation = useMutation({
    mutationFn: () => paymentsApi.createProfile(companyId, {
      method: profileForm.method,
      accountLabel: profileForm.accountLabel,
      ownerName: profileForm.ownerName || null,
      notes: profileForm.notes || null,
    }),
    onSuccess: () => {
      setProfileDialogOpen(false);
      setProfileForm({ method: "credit_card", accountLabel: "", ownerName: "", notes: "" });
      invalidatePayments();
    },
  });
  const entryMutation = useMutation({
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
  });
  const recordMutation = useMutation({
    mutationFn: () => paymentsApi.recordPayment(companyId, payingEntry!.id, {
      amountCents: cents(paymentForm.amount) ?? 0,
      currency: paymentForm.currency || payingEntry!.currency,
      paidAt: paymentForm.paidAt ? new Date(`${paymentForm.paidAt}T12:00:00.000Z`).toISOString() : undefined,
      paymentProfileId: paymentForm.paymentProfileId || payingEntry!.paymentProfileId,
      proofUrl: paymentForm.proofUrl || null,
      notes: paymentForm.notes || null,
    }),
    onSuccess: () => {
      setPayingEntry(null);
      setPaymentForm({ amount: "", currency: "BRL", paidAt: "", paymentProfileId: "", proofUrl: "", notes: "" });
      invalidatePayments();
    },
  });

  const entries = entriesQuery.data?.entries ?? [];
  const visibleEntries = tab === "open"
    ? entries.filter((entry) => entry.status !== "paid" && entry.status !== "cancelled")
    : entries;
  const profiles = profilesQuery.data ?? [];

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
          <Button variant="outline" onClick={() => setProfileDialogOpen(true)}><WalletCards className="mr-2 h-4 w-4" />Profile</Button>
          <Button onClick={() => setEntryDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Payment</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Open", dashboardQuery.data?.openCount ?? 0],
          ["Overdue", dashboardQuery.data?.overdueCount ?? 0],
          ["Due 7d", dashboardQuery.data?.dueSoonCount ?? 0],
          ["Partial", dashboardQuery.data?.partiallyPaidCount ?? 0],
          ["Open balance", money(dashboardQuery.data?.openBalanceCents ?? 0, dashboardQuery.data?.currency ?? "BRL")],
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
          <Input className="w-full sm:w-72" placeholder="Filter payments" value={q} onChange={(event) => setQ(event.target.value)} />
        </div>

        <TabsContent value="open" className="mt-3 min-h-0">
          <PaymentTable entries={visibleEntries} onPay={(entry) => {
            setPayingEntry(entry);
            setPaymentForm({
              amount: entry.expectedAmountCents == null ? "" : String(Math.max(entry.expectedAmountCents - entry.paidAmountCents, 0) / 100),
              currency: entry.currency,
              paidAt: new Date().toISOString().slice(0, 10),
              paymentProfileId: entry.paymentProfileId ?? "",
              proofUrl: "",
              notes: "",
            });
          }} />
        </TabsContent>
        <TabsContent value="paid" className="mt-3 min-h-0">
          <PaymentTable entries={visibleEntries} onPay={() => {}} paid />
        </TabsContent>
        <TabsContent value="profiles" className="mt-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {profiles.map((profile) => (
              <div key={profile.id} className={cn("border border-border p-3", !profile.active && "opacity-60")}>
                <div className="font-medium">{profileLabel(profile)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{profile.notes || "No notes"}</div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payment profile</DialogTitle></DialogHeader>
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
          </div>
          <DialogFooter>
            <Button onClick={() => recordMutation.mutate()} disabled={(cents(paymentForm.amount) ?? 0) <= 0 || recordMutation.isPending}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentTable({ entries, onPay, paid = false }: { entries: PaymentEntry[]; onPay: (entry: PaymentEntry) => void; paid?: boolean }) {
  if (entries.length === 0) return <EmptyState icon={CreditCard} message="No payment entries match this view." />;
  return (
    <div className="min-h-0 overflow-auto border border-border">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left">Payment</th>
            <th className="px-3 py-2 text-left">Due</th>
            <th className="px-3 py-2 text-right">Expected</th>
            <th className="px-3 py-2 text-right">Paid</th>
            <th className="px-3 py-2 text-left">Profile</th>
            <th className="px-3 py-2 text-left">Status</th>
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
                {!paid && entry.status !== "paid" && entry.status !== "cancelled" ? <Button size="sm" onClick={() => onPay(entry)}>Pay</Button> : null}
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
