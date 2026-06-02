// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleEditor } from "./ScheduleEditor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
});

function render(value: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<ScheduleEditor value={value} onChange={() => {}} />);
  });
  return container;
}

describe("ScheduleEditor", () => {
  it("keeps cron schedules with a restricted month in custom mode", () => {
    const node = render("0 10 * 2 *");

    const customInput = node.querySelector<HTMLInputElement>("input");
    expect(customInput).not.toBeNull();
    expect(customInput?.value).toBe("0 10 * 2 *");
    expect(node.textContent).toContain("Five fields");
  });
});
