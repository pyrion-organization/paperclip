import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { issues } from "./issues.js";
import { approvals } from "./approvals.js";
import { agents } from "./agents.js";

export const projectDeploymentTargets = pgTable(
  "project_deployment_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    environment: text("environment").notNull().default("production"),
    provider: text("provider").notNull().default("manual"),
    targetUrl: text("target_url"),
    healthCheckUrl: text("health_check_url"),
    deployNotes: text("deploy_notes"),
    rollbackInstructions: text("rollback_instructions"),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProjectIdx: index("project_deployment_targets_company_project_idx").on(
      table.companyId,
      table.projectId,
    ),
    projectNameUq: uniqueIndex("project_deployment_targets_project_name_uq").on(
      table.projectId,
      table.name,
    ),
  }),
);

export const projectDeployEvents = pgTable(
  "project_deploy_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    deploymentTargetId: uuid("deployment_target_id").references(() => projectDeploymentTargets.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    approvalId: uuid("approval_id").references(() => approvals.id, { onDelete: "set null" }),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    changedFiles: jsonb("changed_files").$type<string[]>().notNull().default([]),
    testsRun: jsonb("tests_run").$type<string[]>().notNull().default([]),
    rollbackPlan: text("rollback_plan").notNull(),
    maintenanceMessage: text("maintenance_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProjectIdx: index("project_deploy_events_company_project_idx").on(
      table.companyId,
      table.projectId,
    ),
    approvalIdx: index("project_deploy_events_approval_idx").on(table.approvalId),
    issueIdx: index("project_deploy_events_issue_idx").on(table.issueId),
  }),
);
