import type { RoutineTrigger, RoutineTriggerCondition } from "@paperclipai/shared";

export type RoutineTriggerConditionDraft = RoutineTriggerCondition & { id: string };
export type RoutineTriggerEditorDraft = {
  label: string;
  conditions: RoutineTriggerConditionDraft[];
  cronExpression: string;
  signingMode: string;
  replayWindowSec: string;
  minIntervalSec?: string;
  maxIntervalSec?: string;
  allowedWeekdays?: number[];
  minTimeOfDayMin?: string;
  maxTimeOfDayMin?: string;
  minDaysAhead?: string;
  maxDaysAhead?: string;
  timezone?: string;
};

export function parseTimeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function buildRoutineTriggerConditionsPayload(drafts: RoutineTriggerConditionDraft[]): RoutineTriggerCondition[] | null {
  const conditions = drafts.map((draft) => ({
    type: draft.type,
    ...(draft.type === "project_status" ? { statuses: draft.statuses } : {}),
  })) as RoutineTriggerCondition[];
  return conditions.length > 0 ? conditions : null;
}

export function buildRoutineTriggerPatch(
  trigger: RoutineTrigger,
  draft: RoutineTriggerEditorDraft,
  fallbackTimezone: string,
) {
  const patch: Record<string, unknown> = {
    label: draft.label.trim() || null,
    conditions: buildRoutineTriggerConditionsPayload(draft.conditions),
  };

  if (trigger.kind === "schedule") {
    patch.cronExpression = draft.cronExpression.trim();
    patch.timezone = trigger.timezone ?? fallbackTimezone;
  }

  if (trigger.kind === "webhook") {
    patch.signingMode = draft.signingMode;
    patch.replayWindowSec = Number(draft.replayWindowSec || "300");
  }

  if (trigger.kind === "random_interval") {
    patch.minIntervalSec = Number(draft.minIntervalSec || "3600") || 3600;
    patch.maxIntervalSec = Number(draft.maxIntervalSec || "86400") || 86400;
  }

  if (trigger.kind === "random_cron_scheduler") {
    patch.allowedWeekdays = draft.allowedWeekdays ?? [0, 1, 2, 3, 4, 5, 6];
    patch.minTimeOfDayMin = parseTimeToMin(draft.minTimeOfDayMin || "09:00");
    patch.maxTimeOfDayMin = parseTimeToMin(draft.maxTimeOfDayMin || "17:00");
    patch.minDaysAhead = Number(draft.minDaysAhead || "1");
    patch.maxDaysAhead = Number(draft.maxDaysAhead || "7");
    patch.timezone = draft.timezone || fallbackTimezone;
  }

  return patch;
}
