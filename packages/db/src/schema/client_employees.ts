import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";

export const clientEmployees = pgTable(
  "client_employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    name: text("name").notNull(),
    role: text("role").notNull(),
    email: text("email").notNull(),
    projectScope: text("project_scope").notNull().default("all_linked_projects"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("client_employees_company_idx").on(table.companyId),
    clientIdx: index("client_employees_client_idx").on(table.clientId),
    companyClientEmailUniqueIdx: uniqueIndex("client_employees_company_client_email_unique").on(
      table.companyId,
      table.clientId,
      table.email,
    ),
  }),
);
