import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Play,
  RefreshCw,
  Repeat,
  Save,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import { routinesApi, type RoutineTriggerResponse, type RotateRoutineTriggerResponse } from "../api/routines";
import { heartbeatsApi } from "../api/heartbeats";
import { LiveRunWidget } from "../components/LiveRunWidget";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToastActions } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { buildRoutineTriggerPatch, parseTimeToMin } from "../lib/routine-trigger-patch";
import { timeAgo, timeUntil } from "../lib/timeAgo";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { InlineEntitySelector, type InlineEntityOption } from "../components/InlineEntitySelector";
import { MarkdownEditor, type MarkdownEditorRef } from "../components/MarkdownEditor";
import {
  RoutineRunVariablesDialog,
  type RoutineRunDialogSubmitData,
} from "../components/RoutineRunVariablesDialog";
import { RoutineVariablesEditor, RoutineVariablesHint } from "../components/RoutineVariablesEditor";
import { ScheduleEditor, describeSchedule } from "../components/ScheduleEditor";
import { RoutineScriptConfig } from "../components/RoutineScriptConfig";
import { RunButton } from "../components/AgentActionButtons";
import { getRecentAssigneeIds, sortAgentsByRecency, trackRecentAssignee } from "../lib/recent-assignees";
import { getRecentProjectIds, trackRecentProject } from "../lib/recent-projects";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { RoutineTrigger, RoutineVariable } from "@paperclipai/shared";

const executionModes = ["agent", "script_nodejs", "script_python", "bash_command", "shell_script"] as const;
type ExecutionMode = (typeof executionModes)[number];
const executionModeLabels: Record<ExecutionMode, string> = {
  agent: "Agent",
  script_nodejs: "Node.js Script",
  script_python: "Python Script",
  bash_command: "Bash Command",
  shell_script: "Shell Script",
};
const concurrencyPolicies = ["coalesce_if_active", "always_enqueue", "skip_if_active"];
const catchUpPolicies = ["skip_missed", "enqueue_missed_with_cap"];
const triggerKinds = ["schedule", "webhook", "random_interval", "random_cron_scheduler"];
const signingModes = ["bearer", "hmac_sha256", "github_hmac", "none"];
const routineTabs = ["triggers", "runs", "activity"] as const;
const concurrencyPolicyDescriptions: Record<string, string> = {
  coalesce_if_active: "Keep one follow-up run queued while an active run is still working.",
  always_enqueue: "Queue every trigger occurrence, even if several runs stack up.",
  skip_if_active: "Drop overlapping trigger occurrences while the routine is already active.",
};
const catchUpPolicyDescriptions: Record<string, string> = {
  skip_missed: "Ignore schedule windows that were missed while the routine or scheduler was paused.",
  enqueue_missed_with_cap: "Catch up missed schedule windows in capped batches after recovery.",
};
const signingModeDescriptions: Record<string, string> = {
  bearer: "Expect a shared bearer token in the Authorization header.",
  hmac_sha256: "Expect an HMAC SHA-256 signature over the request using the shared secret.",
  github_hmac: "Accept GitHub-style X-Hub-Signature-256 header (HMAC over raw body, no timestamp).",
  none: "No authentication — the webhook URL itself acts as a shared secret.",
};
const SIGNING_MODES_WITHOUT_REPLAY_WINDOW = new Set(["github_hmac", "none"]);

type RoutineTab = (typeof routineTabs)[number];

type SecretMessage = {
  title: string;
  webhookUrl: string;
  webhookSecret: string;
};

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const WEEKDAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="flex gap-1">
      {WEEKDAY_LABELS.map((label, i) => {
        const active = value.includes(i);
        return (
          <button
            key={i}
            type="button"
            aria-label={WEEKDAY_FULL[i]}
            aria-pressed={active}
            className={`w-7 h-7 rounded text-xs font-medium border transition-colors ${
              active
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:border-foreground"
            }`}
            onClick={() => onChange(active ? value.filter((d) => d !== i) : [...value, i].sort((a, b) => a - b))}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function autoResizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function isRoutineTab(value: string | null): value is RoutineTab {
  return value !== null && routineTabs.includes(value as RoutineTab);
}

function getRoutineTabFromSearch(search: string): RoutineTab {
  const tab = new URLSearchParams(search).get("tab");
  return isRoutineTab(tab) ? tab : "triggers";
}

function formatActivityDetailValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length === 0 ? "[]" : value.map((item) => formatActivityDetailValue(item)).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function buildRoutineMutationPayload(input: {
  title: string;
  description: string;
  projectId: string;
  assigneeAgentId: string;
  priority: string;
  concurrencyPolicy: string;
  catchUpPolicy: string;
  variables: RoutineVariable[];
  executionMode: string;
  scriptPath: string;
  scriptCommandArgs: string[];
  scriptTimeoutSec: number;
  remediationEnabled: boolean;
  remediationPrompt: string;
  remediationAssigneeAgentId: string;
}) {
  return {
    ...input,
    description: input.description.trim() || null,
    projectId: input.projectId || null,
    assigneeAgentId: input.assigneeAgentId || null,
    scriptPath: input.executionMode !== "agent" ? input.scriptPath || null : null,
    scriptCommandArgs: input.executionMode !== "agent" ? input.scriptCommandArgs : null,
    remediationEnabled: input.remediationEnabled,
    remediationPrompt: input.remediationEnabled ? input.remediationPrompt || null : null,
    remediationAssigneeAgentId: input.remediationEnabled ? input.remediationAssigneeAgentId || null : null,
  };
}

function TriggerEditor({
  trigger,
  onSave,
  onRotate,
  onDelete,
}: {
  trigger: RoutineTrigger;
  onSave: (id: string, patch: Record<string, unknown>) => void;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState({
    label: trigger.label ?? "",
    cronExpression: trigger.cronExpression ?? "",
    signingMode: trigger.signingMode ?? "bearer",
    replayWindowSec: String(trigger.replayWindowSec ?? 300),
    minIntervalSec: String(trigger.minIntervalSec ?? 3600),
    maxIntervalSec: String(trigger.maxIntervalSec ?? 86400),
    allowedWeekdays: trigger.allowedWeekdays ?? [1, 2, 3, 4, 5],
    minTimeOfDayMin: minToHHMM(trigger.minTimeOfDayMin ?? 540),
    maxTimeOfDayMin: minToHHMM(trigger.maxTimeOfDayMin ?? 1020),
    minDaysAhead: String(trigger.minDaysAhead ?? 1),
    maxDaysAhead: String(trigger.maxDaysAhead ?? 7),
    timezone: trigger.timezone ?? getLocalTimezone(),
  });

  useEffect(() => {
    setDraft({
      label: trigger.label ?? "",
      cronExpression: trigger.cronExpression ?? "",
      signingMode: trigger.signingMode ?? "bearer",
      replayWindowSec: String(trigger.replayWindowSec ?? 300),
      minIntervalSec: String(trigger.minIntervalSec ?? 3600),
      maxIntervalSec: String(trigger.maxIntervalSec ?? 86400),
      allowedWeekdays: trigger.allowedWeekdays ?? [1, 2, 3, 4, 5],
      minTimeOfDayMin: minToHHMM(trigger.minTimeOfDayMin ?? 540),
      maxTimeOfDayMin: minToHHMM(trigger.maxTimeOfDayMin ?? 1020),
      minDaysAhead: String(trigger.minDaysAhead ?? 1),
      maxDaysAhead: String(trigger.maxDaysAhead ?? 7),
      timezone: trigger.timezone ?? getLocalTimezone(),
    });
  }, [trigger]);

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          {trigger.kind === "schedule" || trigger.kind === "random_cron_scheduler"
            ? <Clock3 className="h-3.5 w-3.5" />
            : trigger.kind === "webhook"
              ? <Webhook className="h-3.5 w-3.5" />
              : <Zap className="h-3.5 w-3.5" />}
          {trigger.label ?? trigger.kind}
        </div>
        <span className="text-xs text-muted-foreground">
          {(trigger.kind === "schedule" || trigger.kind === "random_cron_scheduler") && trigger.nextRunAt
            ? `Next: ${new Date(trigger.nextRunAt).toLocaleString()}`
            : trigger.kind === "webhook"
              ? "Webhook"
              : trigger.kind === "random_interval"
                ? "Random interval"
                : "API"}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={draft.label}
            onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
          />
        </div>
        {trigger.kind === "schedule" && (
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs">Schedule</Label>
            <ScheduleEditor
              value={draft.cronExpression}
              onChange={(cronExpression) => setDraft((current) => ({ ...current, cronExpression }))}
            />
          </div>
        )}
        {trigger.kind === "webhook" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Signing mode</Label>
              <Select
                value={draft.signingMode}
                onValueChange={(signingMode) => setDraft((current) => ({ ...current, signingMode }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {signingModes.map((mode) => (
                    <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!SIGNING_MODES_WITHOUT_REPLAY_WINDOW.has(draft.signingMode) && (
              <div className="space-y-1.5">
                <Label className="text-xs">Replay window (seconds)</Label>
                <Input
                  value={draft.replayWindowSec}
                  onChange={(event) => setDraft((current) => ({ ...current, replayWindowSec: event.target.value }))}
                />
              </div>
            )}
          </>
        )}
        {trigger.kind === "random_interval" && (
          <div className="md:col-span-2 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Min interval (seconds)</Label>
              <Input
                type="number"
                min={60}
                max={604800}
                value={draft.minIntervalSec}
                onChange={(event) => setDraft((current) => ({ ...current, minIntervalSec: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Minimum 60 seconds</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max interval (seconds)</Label>
              <Input
                type="number"
                min={60}
                max={604800}
                value={draft.maxIntervalSec}
                onChange={(event) => setDraft((current) => ({ ...current, maxIntervalSec: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Maximum 604800 seconds</p>
            </div>
          </div>
        )}
        {trigger.kind === "random_cron_scheduler" && (
          <div className="md:col-span-2 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Allowed weekdays</Label>
              <WeekdayPicker
                value={draft.allowedWeekdays}
                onChange={(allowedWeekdays) => setDraft((c) => ({ ...c, allowedWeekdays }))}
              />
              <p className="text-xs text-muted-foreground">All toggled = any day of the week.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Earliest time</Label>
                <Input
                  type="time"
                  value={draft.minTimeOfDayMin}
                  onChange={(e) => setDraft((c) => ({ ...c, minTimeOfDayMin: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Latest time</Label>
                <Input
                  type="time"
                  value={draft.maxTimeOfDayMin}
                  onChange={(e) => setDraft((c) => ({ ...c, maxTimeOfDayMin: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Min days ahead</Label>
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={draft.minDaysAhead}
                  onChange={(e) => setDraft((c) => ({ ...c, minDaysAhead: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max days ahead</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={draft.maxDaysAhead}
                  onChange={(e) => setDraft((c) => ({ ...c, maxDaysAhead: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Timezone</Label>
              <Input
                value={draft.timezone}
                onChange={(e) => setDraft((c) => ({ ...c, timezone: e.target.value }))}
                placeholder="e.g. America/New_York"
              />
              <p className="text-xs text-muted-foreground">IANA timezone name. Defaults to your browser timezone.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {trigger.lastResult && <span className="text-xs text-muted-foreground">Last: {trigger.lastResult}</span>}
        <div className="ml-auto flex items-center gap-2">
          {trigger.kind === "webhook" && (
            <Button variant="outline" size="sm" onClick={() => onRotate(trigger.id)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Rotate secret
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSave(trigger.id, buildRoutineTriggerPatch(trigger, draft, getLocalTimezone()))}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save trigger
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(trigger.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RoutineDetail() {
  const { routineId } = useParams<{ routineId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { pushToast } = useToastActions();
  const hydratedRoutineIdRef = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);
  const assigneeSelectorRef = useRef<HTMLButtonElement | null>(null);
  const projectSelectorRef = useRef<HTMLButtonElement | null>(null);
  const [secretMessage, setSecretMessage] = useState<SecretMessage | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<0 | 1>(0);
  const [runVariablesOpen, setRunVariablesOpen] = useState(false);
  const [newTrigger, setNewTrigger] = useState({
    kind: "schedule",
    cronExpression: "0 10 * * *",
    signingMode: "bearer",
    replayWindowSec: "300",
    minIntervalSec: "3600",
    maxIntervalSec: "86400",
    allowedWeekdays: [1, 2, 3, 4, 5] as number[],
    minTimeOfDayMin: "09:00",
    maxTimeOfDayMin: "17:00",
    minDaysAhead: "1",
    maxDaysAhead: "7",
    timezone: getLocalTimezone(),
  });
  const [editDraft, setEditDraft] = useState<{
    title: string;
    description: string;
    projectId: string;
    assigneeAgentId: string;
    priority: string;
    concurrencyPolicy: string;
    catchUpPolicy: string;
    variables: RoutineVariable[];
    executionMode: string;
    scriptPath: string;
    scriptCommandArgs: string[];
    scriptTimeoutSec: number;
    remediationEnabled: boolean;
    remediationPrompt: string;
    remediationAssigneeAgentId: string;
  }>({
    title: "",
    description: "",
    projectId: "",
    assigneeAgentId: "",
    priority: "medium",
    concurrencyPolicy: "coalesce_if_active",
    catchUpPolicy: "skip_missed",
    variables: [],
    executionMode: "agent",
    scriptPath: "",
    scriptCommandArgs: [],
    scriptTimeoutSec: 60,
    remediationEnabled: false,
    remediationPrompt: "",
    remediationAssigneeAgentId: "",
  });
  const activeTab = useMemo(() => getRoutineTabFromSearch(location.search), [location.search]);

  const { data: routine, isLoading, error } = useQuery({
    queryKey: queryKeys.routines.detail(routineId!),
    queryFn: () => routinesApi.get(routineId!),
    enabled: !!routineId,
  });
  const activeIssueId = routine?.activeIssue?.id;
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.issues.liveRuns(activeIssueId!),
    queryFn: () => heartbeatsApi.liveRunsForIssue(activeIssueId!),
    enabled: !!activeIssueId,
    refetchInterval: 3000,
  });
  const hasLiveRun = (liveRuns ?? []).length > 0;
  const { data: routineRuns } = useQuery({
    queryKey: queryKeys.routines.runs(routineId!),
    queryFn: () => routinesApi.listRuns(routineId!),
    enabled: !!routineId,
    refetchInterval: hasLiveRun ? 3000 : false,
  });
  const relatedActivityIds = useMemo(
    () => ({
      triggerIds: routine?.triggers.map((trigger) => trigger.id) ?? [],
      runIds: routineRuns?.map((run) => run.id) ?? [],
    }),
    [routine?.triggers, routineRuns],
  );
  const { data: activity } = useQuery({
    queryKey: [
      ...queryKeys.routines.activity(selectedCompanyId!, routineId!),
      relatedActivityIds.triggerIds.join(","),
      relatedActivityIds.runIds.join(","),
    ],
    queryFn: () => routinesApi.activity(selectedCompanyId!, routineId!, relatedActivityIds),
    enabled: !!selectedCompanyId && !!routineId && !!routine,
  });
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

  const routineDefaults = useMemo(
    () =>
      routine
        ? {
            title: routine.title,
            description: routine.description ?? "",
            projectId: routine.projectId ?? "",
            assigneeAgentId: routine.assigneeAgentId ?? "",
            priority: routine.priority,
            concurrencyPolicy: routine.concurrencyPolicy,
            catchUpPolicy: routine.catchUpPolicy,
            variables: routine.variables,
            executionMode: routine.executionMode ?? "agent",
            scriptPath: routine.scriptPath ?? "",
            scriptCommandArgs: routine.scriptCommandArgs ?? [],
            scriptTimeoutSec: routine.scriptTimeoutSec ?? 60,
            remediationEnabled: routine.remediationEnabled ?? false,
            remediationPrompt: routine.remediationPrompt ?? "",
            remediationAssigneeAgentId: routine.remediationAssigneeAgentId ?? "",
          }
        : null,
    [routine],
  );
  const isEditDirty = useMemo(() => {
    if (!routineDefaults) return false;
    return (
      editDraft.title !== routineDefaults.title ||
      editDraft.description !== routineDefaults.description ||
      editDraft.projectId !== routineDefaults.projectId ||
      editDraft.assigneeAgentId !== routineDefaults.assigneeAgentId ||
      editDraft.priority !== routineDefaults.priority ||
      editDraft.concurrencyPolicy !== routineDefaults.concurrencyPolicy ||
      editDraft.catchUpPolicy !== routineDefaults.catchUpPolicy ||
      JSON.stringify(editDraft.variables) !== JSON.stringify(routineDefaults.variables) ||
      editDraft.executionMode !== routineDefaults.executionMode ||
      editDraft.scriptPath !== routineDefaults.scriptPath ||
      JSON.stringify(editDraft.scriptCommandArgs) !== JSON.stringify(routineDefaults.scriptCommandArgs) ||
      editDraft.scriptTimeoutSec !== routineDefaults.scriptTimeoutSec ||
      editDraft.remediationEnabled !== routineDefaults.remediationEnabled ||
      editDraft.remediationPrompt !== routineDefaults.remediationPrompt ||
      editDraft.remediationAssigneeAgentId !== routineDefaults.remediationAssigneeAgentId
    );
  }, [editDraft, routineDefaults]);

  useEffect(() => {
    if (!routine) return;
    setBreadcrumbs([{ label: "Routines", href: "/routines" }, { label: routine.title }]);
    if (!routineDefaults) return;

    const changedRoutine = hydratedRoutineIdRef.current !== routine.id;
    if (changedRoutine || !isEditDirty) {
      setEditDraft(routineDefaults);
      hydratedRoutineIdRef.current = routine.id;
    }
  }, [routine, routineDefaults, isEditDirty, setBreadcrumbs]);

  useEffect(() => {
    autoResizeTextarea(titleInputRef.current);
  }, [editDraft.title, routine?.id]);

  const copySecretValue = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      pushToast({ title: `${label} copied`, tone: "success" });
    } catch (error) {
      pushToast({
        title: `Failed to copy ${label.toLowerCase()}`,
        body: error instanceof Error ? error.message : "Clipboard access was denied.",
        tone: "error",
      });
    }
  };

  const setActiveTab = (value: string) => {
    if (!routineId || !isRoutineTab(value)) return;
    const params = new URLSearchParams(location.search);
    if (value === "triggers") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    const search = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
      },
      { replace: true },
    );
  };

  const saveRoutine = useMutation({
    mutationFn: () => {
      return routinesApi.update(routineId!, buildRoutineMutationPayload(editDraft));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: "Failed to save routine",
        body: error instanceof Error ? error.message : "Paperclip could not save the routine.",
        tone: "error",
      });
    },
  });

  const runRoutine = useMutation({
    mutationFn: (data?: RoutineRunDialogSubmitData) =>
      routinesApi.run(routineId!, {
        ...(data?.variables && Object.keys(data.variables).length > 0 ? { variables: data.variables } : {}),
        ...(data?.assigneeAgentId !== undefined ? { assigneeAgentId: data.assigneeAgentId } : {}),
        ...(data?.projectId !== undefined ? { projectId: data.projectId } : {}),
        ...(data?.executionWorkspaceId !== undefined ? { executionWorkspaceId: data.executionWorkspaceId } : {}),
        ...(data?.executionWorkspacePreference !== undefined
          ? { executionWorkspacePreference: data.executionWorkspacePreference }
          : {}),
        ...(data?.executionWorkspaceSettings !== undefined
          ? { executionWorkspaceSettings: data.executionWorkspaceSettings }
          : {}),
      }),
    onSuccess: async () => {
      pushToast({ title: "Routine run started", tone: "success" });
      setRunVariablesOpen(false);
      setActiveTab("runs");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.runs(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: "Routine run failed",
        body: error instanceof Error ? error.message : "Paperclip could not start the routine run.",
        tone: "error",
      });
    },
  });

  const updateRoutineStatus = useMutation({
    mutationFn: (status: string) => routinesApi.update(routineId!, { status }),
    onSuccess: async (_data, status) => {
      pushToast({
        title: "Routine saved",
        body: status === "paused" ? "Automation paused." : "Automation enabled.",
        tone: "success",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: "Failed to update routine",
        body: error instanceof Error ? error.message : "Paperclip could not update the routine.",
        tone: "error",
      });
    },
  });

  const createTrigger = useMutation({
    mutationFn: async (): Promise<RoutineTriggerResponse> => {
      const existingOfKind = (routine?.triggers ?? []).filter((t) => t.kind === newTrigger.kind).length;
      const autoLabel = existingOfKind > 0 ? `${newTrigger.kind}-${existingOfKind + 1}` : newTrigger.kind;
      return routinesApi.createTrigger(routineId!, {
        kind: newTrigger.kind,
        label: autoLabel,
        ...(newTrigger.kind === "schedule"
          ? { cronExpression: newTrigger.cronExpression.trim(), timezone: getLocalTimezone() }
          : {}),
        ...(newTrigger.kind === "webhook"
          ? {
            signingMode: newTrigger.signingMode,
            replayWindowSec: Number(newTrigger.replayWindowSec || "300"),
          }
          : {}),
        ...(newTrigger.kind === "random_interval"
          ? {
            minIntervalSec: Number(newTrigger.minIntervalSec || "3600"),
            maxIntervalSec: Number(newTrigger.maxIntervalSec || "86400"),
          }
          : {}),
        ...(newTrigger.kind === "random_cron_scheduler"
          ? {
            allowedWeekdays: newTrigger.allowedWeekdays,
            minTimeOfDayMin: parseTimeToMin(newTrigger.minTimeOfDayMin || "09:00"),
            maxTimeOfDayMin: parseTimeToMin(newTrigger.maxTimeOfDayMin || "17:00"),
            minDaysAhead: Number(newTrigger.minDaysAhead || "1"),
            maxDaysAhead: Number(newTrigger.maxDaysAhead || "7"),
            timezone: newTrigger.timezone || getLocalTimezone(),
          }
          : {}),
      });
    },
    onSuccess: async (result) => {
      if (result.secretMaterial) {
        setSecretMessage({
          title: "Webhook trigger created",
          webhookUrl: result.secretMaterial.webhookUrl,
          webhookSecret: result.secretMaterial.webhookSecret,
        });
      } else {
        pushToast({
          title: "Trigger added",
          body: "The routine schedule was saved.",
          tone: "success",
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: "Failed to add trigger",
        body: error instanceof Error ? error.message : "Paperclip could not create the trigger.",
        tone: "error",
      });
    },
  });

  const updateTrigger = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => routinesApi.updateTrigger(id, patch),
    onSuccess: async () => {
      pushToast({
        title: "Trigger saved",
        body: "The routine cadence update was saved.",
        tone: "success",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: "Failed to update trigger",
        body: error instanceof Error ? error.message : "Paperclip could not update the trigger.",
        tone: "error",
      });
    },
  });

  const deleteTrigger = useMutation({
    mutationFn: (id: string) => routinesApi.deleteTrigger(id),
    onSuccess: async () => {
      pushToast({
        title: "Trigger deleted",
        tone: "success",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: "Failed to delete trigger",
        body: error instanceof Error ? error.message : "Paperclip could not delete the trigger.",
        tone: "error",
      });
    },
  });

  const rotateTrigger = useMutation({
    mutationFn: (id: string): Promise<RotateRoutineTriggerResponse> => routinesApi.rotateTriggerSecret(id),
    onSuccess: async (result) => {
      setSecretMessage({
        title: "Webhook secret rotated",
        webhookUrl: result.secretMaterial.webhookUrl,
        webhookSecret: result.secretMaterial.webhookSecret,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: "Failed to rotate webhook secret",
        body: error instanceof Error ? error.message : "Paperclip could not rotate the webhook secret.",
        tone: "error",
      });
    },
  });

  const deleteRoutine = useMutation({
    mutationFn: () => routinesApi.delete(routineId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) });
      navigate("/routines");
    },
    onError: (error) => {
      pushToast({
        title: "Failed to delete routine",
        body: error instanceof Error ? error.message : "Paperclip could not delete the routine.",
        tone: "error",
      });
      setDeleteConfirmStep(0);
    },
  });

  const agentById = useMemo(
    () => new Map((agents ?? []).map((agent) => [agent.id, agent])),
    [agents],
  );
  const projectById = useMemo(
    () => new Map((projects ?? []).map((project) => [project.id, project])),
    [projects],
  );
  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [routine?.id]);
  const recentProjectIds = useMemo(() => getRecentProjectIds(), [routine?.id]);
  const assigneeOptions = useMemo<InlineEntityOption[]>(
    () =>
      sortAgentsByRecency(
        (agents ?? []).filter((agent) => agent.status !== "terminated"),
        recentAssigneeIds,
      ).map((agent) => ({
        id: agent.id,
        label: agent.name,
        searchText: `${agent.name} ${agent.role} ${agent.title ?? ""}`,
      })),
    [agents, recentAssigneeIds],
  );
  const projectOptions = useMemo<InlineEntityOption[]>(
    () =>
      (projects ?? []).map((project) => ({
        id: project.id,
        label: project.name,
        searchText: project.description ?? "",
      })),
    [projects],
  );
  const currentAssignee = editDraft.assigneeAgentId ? agentById.get(editDraft.assigneeAgentId) ?? null : null;
  const currentProject = editDraft.projectId ? projectById.get(editDraft.projectId) ?? null : null;

  if (!selectedCompanyId) {
    return <EmptyState icon={Repeat} message="Select a company to view routines." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="issues-list" />;
  }

  if (error || !routine) {
    return (
      <p className="pt-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "Routine not found"}
      </p>
    );
  }

  const isScriptMode = editDraft.executionMode !== "agent";
  const automationEnabled = routine.status === "active";
  const selectedProject = routine.projectId ? (projects?.find((project) => project.id === routine.projectId) ?? null) : null;
  const automationToggleDisabled = updateRoutineStatus.isPending || routine.status === "archived";
  const isAgentMissingForAgent = !isScriptMode && !routine.assigneeAgentId;
  const automationLabel = routine.status === "archived"
    ? "Archived"
    : isAgentMissingForAgent
      ? "Draft"
      : automationEnabled
        ? "Active"
        : "Paused";
  const automationLabelClassName = routine.status === "archived"
    ? "text-muted-foreground"
    : automationEnabled
      ? "text-emerald-400"
      : "text-muted-foreground";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header: editable title + actions */}
      <div className="flex items-start gap-4">
        <textarea
          ref={titleInputRef}
          className="flex-1 min-w-0 resize-none overflow-hidden bg-transparent text-xl font-bold outline-none placeholder:text-muted-foreground/50"
          placeholder="Routine title"
          rows={1}
          value={editDraft.title}
          onChange={(event) => {
            setEditDraft((current) => ({ ...current, title: event.target.value }));
            autoResizeTextarea(event.target);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              descriptionEditorRef.current?.focus();
              return;
            }
            if (event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              if (editDraft.assigneeAgentId) {
                if (editDraft.projectId) {
                  descriptionEditorRef.current?.focus();
                } else {
                  projectSelectorRef.current?.focus();
                }
              } else {
                assigneeSelectorRef.current?.focus();
              }
            }
          }}
        />
        <div className="flex shrink-0 items-center gap-3 pt-1">
          <RunButton
            onClick={() => {
              setRunVariablesOpen(true);
            }}
            disabled={runRoutine.isPending}
          />
          <ToggleSwitch
            size="lg"
            checked={automationEnabled}
            onCheckedChange={() => {
              if (!automationEnabled && isAgentMissingForAgent) {
                pushToast({
                  title: "Default agent required",
                  body: "Set a default agent before enabling routine automation.",
                  tone: "warn",
                });
                return;
              }
              updateRoutineStatus.mutate(automationEnabled ? "paused" : "active");
            }}
            disabled={automationToggleDisabled}
            aria-label={automationEnabled ? "Pause automatic triggers" : "Enable automatic triggers"}
          />
          <span className={`min-w-[3.75rem] text-sm font-medium ${automationLabelClassName}`}>
            {automationLabel}
          </span>
        </div>
      </div>

      {/* Secret message banner */}
      {secretMessage && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3 text-sm">
          <div>
            <p className="font-medium">{secretMessage.title}</p>
            <p className="text-xs text-muted-foreground">Save this now. Paperclip will not show the secret value again.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input value={secretMessage.webhookUrl} readOnly className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => copySecretValue("Webhook URL", secretMessage.webhookUrl)}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                URL
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input value={secretMessage.webhookSecret} readOnly className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => copySecretValue("Webhook secret", secretMessage.webhookSecret)}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                Secret
              </Button>
            </div>
          </div>
        </div>
      )}

      {isAgentMissingForAgent ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-900 dark:text-amber-200">
          Default agent required. This routine can stay as a draft and still run manually, but automation stays paused until you assign a default agent.
        </div>
      ) : null}

      {/* Execution mode selector */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Execution mode</p>
        <div className="inline-flex rounded-md border border-input bg-background p-0.5 gap-0.5">
          {executionModes.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setEditDraft((current) => ({ ...current, executionMode: mode }))}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                editDraft.executionMode === mode
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {executionModeLabels[mode]}
            </button>
          ))}
        </div>
      </div>

      {/* Assignment row — agent mode only */}
      {!isScriptMode && <div className="overflow-x-auto overscroll-x-contain">
        <div className="inline-flex min-w-full flex-wrap items-center gap-2 text-sm text-muted-foreground sm:min-w-max sm:flex-nowrap">
          <span>For</span>
          <InlineEntitySelector
            ref={assigneeSelectorRef}
            value={editDraft.assigneeAgentId}
            options={assigneeOptions}
            recentOptionIds={recentAssigneeIds}
            placeholder="Assignee"
            noneLabel="No assignee"
            searchPlaceholder="Search assignees..."
            emptyMessage="No assignees found."
            onChange={(assigneeAgentId) => {
              if (assigneeAgentId) trackRecentAssignee(assigneeAgentId);
              setEditDraft((current) => ({ ...current, assigneeAgentId }));
            }}
            onConfirm={() => {
              if (editDraft.projectId) {
                descriptionEditorRef.current?.focus();
              } else {
                projectSelectorRef.current?.focus();
              }
            }}
            renderTriggerValue={(option) =>
              option ? (
                currentAssignee ? (
                  <>
                    <AgentIcon icon={currentAssignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{option.label}</span>
                  </>
                ) : (
                  <span className="truncate">{option.label}</span>
                )
              ) : (
                <span className="text-muted-foreground">Assignee</span>
              )
            }
            renderOption={(option) => {
              if (!option.id) return <span className="truncate">{option.label}</span>;
              const assignee = agentById.get(option.id);
              return (
                <>
                  {assignee ? <AgentIcon icon={assignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                  <span className="truncate">{option.label}</span>
                </>
              );
            }}
          />
          <span>in</span>
          <InlineEntitySelector
            ref={projectSelectorRef}
            value={editDraft.projectId}
            options={projectOptions}
            recentOptionIds={recentProjectIds}
            placeholder="Project"
            noneLabel="No project"
            searchPlaceholder="Search projects..."
            emptyMessage="No projects found."
            onChange={(projectId) => {
              if (projectId) trackRecentProject(projectId);
              setEditDraft((current) => ({ ...current, projectId }));
            }}
            onConfirm={() => descriptionEditorRef.current?.focus()}
            renderTriggerValue={(option) =>
              option && currentProject ? (
                <>
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: currentProject.color ?? "#64748b" }}
                  />
                  <span className="truncate">{option.label}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Project</span>
              )
            }
            renderOption={(option) => {
              if (!option.id) return <span className="truncate">{option.label}</span>;
              const project = projectById.get(option.id);
              return (
                <>
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: project?.color ?? "#64748b" }}
                  />
                  <span className="truncate">{option.label}</span>
                </>
              );
            }}
          />
        </div>
      </div>}

      {/* Agent mode: instructions + variables */}
      {!isScriptMode && (
        <>
          <MarkdownEditor
            ref={descriptionEditorRef}
            value={editDraft.description}
            onChange={(description) => setEditDraft((current) => ({ ...current, description }))}
            placeholder="Add instructions..."
            bordered={false}
            contentClassName="min-h-[120px] text-[15px] leading-7"
            onSubmit={() => {
              if (!saveRoutine.isPending && editDraft.title.trim()) {
                saveRoutine.mutate();
              }
            }}
          />
          <RoutineVariablesHint />
          <RoutineVariablesEditor
            title={editDraft.title}
            description={editDraft.description}
            value={editDraft.variables}
            onChange={(variables) => setEditDraft((current) => ({ ...current, variables }))}
          />
        </>
      )}

      {/* Script mode: code editor */}
      {isScriptMode && (
        <div className="space-y-2">
          {editDraft.executionMode !== "bash_command" && (
            <div className="overflow-x-auto overscroll-x-contain">
              <div className="inline-flex min-w-full flex-wrap items-center gap-2 text-sm text-muted-foreground sm:min-w-max sm:flex-nowrap">
                <span>In</span>
                <InlineEntitySelector
                  ref={projectSelectorRef}
                  value={editDraft.projectId}
                  options={projectOptions}
                  recentOptionIds={recentProjectIds}
                  placeholder="Project"
                  noneLabel="No project"
                  searchPlaceholder="Search projects..."
                  emptyMessage="No projects found."
                  onChange={(projectId) => {
                    if (projectId) trackRecentProject(projectId);
                    setEditDraft((current) => ({ ...current, projectId }));
                  }}
                  onConfirm={() => {}}
                  renderTriggerValue={(option) =>
                    option && currentProject ? (
                      <>
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: currentProject.color ?? "#64748b" }}
                        />
                        <span className="truncate">{option.label}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Project</span>
                    )
                  }
                  renderOption={(option) => {
                    if (!option.id) return <span className="truncate">{option.label}</span>;
                    const project = projectById.get(option.id);
                    return (
                      <>
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: project?.color ?? "#64748b" }}
                        />
                        <span className="truncate">{option.label}</span>
                      </>
                    );
                  }}
                />
              </div>
            </div>
          )}
          {editDraft.executionMode === "bash_command" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Bash command</label>
              <textarea
                className="w-full resize-y rounded border border-input bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[64px]"
                placeholder={'echo "hello world" && date'}
                value={editDraft.scriptPath}
                onChange={(e) => setEditDraft((current) => ({ ...current, scriptPath: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Runs as <code className="font-mono">bash -c "…"</code>. Routine variables available as <code className="font-mono">ROUTINE_VAR_*</code> env vars.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Script</p>
                {editDraft.variables.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Available:{" "}
                    {editDraft.variables.map((v) => (
                      <code key={v.name} className="text-xs font-mono bg-muted px-1 rounded mr-1">
                        ROUTINE_VAR_{v.name.toUpperCase()}
                      </code>
                    ))}
                    <code className="text-xs font-mono bg-muted px-1 rounded">ROUTINE_VAR_DATE</code>
                  </p>
                )}
              </div>
              <RoutineScriptConfig
                projectId={editDraft.projectId}
                companyId={routine?.companyId ?? undefined}
                executionMode={editDraft.executionMode as "script_nodejs" | "script_python" | "shell_script"}
                scriptPath={editDraft.scriptPath}
                scriptCommandArgs={editDraft.scriptCommandArgs}
                onScriptPathChange={(scriptPath) => setEditDraft((current) => ({ ...current, scriptPath }))}
                onArgsChange={(scriptCommandArgs) => setEditDraft((current) => ({ ...current, scriptCommandArgs }))}
              />
            </>
          )}
          <RoutineVariablesEditor
            title={editDraft.title}
            description=""
            value={editDraft.variables}
            onChange={(variables) => setEditDraft((current) => ({ ...current, variables }))}
          />
        </div>
      )}

      {/* Advanced delivery settings */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <span className="text-sm font-medium">Advanced delivery settings</span>
          {advancedOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Concurrency</p>
              <Select
                value={editDraft.concurrencyPolicy}
                onValueChange={(concurrencyPolicy) => setEditDraft((current) => ({ ...current, concurrencyPolicy }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {concurrencyPolicies.map((value) => (
                    <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{concurrencyPolicyDescriptions[editDraft.concurrencyPolicy]}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Catch-up</p>
              <Select
                value={editDraft.catchUpPolicy}
                onValueChange={(catchUpPolicy) => setEditDraft((current) => ({ ...current, catchUpPolicy }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catchUpPolicies.map((value) => (
                    <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{catchUpPolicyDescriptions[editDraft.catchUpPolicy]}</p>
            </div>
            {isScriptMode && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Timeout (seconds)</p>
                <Input
                  type="number"
                  min={1}
                  max={3600}
                  value={editDraft.scriptTimeoutSec}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(3600, Number(e.target.value) || 60));
                    setEditDraft((current) => ({ ...current, scriptTimeoutSec: v }));
                  }}
                />
                <p className="text-xs text-muted-foreground">Script is killed after this many seconds (1–3600).</p>
              </div>
            )}
            {isScriptMode && (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Failure remediation</p>
                  <ToggleSwitch
                    checked={editDraft.remediationEnabled}
                    onCheckedChange={(checked) => setEditDraft((current) => ({ ...current, remediationEnabled: checked }))}
                  />
                </div>
                {editDraft.remediationEnabled && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Remediation prompt</Label>
                      <Input
                        value={editDraft.remediationPrompt}
                        onChange={(e) => setEditDraft((current) => ({ ...current, remediationPrompt: e.target.value }))}
                        placeholder="Instructions for handling script failures..."
                      />
                      <p className="text-xs text-muted-foreground">Prompt sent to remediation agent when script fails.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Remediation agent</Label>
                      <Select
                        value={editDraft.remediationAssigneeAgentId}
                        onValueChange={(value) => setEditDraft((current) => ({ ...current, remediationAssigneeAgentId: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a remediation agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {(agents ?? []).map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              <div className="flex items-center gap-2">
                                <AgentIcon icon={agent.icon} className="h-4 w-4" />
                                {agent.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Agent assigned to handle failures.</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Save bar */}
      <div className="flex items-center justify-between">
        {isEditDirty ? (
          <span className="text-xs text-amber-600">Unsaved changes</span>
        ) : (
          <span />
        )}
        <Button
          onClick={() => saveRoutine.mutate()}
          disabled={saveRoutine.isPending || !editDraft.title.trim()}
        >
          <Save className="mr-2 h-4 w-4" />
          Save routine
        </Button>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList variant="line" className="w-full justify-start gap-1">
          <TabsTrigger value="triggers" className="gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            Triggers
          </TabsTrigger>
          <TabsTrigger value="runs" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Runs
            {hasLiveRun && <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
          </TabsTrigger>
<TabsTrigger value="activity" className="gap-1.5">
            <ActivityIcon className="h-3.5 w-3.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="triggers" className="space-y-4">
          {/* Add trigger form */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm font-medium">Add trigger</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Kind</Label>
                <Select value={newTrigger.kind} onValueChange={(kind) => setNewTrigger((current) => ({ ...current, kind }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {triggerKinds.map((kind) => (
                      <SelectItem key={kind} value={kind} disabled={kind === "webhook"}>
                        {kind === "random_cron_scheduler"
                          ? "Random weekday scheduler"
                          : kind === "random_interval"
                            ? "Random interval"
                            : kind}
                        {kind === "webhook" ? " — COMING SOON" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newTrigger.kind === "schedule" && (
                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-xs">Schedule</Label>
                  <ScheduleEditor
                    value={newTrigger.cronExpression}
                    onChange={(cronExpression) => setNewTrigger((current) => ({ ...current, cronExpression }))}
                  />
                </div>
              )}
              {newTrigger.kind === "webhook" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Signing mode</Label>
                    <Select value={newTrigger.signingMode} onValueChange={(signingMode) => setNewTrigger((current) => ({ ...current, signingMode }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {signingModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{signingModeDescriptions[newTrigger.signingMode]}</p>
                  </div>
                  {!SIGNING_MODES_WITHOUT_REPLAY_WINDOW.has(newTrigger.signingMode) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Replay window (seconds)</Label>
                      <Input value={newTrigger.replayWindowSec} onChange={(event) => setNewTrigger((current) => ({ ...current, replayWindowSec: event.target.value }))} />
                    </div>
                  )}
                </>
              )}
              {newTrigger.kind === "random_interval" && (
                <div className="md:col-span-2 grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Min interval (seconds)</Label>
                    <Input
                      type="number"
                      min={60}
                      max={604800}
                      value={newTrigger.minIntervalSec}
                      onChange={(event) => setNewTrigger((current) => ({ ...current, minIntervalSec: event.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Minimum 60 seconds</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max interval (seconds)</Label>
                    <Input
                      type="number"
                      min={60}
                      max={604800}
                      value={newTrigger.maxIntervalSec}
                      onChange={(event) => setNewTrigger((current) => ({ ...current, maxIntervalSec: event.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Maximum 604800 seconds</p>
                  </div>
                </div>
              )}
              {newTrigger.kind === "random_cron_scheduler" && (
                <div className="md:col-span-2 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Allowed weekdays</Label>
                    <WeekdayPicker
                      value={newTrigger.allowedWeekdays}
                      onChange={(allowedWeekdays) => setNewTrigger((c) => ({ ...c, allowedWeekdays }))}
                    />
                    <p className="text-xs text-muted-foreground">All toggled = any day of the week.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Earliest time</Label>
                      <Input
                        type="time"
                        value={newTrigger.minTimeOfDayMin}
                        onChange={(e) => setNewTrigger((c) => ({ ...c, minTimeOfDayMin: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Latest time</Label>
                      <Input
                        type="time"
                        value={newTrigger.maxTimeOfDayMin}
                        onChange={(e) => setNewTrigger((c) => ({ ...c, maxTimeOfDayMin: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Min days ahead</Label>
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        value={newTrigger.minDaysAhead}
                        onChange={(e) => setNewTrigger((c) => ({ ...c, minDaysAhead: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Max days ahead</Label>
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={newTrigger.maxDaysAhead}
                        onChange={(e) => setNewTrigger((c) => ({ ...c, maxDaysAhead: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Timezone</Label>
                    <Input
                      value={newTrigger.timezone}
                      onChange={(e) => setNewTrigger((c) => ({ ...c, timezone: e.target.value }))}
                      placeholder="e.g. America/New_York"
                    />
                    <p className="text-xs text-muted-foreground">Defaults to your browser timezone ({getLocalTimezone()}).</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={() => createTrigger.mutate()} disabled={createTrigger.isPending}>
                {createTrigger.isPending ? "Adding..." : "Add trigger"}
              </Button>
            </div>
          </div>

          {/* Existing triggers */}
          {routine.triggers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No triggers configured yet.</p>
          ) : (
            <div className="space-y-3">
              {routine.triggers.map((trigger) => (
                <TriggerEditor
                  key={trigger.id}
                  trigger={trigger}
                  onSave={(id, patch) => updateTrigger.mutate({ id, patch })}
                  onRotate={(id) => rotateTrigger.mutate(id)}
                  onDelete={(id) => deleteTrigger.mutate(id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          {hasLiveRun && activeIssueId && routine && (
            <LiveRunWidget issueId={activeIssueId} companyId={routine.companyId} />
          )}
          {(() => {
            const upcomingRuns = (routine.triggers ?? [])
              .filter((t) => t.enabled && t.nextRunAt != null)
              .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime());
            const pastRuns = routineRuns ?? [];
            if (upcomingRuns.length === 0 && pastRuns.length === 0) {
              return <p className="text-xs text-muted-foreground">No runs yet.</p>;
            }
            return (
              <div className="border border-border rounded-lg divide-y divide-border">
                {upcomingRuns.map((trigger) => (
                  <div key={`upcoming-${trigger.id}`} className="px-3 py-2 text-sm border-l-2 border-l-blue-400/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="shrink-0 border-blue-400/50 text-blue-400 bg-blue-400/5">scheduled</Badge>
                        <span className="text-muted-foreground truncate">{trigger.label ?? trigger.kind.replaceAll("_", " ")}</span>
                      </div>
                      <span className="text-xs text-blue-400/80 shrink-0 ml-2">
                        {new Date(trigger.nextRunAt!).toLocaleString()} · {timeUntil(trigger.nextRunAt!)}
                      </span>
                    </div>
                  </div>
                ))}
                {pastRuns.map((run) => (
                  <div key={run.id} className="px-3 py-2 text-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="shrink-0">{run.source}</Badge>
                        <Badge variant={run.status === "failed" ? "destructive" : run.status === "completed" ? "default" : "secondary"} className="shrink-0">
                          {run.status.replaceAll("_", " ")}
                        </Badge>
                        {run.scriptExitCode != null && (
                          <Badge variant={run.scriptExitCode === 0 ? "default" : "destructive"} className="shrink-0 font-mono text-xs">
                            exit {run.scriptExitCode}
                          </Badge>
                        )}
                        {run.trigger && (
                          <span className="text-muted-foreground truncate">{run.trigger.label ?? run.trigger.kind}</span>
                        )}
                        {run.linkedIssue && (
                          <Link to={`/issues/${run.linkedIssue.identifier ?? run.linkedIssue.id}`} className="text-muted-foreground hover:underline truncate">
                            {run.linkedIssue.identifier ?? run.linkedIssue.id.slice(0, 8)}
                          </Link>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">{timeAgo(run.triggeredAt)}</span>
                    </div>
                    {run.scriptOutput && (
                      <pre className="text-xs font-mono bg-muted rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all text-muted-foreground">
                        {run.scriptOutput}
                      </pre>
                    )}
                    {run.failureReason && !run.scriptOutput && (
                      <p className="text-xs text-destructive">{run.failureReason}</p>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="activity">
          {(activity ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {(activity ?? []).map((event) => (
                <div key={event.id} className="flex items-center justify-between px-3 py-2 text-xs gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-foreground/90 shrink-0">{event.action.replaceAll(".", " ")}</span>
                    {event.details && Object.keys(event.details).length > 0 && (
                      <span className="text-muted-foreground truncate">
                        {Object.entries(event.details).slice(0, 3).map(([key, value], i) => (
                          <span key={key}>
                            {i > 0 && <span className="mx-1 text-border">·</span>}
                            <span className="text-muted-foreground/70">{key.replaceAll("_", " ")}:</span>{" "}
                            {formatActivityDetailValue(value)}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground/60 shrink-0">{timeAgo(event.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <RoutineRunVariablesDialog
        open={runVariablesOpen}
        onOpenChange={setRunVariablesOpen}
        companyId={routine.companyId}
        routineName={routine.title}
        agents={agents ?? []}
        projects={projects ?? []}
        defaultProjectId={routine.projectId}
        defaultAssigneeAgentId={routine.assigneeAgentId}
        variables={routine.variables ?? []}
        isPending={runRoutine.isPending}
        onSubmit={(data) => runRoutine.mutate(data)}
      />

      <Separator />

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Danger zone</p>
        {deleteConfirmStep === 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => setDeleteConfirmStep(1)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete routine
          </Button>
        ) : (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
            <p className="text-sm font-medium text-destructive">Delete "{routine.title}"?</p>
            <p className="text-xs text-muted-foreground">
              This permanently deletes the routine, all its triggers, and all run history. This cannot be undone.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteRoutine.isPending}
                onClick={() => deleteRoutine.mutate()}
              >
                {deleteRoutine.isPending ? "Deleting..." : "Yes, delete permanently"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={deleteRoutine.isPending}
                onClick={() => setDeleteConfirmStep(0)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
