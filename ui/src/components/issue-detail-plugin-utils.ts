import type { Issue } from "@paperclipai/shared";

export type IssueDetailPluginContext = {
  companyId: string;
  projectId: string | null;
  entityId: string;
  entityType: "issue";
};

export function issuePluginContext(issue: Issue): IssueDetailPluginContext {
  return {
    companyId: issue.companyId,
    projectId: issue.projectId ?? null,
    entityId: issue.id,
    entityType: "issue",
  };
}

export function issuePluginTabValue(slot: { pluginKey: string; id: string }) {
  return `plugin:${slot.pluginKey}:${slot.id}`;
}
