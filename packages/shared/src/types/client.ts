import type { ClientStatus, ClientProjectStatus, ClientProjectType, ClientProjectBillingType } from "../constants.js";

export interface Client {
  id: string;
  companyId: string;
  name: string;
  email: string | null;
  cnpj: string | null;
  phone: string | null;
  contactName: string | null;
  notes: string | null;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ClientProject {
  id: string;
  companyId: string;
  clientId: string;
  projectId: string;
  projectNameOverride: string | null;
  projectType: ClientProjectType | null;
  status: ClientProjectStatus;
  description: string | null;
  billingType: ClientProjectBillingType | null;
  amountCents: number | null;
  lastPaymentAt: string | null;
  startDate: string | null;
  endDate: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** Joined from projects table when available */
  projectName?: string;
}
