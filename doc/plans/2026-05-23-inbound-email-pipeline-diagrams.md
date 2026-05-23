# Inbound Email Pipeline Diagrams

Date: 2026-05-23

This document visualizes two states:

1. The current inbound email pipeline implemented in Paperclip.
2. The proposed full autonomous support pipeline described in
   `doc/plans/2026-05-23-full-autonomous-support-implementation.md`.

The important product boundary is that email intake is not a separate execution
system. It feeds Paperclip-native objects: messages, issues, comments, agents,
workspaces, approvals, deploy events, infra incidents, work products, and
activity logs.

## Current Pipeline: Worker and Queue

The current system is a two-stage email worker backed by the existing
`background_jobs` table. Polling imports raw messages and attachments; processing
later classifies and routes them.

```mermaid
flowchart TD
  Worker["email-worker.ts<br/>worker loop"]
  Tick["runEmailWorkerOnce"]
  Requeue["requeue stale running email jobs<br/>> 5 min"]
  Scheduler["enqueueDueMailboxPollJobs"]
  Claim["claim next email.* job"]

  PollJob["email.poll_mailbox"]
  ProcessJob["email.process_message"]

  Worker --> Tick
  Tick --> Requeue
  Requeue --> Scheduler
  Scheduler --> Claim
  Claim --> PollJob
  Claim --> ProcessJob

  Mailboxes["enabled inbound_email_mailboxes"]
  Due["lastPollAt + interval <= now"]
  DedupeKey["bucketed dedupe key<br/>mailboxId + interval window"]
  QueuePoll["background_jobs insert<br/>email.poll_mailbox"]

  Scheduler --> Mailboxes
  Mailboxes --> Due
  Due --> DedupeKey
  DedupeKey --> QueuePoll

  PollJob --> PollMailbox["pollMailbox"]
  ProcessJob --> ProcessMessage["processMessage"]

  PollMailbox --> CompletePoll["complete job"]
  PollMailbox --> FailPoll["fail job + retry"]
  ProcessMessage --> CompleteProcess["complete job"]
  ProcessMessage --> FailProcess["fail job + retry"]
```

## Current Pipeline: Mailbox Poll and Import

Polling opens the mailbox, fetches unread messages, persists raw evidence, stores
attachments, and queues message processing. Source mailbox cleanup happens only
after a terminal outcome.

```mermaid
flowchart TD
  PollMailbox["pollMailbox(companyId, mailboxId)"]
  LoadMailbox["load mailbox config"]
  DecryptPassword["decrypt mailbox password<br/>company_secrets"]
  StampPoll["set lastPollAt"]
  ImapFetch["fetch unread IMAP messages<br/>up to fetchLimit"]

  PollMailbox --> LoadMailbox --> DecryptPassword --> StampPoll --> ImapFetch

  ImapFetch --> RawEmail["raw RFC 822 message"]
  RawEmail --> SubmitRaw["submitRawMessage<br/>processAfterImport=false"]

  SubmitRaw --> Parse["parse MIME<br/>subject, from, reply-to, body, html,<br/>message-id, raw sha, attachments"]
  Parse --> DuplicateCheck["find duplicate by<br/>mailbox+providerUid<br/>rawSha256<br/>messageId"]

  DuplicateCheck -->|duplicate terminal| DuplicateTerminal["return duplicate result"]
  DuplicateCheck -->|duplicate incomplete| ReconcileAttachments["reconcile/store missing attachments"]
  ReconcileAttachments --> ReenqueueOriginal["re-enqueue original process job"]

  DuplicateCheck -->|new| StoreRaw["store raw email in object storage"]
  StoreRaw --> InsertMessage["insert inbound_email_messages<br/>status=persisted"]
  InsertMessage --> StoreAttachments["store attachments<br/>insert inbound_email_attachments"]
  StoreAttachments --> LogImported["activity: inbound_email.message_imported"]
  LogImported --> EnqueueProcess["enqueue email.process_message"]

  SubmitRaw --> InlineProcess["process message inline while IMAP session is open"]
  InlineProcess -->|terminal success| SourceCleanup["delete or mark source message seen<br/>depending on outcome"]
  InlineProcess -->|processing fails| RetryLater["enqueue process job for retry"]
```

## Current Pipeline: Processing, Classification, and Routing

The current support foundation classifies recognized support messages
deterministically, applies policy gates, creates issues/incidents where allowed,
sends configured replies, and quarantines unsafe/spam input.

```mermaid
flowchart TD
  ProcessMessage["processMessage(companyId, messageId)"]
  IdempotentCheck["if processed, duplicate, or skipped<br/>return"]
  MarkProcessing["status=processing"]
  SenderContext["resolve sender identity<br/>domain -> client -> employee"]
  RegistrationCheck["registration command?"]
  RegistrationFlow["handle employee registration<br/>terminal skipped + reply"]

  ProcessMessage --> IdempotentCheck --> MarkProcessing --> SenderContext --> RegistrationCheck
  RegistrationCheck -->|yes| RegistrationFlow
  RegistrationCheck -->|no| Context["resolveProcessingContext<br/>mailbox + matching rule"]

  Context --> Auth["resolveSenderAuthorization<br/>project matching + permissions"]
  Auth -->|unauthorized / ambiguous / unregistered| AuthReply["send authorization or clarification reply<br/>when applicable"]
  AuthReply --> SkipAuth["status=skipped<br/>source cleanup policy"]

  Auth -->|recognized sender| Classifier["deterministic support classifier"]
  Classifier --> PersistClass["persist category, severity, confidence,<br/>summary, safety flags, recommended/final action"]

  PersistClass --> Unsafe{"unsafe or spam?"}
  Unsafe -->|yes| Quarantine["status=skipped/quarantined<br/>mark source seen<br/>no support reply"]

  Unsafe -->|no| Category{"category"}
  Category -->|unclear| Clarify["request more info or preserve<br/>project clarification behavior"]
  Category -->|how_to_question/account_access| ReplyOrTriage["support reply and/or triage issue<br/>based on mailbox policy"]
  Category -->|feature_request| FeatureIssue["create triage issue"]
  Category -->|infra_incident| InfraFlow["create/reuse infra incident when project resolved<br/>create linked triage issue"]
  Category -->|code_bug| CodeBugGate["agent automation gate"]

  CodeBugGate -->|not eligible| BugTriage["create triage issue"]
  CodeBugGate -->|eligible| AgentTask["create sanitized issue<br/>assigned to configured agent<br/>optional wake"]

  ReplyOrTriage --> Terminal["status=processed/skipped<br/>persist reply state if sent"]
  FeatureIssue --> Terminal
  InfraFlow --> Terminal
  BugTriage --> Terminal
  AgentTask --> Terminal
  Clarify --> Terminal
```

## Current Pipeline: Code-Bug Agent Automation Gate

Code-bug automation already uses Paperclip's existing issue and agent structure.
The email does not directly execute code; it creates a sanitized issue and can
optionally wake an existing agent.

```mermaid
flowchart TD
  CodeBug["classified code_bug"]
  MailboxOptIn["mailbox agent_automation_enabled"]
  Assignee["agent_automation_assignee_id configured"]
  Confidence["confidence >= mailbox threshold"]
  Safety["no safety flags"]
  Project["project resolved"]
  Workspace["project has execution workspace<br/>cwd, repo_url, or remote_workspace_ref"]
  Budget["company/project/agent budget gates pass"]
  CreateIssue["create issue<br/>status=todo<br/>assignee=agent<br/>origin=inbound_email"]
  Wake["optional heartbeat wake<br/>through existing agent runtime"]
  Triage["fallback: create triage issue only"]

  CodeBug --> MailboxOptIn
  MailboxOptIn -->|no| Triage
  MailboxOptIn -->|yes| Assignee
  Assignee -->|missing| Triage
  Assignee -->|ok| Confidence
  Confidence -->|low| Triage
  Confidence -->|ok| Safety
  Safety -->|flags present| Triage
  Safety -->|ok| Project
  Project -->|missing| Triage
  Project -->|ok| Workspace
  Workspace -->|missing| Triage
  Workspace -->|ok| Budget
  Budget -->|blocked| Triage
  Budget -->|ok| CreateIssue --> Wake
```

## Current Pipeline: Deploy and Infra Foundations

Deployment and infrastructure support exist as approval-gated foundations. They
record evidence and can execute configured deploy/rollback commands only when a
deployment target opts in. Provider repair, DNS mutation, failover, and VPS
mutation are still intentionally out of scope.

```mermaid
flowchart TD
  Issue["Paperclip issue<br/>from support or normal work"]
  AgentOrBoard["agent or board"]
  DeployApproval["request deploy_change approval"]
  DeployEvent["project deploy event<br/>approval_requested"]
  BoardDecision{"board decision"}
  Approved["deploy event approved"]
  Rejected["deploy event rejected"]

  Issue --> AgentOrBoard --> DeployApproval --> DeployEvent --> BoardDecision
  BoardDecision -->|approve| Approved
  BoardDecision -->|reject| Rejected

  Approved --> ManualEvidence["record manual deploy/rollback evidence"]
  Approved --> OptInCommand{"target command execution enabled?"}
  OptInCommand -->|no| ManualEvidence
  OptInCommand -->|yes| ExecuteCommand["execute configured deploy/rollback descriptor<br/>in project workspace"]

  ManualEvidence --> EventStatus["deploying / deployed / failed / rolled_back"]
  ExecuteCommand --> EventStatus
  EventStatus --> Maintenance["optional maintenance message<br/>explicit send only"]

  HealthCheck["project health check"]
  MonitorEvidence["scheduler or external monitor evidence"]
  InfraIncident["infra incident<br/>grouped by project/target/health check"]
  RepairProposal["infra repair proposal"]
  RepairApproval["infra_repair approval"]
  ManualRepairEvidence["manual repair evidence after approval"]

  HealthCheck --> MonitorEvidence --> InfraIncident
  InfraIncident --> RepairProposal --> RepairApproval --> ManualRepairEvidence
```

## Current Data Links

The current implementation already connects email support intake to core
Paperclip records.

```mermaid
erDiagram
  COMPANIES ||--o{ INBOUND_EMAIL_MAILBOXES : owns
  COMPANIES ||--o{ INBOUND_EMAIL_MESSAGES : owns
  COMPANIES ||--o{ ISSUES : owns
  COMPANIES ||--o{ PROJECTS : owns
  COMPANIES ||--o{ AGENTS : owns

  INBOUND_EMAIL_MAILBOXES ||--o{ INBOUND_EMAIL_RULES : has
  INBOUND_EMAIL_MAILBOXES ||--o{ INBOUND_EMAIL_MESSAGES : imports
  INBOUND_EMAIL_MESSAGES ||--o{ INBOUND_EMAIL_ATTACHMENTS : has
  INBOUND_EMAIL_MESSAGES }o--o| ISSUES : creates

  PROJECTS ||--o{ ISSUES : contains
  PROJECTS ||--o{ PROJECT_DEPLOYMENT_TARGETS : has
  PROJECTS ||--o{ INFRA_TARGETS : has
  PROJECTS ||--o{ INFRA_HEALTH_CHECKS : has
  PROJECTS ||--o{ INFRA_INCIDENTS : has
  PROJECTS ||--o{ PROJECT_DEPLOY_EVENTS : has

  ISSUES }o--o| AGENTS : assigned_to
  ISSUES ||--o{ ISSUE_COMMENTS : has
  ISSUES ||--o{ ISSUE_ATTACHMENTS : has
  ISSUES ||--o{ APPROVALS : can_request

  PROJECT_DEPLOYMENT_TARGETS ||--o{ PROJECT_DEPLOY_EVENTS : receives
  PROJECT_DEPLOY_EVENTS ||--o{ DEPLOY_COMMAND_RECORDS : records
  INFRA_HEALTH_CHECKS ||--o{ INFRA_INCIDENTS : creates
  INFRA_INCIDENTS ||--o{ INFRA_REPAIR_PROPOSALS : has
  INFRA_REPAIR_PROPOSALS ||--o| APPROVALS : requires
```

## Final Pipeline: Full Autonomous Support Loop

The final proposal adds a support-case layer, optional LLM classification,
centralized policy, richer agent outcomes, approval-gated deploy/repair, and
customer communication automation. Execution still runs through existing
Paperclip agents and governed work objects.

```mermaid
flowchart TD
  Source["support input<br/>IMAP mailbox / webhook / queue / object storage / manual recovery"]
  Persist["persist raw email + attachments<br/>inbound_email_messages"]
  Case["find or create support_case<br/>thread-aware grouping"]
  Auth["sender authorization<br/>client + employee + project context"]
  Safety["deterministic safety prefilter"]
  Classifier["classification pipeline<br/>deterministic + optional LLM"]
  Policy["central support policy evaluator"]

  Source --> Persist --> Case --> Auth --> Safety --> Classifier --> Policy

  Policy --> Quarantine["quarantine<br/>unsafe/spam"]
  Policy --> MoreInfo["request more info<br/>waiting_on_user"]
  Policy --> Guidance["reply with guidance<br/>how-to/account"]
  Policy --> TriageIssue["create/update triage issue"]
  Policy --> AgentTask["create/update assigned agent issue"]
  Policy --> InfraIncident["create/update infra incident + issue"]
  Policy --> OperatorReview["operator review queue"]

  AgentTask --> Wake["optional wake existing Paperclip agent<br/>heartbeat/adapters"]
  Wake --> AgentWork["agent investigates in project workspace"]
  AgentWork --> Outcome{"agent outcome"}

  Outcome --> FixReady["fix ready<br/>comments + work products + tests"]
  Outcome --> NeedsInfo["needs more info<br/>draft user question"]
  Outcome --> NotCode["not code bug<br/>reclassify or close"]
  Outcome --> InfraRelated["convert/link to infra incident"]

  FixReady --> DeployApproval["request deploy_change approval"]
  DeployApproval --> BoardDeploy{"board approval"}
  BoardDeploy -->|approved| DeployAction["record evidence or execute approved target descriptor"]
  BoardDeploy -->|rejected| DeployRejected["case waits or returns to agent"]
  DeployAction --> HealthVerify["health checks / external monitor verification"]
  HealthVerify --> Resolution["resolve issue/case or rollback/escalate"]

  InfraIncident --> InfraAgent["optional infra agent diagnosis"]
  InfraAgent --> RepairProposal["repair/failover/rollback proposal"]
  RepairProposal --> RepairApproval["infra_repair approval"]
  RepairApproval --> BoardRepair{"board approval"}
  BoardRepair -->|approved| RepairAction["execute approved provider adapter or command descriptor"]
  BoardRepair -->|rejected| ManualEscalation["manual escalation"]
  RepairAction --> HealthVerify

  MoreInfo --> SupportReply["support reply delivery state"]
  Guidance --> SupportReply
  NeedsInfo --> SupportReply
  Resolution --> CustomerUpdate["resolution or maintenance update<br/>policy/approval gated"]
```

## Final Pipeline: Classification and Policy Detail

This is the key safety boundary. The LLM may improve understanding, but policy
still decides what happens.

```mermaid
flowchart TD
  Email["inbound email content<br/>untrusted"]
  Trim["trim quoted history<br/>extract new body"]
  SafetyPrefilter["deterministic safety prefilter<br/>prompt injection, secrets, dangerous ops"]
  Deterministic["deterministic classifier"]
  LLMEnabled{"LLM classifier enabled?"}
  LLMPrompt["bounded classifier prompt<br/>no secrets, no raw authority"]
  LLMOutput["structured JSON output"]
  Validate["schema validation"]
  Reconcile["reconcile deterministic + LLM"]
  PersistRun["persist classification run evidence"]
  Policy["server policy evaluator"]
  Decision["final policy decision"]

  Email --> Trim --> SafetyPrefilter --> Deterministic --> LLMEnabled
  LLMEnabled -->|no| Reconcile
  LLMEnabled -->|yes| LLMPrompt --> LLMOutput --> Validate --> Reconcile
  Validate -->|invalid| Reconcile
  Reconcile --> PersistRun --> Policy --> Decision

  Decision --> Blocked["blocked or review<br/>with stable reasons"]
  Decision --> Allowed["allowed action<br/>issue/reply/agent/incident/approval"]

  SafetyPrefilter -. serious safety flags always win .-> Policy
  Reconcile -. classifier recommends only .-> Policy
  Policy -. final action only .-> Decision
```

## Final Pipeline: Code Bug From Email to Deploy

The full code-bug loop uses existing Paperclip issue execution. The only new
support-specific layer is support case tracking and policy.

```mermaid
sequenceDiagram
  participant User
  participant Email as Inbound Email Worker
  participant Case as Support Case Service
  participant Policy as Support Policy
  participant Issues as Paperclip Issues
  participant Agent as Existing Paperclip Agent
  participant Approval as Approvals
  participant Deploy as Deploy Events
  participant Health as Health Checks

  User->>Email: sends bug report
  Email->>Email: import raw email and attachments
  Email->>Case: find/create support case
  Email->>Policy: classify + evaluate automation
  Policy-->>Email: create_agent_task allowed
  Email->>Issues: create sanitized issue
  Issues->>Agent: assign issue
  Email->>Agent: optional wake via normal heartbeat
  Agent->>Issues: investigate, comment, attach work products
  Agent->>Issues: produce fix + tests + risk notes
  Agent->>Approval: request deploy_change approval
  Approval-->>Deploy: create approval_requested deploy event
  Approval-->>Deploy: board approves
  Deploy->>Deploy: record command evidence or execute target descriptor
  Deploy->>Health: verify target health
  Health-->>Case: recovery verified
  Case-->>User: resolution update if policy allows
```

## Final Pipeline: Infrastructure Incident and Repair

Infra automation remains more constrained than code automation. User email or
health checks can create evidence and incidents, but repair/failover needs
approval and provider-specific execution paths.

```mermaid
sequenceDiagram
  participant Source as Email or Monitor
  participant Infra as Infra Incident Service
  participant Issues as Paperclip Issues
  participant Agent as Infra Agent
  participant Approval as Approvals
  participant Provider as Provider Adapter or Command Descriptor
  participant Health as Health Checks
  participant Notify as Customer Messaging

  Source->>Infra: degraded/unhealthy evidence or infra report
  Infra->>Infra: group or create active incident
  Infra->>Issues: create/update linked infra issue
  Infra->>Agent: optional assignment through normal Paperclip issue flow
  Agent->>Issues: diagnosis and proposed action
  Agent->>Approval: request infra_repair approval
  Approval-->>Agent: approved or rejected
  Approval-->>Provider: if approved, execute bounded repair/failover action
  Provider-->>Infra: evidence, output, status
  Infra->>Health: verify recovery
  Health-->>Infra: healthy/degraded/unhealthy result
  Infra->>Notify: approved maintenance or resolution update
```

## Final Data Model Additions

The proposed system adds support cases and classification run evidence while
continuing to use existing Paperclip records for actual work and execution.

```mermaid
erDiagram
  COMPANIES ||--o{ SUPPORT_CASES : owns
  SUPPORT_CASES ||--o{ SUPPORT_CASE_EVENTS : has
  SUPPORT_CASES ||--o{ INBOUND_EMAIL_MESSAGES : groups
  SUPPORT_CASES }o--o| ISSUES : primary_issue
  SUPPORT_CASES }o--o| INFRA_INCIDENTS : primary_incident
  SUPPORT_CASES ||--o{ SUPPORT_REPLIES : sends
  SUPPORT_CASES ||--o{ SUPPORT_CLASSIFICATION_RUNS : has

  INBOUND_EMAIL_MESSAGES ||--o{ SUPPORT_CLASSIFICATION_RUNS : classified_by
  INBOUND_EMAIL_MESSAGES ||--o{ INBOUND_EMAIL_ATTACHMENTS : has

  ISSUES ||--o{ ISSUE_COMMENTS : has
  ISSUES ||--o{ WORK_PRODUCTS : produces
  ISSUES ||--o{ APPROVALS : requests
  ISSUES }o--o| AGENTS : assigned_to

  APPROVALS ||--o| PROJECT_DEPLOY_EVENTS : deploy_change
  PROJECT_DEPLOY_EVENTS ||--o{ DEPLOY_COMMAND_RECORDS : records

  INFRA_INCIDENTS ||--o{ INFRA_REPAIR_PROPOSALS : has
  INFRA_REPAIR_PROPOSALS ||--o| APPROVALS : requires
  INFRA_INCIDENTS }o--o| INFRA_HEALTH_CHECKS : related_health_check
  INFRA_INCIDENTS }o--o| INFRA_TARGETS : related_target
```

## Final State Machine: Support Case Lifecycle

Support cases become the durable support-thread object that keeps email,
issues, incidents, replies, approvals, deploys, and agent work together.

```mermaid
stateDiagram-v2
  [*] --> Open: inbound message accepted
  Open --> Quarantined: unsafe/spam policy
  Open --> WaitingOnUser: clarification needed
  Open --> WaitingOnAgent: issue assigned or agent woken
  Open --> WaitingOnApproval: deploy/repair/reply approval requested
  Open --> Resolved: no further work required

  WaitingOnUser --> Open: user replies with more info
  WaitingOnAgent --> WaitingOnApproval: agent requests approval
  WaitingOnAgent --> WaitingOnUser: agent needs more info
  WaitingOnAgent --> Resolved: diagnosis/fix complete
  WaitingOnApproval --> WaitingOnAgent: approval rejected or revision requested
  WaitingOnApproval --> Resolved: approved action completed and verified
  Resolved --> Open: user replies within reopen window
  Resolved --> Closed: retention/closure policy
  Quarantined --> Open: operator releases message
  Closed --> Open: operator reopens
  Closed --> [*]
```

## Final Authorization and Safety Boundaries

This diagram shows the hard boundaries that should remain true even after LLMs,
agents, deploy automation, and infra repair are added.

```mermaid
flowchart LR
  Email["User email<br/>untrusted evidence"]
  Classifier["Classifier / LLM<br/>recommendation only"]
  Policy["Server policy gate<br/>final decision"]
  Paperclip["Paperclip work objects<br/>issues, approvals, incidents"]
  Agent["Existing agents<br/>heartbeat/adapters"]
  Privileged["Privileged actions<br/>deploy, repair, DNS, failover"]
  Approval["Board / governed approval"]

  Email --> Classifier --> Policy --> Paperclip --> Agent
  Agent --> Paperclip
  Agent --> Approval
  Approval --> Privileged
  Policy --> Approval

  Email -. cannot directly instruct .-> Agent
  Email -. cannot directly trigger .-> Privileged
  Classifier -. cannot directly trigger .-> Privileged
  Agent -. cannot bypass approval .-> Privileged
```

## Recommended Next Diagrams to Keep Updated

When implementation begins, keep these diagrams current:

1. Support case entity links.
2. Classification and policy decision flow.
3. Code-bug agent workflow.
4. Infra incident and repair workflow.
5. Deploy approval and command evidence workflow.
6. Support reply and maintenance-message workflow.

