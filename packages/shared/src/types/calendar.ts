import type {
  CalendarDocumentType,
  CalendarItemCategory,
  CalendarItemStatus,
  CalendarRecurrenceType,
  CalendarRiskLevel,
  CalendarSourceKind,
  IssuePriority,
} from "../constants.js";

export interface CalendarItemMetadata {
  domainName?: string;
  registrar?: string;
  accountId?: string;
  subscriptionPlan?: string;
  tokenOwner?: string;
  tokenScope?: string;
  certificateSubject?: string;
  externalCalendarProvider?: string;
  externalCalendarEventId?: string;
  [key: string]: unknown;
}

export interface CalendarItem {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  category: CalendarItemCategory;
  status: CalendarItemStatus;
  riskLevel: CalendarRiskLevel;
  priority: IssuePriority;
  providerName: string | null;
  relatedClientId: string | null;
  relatedProjectId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  timezone: string;
  recurrenceType: CalendarRecurrenceType;
  recurrenceRule: string | null;
  nextDueDate: string | null;
  amountCents: number | null;
  currency: string;
  paymentProfileId: string | null;
  autoRenew: boolean;
  manualActionRequired: boolean;
  paymentMethodLabel: string | null;
  paymentOwner: string | null;
  costCenter: string | null;
  purchaseEmail: string | null;
  accountLoginEmail: string | null;
  billingEmail: string | null;
  recoveryEmail: string | null;
  technicalContactEmail: string | null;
  serviceUrl: string | null;
  loginUrl: string | null;
  billingUrl: string | null;
  documentationUrl: string | null;
  sourceKind: CalendarSourceKind;
  sourceEmailMessageId: string | null;
  confidenceScore: number | null;
  metadata: CalendarItemMetadata | null;
  notes: string | null;
  internalNotes: string | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  updatedByAgentId: string | null;
  updatedByUserId: string | null;
  lastCheckedAt: string | null;
  lastReminderScannedAt: string | null;
  lastDetailsScannedAt: string | null;
  lastCompletedAt: string | null;
  reminderPolicy: CalendarReminderPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarItemDocument {
  id: string;
  companyId: string;
  calendarItemId: string;
  documentType: CalendarDocumentType;
  documentId: string | null;
  assetId: string | null;
  sourceEmailMessageId: string | null;
  sourceEmailAttachmentId: string | null;
  title: string | null;
  url: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarItemActivity {
  id: string;
  companyId: string;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  agentId: string | null;
  runId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface CalendarItemDetail extends CalendarItem {
  documents: CalendarItemDocument[];
  activity: CalendarItemActivity[];
}

export interface CalendarItemListResponse {
  items: CalendarItem[];
  total: number;
}

export interface CalendarDashboardBucket {
  label: string;
  items: CalendarItem[];
  count: number;
}

export interface CalendarDashboard {
  companyId: string;
  generatedAt: string;
  overdue: CalendarDashboardBucket;
  dueToday: CalendarDashboardBucket;
  dueIn7Days: CalendarDashboardBucket;
  dueIn30Days: CalendarDashboardBucket;
  criticalItems: CalendarDashboardBucket;
  pendingReview: CalendarDashboardBucket;
  missingDetails: CalendarMissingDetailsFinding[];
  reminderStatus: CalendarReminderStatus;
  recentlyCompleted: CalendarDashboardBucket;
  costSummary: {
    monthlyRecurringCents: number;
    annualRenewalCents: number;
    upcoming30DaysCents: number;
    currency: string;
  };
}

export interface CalendarReminderStatus {
  lastScanAt: string | null;
  scannedItems: number;
  createdIssues: number;
  updatedIssues: number;
  queuedEmails: number;
  skippedEmails: number;
  pendingEmails: number;
  sentEmails: number;
  failedEmails: number;
  skippedDeliveryEmails: number;
  latestEmailFailureAt: string | null;
  latestEmailFailureError: string | null;
  failedEmailDetails: CalendarReminderEmailFailure[];
}

export interface CalendarReminderEmailFailure {
  id: string;
  calendarItemId: string | null;
  title: string | null;
  recipientEmail: string | null;
  dueDate: string | null;
  failedAt: string | null;
  attempts: number;
  lastError: string | null;
}

export interface CalendarReminderPolicy {
  daysBefore: number[];
  createsIssue: boolean;
  sendsEmail: boolean;
  overdueCreatesIssue: boolean;
  overdueSendsEmail: boolean;
  summary: string;
}

export type CalendarMissingDetailsSeverity = "high" | "medium" | "low";

export interface CalendarMissingDetailsFinding {
  itemId: string;
  title: string;
  category: CalendarItemCategory;
  riskLevel: CalendarRiskLevel;
  severity: CalendarMissingDetailsSeverity;
  missingFields: string[];
  message: string;
}
