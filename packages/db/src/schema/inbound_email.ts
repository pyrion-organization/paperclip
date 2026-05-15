import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { issues } from "./issues.js";
import { assets } from "./assets.js";

export type InboundMailboxProvider = "imap";
export type InboundEmailCreateMode = "issue";
export type InboundEmailMessageStatus =
  | "discovered"
  | "persisted"
  | "processing"
  | "processed"
  | "skipped"
  | "failed"
  | "duplicate";
export type InboundEmailAttachmentStatus = "stored" | "failed";

export const inboundEmailMailboxes = pgTable(
  "inbound_email_mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").$type<InboundMailboxProvider>().notNull().default("imap"),
    enabled: boolean("enabled").notNull().default(false),
    host: text("host").notNull(),
    port: integer("port").notNull().default(993),
    username: text("username").notNull(),
    passwordSecretName: text("password_secret_name"),
    folder: text("folder").notNull().default("INBOX"),
    tls: boolean("tls").notNull().default(true),
    pollIntervalSeconds: integer("poll_interval_seconds").notNull().default(60),
    targetProjectId: uuid("target_project_id").references(() => projects.id, { onDelete: "set null" }),
    createMode: text("create_mode").$type<InboundEmailCreateMode>().notNull().default("issue"),
    markSeen: boolean("mark_seen").notNull().default(true),
    lastPollAt: timestamp("last_poll_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("inbound_email_mailboxes_company_idx").on(table.companyId),
    enabledPollIdx: index("inbound_email_mailboxes_enabled_poll_idx").on(
      table.enabled,
      table.lastPollAt,
    ),
    companyNameUq: uniqueIndex("inbound_email_mailboxes_company_name_uq").on(table.companyId, table.name),
  }),
);

export const inboundEmailRules = pgTable(
  "inbound_email_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mailboxId: uuid("mailbox_id").references(() => inboundEmailMailboxes.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    senderPattern: text("sender_pattern"),
    subjectPattern: text("subject_pattern"),
    targetProjectId: uuid("target_project_id").references(() => projects.id, { onDelete: "set null" }),
    createMode: text("create_mode").$type<InboundEmailCreateMode>().notNull().default("issue"),
    priority: text("priority").notNull().default("medium"),
    labelIds: jsonb("label_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyMailboxIdx: index("inbound_email_rules_company_mailbox_idx").on(table.companyId, table.mailboxId),
    enabledIdx: index("inbound_email_rules_enabled_idx").on(table.enabled),
  }),
);

export const inboundEmailMessages = pgTable(
  "inbound_email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mailboxId: uuid("mailbox_id").notNull().references(() => inboundEmailMailboxes.id, { onDelete: "cascade" }),
    providerUid: text("provider_uid"),
    messageId: text("message_id"),
    rawSha256: text("raw_sha256").notNull(),
    fromAddress: text("from_address"),
    toAddresses: jsonb("to_addresses").$type<string[]>().notNull().default([]),
    subject: text("subject"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    status: text("status").$type<InboundEmailMessageStatus>().notNull().default("discovered"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    rawStorageKey: text("raw_storage_key"),
    rawContentType: text("raw_content_type").notNull().default("message/rfc822"),
    createdIssueId: uuid("created_issue_id").references(() => issues.id, { onDelete: "set null" }),
    error: text("error"),
    skipReason: text("skip_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyMailboxStatusIdx: index("inbound_email_messages_company_mailbox_status_idx").on(
      table.companyId,
      table.mailboxId,
      table.status,
    ),
    companyCreatedIdx: index("inbound_email_messages_company_created_idx").on(table.companyId, table.createdAt),
    companyRawShaUq: uniqueIndex("inbound_email_messages_company_raw_sha_uq").on(table.companyId, table.rawSha256),
    mailboxProviderUidUq: uniqueIndex("inbound_email_messages_mailbox_provider_uid_uq")
      .on(table.mailboxId, table.providerUid)
      .where(sql`${table.providerUid} is not null`),
    companyMessageIdUq: uniqueIndex("inbound_email_messages_company_message_id_uq")
      .on(table.companyId, table.messageId)
      .where(sql`${table.messageId} is not null`),
  }),
);

export const inboundEmailAttachments = pgTable(
  "inbound_email_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull().references(() => inboundEmailMessages.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    filename: text("filename"),
    contentType: text("content_type").notNull().default("application/octet-stream"),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    status: text("status").$type<InboundEmailAttachmentStatus>().notNull().default("stored"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyMessageIdx: index("inbound_email_attachments_company_message_idx").on(table.companyId, table.messageId),
    assetIdx: index("inbound_email_attachments_asset_idx").on(table.assetId),
    messageShaUq: uniqueIndex("inbound_email_attachments_message_sha_uq").on(table.messageId, table.sha256),
  }),
);
