import { describe, expect, it } from "vitest";
import type { ResourceMemberships } from "@paperclipai/shared";
import { restoreMembershipState } from "./useResourceMemberships";

describe("restoreMembershipState", () => {
  it("removes failed optimistic project membership when there was no previous cache", () => {
    const optimistic: ResourceMemberships = {
      projectMemberships: {
        "project-1": "joined",
      },
      agentMemberships: {},
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    };

    const restored = restoreMembershipState(optimistic, undefined, "project", "project-1");

    expect(restored.projectMemberships).toEqual({});
    expect(restored.agentMemberships).toEqual({});
  });

  it("restores previous agent membership state after failed optimistic changes", () => {
    const previous: ResourceMemberships = {
      projectMemberships: {},
      agentMemberships: {
        "agent-1": "left",
      },
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    };
    const optimistic: ResourceMemberships = {
      ...previous,
      agentMemberships: {
        "agent-1": "joined",
      },
    };

    const restored = restoreMembershipState(optimistic, previous, "agent", "agent-1");

    expect(restored.agentMemberships).toEqual({ "agent-1": "left" });
  });
});
