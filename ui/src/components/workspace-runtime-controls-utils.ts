import type {
  WorkspaceCommandDefinition,
  WorkspaceRuntimeControlTarget,
  WorkspaceRuntimeService,
} from "@paperclipai/shared";
import {
  listWorkspaceCommandDefinitions,
  matchWorkspaceRuntimeServiceToCommand,
} from "@paperclipai/shared/workspace-commands";

export type WorkspaceRuntimeAction = "start" | "stop" | "restart" | "run";

export type WorkspaceRuntimeControlRequest = WorkspaceRuntimeControlTarget & {
  action: WorkspaceRuntimeAction;
};

export type WorkspaceRuntimeControlItem = {
  key: string;
  title: string;
  kind: "service" | "job";
  statusLabel: string;
  lifecycle: "shared" | "ephemeral" | null;
  healthStatus: "unknown" | "healthy" | "unhealthy" | null;
  command: string | null;
  cwd: string | null;
  port: number | null;
  url: string | null;
  canStart: boolean;
  canRun: boolean;
  workspaceCommandId?: string | null;
  runtimeServiceId?: string | null;
  serviceIndex?: number | null;
  disabledReason?: string | null;
};

export type WorkspaceRuntimeControlSections = {
  services: WorkspaceRuntimeControlItem[];
  jobs: WorkspaceRuntimeControlItem[];
  otherServices: WorkspaceRuntimeControlItem[];
};

export type LegacyWorkspaceRuntimeControlItem = WorkspaceRuntimeControlItem & {
  status?: string | null;
};

function buildServiceItem(
  command: WorkspaceCommandDefinition,
  runtimeService: WorkspaceRuntimeService | null,
  canStartServices: boolean,
): WorkspaceRuntimeControlItem {
  return {
    key: `command:${command.id}:${runtimeService?.id ?? "idle"}`,
    title: command.name,
    kind: "service",
    statusLabel: runtimeService?.status ?? "stopped",
    lifecycle: runtimeService?.lifecycle ?? command.lifecycle,
    healthStatus: runtimeService?.healthStatus ?? "unknown",
    command: runtimeService?.command ?? command.command,
    cwd: runtimeService?.cwd ?? command.cwd,
    port: runtimeService?.port ?? null,
    url: runtimeService?.url ?? null,
    canStart: canStartServices && !command.disabledReason,
    canRun: false,
    workspaceCommandId: command.id,
    runtimeServiceId: runtimeService?.id ?? null,
    serviceIndex: command.serviceIndex,
    disabledReason: command.disabledReason,
  };
}

function buildJobItem(
  command: WorkspaceCommandDefinition,
  canRunJobs: boolean,
): WorkspaceRuntimeControlItem {
  return {
    key: `command:${command.id}`,
    title: command.name,
    kind: "job",
    statusLabel: "run once",
    lifecycle: null,
    healthStatus: null,
    command: command.command,
    cwd: command.cwd,
    port: null,
    url: null,
    canStart: false,
    canRun: canRunJobs && !command.disabledReason && Boolean(command.command),
    workspaceCommandId: command.id,
    runtimeServiceId: null,
    serviceIndex: null,
    disabledReason: command.disabledReason ?? (!command.command ? "This job is missing a command." : null),
  };
}

export function buildWorkspaceRuntimeControlSections(input: {
  runtimeConfig: Record<string, unknown> | null | undefined;
  runtimeServices: WorkspaceRuntimeService[] | null | undefined;
  canStartServices: boolean;
  canRunJobs?: boolean;
}): WorkspaceRuntimeControlSections {
  const commands = listWorkspaceCommandDefinitions(input.runtimeConfig);
  const runtimeServices = [...(input.runtimeServices ?? [])];
  const matchedRuntimeServiceIds = new Set<string>();
  const services: WorkspaceRuntimeControlItem[] = [];
  const jobs: WorkspaceRuntimeControlItem[] = [];

  for (const command of commands) {
    if (command.kind === "job") {
      jobs.push(buildJobItem(command, input.canRunJobs ?? input.canStartServices));
      continue;
    }

    const runtimeService = matchWorkspaceRuntimeServiceToCommand(command, runtimeServices);
    if (runtimeService) matchedRuntimeServiceIds.add(runtimeService.id);
    services.push(buildServiceItem(command, runtimeService, input.canStartServices));
  }

  const otherServices = runtimeServices.flatMap((runtimeService) => (!matchedRuntimeServiceIds.has(runtimeService.id)
      && (runtimeService.status === "starting" || runtimeService.status === "running")) ? [({
      key: `runtime:${runtimeService.id}`,
      title: runtimeService.serviceName,
      kind: "service" as const,
      statusLabel: runtimeService.status,
      lifecycle: runtimeService.lifecycle,
      healthStatus: runtimeService.healthStatus,
      command: runtimeService.command ?? null,
      cwd: runtimeService.cwd ?? null,
      port: runtimeService.port ?? null,
      url: runtimeService.url ?? null,
      canStart: false,
      canRun: false,
      workspaceCommandId: null,
      runtimeServiceId: runtimeService.id,
      serviceIndex: runtimeService.configIndex ?? null,
      disabledReason: "This runtime service no longer matches a configured workspace command.",
    })] : []);

  return {
    services,
    jobs,
    otherServices,
  };
}

export function buildWorkspaceRuntimeControlItems(input: {
  runtimeConfig: Record<string, unknown> | null | undefined;
  runtimeServices: WorkspaceRuntimeService[] | null | undefined;
  canStartServices: boolean;
  canRunJobs?: boolean;
}): LegacyWorkspaceRuntimeControlItem[] {
  return buildWorkspaceRuntimeControlSections(input).services.map((item) => ({
    ...item,
    status: item.statusLabel,
  }));
}
