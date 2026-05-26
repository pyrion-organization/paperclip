import { lazy, Suspense } from "react";
import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  Gauge,
  Activity,
  History,
  Search,
  SquarePen,
  Network,
  Boxes,
  CalendarDays,
  Repeat,
  GitBranch,
  Settings,
  Users,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "@/lib/router";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { useDialogActions } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { heartbeatsApi } from "../api/heartbeats";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { useSidebar } from "../context/SidebarContext";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";

const SidebarCompanyMenu = lazy(() =>
  import("./SidebarCompanyMenu").then((module) => ({ default: module.SidebarCompanyMenu })),
);
const SidebarProjects = lazy(() =>
  import("./SidebarProjects").then((module) => ({ default: module.SidebarProjects })),
);
const SidebarAgents = lazy(() =>
  import("./SidebarAgents").then((module) => ({ default: module.SidebarAgents })),
);
const SidebarInboxNavItem = lazy(() =>
  import("./SidebarInboxNavItem").then((module) => ({ default: module.SidebarInboxNavItem })),
);
const SidebarWorkPluginExtensions = lazy(() =>
  import("./SidebarPluginExtensions").then((module) => ({ default: module.SidebarWorkPluginExtensions })),
);
const SidebarPanelPluginExtensions = lazy(() =>
  import("./SidebarPluginExtensions").then((module) => ({ default: module.SidebarPanelPluginExtensions })),
);

export function Sidebar() {
  const { openNewIssue } = useDialogActions();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { isCollapsed, isMobile, toggleCollapsed } = useSidebar();
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;
  const showWorkspacesLink = experimentalSettings?.enableIsolatedWorkspaces === true;

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className={cn("h-full min-h-0 border-r border-border bg-background flex flex-col", isCollapsed && !isMobile ? "w-16" : "w-60")}>
      <div className={cn("flex items-center gap-1 px-2 h-12 shrink-0", isCollapsed && "justify-center")}>
        {!isCollapsed && (
          <Suspense fallback={<div className="min-w-0 flex-1" />}>
            <SidebarCompanyMenu />
          </Suspense>
        )}
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          aria-label="Open search"
          title="Open search"
        >
          <NavLink to="/search">
            <Search className="h-4 w-4" />
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
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <nav className={cn("flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 pointer-coarse:gap-3 py-2", isCollapsed && !isMobile ? "px-2" : "px-3")}>
        <div className="flex flex-col gap-0.5">
          {/* New Issue button aligned with nav items */}
          <button
            onClick={() => openNewIssue()}
            data-slot="icon-button"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 pointer-coarse:py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors",
              isCollapsed && "justify-center px-2",
            )}
            title="New Issue"
            aria-label="New Issue"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span className="truncate">New Issue</span>}
          </button>
          <SidebarNavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} liveCount={liveRunCount} />
          <SidebarNavItem to="/usage" label="Usage" icon={Gauge} />
          <Suspense fallback={<SidebarNavItem to="/inbox" label="Inbox" icon={Inbox} />}>
            <SidebarInboxNavItem companyId={selectedCompanyId} />
          </Suspense>
        </div>

        <SidebarSection label="Work">
          <SidebarNavItem to="/issues" label="Issues" icon={CircleDot} />
          <SidebarNavItem to="/calendar" label="Calendar" icon={CalendarDays} />
          <SidebarNavItem to="/routines" label="Routines" icon={Repeat} />
          <SidebarNavItem to="/goals" label="Goals" icon={Target} />
          {showWorkspacesLink ? (
            <SidebarNavItem to="/workspaces" label="Workspaces" icon={GitBranch} />
          ) : null}
          <Suspense fallback={null}>
            <SidebarWorkPluginExtensions context={pluginContext} />
          </Suspense>
        </SidebarSection>

        <Suspense fallback={null}>
          <SidebarProjects />
        </Suspense>

        <Suspense fallback={null}>
          <SidebarAgents />
        </Suspense>

        <SidebarSection label="Company">
          <SidebarNavItem to="/clients" label="Clients" icon={Users} />
          <SidebarNavItem to="/org" label="Org" icon={Network} />
          <SidebarNavItem to="/skills" label="Skills" icon={Boxes} />
          <SidebarNavItem to="/costs" label="Costs" icon={DollarSign} />
          <SidebarNavItem to="/activity" label="Activity" icon={History} />
          <SidebarNavItem to="/email/ops" label="Email Ops" icon={Activity} />
          <SidebarNavItem to="/company/instructions" label="Instructions" icon={FileText} />
          <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />
        </SidebarSection>

        {!isCollapsed && (
          <Suspense fallback={null}>
            <SidebarPanelPluginExtensions context={pluginContext} />
          </Suspense>
        )}
      </nav>
    </aside>
  );
}
