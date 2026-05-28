import type { ReactNode } from "react";
import type { Issue } from "@paperclipai/shared";
import { cn } from "../lib/classnames";
import { StatusIcon } from "./StatusIcon";

export function InboxIssueMetaLeading({
  issue,
  isLive,
  showStatus = true,
  showIdentifier = true,
  statusSlot,
  checklistStepNumber = null,
}: {
  issue: Issue;
  isLive: boolean;
  showStatus?: boolean;
  showIdentifier?: boolean;
  statusSlot?: ReactNode;
  checklistStepNumber?: number | string | null;
}) {
  return (
    <>
      {showStatus ? (
        <span className="hidden shrink-0 sm:inline-flex">
          {statusSlot ?? <StatusIcon status={issue.status} blockerAttention={issue.blockerAttention} />}
        </span>
      ) : null}
      {checklistStepNumber !== null ? (
        <span className="shrink-0 font-mono text-xs text-muted-foreground" aria-hidden="true">
          {checklistStepNumber}.
        </span>
      ) : null}
      {showIdentifier ? (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {issue.identifier ?? issue.id.slice(0, 8)}
        </span>
      ) : null}
      {isLive && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 sm:gap-1.5 sm:px-2",
            "bg-blue-500/10",
          )}
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-pulse rounded-full bg-blue-400 opacity-75" />
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                "bg-blue-500",
              )}
            />
          </span>
          <span
            className={cn(
              "hidden text-[11px] font-medium sm:inline",
              "text-blue-600 dark:text-blue-400",
            )}
          >
            Live
          </span>
        </span>
      )}
    </>
  );
}
