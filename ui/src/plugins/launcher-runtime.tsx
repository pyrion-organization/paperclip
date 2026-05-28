import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  PluginLauncherBounds,
  PluginUiSlotEntityType,
} from "@paperclipai/shared/constants";
import type { PluginLauncherDeclaration } from "@paperclipai/shared/types/plugin";
import type { PluginUiContribution } from "@/api/plugins";
import { useLocation, useNavigate } from "@/lib/router";
import type {
  PluginModalBoundsRequest,
  PluginRenderCloseEvent,
  PluginRenderCloseHandler,
} from "./bridge";
import type { RegisteredPluginComponent } from "./slots-registry";

const LauncherModalStack = lazy(() =>
  import("./launcher-shell").then((module) => ({ default: module.LauncherModalStack })),
);

export type PluginLauncherContext = {
  companyId?: string | null;
  companyPrefix?: string | null;
  projectId?: string | null;
  projectRef?: string | null;
  entityId?: string | null;
  entityType?: PluginUiSlotEntityType | null;
};

export type ResolvedPluginLauncher = PluginLauncherDeclaration & {
  pluginId: string;
  pluginKey: string;
  pluginDisplayName: string;
  pluginVersion: string;
  uiEntryFile: string;
};

export type LauncherInstance = {
  key: string;
  launcher: ResolvedPluginLauncher;
  hostContext: PluginLauncherContext;
  contribution: PluginUiContribution;
  component: RegisteredPluginComponent | null;
  sourceElement: HTMLElement | null;
  sourceRect: DOMRect | null;
  bounds: PluginLauncherBounds | null;
  beforeCloseHandlers: Set<PluginRenderCloseHandler>;
  closeHandlers: Set<PluginRenderCloseHandler>;
};

export type {
  PluginModalBoundsRequest,
  PluginRenderCloseEvent,
  PluginRenderCloseHandler,
} from "./bridge";

export type PluginLauncherRuntimeContextValue = {
  activateLauncher(
    launcher: ResolvedPluginLauncher,
    hostContext: PluginLauncherContext,
    contribution: PluginUiContribution,
    sourceEl?: HTMLElement | null,
  ): Promise<void>;
};

const SUPPORTED_LAUNCHER_BOUNDS = [
  "inline",
  "compact",
  "default",
  "wide",
  "full",
] as const satisfies readonly PluginLauncherBounds[];
const supportedLauncherBounds = new Set<PluginLauncherBounds>(SUPPORTED_LAUNCHER_BOUNDS);
const PluginLauncherRuntimeContext = createContext<PluginLauncherRuntimeContextValue | null>(null);

function isPluginLauncherBounds(value: unknown): value is PluginLauncherBounds {
  return typeof value === "string" && supportedLauncherBounds.has(value as PluginLauncherBounds);
}

function resolveLauncherNavigationTarget(target: string, hostContext: PluginLauncherContext): string {
  if (/^https?:\/\//.test(target) || target.startsWith("/") || target.startsWith("#") || target.startsWith(".") || target.startsWith("?")) {
    return target;
  }
  const companyPrefix = hostContext.companyPrefix?.trim();
  return companyPrefix ? `/${companyPrefix}/${target}` : target;
}

function isIframeLauncher(launcher: ResolvedPluginLauncher): boolean {
  return launcher.render?.environment === "iframe";
}

async function resolveLauncherComponent(
  contribution: PluginUiContribution,
  launcher: ResolvedPluginLauncher,
): Promise<RegisteredPluginComponent | null> {
  const [
    { ensurePluginContributionLoaded },
    { resolveRegisteredPluginComponent },
  ] = await Promise.all([
    import("./slots-loader"),
    import("./slots-registry"),
  ]);
  const exportName = launcher.action.target;
  const existing = resolveRegisteredPluginComponent(launcher.pluginKey, exportName);
  if (existing) return existing;
  await ensurePluginContributionLoaded(contribution);
  return resolveRegisteredPluginComponent(launcher.pluginKey, exportName);
}

export function PluginLauncherProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<LauncherInstance[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const routerLocation = useLocation();
  const navigate = useNavigate();

  const closeLauncher = useCallback(
    async (key: string, event: PluginRenderCloseEvent) => {
      const instance = stackRef.current.find((entry) => entry.key === key);
      if (!instance) return;

      for (const handler of [...instance.beforeCloseHandlers]) {
        await handler(event);
      }

      setStack((current) => current.filter((entry) => entry.key !== key));

      queueMicrotask(() => {
        for (const handler of [...instance.closeHandlers]) {
          void handler(event);
        }
        if (instance.sourceElement && document.contains(instance.sourceElement)) {
          instance.sourceElement.focus();
        }
      });
    },
    [],
  );

  useEffect(() => {
    if (stack.length === 0) return;
    void Promise.all(
      stack.map((entry) => closeLauncher(entry.key, { reason: "hostNavigation" })),
    );
    // Only react to navigation changes, not stack churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.key]);

  const requestBounds = useCallback(
    async (key: string, request: PluginModalBoundsRequest) => {
      if (!isPluginLauncherBounds(request.bounds)) return;
      setStack((current) =>
        current.map((entry) =>
          entry.key === key
            ? { ...entry, bounds: request.bounds }
            : entry,
        ),
      );
    },
    [],
  );

  const activateLauncher = useCallback(
    async (
      launcher: ResolvedPluginLauncher,
      hostContext: PluginLauncherContext,
      contribution: PluginUiContribution,
      sourceEl?: HTMLElement | null,
    ) => {
      switch (launcher.action.type) {
        case "navigate":
          navigate(resolveLauncherNavigationTarget(launcher.action.target, hostContext));
          return;
        case "deepLink":
          if (/^https?:\/\//.test(launcher.action.target)) {
            window.open(launcher.action.target, "_blank", "noopener,noreferrer");
          } else {
            navigate(resolveLauncherNavigationTarget(launcher.action.target, hostContext));
          }
          return;
        case "performAction": {
          const { pluginsApi } = await import("@/api/plugins");
          await pluginsApi.bridgePerformAction(
            launcher.pluginId,
            launcher.action.target,
            launcher.action.params,
            hostContext.companyId ?? null,
          );
          return;
        }
        case "openModal":
        case "openDrawer":
        case "openPopover": {
          await import("./launcher-shell");
          const component = isIframeLauncher(launcher)
            ? null
            : await resolveLauncherComponent(contribution, launcher);
          const sourceRect = sourceEl?.getBoundingClientRect() ?? null;
          const nextEntry: LauncherInstance = {
            key: `${launcher.pluginId}:${launcher.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
            launcher,
            hostContext,
            contribution,
            component,
            sourceElement: sourceEl ?? null,
            sourceRect,
            bounds: launcher.render?.bounds ?? "default",
            beforeCloseHandlers: new Set(),
            closeHandlers: new Set(),
          };
          setStack((current) => [...current, nextEntry]);
          return;
        }
      }
    },
    [navigate],
  );

  const value = useMemo<PluginLauncherRuntimeContextValue>(
    () => ({ activateLauncher }),
    [activateLauncher],
  );

  return (
    <PluginLauncherRuntimeContext.Provider value={value}>
      {children}
      {stack.length > 0 ? (
        <Suspense fallback={null}>
          <LauncherModalStack
            stack={stack}
            requestBounds={requestBounds}
            closeLauncher={closeLauncher}
          />
        </Suspense>
      ) : null}
    </PluginLauncherRuntimeContext.Provider>
  );
}

export function usePluginLauncherRuntime(): PluginLauncherRuntimeContextValue {
  const value = use(PluginLauncherRuntimeContext);
  if (!value) {
    throw new Error("usePluginLauncherRuntime must be used within PluginLauncherProvider");
  }
  return value;
}
