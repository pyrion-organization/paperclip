import { pgTable, uuid, text, integer, timestamp, date, index, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";
import { projects } from "./projects.js";

export const clientProjects = pgTable(
  "client_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    projectNameOverride: text("project_name_override"),
    projectType: text("project_type"),
    status: text("status").notNull().default("active"),
    description: text("description"),
    billingType: text("billing_type"),
    amountCents: integer("amount_cents"),
    lastPaymentAt: timestamp("last_payment_at", { withTimezone: true }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("client_projects_company_idx").on(table.companyId),
    clientIdx: index("client_projects_client_idx").on(table.clientId),
    projectIdx: index("client_projects_project_idx").on(table.projectId),
    clientProjectIdx: index("client_projects_client_project_idx").on(table.clientId, table.projectId),
  }),
);
