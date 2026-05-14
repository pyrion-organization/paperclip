import { z } from "zod";
import { CLIENT_EMPLOYEE_PROJECT_SCOPES, CLIENT_STATUSES, CLIENT_PROJECT_STATUSES } from "../constants.js";

const metadataSchema = z.record(z.string(), z.unknown());
const stringListSchema = z.array(z.string().trim().min(1).max(160)).max(100);

const clientFields = {
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(CLIENT_STATUSES).optional().default("active"),
  metadata: metadataSchema.optional().nullable(),
};

export const createClientSchema = z.object(clientFields);
export type CreateClient = z.infer<typeof createClientSchema>;

export const updateClientSchema = z.object(clientFields).partial();
export type UpdateClient = z.infer<typeof updateClientSchema>;

const clientProjectCreateFields = {
  projectId: z.string().uuid(),
  projectNameOverride: z.string().optional().nullable(),
  status: z.enum(CLIENT_PROJECT_STATUSES).optional().default("active"),
  description: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  projectAliases: stringListSchema.optional().default([]),
  metadata: metadataSchema.optional().nullable(),
};

export const createClientProjectSchema = z.object(clientProjectCreateFields);
export type CreateClientProject = z.infer<typeof createClientProjectSchema>;

const clientProjectUpdateFields = {
  projectNameOverride: z.string().optional().nullable(),
  status: z.enum(CLIENT_PROJECT_STATUSES).optional(),
  description: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  projectAliases: stringListSchema.optional(),
  metadata: metadataSchema.optional().nullable(),
};

export const updateClientProjectSchema = z.object(clientProjectUpdateFields).partial();
export type UpdateClientProject = z.infer<typeof updateClientProjectSchema>;

// Accepts either a bare domain ("client.com") or an email-shaped example
// ("x@client.com") — anything past the @ is treated as the domain.
const emailDomainPattern =
  /^(?:[^@\s]+@)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const createClientEmailDomainSchema = z
  .object({
    domain: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .regex(emailDomainPattern, "must be a valid domain or email example"),
  })
  .strict();
export type CreateClientEmailDomain = z.infer<typeof createClientEmailDomainSchema>;

const clientEmployeeFields = {
  name: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  projectScope: z.enum(CLIENT_EMPLOYEE_PROJECT_SCOPES).optional().default("all_linked_projects"),
  clientProjectIds: z.array(z.string().uuid()).max(200).optional().default([]),
};

export const createClientEmployeeSchema = z.object(clientEmployeeFields).strict();
export type CreateClientEmployee = z.infer<typeof createClientEmployeeSchema>;

export const updateClientEmployeeSchema = z
  .object({
    name: clientEmployeeFields.name.optional(),
    role: clientEmployeeFields.role.optional(),
    email: clientEmployeeFields.email.optional(),
    projectScope: z.enum(CLIENT_EMPLOYEE_PROJECT_SCOPES).optional(),
    clientProjectIds: z.array(z.string().uuid()).max(200).optional(),
  })
  .strict();
export type UpdateClientEmployee = z.infer<typeof updateClientEmployeeSchema>;
