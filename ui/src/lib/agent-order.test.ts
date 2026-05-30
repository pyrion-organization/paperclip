// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Agent } from "@paperclipai/shared";
import { sortAgentsByStoredOrder } from "./agent-order";

function agent(id: string, name: string, reportsTo: string | null): Agent {
  return {
    id,
    companyId: "company-1",
    name,
    role: "engineer",
    title: null,
    status: "active",
    reportsTo,
    capabilities: null,
    adapterType: "process",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    lastHeartbeatAt: null,
    icon: null,
    metadata: null,
    createdAt: new Date("2026-05-30T00:00:00.000Z"),
    updatedAt: new Date("2026-05-30T00:00:00.000Z"),
    urlKey: id,
    pauseReason: null,
    pausedAt: null,
    permissions: {},
  } as Agent;
}

describe("agent order", () => {
  it("keeps agents with cyclic reportsTo links in the sidebar order", () => {
    const sorted = sortAgentsByStoredOrder([
      agent("a", "Alpha", "b"),
      agent("b", "Beta", "a"),
      agent("c", "CEO", null),
    ], []);

    expect(sorted.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
  });
});
