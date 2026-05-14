import { pgTable, uuid, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";
import { clientEmployees } from "./client_employees.js";
import { clientProjects } from "./client_projects.js";

export const clientEmployeeProjectLinks = pgTable(
  "client_employee_project_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    employeeId: uuid("employee_id").notNull().references(() => clientEmployees.id),
    clientProjectId: uuid("client_project_id").notNull().references(() => clientProjects.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("client_employee_project_links_company_idx").on(table.companyId),
    clientIdx: index("client_employee_project_links_client_idx").on(table.clientId),
    employeeIdx: index("client_employee_project_links_employee_idx").on(table.employeeId),
    clientProjectIdx: index("client_employee_project_links_client_project_idx").on(table.clientProjectId),
    employeeProjectUniqueIdx: uniqueIndex("client_employee_project_links_employee_project_unique").on(
      table.employeeId,
      table.clientProjectId,
    ),
  }),
);
