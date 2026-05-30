import { Activity, ExternalLink, Loader2, Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classnames";
import type {
  LegacyWorkspaceRuntimeControlItem,
  WorkspaceRuntimeAction,
  WorkspaceRuntimeControlItem,
  WorkspaceRuntimeControlRequest,
  WorkspaceRuntimeControlSections,
} from "./workspace-runtime-controls-utils";

export type {
  WorkspaceRuntimeAction,
  WorkspaceRuntimeControlItem,
  WorkspaceRuntimeControlRequest,
  WorkspaceRuntimeControlSections,
} from "./workspace-runtime-controls-utils";

type WorkspaceRuntimeControlsProps = {
  sections: WorkspaceRuntimeControlSections;
  items?: never;
  isPending?: boolean;
  pendingRequest?: WorkspaceRuntimeControlRequest | null;
  serviceEmptyMessage?: string;
  jobEmptyMessage?: string;
  emptyMessage?: never;
  disabledHint?: string | null;
  onAction: (request: WorkspaceRuntimeControlRequest) => void;
  className?: string;
  square?: boolean;
} | {
  sections?: never;
  items: LegacyWorkspaceRuntimeControlItem[];
  isPending?: boolean;
  pendingRequest?: WorkspaceRuntimeControlRequest | null;
  serviceEmptyMessage?: never;
  jobEmptyMessage?: never;
  emptyMessage?: string;
  disabledHint?: string | null;
  onAction: (request: WorkspaceRuntimeControlRequest) => void;
  className?: string;
  square?: boolean;
};

function hasRunningRuntimeServices(
  runtimeServices: Array<{ status: string }> | null | undefined,
) {
  return (runtimeServices ?? []).some((service) => service.status === "starting" || service.status === "running");
}

function getRunningRuntimeServiceUrl(
  sections: WorkspaceRuntimeControlSections,
) {
  const runningService = [...sections.services, ...sections.otherServices].find(
    (item) => (item.statusLabel === "running" || item.statusLabel === "starting") && item.url,
  );
  return runningService?.url ?? null;
}

function requestMatchesPending(
  pendingRequest: WorkspaceRuntimeControlRequest | null | undefined,
  nextRequest: WorkspaceRuntimeControlRequest,
) {
  return pendingRequest?.action === nextRequest.action
    && (pendingRequest?.workspaceCommandId ?? null) === (nextRequest.workspaceCommandId ?? null)
    && (pendingRequest?.runtimeServiceId ?? null) === (nextRequest.runtimeServiceId ?? null)
    && (pendingRequest?.serviceIndex ?? null) === (nextRequest.serviceIndex ?? null);
}

function buildRequest(item: WorkspaceRuntimeControlItem, action: WorkspaceRuntimeAction): WorkspaceRuntimeControlRequest {
  return {
    action,
    workspaceCommandId: item.workspaceCommandId ?? null,
    runtimeServiceId: item.runtimeServiceId ?? null,
    serviceIndex: item.serviceIndex ?? null,
  };
}

function CommandActionButtons({
  item,
  isPending,
  pendingRequest,
  onAction,
  square,
}: {
  item: WorkspaceRuntimeControlItem;
  isPending: boolean;
  pendingRequest: WorkspaceRuntimeControlRequest | null | undefined;
  onAction: (request: WorkspaceRuntimeControlRequest) => void;
  square?: boolean;
}) {
  const actions: WorkspaceRuntimeAction[] =
    item.kind === "job"
      ? ["run"]
      : item.statusLabel === "running" || item.statusLabel === "starting"
        ? ["stop", ...(item.canStart ? ["restart" as const] : [])]
        : ["start"];

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
      {actions.map((action) => {
        const request = buildRequest(item, action);
        const Icon = action === "stop" ? Square : action === "restart" ? RotateCcw : Play;
        const label = action === "run"
          ? "Run"
          : action === "start"
            ? "Start"
            : action === "stop"
              ? "Stop"
              : "Restart";
        const showSpinner = isPending && requestMatchesPending(pendingRequest, request);
        const disabled =
          isPending
          || (action === "run" && !item.canRun)
          || ((action === "start" || action === "restart") && !item.canStart);

        return (
          <Button
            key={`${item.key}:${action}`}
            variant={action === "stop" ? "destructive" : action === "restart" ? "outline" : "default"}
            size="sm"
            className={cn(
              "w-full justify-start sm:w-auto",
              square ? "rounded-none" : null,
            )}
            disabled={disabled}
            onClick={() => onAction(request)}
          >
            {showSpinner ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
            {label}
          </Button>
        );
      })}
    </div>
  );
}

function CommandSection({
  title,
  description,
  items,
  emptyMessage,
  disabledHint,
  isPending,
  pendingRequest,
  onAction,
  square,
}: {
  title: string;
  description: string;
  items: WorkspaceRuntimeControlItem[];
  emptyMessage: string;
  disabledHint?: string | null;
  isPending: boolean;
  pendingRequest: WorkspaceRuntimeControlRequest | null | undefined;
  onAction: (request: WorkspaceRuntimeControlRequest) => void;
  square?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {items.length === 0 ? (
        <div className={cn("border border-dashed border-border/80 bg-background px-3 py-4 text-sm text-muted-foreground", square ? "rounded-none" : "rounded-xl")}>
          {emptyMessage}
          {disabledHint ? <p className="mt-2 text-xs">{disabledHint}</p> : null}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.key} className={cn("border border-border/80 bg-background p-3", square ? "rounded-none" : "rounded-xl")}>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.kind} · {item.statusLabel}
                      {item.lifecycle ? ` · ${item.lifecycle}` : ""}
                    </div>
                  </div>
                  <CommandActionButtons
                    item={item}
                    isPending={isPending}
                    pendingRequest={pendingRequest}
                    onAction={onAction}
                    square={square}
                  />
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                      {item.url}
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                  {item.port ? <div>Port {item.port}</div> : null}
                  {item.command ? <div className="break-all font-mono">{item.command}</div> : null}
                  {item.cwd ? <div className="break-all font-mono">{item.cwd}</div> : null}
                  {item.disabledReason ? <div>{item.disabledReason}</div> : null}
                </div>
                {item.healthStatus && item.statusLabel !== "stopped" ? (
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px]",
                      item.healthStatus === "healthy"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : item.healthStatus === "unhealthy"
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : "border-border text-muted-foreground",
                    )}>
                      {item.healthStatus}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceRuntimeControls({
  sections,
  items,
  isPending = false,
  pendingRequest = null,
  serviceEmptyMessage = "No services are configured for this workspace.",
  jobEmptyMessage = "No one-shot jobs are configured for this workspace.",
  emptyMessage,
  disabledHint = null,
  onAction,
  className,
  square,
}: WorkspaceRuntimeControlsProps) {
  const resolvedSections = sections ?? {
    services: (items ?? []).map((item) => ({
      ...item,
      statusLabel: item.statusLabel ?? item.status ?? "stopped",
    })),
    jobs: [],
    otherServices: [],
  };
  const resolvedServiceEmptyMessage = emptyMessage ?? serviceEmptyMessage;
  const runningCount = [...resolvedSections.services, ...resolvedSections.otherServices].filter(
    (item) => item.statusLabel === "running" || item.statusLabel === "starting",
  ).length;
  const visibleDisabledHint = runningCount > 0 || disabledHint === null ? null : disabledHint;

  return (
    <div className={cn("space-y-4", className)}>
      <div className={cn("border border-border/70 bg-background p-3", square ? "rounded-none" : "rounded-xl")}>
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Workspace commands</div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                runningCount > 0
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              <Activity className="size-3.5" />
              {runningCount > 0 ? `${runningCount} services running` : "No services running"}
            </span>
            <span className="text-xs text-muted-foreground">
              {resolvedSections.jobs.length > 0
                ? `${resolvedSections.jobs.length} job${resolvedSections.jobs.length === 1 ? "" : "s"} available to run on demand.`
                : "Each command can be controlled independently."}
            </span>
          </div>
          {visibleDisabledHint ? <p className="text-xs text-muted-foreground">{visibleDisabledHint}</p> : null}
        </div>
      </div>

      <CommandSection
        title="Services"
        description="Long-running commands that Paperclip can supervise for this workspace."
        items={resolvedSections.services}
        emptyMessage={resolvedServiceEmptyMessage}
        disabledHint={visibleDisabledHint}
        isPending={isPending}
        pendingRequest={pendingRequest}
        onAction={onAction}
        square={square}
      />

      <CommandSection
        title="Jobs"
        description="One-shot commands that run now and exit when they finish."
        items={resolvedSections.jobs}
        emptyMessage={jobEmptyMessage}
        isPending={isPending}
        pendingRequest={pendingRequest}
        onAction={onAction}
        square={square}
      />

      {resolvedSections.otherServices.length > 0 ? (
        <CommandSection
          title="Untracked services"
          description="Running services that no longer match the current workspace command config."
          items={resolvedSections.otherServices}
          emptyMessage=""
          isPending={isPending}
          pendingRequest={pendingRequest}
          onAction={onAction}
          square={square}
        />
      ) : null}
    </div>
  );
}

export function WorkspaceRuntimeQuickControls({
  sections,
  isPending = false,
  pendingRequest = null,
  onAction,
  square,
}: {
  sections: WorkspaceRuntimeControlSections;
  isPending?: boolean;
  pendingRequest?: WorkspaceRuntimeControlRequest | null;
  onAction: (request: WorkspaceRuntimeControlRequest) => void;
  square?: boolean;
}) {
  const controlItems = sections.services.length > 0 ? sections.services : sections.otherServices;
  const serviceUrl = getRunningRuntimeServiceUrl(sections);

  if (controlItems.length === 0 && !serviceUrl) return null;

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
      {controlItems.length > 0 ? (
        <div className="flex max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {controlItems.map((item) => (
            <div key={item.key} className="flex min-w-0 flex-col gap-1 sm:items-end">
              {controlItems.length > 1 ? (
                <span className="truncate text-xs text-muted-foreground">{item.title}</span>
              ) : null}
              <CommandActionButtons
                item={item}
                isPending={isPending}
                pendingRequest={pendingRequest}
                onAction={onAction}
                square={square}
              />
            </div>
          ))}
        </div>
      ) : null}
      {serviceUrl ? (
        <a
          href={serviceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1 self-start break-all text-xs text-muted-foreground hover:text-foreground hover:underline sm:self-end"
        >
          {serviceUrl}
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ) : null}
    </div>
  );
}
