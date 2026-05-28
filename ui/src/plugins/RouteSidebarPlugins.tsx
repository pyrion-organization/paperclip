import { useMemo, type ReactNode } from "react";

import { PluginSlotMount, usePluginSlots } from "./slots";
import { resolveRouteSidebarSlot } from "./slots-utils";

type RouteSidebarPluginsProps = {
  companyId: string;
  companyPrefix: string;
  routePath: string;
  fallback: ReactNode;
};

export function RouteSidebarPlugins({
  companyId,
  companyPrefix,
  routePath,
  fallback,
}: RouteSidebarPluginsProps) {
  const { slots } = usePluginSlots({
    slotTypes: ["page", "routeSidebar"],
    companyId,
    enabled: Boolean(companyId && routePath),
  });
  const routeSidebarSlot = useMemo(
    () => resolveRouteSidebarSlot(slots, routePath),
    [routePath, slots],
  );
  const sidebarContext = useMemo(
    () => ({
      companyId,
      companyPrefix,
    }),
    [companyId, companyPrefix],
  );

  if (!routeSidebarSlot) return <>{fallback}</>;

  return (
    <PluginSlotMount
      slot={routeSidebarSlot}
      context={sidebarContext}
      className="size-full"
      missingBehavior="placeholder"
    />
  );
}
