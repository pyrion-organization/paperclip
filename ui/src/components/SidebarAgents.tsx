import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  MoreHorizontal,
  Plus,
  Users,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { useToastActions } from "../context/ToastContext";
import { SIDEBAR_SCROLL_RESET_STATE } from "../lib/navigation-scroll";
import { queryKeys } from "../lib/queryKeys";
import { cn, agentRouteRef, agentUrl } from "../lib/utils";
import { useAgentOrder } from "../hooks/useAgentOrder";
import {
  AGENT_SORT_MODE_UPDATED_EVENT,
  getAgentSortModeStorageKey,
  readAgentSortMode,
  type AgentSortModeUpdatedDetail,
  type AgentSidebarSortMode,
  writeAgentSortMode,
} from "../lib/agent-order";
import { BudgetSidebarMarker } from "./BudgetSidebarMarker";
import { SidebarSection, type SidebarSectionRadioChoice } from "./SidebarSection";
import type { Agent } from "@paperclipai/shared";
import type { LiveRunForIssue } from "../api/heartbeats";

const AGENT_SORT_CHOICES: SidebarSectionRadioChoice[] = [
  { value: "top", label: "Top" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "recent", label: "Recent" },
];

const DeferredAgentIcon = lazy(() =>
  import("./AgentIcon").then((module) => ({ default: module.AgentIcon })),
);
const DeferredSidebarAgentActionsMenu = lazy(() =>
  import("./SidebarAgentActionsMenu").then((module) => ({ default: module.SidebarAgentActionsMenu })),
);

type SidebarIdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function agentTimestamp(agent: Agent, field: "lastHeartbeatAt" | "updatedAt" | "createdAt"): number {
  const raw = agent[field];
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortAgents(agents: Agent[], sortMode: AgentSidebarSortMode): Agent[] {
  if (sortMode === "top") return agents;
  const sorted = [...agents];
  if (sortMode === "alphabetical") {
    sorted.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
    return sorted;
  }
  sorted.sort((left, right) => {
    const heartbeatDiff = agentTimestamp(right, "lastHeartbeatAt") - agentTimestamp(left, "lastHeartbeatAt");
    if (heartbeatDiff !== 0) return heartbeatDiff;

    const updatedDiff = agentTimestamp(right, "updatedAt") - agentTimestamp(left, "updatedAt");
    if (updatedDiff !== 0) return updatedDiff;

    const createdDiff = agentTimestamp(right, "createdAt") - agentTimestamp(left, "createdAt");
    return createdDiff !== 0
      ? createdDiff
      : left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
  return sorted;
}

function useSidebarAgentIconsReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setReady(true);
      return;
    }

    const idleWindow = window as SidebarIdleWindow;
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setReady(true), { timeout: 2_500 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timeout = window.setTimeout(() => setReady(true), 1_000);
    return () => window.clearTimeout(timeout);
  }, []);

  return ready;
}

function SidebarAgentIcon({
  className,
  icon,
  ready,
}: {
  className?: string;
  icon: string | null | undefined;
  ready: boolean;
}) {
  const fallback = <Bot className={className} />;
  if (!ready) return fallback;
  return (
    <Suspense fallback={fallback}>
      <DeferredAgentIcon icon={icon} className={className} />
    </Suspense>
  );
}

function SidebarAgentItem({
  activeAgentId,
  activeTab,
  agent,
  agentIconsReady,
  disabled,
  isCollapsed,
  isMobile,
  onPauseResume,
  runCount,
  setSidebarOpen,
}: {
  activeAgentId: string | null;
  activeTab: string | null;
  agent: Agent;
  agentIconsReady: boolean;
  disabled: boolean;
  isCollapsed: boolean;
  isMobile: boolean;
  onPauseResume: (agent: Agent, action: "pause" | "resume") => void;
  runCount: number;
  setSidebarOpen: (open: boolean) => void;
}) {
  const routeRef = agentRouteRef(agent);
  const href = activeTab ? `${agentUrl(agent)}/${activeTab}` : agentUrl(agent);
  const editHref = `${agentUrl(agent)}/configuration`;
  const isActive = activeAgentId === routeRef;
  const isPaused = agent.status === "paused";
  const isBudgetPaused = isPaused && agent.pauseReason === "budget";
  const pauseResumeLabel = isPaused ? "Resume agent" : "Pause agent";
  const pauseResumeDisabled = disabled || agent.status === "pending_approval" || isBudgetPaused;
  const pauseResumeDisabledLabel = disabled
    ? "Updating..."
    : isBudgetPaused
      ? "Budget paused"
      : pauseResumeLabel;
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionsMenuRequested, setActionsMenuRequested] = useState(false);
  const actionsTriggerClassName = cn(
    "absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 inline-flex items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100",
    isMobile
      ? "opacity-100"
      : "pointer-events-none opacity-0 group-hover/agent:pointer-events-auto group-hover/agent:opacity-100 group-focus-within/agent:pointer-events-auto group-focus-within/agent:opacity-100",
  );
  const actionsTrigger = (
    <button
      type="button"
      className={actionsTriggerClassName}
      aria-label={`Open actions for ${agent.name}`}
      onClick={() => {
        setActionsMenuRequested(true);
        setActionsMenuOpen(true);
      }}
    >
      <MoreHorizontal className="h-3.5 w-3.5" />
    </button>
  );

  if (isCollapsed) {
    return (
      <NavLink
        to={href}
        state={SIDEBAR_SCROLL_RESET_STATE}
        title={agent.name}
        className={cn(
          "flex items-center justify-center mx-2 px-1 py-1.5 rounded text-[13px] font-medium transition-colors",
          isActive
            ? "bg-accent text-foreground"
            : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
        )}
      >
        <SidebarAgentIcon
          icon={agent.icon}
          ready={agentIconsReady}
          className="h-3.5 w-3.5 text-muted-foreground"
        />
      </NavLink>
    );
  }

  return (
    <div className="group/agent relative flex items-center">
      <NavLink
        to={href}
        state={SIDEBAR_SCROLL_RESET_STATE}
        onClick={() => {
          if (isMobile) setSidebarOpen(false);
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 pointer-coarse:py-1 pr-8 text-[13px] font-medium transition-colors",
          isActive
            ? "bg-accent text-foreground"
            : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
        )}
      >
        <SidebarAgentIcon
          icon={agent.icon}
          ready={agentIconsReady}
          className="shrink-0 h-3.5 w-3.5 text-muted-foreground"
        />
        <span className="flex-1 truncate">{agent.name}</span>
        {(agent.pauseReason === "budget" || runCount > 0) && (
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            {agent.pauseReason === "budget" ? (
              <BudgetSidebarMarker title="Agent paused by budget" />
            ) : null}
            {runCount > 0 ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
            ) : null}
            {runCount > 0 ? (
              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                {runCount} live
              </span>
            ) : null}
          </span>
        )}
      </NavLink>

      {actionsMenuRequested ? (
        <Suspense fallback={actionsTrigger}>
          <DeferredSidebarAgentActionsMenu
            editHref={editHref}
            isBudgetPaused={isBudgetPaused}
            isMobile={isMobile}
            isPaused={isPaused}
            onOpenChange={setActionsMenuOpen}
            onPauseResume={(action) => onPauseResume(agent, action)}
            open={actionsMenuOpen}
            pauseResumeDisabled={pauseResumeDisabled}
            pauseResumeDisabledLabel={pauseResumeDisabledLabel}
            setSidebarOpen={setSidebarOpen}
            triggerClassName={actionsTriggerClassName}
            triggerLabel={`Open actions for ${agent.name}`}
          />
        </Suspense>
      ) : (
        actionsTrigger
      )}
    </div>
  );
}

interface SidebarAgentsProps {
  liveRuns?: LiveRunForIssue[];
}

export function SidebarAgents({ liveRuns = [] }: SidebarAgentsProps) {
  const [open, setOpen] = useState(true);
  const [pendingAgentIds, setPendingAgentIds] = useState<Set<string>>(() => new Set());
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialogActions();
  const { isMobile, isCollapsed, setSidebarOpen } = useSidebar();
  const { pushToast } = useToastActions();
  const location = useLocation();
  const agentIconsReady = useSidebarAgentIconsReady();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: async () => {
      const { agentsApi } = await import("../api/agents");
      return agentsApi.list(selectedCompanyId!);
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

  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns) {
      counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
    }
    return counts;
  }, [liveRuns]);

  const visibleAgents = useMemo(() => {
    const filtered = (agents ?? []).filter(
      (a: Agent) => a.status !== "terminated"
    );
    return filtered;
  }, [agents]);
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const sortModeStorageKey = useMemo(() => {
    if (!selectedCompanyId) return null;
    return getAgentSortModeStorageKey(selectedCompanyId, currentUserId);
  }, [currentUserId, selectedCompanyId]);
  const [sortMode, setSortMode] = useState<AgentSidebarSortMode>(() => {
    if (!sortModeStorageKey) return "top";
    return readAgentSortMode(sortModeStorageKey);
  });
  const { orderedAgents } = useAgentOrder({
    agents: visibleAgents,
    companyId: selectedCompanyId,
    userId: currentUserId,
  });
  const sortedAgents = useMemo(
    () => sortAgents(orderedAgents, sortMode),
    [orderedAgents, sortMode],
  );

  const agentMatch = location.pathname.match(/^\/(?:[^/]+\/)?agents\/([^/]+)(?:\/([^/]+))?/);
  const activeAgentId = agentMatch?.[1] ?? null;
  const activeTab = agentMatch?.[2] ?? null;

  useEffect(() => {
    if (!sortModeStorageKey) {
      setSortMode("top");
      return;
    }
    setSortMode(readAgentSortMode(sortModeStorageKey));
  }, [sortModeStorageKey]);

  useEffect(() => {
    if (!sortModeStorageKey) return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== sortModeStorageKey) return;
      setSortMode(readAgentSortMode(sortModeStorageKey));
    };
    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<AgentSortModeUpdatedDetail>).detail;
      if (!detail || detail.storageKey !== sortModeStorageKey) return;
      setSortMode(detail.sortMode);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(AGENT_SORT_MODE_UPDATED_EVENT, onCustomEvent);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AGENT_SORT_MODE_UPDATED_EVENT, onCustomEvent);
    };
  }, [sortModeStorageKey]);

  const persistSortMode = useCallback(
    (value: string) => {
      const nextSortMode: AgentSidebarSortMode =
        value === "alphabetical" || value === "recent" ? value : "top";
      setSortMode(nextSortMode);
      if (sortModeStorageKey) {
        writeAgentSortMode(sortModeStorageKey, nextSortMode);
      }
    },
    [sortModeStorageKey],
  );

  const pauseResumeAgent = useMutation({
    mutationFn: async ({ agent, action }: { agent: Agent; action: "pause" | "resume" }) => {
      const { agentsApi } = await import("../api/agents");
      return action === "pause"
        ? agentsApi.pause(agent.id, selectedCompanyId ?? undefined)
        : agentsApi.resume(agent.id, selectedCompanyId ?? undefined);
    },
    onMutate: ({ agent }) => {
      setPendingAgentIds((current) => {
        const next = new Set(current);
        next.add(agent.id);
        return next;
      });
    },
    onSuccess: async (_agent, { agent, action }) => {
      if (selectedCompanyId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId) }),
        ]);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentRouteRef(agent)) }),
      ]);
      pushToast({
        title: action === "pause" ? "Agent paused" : "Agent resumed",
        body: agent.name,
        tone: "success",
      });
    },
    onError: (error, { agent, action }) => {
      pushToast({
        title: action === "pause" ? "Could not pause agent" : "Could not resume agent",
        body: error instanceof Error ? error.message : agent.name,
        tone: "error",
      });
    },
    onSettled: (_data, _error, { agent }) => {
      setPendingAgentIds((current) => {
        const next = new Set(current);
        next.delete(agent.id);
        return next;
      });
    },
  });

  return (
    <SidebarSection
      label="Agents"
      collapsible={{ open, onOpenChange: setOpen }}
      headerAction={{
        ariaLabel: "New agent",
        icon: Plus,
        onClick: openNewAgent,
      }}
      menu={{
        ariaLabel: "Agents section actions",
        actions: [
          { type: "item", label: "Browse agents", icon: Users, href: "/agents/all" },
          { type: "separator" },
        ],
        radioLabel: "Agent sort",
        radioChoices: AGENT_SORT_CHOICES,
        radioValue: sortMode,
        onRadioValueChange: persistSortMode,
      }}
    >
      {sortedAgents.map((agent: Agent) => {
        const runCount = liveCountByAgent.get(agent.id) ?? 0;
        return (
          <SidebarAgentItem
            key={agent.id}
            activeAgentId={activeAgentId}
            activeTab={activeTab}
            agent={agent}
            agentIconsReady={agentIconsReady}
            disabled={pendingAgentIds.has(agent.id)}
            isCollapsed={isCollapsed}
            isMobile={isMobile}
            onPauseResume={(targetAgent, action) => pauseResumeAgent.mutate({ agent: targetAgent, action })}
            runCount={runCount}
            setSidebarOpen={setSidebarOpen}
          />
        );
      })}
    </SidebarSection>
  );
}
