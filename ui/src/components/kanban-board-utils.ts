import type { Issue, IssueStatus } from "@paperclipai/shared";

export const boardStatuses = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
] as const satisfies readonly IssueStatus[];

export function resolveKanbanTargetStatus(overId: string, issues: Issue[]): IssueStatus | null {
  if ((boardStatuses as readonly string[]).includes(overId)) {
    return overId as IssueStatus;
  }
  return issues.find((issue) => issue.id === overId)?.status ?? null;
}
