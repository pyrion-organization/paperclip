import { PluginLauncherOutlet } from "@/plugins/launchers";
import { PluginSlotOutlet } from "@/plugins/slots";

type SidebarPluginContext = {
  companyId: string | null;
  companyPrefix: string | null;
};

type SidebarPluginExtensionsProps = {
  context: SidebarPluginContext;
};

export function SidebarWorkPluginExtensions({ context }: SidebarPluginExtensionsProps) {
  return (
    <>
      <PluginSlotOutlet
        slotTypes={["sidebar"]}
        context={context}
        className="flex flex-col gap-0.5"
        itemClassName="text-[13px] font-medium"
        missingBehavior="placeholder"
      />
      <PluginLauncherOutlet
        placementZones={["sidebar"]}
        context={context}
        className="flex flex-col gap-0.5"
        itemClassName="text-[13px] font-medium"
      />
    </>
  );
}

export function SidebarPanelPluginExtensions({ context }: SidebarPluginExtensionsProps) {
  return (
    <PluginSlotOutlet
      slotTypes={["sidebarPanel"]}
      context={context}
      className="flex flex-col gap-3"
      itemClassName="rounded-lg border border-border p-3"
      missingBehavior="placeholder"
    />
  );
}
