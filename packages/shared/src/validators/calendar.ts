import { z } from "zod";
import {
  CALENDAR_DOCUMENT_TYPES,
  CALENDAR_ITEM_CATEGORIES,
  CALENDAR_ITEM_STATUSES,
  CALENDAR_RECURRENCE_TYPES,
  CALENDAR_RISK_LEVELS,
  CALENDAR_SOURCE_KINDS,
  ISSUE_PRIORITIES,
} from "../constants.js";

const nullableTrimmed = (max = 500) =>
  z.string().trim().max(max).optional().nullable().transform((value) => value || null);

const optionalDateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .optional()
  .nullable()
  .transform((value) => value || null);

const optionalTime = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "must be HH:mm or HH:mm:ss")
  .optional()
  .nullable()
  .transform((value) => value || null);

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320)
  .optional()
  .nullable()
  .transform((value) => value || null);

const optionalUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .optional()
  .nullable()
  .transform((value) => value || null);

const metadataSchema = z.record(z.string(), z.unknown());

export const calendarItemCategorySchema = z.enum(CALENDAR_ITEM_CATEGORIES);
export const calendarItemStatusSchema = z.enum(CALENDAR_ITEM_STATUSES);
export const calendarRiskLevelSchema = z.enum(CALENDAR_RISK_LEVELS);
export const calendarRecurrenceTypeSchema = z.enum(CALENDAR_RECURRENCE_TYPES);
export const calendarSourceKindSchema = z.enum(CALENDAR_SOURCE_KINDS);
export const calendarDocumentTypeSchema = z.enum(CALENDAR_DOCUMENT_TYPES);

export const calendarItemFilterSchema = z.object({
  status: calendarItemStatusSchema.optional(),
  category: calendarItemCategorySchema.optional(),
  riskLevel: calendarRiskLevelSchema.optional(),
  provider: z.string().trim().max(200).optional(),
  dueFrom: optionalDateOnly,
  dueTo: optionalDateOnly,
  autoRenew: z.coerce.boolean().optional(),
  paymentMethod: z.string().trim().max(160).optional(),
  purchaseEmail: z.string().trim().toLowerCase().max(320).optional(),
  billingEmail: z.string().trim().toLowerCase().max(320).optional(),
  relatedClientId: z.string().uuid().optional(),
  relatedProjectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export type CalendarItemFilter = z.infer<typeof calendarItemFilterSchema>;

const calendarItemFields = {
  title: z.string().trim().min(1).max(240),
  description: nullableTrimmed(4000),
  category: calendarItemCategorySchema,
  status: calendarItemStatusSchema.optional().default("active"),
  riskLevel: calendarRiskLevelSchema.optional().default("medium"),
  priority: z.enum(ISSUE_PRIORITIES).optional().default("medium"),
  providerName: nullableTrimmed(240),
  relatedClientId: z.string().uuid().optional().nullable(),
  relatedProjectId: z.string().uuid().optional().nullable(),
  dueDate: optionalDateOnly,
  dueTime: optionalTime,
  timezone: z.string().trim().min(1).max(120).optional().default("UTC"),
  recurrenceType: calendarRecurrenceTypeSchema.optional().default("none"),
  recurrenceRule: nullableTrimmed(500),
  nextDueDate: optionalDateOnly,
  amountCents: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().trim().length(3).optional().default("USD").transform((value) => value.toUpperCase()),
  autoRenew: z.boolean().optional().default(false),
  manualActionRequired: z.boolean().optional().default(true),
  paymentMethodLabel: nullableTrimmed(160),
  paymentOwner: nullableTrimmed(160),
  costCenter: nullableTrimmed(160),
  purchaseEmail: optionalEmail,
  accountLoginEmail: optionalEmail,
  billingEmail: optionalEmail,
  recoveryEmail: optionalEmail,
  technicalContactEmail: optionalEmail,
  serviceUrl: optionalUrl,
  loginUrl: optionalUrl,
  billingUrl: optionalUrl,
  documentationUrl: optionalUrl,
  sourceKind: calendarSourceKindSchema.optional().default("manual"),
  sourceEmailMessageId: z.string().uuid().optional().nullable(),
  confidenceScore: z.number().int().min(0).max(100).optional().nullable(),
  metadata: metadataSchema.optional().nullable(),
  notes: nullableTrimmed(4000),
  internalNotes: nullableTrimmed(4000),
};

export const createCalendarItemSchema = z.object(calendarItemFields).strict();
export type CreateCalendarItem = z.infer<typeof createCalendarItemSchema>;
export type CreateCalendarItemInput = z.input<typeof createCalendarItemSchema>;

export const updateCalendarItemSchema = z.object(calendarItemFields).partial().strict();
export type UpdateCalendarItem = z.infer<typeof updateCalendarItemSchema>;
export type UpdateCalendarItemInput = z.input<typeof updateCalendarItemSchema>;

export const completeCalendarItemSchema = z.object({
  completedAt: z.string().datetime().optional(),
  nextDueDate: optionalDateOnly,
  notes: nullableTrimmed(2000),
}).strict();
export type CompleteCalendarItem = z.infer<typeof completeCalendarItemSchema>;
export type CompleteCalendarItemInput = z.input<typeof completeCalendarItemSchema>;

export const calendarScanSchema = z.object({
  now: z.string().datetime().optional(),
  recipientEmail: optionalEmail,
  sendEmail: z.boolean().optional().default(false),
  createIssues: z.boolean().optional().default(true),
}).strict();
export type CalendarScan = z.infer<typeof calendarScanSchema>;
export type CalendarScanInput = z.input<typeof calendarScanSchema>;

export const createCalendarItemDocumentSchema = z.object({
  documentType: calendarDocumentTypeSchema.optional().default("other"),
  documentId: z.string().uuid().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
  sourceEmailMessageId: z.string().uuid().optional().nullable(),
  sourceEmailAttachmentId: z.string().uuid().optional().nullable(),
  title: nullableTrimmed(240),
  url: optionalUrl,
  notes: nullableTrimmed(2000),
  metadata: metadataSchema.optional().nullable(),
}).strict();
export type CreateCalendarItemDocument = z.infer<typeof createCalendarItemDocumentSchema>;
export type CreateCalendarItemDocumentInput = z.input<typeof createCalendarItemDocumentSchema>;

export const calendarEmailProposalSchema = createCalendarItemSchema.extend({
  sourceKind: calendarSourceKindSchema.optional().default("email_agent"),
  sourceEmailMessageId: z.string().uuid(),
  confidenceScore: z.number().int().min(0).max(100),
  matchingKey: z.string().trim().min(1).max(240).optional(),
});
export type CalendarEmailProposal = z.infer<typeof calendarEmailProposalSchema>;
export type CalendarEmailProposalInput = z.input<typeof calendarEmailProposalSchema>;
