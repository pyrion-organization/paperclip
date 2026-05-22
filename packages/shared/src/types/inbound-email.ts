export type InboundEmailProvider = "imap";
export type InboundEmailCreateMode = "issue";
export type InboundEmailClassificationCategory =
  | "code_bug"
  | "infra_incident"
  | "how_to_question"
  | "feature_request"
  | "account_access"
  | "spam_or_irrelevant"
  | "unsafe_or_prompt_injection"
  | "unclear";
export type InboundEmailClassificationSeverity = "low" | "medium" | "high" | "urgent";
export type InboundEmailRecommendedAction =
  | "create_agent_task"
  | "create_triage_issue"
  | "reply_with_guidance"
  | "reply_request_more_info"
  | "defer_future_infra_agent"
  | "discard_or_quarantine";
export interface InboundEmailClassificationFields {
  classificationCategory: InboundEmailClassificationCategory | null;
  classificationConfidence: number | null;
  classificationSeverity: InboundEmailClassificationSeverity | null;
  classificationRecommendedAction: InboundEmailRecommendedAction | null;
  classificationFinalAction: InboundEmailRecommendedAction | null;
  classificationSummary: string | null;
  classificationSafetyFlags: string[] | null;
  classificationRuleVersion: string | null;
  classifiedAt: Date | null;
}
export type InboundEmailMessageStatus =
  | "discovered"
  | "persisted"
  | "processing"
  | "processed"
  | "skipped"
  | "failed"
  | "duplicate";

/**
 * View of an inbound email mailbox returned by the API. The persisted row has a
 * `passwordSecretName` pointer to the secrets store; that field is redacted in
 * favor of the boolean `passwordSet`.
 */
export interface InboundEmailMailbox {
  id: string;
  companyId: string;
  name: string;
  provider: InboundEmailProvider;
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  passwordSet: boolean;
  folder: string;
  tls: boolean;
  pollIntervalSeconds: number;
  targetProjectId: string | null;
  createMode: InboundEmailCreateMode;
  markSeen: boolean;
  lastPollAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MailboxView = InboundEmailMailbox;

export interface InboundEmailRule {
  id: string;
  companyId: string;
  mailboxId: string | null;
  enabled: boolean;
  senderPattern: string | null;
  subjectPattern: string | null;
  targetProjectId: string | null;
  createMode: InboundEmailCreateMode;
  priority: "critical" | "high" | "medium" | "low";
  labelIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundEmailMessage extends InboundEmailClassificationFields {
  id: string;
  companyId: string;
  mailboxId: string;
  providerUid: string | null;
  messageId: string | null;
  rawSha256: string;
  fromAddress: string | null;
  toAddresses: string[];
  subject: string | null;
  receivedAt: Date | null;
  status: InboundEmailMessageStatus;
  rawStorageKey: string | null;
  createdIssueId: string | null;
  error: string | null;
  skipReason: string | null;
  sourceDeletedAt: Date | null;
  sourceDeleteError: string | null;
  sourceSeenAt: Date | null;
  sourceSeenError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InboundEmailOpsMailboxHealth = "healthy" | "warning" | "error" | "disabled";

export type InboundEmailOpsJobStatus =
  | "pending"
  | "running"
  | "retrying"
  | "succeeded"
  | "failed"
  | "dead";

export interface InboundEmailOpsJobSummary {
  pending: number;
  running: number;
  retrying: number;
  failed: number;
  dead: number;
}

export interface InboundEmailOpsMessageSummary {
  discovered: number;
  persisted: number;
  processing: number;
  processed: number;
  skipped: number;
  failed: number;
  duplicate: number;
}

export interface InboundEmailOpsJob {
  id: string;
  companyId: string;
  kind: string;
  status: InboundEmailOpsJobStatus;
  mailboxId: string | null;
  messageId: string | null;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedBy: string | null;
  lockedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundEmailOpsMessage extends InboundEmailClassificationFields {
  id: string;
  mailboxId: string;
  status: InboundEmailMessageStatus;
  subject: string | null;
  fromAddress: string | null;
  createdIssueId: string | null;
  error: string | null;
  skipReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundEmailOpsMailbox {
  mailbox: InboundEmailMailbox;
  health: InboundEmailOpsMailboxHealth;
  healthDetail: string;
  nextPollDueAt: Date | null;
  messageCounts: InboundEmailOpsMessageSummary;
  jobCounts: InboundEmailOpsJobSummary;
  lastFailedMessage: InboundEmailOpsMessage | null;
  lastFailedJob: InboundEmailOpsJob | null;
}

export interface InboundEmailOpsDashboard {
  generatedAt: Date;
  sourceDelete: {
    supported: boolean;
    errorCount: number;
    lastError: string | null;
  };
  summary: {
    mailboxCount: number;
    enabledMailboxCount: number;
    healthyMailboxCount: number;
    warningMailboxCount: number;
    errorMailboxCount: number;
    pendingJobCount: number;
    failedJobCount: number;
    failedMessageCount: number;
  };
  mailboxes: InboundEmailOpsMailbox[];
  recentFailedJobs: InboundEmailOpsJob[];
  recentFailedMessages: InboundEmailOpsMessage[];
  orphanJobCounts: InboundEmailOpsJobSummary;
}
