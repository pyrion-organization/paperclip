import { describe, expect, it } from "vitest";
import {
  portabilityIssueRoutineTriggerManifestEntrySchema,
  portabilityProjectManifestEntrySchema,
} from "./company-portability.js";

describe("company portability validators", () => {
  it("preserves project environment bindings declared by the manifest type", () => {
    const parsed = portabilityProjectManifestEntrySchema.parse({
      slug: "website",
      name: "Website",
      path: "projects/website",
      description: null,
      ownerAgentSlug: null,
      leadAgentSlug: null,
      targetDate: null,
      color: null,
      status: "active",
      env: {
        API_BASE_URL: { type: "plain", value: "https://example.test" },
      },
      executionWorkspacePolicy: null,
      workspaces: [],
      metadata: null,
    });

    expect(parsed.env).toEqual({
      API_BASE_URL: { type: "plain", value: "https://example.test" },
    });
  });

  it("preserves random routine trigger scheduling fields declared by the manifest type", () => {
    const parsed = portabilityIssueRoutineTriggerManifestEntrySchema.parse({
      kind: "random_cron_scheduler",
      label: null,
      enabled: true,
      cronExpression: null,
      timezone: "UTC",
      signingMode: null,
      replayWindowSec: null,
      minIntervalSec: null,
      maxIntervalSec: null,
      allowedWeekdays: [1, 2, 3],
      minTimeOfDayMin: 540,
      maxTimeOfDayMin: 1020,
      minDaysAhead: 1,
      maxDaysAhead: 7,
    });

    expect(parsed).toMatchObject({
      allowedWeekdays: [1, 2, 3],
      minTimeOfDayMin: 540,
      maxTimeOfDayMin: 1020,
      minDaysAhead: 1,
      maxDaysAhead: 7,
    });
  });
});
