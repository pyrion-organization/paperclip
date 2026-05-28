import type { Issue } from "@paperclipai/shared";
import type { InboxIssueColumn } from "../lib/inbox";
import { timeAgo } from "../lib/timeAgo";

export const issueTrailingColumns: InboxIssueColumn[] = ["assignee", "project", "workspace", "parent", "labels", "updated"];

export function issueActivityText(issue: Issue): string {
  return `Updated ${timeAgo(issue.lastActivityAt ?? issue.lastExternalCommentAt ?? issue.updatedAt)}`;
}
