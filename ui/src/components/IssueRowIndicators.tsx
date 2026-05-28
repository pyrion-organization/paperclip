import type { ReactNode } from "react";
import type { Issue, IssueProductivityReview, IssueRecoveryAction } from "@paperclipai/shared";
import { Eye, Flag, OctagonAlert, RefreshCw, TriangleAlert } from "lucide-react";

import { cn } from "../lib/classnames";

type ActiveRecoveryDisplayState = "needed" | "in_progress" | "observe_only" | "escalated";

const RECOVERY_CHIP_DEFAULT_TONE: Record<
  ActiveRecoveryDisplayState,
  { className: string; icon: typeof TriangleAlert; label: string }
> = {
  needed: {
    className:
      "border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    icon: TriangleAlert,
    label: "Recovery needed",
  },
  in_progress: {
    className:
      "border-sky-500/60 bg-sky-500/15 text-sky-700 dark:text-sky-300",
    icon: RefreshCw,
    label: "Recovery in progress",
  },
  observe_only: {
    className: "border-border bg-muted text-muted-foreground",
    icon: Eye,
    label: "Observing active run",
  },
  escalated: {
    className: "border-red-500/60 bg-red-500/15 text-red-700 dark:text-red-300",
    icon: OctagonAlert,
    label: "Recovery escalated",
  },
};

const PRODUCTIVITY_REVIEW_TRIGGER_LABELS: Record<string, string> = {
  no_comment_streak: "No-comment streak",
  long_active_duration: "Long active duration",
  high_churn: "High churn",
};

export function IssueRowIndicators({
  issue,
  selected,
}: {
  issue: Issue;
  selected: boolean;
}) {
  const productivityReview = issue.productivityReview ?? null;
  const productivityReviewIndicator = productivityReview ? (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
        selected ? "border-muted-foreground text-muted-foreground" : null,
      )}
      title={`Productivity review: ${productivityReviewTriggerLabel(productivityReview.trigger)}`}
      aria-label="Productivity review open"
    >
      <Eye className="size-2.5" aria-hidden />
    </span>
  ) : null;
  const recoveryAction = issue.activeRecoveryAction ?? null;
  const recoveryIndicator = recoveryAction ? renderRecoveryChip(recoveryAction, selected) : null;
  const parkedBlockerIndicator = hasAssignedBacklogBlocker(issue.blockedBy) ? (
    <span
      data-testid="issue-row-parked-blocker"
      className="ml-1.5 inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
      title="Blocked by parked work - at least one assigned blocker is in backlog and will not wake its assignee."
    >
      <Flag className="size-2.5" aria-hidden />
      Blocked by parked work
    </span>
  ) : null;

  if (!productivityReviewIndicator && !recoveryIndicator && !parkedBlockerIndicator) return null;

  return (
    <>
      {productivityReviewIndicator}
      {parkedBlockerIndicator}
      {recoveryIndicator}
    </>
  );
}

function renderRecoveryChip(action: IssueRecoveryAction, selected: boolean): ReactNode {
  const state = deriveActiveRecoveryDisplayState(action);
  if (!state) return null;
  const tone = RECOVERY_CHIP_DEFAULT_TONE[state];
  const Icon = tone.icon;
  return (
    <output
      data-testid="issue-row-recovery-indicator"
      data-recovery-state={state}
      aria-label={tone.label}
      className={cn(
        "ml-1.5 inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        tone.className,
        selected ? "!border-muted-foreground !text-muted-foreground" : null,
      )}
      title={`${tone.label} - open the source issue to act.`}
    >
      <Icon className="size-2.5" aria-hidden />
      {tone.label}
    </output>
  );
}

function productivityReviewTriggerLabel(trigger: IssueProductivityReview["trigger"]): string {
  if (!trigger) return "Productivity review";
  return PRODUCTIVITY_REVIEW_TRIGGER_LABELS[String(trigger)] ?? "Productivity review";
}

function hasAssignedBacklogBlocker(blockers: Issue["blockedBy"] | undefined | null): boolean {
  if (!blockers || blockers.length === 0) return false;
  return blockers.some((blocker) => {
    if (blocker.status === "backlog" && Boolean(blocker.assigneeAgentId)) return true;
    if (blocker.terminalBlockers?.some((terminal) =>
      terminal.status === "backlog" && Boolean(terminal.assigneeAgentId)
    )) {
      return true;
    }
    return false;
  });
}

function deriveActiveRecoveryDisplayState(
  action: Pick<IssueRecoveryAction, "status" | "kind" | "outcome">,
): ActiveRecoveryDisplayState | null {
  if (action.status === "resolved") return null;
  if (action.status === "escalated") return "escalated";
  if (action.status === "cancelled") return null;
  if (action.kind === "active_run_watchdog") return "observe_only";
  if (action.outcome === "delegated") return "in_progress";
  return "needed";
}
