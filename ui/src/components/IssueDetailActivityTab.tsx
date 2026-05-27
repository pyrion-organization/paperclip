import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActivityEvent, Agent, Issue } from "@paperclipai/shared";
import { ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY } from "@paperclipai/shared/constants";

import { ApiError } from "../api/client";
import { activityApi, type RunForIssue } from "../api/activity";
import { issuesApi } from "../api/issues";
import type { CompanyUserProfile } from "../lib/company-members";
import { keepPreviousDataForSameQueryTail } from "../lib/query-placeholder-data";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatDurationMs, formatTokens, visibleRunCostUsd } from "../lib/utils";
import { Skeleton } from "./ui/skeleton";
import { ApprovalCard } from "./ApprovalCard";
import { IssueActivityEventCard } from "./IssueActivityEventCard";
import { IssueContinuationHandoff } from "./IssueContinuationHandoff";
import { IssueMonitorActivityCard } from "./IssueMonitorActivityCard";
import { IssueRunLedger } from "./IssueRunLedger";
import { IssueScheduledRetryCard } from "./IssueScheduledRetryCard";

type IssueDetailActivityTabProps = {
  issue: Issue;
  issueId: string;
  companyId: string;
  issueStatus: Issue["status"];
  childIssues: Issue[];
  agentMap: Map<string, Agent>;
  hasLiveRuns: boolean;
  currentUserId: string | null;
  userProfileMap: Map<string, CompanyUserProfile>;
  pendingApprovalAction: { approvalId: string; action: "approve" | "reject" } | null;
  onApprovalAction: (approvalId: string, action: "approve" | "reject") => void;
  onCheckMonitorNow: () => void;
  checkingMonitorNow: boolean;
  handoffFocusSignal?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function usageNumber(usage: Record<string, unknown> | null, ...keys: string[]) {
  if (!usage) return 0;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function ActivitySectionSkeleton({
  titleWidth = "w-20",
  rows = 4,
}: {
  titleWidth?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <Skeleton className={cn("h-4", titleWidth)} />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

export function IssueDetailActivityTab({
  issue,
  issueId,
  companyId,
  issueStatus,
  childIssues,
  agentMap,
  hasLiveRuns,
  currentUserId,
  userProfileMap,
  pendingApprovalAction,
  onApprovalAction,
  onCheckMonitorNow,
  checkingMonitorNow,
  handoffFocusSignal = 0,
}: IssueDetailActivityTabProps) {
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: queryKeys.issues.activity(issueId),
    queryFn: () => activityApi.forIssue(issueId),
    placeholderData: keepPreviousDataForSameQueryTail<ActivityEvent[]>(issueId),
  });
  const { data: linkedRuns, isLoading: linkedRunsLoading } = useQuery({
    queryKey: queryKeys.issues.runs(issueId),
    queryFn: () => activityApi.runsForIssue(issueId),
    placeholderData: keepPreviousDataForSameQueryTail<RunForIssue[]>(issueId),
  });
  const { data: linkedApprovals } = useQuery({
    queryKey: queryKeys.issues.approvals(issueId),
    queryFn: () => issuesApi.listApprovals(issueId),
    placeholderData: keepPreviousDataForSameQueryTail<Awaited<ReturnType<typeof issuesApi.listApprovals>>>(issueId),
  });
  const { data: continuationHandoff } = useQuery({
    queryKey: queryKeys.issues.document(issueId, ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY),
    queryFn: async () => {
      try {
        return await issuesApi.getDocument(issueId, ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    retry: false,
    placeholderData: keepPreviousDataForSameQueryTail<Awaited<ReturnType<typeof issuesApi.getDocument>> | null>(
      issueId,
    ),
  });
  const { data: issueTreeCostSummary } = useQuery({
    queryKey: queryKeys.issues.costSummary(issueId),
    queryFn: () => issuesApi.getCostSummary(issueId),
    placeholderData: keepPreviousDataForSameQueryTail<Awaited<ReturnType<typeof issuesApi.getCostSummary>>>(issueId),
  });
  const initialLoading =
    (activityLoading && activity === undefined)
    || (linkedRunsLoading && linkedRuns === undefined);
  const issueCostSummary = useMemo(() => {
    let input = 0;
    let output = 0;
    let cached = 0;
    let cost = 0;
    let runtimeMs = 0;
    let runCount = 0;
    let hasCost = false;
    let hasTokens = false;
    const nowMs = Date.now();

    for (const run of linkedRuns ?? []) {
      const usage = asRecord(run.usageJson);
      const result = asRecord(run.resultJson);
      const runInput = usageNumber(usage, "inputTokens", "input_tokens");
      const runOutput = usageNumber(usage, "outputTokens", "output_tokens");
      const runCached = usageNumber(
        usage,
        "cachedInputTokens",
        "cached_input_tokens",
        "cache_read_input_tokens",
      );
      const runCost = visibleRunCostUsd(usage, result);
      if (runCost > 0) hasCost = true;
      if (runInput + runOutput + runCached > 0) hasTokens = true;
      input += runInput;
      output += runOutput;
      cached += runCached;
      cost += runCost;

      if (run.startedAt) {
        const startMs = new Date(run.startedAt).getTime();
        const endMs = run.finishedAt ? new Date(run.finishedAt).getTime() : nowMs;
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
          runtimeMs += endMs - startMs;
          runCount += 1;
        }
      }
    }

    return {
      input,
      output,
      cached,
      cost,
      totalTokens: input + output,
      hasCost,
      hasTokens,
      runtimeMs,
      runCount,
      hasRuntime: runtimeMs > 0,
    };
  }, [linkedRuns]);
  const issueTreeCostTokens =
    (issueTreeCostSummary?.inputTokens ?? 0) + (issueTreeCostSummary?.outputTokens ?? 0);
  const hasIssueTreeCost =
    !!issueTreeCostSummary
    && (issueTreeCostSummary.costCents > 0
      || issueTreeCostTokens > 0
      || issueTreeCostSummary.cachedInputTokens > 0
      || issueTreeCostSummary.runtimeMs > 0
      || issueTreeCostSummary.issueCount > 1);
  const shouldShowCostSummary =
    (linkedRuns && linkedRuns.length > 0) || hasIssueTreeCost;

  if (initialLoading) {
    return <ActivitySectionSkeleton titleWidth="w-20" rows={4} />;
  }

  return (
    <>
      {shouldShowCostSummary && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-border">
          <div className="text-sm font-medium text-muted-foreground mb-1">Cost Summary</div>
          {!issueCostSummary.hasCost && !issueCostSummary.hasTokens && !hasIssueTreeCost ? (
            <div className="text-xs text-muted-foreground">No cost data yet.</div>
          ) : (
            <div className="space-y-1 text-xs text-muted-foreground tabular-nums">
              <div className="flex flex-wrap gap-3">
                <span className="font-medium text-foreground">This issue</span>
                {issueCostSummary.hasCost ? (
                  <span className="font-medium text-foreground">
                    ${issueCostSummary.cost.toFixed(4)}
                  </span>
                ) : null}
                {issueCostSummary.hasTokens ? (
                  <span>
                    Tokens {formatTokens(issueCostSummary.totalTokens)}
                    {issueCostSummary.cached > 0
                      ? ` (in ${formatTokens(issueCostSummary.input)}, out ${formatTokens(issueCostSummary.output)}, cached ${formatTokens(issueCostSummary.cached)})`
                      : ` (in ${formatTokens(issueCostSummary.input)}, out ${formatTokens(issueCostSummary.output)})`}
                  </span>
                ) : null}
                {issueCostSummary.hasRuntime ? (
                  <span>
                    Runtime {formatDurationMs(issueCostSummary.runtimeMs)}
                    {` (${issueCostSummary.runCount} run${issueCostSummary.runCount === 1 ? "" : "s"})`}
                  </span>
                ) : null}
                {!issueCostSummary.hasCost && !issueCostSummary.hasTokens && !issueCostSummary.hasRuntime ? (
                  <span>No direct cost data.</span>
                ) : null}
              </div>
              {hasIssueTreeCost && issueTreeCostSummary ? (
                <div className="flex flex-wrap gap-3">
                  <span className="font-medium text-foreground">
                    Including sub-issues {(issueTreeCostSummary.costCents / 100).toLocaleString(undefined, {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    })}
                  </span>
                  <span>
                    Tokens {formatTokens(issueTreeCostTokens)}
                    {issueTreeCostSummary.cachedInputTokens > 0
                      ? ` (in ${formatTokens(issueTreeCostSummary.inputTokens)}, out ${formatTokens(issueTreeCostSummary.outputTokens)}, cached ${formatTokens(issueTreeCostSummary.cachedInputTokens)})`
                      : ` (in ${formatTokens(issueTreeCostSummary.inputTokens)}, out ${formatTokens(issueTreeCostSummary.outputTokens)})`}
                  </span>
                  {issueTreeCostSummary.runCount > 0 ? (
                    <span>
                      Runtime {formatDurationMs(issueTreeCostSummary.runtimeMs)}
                      {` (${issueTreeCostSummary.runCount} run${issueTreeCostSummary.runCount === 1 ? "" : "s"})`}
                    </span>
                  ) : null}
                  <span>{issueTreeCostSummary.issueCount} issue{issueTreeCostSummary.issueCount === 1 ? "" : "s"}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
      <div className="mb-3">
        <IssueRunLedger
          issueId={issueId}
          companyId={companyId}
          issueStatus={issueStatus}
          childIssues={childIssues}
          agentMap={agentMap}
          hasLiveRuns={hasLiveRuns}
          activityEvents={activity ?? []}
          renderActivityEvent={(evt) => (
            <IssueActivityEventCard
              event={evt}
              agentMap={agentMap}
              userProfileMap={userProfileMap}
              currentUserId={currentUserId}
            />
          )}
        />
      </div>
      {linkedApprovals && linkedApprovals.length > 0 && (
        <div className="mb-3 space-y-3">
          {linkedApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              requesterAgent={approval.requestedByAgentId ? agentMap.get(approval.requestedByAgentId) ?? null : null}
              onApprove={() => onApprovalAction(approval.id, "approve")}
              onReject={() => onApprovalAction(approval.id, "reject")}
              detailLink={`/approvals/${approval.id}`}
              isPending={pendingApprovalAction?.approvalId === approval.id}
              pendingAction={
                pendingApprovalAction?.approvalId === approval.id
                  ? pendingApprovalAction.action
                  : null
              }
            />
          ))}
        </div>
      )}
      <IssueContinuationHandoff document={continuationHandoff} focusSignal={handoffFocusSignal} />
      <IssueScheduledRetryCard issueId={issue.id} scheduledRetry={issue.scheduledRetry ?? null} />
      <IssueMonitorActivityCard
        issue={issue}
        onCheckNow={onCheckMonitorNow}
        checkingNow={checkingMonitorNow}
      />
    </>
  );
}
