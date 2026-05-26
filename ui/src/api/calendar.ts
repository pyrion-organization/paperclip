import type {
  CalendarDashboard,
  CalendarEmailProposalInput,
  CalendarItem,
  CalendarItemDetail,
  CalendarItemDocument,
  CalendarItemListResponse,
  CalendarMissingDetailsFinding,
  CompleteCalendarItemInput,
  CreateCalendarItemInput,
  CreateCalendarItemDocumentInput,
  UpdateCalendarItemInput,
} from "@paperclipai/shared";
import { api } from "./client";

type CalendarFilters = {
  q?: string;
  status?: string;
  category?: string;
  riskLevel?: string;
  provider?: string;
  dueFrom?: string | null;
  dueTo?: string | null;
  autoRenew?: boolean;
  paymentMethod?: string;
  purchaseEmail?: string;
  billingEmail?: string;
  relatedClientId?: string;
  relatedProjectId?: string;
  limit?: number;
  offset?: number;
};

function params(input: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value == null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function approvalParam(approvalConfirmed?: boolean): string {
  return approvalConfirmed ? "?approvalConfirmed=true" : "";
}

export const calendarApi = {
  list: (companyId: string, filters: CalendarFilters = {}) =>
    api.get<CalendarItemListResponse>(`/companies/${companyId}/calendar/items${params(filters)}`),
  detail: (companyId: string, itemId: string) =>
    api.get<CalendarItemDetail>(`/companies/${companyId}/calendar/items/${itemId}`),
  dashboard: (companyId: string) =>
    api.get<CalendarDashboard>(`/companies/${companyId}/calendar/dashboard`),
  missingDetails: (companyId: string) =>
    api.get<CalendarMissingDetailsFinding[]>(`/companies/${companyId}/calendar/missing-details`),
  create: (companyId: string, input: CreateCalendarItemInput) =>
    api.post<CalendarItem>(`/companies/${companyId}/calendar/items`, input),
  createEmailProposal: (companyId: string, input: CalendarEmailProposalInput) =>
    api.post<CalendarItem>(`/companies/${companyId}/calendar/email-proposals`, input),
  update: (companyId: string, itemId: string, input: UpdateCalendarItemInput, approvalConfirmed?: boolean) =>
    api.patch<CalendarItem>(`/companies/${companyId}/calendar/items/${itemId}${approvalParam(approvalConfirmed)}`, input),
  complete: (companyId: string, itemId: string, input: CompleteCalendarItemInput, approvalConfirmed?: boolean) =>
    api.post<CalendarItem>(`/companies/${companyId}/calendar/items/${itemId}/complete${approvalParam(approvalConfirmed)}`, input),
  pause: (companyId: string, itemId: string) =>
    api.post<CalendarItem>(`/companies/${companyId}/calendar/items/${itemId}/pause`, {}),
  activate: (companyId: string, itemId: string) =>
    api.post<CalendarItem>(`/companies/${companyId}/calendar/items/${itemId}/activate`, {}),
  archive: (companyId: string, itemId: string) =>
    api.post<CalendarItem>(`/companies/${companyId}/calendar/items/${itemId}/archive`, {}),
  cancel: (companyId: string, itemId: string, approvalConfirmed?: boolean) =>
    api.post<CalendarItem>(`/companies/${companyId}/calendar/items/${itemId}/cancel${approvalParam(approvalConfirmed)}`, {}),
  addDocument: (companyId: string, itemId: string, input: CreateCalendarItemDocumentInput) =>
    api.post<CalendarItemDocument>(`/companies/${companyId}/calendar/items/${itemId}/documents`, input),
};
