import type { Issue } from "@paperclipai/shared";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { PluginSlotMount, PluginSlotOutlet, usePluginSlots } from "@/plugins/slots";
import { TabsContent, TabsTrigger } from "@/components/ui/tabs";

type IssueDetailPluginContext = {
  companyId: string;
  projectId: string | null;
  entityId: string;
  entityType: "issue";
};

function issuePluginContext(issue: Issue): IssueDetailPluginContext {
  return {
    companyId: issue.companyId,
    projectId: issue.projectId ?? null,
    entityId: issue.id,
    entityType: "issue",
  };
}

function issuePluginTabValue(slot: { pluginKey: string; id: string }) {
  return `plugin:${slot.pluginKey}:${slot.id}`;
}

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
