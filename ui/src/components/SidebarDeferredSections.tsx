import { lazy, Suspense } from "react";
import {
  Activity,
  Boxes,
  CalendarDays,
  CircleDot,
  DollarSign,
  FileText,
  GitBranch,
  History,
  Network,
  Repeat,
  Settings,
  Target,
  Users,
} from "lucide-react";
import { SidebarNavItem } from "./SidebarNavItem";
import {
  SidebarPanelPluginExtensions,
  SidebarWorkPluginExtensions,
} from "./SidebarPluginExtensions";
import { SidebarSection } from "./SidebarSection";
import { useSidebar } from "../context/SidebarContext";

const SidebarProjects = lazy(() =>
  import("./SidebarProjects").then((module) => ({ default: module.SidebarProjects })),
);
const SidebarAgents = lazy(() =>
  import("./SidebarAgents").then((module) => ({ default: module.SidebarAgents })),
);
type SidebarPluginContext = {
  companyId: string | null;
  companyPrefix: string | null;
};

interface SidebarDeferredSectionsProps {
  pluginContext: SidebarPluginContext;
  showWorkspacesLink: boolean;
}

export function SidebarDeferredSections({
  pluginContext,
  showWorkspacesLink,
}: SidebarDeferredSectionsProps) {
  const { isCollapsed } = useSidebar();

  return (
    <>
      <SidebarSection label="Work">
        <SidebarNavItem to="/issues" label="Issues" icon={CircleDot} />
        <SidebarNavItem to="/calendar" label="Calendar" icon={CalendarDays} />
        <SidebarNavItem to="/routines" label="Routines" icon={Repeat} />
        <SidebarNavItem to="/goals" label="Goals" icon={Target} />
        {showWorkspacesLink ? (
          <SidebarNavItem to="/workspaces" label="Workspaces" icon={GitBranch} />
        ) : null}
        <SidebarWorkPluginExtensions context={pluginContext} />
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
        <SidebarPanelPluginExtensions context={pluginContext} />
      )}
    </>
  );
}
