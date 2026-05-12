import { pgTable, uuid, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export type IssueCompletionEmailNotificationPayload = {
  issueTitle: string;
  issueIdentifier: string | null;
  completedByName: string;
  completedByKind: "agent" | "user";
  agentComment: string | null;
  issueDescription: string | null;
  completedAt: string;
};

export const emailNotifications = pgTable(
  "email_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pending"),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    recipientUserId: text("recipient_user_id"),
    recipientEmail: text("recipient_email"),
    subject: text("subject"),
    payload: jsonb("payload").$type<IssueCompletionEmailNotificationPayload>(),
    requestedByActorType: text("requested_by_actor_type").notNull().default("system"),
    requestedByActorId: text("requested_by_actor_id").notNull().default("email-notifications"),
    requestedByAgentId: uuid("requested_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    requestedByRunId: uuid("requested_by_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    skippedAt: timestamp("skipped_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastError: text("last_error"),
    skipReason: text("skip_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusScheduledIdx: index("email_notifications_company_status_scheduled_idx").on(
      table.companyId,
      table.status,
      table.scheduledAt,
    ),
    issueKindCreatedIdx: index("email_notifications_issue_kind_created_idx").on(
      table.issueId,
      table.kind,
      table.createdAt,
    ),
    statusUpdatedIdx: index("email_notifications_status_updated_idx").on(table.status, table.updatedAt),
  }),
);
