import { lazy, Suspense, useCallback, useState } from "react";
import type { DeploymentMode } from "@paperclipai/shared";
import { useSidebar } from "../context/SidebarContext";
import { cn } from "../lib/classnames";

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
  onLoadIntent,
  onOpenIntent,
}: {
  loading?: boolean;
  onLoadIntent: () => void;
  onOpenIntent: () => void;
}) {
  const { isCollapsed, isMobile } = useSidebar();

  return (
    <div className="w-full shrink-0 border-t border-border bg-background px-2 py-2">
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
          BO
        </span>
        {(!isCollapsed || isMobile) ? <span className="min-w-0 flex-1 truncate">Board</span> : null}
      </button>
    </div>
  );
}

export function DeferredSidebarAccountMenu({
  deploymentMode,
  instanceSettingsTarget,
  version,
}: DeferredSidebarAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);

  const loadMenu = useCallback(() => {
    setShouldLoad(true);
  }, []);

  const openMenu = useCallback(() => {
    setShouldLoad(true);
    setOpen(true);
  }, []);

  if (shouldLoad) {
    return (
      <Suspense
        fallback={(
          <AccountMenuFallbackButton
            loading
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
      onLoadIntent={loadMenu}
      onOpenIntent={openMenu}
    />
  );
}
