// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal } from "@paperclipai/shared";
import { GoalProperties } from "./GoalProperties";

const mockAgentsApi = vi.hoisted(() => ({
  list: vi.fn(),
}));

const mockGoalsApi = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("../api/agents", () => ({
  agentsApi: mockAgentsApi,
}));

vi.mock("../api/goals", () => ({
  goalsApi: mockGoalsApi,
}));

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    companyId: "company-a",
    title: "Launch",
    description: null,
    level: "company",
    status: "active",
    parentId: "goal-parent",
    ownerAgentId: "agent-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("GoalProperties", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    mockAgentsApi.list.mockResolvedValue([
      { id: "agent-1", companyId: "company-a", name: "Ada", urlKey: "ada", role: "employee", title: null, icon: null },
    ]);
    mockGoalsApi.list.mockResolvedValue([
      createGoal({ id: "goal-parent", title: "Parent goal", parentId: null, ownerAgentId: null }),
    ]);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
    vi.clearAllMocks();
  });

  it("loads related goal properties from the rendered goal company", async () => {
    root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <GoalProperties goal={createGoal()} />
        </QueryClientProvider>,
      );
    });
    await flushReact();

    expect(mockAgentsApi.list).toHaveBeenCalledWith("company-a");
    expect(mockGoalsApi.list).toHaveBeenCalledWith("company-a");
  });
});
