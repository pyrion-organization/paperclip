import { lazy, Suspense, useEffect, useState } from "react";
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
import { SidebarSection } from "./SidebarSection";
import { useSidebar } from "../context/SidebarContext";

const SidebarProjects = lazy(() =>
  import("./SidebarProjects").then((module) => ({ default: module.SidebarProjects })),
);
const SidebarAgents = lazy(() =>
  import("./SidebarAgents").then((module) => ({ default: module.SidebarAgents })),
);
const SidebarWorkPluginExtensions = lazy(() =>
  import("./SidebarPluginExtensions").then((module) => ({ default: module.SidebarWorkPluginExtensions })),
);
const SidebarPanelPluginExtensions = lazy(() =>
  import("./SidebarPluginExtensions").then((module) => ({ default: module.SidebarPanelPluginExtensions })),
);

type SidebarIdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type SidebarPluginContext = {
  companyId: string | null;
  companyPrefix: string | null;
};

interface SidebarDeferredSectionsProps {
  pluginContext: SidebarPluginContext;
  showWorkspacesLink: boolean;
}

function useSidebarPluginsReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setReady(true);
      return;
    }

    const idleWindow = window as SidebarIdleWindow;
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timeout = window.setTimeout(() => setReady(true), 500);
    return () => window.clearTimeout(timeout);
  }, []);

  return ready;
}

export function SidebarDeferredSections({
  pluginContext,
  showWorkspacesLink,
}: SidebarDeferredSectionsProps) {
  const { isCollapsed } = useSidebar();
  const sidebarPluginsReady = useSidebarPluginsReady();

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
        {sidebarPluginsReady ? (
          <Suspense fallback={null}>
            <SidebarWorkPluginExtensions context={pluginContext} />
          </Suspense>
        ) : null}
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

      {!isCollapsed && sidebarPluginsReady ? (
        <Suspense fallback={null}>
          <SidebarPanelPluginExtensions context={pluginContext} />
        </Suspense>
      ) : null}
    </>
  );
}
