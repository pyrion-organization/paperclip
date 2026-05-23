import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Project,
  ProjectDeployCommandRecord,
  ProjectDeployEvent,
  ProjectDeploymentTarget,
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
  rollbackInstructions: "",
  maintenanceUpdatesEnabled: false,
  maintenanceRecipients: "",
};

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active" || status === "approved" || status === "deployed" || status === "succeeded"
      ? "success"
      : status === "deploying" || status === "running"
        ? "running"
        : status === "failed" || status === "rejected"
          ? "danger"
          : status === "rolled_back" || status === "cancelled"
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
    rollbackInstructions: form.rollbackInstructions.trim() || null,
    maintenanceUpdatesEnabled: form.maintenanceUpdatesEnabled,
    maintenanceRecipients: form.maintenanceRecipients
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
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

  const recordCommand = (commandType: "deploy" | "rollback", status: "running" | "succeeded" | "failed") => {
    const command = commandType === "deploy" ? target?.deployCommand : target?.rollbackCommand;
    if (!command) return;
    const note = window.prompt("Command output or note (optional)", "");
    if (note === null) return;
    createRecord.mutate({
      commandType,
      status,
      command,
      note: note.trim() || null,
    });
  };

  const canRecordDeploy = Boolean(target?.deployCommand && canRecordDeployCommand(event));
  const canRecordRollback = Boolean(target?.rollbackCommand && canRecordRollbackCommand(event));

  if (!canRecordDeploy && !canRecordRollback && records.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
      {canRecordDeploy || canRecordRollback ? (
        <div className="flex flex-wrap gap-1.5">
          {canRecordDeploy ? (
            <>
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
  const [editingId, setEditingId] = useState<string | null>(null);

  const targetQueryKey = queryKeys.projects.deploymentTargets(project.id, selectedCompanyId ?? undefined);
  const eventQueryKey = queryKeys.projects.deployEvents(project.id, selectedCompanyId ?? undefined);
  const { data: targets = [], isLoading: targetsLoading, isError: targetsError } = useQuery({
    queryKey: targetQueryKey,
    queryFn: () => projectsApi.listDeploymentTargets(project.id, selectedCompanyId ?? undefined),
  });
  const { data: events = [], isLoading: eventsLoading, isError: eventsError } = useQuery({
    queryKey: eventQueryKey,
    queryFn: () => projectsApi.listDeployEvents(project.id, selectedCompanyId ?? undefined),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: targetQueryKey });
    queryClient.invalidateQueries({ queryKey: eventQueryKey });
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
  const targetsById = new Map(targets.map((target) => [target.id, target]));

  const submitTarget = () => {
    const payload = normalizeTargetPayload(form);
    if (!payload.name) return;
    createTarget.mutate(payload);
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
