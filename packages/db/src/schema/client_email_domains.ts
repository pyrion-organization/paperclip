import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";

export const clientEmailDomains = pgTable(
  "client_email_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    domain: text("domain").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("client_email_domains_company_idx").on(table.companyId),
    clientIdx: index("client_email_domains_client_idx").on(table.clientId),
    companyDomainUniqueIdx: uniqueIndex("client_email_domains_company_domain_unique").on(table.companyId, table.domain),
  }),
);
