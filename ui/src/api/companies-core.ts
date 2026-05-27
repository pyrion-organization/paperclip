import type { Company } from "@paperclipai/shared";
import { api } from "./client";

export type CreateCompanyRequest = {
  name: string;
  description?: string | null;
  budgetMonthlyCents?: number;
};

export const companiesCoreApi = {
  list: () => api.get<Company[]>("/companies"),
  create: (data: CreateCompanyRequest) => api.post<Company>("/companies", data),
};
