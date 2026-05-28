import type { Issue } from "@paperclipai/shared";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { PluginSlotOutlet } from "@/plugins/slots";
import { issuePluginContext } from "./issue-detail-plugin-utils";
export { IssueDetailPluginTabContents } from "./IssueDetailPluginTabContents";
export { IssueDetailPluginTabTriggers } from "./IssueDetailPluginTabTriggers";

export function IssueDetailPluginToolbarExtensions({ issue }: { issue: Issue }) {
  const context = issuePluginContext(issue);

  return (
    <>
      <PluginSlotOutlet
        slotTypes={["toolbarButton", "contextMenuItem"]}
        entityType="issue"
        context={context}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
        missingBehavior="placeholder"
      />

      <PluginLauncherOutlet
        placementZones={["toolbarButton"]}
        entityType="issue"
        context={context}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
      />

      <PluginSlotOutlet
        slotTypes={["taskDetailView"]}
        entityType="issue"
        context={context}
        className="space-y-3"
        itemClassName="rounded-lg border border-border p-3"
        missingBehavior="placeholder"
      />
    </>
  );
}
