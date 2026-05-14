import { z } from "zod";

export const inboundEmailCreateModeSchema = z.enum(["issue"]);
export const inboundEmailProviderSchema = z.enum(["imap"]);
export const inboundEmailMessageStatusSchema = z.enum([
  "discovered",
  "persisted",
  "processing",
  "processed",
  "skipped",
  "failed",
  "duplicate",
]);

const hostnameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/,
    "Must be a valid hostname",
  );

const mailboxNameSchema = z.string().min(1).max(120);
const optionalPatternSchema = z.string().max(500).nullable().optional();
const labelIdsSchema = z.array(z.string().uuid()).max(20).optional();

export const createInboundEmailMailboxSchema = z.object({
  name: mailboxNameSchema,
  provider: inboundEmailProviderSchema.optional().default("imap"),
  enabled: z.boolean().optional().default(false),
  host: hostnameSchema,
  port: z.number().int().min(1).max(65535).optional().default(993),
  username: z.string().min(1).max(255),
  password: z.string().nullable().optional(),
  folder: z.string().min(1).max(255).optional().default("INBOX"),
  tls: z.boolean().optional().default(true),
  pollIntervalSeconds: z.number().int().min(30).max(3600).optional().default(60),
  targetProjectId: z.string().uuid().nullable().optional(),
  createMode: inboundEmailCreateModeSchema.optional().default("issue"),
  markSeen: z.boolean().optional().default(true),
});

export type CreateInboundEmailMailbox = z.infer<typeof createInboundEmailMailboxSchema>;

export const updateInboundEmailMailboxSchema = createInboundEmailMailboxSchema
  .partial()
  .extend({
    password: z.string().nullable().optional(),
  });

export type UpdateInboundEmailMailbox = z.infer<typeof updateInboundEmailMailboxSchema>;

export const createInboundEmailRuleSchema = z.object({
  mailboxId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional().default(true),
  senderPattern: optionalPatternSchema,
  subjectPattern: optionalPatternSchema,
  targetProjectId: z.string().uuid().nullable().optional(),
  createMode: inboundEmailCreateModeSchema.optional().default("issue"),
  priority: z.enum(["critical", "high", "medium", "low"]).optional().default("medium"),
  labelIds: labelIdsSchema.default([]),
});

export type CreateInboundEmailRule = z.infer<typeof createInboundEmailRuleSchema>;

export const updateInboundEmailRuleSchema = createInboundEmailRuleSchema.partial();

export type UpdateInboundEmailRule = z.infer<typeof updateInboundEmailRuleSchema>;

export const importInboundEmailMessageSchema = z.object({
  mailboxId: z.string().uuid(),
  providerUid: z.string().max(255).nullable().optional(),
  rawEmail: z.string().min(1),
  processAfterImport: z.boolean().optional().default(true),
});

export type ImportInboundEmailMessage = z.infer<typeof importInboundEmailMessageSchema>;
