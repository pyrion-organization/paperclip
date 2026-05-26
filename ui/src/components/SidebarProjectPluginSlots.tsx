import { PluginSlotMount, usePluginSlots } from "@/plugins/slots";

type SidebarProjectPluginSlotsProps = {
  companyId: string | null;
  companyPrefix: string | null;
  projectId: string;
  projectRef: string;
};

export function SidebarProjectPluginSlots({
  companyId,
  companyPrefix,
  projectId,
  projectRef,
}: SidebarProjectPluginSlotsProps) {
  const { slots } = usePluginSlots({
    slotTypes: ["projectSidebarItem"],
    entityType: "project",
    companyId,
    enabled: !!companyId,
  });

  if (slots.length === 0) return null;

  return (
    <div className="ml-5 flex flex-col gap-0.5">
      {slots.map((slot) => (
        <PluginSlotMount
          key={`${projectId}:${slot.pluginKey}:${slot.id}`}
          slot={slot}
          context={{
            companyId,
            companyPrefix,
            projectId,
            projectRef,
            entityId: projectId,
            entityType: "project",
          }}
          missingBehavior="placeholder"
        />
      ))}
    </div>
  );
}
