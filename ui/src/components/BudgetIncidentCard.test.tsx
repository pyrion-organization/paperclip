// @vitest-environment jsdom

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { BudgetIncident } from "@paperclipai/shared";
import { BudgetIncidentCard } from "./BudgetIncidentCard";

function makeIncident(overrides: Partial<BudgetIncident> = {}): BudgetIncident {
  return {
    id: "incident-1",
    companyId: "company-1",
    policyId: "policy-1",
    scopeType: "project",
    scopeId: "project-1",
    scopeName: "Project",
    status: "open",
    severity: "hard_stop",
    amountLimit: 10_000,
    amountObserved: 12_000,
    openedAt: new Date("2026-05-31T00:00:00.000Z"),
    resolvedAt: null,
    approvalId: null,
    approvalStatus: null,
    createdAt: new Date("2026-05-31T00:00:00.000Z"),
    updatedAt: new Date("2026-05-31T00:00:00.000Z"),
    ...overrides,
  } as BudgetIncident;
}

describe("BudgetIncidentCard", () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
  });

  it("resets the raise amount when the incident changes", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    flushSync(() => {
      root.render(
        <BudgetIncidentCard
          incident={makeIncident()}
          onRaiseAndResume={() => undefined}
          onKeepPaused={() => undefined}
        />,
      );
    });
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("130.00");

    flushSync(() => {
      input.value = "999.00";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    flushSync(() => {
      root.render(
        <BudgetIncidentCard
          incident={makeIncident({
            id: "incident-2",
            amountLimit: 20_000,
            amountObserved: 21_000,
          })}
          onRaiseAndResume={() => undefined}
          onKeepPaused={() => undefined}
        />,
      );
    });

    await Promise.resolve();
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("220.00");

    flushSync(() => {
      root.unmount();
    });
  });
});
