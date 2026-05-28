import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight } from "lucide-react";
import { describeSchedule } from "./schedule-editor-utils";

type SchedulePreset = "every_minute" | "every_hour" | "every_day" | "weekdays" | "weekly" | "monthly" | "custom";

const PRESETS: { value: SchedulePreset; label: string }[] = [
  { value: "every_minute", label: "Every minute" },
  { value: "every_hour", label: "Every hour" },
  { value: "every_day", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom (cron)" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`,
}));

const MINUTES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i * 5),
  label: String(i * 5).padStart(2, "0"),
}));

const DAYS_OF_WEEK = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
];

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

type ScheduleEditorState = {
  preset: SchedulePreset;
  hour: string;
  minute: string;
  dayOfWeek: string;
  dayOfMonth: string;
  customCron: string;
};

function parseCronToPreset(cron: string): {
  preset: SchedulePreset;
  hour: string;
  minute: string;
  dayOfWeek: string;
  dayOfMonth: string;
} {
  const defaults = { hour: "10", minute: "0", dayOfWeek: "1", dayOfMonth: "1" };

  if (!cron || !cron.trim()) {
    return { preset: "every_day", ...defaults };
  }

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { preset: "custom", ...defaults };
  }

  const [min, hr, dom, , dow] = parts;

  // Every minute: "* * * * *"
  if (min === "*" && hr === "*" && dom === "*" && dow === "*") {
    return { preset: "every_minute", ...defaults };
  }

  // Every hour: "0 * * * *"
  if (hr === "*" && dom === "*" && dow === "*") {
    return { preset: "every_hour", ...defaults, minute: min === "*" ? "0" : min };
  }

  // Every day: "M H * * *"
  if (dom === "*" && dow === "*" && hr !== "*") {
    return { preset: "every_day", ...defaults, hour: hr, minute: min === "*" ? "0" : min };
  }

  // Weekdays: "M H * * 1-5"
  if (dom === "*" && dow === "1-5" && hr !== "*") {
    return { preset: "weekdays", ...defaults, hour: hr, minute: min === "*" ? "0" : min };
  }

  // Weekly: "M H * * D" (single day)
  if (dom === "*" && /^\d$/.test(dow) && hr !== "*") {
    return { preset: "weekly", ...defaults, hour: hr, minute: min === "*" ? "0" : min, dayOfWeek: dow };
  }

  // Monthly: "M H D * *"
  if (/^\d{1,2}$/.test(dom) && dow === "*" && hr !== "*") {
    return { preset: "monthly", ...defaults, hour: hr, minute: min === "*" ? "0" : min, dayOfMonth: dom };
  }

  return { preset: "custom", ...defaults };
}

function scheduleStateFromValue(value: string): ScheduleEditorState {
  const parsed = parseCronToPreset(value);
  return {
    ...parsed,
    customCron: parsed.preset === "custom" ? value : "",
  };
}

function buildCron(preset: SchedulePreset, hour: string, minute: string, dayOfWeek: string, dayOfMonth: string): string {
  switch (preset) {
    case "every_minute":
      return "* * * * *";
    case "every_hour":
      return `${minute} * * * *`;
    case "every_day":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly":
      return `${minute} ${hour} * * ${dayOfWeek}`;
    case "monthly":
      return `${minute} ${hour} ${dayOfMonth} * *`;
    case "custom":
      return "";
  }
}

export function ScheduleEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (cron: string) => void;
}) {
  const parsedState = useMemo(() => scheduleStateFromValue(value), [value]);
  const [draft, setDraft] = useState<{
    sourceValue: string;
    state: ScheduleEditorState;
  } | null>(null);
  const state = draft?.sourceValue === value ? draft.state : parsedState;
  const { preset, hour, minute, dayOfWeek, dayOfMonth, customCron } = state;
  const updateState = useCallback((updater: (current: ScheduleEditorState) => ScheduleEditorState) => {
    setDraft((currentDraft) => {
      const current = currentDraft?.sourceValue === value ? currentDraft.state : scheduleStateFromValue(value);
      return {
        sourceValue: value,
        state: updater(current),
      };
    });
  }, [value]);

  const emitChange = useCallback(
    (p: SchedulePreset, h: string, m: string, dow: string, dom: string, custom: string) => {
      if (p === "custom") {
        onChange(custom);
      } else {
        onChange(buildCron(p, h, m, dow, dom));
      }
    },
    [onChange],
  );

  const handlePresetChange = (newPreset: SchedulePreset) => {
    updateState((current) => ({
      ...current,
      preset: newPreset,
      customCron: newPreset === "custom" ? value : current.customCron,
    }));
    if (newPreset === "custom") {
      onChange(value);
    } else {
      emitChange(newPreset, hour, minute, dayOfWeek, dayOfMonth, customCron);
    }
  };

  return (
    <div className="space-y-3">
      <Select value={preset} onValueChange={(v) => handlePresetChange(v as SchedulePreset)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose frequency..." />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" ? (
        <div className="space-y-1.5">
          <Input
            value={customCron}
            onChange={(e) => {
              updateState((current) => ({ ...current, customCron: e.target.value }));
              emitChange("custom", hour, minute, dayOfWeek, dayOfMonth, e.target.value);
            }}
            placeholder="0 10 * * *"
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Five fields: minute hour day-of-month month day-of-week
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {preset !== "every_minute" && preset !== "every_hour" && (
            <>
              <span className="text-sm text-muted-foreground">at</span>
              <Select
                value={hour}
                onValueChange={(h) => {
                  updateState((current) => ({ ...current, hour: h }));
                  emitChange(preset, h, minute, dayOfWeek, dayOfMonth, customCron);
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h.value} value={h.value}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">:</span>
              <Select
                value={minute}
                onValueChange={(m) => {
                  updateState((current) => ({ ...current, minute: m }));
                  emitChange(preset, hour, m, dayOfWeek, dayOfMonth, customCron);
                }}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {preset === "every_hour" && (
            <>
              <span className="text-sm text-muted-foreground">at minute</span>
              <Select
                value={minute}
                onValueChange={(m) => {
                  updateState((current) => ({ ...current, minute: m }));
                  emitChange(preset, hour, m, dayOfWeek, dayOfMonth, customCron);
                }}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      :{m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {preset === "weekly" && (
            <>
              <span className="text-sm text-muted-foreground">on</span>
              <div className="flex gap-1">
                {DAYS_OF_WEEK.map((d) => (
                  <Button
                    key={d.value}
                    type="button"
                    variant={dayOfWeek === d.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      updateState((current) => ({ ...current, dayOfWeek: d.value }));
                      emitChange(preset, hour, minute, d.value, dayOfMonth, customCron);
                    }}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </>
          )}

          {preset === "monthly" && (
            <>
              <span className="text-sm text-muted-foreground">on day</span>
              <Select
                value={dayOfMonth}
                onValueChange={(dom) => {
                  updateState((current) => ({ ...current, dayOfMonth: dom }));
                  emitChange(preset, hour, minute, dayOfWeek, dom, customCron);
                }}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_MONTH.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      )}
    </div>
  );
}
