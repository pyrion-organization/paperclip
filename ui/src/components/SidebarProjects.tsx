import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Loader2, LogOut, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { SIDEBAR_SCROLL_RESET_STATE } from "../lib/navigation-scroll";
import { queryKeys } from "../lib/queryKeys";
import { cn, projectRouteRef } from "../lib/utils";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { resourceMembershipState, useResourceMembershipMutation, useResourceMemberships } from "../hooks/useResourceMemberships";
import { BudgetSidebarMarker } from "./BudgetSidebarMarker";
import { SidebarProjectPluginSlots } from "./SidebarProjectPluginSlots";
import { SidebarSection, type SidebarSectionRadioChoice } from "./SidebarSection";
import {
  getProjectSortModeStorageKey,
  PROJECT_SORT_MODE_UPDATED_EVENT,
  readProjectSortMode,
  type ProjectSortModeUpdatedDetail,
  type ProjectSidebarSortMode,
  writeProjectSortMode,
} from "../lib/project-order";
import type { Project } from "@paperclipai/shared";

const PROJECT_SORT_CHOICES: SidebarSectionRadioChoice[] = [
  { value: "top", label: "Top" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "recent", label: "Recent" },
];
const REORDER_POINTER_MEDIA = "(hover: hover) and (pointer: fine)";
const SidebarProjectReorderList = lazy(() =>
  import("./SidebarProjectReorderList").then((module) => ({ default: module.SidebarProjectReorderList })),
);
type SidebarIdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type ProjectItemProps = {
  activeProjectRef: string | null;
  companyId: string | null;
  companyPrefix: string | null;
  isMobile: boolean;
  isCollapsed: boolean;
  projectPluginSlotsReady: boolean;
  project: Project;
  setSidebarOpen: (open: boolean) => void;
  onLeaveProject: (project: Project) => void;
  leaving?: boolean;
  isDragging?: boolean;
};

function projectTimestamp(project: Project): number {
  const updated = new Date(project.updatedAt).getTime();
  if (Number.isFinite(updated)) return updated;
  const created = new Date(project.createdAt).getTime();
  return Number.isFinite(created) ? created : 0;
}

function sortProjects(projects: Project[], sortMode: ProjectSidebarSortMode): Project[] {
  if (sortMode === "top") return projects;
  const sorted = [...projects];
  if (sortMode === "alphabetical") {
    sorted.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
    return sorted;
  }
  sorted.sort((left, right) => {
    const timeDiff = projectTimestamp(right) - projectTimestamp(left);
    return timeDiff !== 0 ? timeDiff : left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
  return sorted;
}

function hasFineReorderPointer() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(REORDER_POINTER_MEDIA).matches;
}

function useFineReorderPointer() {
  const [matches, setMatches] = useState(hasFineReorderPointer);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(REORDER_POINTER_MEDIA);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return matches;
}

function useProjectPluginSlotsReady() {
  const [ready, setReady] = useState(() => typeof window === "undefined" || import.meta.env.MODE === "test");

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    if (typeof window === "undefined") return;

    const idleWindow = window as SidebarIdleWindow;
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setReady(true), { timeout: 2_000 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timeout = window.setTimeout(() => setReady(true), 750);
    return () => window.clearTimeout(timeout);
  }, []);

  return ready;
}

function ProjectItem({
  activeProjectRef,
  companyId,
  companyPrefix,
  isMobile,
  isCollapsed,
  projectPluginSlotsReady,
  project,
  setSidebarOpen,
  onLeaveProject,
  leaving = false,
  isDragging = false,
}: ProjectItemProps) {
  const routeRef = projectRouteRef(project);

  if (isCollapsed) {
    return (
      <NavLink
        to={`/projects/${routeRef}/issues`}
        state={SIDEBAR_SCROLL_RESET_STATE}
        onClick={() => {
          if (isMobile) setSidebarOpen(false);
        }}
        className={cn(
          "flex items-center justify-center mx-2 px-1 py-1.5 rounded text-[13px] font-medium transition-colors",
          activeProjectRef === routeRef || activeProjectRef === project.id
            ? "bg-accent text-foreground"
            : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
        )}
        title={project.name}
        aria-label={project.name}
      >
        <span
          className="shrink-0 size-3.5 rounded-sm"
          style={{ backgroundColor: project.color ?? "#6366f1" }}
        />
      </NavLink>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="group/project relative flex items-center">
        <NavLink
          to={`/projects/${routeRef}/issues`}
          state={SIDEBAR_SCROLL_RESET_STATE}
          onClick={(e) => {
            if (isDragging) {
              e.preventDefault();
              return;
            }
            if (isMobile) setSidebarOpen(false);
          }}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 pr-8 pointer-coarse:py-1 text-[13px] font-medium transition-colors",
            activeProjectRef === routeRef || activeProjectRef === project.id
              ? "bg-accent text-foreground"
              : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <span
            className="shrink-0 size-3.5 rounded-sm"
            style={{ backgroundColor: project.color ?? "#6366f1" }}
          />
          <span className="flex-1 truncate">{project.name}</span>
          {project.pauseReason === "budget" ? <BudgetSidebarMarker title="Project paused by budget" /> : null}
        </NavLink>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "absolute right-1 top-1/2 size-6 -translate-y-1/2 transition-opacity data-[state=open]:pointer-events-auto data-[state=open]:opacity-100",
                isMobile
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 group-hover/project:pointer-events-auto group-hover/project:opacity-100 group-focus-within/project:pointer-events-auto group-focus-within/project:opacity-100",
              )}
              aria-label={`Open actions for ${project.name}`}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() => {
                if (leaving) return;
                onLeaveProject(project);
              }}
              disabled={leaving}
            >
              {leaving ? <Loader2 className="size-4 motion-safe:animate-spin" /> : <LogOut className="size-4" />}
              <span>{leaving ? "Leaving..." : "Leave project"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {projectPluginSlotsReady ? (
        <SidebarProjectPluginSlots
          companyId={companyId}
          companyPrefix={companyPrefix}
          projectId={project.id}
          projectRef={routeRef}
        />
      ) : null}
    </div>
  );
}

export function SidebarProjects() {
  const [open, setOpen] = useState(true);
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { openNewProject } = useDialogActions();
  const { isMobile, isCollapsed, setSidebarOpen } = useSidebar();
  const fineReorderPointer = useFineReorderPointer();
  const projectPluginSlotsReady = useProjectPluginSlotsReady();
  const location = useLocation();

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: async () => {
      const { projectsApi } = await import("../api/projects");
      return projectsApi.list(selectedCompanyId!);
    },
    enabled: !!selectedCompanyId,
  });
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: async () => {
      const { authApi } = await import("../api/auth");
      return authApi.getSession();
    },
  });
  const membershipsQuery = useResourceMemberships(selectedCompanyId);
  const membershipMutation = useResourceMembershipMutation(selectedCompanyId);

  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const sortModeStorageKey = useMemo(() => {
    if (!selectedCompanyId) return null;
    return getProjectSortModeStorageKey(selectedCompanyId, currentUserId);
  }, [currentUserId, selectedCompanyId]);
  const [sortMode, setSortMode] = useState<ProjectSidebarSortMode>(() => {
    if (!sortModeStorageKey) return "top";
    return readProjectSortMode(sortModeStorageKey);
  });

  const visibleProjects = useMemo(
    () =>
      (projects ?? []).filter(
        (project: Project) =>
          !project.archivedAt &&
          resourceMembershipState(membershipsQuery.data, "project", project.id) !== "left",
      ),
    [membershipsQuery.data, projects],
  );
  const { orderedProjects, persistOrder } = useProjectOrder({
    projects: visibleProjects,
    companyId: selectedCompanyId,
    userId: currentUserId,
  });
  const sortedProjects = useMemo(
    () => sortProjects(orderedProjects, sortMode),
    [orderedProjects, sortMode],
  );
  const isTopMode = sortMode === "top";
  const canReorderProjects = isTopMode && !isMobile && fineReorderPointer;

  const projectMatch = location.pathname.match(/^\/(?:[^/]+\/)?projects\/([^/]+)/);
  const activeProjectRef = projectMatch?.[1] ?? null;

  useEffect(() => {
    if (!sortModeStorageKey) {
      setSortMode("top");
      return;
    }
    setSortMode(readProjectSortMode(sortModeStorageKey));
  }, [sortModeStorageKey]);

  useEffect(() => {
    if (!sortModeStorageKey) return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== sortModeStorageKey) return;
      setSortMode(readProjectSortMode(sortModeStorageKey));
    };
    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<ProjectSortModeUpdatedDetail>).detail;
      if (!detail || detail.storageKey !== sortModeStorageKey) return;
      setSortMode(detail.sortMode);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(PROJECT_SORT_MODE_UPDATED_EVENT, onCustomEvent);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PROJECT_SORT_MODE_UPDATED_EVENT, onCustomEvent);
    };
  }, [sortModeStorageKey]);

  const persistSortMode = useCallback(
    (value: string) => {
      const nextSortMode: ProjectSidebarSortMode =
        value === "alphabetical" || value === "recent" ? value : "top";
      setSortMode(nextSortMode);
      if (sortModeStorageKey) {
        writeProjectSortMode(sortModeStorageKey, nextSortMode);
      }
    },
    [sortModeStorageKey],
  );

  const leaveProject = useCallback(
    (project: Project) =>
      membershipMutation.mutate({
        resourceType: "project",
        resourceId: project.id,
        resourceName: project.name,
        state: "left",
      }),
    [membershipMutation],
  );
  const projectLeaving = useCallback(
    (project: Project) =>
      membershipMutation.isPending &&
      membershipMutation.variables?.resourceType === "project" &&
      membershipMutation.variables.resourceId === project.id,
    [membershipMutation.isPending, membershipMutation.variables],
  );

  const projectItem = (project: Project, isDragging = false) => (
    <ProjectItem
      key={project.id}
      activeProjectRef={activeProjectRef}
      companyId={selectedCompanyId}
      companyPrefix={selectedCompany?.issuePrefix ?? null}
      isMobile={isMobile}
      isCollapsed={isCollapsed}
      projectPluginSlotsReady={projectPluginSlotsReady}
      project={project}
      setSidebarOpen={setSidebarOpen}
      onLeaveProject={leaveProject}
      leaving={projectLeaving(project)}
      isDragging={isDragging}
    />
  );

  const projectList = (projectsToRender: Project[]) => (
    <div className="flex flex-col gap-0.5">
      {projectsToRender.map((project: Project) => projectItem(project))}
    </div>
  );

  return (
    <SidebarSection
      label="Projects"
      collapsible={{ open, onOpenChange: setOpen }}
      headerAction={{
        ariaLabel: "New project",
        icon: Plus,
        onClick: openNewProject,
      }}
      menu={{
        ariaLabel: "Projects section actions",
        actions: [
          { type: "item", label: "Browse projects", icon: FolderOpen, href: "/projects" },
          { type: "separator" },
        ],
        radioLabel: "Project sort",
        radioChoices: PROJECT_SORT_CHOICES,
        radioValue: sortMode,
        onRadioValueChange: persistSortMode,
      }}
    >
      {canReorderProjects ? (
        <Suspense fallback={projectList(orderedProjects)}>
          <SidebarProjectReorderList
            projects={orderedProjects}
            onReorder={persistOrder}
            projectContent={(project, state) => projectItem(project, state.isDragging)}
          />
        </Suspense>
      ) : (
        projectList(sortedProjects)
      )}
    </SidebarSection>
  );
}
