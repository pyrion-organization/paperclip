import type {
  Company,
  CompanyInstructionsBundle,
  CompanyInstructionsFileDetail,
  CompanyPortabilityExportRequest,
  CompanyPortabilityExportPreviewResult,
  CompanyPortabilityExportResult,
  CompanyPortabilityImportRequest,
  CompanyPortabilityImportResult,
  CompanyPortabilityPreviewRequest,
  CompanyPortabilityPreviewResult,
  CreateInboundEmailMailbox,
  CreateInboundEmailRule,
  InboundEmailMailbox,
  InboundEmailMessage,
  InboundEmailOpsDashboard,
  InboundEmailRule,
  UpdateCompanyBranding,
  UpdateInboundEmailMailbox,
  UpdateInboundEmailRule,
} from "@paperclipai/shared";
import { api } from "./client";

export type CompanyStats = Record<string, { agentCount: number; issueCount: number }>;

export interface InboundEmailListPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface InboundEmailMessageListParams {
  status?: string;
  mailboxId?: string;
  q?: string;
  cursor?: string | null;
  limit?: number;
  order?: "asc" | "desc";
}

function inboundEmailQuery(params?: InboundEmailMessageListParams): string {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.mailboxId) query.set("mailboxId", params.mailboxId);
  if (params?.q?.trim()) query.set("q", params.q.trim());
  if (params?.cursor) query.set("cursor", params.cursor);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.order) query.set("order", params.order);
  const value = query.toString();
  return value ? `?${value}` : "";
}

export const companiesApi = {
  list: () => api.get<Company[]>("/companies"),
  get: (companyId: string) => api.get<Company>(`/companies/${companyId}`),
  stats: () => api.get<CompanyStats>("/companies/stats"),
  create: (data: {
    name: string;
    description?: string | null;
    budgetMonthlyCents?: number;
  }) =>
    api.post<Company>("/companies", data),
  update: (
    companyId: string,
    data: Partial<
      Pick<
        Company,
        | "name"
        | "description"
        | "status"
        | "budgetMonthlyCents"
        | "attachmentMaxBytes"
        | "requireBoardApprovalForNewAgents"
        | "feedbackDataSharingEnabled"
        | "brandColor"
        | "logoAssetId"
        | "smtpHost"
        | "smtpPort"
        | "smtpUser"
        | "smtpFrom"
        | "emailSignatureHtml"
      >
    > & { smtpPassword?: string | null },
  ) => api.patch<Company>(`/companies/${companyId}`, data),
  updateBranding: (companyId: string, data: UpdateCompanyBranding) =>
    api.patch<Company>(`/companies/${companyId}/branding`, data),
  testEmail: (companyId: string, to: string) =>
    api.post<{ ok: true }>(`/companies/${companyId}/email/test`, { to }),
  listInboundEmailMailboxes: (companyId: string) =>
    api.get<InboundEmailListPage<InboundEmailMailbox>>(
      `/companies/${companyId}/inbound-email/mailboxes`,
    ),
  getInboundEmailOpsDashboard: (companyId: string) =>
    api.get<InboundEmailOpsDashboard>(`/companies/${companyId}/inbound-email/ops`),
  saveInboundEmailMailbox: (
    companyId: string,
    mailboxId: string | null,
    data: CreateInboundEmailMailbox | UpdateInboundEmailMailbox,
  ) =>
    mailboxId
      ? api.patch<InboundEmailMailbox>(`/companies/${companyId}/inbound-email/mailboxes/${mailboxId}`, data)
      : api.post<InboundEmailMailbox>(`/companies/${companyId}/inbound-email/mailboxes`, data),
  testInboundEmailMailbox: (companyId: string, mailboxId: string) =>
    api.post<{ ok: true }>(`/companies/${companyId}/inbound-email/mailboxes/${mailboxId}/test`, {}),
  deleteInboundEmailMailbox: (companyId: string, mailboxId: string) =>
    api.delete<void>(`/companies/${companyId}/inbound-email/mailboxes/${mailboxId}`),
  retryInboundEmailMessage: (companyId: string, messageId: string) =>
    api.post<{ id: string; status: string }>(
      `/companies/${companyId}/inbound-email/messages/${messageId}/retry`,
      {},
    ),
  retryInboundEmailJob: (companyId: string, jobId: string) =>
    api.post<{ id: string; status: string }>(
      `/companies/${companyId}/inbound-email/jobs/${jobId}/retry`,
      {},
    ),
  pollInboundEmailMailbox: (companyId: string, mailboxId: string) =>
    api.post<{ id: string; status: string }>(`/companies/${companyId}/inbound-email/mailboxes/${mailboxId}/poll`, {}),
  listInboundEmailRules: (companyId: string) =>
    api.get<InboundEmailListPage<InboundEmailRule>>(
      `/companies/${companyId}/inbound-email/rules`,
    ),
  saveInboundEmailRule: (
    companyId: string,
    ruleId: string | null,
    data: CreateInboundEmailRule | UpdateInboundEmailRule,
  ) =>
    ruleId
      ? api.patch<InboundEmailRule>(`/companies/${companyId}/inbound-email/rules/${ruleId}`, data)
      : api.post<InboundEmailRule>(`/companies/${companyId}/inbound-email/rules`, data),
  deleteInboundEmailRule: (companyId: string, ruleId: string) =>
    api.delete<void>(`/companies/${companyId}/inbound-email/rules/${ruleId}`),
  listInboundEmailMessages: (companyId: string, params?: InboundEmailMessageListParams) =>
    api.get<InboundEmailListPage<InboundEmailMessage>>(
      `/companies/${companyId}/inbound-email/messages${inboundEmailQuery(params)}`,
    ),
  archive: (companyId: string) => api.post<Company>(`/companies/${companyId}/archive`, {}),
  remove: (companyId: string) => api.delete<{ ok: true }>(`/companies/${companyId}`),
  exportBundle: (
    companyId: string,
    data: CompanyPortabilityExportRequest,
  ) =>
    api.post<CompanyPortabilityExportResult>(`/companies/${companyId}/exports`, data),
  exportPreview: (
    companyId: string,
    data: CompanyPortabilityExportRequest,
  ) =>
    api.post<CompanyPortabilityExportPreviewResult>(`/companies/${companyId}/exports/preview`, data),
  importPreview: (data: CompanyPortabilityPreviewRequest) =>
    api.post<CompanyPortabilityPreviewResult>("/companies/import/preview", data),
  importBundle: (data: CompanyPortabilityImportRequest) =>
    api.post<CompanyPortabilityImportResult>("/companies/import", data),

  // Company Instructions
  instructionsBundle: (companyId: string) =>
    api.get<CompanyInstructionsBundle>(`/companies/${companyId}/instructions-bundle`),
  instructionsFile: (companyId: string, relativePath: string) =>
    api.get<CompanyInstructionsFileDetail>(
      `/companies/${companyId}/instructions-bundle/file?path=${encodeURIComponent(relativePath)}`,
    ),
  saveInstructionsFile: (companyId: string, data: { path: string; content: string }) =>
    api.put<CompanyInstructionsFileDetail>(`/companies/${companyId}/instructions-bundle/file`, data),
  deleteInstructionsFile: (companyId: string, relativePath: string) =>
    api.delete<CompanyInstructionsBundle>(
      `/companies/${companyId}/instructions-bundle/file?path=${encodeURIComponent(relativePath)}`,
    ),
};
