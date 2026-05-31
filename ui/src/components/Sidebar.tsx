import { lazy, Suspense, useEffect, useState } from "react";
import {
  Inbox,
  LayoutDashboard,
  Gauge,
  Search,
  SquarePen,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "@/lib/router";
import { SidebarNavItem } from "./SidebarNavItem";
import { DeferredSidebarCompanyMenu } from "./DeferredSidebarCompanyMenu";
import { useDialogActions } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { useSidebar } from "../context/SidebarContext";
import { cn } from "../lib/classnames";
import { Button } from "@/components/ui/button";

const SidebarInboxNavItem = lazy(() =>
  import("./SidebarInboxNavItem").then((module) => ({ default: module.SidebarInboxNavItem })),
);
const SidebarDeferredSections = lazy(() =>
  import("./SidebarDeferredSections").then((module) => ({ default: module.SidebarDeferredSections })),
);

type SidebarIdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const EMPTY_ARRAY: never[] = [];

function useSidebarChromeReady() {
  const [ready, setReady] = useState(() => typeof window === "undefined");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const idleWindow = window as SidebarIdleWindow;
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setReady(true), { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timeout = window.setTimeout(() => setReady(true), 250);
    return () => window.clearTimeout(timeout);
  }, []);

  return ready;
}

function SidebarDeferredSectionsPlaceholder() {
  const { isCollapsed, isMobile } = useSidebar();
  const collapsed = isCollapsed && !isMobile;
  const rows = collapsed ? 10 : 12;

  return (
    <div
      aria-hidden="true"
      className={cn("flex flex-col gap-4", collapsed ? "px-2" : "px-3")}
    >
      {[0, 1].map((section) => (
        <div key={section} className="space-y-1.5">
          {!collapsed ? <div className="mx-1 h-3 w-14 rounded bg-muted/70" /> : null}
          <div className="space-y-1">
            {Array.from({ length: section === 0 ? Math.ceil(rows / 2) : Math.floor(rows / 2) }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-8 rounded-md bg-muted/45",
                  collapsed ? "mx-auto w-8" : "w-full",
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Sidebar() {
  const { openNewIssue } = useDialogActions();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { isCollapsed, isMobile, toggleCollapsed } = useSidebar();
  const sidebarChromeReady = useSidebarChromeReady();
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: async () => {
      const { instanceSettingsApi } = await import("../api/instanceSettings");
      return instanceSettingsApi.getExperimental();
    },
    enabled: sidebarChromeReady,
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: async () => {
      const { heartbeatsApi } = await import("../api/heartbeats");
      return heartbeatsApi.liveRunsForCompany(selectedCompanyId!);
    },
    enabled: sidebarChromeReady && !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;
  const showWorkspacesLink = experimentalSettings?.enableIsolatedWorkspaces === true;

  const pluginContext = {
    companyId: selectedCompanyId ?? null,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className={cn("h-full min-h-0 border-r border-border bg-background flex flex-col", isCollapsed && !isMobile ? "w-16" : "w-60")}>
      <div className={cn("flex items-center gap-1 px-2 h-12 shrink-0", isCollapsed && "justify-center")}>
        {!isCollapsed && <DeferredSidebarCompanyMenu />}
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          aria-label="Open search"
          title="Open search"
        >
          <NavLink to="/search">
            <Search className="size-4" />
          </NavLink>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>

      <nav className={cn("flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 pointer-coarse:gap-3 py-2", isCollapsed && !isMobile ? "px-2" : "px-3")}>
        <div className="flex flex-col gap-0.5">
          {/* New Issue button aligned with nav items */}
          <button type="button"
            onClick={() => openNewIssue()}
            data-slot="icon-button"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 pointer-coarse:py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors",
              isCollapsed && "justify-center px-2",
            )}
            title="New Issue"
            aria-label="New Issue"
          >
            <SquarePen className="size-4 shrink-0" />
            {!isCollapsed && <span className="truncate">New Issue</span>}
          </button>
          <SidebarNavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} liveCount={liveRunCount} />
          <SidebarNavItem to="/usage" label="Usage" icon={Gauge} />
          {sidebarChromeReady ? (
            <Suspense fallback={<SidebarNavItem to="/inbox" label="Inbox" icon={Inbox} />}>
              <SidebarInboxNavItem companyId={selectedCompanyId} />
            </Suspense>
          ) : (
            <SidebarNavItem to="/inbox" label="Inbox" icon={Inbox} />
          )}
        </div>

        {sidebarChromeReady ? (
          <Suspense fallback={<SidebarDeferredSectionsPlaceholder />}>
            <SidebarDeferredSections
              liveRuns={liveRuns ?? EMPTY_ARRAY}
              pluginContext={pluginContext}
              showWorkspacesLink={showWorkspacesLink}
            />
          </Suspense>
        ) : (
          <SidebarDeferredSectionsPlaceholder />
        )}
      </nav>
    </aside>
  );
}
