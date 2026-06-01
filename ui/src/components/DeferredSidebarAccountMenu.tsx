import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DeploymentMode } from "@paperclipai/shared";
import { authApi } from "@/api/auth";
import { useSidebar } from "../context/SidebarContext";
import { cn } from "../lib/classnames";
import { queryKeys } from "../lib/queryKeys";

const SidebarAccountMenu = lazy(() =>
  import("./SidebarAccountMenu").then((module) => ({ default: module.SidebarAccountMenu })),
);

interface DeferredSidebarAccountMenuProps {
  deploymentMode?: DeploymentMode;
  instanceSettingsTarget: string;
  version?: string | null;
}

function AccountMenuFallbackButton({
  loading = false,
  displayName = "Board",
  initials = "BO",
  onLoadIntent,
  onOpenIntent,
}: {
  loading?: boolean;
  displayName?: string;
  initials?: string;
  onLoadIntent: () => void;
  onOpenIntent: () => void;
}) {
  const { isCollapsed, isMobile } = useSidebar();

  return (
    <div className="w-full shrink-0 border-t border-border bg-background p-2">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent/50 hover:text-foreground",
          isCollapsed && !isMobile && "justify-center px-2",
          loading && "text-muted-foreground",
        )}
        aria-busy={loading || undefined}
        aria-label="Open account menu"
        onClick={onOpenIntent}
        onFocus={onLoadIntent}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
          {initials}
        </span>
        {(!isCollapsed || isMobile) ? <span className="min-w-0 flex-1 truncate">{displayName}</span> : null}
      </button>
    </div>
  );
}

function deriveInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function DeferredSidebarAccountMenu({
  deploymentMode,
  instanceSettingsTarget,
  version,
}: DeferredSidebarAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const displayName = session?.user.name?.trim() || "Board";
  const initials = deriveInitials(displayName);

  const loadMenu = useCallback(() => {
    setShouldLoad(true);
  }, []);

  const openMenu = useCallback(() => {
    setShouldLoad(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (shouldLoad || typeof window === "undefined") return;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(loadMenu, { timeout: 1_500 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
    const timeout = window.setTimeout(loadMenu, 400);
    return () => window.clearTimeout(timeout);
  }, [loadMenu, shouldLoad]);

  if (shouldLoad) {
    return (
      <Suspense
        fallback={(
          <AccountMenuFallbackButton
            loading
            displayName={displayName}
            initials={initials}
            onLoadIntent={loadMenu}
            onOpenIntent={openMenu}
          />
        )}
      >
        <SidebarAccountMenu
          deploymentMode={deploymentMode}
          instanceSettingsTarget={instanceSettingsTarget}
          open={open}
          onOpenChange={setOpen}
          version={version}
        />
      </Suspense>
    );
  }

  return (
    <AccountMenuFallbackButton
      displayName={displayName}
      initials={initials}
      onLoadIntent={loadMenu}
      onOpenIntent={openMenu}
    />
  );
}
