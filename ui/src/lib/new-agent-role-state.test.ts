import { describe, expect, it } from "vitest";
import { isLoadedFirstAgentList } from "./new-agent-role-state";

describe("isLoadedFirstAgentList", () => {
  it("does not assume first-agent state while the agents query is still loading", () => {
    expect(isLoadedFirstAgentList(undefined)).toBe(false);
  });

  it("detects first-agent state only after an empty list is loaded", () => {
    expect(isLoadedFirstAgentList([])).toBe(true);
    expect(isLoadedFirstAgentList([{ id: "agent-1" }])).toBe(false);
  });
});
