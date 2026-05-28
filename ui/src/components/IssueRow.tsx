import type { ReactNode } from "react";
import type { Issue } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { X } from "lucide-react";
import {
  createIssueDetailPath,
  rememberIssueDetailLocationState,
  withIssueDetailHeaderSeed,
} from "../lib/issueDetailBreadcrumb";
import { cn } from "../lib/classnames";
import { StatusIcon } from "./StatusIcon";
import { IssueRowIndicators } from "./IssueRowIndicators";

type UnreadState = "hidden" | "visible" | "fading";

interface IssueRowProps {
  issue: Issue;
  issueLinkState?: unknown;
  selected?: boolean;
  mobileLeading?: ReactNode;
  mobileLeadingSlot?: () => ReactNode;
  desktopMetaLeading?: ReactNode;
  desktopMetaLeadingSlot?: () => ReactNode;
  desktopLeadingSpacer?: boolean;
  mobileMeta?: ReactNode;
  desktopTrailing?: ReactNode;
  desktopTrailingSlot?: () => ReactNode;
  trailingMeta?: ReactNode;
  titleSuffix?: ReactNode;
  titleSuffixSlot?: () => ReactNode;
  titleClassName?: string;
  checklistStepNumber?: number | string | null;
  checklistCurrentStep?: boolean;
  checklistDependencyChips?: ReactNode;
  checklistDependencyChipsSlot?: () => ReactNode;
  checklistRowId?: string;
  unreadState?: UnreadState | null;
  onMarkRead?: () => void;
  onArchive?: () => void;
  archiveDisabled?: boolean;
  className?: string;
}

export function IssueRow({
  issue,
  issueLinkState,
  selected = false,
  mobileLeading,
  mobileLeadingSlot,
  desktopMetaLeading,
  desktopMetaLeadingSlot,
  desktopLeadingSpacer = false,
  mobileMeta,
  desktopTrailing,
  desktopTrailingSlot,
  trailingMeta,
  titleSuffix,
  titleSuffixSlot,
  titleClassName,
  checklistStepNumber = null,
  checklistCurrentStep = false,
  checklistDependencyChips,
  checklistDependencyChipsSlot,
  checklistRowId,
  unreadState = null,
  onMarkRead,
  onArchive,
  archiveDisabled,
  className,
}: IssueRowProps) {
  const issuePathId = issue.identifier ?? issue.id;
  const identifier = issue.identifier ?? issue.id.slice(0, 8);
  const showUnreadSlot = unreadState !== null;
  const showUnreadDot = unreadState === "visible" || unreadState === "fading";
  const selectedStatusClass = selected ? "!text-muted-foreground !border-muted-foreground" : undefined;
  const detailState = withIssueDetailHeaderSeed(issueLinkState, issue);
  const shouldRenderSecondaryIndicators = Boolean(
    issue.productivityReview
      || issue.activeRecoveryAction
      || (issue.blockedBy?.length ?? 0) > 0,
  );
  const secondaryIndicators = shouldRenderSecondaryIndicators ? (
    <IssueRowIndicators issue={issue} selected={selected} />
  ) : null;
  const hasChecklistStep = checklistStepNumber !== null;
  const checklistStep = hasChecklistStep ? (
    <span className="shrink-0 font-mono text-xs text-muted-foreground" aria-hidden="true">
      {checklistStepNumber}.
    </span>
  ) : null;
  const mobileLeadingContent = mobileLeadingSlot ? mobileLeadingSlot() : mobileLeading;
  const desktopMetaLeadingContent = desktopMetaLeadingSlot ? desktopMetaLeadingSlot() : desktopMetaLeading;
  const desktopTrailingContent = desktopTrailingSlot ? desktopTrailingSlot() : desktopTrailing;
  const titleSuffixContent = titleSuffixSlot ? titleSuffixSlot() : titleSuffix;
  const checklistDependencyChipsContent = checklistDependencyChipsSlot
    ? checklistDependencyChipsSlot()
    : checklistDependencyChips;

  return (
    <Link
      to={createIssueDetailPath(issuePathId)}
      state={detailState}
      disableIssueQuicklook
      issuePrefetch={issue}
      data-inbox-issue-link
      id={checklistRowId}
      aria-current={checklistCurrentStep ? "step" : undefined}
      onClickCapture={() => rememberIssueDetailLocationState(issuePathId, detailState)}
      className={cn(
        "group flex items-start gap-2 border-b border-border py-2.5 pl-2 pr-3 text-sm no-underline text-inherit transition-colors last:border-b-0 sm:items-center sm:py-2 sm:pl-1",
        selected ? "hover:bg-transparent" : "hover:bg-accent/50",
        checklistCurrentStep ? "border-l-2 border-l-primary bg-primary/5 pl-[calc(theme(spacing.2)-2px)] sm:pl-[calc(theme(spacing.1)-2px)]" : null,
        className,
      )}
    >
      <span className="flex shrink-0 items-center gap-1 pt-px sm:hidden">
        {mobileLeadingContent ?? <StatusIcon status={issue.status} blockerAttention={issue.blockerAttention} className={selectedStatusClass} />}
        {secondaryIndicators}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
        <span className={cn("line-clamp-2 text-sm sm:order-2 sm:min-w-0 sm:flex-1 sm:truncate sm:line-clamp-none", titleClassName)}>
          {issue.title}{titleSuffixContent}
        </span>
        {checklistDependencyChipsContent ? (
          <span className="flex flex-wrap gap-1 sm:order-3 sm:ml-[calc(theme(spacing.3)+theme(spacing.2))]">
            {checklistDependencyChipsContent}
          </span>
        ) : null}
        <span className="flex items-center gap-2 sm:order-1 sm:shrink-0">
          {desktopLeadingSpacer ? (
            <span className="hidden w-3.5 shrink-0 sm:block" />
          ) : null}
          {desktopMetaLeadingContent ?? (
            <>
              <span className="hidden shrink-0 items-center gap-1 sm:inline-flex">
                <StatusIcon status={issue.status} blockerAttention={issue.blockerAttention} className={selectedStatusClass} />
                {secondaryIndicators}
              </span>
              {checklistStep}
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {identifier}
              </span>
            </>
          )}
          {mobileMeta ? (
            <>
              <span className="text-xs text-muted-foreground sm:hidden" aria-hidden="true">
                &middot;
              </span>
              <span className="text-xs text-muted-foreground sm:hidden">{mobileMeta}</span>
            </>
          ) : null}
        </span>
      </span>
      {(desktopTrailingContent || trailingMeta) ? (
        <span className="ml-auto hidden shrink-0 items-center gap-2 sm:order-3 sm:flex sm:gap-3">
          {desktopTrailingContent}
          {trailingMeta ? (
            <span className="text-xs text-muted-foreground">{trailingMeta}</span>
          ) : null}
        </span>
      ) : null}
      {showUnreadSlot ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center self-center">
          {showUnreadDot ? (
            <button
              type="button"
              data-slot="icon-button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onMarkRead?.();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onMarkRead?.();
                }
              }}
              className={cn(
                "inline-flex size-4 items-center justify-center rounded-full transition-colors",
                selected ? "hover:bg-muted/80" : "hover:bg-blue-500/20",
              )}
              aria-label="Mark as read"
            >
              <span
                className={cn(
                  "block size-2 rounded-full transition-opacity duration-300",
                  selected ? "bg-muted-foreground/70" : "bg-blue-600 dark:bg-blue-400",
                  unreadState === "fading" ? "opacity-0" : "opacity-100",
                )}
              />
            </button>
          ) : onArchive ? (
            <button
              type="button"
              data-slot="icon-button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onArchive();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                onArchive();
              }}
              disabled={archiveDisabled}
              className="inline-flex size-4 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
              aria-label="Dismiss from inbox"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <span className="inline-flex size-4" aria-hidden="true" />
          )}
        </span>
      ) : null}
    </Link>
  );
}
