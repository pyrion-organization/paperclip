import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  InboundEmailOpsDashboard,
  InboundEmailOpsMailbox,
  InboundEmailOpsMailboxHealth,
} from "@paperclipai/shared";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
  Loader2,
  MailWarning,
  RefreshCw,
  Settings,
  XCircle,
} from "lucide-react";
import { companiesApi } from "../api/companies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { Link } from "@/lib/router";
import { queryKeys } from "../lib/queryKeys";

const healthMeta: Record<InboundEmailOpsMailboxHealth, {
  label: string;
  className: string;
  icon: typeof CheckCircle2;
}> = {
  healthy: {
    label: "Healthy",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    icon: CheckCircle2,
  },
  warning: {
    label: "Warning",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    icon: AlertTriangle,
  },
  error: {
    label: "Error",
    className: "border-destructive/50 bg-destructive/10 text-destructive",
    icon: XCircle,
  },
  disabled: {
    label: "Disabled",
    className: "border-border bg-muted/50 text-muted-foreground",
    icon: Clock3,
  },
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRelative(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "Never";
  const diffMs = Date.now() - date.getTime();
  const absMs = Math.abs(diffMs);
  const minutes = Math.round(absMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ${diffMs >= 0 ? "ago" : "from now"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ${diffMs >= 0 ? "ago" : "from now"}`;
  const days = Math.round(hours / 24);
  return `${days}d ${diffMs >= 0 ? "ago" : "from now"}`;
}

function messageStatusLabel(status: string) {
  switch (status) {
    case "persisted":
      return "Imported but not processed yet";
    case "processing":
      return "Currently processing";
    case "processed":
      return "Issue created";
    case "skipped":
      return "Skipped by rule or authorization";
    case "failed":
      return "Processing failed";
    case "duplicate":
      return "Duplicate";
    default:
      return status;
  }
}

function failureKindLabel(kind: string) {
  if (kind === "email.poll_mailbox") return "Mailbox poll job";
  if (kind === "email.process_message") return "Message processing job";
  if (kind === "message.failed") return "Inbound message";
  return kind;
}

function explainMailboxHealth(item: InboundEmailOpsMailbox) {
  if (!item.mailbox.enabled) return "Polling is turned off for this mailbox.";
  if (!item.mailbox.passwordSet) return "The mailbox password is missing. Add it in Email settings before polling can connect.";
  if (item.mailbox.lastError) return "The last IMAP poll failed. Check the host, port, TLS setting, username, password, and folder name.";
  if (!item.mailbox.lastPollAt) return "This mailbox has not been polled yet. Wait for the worker interval or trigger a manual poll from settings.";
  if (!item.mailbox.lastSuccessAt) return "Polling has started, but no poll has completed successfully yet.";
  if (item.health === "warning") return "The last successful poll is older than the expected interval. Confirm the email worker is still running.";
  return "Polling is completing successfully.";
}

function explainFailure(failure: FailureEntry) {
  if (failure.source === "job") {
    if (failure.kind === "email.poll_mailbox") return "The worker could not read the mailbox. This usually means IMAP credentials, folder, network, or provider access failed.";
    if (failure.kind === "email.process_message") return "The worker imported the email but failed while creating or finalizing the Paperclip issue.";
    return "The background job failed before it could complete.";
  }
  return "The message row is marked failed. Retry after fixing the error shown below.";
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  const toneClass =
    tone === "bad"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "ok"
          ? "text-emerald-300"
          : "text-foreground";
  return (
    <div className="min-w-0 rounded-md border border-border bg-card/60 px-3 py-2">
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function HealthBadge({ health }: { health: InboundEmailOpsMailboxHealth }) {
  const meta = healthMeta[health];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${meta.className}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

function MailboxRow({
  item,
  onPollNow,
  polling,
}: {
  item: InboundEmailOpsMailbox;
  onPollNow: (mailboxId: string) => void;
  polling: boolean;
}) {
  const activeJobs = item.jobCounts.pending + item.jobCounts.running + item.jobCounts.retrying;
  const failedJobs = item.jobCounts.failed + item.jobCounts.dead;
  const pendingMessages = item.messageCounts.persisted + item.messageCounts.processing;
  const needsAttention = item.health === "warning" || item.health === "error" || failedJobs > 0 || item.messageCounts.failed > 0;
  const canPoll = item.mailbox.enabled && item.mailbox.passwordSet;
  return (
    <div className="grid gap-3 border-t border-border px-4 py-3 lg:grid-cols-[minmax(220px,1.25fr)_1.3fr_1fr_1fr]">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium text-foreground">{item.mailbox.name}</div>
          <HealthBadge health={item.health} />
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {item.mailbox.username} · {item.mailbox.folder}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            size="xs"
            variant="outline"
            disabled={!canPoll || polling}
            onClick={() => onPollNow(item.mailbox.id)}
            title={canPoll ? "Queue an immediate poll for this mailbox" : "Enable the mailbox and configure a password before polling"}
          >
            {polling ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Poll now
          </Button>
          {item.mailbox.targetProjectId ? (
            <Link className="inline-flex items-center gap-1 text-xs text-primary hover:underline" to={`/projects/${item.mailbox.targetProjectId}`}>
              <ExternalLink className="h-3 w-3" />
              Project
            </Link>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 text-xs">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <span className="text-muted-foreground">Last poll</span>
          <span className="text-right text-foreground">{formatRelative(item.mailbox.lastPollAt)}</span>
          <span className="text-muted-foreground">Last success</span>
          <span className="text-right text-foreground">{formatRelative(item.mailbox.lastSuccessAt)}</span>
          <span className="text-muted-foreground">Next due</span>
          <span className="text-right text-foreground">{formatRelative(item.nextPollDueAt)}</span>
        </div>
        <div className={needsAttention ? "mt-2 min-w-0 break-words text-xs text-amber-300" : "mt-2 min-w-0 break-words text-xs text-muted-foreground"}>
          {item.healthDetail}
        </div>
        <div className="mt-1 min-w-0 break-words text-xs text-muted-foreground">{explainMailboxHealth(item)}</div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <div className={pendingMessages > 0 ? "font-semibold tabular-nums text-amber-300" : "font-semibold tabular-nums text-foreground"}>{pendingMessages}</div>
          <div className="text-muted-foreground">pending</div>
        </div>
        <div>
          <div className="font-semibold tabular-nums text-destructive">{item.messageCounts.failed}</div>
          <div className="text-muted-foreground">failed</div>
        </div>
        <div>
          <div className="font-semibold tabular-nums text-foreground">{item.messageCounts.processed}</div>
          <div className="text-muted-foreground">processed</div>
        </div>
      </div>

      <div className="min-w-0 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Queue</span>
          <span className="font-medium tabular-nums text-foreground">{activeJobs} active</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Failed jobs</span>
          <span className={failedJobs > 0 ? "font-medium tabular-nums text-destructive" : "font-medium tabular-nums text-foreground"}>{failedJobs}</span>
        </div>
        {item.lastFailedMessage?.createdIssueId ? (
          <Link className="mt-2 inline-flex items-center gap-1 text-primary hover:underline" to={`/issues/${item.lastFailedMessage.createdIssueId}`}>
            <ExternalLink className="h-3 w-3" />
            Issue
          </Link>
        ) : item.lastFailedMessage ? (
          <div className="mt-2 space-y-1 break-words">
            <div className="text-destructive">{item.lastFailedMessage.error ?? "Message failed"}</div>
            <div className="text-muted-foreground">{messageStatusLabel(item.lastFailedMessage.status)}</div>
          </div>
        ) : item.lastFailedJob ? (
          <div className="mt-2 space-y-1 break-words">
            <div className="text-destructive">{item.lastFailedJob.lastError ?? "Job failed"}</div>
            <div className="text-muted-foreground">{failureKindLabel(item.lastFailedJob.kind)} exhausted {item.lastFailedJob.attempts}/{item.lastFailedJob.maxAttempts} attempt{item.lastFailedJob.maxAttempts === 1 ? "" : "s"}.</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type FailureEntry = {
  id: string;
  source: "job" | "message";
  refId: string;
  kind: string;
  mailboxId: string | null;
  detail: string;
  time: Date | string | null | undefined;
};

function FailureList({
  dashboard,
  onRetryMessage,
  onRetryJob,
  retryingId,
}: {
  dashboard: InboundEmailOpsDashboard;
  onRetryMessage: (messageId: string) => void;
  onRetryJob: (jobId: string) => void;
  retryingId: string | null;
}) {
  const failures: FailureEntry[] = [
    ...dashboard.recentFailedJobs.map((job): FailureEntry => ({
      id: `job-${job.id}`,
      source: "job",
      refId: job.id,
      kind: job.kind,
      mailboxId: job.mailboxId,
      detail: job.lastError ?? "Job failed without error text",
      time: job.updatedAt,
    })),
    ...dashboard.recentFailedMessages.map((message): FailureEntry => ({
      id: `message-${message.id}`,
      source: "message",
      refId: message.id,
      kind: `message.${message.status}`,
      mailboxId: message.mailboxId,
      detail: message.error ?? message.subject ?? "Message failed without error text",
      time: message.updatedAt,
    })),
  ]
    .sort((a, b) => (asDate(b.time)?.getTime() ?? 0) - (asDate(a.time)?.getTime() ?? 0))
    .slice(0, 12);

  if (failures.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card/60 px-4 py-6 text-sm text-muted-foreground">
        No failed inbound email jobs or messages in the recent telemetry window.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card/60">
      {failures.map((failure) => {
        const pending = retryingId === failure.id;
        return (
          <div key={failure.id} className="grid gap-2 border-t border-border px-4 py-3 first:border-t-0 md:grid-cols-[160px_180px_1fr_auto]">
            <div className="text-xs font-medium text-foreground">{failureKindLabel(failure.kind)}</div>
            <div className="text-xs text-muted-foreground">{formatTime(failure.time)}</div>
            <div className="min-w-0 space-y-1 break-words text-xs">
              <div className="text-muted-foreground">{explainFailure(failure)}</div>
              <div className="text-foreground">{failure.detail}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => (failure.source === "message" ? onRetryMessage(failure.refId) : onRetryJob(failure.refId))}
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Retry
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function OpsDiagnostics({ dashboard }: { dashboard: InboundEmailOpsDashboard }) {
  const failedTotal = dashboard.summary.failedJobCount + dashboard.summary.failedMessageCount;
  const activeQueue = dashboard.summary.pendingJobCount;
  const warningOrErrorMailboxes = dashboard.mailboxes.filter((item) => item.health === "warning" || item.health === "error");
  const items: Array<{ tone: "bad" | "warn" | "info"; title: string; detail: string }> = [];

  for (const item of warningOrErrorMailboxes.slice(0, 3)) {
    items.push({
      tone: item.health === "error" ? "bad" : "warn",
      title: `${item.mailbox.name}: ${healthMeta[item.health].label}`,
      detail: `${item.healthDetail}. ${explainMailboxHealth(item)}`,
    });
  }
  if (activeQueue > 0) {
    items.push({
      tone: "warn",
      title: `${activeQueue} queued email job${activeQueue === 1 ? "" : "s"}`,
      detail: "The worker has pending or retrying work. If this number does not fall, check that `pnpm worker:email` is running and review Recent Failures.",
    });
  }
  if (failedTotal > 0) {
    items.push({
      tone: "bad",
      title: `${failedTotal} failed email item${failedTotal === 1 ? "" : "s"}`,
      detail: "Failures need an operator retry after the underlying IMAP, SMTP, authorization, or issue-creation error is corrected.",
    });
  }
  if (dashboard.sourceDelete.supported && dashboard.sourceDelete.errorCount > 0) {
    items.push({
      tone: "warn",
      title: `${dashboard.sourceDelete.errorCount} source cleanup error${dashboard.sourceDelete.errorCount === 1 ? "" : "s"}`,
      detail: dashboard.sourceDelete.lastError
        ? `Paperclip processed the email but could not delete or mark the source message: ${dashboard.sourceDelete.lastError}`
        : "Paperclip processed at least one email but could not delete or mark the source message.",
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        No active email polling warnings or failures. The worker dashboard has no operator action to report.
      </div>
    );
  }

  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {items.slice(0, 4).map((item) => {
        const Icon = item.tone === "bad" ? XCircle : item.tone === "warn" ? AlertTriangle : Info;
        const className = item.tone === "bad"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : item.tone === "warn"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
            : "border-border bg-muted/30 text-muted-foreground";
        return (
          <div key={`${item.title}-${item.detail}`} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${className}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">{item.title}</div>
              <div className="mt-1 break-words text-muted-foreground">{item.detail}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function InboundEmailOps() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Email Ops" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.inboundEmail.ops(selectedCompanyId ?? ""),
    queryFn: () => companiesApi.getInboundEmailOpsDashboard(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    refetchInterval: 15_000,
  });

  const retryMessageMutation = useMutation({
    mutationFn: (messageId: string) => companiesApi.retryInboundEmailMessage(selectedCompanyId!, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inboundEmail.ops(selectedCompanyId ?? "") });
    },
  });
  const retryJobMutation = useMutation({
    mutationFn: (jobId: string) => companiesApi.retryInboundEmailJob(selectedCompanyId!, jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inboundEmail.ops(selectedCompanyId ?? "") });
    },
  });
  const pollMailboxMutation = useMutation({
    mutationFn: (mailboxId: string) => companiesApi.pollInboundEmailMailbox(selectedCompanyId!, mailboxId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inboundEmail.ops(selectedCompanyId ?? "") });
    },
  });
  const retryingId =
    retryMessageMutation.isPending && retryMessageMutation.variables
      ? `message-${retryMessageMutation.variables}`
      : retryJobMutation.isPending && retryJobMutation.variables
        ? `job-${retryJobMutation.variables}`
        : null;
  const pollingMailboxId = pollMailboxMutation.isPending && pollMailboxMutation.variables
    ? pollMailboxMutation.variables
    : null;
  const retryError = retryMessageMutation.isError
    ? retryMessageMutation.error
    : retryJobMutation.isError
      ? retryJobMutation.error
      : null;
  const pollError = pollMailboxMutation.isError ? pollMailboxMutation.error : null;

  if (!selectedCompany) {
    return <div className="text-sm text-muted-foreground">No company selected. Select a company from the switcher above.</div>;
  }

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading inbound email operations...
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
        <div className="text-sm font-medium text-destructive">Failed to load inbound email operations.</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Unknown error"}
        </div>
      </div>
    );
  }

  const dashboard = dashboardQuery.data;
  if (!dashboard) return null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-normal">Inbound Email Ops</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mailbox polling, queue pressure, and message failure telemetry for {selectedCompany.name}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right text-xs text-muted-foreground">
            Updated {formatRelative(dashboard.generatedAt)}
          </div>
          <Button size="sm" variant="outline" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
            {dashboardQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Metric label="mailboxes" value={dashboard.summary.mailboxCount} />
        <Metric label="enabled" value={dashboard.summary.enabledMailboxCount} tone="ok" />
        <Metric label="warnings" value={dashboard.summary.warningMailboxCount} tone={dashboard.summary.warningMailboxCount > 0 ? "warn" : undefined} />
        <Metric label="errors" value={dashboard.summary.errorMailboxCount} tone={dashboard.summary.errorMailboxCount > 0 ? "bad" : undefined} />
        <Metric label="queued" value={dashboard.summary.pendingJobCount} tone={dashboard.summary.pendingJobCount > 0 ? "warn" : undefined} />
        <Metric label="failed" value={dashboard.summary.failedJobCount + dashboard.summary.failedMessageCount} tone={dashboard.summary.failedJobCount + dashboard.summary.failedMessageCount > 0 ? "bad" : undefined} />
      </div>

      <OpsDiagnostics dashboard={dashboard} />

      {!dashboard.sourceDelete.supported ? (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
          Source-delete telemetry is not supported by this branch; the dashboard only reports mailbox, queue, and message processing errors.
        </div>
      ) : null}

      {(() => {
        const orphan = dashboard.orphanJobCounts;
        const total = orphan.pending + orphan.running + orphan.retrying + orphan.failed + orphan.dead;
        if (total === 0) return null;
        return (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">{total} background job{total === 1 ? "" : "s"}</span> are not associated with any mailbox
              ({orphan.failed + orphan.dead} failed, {orphan.pending + orphan.running + orphan.retrying} active).
              These usually point to a deleted mailbox or a malformed payload — retry from the failures list below.
            </div>
          </div>
        );
      })()}

      <section className="overflow-hidden rounded-md border border-border bg-background">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Mailboxes</h2>
            <div className="text-xs text-muted-foreground">Per-mailbox poll health and queue state.</div>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to="/company/settings/email">
              <Settings className="h-4 w-4" />
              Configure
            </Link>
          </Button>
        </div>
        {pollError ? (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">Poll request failed.</span>{" "}
              {errorMessage(pollError, "The selected mailbox could not be queued for polling. Refresh and try again.")}
            </div>
          </div>
        ) : null}
        {dashboard.mailboxes.length === 0 ? (
          <div className="border-t border-border px-4 py-8 text-sm text-muted-foreground">
            No inbound mailboxes are configured for this company.
          </div>
        ) : (
          dashboard.mailboxes.map((item) => (
            <MailboxRow
              key={item.mailbox.id}
              item={item}
              polling={pollingMailboxId === item.mailbox.id}
              onPollNow={(mailboxId) => {
                pollMailboxMutation.reset();
                pollMailboxMutation.mutate(mailboxId);
              }}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Recent Failures</h2>
          <div className="text-xs text-muted-foreground">Latest failed queue jobs and failed inbound message processing records.</div>
        </div>
        {retryError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">Retry failed.</span>{" "}
              {errorMessage(retryError, "The selected failure could not be retried. Refresh and try again.")}
            </div>
          </div>
        ) : null}
        <FailureList
          dashboard={dashboard}
          onRetryMessage={(id) => {
            retryJobMutation.reset();
            retryMessageMutation.mutate(id);
          }}
          onRetryJob={(id) => {
            retryMessageMutation.reset();
            retryJobMutation.mutate(id);
          }}
          retryingId={retryingId}
        />
      </section>
    </div>
  );
}
