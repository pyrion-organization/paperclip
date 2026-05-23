import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { approvals } from "./approvals.js";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { projectDeploymentTargets } from "./project_deployments.js";
import { projects } from "./projects.js";

export const projectInfraTargets = pgTable(
  "project_infra_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    deploymentTargetId: uuid("deployment_target_id").references(() => projectDeploymentTargets.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    environment: text("environment").notNull().default("production"),
    provider: text("provider").notNull().default("manual"),
    providerAccountRef: text("provider_account_ref"),
    region: text("region"),
    role: text("role").notNull().default("app"),
    host: text("host"),
    failoverGroup: text("failover_group"),
    failoverRank: integer("failover_rank"),
    status: text("status").notNull().default("active"),
    repairActionsRequireApproval: boolean("repair_actions_require_approval").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProjectIdx: index("project_infra_targets_company_project_idx").on(table.companyId, table.projectId),
    deploymentTargetIdx: index("project_infra_targets_deployment_target_idx").on(table.deploymentTargetId),
  }),
);

export const projectInfraHealthChecks = pgTable(
  "project_infra_health_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    infraTargetId: uuid("infra_target_id").references(() => projectInfraTargets.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    checkType: text("check_type").notNull().default("http"),
    url: text("url"),
    expectedStatus: integer("expected_status"),
    intervalSeconds: integer("interval_seconds").notNull().default(300),
    timeoutSeconds: integer("timeout_seconds").notNull().default(10),
    status: text("status").notNull().default("unknown"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastLatencyMs: integer("last_latency_ms"),
    lastError: text("last_error"),
    enabled: boolean("enabled").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProjectIdx: index("project_infra_health_checks_company_project_idx").on(table.companyId, table.projectId),
    infraTargetIdx: index("project_infra_health_checks_target_idx").on(table.infraTargetId),
  }),
);

export const projectInfraIncidents = pgTable(
  "project_infra_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    infraTargetId: uuid("infra_target_id").references(() => projectInfraTargets.id, { onDelete: "set null" }),
    healthCheckId: uuid("health_check_id").references(() => projectInfraHealthChecks.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id"),
    status: text("status").notNull().default("open"),
    severity: text("severity").notNull().default("high"),
    summary: text("summary").notNull(),
    details: text("details"),
    recommendedAction: text("recommended_action"),
    repairApprovalId: uuid("repair_approval_id").references(() => approvals.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProjectIdx: index("project_infra_incidents_company_project_idx").on(table.companyId, table.projectId),
    issueIdx: index("project_infra_incidents_issue_idx").on(table.issueId),
    sourceIdx: index("project_infra_incidents_source_idx").on(table.companyId, table.sourceKind, table.sourceId),
    healthCheckIdx: index("project_infra_incidents_health_check_idx").on(table.healthCheckId),
  }),
);
