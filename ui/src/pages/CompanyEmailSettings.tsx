import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InboundEmailRule } from "@paperclipai/shared";
import { Mail, Plus } from "lucide-react";
import { companiesApi } from "../api/companies";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { Field } from "../components/agent-config-primitives";
import { queryKeys } from "../lib/queryKeys";

type RuleDraft = {
  id: string | null;
  mailboxId: string;
  enabled: boolean;
  senderPattern: string;
  subjectPattern: string;
  targetProjectId: string;
  priority: "critical" | "high" | "medium" | "low";
  labelIds: string[];
};

const emptyRuleDraft: RuleDraft = {
  id: null,
  mailboxId: "",
  enabled: true,
  senderPattern: "",
  subjectPattern: "",
  targetProjectId: "",
  priority: "medium",
  labelIds: [],
};

function ruleToDraft(rule: InboundEmailRule): RuleDraft {
  return {
    id: rule.id,
    mailboxId: rule.mailboxId ?? "",
    enabled: rule.enabled,
    senderPattern: rule.senderPattern ?? "",
    subjectPattern: rule.subjectPattern ?? "",
    targetProjectId: rule.targetProjectId ?? "",
    priority: rule.priority,
    labelIds: rule.labelIds ?? [],
  };
}

function labelForId<T extends { id: string; name: string }>(items: T[] | undefined, id: string | null) {
  if (!id) return "Any";
  return items?.find((item) => item.id === id)?.name ?? "Unknown";
}

export function CompanyEmailSettings() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordTouched, setSmtpPasswordTouched] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [emailSignatureHtml, setEmailSignatureHtml] = useState("");

  const [inboundName, setInboundName] = useState("Support inbox");
  const [inboundEnabled, setInboundEnabled] = useState(false);
  const [inboundHost, setInboundHost] = useState("");
  const [inboundPort, setInboundPort] = useState("993");
  const [inboundUsername, setInboundUsername] = useState("");
  const [inboundPassword, setInboundPassword] = useState("");
  const [inboundPasswordTouched, setInboundPasswordTouched] = useState(false);
  const [inboundFolder, setInboundFolder] = useState("INBOX");
  const [inboundTls, setInboundTls] = useState(true);
  const [inboundPollIntervalSeconds, setInboundPollIntervalSeconds] = useState("60");

  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(emptyRuleDraft);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings", href: "/company/settings" },
      { label: "Email" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  useEffect(() => {
    if (!selectedCompany) return;
    setSmtpHost(selectedCompany.smtpHost ?? "");
    setSmtpPort(selectedCompany.smtpPort != null ? String(selectedCompany.smtpPort) : "");
    setSmtpUser(selectedCompany.smtpUser ?? "");
    setSmtpFrom(selectedCompany.smtpFrom ?? "");
    setSmtpPassword("");
    setSmtpPasswordTouched(false);
    setEmailSignatureHtml(selectedCompany.emailSignatureHtml ?? "");
  }, [selectedCompany]);

  const [ruleFormOpen, setRuleFormOpen] = useState(false);

  const companyIdForKeys = selectedCompanyId ?? "";
  const inboundMailboxesQuery = useQuery({
    queryKey: queryKeys.inboundEmail.mailboxes(companyIdForKeys),
    queryFn: () => companiesApi.listInboundEmailMailboxes(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const inboundMessagesQuery = useQuery({
    queryKey: queryKeys.inboundEmail.messages(companyIdForKeys),
    queryFn: () => companiesApi.listInboundEmailMessages(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const inboundRulesQuery = useQuery({
    queryKey: queryKeys.inboundEmail.rules(companyIdForKeys),
    queryFn: () => companiesApi.listInboundEmailRules(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const rulesLoaded = (inboundRulesQuery.data?.items?.length ?? 0) > 0;
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(companyIdForKeys),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && (ruleFormOpen || rulesLoaded),
  });
  const labelsQuery = useQuery({
    queryKey: queryKeys.issues.labels(companyIdForKeys),
    queryFn: () => issuesApi.listLabels(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && (ruleFormOpen || rulesLoaded),
  });

  const primaryInboundMailbox = inboundMailboxesQuery.data?.items?.[0] ?? null;

  useEffect(() => {
    if (!primaryInboundMailbox) {
      setInboundName("Support inbox");
      setInboundEnabled(false);
      setInboundHost("");
      setInboundPort("993");
      setInboundUsername("");
      setInboundPassword("");
      setInboundPasswordTouched(false);
      setInboundFolder("INBOX");
      setInboundTls(true);
      setInboundPollIntervalSeconds("60");
      return;
    }
    setInboundName(primaryInboundMailbox.name);
    setInboundEnabled(primaryInboundMailbox.enabled);
    setInboundHost(primaryInboundMailbox.host);
    setInboundPort(String(primaryInboundMailbox.port));
    setInboundUsername(primaryInboundMailbox.username);
    setInboundPassword("");
    setInboundPasswordTouched(false);
    setInboundFolder(primaryInboundMailbox.folder);
    setInboundTls(primaryInboundMailbox.tls);
    setInboundPollIntervalSeconds(String(primaryInboundMailbox.pollIntervalSeconds));
  }, [primaryInboundMailbox?.id]);

  const smtpPortNum = smtpPort.trim() === "" ? null : Number(smtpPort);
  const smtpPortValid =
    smtpPort.trim() === "" ||
    (Number.isInteger(smtpPortNum) && smtpPortNum !== null && smtpPortNum >= 1 && smtpPortNum <= 65535);
  const smtpDirty =
    !!selectedCompany &&
    (smtpHost !== (selectedCompany.smtpHost ?? "") ||
      (selectedCompany.smtpPort != null ? String(selectedCompany.smtpPort) : "") !== smtpPort ||
      smtpUser !== (selectedCompany.smtpUser ?? "") ||
      smtpFrom !== (selectedCompany.smtpFrom ?? "") ||
      smtpPasswordTouched);

  const smtpMutation = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof companiesApi.update>[1] = {
        smtpHost: smtpHost.trim() || null,
        smtpPort: smtpPortNum,
        smtpUser: smtpUser.trim() || null,
        smtpFrom: smtpFrom.trim() || null,
      };
      if (smtpPasswordTouched) {
        payload.smtpPassword = smtpPassword;
      }
      return companiesApi.update(selectedCompanyId!, payload);
    },
    onSuccess: () => {
      setSmtpPassword("");
      setSmtpPasswordTouched(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const testEmailTrimmed = testEmailTo.trim();
  const testEmailValid =
    testEmailTrimmed === "" ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailTrimmed);
  const testEmailMutation = useMutation({
    mutationFn: () => companiesApi.testEmail(selectedCompanyId!, testEmailTrimmed),
  });

  const emailSignatureDirty =
    !!selectedCompany &&
    emailSignatureHtml !== (selectedCompany.emailSignatureHtml ?? "");

  const emailSignatureMutation = useMutation({
    mutationFn: () =>
      companiesApi.update(selectedCompanyId!, {
        emailSignatureHtml: emailSignatureHtml.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const inboundPortNum = Number(inboundPort);
  const inboundPollIntervalNum = Number(inboundPollIntervalSeconds);
  const inboundValid =
    inboundName.trim().length > 0 &&
    inboundHost.trim().length > 0 &&
    inboundUsername.trim().length > 0 &&
    inboundFolder.trim().length > 0 &&
    Number.isInteger(inboundPortNum) &&
    inboundPortNum >= 1 &&
    inboundPortNum <= 65535 &&
    Number.isInteger(inboundPollIntervalNum) &&
    inboundPollIntervalNum >= 30 &&
    inboundPollIntervalNum <= 3600;
  const inboundDirty =
    !primaryInboundMailbox ||
    inboundName !== primaryInboundMailbox.name ||
    inboundEnabled !== primaryInboundMailbox.enabled ||
    inboundHost !== primaryInboundMailbox.host ||
    inboundPort !== String(primaryInboundMailbox.port) ||
    inboundUsername !== primaryInboundMailbox.username ||
    inboundFolder !== primaryInboundMailbox.folder ||
    inboundTls !== primaryInboundMailbox.tls ||
    inboundPollIntervalSeconds !== String(primaryInboundMailbox.pollIntervalSeconds) ||
    (inboundPasswordTouched && inboundPassword.trim().length > 0);

  const inboundSaveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: inboundName.trim(),
        provider: "imap" as const,
        enabled: inboundEnabled,
        host: inboundHost.trim(),
        port: inboundPortNum,
        username: inboundUsername.trim(),
        folder: inboundFolder.trim(),
        tls: inboundTls,
        pollIntervalSeconds: inboundPollIntervalNum,
        targetProjectId: primaryInboundMailbox?.targetProjectId ?? null,
        createMode: primaryInboundMailbox?.createMode ?? ("issue" as const),
        markSeen: primaryInboundMailbox?.markSeen ?? true,
        ...(inboundPasswordTouched && inboundPassword.trim().length > 0 ? { password: inboundPassword } : {}),
      };
      return companiesApi.saveInboundEmailMailbox(selectedCompanyId!, primaryInboundMailbox?.id ?? null, payload);
    },
    onSuccess: () => {
      setInboundPassword("");
      setInboundPasswordTouched(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.inboundEmail.mailboxes(selectedCompanyId!) });
    },
  });
  const inboundTestMutation = useMutation({
    mutationFn: () => companiesApi.testInboundEmailMailbox(selectedCompanyId!, primaryInboundMailbox!.id),
  });
  const inboundPollMutation = useMutation({
    mutationFn: () => companiesApi.pollInboundEmailMailbox(selectedCompanyId!, primaryInboundMailbox!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inboundEmail.messages(selectedCompanyId!) });
    },
  });

  const ruleDraftValid: boolean =
    ruleDraft.senderPattern.trim().length > 0 ||
    ruleDraft.subjectPattern.trim().length > 0 ||
    ruleDraft.mailboxId.length > 0 ||
    ruleDraft.targetProjectId.length > 0 ||
    ruleDraft.labelIds.length > 0;
  const ruleSaveMutation = useMutation({
    mutationFn: () => {
      const basePayload = {
        mailboxId: ruleDraft.mailboxId || null,
        enabled: ruleDraft.enabled,
        senderPattern: ruleDraft.senderPattern.trim() || null,
        subjectPattern: ruleDraft.subjectPattern.trim() || null,
        targetProjectId: ruleDraft.targetProjectId || null,
        priority: ruleDraft.priority,
        labelIds: ruleDraft.labelIds,
      };
      const payload = ruleDraft.id
        ? basePayload
        : { ...basePayload, createMode: "issue" as const };
      return companiesApi.saveInboundEmailRule(selectedCompanyId!, ruleDraft.id, payload);
    },
    onSuccess: () => {
      setRuleDraft(emptyRuleDraft);
      setRuleFormOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.inboundEmail.rules(selectedCompanyId!) });
    },
  });
  const toggleRuleMutation = useMutation({
    mutationFn: (rule: InboundEmailRule) =>
      companiesApi.saveInboundEmailRule(selectedCompanyId!, rule.id, { enabled: !rule.enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inboundEmail.rules(selectedCompanyId!) });
    },
  });

  const mailboxOptions = inboundMailboxesQuery.data?.items ?? [];
  const ruleRows = inboundRulesQuery.data?.items ?? [];
  const projectOptions = projectsQuery.data ?? [];
  const labelOptions = labelsQuery.data ?? [];
  const labelNameById = useMemo(() => new Map(labelOptions.map((label) => [label.id, label.name])), [labelOptions]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Email Settings</h1>
      </div>

      <div className="space-y-4" data-testid="company-settings-smtp-section">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Email Notifications
          </div>
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <p className="text-xs text-muted-foreground">
            Per-company SMTP credentials used for Paperclip notification emails. Leave host empty to fall back to the server environment.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="SMTP host" hint="Hostname of your SMTP server.">
              <input data-testid="company-settings-smtp-host" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="text" value={smtpHost} placeholder="smtp.example.com" onChange={(e) => setSmtpHost(e.target.value)} />
            </Field>
            <Field label="Port" hint="Typically 587 or 465.">
              <input data-testid="company-settings-smtp-port" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="number" min={1} max={65535} value={smtpPort} placeholder="587" onChange={(e) => setSmtpPort(e.target.value)} />
            </Field>
            <Field label="From address" hint="The address notification emails are sent from.">
              <input data-testid="company-settings-smtp-from" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="text" value={smtpFrom} placeholder="noreply@example.com" onChange={(e) => setSmtpFrom(e.target.value)} />
            </Field>
            <Field label="Username" hint="SMTP auth username.">
              <input data-testid="company-settings-smtp-user" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="text" value={smtpUser} autoComplete="off" onChange={(e) => setSmtpUser(e.target.value)} />
            </Field>
            <Field
              label="Password"
              hint={selectedCompany.smtpPasswordSet ? "A password is configured. Type to replace it; leave blank to keep unchanged." : "SMTP auth password. Stored encrypted."}
            >
              <input
                data-testid="company-settings-smtp-password"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="password"
                value={smtpPassword}
                autoComplete="new-password"
                placeholder={selectedCompany.smtpPasswordSet ? "Configured" : ""}
                onChange={(e) => {
                  setSmtpPassword(e.target.value);
                  setSmtpPasswordTouched(true);
                }}
              />
            </Field>
          </div>
          {!smtpPortValid && <span className="text-xs text-destructive">Port must be a whole number between 1 and 65535.</span>}
          {smtpDirty && (
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
              <Button data-testid="company-settings-smtp-save" size="sm" className="w-full sm:w-auto" onClick={() => smtpMutation.mutate()} disabled={smtpMutation.isPending || !smtpPortValid}>
                {smtpMutation.isPending ? "Saving..." : "Save email settings"}
              </Button>
              {smtpMutation.isSuccess && <span className="text-xs text-muted-foreground">Saved</span>}
              {smtpMutation.isError && <span className="min-w-0 break-words text-xs text-destructive">{smtpMutation.error instanceof Error ? smtpMutation.error.message : "Failed to save"}</span>}
            </div>
          )}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                data-testid="company-settings-smtp-test-email"
                className="min-w-0 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none sm:w-64"
                type="email"
                placeholder="Send test to..."
                value={testEmailTo}
                onChange={(e) => {
                  setTestEmailTo(e.target.value);
                  testEmailMutation.reset();
                }}
              />
              <Button data-testid="company-settings-smtp-test-send" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => testEmailMutation.mutate()} disabled={testEmailMutation.isPending || !testEmailTrimmed || !testEmailValid}>
                {testEmailMutation.isPending ? "Sending..." : "Send test email"}
              </Button>
            </div>
            {!testEmailValid && <span className="block text-xs text-destructive">Enter a valid email address before sending a test.</span>}
            {testEmailMutation.isSuccess && <span className="block text-xs text-muted-foreground">Test email sent to {testEmailTrimmed}.</span>}
            {testEmailMutation.isError && <span className="block min-w-0 break-words text-xs text-destructive">{testEmailMutation.error instanceof Error ? testEmailMutation.error.message : "Failed to send"}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-4" data-testid="company-settings-inbound-email-section">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Inbound Mailbox</div>
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Mailbox name" hint="Local label for this inbound mailbox.">
              <input data-testid="company-settings-inbound-name" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="text" value={inboundName} onChange={(e) => setInboundName(e.target.value)} />
            </Field>
            <Field label="IMAP host" hint="Mailbox server used for inbound polling.">
              <input data-testid="company-settings-inbound-host" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="text" value={inboundHost} placeholder="imap.example.com" onChange={(e) => setInboundHost(e.target.value)} />
            </Field>
            <Field label="Port" hint="Usually 993 for TLS IMAP.">
              <input data-testid="company-settings-inbound-port" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="number" min={1} max={65535} value={inboundPort} onChange={(e) => setInboundPort(e.target.value)} />
            </Field>
            <Field label="Username" hint="Mailbox username or email address.">
              <input data-testid="company-settings-inbound-username" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="text" value={inboundUsername} autoComplete="off" onChange={(e) => setInboundUsername(e.target.value)} />
            </Field>
            <Field label="Password" hint={primaryInboundMailbox?.passwordSet ? "A password is configured. Type to replace it; leave blank to keep unchanged." : "Mailbox password or app password. Stored encrypted."}>
              <input data-testid="company-settings-inbound-password" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="password" value={inboundPassword} autoComplete="new-password" placeholder={primaryInboundMailbox?.passwordSet ? "Configured" : ""} onChange={(e) => {
                setInboundPassword(e.target.value);
                setInboundPasswordTouched(true);
              }} />
            </Field>
            <Field label="Folder" hint="Mailbox folder to poll.">
              <input data-testid="company-settings-inbound-folder" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="text" value={inboundFolder} onChange={(e) => setInboundFolder(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input data-testid="company-settings-inbound-enabled" type="checkbox" checked={inboundEnabled} onChange={(e) => setInboundEnabled(e.target.checked)} />
              Poll mailbox
            </label>
            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input data-testid="company-settings-inbound-tls" type="checkbox" checked={inboundTls} onChange={(e) => setInboundTls(e.target.checked)} />
              Use TLS
            </label>
            <Field label="Poll interval" hint="Seconds between mailbox polls.">
              <input data-testid="company-settings-inbound-poll-interval" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="number" min={30} max={3600} value={inboundPollIntervalSeconds} onChange={(e) => setInboundPollIntervalSeconds(e.target.value)} />
            </Field>
          </div>
          {!inboundValid && <span className="text-xs text-destructive">Enter a mailbox name, host, username, folder, a valid port, and a poll interval from 30 to 3600 seconds.</span>}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
            <Button data-testid="company-settings-inbound-save" size="sm" className="w-full sm:w-auto" onClick={() => inboundSaveMutation.mutate()} disabled={inboundSaveMutation.isPending || !inboundDirty || !inboundValid}>
              {inboundSaveMutation.isPending ? "Saving..." : "Save inbound mailbox"}
            </Button>
            <Button data-testid="company-settings-inbound-test" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => inboundTestMutation.mutate()} disabled={!primaryInboundMailbox || inboundTestMutation.isPending}>
              {inboundTestMutation.isPending ? "Testing..." : "Test connection"}
            </Button>
            <Button data-testid="company-settings-inbound-poll" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => inboundPollMutation.mutate()} disabled={!primaryInboundMailbox || inboundPollMutation.isPending}>
              {inboundPollMutation.isPending ? "Queued..." : "Queue poll"}
            </Button>
          </div>
          {inboundSaveMutation.isSuccess && <span className="block text-xs text-muted-foreground">Inbound mailbox saved.</span>}
          {inboundTestMutation.isSuccess && <span className="block text-xs text-muted-foreground">Mailbox connection succeeded.</span>}
          {inboundPollMutation.isSuccess && <span className="block text-xs text-muted-foreground">Mailbox poll queued.</span>}
          {(inboundSaveMutation.isError || inboundTestMutation.isError || inboundPollMutation.isError) && (
            <span className="block min-w-0 break-words text-xs text-destructive">
              {(inboundSaveMutation.error ?? inboundTestMutation.error ?? inboundPollMutation.error) instanceof Error
                ? (inboundSaveMutation.error ?? inboundTestMutation.error ?? inboundPollMutation.error)?.message
                : "Inbound email action failed"}
            </span>
          )}
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Imported messages: <span className="font-medium text-foreground">{inboundMessagesQuery.data?.items?.length ?? 0}</span>
            {primaryInboundMailbox?.lastError ? <span className="block min-w-0 break-words pt-1 text-destructive">{primaryInboundMailbox.lastError}</span> : null}
          </div>
        </div>
      </div>

      <div className="space-y-4" data-testid="company-settings-inbound-rules-section">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Inbound Rules</div>
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <Button
            data-testid="company-settings-inbound-rule-new"
            size="sm"
            variant="outline"
            onClick={() => {
              setRuleDraft(emptyRuleDraft);
              setRuleFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New rule
          </Button>
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          {ruleFormOpen && (
            <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3" data-testid="company-settings-inbound-rule-form">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Mailbox" hint="Limit this rule to one mailbox or apply to all.">
                  <select data-testid="company-settings-inbound-rule-mailbox" className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none" value={ruleDraft.mailboxId} onChange={(e) => setRuleDraft((current) => ({ ...current, mailboxId: e.target.value }))}>
                    <option value="">All mailboxes</option>
                    {mailboxOptions.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.name}</option>)}
                  </select>
                </Field>
                <Field label="Priority" hint="Priority assigned to issues created by this rule.">
                  <select data-testid="company-settings-inbound-rule-priority" className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none" value={ruleDraft.priority} onChange={(e) => setRuleDraft((current) => ({ ...current, priority: e.target.value as RuleDraft["priority"] }))}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </Field>
                <Field label="Sender contains" hint="Case-insensitive text match against the sender address.">
                  <input data-testid="company-settings-inbound-rule-sender" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="text" value={ruleDraft.senderPattern} placeholder="customer.com" onChange={(e) => setRuleDraft((current) => ({ ...current, senderPattern: e.target.value }))} />
                </Field>
                <Field label="Subject contains" hint="Case-insensitive text match against the subject.">
                  <input data-testid="company-settings-inbound-rule-subject" className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none" type="text" value={ruleDraft.subjectPattern} placeholder="urgent" onChange={(e) => setRuleDraft((current) => ({ ...current, subjectPattern: e.target.value }))} />
                </Field>
                <Field label="Target project" hint="Project for created issues.">
                  <select data-testid="company-settings-inbound-rule-project" className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none" value={ruleDraft.targetProjectId} onChange={(e) => setRuleDraft((current) => ({ ...current, targetProjectId: e.target.value }))}>
                    <option value="">Mailbox default</option>
                    {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <input data-testid="company-settings-inbound-rule-enabled" type="checkbox" checked={ruleDraft.enabled} onChange={(e) => setRuleDraft((current) => ({ ...current, enabled: e.target.checked }))} />
                  Enabled
                </label>
              </div>
              {labelOptions.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Labels</div>
                  <div className="flex flex-wrap gap-2">
                    {labelOptions.map((label) => {
                      const selected = ruleDraft.labelIds.includes(label.id);
                      return (
                        <label key={label.id} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => setRuleDraft((current) => ({
                              ...current,
                              labelIds: selected
                                ? current.labelIds.filter((id) => id !== label.id)
                                : [...current.labelIds, label.id],
                            }))}
                          />
                          {label.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {!ruleDraftValid && <span className="block text-xs text-destructive">Set at least one match or routing option before saving.</span>}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button data-testid="company-settings-inbound-rule-save" size="sm" onClick={() => ruleSaveMutation.mutate()} disabled={ruleSaveMutation.isPending || !ruleDraftValid}>
                  {ruleSaveMutation.isPending ? "Saving..." : ruleDraft.id ? "Save rule" : "Create rule"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  setRuleDraft(emptyRuleDraft);
                  setRuleFormOpen(false);
                }}>
                  Cancel
                </Button>
                {ruleSaveMutation.isError && <span className="min-w-0 break-words text-xs text-destructive">{ruleSaveMutation.error instanceof Error ? ruleSaveMutation.error.message : "Failed to save rule"}</span>}
              </div>
            </div>
          )}
          {ruleRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No inbound rules yet.
            </div>
          ) : (
            <div className="space-y-2">
              {ruleRows.map((rule) => (
                <div key={rule.id} className="rounded-md border border-border px-3 py-2" data-testid="company-settings-inbound-rule-row">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{rule.senderPattern || rule.subjectPattern || "Catch-all rule"}</span>
                        <span className={`rounded-sm px-1.5 py-0.5 text-xs ${rule.enabled ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>{rule.enabled ? "Enabled" : "Disabled"}</span>
                        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{rule.priority}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Mailbox: {labelForId(mailboxOptions, rule.mailboxId)} · Project: {labelForId(projectOptions, rule.targetProjectId)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Sender: {rule.senderPattern || "any"} · Subject: {rule.subjectPattern || "any"}
                      </div>
                      {rule.labelIds.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Labels: {rule.labelIds.map((id) => labelNameById.get(id) ?? "Unknown").join(", ")}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button data-testid={`company-settings-inbound-rule-toggle-${rule.id}`} size="sm" variant="outline" onClick={() => toggleRuleMutation.mutate(rule)} disabled={toggleRuleMutation.isPending}>
                        {rule.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button data-testid={`company-settings-inbound-rule-edit-${rule.id}`} size="sm" variant="outline" onClick={() => {
                        setRuleDraft(ruleToDraft(rule));
                        setRuleFormOpen(true);
                      }}>
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4" data-testid="company-settings-email-signature-section">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email Signature</div>
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label="Signature HTML" hint="HTML appended to the bottom of every notification email for this company.">
            <textarea data-testid="company-settings-email-signature-html" className="h-48 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none" value={emailSignatureHtml} placeholder="<table>...</table>" onChange={(e) => setEmailSignatureHtml(e.target.value)} />
          </Field>
          {emailSignatureDirty && (
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
              <Button data-testid="company-settings-email-signature-save" size="sm" className="w-full sm:w-auto" onClick={() => emailSignatureMutation.mutate()} disabled={emailSignatureMutation.isPending}>
                {emailSignatureMutation.isPending ? "Saving..." : "Save signature"}
              </Button>
              {emailSignatureMutation.isSuccess && <span className="text-xs text-muted-foreground">Saved</span>}
              {emailSignatureMutation.isError && <span className="min-w-0 break-words text-xs text-destructive">{emailSignatureMutation.error instanceof Error ? emailSignatureMutation.error.message : "Failed to save"}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
