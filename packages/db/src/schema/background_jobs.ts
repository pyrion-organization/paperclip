import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export type BackgroundJobStatus =
  | "pending"
  | "running"
  | "retrying"
  | "succeeded"
  | "failed"
  | "dead";

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").$type<BackgroundJobStatus>().notNull().default("pending"),
    dedupeKey: text("dedupe_key"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusRunAfterIdx: index("background_jobs_company_status_run_after_idx").on(
      table.companyId,
      table.status,
      table.runAfter,
    ),
    kindStatusRunAfterIdx: index("background_jobs_kind_status_run_after_idx").on(
      table.kind,
      table.status,
      table.runAfter,
    ),
    lockedAtIdx: index("background_jobs_locked_at_idx").on(table.lockedAt),
    dedupeIdx: index("background_jobs_dedupe_idx").on(table.companyId, table.kind, table.dedupeKey),
  }),
);
