import { TabsTrigger } from "@/components/ui/tabs";
import { usePluginSlots } from "@/plugins/slots";
import { issuePluginTabValue } from "./issue-detail-plugin-utils";

export function IssueDetailPluginTabTriggers({ companyId }: { companyId: string | null }) {
  const { slots } = usePluginSlots({
    slotTypes: ["detailTab"],
    entityType: "issue",
    companyId,
    enabled: !!companyId,
  });

  return (
    <>
      {slots.map((slot) => (
        <TabsTrigger key={`${slot.pluginKey}:${slot.id}`} value={issuePluginTabValue(slot)}>
          {slot.displayName}
        </TabsTrigger>
      ))}
    </>
  );
}
