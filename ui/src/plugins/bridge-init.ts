/**
 * Plugin bridge initialization.
 *
 * Registers the host's React instances and bridge hook implementations
 * on a global object so that the plugin module loader can inject them
 * into plugin UI bundles at load time.
 *
 * Call `initPluginBridge()` once before any plugin UI modules are loaded.
 *
 * @see PLUGIN_SPEC.md §19.0.1 — Plugin UI SDK
 * @see PLUGIN_SPEC.md §19.0.2 — Bundle Isolation
 */

import {
  usePluginData,
  usePluginAction,
  useHostContext,
  useHostLocation,
  useHostNavigation,
  usePluginStream,
  usePluginToast,
} from "./bridge.js";
import { Component, createElement, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";
import type { FileTreeProps as HostFileTreeProps } from "@/components/FileTree";
import type { ManagedRoutinesListProps } from "@/components/ManagedRoutinesList";
import { AgentIcon } from "@/components/AgentIcon";
import { InlineEntitySelector, type InlineEntityOption } from "@/components/InlineEntitySelector";
import { accessApi } from "@/api/access";
import { agentsApi } from "@/api/agents";
import { authApi } from "@/api/auth";
import { heartbeatsApi } from "@/api/heartbeats";
import { issuesApi } from "@/api/issues";
import { projectsApi } from "@/api/projects";
import {
  buildCompanyUserInlineOptions,
} from "@/lib/company-members";
import { collectLiveIssueIds } from "@/lib/liveIssueIds";
import { useProjectOrder } from "@/hooks/useProjectOrder";
import {
  assigneeValueFromSelection,
  currentUserAssigneeOption,
  parseAssigneeValue,
} from "@/lib/assignees";
import { queryKeys } from "@/lib/queryKeys";
import {
  getRecentAssigneeSelectionIds,
  sortAgentsByRecency,
  trackRecentAssignee,
  trackRecentAssigneeUser,
} from "@/lib/recent-assignees";
import { getRecentProjectIds, trackRecentProject } from "@/lib/recent-projects";

// ---------------------------------------------------------------------------
// Global bridge registry
// ---------------------------------------------------------------------------

/**
 * The global bridge registry shape.
 *
 * This is placed on `globalThis.__paperclipPluginBridge__` and consumed by
 * the plugin module loader to provide implementations for external imports.
 */
export interface PluginBridgeRegistry {
  react: unknown;
  reactDom: unknown;
  sdkUi: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line no-var
  var __paperclipPluginBridge__: PluginBridgeRegistry | undefined;
}

type PluginFileTreePathCollection = ReadonlySet<string> | readonly string[];

type PluginFileTreeProps = Omit<
  HostFileTreeProps,
  | "expandedDirs"
  | "checkedFiles"
  | "renderFileExtra"
  | "fileRowClassName"
  | "selectedFile"
  | "showCheckboxes"
  | "onToggleDir"
  | "onSelectFile"
> & {
  selectedFile?: string | null;
  expandedPaths?: PluginFileTreePathCollection;
  checkedPaths?: PluginFileTreePathCollection;
  showCheckboxes?: boolean;
  onToggleDir?: (path: string) => void;
  onSelectFile?: (path: string) => void;
};

function toPathSet(paths?: PluginFileTreePathCollection | null): Set<string> {
  return new Set(paths ?? []);
}

function PluginSdkFileTree({
  expandedPaths,
  checkedPaths,
  selectedFile = null,
  showCheckboxes = false,
  onToggleDir,
  onSelectFile,
  ...props
}: PluginFileTreeProps) {
  const [FileTreeComponent, setFileTreeComponent] = useState<ComponentType<HostFileTreeProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/components/FileTree").then((module) => {
      if (!cancelled) setFileTreeComponent(() => module.FileTree);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!FileTreeComponent) {
    return createElement("div", { className: "text-sm text-muted-foreground" }, "Loading files...");
  }

  return createElement(FileTreeComponent, {
    ...props,
    selectedFile,
    expandedDirs: toPathSet(expandedPaths),
    checkedFiles: checkedPaths ? toPathSet(checkedPaths) : undefined,
    showCheckboxes,
    onToggleDir: onToggleDir ?? (() => undefined),
    onSelectFile: onSelectFile ?? (() => undefined),
  });
}

type PluginMarkdownBlockProps = {
  content: string;
  className?: string;
  enableWikiLinks?: boolean;
  wikiLinkRoot?: string;
  resolveWikiLinkHref?: (target: string, label: string) => string | null | undefined;
};

function PluginSdkMarkdownBlock({
  content,
  className,
  enableWikiLinks,
  wikiLinkRoot,
  resolveWikiLinkHref,
}: PluginMarkdownBlockProps) {
  const [MarkdownBodyComponent, setMarkdownBodyComponent] = useState<ComponentType<Record<string, unknown>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/components/MarkdownBody").then((module) => {
      if (!cancelled) {
        setMarkdownBodyComponent(() => module.MarkdownBody as unknown as ComponentType<Record<string, unknown>>);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!MarkdownBodyComponent) {
    return createElement("div", { className: `whitespace-pre-wrap ${className ?? ""}`.trim() }, content);
  }

  return createElement(MarkdownBodyComponent, {
    className,
    softBreaks: false,
    enableWikiLinks,
    wikiLinkRoot,
    resolveWikiLinkHref,
  }, content);
}

type PluginMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  onBlur?: () => void;
  bordered?: boolean;
  readOnly?: boolean;
  onSubmit?: () => void;
};

type PluginIssuesListFilters = {
  status?: string;
  projectId?: string;
  parentId?: string;
  assigneeAgentId?: string;
  participantAgentId?: string;
  assigneeUserId?: string;
  labelId?: string;
  workspaceId?: string;
  executionWorkspaceId?: string;
  originKind?: string;
  originKindPrefix?: string;
  originId?: string;
  descendantOf?: string;
  includeRoutineExecutions?: boolean;
};

type PluginIssuesListProps = {
  companyId: string | null;
  projectId?: string | null;
  filters?: PluginIssuesListFilters;
  viewStateKey?: string;
  initialSearch?: string;
  createIssueLabel?: string;
  searchWithinLoadedIssues?: boolean;
};

type PluginAssigneePickerSelection = {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
};

type PluginAssigneePickerProps = {
  companyId?: string | null;
  value: string;
  onChange: (value: string, selection: PluginAssigneePickerSelection) => void;
  placeholder?: string;
  noneLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  includeUsers?: boolean;
  includeTerminatedAgents?: boolean;
  className?: string;
  onConfirm?: () => void;
};

type PluginProjectPickerProps = {
  companyId?: string | null;
  value: string;
  onChange: (projectId: string) => void;
  placeholder?: string;
  noneLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  includeArchived?: boolean;
  className?: string;
  onConfirm?: () => void;
};

function PluginSdkMarkdownEditor(props: PluginMarkdownEditorProps) {
  const [Editor, setEditor] = useState<ComponentType<PluginMarkdownEditorProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/components/MarkdownEditor").then((module) => {
      if (!cancelled) setEditor(() => module.MarkdownEditor as ComponentType<PluginMarkdownEditorProps>);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (Editor) return createElement(Editor, props);

  return createElement("textarea", {
    className: props.className,
    value: props.value,
    placeholder: props.placeholder,
    readOnly: props.readOnly,
    onBlur: props.onBlur,
    onChange: (event) => props.onChange((event.currentTarget as HTMLTextAreaElement).value),
  });
}

function compactIssueFilters(filters: PluginIssuesListFilters): PluginIssuesListFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) =>
      value !== undefined && value !== null && value !== "" && value !== false,
    ),
  ) as PluginIssuesListFilters;
}

function PluginSdkIssuesList({
  companyId,
  projectId = null,
  filters,
  viewStateKey = "paperclip:plugin-issues-view",
  initialSearch,
  createIssueLabel,
  searchWithinLoadedIssues = true,
}: PluginIssuesListProps) {
  const queryClient = useQueryClient();
  const [IssuesListComponent, setIssuesListComponent] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const issueFilters = useMemo(
    () => compactIssueFilters({
      ...(filters ?? {}),
      projectId: filters?.projectId ?? projectId ?? undefined,
    }),
    [filters, projectId],
  );
  const originKindPrefix = issueFilters.originKindPrefix ?? null;
  const resolvedProjectId = issueFilters.projectId ?? projectId ?? null;
  const issuesQueryKey = useMemo(
    () => ["plugins", "sdk-ui", "issues-list", companyId ?? "__no-company__", issueFilters] as const,
    [companyId, issueFilters],
  );

  useEffect(() => {
    let cancelled = false;
    import("@/components/IssuesList").then((module) => {
      if (!cancelled) {
        setIssuesListComponent(() => module.IssuesList as unknown as ComponentType<Record<string, unknown>>);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId ?? "__no-company__"),
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
  });
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(companyId ?? "__no-company__"),
    queryFn: () => projectsApi.list(companyId!),
    enabled: !!companyId,
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId ?? "__no-company__"),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId!),
    enabled: !!companyId,
    refetchInterval: 5000,
  });
  const liveIssueIds = useMemo(() => collectLiveIssueIds(liveRuns), [liveRuns]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: issuesQueryKey,
    queryFn: () => issuesApi.list(companyId!, issueFilters),
    enabled: !!companyId,
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      if (!companyId) return;
      queryClient.invalidateQueries({ queryKey: ["plugins", "sdk-ui", "issues-list", companyId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
      if (resolvedProjectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, resolvedProjectId) });
        if (originKindPrefix) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.issues.listPluginOperationsByProject(companyId, resolvedProjectId, originKindPrefix),
          });
        }
      }
    },
  });

  if (!companyId) {
    return createElement("div", { className: "text-sm text-muted-foreground" }, "Select a company to view issues.");
  }

  if (!IssuesListComponent) {
    return createElement("div", { className: "text-sm text-muted-foreground" }, "Loading issues...");
  }

  return createElement(IssuesListComponent, {
    issues: issues ?? [],
    isLoading,
    error: error as Error | null,
    agents,
    projects,
    liveIssueIds,
    projectId: resolvedProjectId ?? undefined,
    viewStateKey,
    initialSearch,
    createIssueLabel,
    searchWithinLoadedIssues,
    onUpdateIssue: (id: string, data: Record<string, unknown>) => updateIssue.mutate({ id, data }),
  });
}

function PluginSdkManagedRoutinesList(props: ManagedRoutinesListProps) {
  const [ManagedRoutinesListComponent, setManagedRoutinesListComponent] = useState<ComponentType<ManagedRoutinesListProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/components/ManagedRoutinesList").then((module) => {
      if (!cancelled) setManagedRoutinesListComponent(() => module.ManagedRoutinesList);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ManagedRoutinesListComponent) {
    return createElement("div", { className: "text-sm text-muted-foreground" }, "Loading routines...");
  }

  return createElement(ManagedRoutinesListComponent, props);
}

function PluginSdkAssigneePicker({
  companyId,
  value,
  onChange,
  placeholder = "Assignee",
  noneLabel = "No assignee",
  searchPlaceholder = "Search assignees...",
  emptyMessage = "No assignees found.",
  includeUsers = true,
  includeTerminatedAgents = false,
  className,
  onConfirm,
}: PluginAssigneePickerProps) {
  const hostContext = useHostContext();
  const resolvedCompanyId = companyId ?? hostContext.companyId ?? null;
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: includeUsers,
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(resolvedCompanyId ?? "__no-company__"),
    queryFn: () => agentsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
  });
  const { data: companyMembers } = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(resolvedCompanyId ?? "__no-company__"),
    queryFn: () => accessApi.listUserDirectory(resolvedCompanyId!),
    enabled: !!resolvedCompanyId && includeUsers,
  });
  const recentAssigneeSelectionIds = useMemo(() => getRecentAssigneeSelectionIds(), []);
  const recentAssigneeIds = useMemo(
    () => recentAssigneeSelectionIds
      .map((id) => id.startsWith("agent:") ? id.slice("agent:".length) : null)
      .filter((id): id is string => Boolean(id)),
    [recentAssigneeSelectionIds],
  );
  const sortedAgents = useMemo(
    () => sortAgentsByRecency(
      (agents ?? []).filter((agent) => includeTerminatedAgents || agent.status !== "terminated"),
      recentAssigneeIds,
    ),
    [agents, includeTerminatedAgents, recentAssigneeIds],
  );
  const options = useMemo<InlineEntityOption[]>(
    () => [
      ...(includeUsers ? currentUserAssigneeOption(currentUserId) : []),
      ...(includeUsers
        ? buildCompanyUserInlineOptions(companyMembers?.users, { excludeUserIds: [currentUserId] })
        : []),
      ...sortedAgents.map((agent) => ({
        id: assigneeValueFromSelection({ assigneeAgentId: agent.id }),
        label: agent.name,
        searchText: `${agent.name} ${agent.role} ${agent.title ?? ""}`,
      })),
    ],
    [companyMembers?.users, currentUserId, includeUsers, sortedAgents],
  );
  const selectedAssignee = parseAssigneeValue(value);
  const selectedAgent = selectedAssignee.assigneeAgentId
    ? sortedAgents.find((agent) => agent.id === selectedAssignee.assigneeAgentId)
    : null;

  return createElement(InlineEntitySelector, {
    value,
    options,
    recentOptionIds: recentAssigneeSelectionIds,
    placeholder,
    noneLabel,
    searchPlaceholder,
    emptyMessage,
    className,
    onConfirm,
    onChange: (nextValue: string) => {
      const selection = parseAssigneeValue(nextValue);
      if (selection.assigneeAgentId) trackRecentAssignee(selection.assigneeAgentId);
      if (selection.assigneeUserId) trackRecentAssigneeUser(selection.assigneeUserId);
      onChange(nextValue, selection);
    },
    renderTriggerValue: (option: InlineEntityOption | null) => {
      if (!option) return createElement("span", { className: "text-muted-foreground" }, placeholder);
      if (selectedAgent) {
        return createElement(
          FragmentSafe,
          null,
          createElement(AgentIcon, { icon: selectedAgent.icon, className: "size-3.5 shrink-0 text-muted-foreground" }),
          createElement("span", { className: "truncate" }, option.label),
        );
      }
      return createElement("span", { className: "truncate" }, option.label);
    },
    renderOption: (option: InlineEntityOption) => {
      if (!option.id) return createElement("span", { className: "truncate" }, option.label);
      const selection = parseAssigneeValue(option.id);
      const agent = selection.assigneeAgentId
        ? sortedAgents.find((entry) => entry.id === selection.assigneeAgentId)
        : null;
      return createElement(
        FragmentSafe,
        null,
        agent
          ? createElement(AgentIcon, { icon: agent.icon, className: "size-3.5 shrink-0 text-muted-foreground" })
          : createElement(User, { className: "size-3.5 shrink-0 text-muted-foreground" }),
        createElement("span", { className: "truncate" }, option.label),
      );
    },
  });
}

function PluginSdkProjectPicker({
  companyId,
  value,
  onChange,
  placeholder = "Project",
  noneLabel = "No project",
  searchPlaceholder = "Search projects...",
  emptyMessage = "No projects found.",
  includeArchived = false,
  className,
  onConfirm,
}: PluginProjectPickerProps) {
  const hostContext = useHostContext();
  const resolvedCompanyId = companyId ?? hostContext.companyId ?? null;
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(resolvedCompanyId ?? "__no-company__"),
    queryFn: () => projectsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
  });
  const visibleProjects = useMemo(
    () => (projects ?? []).filter((project) => includeArchived || !project.archivedAt),
    [includeArchived, projects],
  );
  const { orderedProjects } = useProjectOrder({
    projects: visibleProjects,
    companyId: resolvedCompanyId,
    userId: currentUserId,
  });
  const recentProjectIds = useMemo(() => getRecentProjectIds(), []);
  const options = useMemo<InlineEntityOption[]>(
    () => orderedProjects.map((project) => ({
      id: project.id,
      label: project.name,
      searchText: project.description ?? "",
    })),
    [orderedProjects],
  );
  const selectedProject = orderedProjects.find((project) => project.id === value) ?? null;

  return createElement(InlineEntitySelector, {
    value,
    options,
    recentOptionIds: recentProjectIds,
    placeholder,
    noneLabel,
    searchPlaceholder,
    emptyMessage,
    className,
    onConfirm,
    onChange: (nextProjectId: string) => {
      if (nextProjectId) trackRecentProject(nextProjectId);
      onChange(nextProjectId);
    },
    renderTriggerValue: (option: InlineEntityOption | null) => {
      if (!option || !selectedProject) {
        return createElement("span", { className: "text-muted-foreground" }, placeholder);
      }
      return createElement(
        FragmentSafe,
        null,
        createElement("span", {
          className: "size-3.5 shrink-0 rounded-sm",
          style: { backgroundColor: selectedProject.color ?? "#6366f1" },
        }),
        createElement("span", { className: "truncate" }, option.label),
      );
    },
    renderOption: (option: InlineEntityOption) => {
      if (!option.id) return createElement("span", { className: "truncate" }, option.label);
      const project = orderedProjects.find((entry) => entry.id === option.id);
      return createElement(
        FragmentSafe,
        null,
        createElement("span", {
          className: "size-3.5 shrink-0 rounded-sm",
          style: { backgroundColor: project?.color ?? "#6366f1" },
        }),
        createElement("span", { className: "truncate" }, option.label),
      );
    },
  });
}

function FragmentSafe({ children }: { children?: ReactNode }) {
  return createElement("span", { className: "contents" }, children);
}

type PluginStatusBadgeProps = {
  label: string;
  status: "ok" | "warning" | "error" | "info" | "pending";
};

function PluginSdkStatusBadge({ label, status }: PluginStatusBadgeProps) {
  const className = {
    ok: "border-emerald-300 bg-emerald-50 text-emerald-700",
    warning: "border-amber-300 bg-amber-50 text-amber-800",
    error: "border-red-300 bg-red-50 text-red-700",
    info: "border-slate-300 bg-slate-50 text-slate-700",
    pending: "border-slate-300 bg-slate-50 text-slate-600",
  }[status];
  return createElement(
    "span",
    { className: `inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}` },
    label,
  );
}

type PluginDataTableColumn = {
  key: string;
  header: string;
  render?: (value: unknown, row: Record<string, unknown>) => ReactNode;
  width?: string;
};

type PluginDataTableProps = {
  columns: PluginDataTableColumn[];
  rows: Array<Record<string, unknown> & { id?: string }>;
  loading?: boolean;
  emptyMessage?: string;
};

function PluginSdkDataTable({ columns, rows, loading, emptyMessage = "No rows." }: PluginDataTableProps) {
  if (loading) return createElement("div", { className: "text-sm text-muted-foreground" }, "Loading...");
  if (!rows.length) return createElement("div", { className: "text-sm text-muted-foreground" }, emptyMessage);
  const gridColumns = columns.map((column) => column.width ?? "minmax(0, 1fr)").join(" ");
  return createElement(
    "div",
    { className: "overflow-hidden rounded-md border" },
    createElement(
      "div",
      {
        className: "hidden border-b bg-muted/35 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid md:[grid-template-columns:var(--plugin-grid-cols)]",
        style: { "--plugin-grid-cols": gridColumns },
      },
      columns.map((column) => createElement("div", { key: column.key }, column.header)),
    ),
    createElement(
      "div",
      { className: "divide-y" },
      rows.map((row, index) => createElement(
        "div",
        {
          key: String(row.id ?? index),
          className: "grid gap-2 px-3 py-3 md:items-center md:[grid-template-columns:var(--plugin-grid-cols)]",
          style: { "--plugin-grid-cols": gridColumns },
        },
        columns.map((column) => createElement(
          "div",
          { key: column.key, className: "min-w-0 text-sm" },
          createElement("div", { className: "mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:hidden" }, column.header),
          column.render ? column.render(row[column.key], row) : String(row[column.key] ?? ""),
        )),
      )),
    ),
  );
}

type PluginKeyValueListProps = {
  pairs: Array<{ label: string; value: ReactNode }>;
};

type PluginTimeseriesDataPoint = {
  timestamp: string;
  value: number;
  label?: string;
};

type PluginTimeseriesChartProps = {
  data: PluginTimeseriesDataPoint[];
  title?: string;
  yLabel?: string;
  type?: "line" | "bar";
  height?: number;
  loading?: boolean;
};

type PluginActionBarItem = {
  label: string;
  actionKey: string;
  params?: Record<string, unknown>;
  variant?: "default" | "primary" | "destructive";
  confirm?: boolean;
  confirmMessage?: string;
};

type PluginActionBarProps = {
  actions: PluginActionBarItem[];
  onSuccess?: (actionKey: string, result: unknown) => void;
  onError?: (actionKey: string, error: unknown) => void;
};

type PluginLogViewEntry = {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  meta?: Record<string, unknown>;
};

type PluginLogViewProps = {
  entries: PluginLogViewEntry[];
  maxHeight?: string;
  autoScroll?: boolean;
  loading?: boolean;
};

function PluginSdkKeyValueList({ pairs }: PluginKeyValueListProps) {
  return createElement(
    "dl",
    { className: "grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]" },
    pairs.flatMap((pair) => [
      createElement("dt", { key: `${pair.label}:label`, className: "text-muted-foreground" }, pair.label),
      createElement("dd", { key: `${pair.label}:value`, className: "min-w-0" }, pair.value),
    ]),
  );
}

function PluginSdkTimeseriesChart({
  data,
  title,
  yLabel,
  type = "line",
  height = 200,
  loading,
}: PluginTimeseriesChartProps) {
  if (loading) return createElement("div", { className: "text-sm text-muted-foreground" }, "Loading...");
  if (!data.length) return createElement("div", { className: "text-sm text-muted-foreground" }, "No data.");

  const width = 600;
  const padding = 24;
  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const points = data.map((point, index) => {
    const x = padding + xStep * index;
    const y = padding + ((max - point.value) / range) * (height - padding * 2);
    return { x, y, point };
  });

  return createElement(
    "div",
    { className: "rounded-md border bg-card p-3" },
    title ? createElement("div", { className: "mb-2 text-sm font-medium" }, title) : null,
    createElement(
      "svg",
      {
        role: "img",
        "aria-label": title ?? yLabel ?? "Timeseries chart",
        viewBox: `0 0 ${width} ${height}`,
        className: "h-auto w-full overflow-visible",
      },
      type === "bar"
        ? points.map(({ x, y, point }, index) => createElement("rect", {
          key: `${point.timestamp}:${index}`,
          x: x - Math.max(2, xStep * 0.3),
          y,
          width: Math.max(4, xStep * 0.6 || 12),
          height: Math.max(1, height - padding - y),
          rx: 2,
          className: "fill-primary/70",
        }))
        : createElement("polyline", {
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 2,
          className: "text-primary",
          points: points.map(({ x, y }) => `${x},${y}`).join(" "),
        }),
    ),
    yLabel ? createElement("div", { className: "mt-1 text-xs text-muted-foreground" }, yLabel) : null,
  );
}

function PluginSdkMetricCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return createElement(
    "div",
    { className: "rounded-md border bg-card p-3" },
    createElement("div", { className: "text-xs font-medium uppercase tracking-wide text-muted-foreground" }, label),
    createElement("div", { className: "mt-1 text-lg font-semibold" }, `${value}${unit ?? ""}`),
  );
}

function PluginSdkActionButton({
  action,
  onSuccess,
  onError,
}: {
  action: PluginActionBarItem;
  onSuccess?: PluginActionBarProps["onSuccess"];
  onError?: PluginActionBarProps["onError"];
}) {
  const runAction = usePluginAction(action.actionKey);
  const [pending, setPending] = useState(false);
  const className = {
    default: "border-input bg-background hover:bg-muted",
    primary: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
    destructive: "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
  }[action.variant ?? "default"];

  return createElement(
    "button",
    {
      type: "button",
      disabled: pending,
      className: `inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${className}`,
      onClick: async () => {
        if (
          action.confirm
          && typeof window !== "undefined"
          && !window.confirm(action.confirmMessage ?? `Run ${action.label}?`)
        ) {
          return;
        }
        setPending(true);
        try {
          const result = await runAction(action.params);
          onSuccess?.(action.actionKey, result);
        } catch (error) {
          onError?.(action.actionKey, error);
        } finally {
          setPending(false);
        }
      },
    },
    pending ? "Running..." : action.label,
  );
}

function PluginSdkActionBar({ actions, onSuccess, onError }: PluginActionBarProps) {
  return createElement(
    "div",
    { className: "flex flex-wrap items-center gap-2" },
    actions.map((action) => createElement(PluginSdkActionButton, {
      key: action.actionKey,
      action,
      onSuccess,
      onError,
    })),
  );
}

function PluginSdkLogView({
  entries,
  maxHeight = "400px",
  loading,
}: PluginLogViewProps) {
  if (loading) return createElement("div", { className: "text-sm text-muted-foreground" }, "Loading...");
  if (!entries.length) return createElement("div", { className: "text-sm text-muted-foreground" }, "No log entries.");

  const levelClassName = {
    info: "text-sky-600",
    warn: "text-amber-600",
    error: "text-red-600",
    debug: "text-muted-foreground",
  };

  return createElement(
    "div",
    {
      className: "overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs",
      style: { maxHeight },
    },
    entries.map((entry, index) => createElement(
      "div",
      { key: `${entry.timestamp}:${index}`, className: "grid grid-cols-[max-content_max-content_minmax(0,1fr)] gap-2 py-0.5" },
      createElement("span", { className: "text-muted-foreground" }, entry.timestamp),
      createElement("span", { className: levelClassName[entry.level] }, entry.level.toUpperCase()),
      createElement("span", { className: "min-w-0 whitespace-pre-wrap break-words" }, entry.message),
    )),
  );
}

function PluginSdkJsonTree({ data }: { data: unknown }) {
  return createElement("pre", { className: "max-h-80 overflow-auto rounded-md border bg-muted/30 p-2 text-xs" }, JSON.stringify(data, null, 2));
}

function PluginSdkSpinner({ label = "Loading" }: { size?: "sm" | "md" | "lg"; label?: string }) {
  return createElement("span", {
    className: "inline-block size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground align-middle",
    role: "status",
    "aria-label": label,
  });
}

class PluginSdkErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback ?? createElement("div", { className: "rounded-md border border-destructive/30 p-3 text-sm text-destructive" }, "Plugin UI failed to render.");
    }
    return this.props.children;
  }
}

/**
 * Initialize the plugin bridge global registry.
 *
 * Registers the host's React, ReactDOM, and SDK UI bridge implementations
 * on `globalThis.__paperclipPluginBridge__` so the plugin module loader
 * can provide them to plugin bundles.
 *
 * @param react - The host's React module
 * @param reactDom - The host's ReactDOM module
 */
export function initPluginBridge(
  react: typeof import("react"),
  reactDom: typeof import("react-dom"),
): void {
  globalThis.__paperclipPluginBridge__ = {
    react,
    reactDom,
    sdkUi: {
      usePluginData,
      usePluginAction,
      useHostContext,
      useHostLocation,
      useHostNavigation,
      usePluginStream,
      usePluginToast,
      MarkdownBlock: PluginSdkMarkdownBlock,
      MetricCard: PluginSdkMetricCard,
      StatusBadge: PluginSdkStatusBadge,
      DataTable: PluginSdkDataTable,
      TimeseriesChart: PluginSdkTimeseriesChart,
      KeyValueList: PluginSdkKeyValueList,
      ActionBar: PluginSdkActionBar,
      LogView: PluginSdkLogView,
      JsonTree: PluginSdkJsonTree,
      Spinner: PluginSdkSpinner,
      ErrorBoundary: PluginSdkErrorBoundary,
      MarkdownEditor: PluginSdkMarkdownEditor,
      FileTree: PluginSdkFileTree,
      IssuesList: PluginSdkIssuesList,
      AssigneePicker: PluginSdkAssigneePicker,
      ProjectPicker: PluginSdkProjectPicker,
      ManagedRoutinesList: PluginSdkManagedRoutinesList,
    },
  };
}
