import { index, pgTable, text, timestamp, uuid, date, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { assets } from "./assets.js";
import { clients } from "./clients.js";
import { companies } from "./companies.js";
import { documents } from "./documents.js";
import { inboundEmailAttachments, inboundEmailMessages } from "./inbound_email.js";
import { projects } from "./projects.js";

export const calendarItems = pgTable(
  "calendar_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    status: text("status").notNull().default("active"),
    riskLevel: text("risk_level").notNull().default("medium"),
    priority: text("priority").notNull().default("medium"),

    providerName: text("provider_name"),
    relatedClientId: uuid("related_client_id").references(() => clients.id, { onDelete: "set null" }),
    relatedProjectId: uuid("related_project_id").references(() => projects.id, { onDelete: "set null" }),

    dueDate: date("due_date"),
    dueTime: text("due_time"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    recurrenceType: text("recurrence_type").notNull().default("none"),
    recurrenceRule: text("recurrence_rule"),
    nextDueDate: date("next_due_date"),

    amountCents: integer("amount_cents"),
    currency: text("currency").notNull().default("BRL"),
    autoRenew: boolean("auto_renew").notNull().default(false),
    manualActionRequired: boolean("manual_action_required").notNull().default(true),
    paymentMethodLabel: text("payment_method_label"),
    paymentOwner: text("payment_owner"),
    costCenter: text("cost_center"),

    purchaseEmail: text("purchase_email"),
    accountLoginEmail: text("account_login_email"),
    billingEmail: text("billing_email"),
    recoveryEmail: text("recovery_email"),
    technicalContactEmail: text("technical_contact_email"),

    serviceUrl: text("service_url"),
    loginUrl: text("login_url"),
    billingUrl: text("billing_url"),
    documentationUrl: text("documentation_url"),

    sourceKind: text("source_kind").notNull().default("manual"),
    sourceEmailMessageId: uuid("source_email_message_id").references(() => inboundEmailMessages.id, { onDelete: "set null" }),
    confidenceScore: integer("confidence_score"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    notes: text("notes"),
    internalNotes: text("internal_notes"),

    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    updatedByAgentId: uuid("updated_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id"),

    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastReminderScannedAt: timestamp("last_reminder_scanned_at", { withTimezone: true }),
    lastDetailsScannedAt: timestamp("last_details_scanned_at", { withTimezone: true }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("calendar_items_company_status_idx").on(table.companyId, table.status),
    companyDueIdx: index("calendar_items_company_due_idx").on(table.companyId, table.nextDueDate),
    companyCategoryIdx: index("calendar_items_company_category_idx").on(table.companyId, table.category),
    companyRiskIdx: index("calendar_items_company_risk_idx").on(table.companyId, table.riskLevel),
    companySourceEmailIdx: index("calendar_items_company_source_email_idx").on(table.companyId, table.sourceEmailMessageId),
    companyProviderIdx: index("calendar_items_company_provider_idx").on(table.companyId, table.providerName),
  }),
);

export const calendarItemDocuments = pgTable(
  "calendar_item_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    calendarItemId: uuid("calendar_item_id").notNull().references(() => calendarItems.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull().default("other"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    sourceEmailMessageId: uuid("source_email_message_id").references(() => inboundEmailMessages.id, { onDelete: "set null" }),
    sourceEmailAttachmentId: uuid("source_email_attachment_id").references(() => inboundEmailAttachments.id, { onDelete: "set null" }),
    title: text("title"),
    url: text("url"),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyItemIdx: index("calendar_item_documents_company_item_idx").on(table.companyId, table.calendarItemId),
    companyTypeIdx: index("calendar_item_documents_company_type_idx").on(table.companyId, table.documentType),
    documentIdx: index("calendar_item_documents_document_idx").on(table.documentId),
    assetIdx: index("calendar_item_documents_asset_idx").on(table.assetId),
    sourceEmailAttachmentIdx: index("calendar_item_documents_source_email_attachment_idx").on(table.sourceEmailAttachmentId),
  }),
);
