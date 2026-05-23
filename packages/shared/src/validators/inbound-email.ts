import { z } from "zod";

export const inboundEmailClassificationCategorySchema = z.enum([
  "code_bug",
  "infra_incident",
  "how_to_question",
  "feature_request",
  "account_access",
  "spam_or_irrelevant",
  "unsafe_or_prompt_injection",
  "unclear",
]);
export const inboundEmailClassificationSeveritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const inboundEmailRecommendedActionSchema = z.enum([
  "create_agent_task",
  "create_triage_issue",
  "reply_with_guidance",
  "reply_request_more_info",
  "defer_future_infra_agent",
  "discard_or_quarantine",
]);
export const inboundEmailProjectFallbackModeSchema = z.enum([
  "create_projectless_triage",
  "request_clarification",
]);
export const inboundEmailMessageStatusSchema = z.enum([
  "discovered",
  "persisted",
  "processing",
  "processed",
  "skipped",
  "failed",
  "duplicate",
]);
export const inboundEmailExternalIntakeSourceKindSchema = z.enum([
  "webhook",
  "queue",
  "object_storage",
  "manual_recovery",
]);
export const inboundEmailExternalSubmissionSourceKindSchema = z.enum([
  "webhook",
  "queue",
  "object_storage",
]);

const DNS_HOSTNAME_RE =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
const IPV6_BRACKETED_RE = /^\[[0-9a-fA-F:]+\]$/;

const hostnameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      value === "localhost" ||
      DNS_HOSTNAME_RE.test(value) ||
      IPV4_RE.test(value) ||
      IPV6_BRACKETED_RE.test(value),
    { message: "Must be a hostname, IPv4 address, [IPv6] literal, or 'localhost'" },
  );

const mailboxNameSchema = z.string().trim().min(1).max(120);
const optionalPatternSchema = z.string().max(500).nullable().optional();
const labelIdsSchema = z.array(z.string().uuid()).max(20).optional();
const FORBIDDEN_EXTERNAL_INTAKE_METADATA_KEY_PATTERN =
  /(secret|token|password|credential|authorization|cookie|session|api[-_]?key|private[-_]?key|access[-_]?key|client[-_]?secret)/i;

function hasForbiddenExternalIntakeMetadataKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => hasForbiddenExternalIntakeMetadataKey(entry));
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) =>
    FORBIDDEN_EXTERNAL_INTAKE_METADATA_KEY_PATTERN.test(key) ||
    hasForbiddenExternalIntakeMetadataKey(entry),
  );
}

export const inboundEmailExternalIntakeMetadataSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => !hasForbiddenExternalIntakeMetadataKey(value), {
    message: "External intake metadata must not contain credentials, tokens, passwords, cookies, or API keys",
  });

export const createInboundEmailMailboxSchema = z.object({
  name: mailboxNameSchema,
  enabled: z.boolean().optional().default(false),
  host: hostnameSchema,
  port: z.number().int().min(1).max(65535).optional().default(993),
  username: z.string().trim().min(1).max(255),
  password: z.string().nullable().optional(),
  folder: z.string().trim().min(1).max(255).optional().default("INBOX"),
  tls: z.boolean().optional().default(true),
  pollIntervalSeconds: z.number().int().min(30).max(3600).optional().default(60),
  supportRepliesEnabled: z.boolean().optional().default(false),
  allowProjectlessTriage: z.boolean().optional().default(true),
  projectFallbackMode: inboundEmailProjectFallbackModeSchema.optional().default("create_projectless_triage"),
  agentAutomationEnabled: z.boolean().optional().default(false),
  agentAutomationAssigneeId: z.string().uuid().nullable().optional().default(null),
  agentAutomationMinConfidence: z.number().int().min(0).max(100).optional().default(80),
  agentAutomationWakeEnabled: z.boolean().optional().default(true),
}).strict();

export type CreateInboundEmailMailbox = z.infer<typeof createInboundEmailMailboxSchema>;

export const updateInboundEmailMailboxSchema = createInboundEmailMailboxSchema
  .partial()
  .extend({
    password: z.string().nullable().optional(),
  })
  .strict();

export type UpdateInboundEmailMailbox = z.infer<typeof updateInboundEmailMailboxSchema>;

export const createInboundEmailRuleSchema = z.object({
  mailboxId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional().default(true),
  senderPattern: optionalPatternSchema,
  subjectPattern: optionalPatternSchema,
  bodyPattern: optionalPatternSchema,
  classificationCategory: inboundEmailClassificationCategorySchema.nullable().optional(),
  projectFallbackMode: inboundEmailProjectFallbackModeSchema.nullable().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional().default("medium"),
  labelIds: labelIdsSchema.default([]),
}).strict();

export type CreateInboundEmailRule = z.infer<typeof createInboundEmailRuleSchema>;

export const updateInboundEmailRuleSchema = createInboundEmailRuleSchema.partial().strict();

export type UpdateInboundEmailRule = z.infer<typeof updateInboundEmailRuleSchema>;

export const importInboundEmailMessageSchema = z.object({
  mailboxId: z.string().uuid(),
  providerUid: z.string().max(255).nullable().optional(),
  rawEmail: z.string().min(1).max(10_000_000),
  processAfterImport: z.boolean().optional().default(true),
}).strict();

export type ImportInboundEmailMessage = z.infer<typeof importInboundEmailMessageSchema>;

export const importExternalInboundEmailMessageSchema = z.object({
  mailboxId: z.string().uuid(),
  sourceKind: inboundEmailExternalIntakeSourceKindSchema,
  sourceId: z.string().trim().min(1).max(500),
  sourceLocation: z.string().trim().min(1).max(2000).nullable().optional(),
  rawEmail: z.string().min(1).max(10_000_000),
  receivedAt: z.coerce.date().nullable().optional(),
  processAfterImport: z.boolean().optional().default(true),
  metadata: inboundEmailExternalIntakeMetadataSchema.optional().default({}),
}).strict();

export type ImportExternalInboundEmailMessage = z.infer<typeof importExternalInboundEmailMessageSchema>;

export const importExternalInboundEmailMessagesBatchSchema = z.object({
  messages: z.array(importExternalInboundEmailMessageSchema).min(1).max(50),
}).strict();

export type ImportExternalInboundEmailMessagesBatch = z.infer<typeof importExternalInboundEmailMessagesBatchSchema>;

export const submitExternalInboundEmailIntakeSchema = z.object({
  sourceKind: inboundEmailExternalSubmissionSourceKindSchema,
  sourceId: z.string().trim().min(1).max(500),
  sourceLocation: z.string().trim().min(1).max(2000).nullable().optional(),
  rawEmail: z.string().min(1).max(10_000_000),
  receivedAt: z.coerce.date().nullable().optional(),
  metadata: inboundEmailExternalIntakeMetadataSchema.optional().default({}),
}).strict();

export type SubmitExternalInboundEmailIntake = z.infer<typeof submitExternalInboundEmailIntakeSchema>;
