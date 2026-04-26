import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import type { IssueAssignmentWakeupDeps } from "./issue-assignment-wakeup.js";
import { queueIssueAssignmentWakeup } from "./issue-assignment-wakeup.js";

export function issueSchedulerService(db: Db, heartbeat: IssueAssignmentWakeupDeps) {
  return {
    async tickScheduledIssues(now: Date): Promise<{ promoted: number }> {
      const dueIssues = await db
        .select()
        .from(issues)
        .where(
          and(
            eq(issues.status, "backlog"),
            isNotNull(issues.scheduledAt),
            lte(issues.scheduledAt, now),
          ),
        );

      let promoted = 0;
      for (const issue of dueIssues) {
        try {
          await db
            .update(issues)
            .set({ status: "todo", updatedAt: now })
            .where(eq(issues.id, issue.id));

          void queueIssueAssignmentWakeup({
            heartbeat,
            issue: { id: issue.id, assigneeAgentId: issue.assigneeAgentId, status: "todo" },
            reason: "issue_status_changed",
            mutation: "scheduled_start",
            contextSource: "issue.scheduled_start",
            requestedByActorType: "system",
          });
          promoted++;
        } catch (err) {
          logger.error({ err, issueId: issue.id }, "failed to promote scheduled issue to todo");
        }
      }

      return { promoted };
    },
  };
}
