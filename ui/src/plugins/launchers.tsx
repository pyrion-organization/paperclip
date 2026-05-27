import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  PluginLauncherPlacementZone,
  PluginUiSlotEntityType,
} from "@paperclipai/shared/constants";
import { pluginsApi, type PluginUiContribution } from "@/api/plugins";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/classnames";
import {
  usePluginLauncherRuntime,
  type PluginLauncherContext,
  type ResolvedPluginLauncher,
} from "./launcher-runtime";

export {
  PluginLauncherProvider,
  usePluginLauncherRuntime,
} from "./launcher-runtime";
export type {
  PluginLauncherContext,
  ResolvedPluginLauncher,
} from "./launcher-runtime";

type UsePluginLaunchersFilters = {
  placementZones: PluginLauncherPlacementZone[];
  entityType?: PluginUiSlotEntityType | null;
  companyId?: string | null;
  enabled?: boolean;
};

type UsePluginLaunchersResult = {
  launchers: ResolvedPluginLauncher[];
  contributionsByPluginId: Map<string, PluginUiContribution>;
  isLoading: boolean;
  errorMessage: string | null;
};

const entityScopedZones = new Set<PluginLauncherPlacementZone>([
  "detailTab",
  "taskDetailView",
  "contextMenuItem",
  "commentAnnotation",
  "commentContextMenuItem",
  "projectSidebarItem",
  "toolbarButton",
]);

const PLUGIN_LAUNCHER_QUERY_DEFER_MS = 1_000;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Unknown error";
}

function useDeferredQueryEnabled(enabled: boolean): boolean {
  const [deferredEnabled, setDeferredEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDeferredEnabled(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDeferredEnabled(true);
    }, PLUGIN_LAUNCHER_QUERY_DEFER_MS);

    return () => window.clearTimeout(timeoutId);
  }, [enabled]);

  return deferredEnabled;
}

function launcherRoutePath(launcher: ResolvedPluginLauncher): string | null {
  if (launcher.action.type !== "navigate" && launcher.action.type !== "deepLink") return null;
  if (/^https?:\/\//.test(launcher.action.target)) return null;
  const [pathOnly] = launcher.action.target.split(/[?#]/, 1);
  const segment = pathOnly?.split("/").filter(Boolean).at(-1);
  return segment ? segment.toLowerCase() : null;
}

function launcherDisplayName(launcher: ResolvedPluginLauncher, contribution: PluginUiContribution | undefined): string {
  if (launcher.placementZone !== "sidebar" || !contribution) return launcher.displayName;
  const routePath = launcherRoutePath(launcher);
  if (!routePath) return launcher.displayName;
  const routeSidebar = contribution.slots.find((slot) =>
    slot.type === "routeSidebar" && slot.routePath?.toLowerCase() === routePath
  );
  return routeSidebar?.displayName ?? launcher.displayName;
}

function launcherTriggerClassName(placementZone: PluginLauncherPlacementZone): string {
  switch (placementZone) {
    case "projectSidebarItem":
      return "justify-start h-auto px-3 py-1 text-[12px] font-normal text-muted-foreground hover:text-foreground";
    case "contextMenuItem":
    case "commentContextMenuItem":
      return "justify-start h-7 w-full px-2 text-xs font-normal";
    case "sidebar":
    case "sidebarPanel":
      return "justify-start h-8 w-full";
    case "toolbarButton":
    case "globalToolbarButton":
      return "h-8";
    default:
      return "h-8";
  }
}

/**
 * Discover launchers for the requested host placement zones from the normalized
 * `/api/plugins/ui-contributions` response.
 */
export function usePluginLaunchers(
  filters: UsePluginLaunchersFilters,
): UsePluginLaunchersResult {
  const requestedEnabled = filters.enabled ?? true;
  const queryEnabled = useDeferredQueryEnabled(requestedEnabled);
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.plugins.uiContributions,
    queryFn: () => pluginsApi.listUiContributions(),
    enabled: queryEnabled,
  });

  const placementZonesKey = useMemo(
    () => [...filters.placementZones].sort().join("|"),
    [filters.placementZones],
  );

  const contributionsByPluginId = useMemo(() => {
    const byPluginId = new Map<string, PluginUiContribution>();
    for (const contribution of data ?? []) {
      byPluginId.set(contribution.pluginId, contribution);
    }
    return byPluginId;
  }, [data]);

  const launchers = useMemo(() => {
    const placementZones = new Set(
      placementZonesKey.split("|").filter(Boolean) as PluginLauncherPlacementZone[],
    );
    const rows: ResolvedPluginLauncher[] = [];
    for (const contribution of data ?? []) {
      for (const launcher of contribution.launchers) {
        if (!placementZones.has(launcher.placementZone)) continue;
        if (entityScopedZones.has(launcher.placementZone)) {
          if (!filters.entityType) continue;
          if (!launcher.entityTypes?.includes(filters.entityType)) continue;
        }
        rows.push({
          ...launcher,
          pluginId: contribution.pluginId,
          pluginKey: contribution.pluginKey,
          pluginDisplayName: contribution.displayName,
          pluginVersion: contribution.version,
          uiEntryFile: contribution.uiEntryFile,
        });
      }
    }

    rows.sort((a, b) => {
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      const pluginCmp = a.pluginDisplayName.localeCompare(b.pluginDisplayName);
      if (pluginCmp !== 0) return pluginCmp;
      return a.displayName.localeCompare(b.displayName);
    });

    return rows;
  }, [data, filters.entityType, placementZonesKey]);

  return {
    launchers,
    contributionsByPluginId,
    isLoading: queryEnabled && isLoading,
    errorMessage: error ? getErrorMessage(error) : null,
  };
}

function DefaultLauncherTrigger({
  displayName,
  launcher,
  placementZone,
  className,
  onClick,
}: {
  displayName?: string;
  launcher: ResolvedPluginLauncher;
  placementZone: PluginLauncherPlacementZone;
  className?: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button
      type="button"
      variant={placementZone === "toolbarButton" || placementZone === "globalToolbarButton" ? "outline" : "ghost"}
      size="sm"
      className={cn(launcherTriggerClassName(placementZone), className)}
      onClick={onClick}
    >
      {displayName ?? launcher.displayName}
    </Button>
  );
}

type PluginLauncherOutletProps = {
  placementZones: PluginLauncherPlacementZone[];
  context: PluginLauncherContext;
  entityType?: PluginUiSlotEntityType | null;
  className?: string;
  itemClassName?: string;
  errorClassName?: string;
};

export function PluginLauncherOutlet({
  placementZones,
  context,
  entityType,
  className,
  itemClassName,
  errorClassName,
}: PluginLauncherOutletProps) {
  const { activateLauncher } = usePluginLauncherRuntime();
  const { launchers, contributionsByPluginId, errorMessage } = usePluginLaunchers({
    placementZones,
    entityType,
    companyId: context.companyId,
    enabled: !!context.companyId,
  });

  if (errorMessage) {
    return (
      <div className={cn("rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive", errorClassName)}>
        Plugin launchers unavailable: {errorMessage}
      </div>
    );
  }

  if (launchers.length === 0) return null;

  return (
    <div className={className}>
      {launchers.map((launcher) => (
        <div key={`${launcher.pluginKey}:${launcher.id}`} className={itemClassName}>
          <DefaultLauncherTrigger
            displayName={launcherDisplayName(launcher, contributionsByPluginId.get(launcher.pluginId))}
            launcher={launcher}
            placementZone={launcher.placementZone}
            onClick={(event) => {
              const contribution = contributionsByPluginId.get(launcher.pluginId);
              if (!contribution) return;
              void activateLauncher(launcher, context, contribution, event.currentTarget);
            }}
          />
        </div>
      ))}
    </div>
  );
}

type PluginLauncherButtonProps = {
  launcher: ResolvedPluginLauncher;
  context: PluginLauncherContext;
  contribution: PluginUiContribution;
  className?: string;
  onActivated?: () => void;
};

export function PluginLauncherButton({
  launcher,
  context,
  contribution,
  className,
  onActivated,
}: PluginLauncherButtonProps) {
  const { activateLauncher } = usePluginLauncherRuntime();

  return (
    <DefaultLauncherTrigger
      launcher={launcher}
      placementZone={launcher.placementZone}
      displayName={launcher.displayName}
      className={className}
      onClick={(event) => {
        void activateLauncher(launcher, context, contribution, event.currentTarget).then(() => {
          onActivated?.();
        });
      }}
    />
  );
}

export type { PluginLauncherDeclaration } from "@paperclipai/shared/types/plugin";
