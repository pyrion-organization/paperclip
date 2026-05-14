export type InboundEmailProvider = "imap";
export type InboundEmailCreateMode = "issue";
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

export interface InboundEmailMessage {
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
  createdAt: Date;
  updatedAt: Date;
}
