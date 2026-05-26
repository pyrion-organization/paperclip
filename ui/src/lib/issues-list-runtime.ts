import type { Issue } from "@paperclipai/shared";

export const pausedIssueBadgeClassName =
  "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300";

export interface IssueTree {
  roots: Issue[];
  childMap: Map<string, Issue[]>;
}

export function buildIssueTree(items: Issue[]): IssueTree {
  const itemIds = new Set(items.map((i) => i.id));
  const roots = items.filter((i) => !i.parentId || !itemIds.has(i.parentId));
  const childMap = new Map<string, Issue[]>();
  for (const item of items) {
    if (item.parentId && itemIds.has(item.parentId)) {
      const arr = childMap.get(item.parentId) ?? [];
      arr.push(item);
      childMap.set(item.parentId, arr);
    }
  }
  return { roots, childMap };
}

export function countDescendants(id: string, childMap: Map<string, Issue[]>): number {
  const children = childMap.get(id) ?? [];
  return children.reduce((sum, child) => sum + 1 + countDescendants(child.id, childMap), 0);
}

export type WorkflowSortBlocker = { id: string };

export type WorkflowSortIssue = {
  id: string;
  createdAt: Date | string;
  blockedBy?: WorkflowSortBlocker[] | null;
};

export function workflowSort<T extends WorkflowSortIssue>(issues: T[]): T[] {
  if (issues.length <= 1) return [...issues];

  const tieBreakAsc = (a: T, b: T): number => {
    const ta = toTimestamp(a.createdAt);
    const tb = toTimestamp(b.createdAt);
    if (ta !== tb) return ta - tb;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  };

  const byId = new Map<string, T>();
  for (const issue of issues) byId.set(issue.id, issue);

  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const issue of issues) {
    successors.set(issue.id, []);
    inDegree.set(issue.id, 0);
  }
  for (const issue of issues) {
    const seenBlockers = new Set<string>();
    for (const blocker of issue.blockedBy ?? []) {
      if (!blocker || !byId.has(blocker.id)) continue;
      if (blocker.id === issue.id) continue;
      if (seenBlockers.has(blocker.id)) continue;
      seenBlockers.add(blocker.id);
      successors.get(blocker.id)!.push(issue.id);
      inDegree.set(issue.id, (inDegree.get(issue.id) ?? 0) + 1);
    }
  }

  for (const ids of successors.values()) {
    ids.sort((a, b) => tieBreakAsc(byId.get(a)!, byId.get(b)!));
  }

  const ready: T[] = [];
  for (const issue of issues) {
    if (inDegree.get(issue.id) === 0) ready.push(issue);
  }
  ready.sort(tieBreakAsc);

  const emitted = new Set<string>();
  const output: T[] = [];

  const insertReady = (issue: T): void => {
    let lo = 0;
    let hi = ready.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (tieBreakAsc(ready[mid], issue) <= 0) lo = mid + 1;
      else hi = mid;
    }
    ready.splice(lo, 0, issue);
  };

  const releaseSuccessors = (id: string): void => {
    for (const succId of successors.get(id) ?? []) {
      if (emitted.has(succId)) continue;
      const remaining = (inDegree.get(succId) ?? 0) - 1;
      inDegree.set(succId, remaining);
      if (remaining === 0) {
        const succ = byId.get(succId);
        if (succ) insertReady(succ);
      }
    }
  };

  while (ready.length > 0) {
    let current = ready.shift()!;
    while (current && !emitted.has(current.id)) {
      output.push(current);
      emitted.add(current.id);
      releaseSuccessors(current.id);

      const succIds = successors.get(current.id) ?? [];
      if (succIds.length !== 1) break;
      const nextId = succIds[0];
      if (emitted.has(nextId)) break;
      if ((inDegree.get(nextId) ?? 0) !== 0) break;
      const nextIndex = ready.findIndex((issue) => issue.id === nextId);
      if (nextIndex < 0) break;
      [current] = ready.splice(nextIndex, 1);
    }
  }

  if (emitted.size < issues.length) {
    return [...issues].sort(tieBreakAsc);
  }

  return output;
}

type SubIssueDefaultSource = Pick<
  Issue,
  | "id"
  | "identifier"
  | "title"
  | "projectId"
  | "projectWorkspaceId"
  | "goalId"
  | "executionWorkspaceId"
  | "executionWorkspacePreference"
  | "currentExecutionWorkspace"
  | "assigneeAgentId"
  | "assigneeUserId"
>;

export function buildSubIssueDefaultsForViewer(
  issue: SubIssueDefaultSource,
  currentUserId?: string | null,
) {
  const parentExecutionWorkspaceLabel =
    issue.currentExecutionWorkspace?.name
    ?? issue.currentExecutionWorkspace?.branchName
    ?? issue.currentExecutionWorkspace?.cwd
    ?? issue.executionWorkspaceId
    ?? null;
  const shouldInheritUserAssignee = Boolean(issue.assigneeUserId && issue.assigneeUserId !== currentUserId);
  const inheritedAssigneeUserId = shouldInheritUserAssignee ? issue.assigneeUserId ?? undefined : undefined;

  return {
    parentId: issue.id,
    parentIdentifier: issue.identifier ?? undefined,
    parentTitle: issue.title,
    ...(issue.projectId ? { projectId: issue.projectId } : {}),
    ...(issue.projectWorkspaceId ? { projectWorkspaceId: issue.projectWorkspaceId } : {}),
    ...(issue.goalId ? { goalId: issue.goalId } : {}),
    ...(issue.executionWorkspaceId ? { executionWorkspaceId: issue.executionWorkspaceId } : {}),
    ...(issue.executionWorkspaceId
      ? { executionWorkspaceMode: "reuse_existing" }
      : issue.executionWorkspacePreference
        ? { executionWorkspaceMode: issue.executionWorkspacePreference }
        : {}),
    ...(parentExecutionWorkspaceLabel ? { parentExecutionWorkspaceLabel } : {}),
    ...(issue.assigneeAgentId ? { assigneeAgentId: issue.assigneeAgentId } : {}),
    ...(inheritedAssigneeUserId ? { assigneeUserId: inheritedAssigneeUserId } : {}),
  };
}

export function isSuccessfulRunHandoffRequired(issue: Pick<Issue, "successfulRunHandoff">) {
  return issue.successfulRunHandoff?.required === true;
}

function toTimestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const ts = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}
