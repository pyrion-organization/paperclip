import type {
  CloudUpstreamActivationDecision,
  CloudUpstreamActivationEntityType,
  CloudUpstreamRun,
} from "@paperclipai/shared";

const ACTIVATION_CATEGORIES: Array<{
  key: CloudUpstreamActivationEntityType;
  label: string;
  singular: string;
  detail: string;
}> = [
  {
    key: "agents",
    label: "Agents",
    singular: "agent",
    detail: "Confirm cloud secrets and adapter credentials before unpausing imported agents.",
  },
  {
    key: "routines",
    label: "Routines",
    singular: "routine",
    detail: "Review schedules and trigger settings before enabling imported routines.",
  },
  {
    key: "monitors",
    label: "Monitors",
    singular: "monitor",
    detail: "Activate after the target stack has been smoke tested.",
  },
];

function summaryCount(summary: CloudUpstreamRun["summary"], key: CloudUpstreamActivationEntityType): number {
  return summary.find((item) => item.key === key)?.count ?? 0;
}

function activationChecklistFromReport(report: CloudUpstreamRun["report"]): Partial<Record<CloudUpstreamActivationEntityType, CloudUpstreamActivationDecision>> {
  const value = optionalRecord(report.activationChecklist);
  const decisions: Partial<Record<CloudUpstreamActivationEntityType, CloudUpstreamActivationDecision>> = {};
  for (const key of ["agents", "routines", "monitors"] as const) {
    const item = optionalRecord(value[key]);
    if (!item) continue;
    decisions[key] = {
      entityType: key,
      count: typeof item.count === "number" ? item.count : 0,
      status: item.status === "activated" ? "activated" : "paused",
      activatedAt: typeof item.activatedAt === "string" ? item.activatedAt : null,
    };
  }
  return decisions;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function buildActivationRows(run: CloudUpstreamRun) {
  const activationChecklist = activationChecklistFromReport(run.report);
  return ACTIVATION_CATEGORIES.map((category) => {
    const decision = activationChecklist[category.key];
    const count = summaryCount(run.summary, category.key);
    const status = decision?.status === "activated" ? "activated" : "paused";
    const pluralLabel = `${category.singular}${count === 1 ? "" : "s"}`;
    return {
      ...category,
      count,
      pluralLabel,
      status,
      detail: `${count} imported ${pluralLabel} are paused by default. ${category.detail}`,
      statusLabel: status === "activated"
        ? `${count} activated`
        : count === 0
          ? "0 imported"
          : `${count} paused`,
    };
  });
}
