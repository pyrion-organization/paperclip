// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToggleSwitch } from "./toggle-switch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("ToggleSwitch", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("composes caller onClick with the checked change handler", () => {
    const onClick = vi.fn();
    const onCheckedChange = vi.fn();

    act(() => {
      root.render(
        <ToggleSwitch checked={false} onCheckedChange={onCheckedChange} onClick={onClick} />,
      );
    });

    act(() => {
      container.querySelector("button")?.click();
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
