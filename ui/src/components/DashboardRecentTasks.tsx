import type { DashboardRecentIssue } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { Identity } from "./Identity";
import { StatusIcon } from "./StatusIcon";
import { timeAgo } from "../lib/timeAgo";

export function DashboardRecentTasks({ recentIssues }: { recentIssues: DashboardRecentIssue[] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Recent Tasks
      </h3>
      {recentIssues.length === 0 ? (
        <div className="border border-border p-4">
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden border border-border">
          {recentIssues.slice(0, 10).map((issue) => (
            <Link
              key={issue.id}
              to={`/issues/${issue.identifier ?? issue.id}`}
              className="block cursor-pointer px-4 py-3 text-sm text-inherit no-underline transition-colors hover:bg-accent/50"
            >
              <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                <span className="shrink-0 sm:hidden">
                  <StatusIcon status={issue.status} />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
                  <span className="line-clamp-2 text-sm sm:order-2 sm:min-w-0 sm:flex-1 sm:truncate sm:line-clamp-none">
                    {issue.title}
                  </span>
                  <span className="flex items-center gap-2 sm:order-1 sm:shrink-0">
                    <span className="hidden sm:inline-flex">
                      <StatusIcon status={issue.status} />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {issue.identifier ?? issue.id.slice(0, 8)}
                    </span>
                    {issue.assigneeAgentId && issue.assigneeAgentName ? (
                      <span className="hidden sm:inline-flex">
                        <Identity name={issue.assigneeAgentName} size="sm" />
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground sm:hidden">&middot;</span>
                    <span className="shrink-0 text-xs text-muted-foreground sm:order-last">
                      {timeAgo(issue.updatedAt)}
                    </span>
                  </span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
