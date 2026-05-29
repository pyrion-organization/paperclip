import type { PaymentEntryStatus, PaymentMethod } from "../constants.js";

export interface PaymentProfile {
  id: string;
  companyId: string;
  method: PaymentMethod;
  accountLabel: string;
  ownerName: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentEntry {
  id: string;
  companyId: string;
  calendarItemId: string | null;
  paymentProfileId: string | null;
  title: string;
  providerName: string | null;
  dueDate: string | null;
  expectedAmountCents: number | null;
  currency: string;
  paidAmountCents: number;
  status: PaymentEntryStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  profile?: PaymentProfile | null;
}

export interface PaymentRecord {
  id: string;
  companyId: string;
  paymentEntryId: string;
  paymentProfileId: string | null;
  amountCents: number;
  currency: string;
  paidAt: string;
  proofUrl: string | null;
  notes: string | null;
  createdAt: string;
  profile?: PaymentProfile | null;
}

export interface PaymentEntryDetail extends PaymentEntry {
  records: PaymentRecord[];
}

export interface PaymentMoneyTotal {
  currency: string;
  amountCents: number;
}

export interface PaymentDashboard {
  companyId: string;
  generatedAt: string;
  openCount: number;
  overdueCount: number;
  dueSoonCount: number;
  partiallyPaidCount: number;
  openBalances: PaymentMoneyTotal[];
  paidThisMonth: PaymentMoneyTotal[];
}

export interface PaymentEntryListResponse {
  entries: PaymentEntry[];
  total: number;
}
