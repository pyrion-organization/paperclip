import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  InboundEmailClassificationCategory,
  InboundEmailExternalIntakeRecord,
  InboundEmailExternalIntakeSourceKind,
  InboundEmailExternalIntakeStatus,
  InboundEmailMessage,
  InboundEmailMessageStatus,
  InboundEmailOpsDashboard,
  InboundEmailOpsMailbox,
  InboundEmailOpsMailboxHealth,
} from "@paperclipai/shared";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
  Inbox,
  Loader2,
  MailWarning,
  RefreshCw,
  Search,
  Settings,
  Upload,
  XCircle,
} from "lucide-react";
import { companiesApi, type ImportExternalInboundEmailMessageRequest } from "../api/companies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { Link } from "@/lib/router";
import { queryKeys } from "../lib/queryKeys";
import { useInvalidatingMutation } from "../lib/useInvalidatingMutation";

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

const messageStatusFilters: Array<{ value: InboundEmailMessageStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "processed", label: "Processed" },
  { value: "skipped", label: "Skipped" },
  { value: "duplicate", label: "Duplicate" },
  { value: "failed", label: "Failed" },
  { value: "persisted", label: "Imported" },
  { value: "processing", label: "Processing" },
  { value: "discovered", label: "Discovered" },
];

const PROCESSED_EMAIL_PAGE_SIZE = 25;
const EXTERNAL_INTAKE_PAGE_SIZE = 10;
const QUARANTINE_PAGE_SIZE = 10;
const CLASSIFICATION_REVIEW_PAGE_SIZE = 10;
const QUARANTINE_CLASSIFICATIONS: InboundEmailClassificationCategory[] = [
  "unsafe_or_prompt_injection",
  "spam_or_irrelevant",
];

const externalIntakeSourceKinds: Array<{ value: InboundEmailExternalIntakeSourceKind; label: string }> = [
  { value: "manual_recovery", label: "Manual recovery" },
  { value: "queue", label: "Queue backup" },
  { value: "object_storage", label: "Object storage" },
  { value: "webhook", label: "Webhook" },
];

const externalIntakeSourceLabels: Record<InboundEmailExternalIntakeSourceKind, string> = {
  manual_recovery: "Manual recovery",
  queue: "Queue backup",
  object_storage: "Object storage",
  webhook: "Webhook",
};

const externalIntakeStatusFilters: Array<{ value: InboundEmailExternalIntakeStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "imported", label: "Imported" },
  { value: "duplicate", label: "Duplicate" },
  { value: "failed", label: "Failed" },
];

const classificationLabels: Record<InboundEmailClassificationCategory, string> = {
  code_bug: "Code bug",
  infra_incident: "Infra",
  how_to_question: "Question",
  feature_request: "Feature",
  account_access: "Access",
  spam_or_irrelevant: "Spam",
  unsafe_or_prompt_injection: "Unsafe",
  unclear: "Unclear",
};

const supportReplyReasonLabels: Record<NonNullable<InboundEmailMessage["supportReplyReason"]>, string> = {
  code_bug_received: "Bug confirmation",
  infra_incident_received: "Infra confirmation",
  feature_request_received: "Feature confirmation",
  how_to_question_received: "Question confirmation",
  account_access_received: "Access confirmation",
  unclear_request_more_info: "Asked for info",
  smtp_not_configured: "SMTP not configured",
  reply_disabled: "Replies disabled",
  unsafe_or_spam: "No unsafe/spam reply",
  missing_sender: "Missing sender",
  send_failed: "Send failed",
};

function isQuarantineClassification(
  category: InboundEmailClassificationCategory | null | undefined,
): category is InboundEmailClassificationCategory {
  return Boolean(category && QUARANTINE_CLASSIFICATIONS.includes(category));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExternalIntakeSourceKind(value: unknown): value is InboundEmailExternalIntakeSourceKind {
  return typeof value === "string" && externalIntakeSourceKinds.some((item) => item.value === value);
}

function parseExternalIntakeBatchJson(
  input: string,
  defaults: { mailboxId: string; sourceKind: InboundEmailExternalIntakeSourceKind },
): ImportExternalInboundEmailMessageRequest[] {
  const parsed = JSON.parse(input) as unknown;
  const messages = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.messages) ? parsed.messages : null;
  if (!messages) {
    throw new Error("Batch JSON must be an array, or an object with a messages array.");
  }
  return messages.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Batch item ${index + 1} must be an object.`);
    }
    const rawEmail = typeof item.rawEmail === "string" ? item.rawEmail : "";
    const sourceId = typeof item.sourceId === "string" ? item.sourceId.trim() : "";
    if (!sourceId) {
      throw new Error(`Batch item ${index + 1} is missing sourceId.`);
    }
    if (!rawEmail.trim()) {
      throw new Error(`Batch item ${index + 1} is missing rawEmail.`);
    }
    const sourceLocation = typeof item.sourceLocation === "string" && item.sourceLocation.trim()
      ? item.sourceLocation.trim()
      : null;
    const message: ImportExternalInboundEmailMessageRequest = {
      mailboxId: typeof item.mailboxId === "string" && item.mailboxId.trim() ? item.mailboxId.trim() : defaults.mailboxId,
      sourceKind: isExternalIntakeSourceKind(item.sourceKind) ? item.sourceKind : defaults.sourceKind,
      sourceId,
      sourceLocation,
      rawEmail,
    };
    if (isRecord(item.metadata)) {
      message.metadata = item.metadata;
    }
    if (typeof item.receivedAt === "string" && item.receivedAt.trim()) {
      message.receivedAt = item.receivedAt.trim();
    }
    return message;
  });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const shortDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTime(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "Never";
  return shortDateTimeFormatter.format(date);
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
  return null;
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
      <Icon className="size-3" />
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
  const healthExplanation = explainMailboxHealth(item);
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
            {polling ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            Poll now
          </Button>
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
        {healthExplanation ? (
          <div className="mt-1 min-w-0 break-words text-xs text-muted-foreground">{healthExplanation}</div>
        ) : null}
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
            <ExternalLink className="size-3" />
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
  classificationCategory?: InboundEmailClassificationCategory | null;
  classificationConfidence?: number | null;
  classificationFinalAction?: InboundEmailMessage["classificationFinalAction"];
  classificationSafetyFlags?: string[] | null;
  supportReplyStatus?: InboundEmailMessage["supportReplyStatus"];
  supportReplyReason?: InboundEmailMessage["supportReplyReason"];
  supportReplyError?: string | null;
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
      classificationCategory: message.classificationCategory,
      classificationConfidence: message.classificationConfidence,
      classificationFinalAction: message.classificationFinalAction,
      classificationSafetyFlags: message.classificationSafetyFlags,
      supportReplyStatus: message.supportReplyStatus,
      supportReplyReason: message.supportReplyReason,
      supportReplyError: message.supportReplyError,
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
              {failure.classificationCategory ? (
                <ClassificationBadges
                  message={{
                    classificationCategory: failure.classificationCategory,
                    classificationConfidence: failure.classificationConfidence ?? null,
                    classificationFinalAction: failure.classificationFinalAction ?? null,
                    classificationSafetyFlags: failure.classificationSafetyFlags ?? null,
                  }}
                />
              ) : null}
              {failure.supportReplyStatus ? (
                <SupportReplyBadge
                  message={{
                    supportReplyStatus: failure.supportReplyStatus,
                    supportReplyReason: failure.supportReplyReason ?? null,
                    supportReplyError: failure.supportReplyError ?? null,
                  }}
                />
              ) : null}
              <div className="text-foreground">{failure.detail}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => (failure.source === "message" ? onRetryMessage(failure.refId) : onRetryJob(failure.refId))}
            >
              {pending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              Retry
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function OpsPanel({
  title,
  description,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  description: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="overflow-hidden rounded-md border border-border bg-background">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex min-w-0 items-start gap-2">
            {open ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold">{title}</span>
                {typeof count === "number" ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[11px] tabular-nums">
                    {count}
                  </Badge>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
            </span>
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border p-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function statusClassName(status: InboundEmailMessageStatus) {
  switch (status) {
    case "processed":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "skipped":
    case "duplicate":
      return "border-border bg-muted/50 text-muted-foreground";
    case "failed":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    case "processing":
      return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
    case "persisted":
    case "discovered":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
}

function externalIntakeStatusClassName(status: InboundEmailExternalIntakeStatus) {
  switch (status) {
    case "imported":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "duplicate":
      return "border-border bg-muted/50 text-muted-foreground";
    case "failed":
      return "border-destructive/50 bg-destructive/10 text-destructive";
  }
}

function classificationClassName(category: InboundEmailClassificationCategory | null | undefined) {
  switch (category) {
    case "code_bug":
      return "border-orange-500/40 bg-orange-500/10 text-orange-300";
    case "infra_incident":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    case "unsafe_or_prompt_injection":
    case "spam_or_irrelevant":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    case "feature_request":
      return "border-violet-500/40 bg-violet-500/10 text-violet-300";
    case "how_to_question":
      return "border-blue-500/40 bg-blue-500/10 text-blue-300";
    case "account_access":
      return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
    case "unclear":
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

function ClassificationBadges({ message }: {
  message: Pick<
    InboundEmailMessage,
    "classificationCategory" | "classificationConfidence" | "classificationFinalAction" | "classificationSafetyFlags"
  >;
}) {
  if (!message.classificationCategory) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <Badge variant="outline" className={`h-5 px-1.5 text-[11px] ${classificationClassName(message.classificationCategory)}`}>
        {classificationLabels[message.classificationCategory]}
        {message.classificationConfidence !== null ? ` ${message.classificationConfidence}%` : ""}
      </Badge>
      {message.classificationFinalAction ? (
        <Badge variant="outline" className="h-5 border-border bg-muted/30 px-1.5 text-[11px] text-muted-foreground">
          {message.classificationFinalAction.replaceAll("_", " ")}
        </Badge>
      ) : null}
      {message.classificationSafetyFlags?.length ? (
        <Badge variant="outline" className="h-5 border-destructive/50 bg-destructive/10 px-1.5 text-[11px] text-destructive">
          {message.classificationSafetyFlags.length} safety
        </Badge>
      ) : null}
    </div>
  );
}

function SupportReplyBadge({ message }: {
  message: Pick<InboundEmailMessage, "supportReplyStatus" | "supportReplyReason" | "supportReplyError">;
}) {
  if (!message.supportReplyStatus) return null;
  const className =
    message.supportReplyStatus === "sent"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : message.supportReplyStatus === "failed"
        ? "border-destructive/50 bg-destructive/10 text-destructive"
        : "border-border bg-muted/30 text-muted-foreground";
  const label = message.supportReplyReason
    ? supportReplyReasonLabels[message.supportReplyReason]
    : message.supportReplyStatus;
  return (
    <Badge
      variant="outline"
      className={`h-5 px-1.5 text-[11px] ${className}`}
      title={message.supportReplyError ?? undefined}
    >
      Reply: {label}
    </Badge>
  );
}

function ExternalIntakeRecovery({
  companyId,
  mailboxes,
  onImported,
}: {
  companyId: string;
  mailboxes: InboundEmailOpsMailbox[];
  onImported: () => void;
}) {
  const [mailboxId, setMailboxId] = useState(mailboxes[0]?.mailbox.id ?? "");
  const [sourceKind, setSourceKind] = useState<InboundEmailExternalIntakeSourceKind>("manual_recovery");
  const [sourceId, setSourceId] = useState("");
  const [sourceLocation, setSourceLocation] = useState("");
  const [rawEmail, setRawEmail] = useState("");
  const [batchJson, setBatchJson] = useState("");
  const [intakeStatus, setIntakeStatus] = useState<InboundEmailExternalIntakeStatus | "all">("all");
  const [intakeMailboxId, setIntakeMailboxId] = useState("all");
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const rawEmailRef = useRef<HTMLTextAreaElement | null>(null);
  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  useEffect(() => {
    if (!mailboxId && mailboxes[0]?.mailbox.id) {
      setMailboxId(mailboxes[0].mailbox.id);
    }
  }, [mailboxId, mailboxes]);

  // Reset pagination when the company or filters change.
  const intakeCursorKey = `${companyId}::${intakeStatus}::${intakeMailboxId}`;
  const prevIntakeCursorKeyRef = useRef(intakeCursorKey);
  if (intakeCursorKey !== prevIntakeCursorKeyRef.current) {
    prevIntakeCursorKeyRef.current = intakeCursorKey;
    setCursorStack([]);
  }

  const externalIntakeQuery = useQuery({
    queryKey: [
      ...queryKeys.inboundEmail.externalIntake(companyId),
      { status: intakeStatus, mailboxId: intakeMailboxId, cursor, limit: EXTERNAL_INTAKE_PAGE_SIZE, order: "desc" },
    ],
    queryFn: () => companiesApi.listExternalInboundEmailIntake(companyId, {
      ...(intakeStatus === "all" ? {} : { status: intakeStatus }),
      ...(intakeMailboxId === "all" ? {} : { mailboxId: intakeMailboxId }),
      ...(cursor ? { cursor } : {}),
      limit: EXTERNAL_INTAKE_PAGE_SIZE,
      order: "desc",
    }),
    enabled: Boolean(companyId),
  });

  const importMutation = useInvalidatingMutation({
    mutationFn: () => companiesApi.importExternalInboundEmailMessage(companyId, {
      mailboxId,
      sourceKind,
      sourceId,
      sourceLocation: sourceLocation.trim() || null,
      rawEmail,
    }),
    onSuccess: () => {
      setSourceId("");
      setSourceLocation("");
      setRawEmail("");
      onImported();
    },
  });

  const batchImportMutation = useInvalidatingMutation({
    mutationFn: () => companiesApi.importExternalInboundEmailMessagesBatch(companyId, {
      messages: parseExternalIntakeBatchJson(batchJson, { mailboxId, sourceKind }),
    }),
    onSuccess: () => {
      setBatchJson("");
      onImported();
    },
  });

  const submitImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    importMutation.reset();
    importMutation.mutate();
  };

  const submitBatchImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    batchImportMutation.reset();
    batchImportMutation.mutate();
  };

  const prepareRetry = (record: InboundEmailExternalIntakeRecord) => {
    setMailboxId(record.mailboxId);
    setSourceKind(record.sourceKind);
    setSourceId(record.sourceId);
    setSourceLocation(record.sourceLocation ?? "");
    setRawEmail("");
    importMutation.reset();
    rawEmailRef.current?.focus();
  };

  const canSubmit = Boolean(mailboxId && sourceId.trim() && rawEmail.trim()) && !importMutation.isPending;
  const canBatchSubmit = Boolean(mailboxId && batchJson.trim()) && !batchImportMutation.isPending;
  const rows = externalIntakeQuery.data?.items ?? [];
  const nextCursor = externalIntakeQuery.data?.nextCursor ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.95fr)_minmax(360px,1.05fr)]">
      <div className="space-y-4">
        <form className="space-y-3" onSubmit={submitImport}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="external-intake-mailbox">Mailbox</label>
              <Select value={mailboxId} onValueChange={setMailboxId} disabled={mailboxes.length === 0}>
                <SelectTrigger id="external-intake-mailbox" size="sm" className="w-full">
                  <SelectValue placeholder="Mailbox" />
                </SelectTrigger>
                <SelectContent>
                  {mailboxes.map((item) => (
                    <SelectItem key={item.mailbox.id} value={item.mailbox.id}>
                      {item.mailbox.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="external-intake-source-kind">Source</label>
              <Select value={sourceKind} onValueChange={(value) => setSourceKind(value as InboundEmailExternalIntakeSourceKind)}>
                <SelectTrigger id="external-intake-source-kind" size="sm" className="w-full">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  {externalIntakeSourceKinds.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="external-intake-source-id">Source ID</label>
            <Input
              id="external-intake-source-id"
              className="h-8 text-xs"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              placeholder="backup-object-key, queue message ID, or webhook event ID"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="external-intake-source-location">Source location</label>
            <Input
              id="external-intake-source-location"
              className="h-8 text-xs"
              value={sourceLocation}
              onChange={(event) => setSourceLocation(event.target.value)}
              placeholder="Optional object URL or mailbox backup path"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="external-intake-raw-email">Raw email</label>
            <Textarea
              id="external-intake-raw-email"
              ref={rawEmailRef}
              className="min-h-36 font-mono text-xs"
              value={rawEmail}
              onChange={(event) => setRawEmail(event.target.value)}
              placeholder={"Message-ID: <...>\nFrom: customer@example.com\nTo: support@example.com\nSubject: ...\n\nOriginal body"}
            />
          </div>
          {importMutation.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <span className="font-medium">External import failed.</span>{" "}
                {errorMessage(importMutation.error, "The preserved message could not be imported.")}
              </div>
            </div>
          ) : null}
          {importMutation.isSuccess ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              External intake recorded as {importMutation.data.status}.
            </div>
          ) : null}
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {importMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Import preserved email
          </Button>
        </form>

        <form className="space-y-3 rounded-md border border-border bg-card/40 p-3" onSubmit={submitBatchImport}>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Batch JSON import</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Paste an array, or {"{"}messages: [...]{"}"}. Items inherit the selected mailbox and source when omitted.
            </div>
          </div>
          <Textarea
            className="min-h-28 font-mono text-xs"
            value={batchJson}
            onChange={(event) => setBatchJson(event.target.value)}
            placeholder={'[{"sourceId":"backup-1","rawEmail":"Message-ID: <...>\\nFrom: ..."}]'}
            aria-label="External intake batch JSON"
          />
          {batchImportMutation.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <span className="font-medium">Batch import failed.</span>{" "}
                {errorMessage(batchImportMutation.error, "The preserved message batch could not be imported.")}
              </div>
            </div>
          ) : null}
          {batchImportMutation.isSuccess ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              Batch recorded: {batchImportMutation.data.importedCount} imported, {batchImportMutation.data.duplicateCount} duplicate, {batchImportMutation.data.failedCount} failed.
            </div>
          ) : null}
          {batchImportMutation.data?.results.length ? (
            <div className="overflow-hidden rounded-md border border-border bg-background/40">
              <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Batch item results
              </div>
              <div className="max-h-56 overflow-y-auto">
                {batchImportMutation.data.results.map((result) => {
                  const error = result.error ?? result.intakeRecord?.error ?? null;
                  return (
                    <div
                      key={`${result.sourceKind}:${result.sourceId}`}
                      className="grid gap-2 border-t border-border px-3 py-2 first:border-t-0 sm:grid-cols-[120px_minmax(0,1fr)]"
                    >
                      <div>
                        <Badge
                          variant="outline"
                          className={`h-5 px-1.5 text-[11px] ${externalIntakeStatusClassName(result.status)}`}
                        >
                          {result.status}
                        </Badge>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">
                          {externalIntakeSourceLabels[result.sourceKind]}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                          {result.sourceId}
                        </div>
                        {error ? <div className="mt-1 break-words text-[11px] text-destructive">{error}</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <Button type="submit" size="sm" variant="outline" disabled={!canBatchSubmit}>
            {batchImportMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Import batch
          </Button>
        </form>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card/60">
        <div className="space-y-2 border-b border-border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent external intake</div>
            {externalIntakeQuery.isFetching ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {externalIntakeStatusFilters.map((filter) => (
                <Button
                  key={filter.value}
                  type="button"
                  size="sm"
                  variant={intakeStatus === filter.value ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  aria-pressed={intakeStatus === filter.value}
                  aria-label={`Show ${filter.label.toLowerCase()} external intake`}
                  onClick={() => setIntakeStatus(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
            <Select value={intakeMailboxId} onValueChange={setIntakeMailboxId}>
              <SelectTrigger size="sm" className="h-7 w-full text-xs sm:w-44">
                <SelectValue placeholder="Mailbox" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All mailboxes</SelectItem>
                {mailboxes.map((item) => (
                  <SelectItem key={item.mailbox.id} value={item.mailbox.id}>
                    {item.mailbox.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {externalIntakeQuery.isError ? (
          <div className="flex items-start gap-2 px-3 py-5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {errorMessage(externalIntakeQuery.error, "External intake records could not be loaded.")}
          </div>
        ) : externalIntakeQuery.isLoading ? (
          <div className="flex items-center gap-2 px-3 py-5 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading external intake&hellip;
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-5 text-xs text-muted-foreground">
            No external intake records match these filters.
          </div>
        ) : (
          <>
            {rows.map((record: InboundEmailExternalIntakeRecord) => (
              <div key={record.id} className="grid gap-2 border-t border-border px-3 py-2 first:border-t-0 sm:grid-cols-[minmax(120px,0.7fr)_minmax(180px,1fr)_120px]">
                <div className="min-w-0">
                  <Badge variant="outline" className={`mb-1 h-5 px-1.5 text-[11px] ${externalIntakeStatusClassName(record.status)}`}>
                    {record.status}
                  </Badge>
                  <div className="text-xs text-muted-foreground">{formatRelative(record.createdAt)}</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{externalIntakeSourceLabels[record.sourceKind]}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{record.sourceId}</div>
                  {record.sourceLocation ? <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{record.sourceLocation}</div> : null}
                  {record.error ? <div className="mt-1 break-words text-[11px] text-destructive">{record.error}</div> : null}
                </div>
                <div className="min-w-0 space-y-1 text-xs text-muted-foreground sm:text-right">
                  <div>{record.messageId ?? record.rawSha256.slice(0, 12)}</div>
                  {record.status === "failed" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => prepareRetry(record)}
                    >
                      <RefreshCw className="size-3.5" />
                      Retry source
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={cursorStack.length === 0}
                onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={!nextCursor}
                onClick={() => {
                  if (nextCursor) setCursorStack((stack) => [...stack, nextCursor]);
                }}
              >
                Older
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProcessedEmailList({
  companyId,
  mailboxes,
}: {
  companyId: string;
  mailboxes: InboundEmailOpsMailbox[];
}) {
  const [status, setStatus] = useState<InboundEmailMessageStatus | "all">("all");
  const [mailboxId, setMailboxId] = useState("all");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  // Reset pagination when the company or filters change.
  const processedCursorKey = `${companyId}::${status}::${mailboxId}::${query}`;
  const prevProcessedCursorKeyRef = useRef(processedCursorKey);
  if (processedCursorKey !== prevProcessedCursorKeyRef.current) {
    prevProcessedCursorKeyRef.current = processedCursorKey;
    setCursorStack([]);
  }

  const messagesQuery = useQuery({
    queryKey: [
      ...queryKeys.inboundEmail.messages(companyId),
      {
        status,
        mailboxId,
        query,
        cursor,
      },
    ],
    queryFn: () => companiesApi.listInboundEmailMessages(companyId, {
      status: status === "all" ? undefined : status,
      mailboxId: mailboxId === "all" ? undefined : mailboxId,
      q: query || undefined,
      cursor,
      limit: PROCESSED_EMAIL_PAGE_SIZE,
      order: "desc",
    }),
    enabled: Boolean(companyId),
    placeholderData: (previous) => previous,
  });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery(queryInput.trim());
  };

  const rows = [...(messagesQuery.data?.items ?? [])].sort((a, b) => {
    const aTime = asDate(a.receivedAt ?? a.createdAt)?.getTime() ?? 0;
    const bTime = asDate(b.receivedAt ?? b.createdAt)?.getTime() ?? 0;
    return bTime - aTime;
  });
  const canPrevious = cursorStack.length > 0;
  const canNext = Boolean(messagesQuery.data?.nextCursor);

  return (
    <div className="space-y-3">
      <form className="grid gap-2 md:grid-cols-[minmax(180px,240px)_minmax(160px,220px)_1fr_auto]" onSubmit={submitSearch}>
        <Select value={status} onValueChange={(value) => setStatus(value as InboundEmailMessageStatus | "all")}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {messageStatusFilters.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mailboxId} onValueChange={setMailboxId}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Mailbox" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All mailboxes</SelectItem>
            {mailboxes.map((item) => (
              <SelectItem key={item.mailbox.id} value={item.mailbox.id}>
                {item.mailbox.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Search sender, subject, or message ID"
            aria-label="Search processed emails"
          />
        </div>
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
      </form>

      {messagesQuery.isError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <span className="font-medium">Email list failed.</span>{" "}
            {errorMessage(messagesQuery.error, "The processed email list could not be loaded.")}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-card/60">
        {messagesQuery.isLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading emails&hellip;
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-start gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Inbox className="mt-0.5 size-4 shrink-0" />
            No emails match the current filters.
          </div>
        ) : (
          rows.map((message: InboundEmailMessage) => (
            <div key={message.id} className="grid gap-2 border-t border-border px-4 py-3 first:border-t-0 lg:grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.2fr)_minmax(180px,1fr)_140px]">
              <div className="min-w-0">
                <Badge variant="outline" className={`mb-1 h-5 px-1.5 text-[11px] ${statusClassName(message.status)}`}>
                  {messageStatusLabel(message.status)}
                </Badge>
                <div className="text-xs text-muted-foreground">{formatTime(message.receivedAt ?? message.createdAt)}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{message.subject || "(No subject)"}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{message.fromAddress || "Unknown sender"}</div>
                <ClassificationBadges message={message} />
                <div className="mt-1 flex flex-wrap gap-1">
                  <SupportReplyBadge message={message} />
                </div>
              </div>
              <div className="min-w-0 break-words text-xs text-muted-foreground">
                {message.classificationSummary || message.error || message.skipReason || message.messageId || message.rawSha256}
              </div>
              <div className="flex items-start justify-start lg:justify-end">
                {message.createdIssueId ? (
                  <Link className="inline-flex items-center gap-1 text-xs text-primary hover:underline" to={`/issues/${message.createdIssueId}`}>
                    <ExternalLink className="size-3" />
                    Issue
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">No issue</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Page {cursorStack.length + 1}
          {messagesQuery.isFetching && !messagesQuery.isLoading ? " · refreshing" : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!canPrevious || messagesQuery.isFetching}
            onClick={() => setCursorStack((current) => current.slice(0, -1))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canNext || messagesQuery.isFetching}
            onClick={() => {
              const nextCursor = messagesQuery.data?.nextCursor;
              if (nextCursor) setCursorStack((current) => [...current, nextCursor]);
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuarantineEmailList({ companyId }: { companyId: string }) {
  const unsafeQuery = useQuery({
    queryKey: [...queryKeys.inboundEmail.messages(companyId), { quarantine: "unsafe_or_prompt_injection" }],
    queryFn: () => companiesApi.listInboundEmailMessages(companyId, {
      status: "skipped",
      classificationCategory: "unsafe_or_prompt_injection",
      limit: QUARANTINE_PAGE_SIZE,
      order: "desc",
    }),
    enabled: Boolean(companyId),
  });
  const spamQuery = useQuery({
    queryKey: [...queryKeys.inboundEmail.messages(companyId), { quarantine: "spam_or_irrelevant" }],
    queryFn: () => companiesApi.listInboundEmailMessages(companyId, {
      status: "skipped",
      classificationCategory: "spam_or_irrelevant",
      limit: QUARANTINE_PAGE_SIZE,
      order: "desc",
    }),
    enabled: Boolean(companyId),
  });

  const isLoading = unsafeQuery.isLoading || spamQuery.isLoading;
  const error = unsafeQuery.error ?? spamQuery.error;
  const rows = [...(unsafeQuery.data?.items ?? []), ...(spamQuery.data?.items ?? [])]
    .filter((message) => isQuarantineClassification(message.classificationCategory))
    .sort((a, b) => {
      const aTime = asDate(a.receivedAt ?? a.createdAt)?.getTime() ?? 0;
      const bTime = asDate(b.receivedAt ?? b.createdAt)?.getTime() ?? 0;
      return bTime - aTime;
    })
    .slice(0, QUARANTINE_PAGE_SIZE);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <span className="font-medium">Quarantine failed.</span>{" "}
          {errorMessage(error, "The quarantined email list could not be loaded.")}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card/60">
      {isLoading ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading quarantined emails&hellip;
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-start gap-2 px-4 py-6 text-sm text-muted-foreground">
          <MailWarning className="mt-0.5 size-4 shrink-0" />
          No unsafe or spam support emails are currently quarantined.
        </div>
      ) : (
        rows.map((message) => {
          const category = message.classificationCategory;
          if (!isQuarantineClassification(category)) return null;
          return (
            <div key={message.id} className="grid gap-2 border-t border-border px-4 py-3 first:border-t-0 lg:grid-cols-[minmax(160px,0.8fr)_minmax(220px,1.1fr)_minmax(220px,1fr)]">
              <div className="min-w-0">
                <Badge variant="outline" className={`mb-1 h-5 px-1.5 text-[11px] ${classificationClassName(category)}`}>
                  {classificationLabels[category]}
                </Badge>
                <div className="text-xs text-muted-foreground">{formatTime(message.receivedAt ?? message.createdAt)}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{message.subject || "(No subject)"}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{message.fromAddress || "Unknown sender"}</div>
                {message.skipReason ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">Skipped: {message.skipReason}</div>
                ) : null}
              </div>
              <div className="min-w-0 break-words text-xs text-muted-foreground">
                {message.classificationSafetyFlags?.length ? (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {message.classificationSafetyFlags.slice(0, 4).map((flag) => (
                      <Badge key={flag} variant="outline" className="h-5 px-1.5 text-[11px]">
                        {flag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {message.classificationSummary || message.error || message.messageId || message.rawSha256}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ClassificationReviewList({ companyId }: { companyId: string }) {
  const reviewQuery = useQuery({
    queryKey: [...queryKeys.inboundEmail.messages(companyId), { classificationReview: "low_confidence" }],
    queryFn: () => companiesApi.listInboundEmailMessages(companyId, {
      classificationReview: "low_confidence",
      limit: CLASSIFICATION_REVIEW_PAGE_SIZE,
      order: "desc",
    }),
    enabled: Boolean(companyId),
  });

  const rows = reviewQuery.data?.items ?? [];

  if (reviewQuery.isError) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <span className="font-medium">Classification review failed.</span>{" "}
          {errorMessage(reviewQuery.error, "The low-confidence email list could not be loaded.")}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card/60">
      {reviewQuery.isLoading ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading classification review&hellip;
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-start gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          No low-confidence or unclear classified emails need review.
        </div>
      ) : (
        rows.map((message) => (
          <div key={message.id} className="grid gap-2 border-t border-border px-4 py-3 first:border-t-0 lg:grid-cols-[minmax(160px,0.8fr)_minmax(220px,1.1fr)_minmax(220px,1fr)_120px]">
            <div className="min-w-0">
              <Badge variant="outline" className={`mb-1 h-5 px-1.5 text-[11px] ${statusClassName(message.status)}`}>
                {messageStatusLabel(message.status)}
              </Badge>
              <div className="text-xs text-muted-foreground">{formatTime(message.receivedAt ?? message.createdAt)}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{message.subject || "(No subject)"}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{message.fromAddress || "Unknown sender"}</div>
              <ClassificationBadges message={message} />
            </div>
            <div className="min-w-0 break-words text-xs text-muted-foreground">
              {message.classificationSummary || message.error || message.skipReason || message.messageId || message.rawSha256}
            </div>
            <div className="flex items-start justify-start lg:justify-end">
              {message.createdIssueId ? (
                <Link className="inline-flex items-center gap-1 text-xs text-primary hover:underline" to={`/issues/${message.createdIssueId}`}>
                  <ExternalLink className="size-3" />
                  Issue
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">No issue</span>
              )}
            </div>
          </div>
        ))
      )}
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
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
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
            <Icon className="mt-0.5 size-4 shrink-0" />
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

  const invalidateInboundEmailState = (groups: Array<"ops" | "messages" | "jobs" | "externalIntake">) => {
    if (!selectedCompanyId) return;
    for (const group of groups) {
      queryClient.invalidateQueries({ queryKey: queryKeys.inboundEmail[group](selectedCompanyId) });
    }
  };

  const retryMessageMutation = useInvalidatingMutation({
    mutationFn: (messageId: string) => companiesApi.retryInboundEmailMessage(selectedCompanyId!, messageId),
    onSuccess: () => {
      invalidateInboundEmailState(["ops", "messages", "jobs"]);
    },
  });
  const retryJobMutation = useInvalidatingMutation({
    mutationFn: (jobId: string) => companiesApi.retryInboundEmailJob(selectedCompanyId!, jobId),
    onSuccess: () => {
      invalidateInboundEmailState(["ops", "messages", "jobs"]);
    },
  });
  const pollMailboxMutation = useInvalidatingMutation({
    mutationFn: (mailboxId: string) => companiesApi.pollInboundEmailMailbox(selectedCompanyId!, mailboxId),
    onSuccess: () => {
      invalidateInboundEmailState(["ops", "messages", "jobs"]);
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
        <Loader2 className="size-4 animate-spin" />
        Loading inbound email operations&hellip;
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
            {dashboardQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
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
          <MailWarning className="mt-0.5 size-4 shrink-0" />
          Source-delete telemetry is not supported by this branch; the dashboard only reports mailbox, queue, and message processing errors.
        </div>
      ) : null}

      {(() => {
        const orphan = dashboard.orphanJobCounts;
        const total = orphan.pending + orphan.running + orphan.retrying + orphan.failed + orphan.dead;
        if (total === 0) return null;
        return (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <span className="font-medium">{total} background job{total === 1 ? "" : "s"}</span> are not associated with any mailbox
              ({orphan.failed + orphan.dead} failed, {orphan.pending + orphan.running + orphan.retrying} active).
              These usually point to a deleted mailbox or a malformed payload, retry from the failures list below.
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
              <Settings className="size-4" />
              Configure
            </Link>
          </Button>
        </div>
        {pollError ? (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
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

      <OpsPanel
        title="External Recovery Import"
        description="Import preserved raw support messages from backup mailboxes, webhooks, queues, or object storage."
        defaultOpen={false}
      >
        <ExternalIntakeRecovery
          companyId={selectedCompanyId!}
          mailboxes={dashboard.mailboxes}
          onImported={() => {
            invalidateInboundEmailState(["ops", "messages", "jobs", "externalIntake"]);
          }}
        />
      </OpsPanel>

      <OpsPanel
        title="Quarantine"
        description="Skipped unsafe prompt-injection and spam emails kept out of issue creation and support replies."
        defaultOpen={false}
      >
        <QuarantineEmailList companyId={selectedCompanyId!} />
      </OpsPanel>

      <OpsPanel
        title="Classification Review"
        description="Unclear or low-confidence classified emails that need operator review before tuning routing rules."
        defaultOpen={false}
      >
        <ClassificationReviewList companyId={selectedCompanyId!} />
      </OpsPanel>

      <OpsPanel
        title="Recent Failures"
        description="Latest failed queue jobs and failed inbound message processing records."
        count={dashboard.recentFailedJobs.length + dashboard.recentFailedMessages.length}
      >
        {retryError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
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
      </OpsPanel>

      <OpsPanel
        title="Processed Emails"
        description="Paginated inbound email records with mailbox, status, and text filters."
        count={dashboard.mailboxes.reduce((total, item) => total + item.messageCounts.processed, 0)}
      >
        <ProcessedEmailList companyId={selectedCompanyId!} mailboxes={dashboard.mailboxes} />
      </OpsPanel>
    </div>
  );
}
