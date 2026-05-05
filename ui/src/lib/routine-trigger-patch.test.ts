import { describe, expect, it } from "vitest";
import type { RoutineTrigger } from "@paperclipai/shared";
import { buildRoutineTriggerPatch } from "./routine-trigger-patch";

function makeScheduleTrigger(overrides: Partial<RoutineTrigger> = {}): RoutineTrigger {
  const trigger: RoutineTrigger = {
    id: "trigger-1",
    companyId: "company-1",
    routineId: "routine-1",
    kind: "schedule",
    label: "Daily",
    enabled: true,
    conditions: null,
    cronExpression: "0 10 * * *",
    timezone: "UTC",
    nextRunAt: null,
    lastFiredAt: null,
    publicId: null,
    secretId: null,
    signingMode: null,
    replayWindowSec: null,
    lastRotatedAt: null,
    lastResult: null,
    createdByAgentId: null,
    createdByUserId: null,
    updatedByAgentId: null,
    updatedByUserId: null,
    createdAt: new Date("2026-03-20T00:00:00.000Z"),
    updatedAt: new Date("2026-03-20T00:00:00.000Z"),
    minIntervalSec: null,
    maxIntervalSec: null,
    allowedWeekdays: null,
    minTimeOfDayMin: null,
    maxTimeOfDayMin: null,
    minDaysAhead: null,
    maxDaysAhead: null,
    ...overrides,
  };
  return {
    ...trigger,
    conditions: trigger.conditions ?? null,
  };
}

describe("buildRoutineTriggerPatch", () => {
  it("preserves an existing schedule trigger timezone when saving edits", () => {
    const patch = buildRoutineTriggerPatch(
      makeScheduleTrigger({ timezone: "UTC" }),
      {
        label: "Daily label edit",
        conditions: [],
        cronExpression: "0 10 * * *",
        signingMode: "bearer",
        replayWindowSec: "300",
        minIntervalSec: "3600",
        maxIntervalSec: "86400",
        timezone: "UTC",
      },
      "America/Chicago",
    );

    expect(patch).toEqual({
      label: "Daily label edit",
      conditions: null,
      cronExpression: "0 10 * * *",
      timezone: "UTC",
    });
  });

  it("allows schedule trigger timezone edits", () => {
    const patch = buildRoutineTriggerPatch(
      makeScheduleTrigger({ timezone: "UTC" }),
      {
        label: "Weekly",
        conditions: [],
        cronExpression: "0 9 * * 1",
        signingMode: "bearer",
        replayWindowSec: "300",
        minIntervalSec: "3600",
        maxIntervalSec: "86400",
        timezone: "America/Sao_Paulo",
      },
      "America/Chicago",
    );

    expect(patch).toEqual({
      label: "Weekly",
      conditions: null,
      cronExpression: "0 9 * * 1",
      timezone: "America/Sao_Paulo",
    });
  });

  it("falls back to the local timezone when a schedule trigger has none", () => {
    const patch = buildRoutineTriggerPatch(
      makeScheduleTrigger({ timezone: null }),
      {
        label: "",
        conditions: [],
        cronExpression: "15 9 * * 1-5",
        signingMode: "bearer",
        replayWindowSec: "300",
        minIntervalSec: "3600",
        maxIntervalSec: "86400",
      },
      "America/Chicago",
    );

    expect(patch).toEqual({
      label: null,
      conditions: null,
      cronExpression: "15 9 * * 1-5",
      timezone: "America/Chicago",
    });
  });

  it("builds patch for random_interval trigger", () => {
    const patch = buildRoutineTriggerPatch(
      makeScheduleTrigger({
        kind: "random_interval",
        minIntervalSec: 3600,
        maxIntervalSec: 86400,
      }),
      {
        label: "Random interval",
        conditions: [],
        cronExpression: "",
        signingMode: "bearer",
        replayWindowSec: "300",
        minIntervalSec: "108000",
        maxIntervalSec: "86400",
      },
      "UTC",
    );

    expect(patch).toEqual({
      label: "Random interval",
      conditions: null,
      minIntervalSec: 108000,
      maxIntervalSec: 86400,
    });
  });

  it("uses the raw seconds value directly", () => {
    const patch = buildRoutineTriggerPatch(
      makeScheduleTrigger({ kind: "random_interval" }),
      {
        label: "Test",
        conditions: [],
        cronExpression: "",
        signingMode: "bearer",
        replayWindowSec: "300",
        minIntervalSec: "7200",
        maxIntervalSec: "259200",
      },
      "UTC",
    );

    expect(patch).toEqual({
      label: "Test",
      conditions: null,
      minIntervalSec: 7200,
      maxIntervalSec: 259200,
    });
  });

  it("defaults to 1h/24h when no interval is provided", () => {
    const patch = buildRoutineTriggerPatch(
      makeScheduleTrigger({ kind: "random_interval" }),
      {
        label: "Random interval",
        conditions: [],
        cronExpression: "",
        signingMode: "bearer",
        replayWindowSec: "300",
      },
      "UTC",
    );

    expect(patch).toEqual({
      label: "Random interval",
      conditions: null,
      minIntervalSec: 3600,
      maxIntervalSec: 86400,
    });
  });

  it("builds patch for webhook trigger with signing mode and replay window", () => {
    const patch = buildRoutineTriggerPatch(
      makeScheduleTrigger({ kind: "webhook" }),
      {
        label: "Webhook trigger",
        conditions: [],
        cronExpression: "",
        signingMode: "hmac",
        replayWindowSec: "600",
        minIntervalSec: "",
        maxIntervalSec: "",
      },
      "UTC",
    );

    expect(patch).toEqual({
      label: "Webhook trigger",
      conditions: null,
      signingMode: "hmac",
      replayWindowSec: 600,
    });
  });

  it("uses default replay window when not provided for webhook", () => {
    const patch = buildRoutineTriggerPatch(
      makeScheduleTrigger({ kind: "webhook" }),
      {
        label: "Webhook trigger",
        conditions: [],
        cronExpression: "",
        signingMode: "bearer",
        replayWindowSec: "",
        minIntervalSec: "",
        maxIntervalSec: "",
      },
      "UTC",
    );

    expect(patch).toEqual({
      label: "Webhook trigger",
      conditions: null,
      signingMode: "bearer",
      replayWindowSec: 300,
    });
  });

  it("serializes trigger conditions as a typed list", () => {
    const patch = buildRoutineTriggerPatch(
      makeScheduleTrigger(),
      {
        label: "Daily",
        conditions: [{
          id: "cond-1",
          type: "project_status",
          statuses: ["planned", "completed"],
        }],
        cronExpression: "0 10 * * *",
        signingMode: "bearer",
        replayWindowSec: "300",
        minIntervalSec: "3600",
        maxIntervalSec: "86400",
      },
      "UTC",
    );

    expect(patch).toEqual({
      label: "Daily",
      conditions: [{
        type: "project_status",
        statuses: ["planned", "completed"],
      }],
      cronExpression: "0 10 * * *",
      timezone: "UTC",
    });
  });
});
