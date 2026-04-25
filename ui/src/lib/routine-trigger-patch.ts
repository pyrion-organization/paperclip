import type { RoutineTrigger } from "@paperclipai/shared";

export type RoutineTriggerEditorDraft = {
  label: string;
  cronExpression: string;
  signingMode: string;
  replayWindowSec: string;
  minIntervalSec?: string;
  maxIntervalSec?: string;
  minDays?: string;
  minHours?: string;
  maxDays?: string;
  maxHours?: string;
  allowedWeekdays?: number[];
  minTimeOfDayMin?: string;
  maxTimeOfDayMin?: string;
  minDaysAhead?: string;
  maxDaysAhead?: string;
  timezone?: string;
};

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;

function toSeconds(days: string, hours: string): number {
  const d = parseInt(days, 10) || 0;
  const h = parseInt(hours, 10) || 0;
  return d * SECONDS_PER_DAY + h * SECONDS_PER_HOUR;
}

export function parseTimeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function buildRoutineTriggerPatch(
  trigger: RoutineTrigger,
  draft: RoutineTriggerEditorDraft,
  fallbackTimezone: string,
) {
  const patch: Record<string, unknown> = {
    label: draft.label.trim() || null,
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
    const hasDaysHours =
      draft.minDays !== undefined ||
      draft.minHours !== undefined ||
      draft.maxDays !== undefined ||
      draft.maxHours !== undefined;
    if (hasDaysHours) {
      patch.minIntervalSec = toSeconds(draft.minDays || "0", draft.minHours || "0") || 3600;
      patch.maxIntervalSec = toSeconds(draft.maxDays || "0", draft.maxHours || "0") || 86400;
    } else {
      patch.minIntervalSec = Number(draft.minIntervalSec || "3600");
      patch.maxIntervalSec = Number(draft.maxIntervalSec || "86400");
    }
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
