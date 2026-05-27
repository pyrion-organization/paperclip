import { z } from "zod";
import { PAYMENT_ENTRY_STATUSES, PAYMENT_METHODS } from "../constants.js";

const nullableTrimmed = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((value) => value === "" ? null : value ?? null);

const optionalDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable();
const optionalUrl = z.string().trim().url().max(1000).optional().nullable().or(z.literal("").transform(() => null));
const paymentEntryStatusFilterSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const statuses = value.split(",").map((status) => status.trim()).filter(Boolean);
    return statuses.length === 1 ? statuses[0] : statuses;
  },
  z.union([z.enum(PAYMENT_ENTRY_STATUSES), z.array(z.enum(PAYMENT_ENTRY_STATUSES)).min(1)]).optional(),
).transform((value) => {
  if (!value) return undefined;
  return Array.isArray(value) ? [...new Set(value)] : [value];
});

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const paymentEntryStatusSchema = z.enum(PAYMENT_ENTRY_STATUSES);

export const paymentProfileInputSchema = z.object({
  method: paymentMethodSchema,
  accountLabel: z.string().trim().min(1).max(160),
  ownerName: nullableTrimmed(160),
  notes: nullableTrimmed(1000),
  active: z.boolean().optional().default(true),
}).strict();
export type PaymentProfileInput = z.infer<typeof paymentProfileInputSchema>;
export type PaymentProfileInputRaw = z.input<typeof paymentProfileInputSchema>;

export const updatePaymentProfileSchema = paymentProfileInputSchema.partial().strict();
export type UpdatePaymentProfile = z.infer<typeof updatePaymentProfileSchema>;
export type UpdatePaymentProfileInput = z.input<typeof updatePaymentProfileSchema>;

export const paymentEntryFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: paymentEntryStatusFilterSchema,
  calendarItemId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
}).strict();
export type PaymentEntryFilter = z.infer<typeof paymentEntryFilterSchema>;

export const createPaymentEntrySchema = z.object({
  calendarItemId: z.string().uuid().optional().nullable(),
  paymentProfileId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(240),
  providerName: nullableTrimmed(240),
  dueDate: optionalDateOnly,
  expectedAmountCents: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().trim().length(3).optional().default("BRL").transform((value) => value.toUpperCase()),
  notes: nullableTrimmed(2000),
}).strict();
export type CreatePaymentEntry = z.infer<typeof createPaymentEntrySchema>;
export type CreatePaymentEntryInput = z.input<typeof createPaymentEntrySchema>;

export const updatePaymentEntrySchema = createPaymentEntrySchema.partial().extend({
  status: paymentEntryStatusSchema.optional(),
}).strict();
export type UpdatePaymentEntry = z.infer<typeof updatePaymentEntrySchema>;
export type UpdatePaymentEntryInput = z.input<typeof updatePaymentEntrySchema>;

export const recordPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().trim().length(3).optional().default("BRL").transform((value) => value.toUpperCase()),
  paidAt: z.string().datetime().optional(),
  paymentProfileId: z.string().uuid().optional().nullable(),
  proofUrl: optionalUrl,
  notes: nullableTrimmed(2000),
}).strict();
export type RecordPayment = z.infer<typeof recordPaymentSchema>;
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
