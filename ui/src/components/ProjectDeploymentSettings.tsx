import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PROJECT_INFRA_PROVIDER_DESCRIPTORS } from "@paperclipai/shared";
import type {
  Project,
  ProjectDeployCommandRecord,
  ProjectDeployEvent,
  ProjectDeploymentTarget,
  ProjectInfraHealthCheck,
  ProjectInfraIncident,
  ProjectInfraActionProposal,
  ProjectInfraTarget,
} from "@paperclipai/shared";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatDate } from "../lib/utils";

const EMPTY_TARGET_FORM = {
  name: "",
  environment: "production",
  provider: "manual",
  targetUrl: "",
  healthCheckUrl: "",
  deployCommand: "",
  rollbackCommand: "",
  commandExecutionEnabled: false,
  rollbackInstructions: "",
  maintenanceUpdatesEnabled: false,
  maintenanceRecipients: "",
};

const EMPTY_INFRA_TARGET_FORM = {
  name: "",
  environment: "production",
  provider: "manual",
  providerAccountRef: "",
  region: "",
  role: "app",
  host: "",
  failoverGroup: "",
  failoverRank: "",
};

const EMPTY_HEALTH_FORM = {
  name: "",
  infraTargetId: "",
  checkType: "http",
  url: "",
  expectedStatus: "200",
};

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active" || status === "approved" || status === "deployed" || status === "succeeded"
      ? "success"
      : status === "deploying" || status === "running"
        ? "running"
        : status === "failed" || status === "rejected" || status === "unhealthy"
          ? "danger"
          : status === "rolled_back" || status === "cancelled" || status === "degraded"
            ? "warning"
            : status === "approval_requested"
              ? "pending"
              : "neutral";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
        tone === "success" && "bg-green-500/15 text-green-700 dark:text-green-300",
        tone === "running" && "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
        tone === "danger" && "bg-red-500/15 text-red-700 dark:text-red-300",
        tone === "warning" && "bg-orange-500/15 text-orange-700 dark:text-orange-300",
        tone === "pending" && "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function deployEventActions(event: ProjectDeployEvent): Array<{ status: "deploying" | "deployed" | "failed" | "rolled_back"; label: string }> {
  if (event.status === "approved") {
    return [
      { status: "deploying", label: "Start" },
      { status: "deployed", label: "Mark deployed" },
      { status: "failed", label: "Mark failed" },
    ];
  }
  if (event.status === "deploying") {
    return [
      { status: "deployed", label: "Mark deployed" },
      { status: "failed", label: "Mark failed" },
    ];
  }
  if (event.status === "failed" || event.status === "deployed") {
    return [{ status: "rolled_back", label: "Mark rolled back" }];
  }
  return [];
}

function canSendMaintenanceUpdate(event: ProjectDeployEvent) {
  return Boolean(
    event.maintenanceMessage
    && event.maintenanceMessageStatus !== "sent"
    && ["deploying", "deployed", "failed", "rolled_back"].includes(event.status),
  );
}

function canRecordDeployCommand(event: ProjectDeployEvent) {
  return ["approved", "deploying", "failed"].includes(event.status);
}

function canRecordRollbackCommand(event: ProjectDeployEvent) {
  return ["deployed", "failed", "rolled_back"].includes(event.status);
}

function normalizeTargetPayload(form: typeof EMPTY_TARGET_FORM) {
  return {
    name: form.name.trim(),
    environment: form.environment.trim() || "production",
    provider: form.provider.trim() || "manual",
    targetUrl: form.targetUrl.trim() || null,
    healthCheckUrl: form.healthCheckUrl.trim() || null,
    deployCommand: form.deployCommand.trim() || null,
    rollbackCommand: form.rollbackCommand.trim() || null,
    commandExecutionEnabled: form.commandExecutionEnabled,
    rollbackInstructions: form.rollbackInstructions.trim() || null,
    maintenanceUpdatesEnabled: form.maintenanceUpdatesEnabled,
    maintenanceRecipients: form.maintenanceRecipients
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function normalizeInfraTargetPayload(form: typeof EMPTY_INFRA_TARGET_FORM) {
  return {
    name: form.name.trim(),
    environment: form.environment.trim() || "production",
    provider: form.provider.trim() || "manual",
    providerAccountRef: form.providerAccountRef.trim() || null,
    region: form.region.trim() || null,
    role: form.role.trim() || "app",
    host: form.host.trim() || null,
    failoverGroup: form.failoverGroup.trim() || null,
    failoverRank: form.failoverRank.trim() ? Number(form.failoverRank) : null,
    repairActionsRequireApproval: true,
  };
}

function normalizeHealthPayload(form: typeof EMPTY_HEALTH_FORM) {
  return {
    name: form.name.trim(),
    infraTargetId: form.infraTargetId || null,
    checkType: form.checkType,
    url: form.url.trim() || null,
    expectedStatus: form.expectedStatus.trim() ? Number(form.expectedStatus) : null,
  };
}

function DeployCommandRecords({
  projectId,
  event,
  target,
  companyId,
}: {
  projectId: string;
  event: ProjectDeployEvent;
  target: ProjectDeploymentTarget | null;
  companyId?: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.projects.deployCommandRecords(projectId, event.id, companyId);
  const { data: records = [], isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => projectsApi.listDeployCommandRecords(projectId, event.id, companyId),
  });
  const createRecord = useMutation({
    mutationFn: ({
      commandType,
      status,
      command,
      note,
    }: {
      commandType: "deploy" | "rollback";
      status: "running" | "succeeded" | "failed";
      command: string;
      note: string | null;
    }) =>
      projectsApi.createDeployCommandRecord(
        projectId,
        event.id,
        {
          commandType,
          status,
          command,
          note,
        },
        companyId,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const executeCommand = useMutation({
    mutationFn: (commandType: "deploy" | "rollback") =>
      projectsApi.executeDeployCommand(projectId, event.id, { commandType }, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.deployEvents(projectId, companyId) });
    },
  });

  const recordCommand = (commandType: "deploy" | "rollback", status: "running" | "succeeded" | "failed") => {
    const command = commandType === "deploy" ? target?.deployCommand : target?.rollbackCommand;
    if (!command) return;
    const evidenceRequired = status === "succeeded" || status === "failed";
    const note = window.prompt(
      evidenceRequired ? "Command output or note (required)" : "Command output or note (optional)",
      "",
    );
    if (note === null) return;
    if (evidenceRequired && note.trim().length === 0) {
      window.alert("Terminal deploy command records require output or a note.");
      return;
    }
    createRecord.mutate({
      commandType,
      status,
      command,
      note: note.trim() || null,
    });
  };

  const canRecordDeploy = Boolean(target?.deployCommand && canRecordDeployCommand(event));
  const canRecordRollback = Boolean(target?.rollbackCommand && canRecordRollbackCommand(event));
  const canExecuteDeploy = Boolean(target?.commandExecutionEnabled && target.deployCommand && canRecordDeployCommand(event));
  const canExecuteRollback = Boolean(target?.commandExecutionEnabled && target.rollbackCommand && canRecordRollbackCommand(event));

  if (!canRecordDeploy && !canRecordRollback && records.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
      {canRecordDeploy || canRecordRollback ? (
        <div className="flex flex-wrap gap-1.5">
          {canRecordDeploy ? (
            <>
              {canExecuteDeploy ? (
                <Button
                  variant="default"
                  size="xs"
                  className="h-6 px-2"
                  disabled={executeCommand.isPending}
                  onClick={() => executeCommand.mutate("deploy")}
                >
                  {executeCommand.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Execute deploy
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="xs"
                className="h-6 px-2"
                disabled={createRecord.isPending}
                onClick={() => recordCommand("deploy", "running")}
              >
                Deploy running
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="h-6 px-2"
                disabled={createRecord.isPending}
                onClick={() => recordCommand("deploy", "succeeded")}
              >
                Deploy succeeded
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="h-6 px-2"
                disabled={createRecord.isPending}
                onClick={() => recordCommand("deploy", "failed")}
              >
                Deploy failed
              </Button>
            </>
          ) : null}
          {canRecordRollback ? (
            <>
              {canExecuteRollback ? (
                <Button
                  variant="default"
                  size="xs"
                  className="h-6 px-2"
                  disabled={executeCommand.isPending}
                  onClick={() => executeCommand.mutate("rollback")}
                >
                  {executeCommand.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Execute rollback
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="xs"
                className="h-6 px-2"
                disabled={createRecord.isPending}
                onClick={() => recordCommand("rollback", "succeeded")}
              >
                Rollback succeeded
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="h-6 px-2"
                disabled={createRecord.isPending}
                onClick={() => recordCommand("rollback", "failed")}
              >
                Rollback failed
              </Button>
            </>
          ) : null}
          {createRecord.isError ? <span className="text-xs text-destructive">Failed to record command.</span> : null}
          {executeCommand.isError ? <span className="text-xs text-destructive">Failed to execute command.</span> : null}
        </div>
      ) : null}
      {isLoading ? (
        <div className="text-[11px] text-muted-foreground">Loading command records...</div>
      ) : isError ? (
        <div className="text-[11px] text-destructive">Failed to load command records.</div>
      ) : records.length > 0 ? (
        <div className="space-y-1">
          {records.slice(0, 3).map((record: ProjectDeployCommandRecord) => (
            <div key={record.id} className="rounded border border-border/60 px-2 py-1 text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={record.status} />
                <span className="font-medium">{record.commandType}</span>
                <span className="text-muted-foreground">{formatDate(record.createdAt)}</span>
              </div>
              <div className="mt-0.5 break-all font-mono text-muted-foreground">{record.command}</div>
              {record.output || record.note || record.exitCode ? (
                <div className="mt-0.5 break-words text-muted-foreground">
                  {record.exitCode ? `exit ${record.exitCode}: ` : ""}
                  {record.output ?? record.note}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectDeploymentSettings({ project }: { project: Project }) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_TARGET_FORM);
  const [infraForm, setInfraForm] = useState(EMPTY_INFRA_TARGET_FORM);
  const [healthForm, setHealthForm] = useState(EMPTY_HEALTH_FORM);
  const [externalMonitorToken, setExternalMonitorToken] = useState<{
    healthCheckId: string;
    token: string;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const targetQueryKey = queryKeys.projects.deploymentTargets(project.id, selectedCompanyId ?? undefined);
  const infraTargetQueryKey = queryKeys.projects.infraTargets(project.id, selectedCompanyId ?? undefined);
  const infraHealthQueryKey = queryKeys.projects.infraHealthChecks(project.id, selectedCompanyId ?? undefined);
  const infraIncidentQueryKey = queryKeys.projects.infraIncidents(project.id, selectedCompanyId ?? undefined);
  const infraActionProposalQueryKey = queryKeys.projects.infraActionProposals(project.id, selectedCompanyId ?? undefined);
  const eventQueryKey = queryKeys.projects.deployEvents(project.id, selectedCompanyId ?? undefined);
  const { data: targets = [], isLoading: targetsLoading, isError: targetsError } = useQuery({
    queryKey: targetQueryKey,
    queryFn: () => projectsApi.listDeploymentTargets(project.id, selectedCompanyId ?? undefined),
  });
  const { data: events = [], isLoading: eventsLoading, isError: eventsError } = useQuery({
    queryKey: eventQueryKey,
    queryFn: () => projectsApi.listDeployEvents(project.id, selectedCompanyId ?? undefined),
  });
  const { data: infraTargets = [], isLoading: infraTargetsLoading, isError: infraTargetsError } = useQuery({
    queryKey: infraTargetQueryKey,
    queryFn: () => projectsApi.listInfraTargets(project.id, selectedCompanyId ?? undefined),
  });
  const { data: healthChecks = [], isLoading: healthChecksLoading, isError: healthChecksError } = useQuery({
    queryKey: infraHealthQueryKey,
    queryFn: () => projectsApi.listInfraHealthChecks(project.id, selectedCompanyId ?? undefined),
  });
  const { data: infraIncidents = [], isLoading: infraIncidentsLoading, isError: infraIncidentsError } = useQuery({
    queryKey: infraIncidentQueryKey,
    queryFn: () => projectsApi.listInfraIncidents(project.id, selectedCompanyId ?? undefined),
  });
  const { data: infraActionProposals = [], isLoading: infraActionProposalsLoading, isError: infraActionProposalsError } = useQuery({
    queryKey: infraActionProposalQueryKey,
    queryFn: () => projectsApi.listInfraActionProposals(project.id, selectedCompanyId ?? undefined),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: targetQueryKey });
    queryClient.invalidateQueries({ queryKey: eventQueryKey });
    queryClient.invalidateQueries({ queryKey: infraTargetQueryKey });
    queryClient.invalidateQueries({ queryKey: infraHealthQueryKey });
    queryClient.invalidateQueries({ queryKey: infraIncidentQueryKey });
    queryClient.invalidateQueries({ queryKey: infraActionProposalQueryKey });
  };

  const createTarget = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.createDeploymentTarget(project.id, data, selectedCompanyId ?? undefined),
    onSuccess: () => {
      setForm(EMPTY_TARGET_FORM);
      invalidate();
    },
  });
  const updateTarget = useMutation({
    mutationFn: ({ targetId, data }: { targetId: string; data: Record<string, unknown> }) =>
      projectsApi.updateDeploymentTarget(project.id, targetId, data, selectedCompanyId ?? undefined),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
  });
  const removeTarget = useMutation({
    mutationFn: (targetId: string) =>
      projectsApi.removeDeploymentTarget(project.id, targetId, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
  const updateDeployEventStatus = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: "deploying" | "deployed" | "failed" | "rolled_back" }) =>
      projectsApi.recordDeployEventStatus(project.id, eventId, { status }, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
  const sendMaintenanceMessage = useMutation({
    mutationFn: (eventId: string) =>
      projectsApi.sendDeployMaintenanceMessage(project.id, eventId, {}, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
  const createInfraTarget = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.createInfraTarget(project.id, data, selectedCompanyId ?? undefined),
    onSuccess: () => {
      setInfraForm(EMPTY_INFRA_TARGET_FORM);
      invalidate();
    },
  });
  const removeInfraTarget = useMutation({
    mutationFn: (targetId: string) =>
      projectsApi.removeInfraTarget(project.id, targetId, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
  const createHealthCheck = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.createInfraHealthCheck(project.id, data, selectedCompanyId ?? undefined),
    onSuccess: () => {
      setHealthForm(EMPTY_HEALTH_FORM);
      invalidate();
    },
  });
  const recordHealthResult = useMutation({
    mutationFn: ({
      healthCheckId,
      status,
      createIncident,
    }: {
      healthCheckId: string;
      status: "healthy" | "degraded" | "unhealthy";
      createIncident: boolean;
    }) =>
      projectsApi.recordInfraHealthResult(
        project.id,
        healthCheckId,
        { status, createIncident },
        selectedCompanyId ?? undefined,
      ),
    onSuccess: invalidate,
  });
  const rotateExternalMonitorToken = useMutation({
    mutationFn: (healthCheckId: string) =>
      projectsApi.rotateInfraHealthExternalMonitorToken(project.id, healthCheckId, selectedCompanyId ?? undefined),
    onSuccess: (result) => {
      setExternalMonitorToken({ healthCheckId: result.healthCheck.id, token: result.token });
      invalidate();
    },
  });
  const revokeExternalMonitorToken = useMutation({
    mutationFn: (healthCheckId: string) =>
      projectsApi.revokeInfraHealthExternalMonitorToken(project.id, healthCheckId, selectedCompanyId ?? undefined),
    onSuccess: (_result, healthCheckId) => {
      setExternalMonitorToken((current) => (current?.healthCheckId === healthCheckId ? null : current));
      invalidate();
    },
  });
  const updateIncident = useMutation({
    mutationFn: ({ incidentId, status }: { incidentId: string; status: "investigating" | "resolved" | "ignored" }) =>
      projectsApi.updateInfraIncident(project.id, incidentId, { status }, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
  const createInfraActionProposal = useMutation({
    mutationFn: ({ incidentId, data }: { incidentId: string; data: Record<string, unknown> }) =>
      projectsApi.createInfraActionProposal(project.id, incidentId, data, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
  const createInfraActionEvidence = useMutation({
    mutationFn: ({ proposalId, data }: { proposalId: string; data: Record<string, unknown> }) =>
      projectsApi.createInfraActionEvidence(project.id, proposalId, data, selectedCompanyId ?? undefined),
    onSuccess: invalidate,
  });
  const targetsById = new Map(targets.map((target) => [target.id, target]));
  const infraTargetsById = new Map(infraTargets.map((target) => [target.id, target]));

  const submitTarget = () => {
    const payload = normalizeTargetPayload(form);
    if (!payload.name) return;
    createTarget.mutate(payload);
  };

  const submitInfraTarget = () => {
    const payload = normalizeInfraTargetPayload(infraForm);
    if (!payload.name) return;
    createInfraTarget.mutate(payload);
  };

  const submitHealthCheck = () => {
    const payload = normalizeHealthPayload(healthForm);
    if (!payload.name) return;
    createHealthCheck.mutate(payload);
  };

  const proposeInfraAction = (incident: ProjectInfraIncident, actionType: "repair" | "failover") => {
    const summary = window.prompt(`${actionType === "failover" ? "Failover" : "Repair"} summary`, incident.summary);
    if (!summary?.trim()) return;
    const proposedAction = window.prompt("Proposed manual action. Do not include secrets.", "");
    if (!proposedAction?.trim()) return;
    createInfraActionProposal.mutate({
      incidentId: incident.id,
      data: {
        infraTargetId: incident.infraTargetId,
        actionType,
        summary: summary.trim(),
        rationale: `Incident ${incident.id} requires ${actionType} review before any provider mutation.`,
        proposedAction: proposedAction.trim(),
        rollbackPlan: "Operator must define rollback before executing any approved provider change.",
        risk: "Manual repair/failover may affect production availability. Provider mutations are not executed by Paperclip.",
        evidenceRequired: "Record operator evidence after approval before closing the incident.",
      },
    });
  };

  const recordInfraActionEvidence = (proposal: ProjectInfraActionProposal, status: "performed" | "succeeded" | "failed") => {
    const evidence = window.prompt("Manual action evidence", "");
    if (!evidence?.trim()) return;
    createInfraActionEvidence.mutate({
      proposalId: proposal.id,
      data: {
        status,
        evidence: evidence.trim(),
      },
    });
  };

  const toggleTargetStatus = (target: ProjectDeploymentTarget) => {
    updateTarget.mutate({
      targetId: target.id,
      data: { status: target.status === "active" ? "disabled" : "active" },
    });
  };

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Deployment
        </div>
        <p className="text-xs text-muted-foreground">
          Approved deploy workflow metadata. Agents can request approval against these targets, but production deploy remains gated.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-border/70 p-3">
        <div className="grid gap-2 md:grid-cols-2">
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Target name"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={form.environment}
            onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value }))}
            placeholder="production"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={form.provider}
            onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
            placeholder="manual"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={form.targetUrl}
            onChange={(event) => setForm((current) => ({ ...current, targetUrl: event.target.value }))}
            placeholder="https://app.example.com"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={form.healthCheckUrl}
            onChange={(event) => setForm((current) => ({ ...current, healthCheckUrl: event.target.value }))}
            placeholder="https://app.example.com/health"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
            value={form.deployCommand}
            onChange={(event) => setForm((current) => ({ ...current, deployCommand: event.target.value }))}
            placeholder="Deploy command descriptor"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
            value={form.rollbackCommand}
            onChange={(event) => setForm((current) => ({ ...current, rollbackCommand: event.target.value }))}
            placeholder="Rollback command descriptor"
          />
          <label className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={form.commandExecutionEnabled}
              onChange={(event) => setForm((current) => ({ ...current, commandExecutionEnabled: event.target.checked }))}
            />
            Allow approved command execution on Paperclip host
          </label>
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={form.rollbackInstructions}
            onChange={(event) => setForm((current) => ({ ...current, rollbackInstructions: event.target.value }))}
            placeholder="Rollback instructions"
          />
          <label className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={form.maintenanceUpdatesEnabled}
              onChange={(event) => setForm((current) => ({ ...current, maintenanceUpdatesEnabled: event.target.checked }))}
            />
            Maintenance updates
          </label>
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={form.maintenanceRecipients}
            onChange={(event) => setForm((current) => ({ ...current, maintenanceRecipients: event.target.value }))}
            placeholder="updates@example.com, ops@example.com"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            className="h-6 px-2"
            disabled={!form.name.trim() || createTarget.isPending}
            onClick={submitTarget}
          >
            {createTarget.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
            Add target
          </Button>
          {createTarget.isError ? <span className="text-xs text-destructive">Failed to add target.</span> : null}
        </div>
      </div>

      <div className="space-y-2">
        {targetsLoading ? (
          <div className="text-xs text-muted-foreground">Loading deploy targets...</div>
        ) : targetsError ? (
          <div className="text-xs text-destructive">Failed to load deploy targets.</div>
        ) : targets.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No deployment targets configured.
          </div>
        ) : (
          targets.map((target) => (
            <div key={target.id} className="rounded-md border border-border/70 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{target.name}</span>
                    <StatusPill status={target.status} />
                    <span className="text-[11px] text-muted-foreground">
                      {target.environment} · {target.provider}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-muted-foreground">
                    {target.targetUrl ? <div className="break-all">Target: {target.targetUrl}</div> : null}
                    {target.healthCheckUrl ? <div className="break-all">Health: {target.healthCheckUrl}</div> : null}
                    {target.deployCommand ? <div className="break-all font-mono">Deploy: {target.deployCommand}</div> : null}
                    {target.rollbackCommand ? <div className="break-all font-mono">Rollback command: {target.rollbackCommand}</div> : null}
                    {target.commandExecutionEnabled ? <div>Paperclip command execution enabled</div> : null}
                    {target.rollbackInstructions ? <div>Rollback: {target.rollbackInstructions}</div> : null}
                    {target.maintenanceUpdatesEnabled ? (
                      <div>
                        Maintenance recipients: {target.maintenanceRecipients.length > 0 ? target.maintenanceRecipients.join(", ") : "none"}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={updateTarget.isPending && editingId === target.id}
                    onClick={() => {
                      setEditingId(target.id);
                      toggleTargetStatus(target);
                    }}
                  >
                    {target.status === "active" ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={removeTarget.isPending}
                    aria-label={`Delete deployment target ${target.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete deployment target "${target.name}"?`)) {
                        removeTarget.mutate(target.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 rounded-md border border-border/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Infrastructure topology</div>
            <p className="text-[11px] text-muted-foreground">
              Record provider, host, failover, and health metadata. Repair and failover actions remain approval-gated.
            </p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={infraForm.name}
            onChange={(event) => setInfraForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Infra target name"
          />
          <select
            className="rounded border border-border bg-background px-2 py-1 text-xs outline-none"
            value={infraForm.provider}
            onChange={(event) => setInfraForm((current) => ({ ...current, provider: event.target.value }))}
          >
            {PROJECT_INFRA_PROVIDER_DESCRIPTORS.map((provider) => (
              <option key={provider.key} value={provider.key}>{provider.label}</option>
            ))}
          </select>
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={infraForm.host}
            onChange={(event) => setInfraForm((current) => ({ ...current, host: event.target.value }))}
            placeholder="host or instance"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={infraForm.environment}
            onChange={(event) => setInfraForm((current) => ({ ...current, environment: event.target.value }))}
            placeholder="production"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={infraForm.region}
            onChange={(event) => setInfraForm((current) => ({ ...current, region: event.target.value }))}
            placeholder="region"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={infraForm.role}
            onChange={(event) => setInfraForm((current) => ({ ...current, role: event.target.value }))}
            placeholder="app"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={infraForm.providerAccountRef}
            onChange={(event) => setInfraForm((current) => ({ ...current, providerAccountRef: event.target.value }))}
            placeholder="provider account ref"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={infraForm.failoverGroup}
            onChange={(event) => setInfraForm((current) => ({ ...current, failoverGroup: event.target.value }))}
            placeholder="failover group"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={infraForm.failoverRank}
            onChange={(event) => setInfraForm((current) => ({ ...current, failoverRank: event.target.value }))}
            placeholder="rank"
            inputMode="numeric"
          />
        </div>
        <Button
          variant="outline"
          size="xs"
          className="h-6 px-2"
          disabled={!infraForm.name.trim() || createInfraTarget.isPending}
          onClick={submitInfraTarget}
        >
          {createInfraTarget.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
          Add infra target
        </Button>
        {createInfraTarget.isError ? <span className="ml-2 text-xs text-destructive">Failed to add infra target.</span> : null}
      </div>

      <div className="space-y-2">
        {infraTargetsLoading ? (
          <div className="text-xs text-muted-foreground">Loading infra targets...</div>
        ) : infraTargetsError ? (
          <div className="text-xs text-destructive">Failed to load infra targets.</div>
        ) : infraTargets.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No infrastructure targets configured.
          </div>
        ) : (
          infraTargets.map((target: ProjectInfraTarget) => (
            <div key={target.id} className="rounded-md border border-border/70 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{target.name}</span>
                    <StatusPill status={target.status} />
                    <span className="text-[11px] text-muted-foreground">
                      {target.environment} · {target.providerDescriptor?.label ?? target.provider} · {target.role}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-muted-foreground">
                    {target.providerDescriptor ? (
                      <div className="break-words">
                        Capabilities: {target.providerDescriptor.capabilities.join(", ")}
                      </div>
                    ) : (
                      <div>Capabilities: custom provider, manual evidence only</div>
                    )}
                    {target.host ? <div className="break-all">Host: {target.host}</div> : null}
                    {target.region ? <div>Region: {target.region}</div> : null}
                    {target.providerAccountRef ? <div>Account: {target.providerAccountRef}</div> : null}
                    {target.failoverGroup ? (
                      <div>
                        Failover: {target.failoverGroup}
                        {target.failoverRank ? ` rank ${target.failoverRank}` : ""}
                      </div>
                    ) : null}
                    <div>Repair actions require approval: {target.repairActionsRequireApproval ? "yes" : "no"}</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={removeInfraTarget.isPending}
                  aria-label={`Delete infrastructure target ${target.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete infrastructure target "${target.name}"?`)) {
                      removeInfraTarget.mutate(target.id);
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 rounded-md border border-border/70 p-3">
        <div className="text-xs font-medium text-muted-foreground">Health checks</div>
        <div className="grid gap-2 md:grid-cols-4">
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={healthForm.name}
            onChange={(event) => setHealthForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Health check name"
          />
          <select
            className="rounded border border-border bg-background px-2 py-1 text-xs outline-none"
            value={healthForm.infraTargetId}
            onChange={(event) => setHealthForm((current) => ({ ...current, infraTargetId: event.target.value }))}
          >
            <option value="">No target</option>
            {infraTargets.map((target) => (
              <option key={target.id} value={target.id}>{target.name}</option>
            ))}
          </select>
          <select
            className="rounded border border-border bg-background px-2 py-1 text-xs outline-none"
            value={healthForm.checkType}
            onChange={(event) => setHealthForm((current) => ({ ...current, checkType: event.target.value }))}
          >
            <option value="http">HTTP</option>
            <option value="tcp">TCP</option>
            <option value="manual">Manual</option>
          </select>
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={healthForm.expectedStatus}
            onChange={(event) => setHealthForm((current) => ({ ...current, expectedStatus: event.target.value }))}
            placeholder="200"
            inputMode="numeric"
          />
          <input
            className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none md:col-span-3"
            value={healthForm.url}
            onChange={(event) => setHealthForm((current) => ({ ...current, url: event.target.value }))}
            placeholder="https://app.example.com/health"
          />
        </div>
        <Button
          variant="outline"
          size="xs"
          className="h-6 px-2"
          disabled={!healthForm.name.trim() || createHealthCheck.isPending}
          onClick={submitHealthCheck}
        >
          {createHealthCheck.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
          Add health check
        </Button>
        {createHealthCheck.isError ? <span className="ml-2 text-xs text-destructive">Failed to add health check.</span> : null}
      </div>

      <div className="space-y-2">
        {healthChecksLoading ? (
          <div className="text-xs text-muted-foreground">Loading health checks...</div>
        ) : healthChecksError ? (
          <div className="text-xs text-destructive">Failed to load health checks.</div>
        ) : healthChecks.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No infrastructure health checks configured.
          </div>
        ) : (
          healthChecks.map((check: ProjectInfraHealthCheck) => (
            <div key={check.id} className="rounded-md border border-border/70 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{check.name}</span>
                    <StatusPill status={check.status} />
                    <span className="text-[11px] text-muted-foreground">
                      {check.checkType}
                      {check.infraTargetId && infraTargetsById.get(check.infraTargetId)
                        ? ` · ${infraTargetsById.get(check.infraTargetId)?.name}`
                        : ""}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-muted-foreground">
                    {check.url ? <div className="break-all">URL: {check.url}</div> : null}
                    {check.expectedStatus ? <div>Expected: HTTP {check.expectedStatus}</div> : null}
                    {check.lastCheckedAt ? <div>Last checked: {formatDate(check.lastCheckedAt)}</div> : null}
                    {check.lastSourceKind ? (
                      <div>
                        Source: {check.lastSourceKind}
                        {check.lastSourceId ? ` · ${check.lastSourceId}` : ""}
                      </div>
                    ) : null}
                    {check.externalMonitorEnabled ? (
                      <div>
                        External monitor token enabled{check.externalMonitorTokenHint ? ` · ...${check.externalMonitorTokenHint}` : ""}
                      </div>
                    ) : null}
                    {externalMonitorToken?.healthCheckId === check.id ? (
                      <div className="break-all rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[11px] text-amber-200">
                        New monitor token, shown once: {externalMonitorToken.token}
                      </div>
                    ) : null}
                    {check.lastError ? <div className="break-words text-destructive">Error: {check.lastError}</div> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={recordHealthResult.isPending}
                    onClick={() => recordHealthResult.mutate({ healthCheckId: check.id, status: "healthy", createIncident: false })}
                  >
                    Healthy
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={recordHealthResult.isPending}
                    onClick={() => recordHealthResult.mutate({ healthCheckId: check.id, status: "unhealthy", createIncident: true })}
                  >
                    Unhealthy
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={rotateExternalMonitorToken.isPending}
                    onClick={() => rotateExternalMonitorToken.mutate(check.id)}
                  >
                    {check.externalMonitorEnabled ? "Rotate monitor token" : "Create monitor token"}
                  </Button>
                  {check.externalMonitorEnabled ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 px-2"
                      disabled={revokeExternalMonitorToken.isPending}
                      onClick={() => revokeExternalMonitorToken.mutate(check.id)}
                    >
                      Revoke token
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Infra incidents</div>
        {infraIncidentsLoading ? (
          <div className="text-xs text-muted-foreground">Loading infra incidents...</div>
        ) : infraIncidentsError ? (
          <div className="text-xs text-destructive">Failed to load infra incidents.</div>
        ) : infraIncidents.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No infrastructure incidents recorded.
          </div>
        ) : (
          infraIncidents.slice(0, 8).map((incident: ProjectInfraIncident) => (
            <div key={incident.id} className="rounded-md border border-border/70 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusPill status={incident.status} />
                  <StatusPill status={incident.severity} />
                  <span className="truncate text-sm">{incident.summary}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{formatDate(incident.createdAt)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>{incident.sourceKind}</span>
                <span>{incident.occurrenceCount} occurrence{incident.occurrenceCount === 1 ? "" : "s"}</span>
                <span>Last {formatDate(incident.lastOccurredAt)}</span>
                {incident.issueId ? <span>Issue {incident.issueId.slice(0, 8)}</span> : null}
                {incident.escalatedAt ? <span className="text-destructive">Escalated {formatDate(incident.escalatedAt)}</span> : null}
                {incident.escalationReason ? <span className="break-words">{incident.escalationReason}</span> : null}
                {incident.recommendedAction ? <span className="break-words">{incident.recommendedAction}</span> : null}
              </div>
              {incident.status === "open" || incident.status === "investigating" ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {incident.status === "open" ? (
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-6 px-2"
                      disabled={updateIncident.isPending}
                      onClick={() => updateIncident.mutate({ incidentId: incident.id, status: "investigating" })}
                    >
                      Investigating
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={updateIncident.isPending || createInfraActionProposal.isPending}
                    onClick={() => proposeInfraAction(incident, "repair")}
                  >
                    Propose repair
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={updateIncident.isPending || createInfraActionProposal.isPending}
                    onClick={() => proposeInfraAction(incident, "failover")}
                  >
                    Propose failover
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={updateIncident.isPending}
                    onClick={() => updateIncident.mutate({ incidentId: incident.id, status: "resolved" })}
                  >
                    Resolve
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={updateIncident.isPending}
                    onClick={() => updateIncident.mutate({ incidentId: incident.id, status: "ignored" })}
                  >
                    Ignore
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Infra action proposals</div>
        {infraActionProposalsLoading ? (
          <div className="text-xs text-muted-foreground">Loading infra action proposals...</div>
        ) : infraActionProposalsError ? (
          <div className="text-xs text-destructive">Failed to load infra action proposals.</div>
        ) : infraActionProposals.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No repair or failover proposals recorded.
          </div>
        ) : (
          infraActionProposals.slice(0, 8).map((proposal: ProjectInfraActionProposal) => (
            <div key={proposal.id} className="rounded-md border border-border/70 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusPill status={proposal.status} />
                  <span className="text-[11px] font-medium uppercase text-muted-foreground">{proposal.actionType}</span>
                  <span className="truncate text-sm">{proposal.summary}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{formatDate(proposal.createdAt)}</span>
              </div>
              <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                <div className="break-words">Action: {proposal.proposedAction}</div>
                <div className="break-words">Rationale: {proposal.rationale}</div>
                {proposal.approvalId ? <div>Approval {proposal.approvalId.slice(0, 8)}</div> : null}
              </div>
              {proposal.status === "approved" ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={createInfraActionEvidence.isPending}
                    onClick={() => recordInfraActionEvidence(proposal, "performed")}
                  >
                    Record evidence
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={createInfraActionEvidence.isPending}
                    onClick={() => recordInfraActionEvidence(proposal, "succeeded")}
                  >
                    Mark succeeded
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2"
                    disabled={createInfraActionEvidence.isPending}
                    onClick={() => recordInfraActionEvidence(proposal, "failed")}
                  >
                    Mark failed
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Deploy events</div>
        {eventsLoading ? (
          <div className="text-xs text-muted-foreground">Loading deploy events...</div>
        ) : eventsError ? (
          <div className="text-xs text-destructive">Failed to load deploy events.</div>
        ) : events.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No deploy approval requests recorded yet.
          </div>
        ) : (
          events.slice(0, 10).map((event) => (
            <div key={event.id} className="rounded-md border border-border/70 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusPill status={event.status} />
                  <span className="truncate text-sm">{event.summary}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{formatDate(event.createdAt)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>{event.changedFiles.length} files</span>
                <span>{event.testsRun.length} tests</span>
                {event.approvalId ? <span>Approval {event.approvalId.slice(0, 8)}</span> : null}
                {event.maintenanceMessageStatus ? (
                  <span>Message {event.maintenanceMessageStatus}</span>
                ) : null}
              </div>
              {deployEventActions(event).length > 0 || canSendMaintenanceUpdate(event) ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {deployEventActions(event).map((action) => (
                    <Button
                      key={action.status}
                      variant="outline"
                      size="xs"
                      className="h-6 px-2"
                      disabled={updateDeployEventStatus.isPending}
                      onClick={() =>
                        updateDeployEventStatus.mutate({
                          eventId: event.id,
                          status: action.status,
                        })}
                    >
                      {action.label}
                    </Button>
                  ))}
                  {canSendMaintenanceUpdate(event) ? (
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-6 px-2"
                      disabled={sendMaintenanceMessage.isPending}
                      onClick={() => sendMaintenanceMessage.mutate(event.id)}
                    >
                      Send update
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <DeployCommandRecords
                projectId={project.id}
                event={event}
                target={event.deploymentTargetId ? targetsById.get(event.deploymentTargetId) ?? null : null}
                companyId={selectedCompanyId ?? undefined}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
