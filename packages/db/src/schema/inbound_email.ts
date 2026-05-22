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
import { issues } from "./issues.js";
import { assets } from "./assets.js";

export type InboundEmailClassificationCategory =
  | "code_bug"
  | "infra_incident"
  | "how_to_question"
  | "feature_request"
  | "account_access"
  | "spam_or_irrelevant"
  | "unsafe_or_prompt_injection"
  | "unclear";
export type InboundEmailClassificationSeverity = "low" | "medium" | "high" | "urgent";
export type InboundEmailRecommendedAction =
  | "create_agent_task"
  | "create_triage_issue"
  | "reply_with_guidance"
  | "reply_request_more_info"
  | "defer_future_infra_agent"
  | "discard_or_quarantine";
export type InboundEmailSupportReplyStatus = "sent" | "skipped" | "failed";
export type InboundEmailSupportReplyReason =
  | "code_bug_received"
  | "infra_incident_received"
  | "feature_request_received"
  | "how_to_question_received"
  | "account_access_received"
  | "unclear_request_more_info"
  | "smtp_not_configured"
  | "reply_disabled"
  | "unsafe_or_spam"
  | "missing_sender"
  | "send_failed";
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
    enabled: boolean("enabled").notNull().default(false),
    host: text("host").notNull(),
    port: integer("port").notNull().default(993),
    username: text("username").notNull(),
    passwordSecretName: text("password_secret_name"),
    folder: text("folder").notNull().default("INBOX"),
    tls: boolean("tls").notNull().default(true),
    pollIntervalSeconds: integer("poll_interval_seconds").notNull().default(60),
    supportRepliesEnabled: boolean("support_replies_enabled").notNull().default(false),
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
    replyToAddress: text("reply_to_address"),
    toAddresses: jsonb("to_addresses").$type<string[]>().notNull().default([]),
    subject: text("subject"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    status: text("status").$type<InboundEmailMessageStatus>().notNull().default("discovered"),
    bodyText: text("body_text"),
    // Stored verbatim from the inbound MIME part — must NEVER be rendered as HTML in the UI without sanitization.
    bodyHtml: text("body_html"),
    rawStorageKey: text("raw_storage_key"),
    rawContentType: text("raw_content_type").notNull().default("message/rfc822"),
    createdIssueId: uuid("created_issue_id").references(() => issues.id, { onDelete: "set null" }),
    error: text("error"),
    skipReason: text("skip_reason"),
    sourceDeletedAt: timestamp("source_deleted_at", { withTimezone: true }),
    sourceDeleteError: text("source_delete_error"),
    sourceSeenAt: timestamp("source_seen_at", { withTimezone: true }),
    sourceSeenError: text("source_seen_error"),
    classificationCategory: text("classification_category").$type<InboundEmailClassificationCategory>(),
    classificationConfidence: integer("classification_confidence"),
    classificationSeverity: text("classification_severity").$type<InboundEmailClassificationSeverity>(),
    classificationRecommendedAction: text("classification_recommended_action").$type<InboundEmailRecommendedAction>(),
    classificationFinalAction: text("classification_final_action").$type<InboundEmailRecommendedAction>(),
    classificationSummary: text("classification_summary"),
    classificationSafetyFlags: jsonb("classification_safety_flags").$type<string[]>(),
    classificationRuleVersion: text("classification_rule_version"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    supportReplyStatus: text("support_reply_status").$type<InboundEmailSupportReplyStatus>(),
    supportReplyReason: text("support_reply_reason").$type<InboundEmailSupportReplyReason>(),
    supportReplyAttemptedAt: timestamp("support_reply_attempted_at", { withTimezone: true }),
    supportReplySentAt: timestamp("support_reply_sent_at", { withTimezone: true }),
    supportReplyError: text("support_reply_error"),
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
    messageShaIdx: index("inbound_email_attachments_message_sha_idx").on(table.messageId, table.sha256),
  }),
);
