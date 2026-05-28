import type { RoutineListItem } from "@paperclipai/shared";
import { groupBy } from "../lib/groupBy";

export type RoutineGroupBy = "none" | "project" | "assignee";
export type RoutineSortField = "updated" | "created" | "title" | "lastRun";
export type RoutineSortDir = "asc" | "desc";

export type RoutineGroup = {
  key: string;
  label: string | null;
  items: RoutineListItem[];
};

function timestampValue(value: Date | string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function compareNullableText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" });
}

export function buildRoutineGroups(
  routines: RoutineListItem[],
  groupByValue: RoutineGroupBy,
  projectById: Map<string, { name: string }>,
  agentById: Map<string, { name: string }>,
): RoutineGroup[] {
  if (groupByValue === "none") {
    return [{ key: "__all", label: null, items: routines }];
  }

  if (groupByValue === "project") {
    const groups = groupBy(routines, (routine) => routine.projectId ?? "__no_project");
    return Object.keys(groups)
      .sort((left, right) => {
        const leftLabel = left === "__no_project" ? "No project" : (projectById.get(left)?.name ?? "Unknown project");
        const rightLabel = right === "__no_project" ? "No project" : (projectById.get(right)?.name ?? "Unknown project");
        return leftLabel.localeCompare(rightLabel);
      })
      .map((key) => ({
        key,
        label: key === "__no_project" ? "No project" : (projectById.get(key)?.name ?? "Unknown project"),
        items: groups[key]!,
      }));
  }

  const groups = groupBy(routines, (routine) => routine.assigneeAgentId ?? "__unassigned");
  return Object.keys(groups)
    .sort((left, right) => {
      const leftLabel = left === "__unassigned" ? "Unassigned" : (agentById.get(left)?.name ?? "Unknown agent");
      const rightLabel = right === "__unassigned" ? "Unassigned" : (agentById.get(right)?.name ?? "Unknown agent");
      return leftLabel.localeCompare(rightLabel);
    })
    .map((key) => ({
      key,
      label: key === "__unassigned" ? "Unassigned" : (agentById.get(key)?.name ?? "Unknown agent"),
      items: groups[key]!,
    }));
}

export function sortRoutines(
  routines: RoutineListItem[],
  sortField: RoutineSortField,
  sortDir: RoutineSortDir,
): RoutineListItem[] {
  const direction = sortDir === "asc" ? 1 : -1;
  return routines.toSorted((left, right) => {
    let result = 0;

    if (sortField === "title") {
      result = compareNullableText(left.title, right.title);
    } else if (sortField === "created") {
      result = timestampValue(left.createdAt) - timestampValue(right.createdAt);
    } else if (sortField === "lastRun") {
      result = timestampValue(left.lastRun?.triggeredAt ?? left.lastTriggeredAt) -
        timestampValue(right.lastRun?.triggeredAt ?? right.lastTriggeredAt);
    } else {
      result = timestampValue(left.updatedAt) - timestampValue(right.updatedAt);
    }

    if (result !== 0) return result * direction;
    return compareNullableText(left.title, right.title);
  });
}
