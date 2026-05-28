import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useLocation, useSearchParams } from "@/lib/router";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { collectLiveIssueIds } from "../lib/liveIssueIds";
import { queryKeys } from "../lib/queryKeys";
import { createIssueDetailLocationState } from "../lib/issueDetailBreadcrumb";
import { EmptyState } from "../components/EmptyState";
import { IssuesList } from "../components/IssuesList";
import { CircleDot } from "lucide-react";
import {
  ISSUES_PAGE_SIZE,
  buildIssuesSearchUrl,
  getNextIssuesPageOffset,
  mergeIssuePagesStable,
} from "./issues-utils";

const WORKSPACE_FILTER_ISSUE_LIMIT = 1000;

export function Issues() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const routerLocation = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const fetchNextPageInFlightRef = useRef(false);

  const urlSearch = searchParams.get("q") ?? "";
  const [searchOverride, setSearchOverride] = useState<{ search: string; locationSearch: string } | null>(null);
  const syncedSearch = useMemo(() => {
    if (typeof window !== "undefined" && searchOverride?.locationSearch === window.location.search) {
      return searchOverride.search;
    }
    return urlSearch;
  }, [searchOverride, urlSearch, routerLocation.search]);
  const participantAgentId = searchParams.get("participantAgentId") ?? undefined;
  const initialWorkspaces = searchParams.getAll("workspace").filter((workspaceId) => workspaceId.length > 0);
  const workspaceIdFilter = initialWorkspaces.length === 1 ? initialWorkspaces[0] : undefined;
  const handleSearchChange = useCallback((search: string) => {
    const nextUrl = buildIssuesSearchUrl(window.location.href, search);
    if (!nextUrl) {
      setSearchOverride(null);
      return;
    }
    window.history.replaceState(window.history.state, "", nextUrl);
    setSearchOverride({ search, locationSearch: window.location.search });
  }, []);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5000,
  });

  const liveIssueIds = useMemo(() => collectLiveIssueIds(liveRuns), [liveRuns]);

  const issueLinkState = useMemo(
    () =>
      createIssueDetailLocationState(
        "Issues",
        `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`,
        "issues",
      ),
    [routerLocation.pathname, routerLocation.search, routerLocation.hash],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "Issues" }]);
  }, [setBreadcrumbs]);

  const issuePageSize = workspaceIdFilter ? WORKSPACE_FILTER_ISSUE_LIMIT : ISSUES_PAGE_SIZE;

  const {
    data: issuePages,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [
      ...queryKeys.issues.list(selectedCompanyId!),
      "participant-agent",
      participantAgentId ?? "__all__",
      "workspace",
      workspaceIdFilter ?? "__all__",
      "with-routine-executions",
      "infinite",
      issuePageSize,
    ],
    queryFn: ({ pageParam }) => issuesApi.list(selectedCompanyId!, {
      participantAgentId,
      workspaceId: workspaceIdFilter,
      includeRoutineExecutions: true,
      limit: issuePageSize,
      offset: pageParam,
      sortField: "updated",
      sortDir: "desc",
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      getNextIssuesPageOffset(lastPage.length, lastPageParam, issuePageSize),
    enabled: !!selectedCompanyId,
    placeholderData: (previousData) => previousData,
  });

  const issues = useMemo(() => mergeIssuePagesStable(issuePages?.pages ?? []), [issuePages]);

  const hideCancelledIssues = useMutation({
    mutationFn: async () => {
      const hiddenAt = new Date().toISOString();
      const cancelledIssues = (issues ?? []).filter(
        (issue): issue is Issue => issue.status === "cancelled" && issue.hiddenAt == null,
      );
      await Promise.all(cancelledIssues.map((issue) => issuesApi.update(issue.id, { hiddenAt })));
      return cancelledIssues.length;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  const hasMoreServerIssues = syncedSearch.trim().length === 0
    && hasNextPage === true;
  const loadMoreServerIssues = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || fetchNextPageInFlightRef.current) return;
    fetchNextPageInFlightRef.current = true;
    void fetchNextPage({ cancelRefetch: false }).finally(() => {
      fetchNextPageInFlightRef.current = false;
    });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={CircleDot} message="Select a company to view issues." />;
  }

  return (
    <IssuesList
      issues={issues ?? []}
      isLoading={isLoading}
      isLoadingMoreIssues={isFetchingNextPage}
      error={error as Error | null}
      agents={agents}
      projects={projects}
      liveIssueIds={liveIssueIds}
      viewStateKey="paperclip:issues-view"
      issueLinkState={issueLinkState}
      initialAssignees={searchParams.get("assignee") ? [searchParams.get("assignee")!] : undefined}
      initialWorkspaces={initialWorkspaces.length > 0 ? initialWorkspaces : undefined}
      initialSearch={syncedSearch}
      onSearchChange={handleSearchChange}
      enableRoutineVisibilityFilter
      onHideCancelledIssues={() => hideCancelledIssues.mutate()}
      hideCancelledIssuesPending={hideCancelledIssues.isPending}
      hasMoreIssues={hasMoreServerIssues}
      onLoadMoreIssues={loadMoreServerIssues}
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
      searchFilters={participantAgentId || workspaceIdFilter ? { participantAgentId, workspaceId: workspaceIdFilter } : undefined}
    />
  );
}
