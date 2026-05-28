import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { MetricCard } from "../components/MetricCard";
import { EmptyState } from "../components/EmptyState";

import { formatCents } from "../lib/currency";
import { Bot, CircleDot, DollarSign, ShieldCheck, LayoutDashboard, PauseCircle } from "lucide-react";
import { PageSkeleton } from "../components/PageSkeleton";
import type { Agent } from "@paperclipai/shared";

const ActiveAgentsPanel = lazy(() =>
  import("../components/ActiveAgentsPanel").then(({ ActiveAgentsPanel }) => ({ default: ActiveAgentsPanel })),
);
const ActivityRow = lazy(() =>
  import("../components/ActivityRow").then(({ ActivityRow }) => ({ default: ActivityRow })),
);
const DashboardCharts = lazy(() =>
  import("../components/DashboardCharts").then(({ DashboardCharts }) => ({ default: DashboardCharts })),
);
const DashboardRecentTasks = lazy(() =>
  import("../components/DashboardRecentTasks").then(({ DashboardRecentTasks }) => ({ default: DashboardRecentTasks })),
);
const DashboardPluginSlotOutlet = lazy(() =>
  import("@/plugins/LazyPluginSlotOutlet").then(({ LazyPluginSlotOutlet }) => ({ default: LazyPluginSlotOutlet })),
);

const DASHBOARD_ACTIVITY_LIMIT = 10;

type DashboardIdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type DashboardCompanyUserRecord = {
  principalId: string;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
};

function dashboardUserLabel(member: DashboardCompanyUserRecord): string {
  const name = member.user?.name?.trim();
  if (name) return name;
  const email = member.user?.email?.trim();
  if (email) return email;
  if (member.principalId === "local-board") return "Board";
  return member.principalId.slice(0, 5);
}

function buildDashboardUserProfileMap(members: DashboardCompanyUserRecord[] | null | undefined) {
  const profiles = new Map<string, { label: string; image: string | null }>();
  for (const member of members ?? []) {
    profiles.set(member.principalId, {
      label: dashboardUserLabel(member),
      image: member.user?.image ?? null,
    });
  }
  return profiles;
}

function useDeferredDashboardDetailsReady() {
  const [ready, setReady] = useState(() => typeof window === "undefined");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const idleWindow = window as DashboardIdleWindow;
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setReady(true), { timeout: 1_500 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timeout = window.setTimeout(() => setReady(true), 350);
    return () => window.clearTimeout(timeout);
  }, []);

  return ready;
}

export function Dashboard() {
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();
  const dashboardDetailsReady = useDeferredDashboardDetailsReady();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: async () => {
      const { agentsApi } = await import("../api/agents");
      return agentsApi.list(selectedCompanyId!);
    },
    enabled: dashboardDetailsReady && !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Dashboard" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: [...queryKeys.activity(selectedCompanyId!), { limit: DASHBOARD_ACTIVITY_LIMIT }],
    queryFn: async () => {
      const { activityApi } = await import("../api/activity");
      return activityApi.list(selectedCompanyId!, { limit: DASHBOARD_ACTIVITY_LIMIT });
    },
    enabled: dashboardDetailsReady && !!selectedCompanyId,
  });

  const { data: companyMembers } = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!),
    queryFn: async () => {
      const { accessApi } = await import("../api/access");
      return accessApi.listUserDirectory(selectedCompanyId!);
    },
    enabled: dashboardDetailsReady && !!selectedCompanyId,
  });

  const userProfileMap = useMemo(
    () => buildDashboardUserProfileMap(companyMembers?.users),
    [companyMembers?.users],
  );

  const recentIssues = data?.recentIssues ?? [];
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 10), [activity]);

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of recentIssues) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    return map;
  }, [recentIssues, agents]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of recentIssues) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [recentIssues]);

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome to Paperclip. Set up your first company and agent to get started."
          action="Get Started"
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message="Create or select a company to view the dashboard." />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (!data) {
    return error ? (
      <p className="text-sm text-destructive">{error.message}</p>
    ) : (
      <PageSkeleton variant="dashboard" />
    );
  }

  const agentTotal = data.agents.active + data.agents.running + data.agents.paused + data.agents.error;
  const hasNoAgents = agentTotal === 0;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {hasNoAgents && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
          <div className="flex items-center gap-2.5">
            <Bot className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-900 dark:text-amber-100">
              You have no agents.
            </p>
          </div>
          <button type="button"
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })}
            className="text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline underline-offset-2 shrink-0"
          >
            Create one here
          </button>
        </div>
      )}

      {dashboardDetailsReady ? (
        <Suspense fallback={null}>
          <ActiveAgentsPanel companyId={selectedCompanyId!} />
        </Suspense>
      ) : null}

      {data && (
        <>
          {data.budgets.activeIncidents > 0 ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-red-500/20 bg-[linear-gradient(180deg,rgba(255,80,80,0.12),rgba(255,255,255,0.02))] px-4 py-3">
              <div className="flex items-start gap-2.5">
                <PauseCircle className="mt-0.5 size-4 shrink-0 text-red-300" />
                <div>
                  <p className="text-sm font-medium text-red-50">
                    {data.budgets.activeIncidents} active budget incident{data.budgets.activeIncidents === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-red-100/70">
                    {data.budgets.pausedAgents} agents paused · {data.budgets.pausedProjects} projects paused · {data.budgets.pendingApprovals} pending budget approvals
                  </p>
                </div>
              </div>
              <Link to="/costs" className="text-sm underline underline-offset-2 text-red-100">
                Open budgets
              </Link>
            </div>
          ) : null}

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-1 sm:gap-2">
            <MetricCard
              icon={Bot}
              value={data.agents.active + data.agents.running + data.agents.paused + data.agents.error}
              label="Agents Enabled"
              to="/agents"
              description={
                <span>
                  {data.agents.running} running{", "}
                  {data.agents.paused} paused{", "}
                  {data.agents.error} errors
                </span>
              }
            />
            <MetricCard
              icon={CircleDot}
              value={data.tasks.inProgress}
              label="Tasks In Progress"
              to="/issues"
              description={
                <span>
                  {data.tasks.open} open{", "}
                  {data.tasks.blocked} blocked
                </span>
              }
            />
            <MetricCard
              icon={DollarSign}
              value={formatCents(data.costs.monthSpendCents)}
              label="Month Spend"
              to="/costs"
              description={
                <span>
                  {data.costs.monthBudgetCents > 0
                    ? `${data.costs.monthUtilizationPercent}% of ${formatCents(data.costs.monthBudgetCents)} budget`
                    : "Unlimited budget"}
                </span>
              }
            />
            <MetricCard
              icon={ShieldCheck}
              value={data.pendingApprovals + data.budgets.pendingApprovals}
              label="Pending Approvals"
              to="/approvals"
              description={
                <span>
                  {data.budgets.pendingApprovals > 0
                    ? `${data.budgets.pendingApprovals} budget overrides awaiting board review`
                    : "Awaiting board review"}
                </span>
              }
            />
          </div>

          {dashboardDetailsReady ? (
            <Suspense fallback={<div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden="true" />}>
              <DashboardCharts issueActivity={data.issueActivity} runActivity={data.runActivity} />
            </Suspense>
          ) : null}

          {dashboardDetailsReady ? (
            <Suspense fallback={null}>
              <DashboardPluginSlotOutlet
                slotTypes={["dashboardWidget"]}
                context={{ companyId: selectedCompanyId }}
                className="grid gap-4 md:grid-cols-2"
                itemClassName="rounded-lg border bg-card p-4 shadow-sm"
              />
            </Suspense>
          ) : null}

          <div className="grid md:grid-cols-2 gap-4">
            {/* Recent Activity */}
            {dashboardDetailsReady && recentActivity.length > 0 && (
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Recent Activity
                </h3>
                <div className="border border-border divide-y divide-border overflow-hidden">
                  <Suspense fallback={null}>
                    {recentActivity.map((event) => (
                      <ActivityRow
                        key={event.id}
                        event={event}
                        agentMap={agentMap}
                        userProfileMap={userProfileMap}
                        entityNameMap={entityNameMap}
                        entityTitleMap={entityTitleMap}
                        className={animatedActivityIds.has(event.id) ? "activity-row-enter" : undefined}
                      />
                    ))}
                  </Suspense>
                </div>
              </div>
            )}

            {dashboardDetailsReady ? (
              <Suspense fallback={<div className="min-w-0" aria-hidden="true" />}>
                <DashboardRecentTasks recentIssues={recentIssues} />
              </Suspense>
            ) : null}
          </div>

        </>
      )}
    </div>
  );
}
