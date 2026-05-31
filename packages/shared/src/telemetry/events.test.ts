import { describe, expect, it } from "vitest";
import { trackSkillImported } from "./events.js";
import type { TelemetryClient } from "./client.js";

function createClient() {
  const events: Array<{ name: string; dimensions?: Record<string, string | number | boolean> }> = [];
  return {
    events,
    client: {
      track: (name: string, dimensions?: Record<string, string | number | boolean>) => {
        events.push({ name, dimensions });
      },
      hashPrivateRef: (value: string) => `hashed:${value.length}`,
    } as unknown as TelemetryClient,
  };
}

describe("telemetry events", () => {
  it("hashes private skill import references", () => {
    const { client, events } = createClient();

    trackSkillImported(client, {
      sourceType: "git",
      skillRef: "git@github.com:org/private-skill.git",
      isPrivate: true,
    });

    expect(events[0]).toEqual({
      name: "skill.imported",
      dimensions: {
        source_type: "git",
        skill_ref: "hashed:36",
        skill_ref_hashed: true,
      },
    });
  });

  it("can retain explicitly public skill import references", () => {
    const { client, events } = createClient();

    trackSkillImported(client, {
      sourceType: "skills_sh",
      skillRef: "paperclipai/paperclip/release-changelog",
      isPrivate: false,
    });

    expect(events[0]?.dimensions).toMatchObject({
      skill_ref: "paperclipai/paperclip/release-changelog",
      skill_ref_hashed: false,
    });
  });
});
