import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

const LIVE_UPDATES_BOOT_TIMEOUT_MS = 3_000;
const LIVE_UPDATES_BOOT_FALLBACK_DELAY_MS = 2_000;

type LiveUpdatesIdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const LiveUpdatesRuntimeProvider = lazy(() =>
  import("./LiveUpdatesRuntime").then((module) => ({ default: module.LiveUpdatesProvider })),
);

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const enable = () => setEnabled(true);

    if (typeof window === "undefined") {
      enable();
      return;
    }

    const idleWindow = window as LiveUpdatesIdleWindow;
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(enable, { timeout: LIVE_UPDATES_BOOT_TIMEOUT_MS });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timeoutId = window.setTimeout(enable, LIVE_UPDATES_BOOT_FALLBACK_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <>
      {children}
      {enabled ? (
        <Suspense fallback={null}>
          <LiveUpdatesRuntimeProvider>{null}</LiveUpdatesRuntimeProvider>
        </Suspense>
      ) : null}
    </>
  );
}
