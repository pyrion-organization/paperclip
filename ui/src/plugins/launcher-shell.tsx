import {
  Component,
  createElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { PluginLauncherBounds } from "@paperclipai/shared/constants";
import type {
  PluginHostContext,
  PluginRenderEnvironmentContext,
} from "./bridge";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classnames";
import { queryKeys } from "@/lib/queryKeys";
import { PluginBridgeContext } from "./bridge";
import type {
  LauncherInstance,
  PluginModalBoundsRequest,
  PluginRenderCloseEvent,
  PluginRenderCloseHandler,
} from "./launcher-runtime";

const focusableElementSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const launcherOverlayBaseZIndex = 1000;

function buildLauncherHostContext(
  context: LauncherInstance["hostContext"],
  renderEnvironment: PluginRenderEnvironmentContext | null,
  userId: string | null,
): PluginHostContext {
  return {
    companyId: context.companyId ?? null,
    companyPrefix: context.companyPrefix ?? null,
    projectId: context.projectId ?? (context.entityType === "project" ? context.entityId ?? null : null),
    entityId: context.entityId ?? null,
    entityType: context.entityType ?? null,
    userId,
    renderEnvironment,
  };
}

function focusFirstElement(container: HTMLElement | null): void {
  if (!container) return;
  const firstFocusable = container.querySelector<HTMLElement>(focusableElementSelector);
  if (firstFocusable) {
    firstFocusable.focus();
    return;
  }
  container.focus();
}

function launcherIframeSrc(launcher: LauncherInstance["launcher"]): string {
  return `/_plugins/${encodeURIComponent(launcher.pluginId)}/ui/${launcher.action.target}`;
}

function launcherShellBoundsStyle(bounds: PluginLauncherBounds | null): CSSProperties {
  switch (bounds) {
    case "compact":
      return { width: "min(28rem, calc(100vw - 2rem))" };
    case "wide":
      return { width: "min(64rem, calc(100vw - 2rem))" };
    case "full":
      return { width: "calc(100vw - 2rem)", height: "calc(100vh - 2rem)" };
    case "inline":
      return { width: "min(24rem, calc(100vw - 2rem))" };
    case "default":
    default:
      return { width: "min(40rem, calc(100vw - 2rem))" };
  }
}

function launcherPopoverStyle(instance: LauncherInstance): CSSProperties {
  const rect = instance.sourceRect;
  const baseWidth = launcherShellBoundsStyle(instance.bounds).width ?? "min(24rem, calc(100vw - 2rem))";
  if (!rect) {
    return {
      width: baseWidth,
      maxHeight: "min(70vh, 36rem)",
      top: "4rem",
      left: "50%",
      transform: "translateX(-50%)",
    };
  }

  return {
    width: baseWidth,
    maxHeight: "min(70vh, 36rem)",
    top: Math.min(rect.bottom + 8, window.innerHeight - 32),
    left: Math.min(Math.max(rect.left, 16), window.innerWidth - 320),
  };
}

function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(focusableElementSelector),
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);

  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement as HTMLElement | null;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function PluginLauncherBridgeScope({
  pluginId,
  hostContext,
  children,
}: {
  pluginId: string;
  hostContext: PluginHostContext;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ pluginId, hostContext }), [pluginId, hostContext]);

  return (
    <PluginBridgeContext.Provider value={value}>
      {children}
    </PluginBridgeContext.Provider>
  );
}

type LauncherErrorBoundaryProps = {
  launcher: LauncherInstance["launcher"];
  children: ReactNode;
};

type LauncherErrorBoundaryState = {
  hasError: boolean;
};

class LauncherErrorBoundary extends Component<LauncherErrorBoundaryProps, LauncherErrorBoundaryState> {
  override state: LauncherErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LauncherErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Plugin launcher render failed", {
      pluginKey: this.props.launcher.pluginKey,
      launcherId: this.props.launcher.id,
      error,
      info: info.componentStack,
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {this.props.launcher.pluginDisplayName}: failed to render
        </div>
      );
    }
    return this.props.children;
  }
}

function LauncherRenderContent({
  instance,
  renderEnvironment,
}: {
  instance: LauncherInstance;
  renderEnvironment: PluginRenderEnvironmentContext;
}) {
  const component = instance.component;
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const userId = session?.user?.id ?? session?.session?.userId ?? null;
  const hostContext = useMemo(
    () => buildLauncherHostContext(instance.hostContext, renderEnvironment, userId),
    [instance.hostContext, renderEnvironment, userId],
  );

  if (renderEnvironment.environment === "iframe") {
    return (
      <iframe
        src={launcherIframeSrc(instance.launcher)}
        title={`${instance.launcher.pluginDisplayName} ${instance.launcher.displayName}`}
        sandbox="allow-downloads allow-forms allow-popups allow-scripts"
        className="h-full min-h-[24rem] w-full rounded-md border border-border bg-background"
      />
    );
  }

  if (!component) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        {instance.launcher.pluginDisplayName}: could not resolve launcher target "{instance.launcher.action.target}".
      </div>
    );
  }

  if (component.kind === "web-component") {
    return createElement(component.tagName, {
      className: "block w-full",
      pluginLauncher: instance.launcher,
      pluginContext: hostContext,
    });
  }

  const node = createElement(component.component as never, {
    launcher: instance.launcher,
    context: hostContext,
  } as never);

  return (
    <LauncherErrorBoundary launcher={instance.launcher}>
      <PluginLauncherBridgeScope pluginId={instance.launcher.pluginId} hostContext={hostContext}>
        {node}
      </PluginLauncherBridgeScope>
    </LauncherErrorBoundary>
  );
}

function LauncherModalShell({
  instance,
  stackIndex,
  isTopmost,
  requestBounds,
  closeLauncher,
}: {
  instance: LauncherInstance;
  stackIndex: number;
  isTopmost: boolean;
  requestBounds: (key: string, request: PluginModalBoundsRequest) => Promise<void>;
  closeLauncher: (key: string, event: PluginRenderCloseEvent) => Promise<void>;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isTopmost) return;
    const frame = requestAnimationFrame(() => {
      focusFirstElement(contentRef.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [isTopmost]);

  useEffect(() => {
    if (!isTopmost) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!contentRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        void closeLauncher(instance.key, { reason: "escapeKey", nativeEvent: event });
        return;
      }
      trapFocus(contentRef.current, event);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeLauncher, instance.key, isTopmost]);

  const renderEnvironment = useMemo<PluginRenderEnvironmentContext>(() => ({
    environment: instance.launcher.render?.environment ?? "hostOverlay",
    launcherId: instance.launcher.id,
    bounds: instance.bounds,
    requestModalBounds: (request) => requestBounds(instance.key, request),
    closeLifecycle: {
      onBeforeClose: (handler: PluginRenderCloseHandler) => {
        instance.beforeCloseHandlers.add(handler);
        return () => instance.beforeCloseHandlers.delete(handler);
      },
      onClose: (handler: PluginRenderCloseHandler) => {
        instance.closeHandlers.add(handler);
        return () => instance.closeHandlers.delete(handler);
      },
    },
  }), [instance, requestBounds]);

  const baseZ = launcherOverlayBaseZIndex + stackIndex * 20;
  const shellType = instance.launcher.action.type;
  const containerStyle = shellType === "openPopover"
    ? launcherPopoverStyle(instance)
    : launcherShellBoundsStyle(instance.bounds);

  const panelClassName = shellType === "openDrawer"
    ? "fixed right-0 top-0 h-full max-w-[min(44rem,100vw)] overflow-hidden border-l border-border bg-background shadow-2xl"
    : shellType === "openPopover"
      ? "fixed overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      : "fixed left-1/2 top-1/2 max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/45"
        style={{ zIndex: baseZ }}
        aria-hidden="true"
        onMouseDown={(event) => {
          if (!isTopmost) return;
          if (event.target !== event.currentTarget) return;
          void closeLauncher(instance.key, { reason: "backdrop", nativeEvent: event });
        }}
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={panelClassName}
        style={{
          zIndex: baseZ + 1,
          ...(shellType === "openDrawer"
            ? { width: containerStyle.width ?? "min(44rem, 100vw)" }
            : containerStyle),
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-sm font-semibold">
              {instance.launcher.displayName}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {instance.launcher.pluginDisplayName}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => void closeLauncher(instance.key, { reason: "programmatic" })}
          >
            Close
          </Button>
        </div>
        <div
          className={cn(
            "overflow-auto p-4",
            shellType === "openDrawer" ? "h-[calc(100%-3.5rem)]" : "max-h-[calc(100vh-7rem)]",
          )}
        >
          <LauncherRenderContent instance={instance} renderEnvironment={renderEnvironment} />
        </div>
      </div>
    </>
  );
}

export function LauncherModalStack({
  stack,
  requestBounds,
  closeLauncher,
}: {
  stack: LauncherInstance[];
  requestBounds: (key: string, request: PluginModalBoundsRequest) => Promise<void>;
  closeLauncher: (key: string, event: PluginRenderCloseEvent) => Promise<void>;
}) {
  return (
    <>
      {stack.map((instance, index) => (
        <LauncherModalShell
          key={instance.key}
          instance={instance}
          stackIndex={index}
          isTopmost={index === stack.length - 1}
          requestBounds={requestBounds}
          closeLauncher={closeLauncher}
        />
      ))}
    </>
  );
}
