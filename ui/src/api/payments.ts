import type {
  CreatePaymentEntryInput,
  PaymentDashboard,
  PaymentEntry,
  PaymentEntryDetail,
  PaymentEntryListResponse,
  PaymentProfile,
  PaymentProfileInputRaw,
  RecordPaymentInput,
  UpdatePaymentEntryInput,
  UpdatePaymentProfileInput,
  UpdatePaymentRecordInput,
} from "@paperclipai/shared";
import { api } from "./client";

function params(input: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value == null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const paymentsApi = {
  dashboard: (companyId: string) =>
    api.get<PaymentDashboard>(`/companies/${companyId}/payments/dashboard`),
  profiles: (companyId: string) =>
    api.get<PaymentProfile[]>(`/companies/${companyId}/payments/profiles`),
  createProfile: (companyId: string, input: PaymentProfileInputRaw) =>
    api.post<PaymentProfile>(`/companies/${companyId}/payments/profiles`, input),
  updateProfile: (companyId: string, profileId: string, input: UpdatePaymentProfileInput) =>
    api.patch<PaymentProfile>(`/companies/${companyId}/payments/profiles/${profileId}`, input),
  entries: (companyId: string, filters: { q?: string; status?: string; calendarItemId?: string; profileId?: string; dueFrom?: string; dueTo?: string; sort?: string; dir?: "asc" | "desc"; limit?: number; offset?: number } = {}) =>
    api.get<PaymentEntryListResponse>(`/companies/${companyId}/payments/entries${params(filters)}`),
  detail: (companyId: string, entryId: string) =>
    api.get<PaymentEntryDetail>(`/companies/${companyId}/payments/entries/${entryId}`),
  createEntry: (companyId: string, input: CreatePaymentEntryInput) =>
    api.post<PaymentEntry>(`/companies/${companyId}/payments/entries`, input),
  updateEntry: (companyId: string, entryId: string, input: UpdatePaymentEntryInput) =>
    api.patch<PaymentEntry>(`/companies/${companyId}/payments/entries/${entryId}`, input),
  cancelEntry: (companyId: string, entryId: string) =>
    api.post<PaymentEntry>(`/companies/${companyId}/payments/entries/${entryId}/cancel`, {}),
  recordPayment: (companyId: string, entryId: string, input: RecordPaymentInput) =>
    api.post<PaymentEntry>(`/companies/${companyId}/payments/entries/${entryId}/records`, input),
  updateRecord: (companyId: string, entryId: string, recordId: string, input: UpdatePaymentRecordInput) =>
    api.patch<PaymentEntry>(`/companies/${companyId}/payments/entries/${entryId}/records/${recordId}`, input),
  deleteRecord: (companyId: string, entryId: string, recordId: string) =>
    api.delete<PaymentEntry>(`/companies/${companyId}/payments/entries/${entryId}/records/${recordId}`),
};
