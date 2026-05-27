// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveUpdatesProvider } from "./LiveUpdatesProvider";

vi.mock("./LiveUpdatesRuntime", () => ({
  LiveUpdatesProvider: () => <div data-testid="live-updates-runtime" />,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("LiveUpdatesProvider shell", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalCancelIdleCallback: Window["cancelIdleCallback"];
  let originalRequestIdleCallback: Window["requestIdleCallback"];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    originalCancelIdleCallback = window.cancelIdleCallback;
    originalRequestIdleCallback = window.requestIdleCallback;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: originalRequestIdleCallback,
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      value: originalCancelIdleCallback,
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders children immediately and waits for idle to boot live updates", async () => {
    let idleCallback: (() => void) | null = null;
    const requestIdleCallback = vi.fn((callback: () => void, _options?: { timeout?: number }) => {
      idleCallback = callback;
      return 123;
    });
    const cancelIdleCallback = vi.fn();

    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: requestIdleCallback,
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      value: cancelIdleCallback,
    });

    await act(async () => {
      root.render(
        <LiveUpdatesProvider>
          <span>App content</span>
        </LiveUpdatesProvider>,
      );
    });

    expect(container.textContent).toContain("App content");
    expect(container.querySelector('[data-testid="live-updates-runtime"]')).toBeNull();
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });

    await act(async () => {
      idleCallback?.();
      await vi.dynamicImportSettled();
    });

    expect(container.querySelector('[data-testid="live-updates-runtime"]')).toBeTruthy();
    expect(cancelIdleCallback).not.toHaveBeenCalled();
  });

  it("uses a delayed fallback when idle callbacks are unavailable", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      value: undefined,
    });

    await act(async () => {
      root.render(
        <LiveUpdatesProvider>
          <span>App content</span>
        </LiveUpdatesProvider>,
      );
    });

    act(() => {
      vi.advanceTimersByTime(1_999);
    });
    expect(container.querySelector('[data-testid="live-updates-runtime"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await vi.dynamicImportSettled();
    });

    expect(container.querySelector('[data-testid="live-updates-runtime"]')).toBeTruthy();
  });
});
