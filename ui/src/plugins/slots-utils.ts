import type { ResolvedPluginSlot } from "./slots";

export function resolveRouteSidebarSlot(
  slots: ResolvedPluginSlot[],
  routePath: string | null,
): ResolvedPluginSlot | null {
  if (!routePath) return null;

  const pageMatches = slots.filter((slot) => slot.type === "page" && slot.routePath === routePath);
  if (pageMatches.length !== 1) return null;

  const [pageSlot] = pageMatches;
  const sidebarMatches = slots.filter((slot) =>
    slot.type === "routeSidebar"
    && slot.routePath === routePath
    && slot.pluginId === pageSlot.pluginId,
  );

  if (sidebarMatches.length !== 1) return null;
  return sidebarMatches[0] ?? null;
}
