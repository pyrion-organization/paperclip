import type { ReactNode } from "react";
import type { Issue } from "@paperclipai/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { pickTextColorForPillBg } from "@/lib/color-contrast";
import { formatAssigneeUserLabel } from "../lib/assignees";
import type { InboxIssueColumn } from "../lib/inbox";
import { timeAgo } from "../lib/timeAgo";
import { Identity } from "./Identity";
import { issueTrailingGridTemplate } from "./issue-columns-layout";

export function InboxIssueTrailingColumns({
  issue,
  columns,
  projectName,
  projectColor,
  workspaceId,
  workspaceName,
  assigneeName,
  assigneeUserName,
  assigneeUserAvatarUrl,
  currentUserId,
  parentIdentifier,
  parentTitle,
  assigneeContent,
  onFilterWorkspace,
}: {
  issue: Issue;
  columns: InboxIssueColumn[];
  projectName: string | null;
  projectColor: string | null;
  workspaceId?: string | null;
  workspaceName: string | null;
  assigneeName: string | null;
  assigneeUserName?: string | null;
  assigneeUserAvatarUrl?: string | null;
  currentUserId: string | null;
  parentIdentifier: string | null;
  parentTitle: string | null;
  assigneeContent?: ReactNode;
  onFilterWorkspace?: (workspaceId: string) => void;
}) {
  const activityText = timeAgo(issue.lastActivityAt ?? issue.lastExternalCommentAt ?? issue.updatedAt);
  const userLabel = assigneeUserName ?? formatAssigneeUserLabel(issue.assigneeUserId, currentUserId) ?? "User";

  return (
    <span
      className="grid items-center gap-2"
      style={{ gridTemplateColumns: issueTrailingGridTemplate(columns) }}
    >
      {columns.map((column) => {
        if (column === "assignee") {
          if (assigneeContent) {
            return <span key={column} className="min-w-0">{assigneeContent}</span>;
          }

          if (issue.assigneeAgentId) {
            return (
              <span key={column} className="min-w-0 text-xs text-foreground">
                <Identity
                  name={assigneeName ?? issue.assigneeAgentId.slice(0, 8)}
                  size="sm"
                  className="min-w-0"
                />
              </span>
            );
          }

          if (issue.assigneeUserId) {
            return (
              <span key={column} className="min-w-0 text-xs text-foreground">
                <Identity
                  name={userLabel}
                  avatarUrl={assigneeUserAvatarUrl}
                  size="sm"
                  className="min-w-0"
                />
              </span>
            );
          }

          return (
            <span key={column} className="min-w-0 truncate text-xs text-muted-foreground">
              Unassigned
            </span>
          );
        }

        if (column === "project") {
          if (projectName) {
            const accentColor = projectColor ?? "#64748b";
            return (
              <span
                key={column}
                className="inline-flex min-w-0 items-center gap-2 text-xs font-medium"
                style={{ color: pickTextColorForPillBg(accentColor, 0.12) }}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="truncate">{projectName}</span>
              </span>
            );
          }

          return (
            <span key={column} className="min-w-0 truncate text-xs text-muted-foreground">
              No project
            </span>
          );
        }

        if (column === "labels") {
          if ((issue.labels ?? []).length > 0) {
            return (
              <span key={column} className="flex min-w-0 items-center gap-1 overflow-hidden">
                {(issue.labels ?? []).slice(0, 2).map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex min-w-0 max-w-full shrink-0 items-center rounded-full border px-1.5 py-0 text-[10px] font-medium"
                    style={{
                      borderColor: label.color,
                      color: pickTextColorForPillBg(label.color, 0.12),
                      backgroundColor: `${label.color}1f`,
                    }}
                  >
                    <span className="truncate">{label.name}</span>
                  </span>
                ))}
                {(issue.labels ?? []).length > 2 ? (
                  <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                    +{(issue.labels ?? []).length - 2}
                  </span>
                ) : null}
              </span>
            );
          }

          return <span key={column} className="min-w-0" aria-hidden="true" />;
        }

        if (column === "workspace") {
          if (!workspaceName) {
            return <span key={column} className="min-w-0" aria-hidden="true" />;
          }

          return (
            <span key={column} className="min-w-0 truncate text-xs text-muted-foreground">
              {workspaceId && onFilterWorkspace ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="truncate rounded-sm text-left text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onFilterWorkspace(workspaceId);
                      }}
                    >
                      {workspaceName}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    Filter by workspace
                  </TooltipContent>
                </Tooltip>
              ) : (
                workspaceName
              )}
            </span>
          );
        }

        if (column === "parent") {
          if (!issue.parentId) {
            return <span key={column} className="min-w-0" aria-hidden="true" />;
          }

          return (
            <span key={column} className="min-w-0 truncate text-xs text-muted-foreground" title={parentTitle ?? undefined}>
              {parentIdentifier ? (
                <span className="font-mono">{parentIdentifier}</span>
              ) : (
                <span className="italic">Sub-issue</span>
              )}
            </span>
          );
        }

        if (column === "updated") {
          return (
            <span key={column} className="min-w-0 truncate text-right text-[11px] font-medium text-muted-foreground">
              {activityText}
            </span>
          );
        }

        return null;
      })}
    </span>
  );
}
