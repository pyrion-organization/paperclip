import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

const LIVE_UPDATES_BOOT_DELAY_MS = 1_000;

const LiveUpdatesRuntimeProvider = lazy(() =>
  import("./LiveUpdatesRuntime").then((module) => ({ default: module.LiveUpdatesProvider })),
);

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setEnabled(true);
    }, LIVE_UPDATES_BOOT_DELAY_MS);

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
