import type { Issue } from "@paperclipai/shared";
import { PluginSlotMount, usePluginSlots } from "@/plugins/slots";
import { TabsContent } from "@/components/ui/tabs";
import { issuePluginContext, issuePluginTabValue } from "./issue-detail-plugin-utils";

export function IssueDetailPluginTabContents({ issue }: { issue: Issue }) {
  const { slots } = usePluginSlots({
    slotTypes: ["detailTab"],
    entityType: "issue",
    companyId: issue.companyId,
    enabled: !!issue.companyId,
  });
  const context = issuePluginContext(issue);

  return (
    <>
      {slots.map((slot) => (
        <TabsContent key={`${slot.pluginKey}:${slot.id}`} value={issuePluginTabValue(slot)}>
          <PluginSlotMount
            slot={slot}
            context={context}
            missingBehavior="placeholder"
          />
        </TabsContent>
      ))}
    </>
  );
}
