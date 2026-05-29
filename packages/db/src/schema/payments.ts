import { index, integer, pgTable, text, timestamp, uuid, date, boolean } from "drizzle-orm/pg-core";
import { calendarItems } from "./calendar_items.js";
import { companies } from "./companies.js";

export const paymentProfiles = pgTable(
  "payment_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    accountLabel: text("account_label").notNull(),
    ownerName: text("owner_name"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyActiveIdx: index("payment_profiles_company_active_idx").on(table.companyId, table.active),
    companyMethodIdx: index("payment_profiles_company_method_idx").on(table.companyId, table.method),
  }),
);

export const paymentEntries = pgTable(
  "payment_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    calendarItemId: uuid("calendar_item_id").references(() => calendarItems.id, { onDelete: "set null" }),
    paymentProfileId: uuid("payment_profile_id").references(() => paymentProfiles.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    providerName: text("provider_name"),
    dueDate: date("due_date"),
    expectedAmountCents: integer("expected_amount_cents"),
    currency: text("currency").notNull().default("BRL"),
    paidAmountCents: integer("paid_amount_cents").notNull().default(0),
    status: text("status").notNull().default("open"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusDueIdx: index("payment_entries_company_status_due_idx").on(table.companyId, table.status, table.dueDate),
    companyCalendarIdx: index("payment_entries_company_calendar_idx").on(table.companyId, table.calendarItemId),
    companyProfileIdx: index("payment_entries_company_profile_idx").on(table.companyId, table.paymentProfileId),
  }),
);

export const paymentRecords = pgTable(
  "payment_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    paymentEntryId: uuid("payment_entry_id").notNull().references(() => paymentEntries.id, { onDelete: "cascade" }),
    paymentProfileId: uuid("payment_profile_id").references(() => paymentProfiles.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    proofUrl: text("proof_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyEntryIdx: index("payment_records_company_entry_idx").on(table.companyId, table.paymentEntryId),
    companyPaidAtIdx: index("payment_records_company_paid_at_idx").on(table.companyId, table.paidAt),
    companyProfileIdx: index("payment_records_company_profile_idx").on(table.companyId, table.paymentProfileId),
  }),
);
