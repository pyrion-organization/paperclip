import { describe, expect, it } from "vitest";
import { normalizeExperimentalSettings } from "../services/instance-settings.js";

describe("instance settings service", () => {
  it("ignores retired experimental flags without resetting current settings", () => {
    expect(normalizeExperimentalSettings({
      enableEnvironments: true,
      enableIsolatedWorkspaces: true,
      enableIssuePlanDecompositions: true,
      enableCloudSync: true,
      autoRestartDevServerWhenIdle: true,
      enableIssueGraphLivenessAutoRecovery: true,
      issueGraphLivenessAutoRecoveryLookbackHours: 48,
      enableNewestFirstIssueThread: true,
    })).toEqual({
      enableEnvironments: true,
      enableIsolatedWorkspaces: true,
      enableIssuePlanDecompositions: true,
      enableCloudSync: true,
      autoRestartDevServerWhenIdle: true,
      enableIssueGraphLivenessAutoRecovery: true,
      issueGraphLivenessAutoRecoveryLookbackHours: 48,
    });
  });

  it("uses JSONB merge patches for general and experimental updates", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const row = {
      id: "settings-1",
      singletonKey: "default",
      general: { censorUsernameInLogs: true },
      experimental: { enableEnvironments: true },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([row]),
        }),
      }),
      update: () => ({
        set: (value: Record<string, unknown>) => {
          updateCalls.push(value);
          return {
            where: () => ({
              returning: () => Promise.resolve([row]),
            }),
          };
        },
      }),
    };
    const { instanceSettingsService } = await import("../services/instance-settings.js");
    const service = instanceSettingsService(db as never);

    await service.updateGeneral({ keyboardShortcuts: true });
    await service.updateExperimental({ enableCloudSync: true });

    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]?.general).not.toEqual({
      censorUsernameInLogs: false,
      keyboardShortcuts: true,
      feedbackDataSharingPreference: "disabled",
    });
    expect(updateCalls[0]?.general).toEqual(expect.objectContaining({ queryChunks: expect.any(Array) }));
    expect(updateCalls[1]?.experimental).toEqual(expect.objectContaining({ queryChunks: expect.any(Array) }));
  });
});
