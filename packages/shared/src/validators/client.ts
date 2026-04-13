import { z } from "zod";
import { CLIENT_STATUSES, CLIENT_PROJECT_STATUSES, CLIENT_PROJECT_TYPES, CLIENT_PROJECT_BILLING_TYPES } from "../constants.js";

const clientFields = {
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(CLIENT_STATUSES).optional().default("active"),
};

export const createClientSchema = z.object(clientFields);
export type CreateClient = z.infer<typeof createClientSchema>;

export const updateClientSchema = z.object(clientFields).partial();
export type UpdateClient = z.infer<typeof updateClientSchema>;

const clientProjectFields = {
  clientId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectNameOverride: z.string().optional().nullable(),
  projectType: z.enum(CLIENT_PROJECT_TYPES).optional().nullable(),
  status: z.enum(CLIENT_PROJECT_STATUSES).optional().default("active"),
  description: z.string().optional().nullable(),
  billingType: z.enum(CLIENT_PROJECT_BILLING_TYPES).optional().nullable(),
  amountCents: z.number().int().min(0).optional().nullable(),
  lastPaymentAt: z.string().datetime().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
};

export const createClientProjectSchema = z.object(clientProjectFields);
export type CreateClientProject = z.infer<typeof createClientProjectSchema>;

export const updateClientProjectSchema = z.object(clientProjectFields).partial();
export type UpdateClientProject = z.infer<typeof updateClientProjectSchema>;
