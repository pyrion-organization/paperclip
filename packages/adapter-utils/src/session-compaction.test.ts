import { describe, expect, it } from "vitest";
import { readSessionCompactionOverride, resolveSessionCompactionPolicy } from "./session-compaction.js";

describe("session compaction", () => {
  it("ignores blank numeric override strings instead of treating them as zero", () => {
    expect(
      readSessionCompactionOverride({
        heartbeat: {
          sessionCompaction: {
            maxSessionRuns: "",
            maxRawInputTokens: "   ",
            maxSessionAgeHours: "\t",
          },
        },
      }),
    ).toEqual({});
  });

  it("falls back to adapter defaults when numeric overrides are blank", () => {
    const resolved = resolveSessionCompactionPolicy("cursor", {
      heartbeat: {
        sessionCompaction: {
          maxSessionRuns: "",
        },
      },
    });

    expect(resolved.policy.maxSessionRuns).toBe(200);
    expect(resolved.source).toBe("adapter_default");
  });
});
