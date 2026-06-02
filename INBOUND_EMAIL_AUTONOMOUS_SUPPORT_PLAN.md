# Inbound Email Autonomous Support

## Implemented: Safe Foundation

Paperclip now has the safe foundation for using inbound support email as an entry point into the control plane.

The implemented system can receive support mail through IMAP polling or external intake, archive raw messages and attachments, deduplicate imports, authorize senders, resolve projects, classify support messages, create triage issues, send conservative replies, and expose the flow in Email Ops.

The current implementation keeps the original safety principle intact:

> Email is evidence, not authority.

Inbound messages are treated as untrusted user-provided evidence. They can create structured Paperclip issues, but they do not directly grant permission to run commands, reveal secrets, deploy code, mutate infrastructure, or bypass approval gates.

### Inbound Intake And Recovery

Implemented:

- Standalone inbound email worker for `email.*` background jobs.
- IMAP polling for enabled inbound mailboxes.
- Raw RFC 822 email import, raw storage, attachment storage, and dedupe by provider UID, raw hash, and Message-ID.
- Durable `inbound_email_messages` and `inbound_email_attachments` records.
- Source cleanup state for delete/mark-seen outcomes.
- External intake records for preserved raw support messages.
- Board import endpoint for one preserved message.
- Board bounded batch import endpoint.
- Public per-mailbox external intake endpoint for webhook, queue, and object-storage backup systems.
- Per-mailbox external intake token creation, rotation, and revocation.
- Public intake rate limiting by mailbox and client IP.
- Recovery import UI in Email Ops.
- Failed external intake retry handoff.

### Sender, Project, And Registration Handling

Implemented:

- Sender identity resolution by client email domain.
- Registered client employee lookup.
- Existing authorization skip/reply behavior for unknown domains, unregistered employees, unauthorized projects, missing project identification, and ambiguous project matching.
- Client employee registration command handling.
- Project matching against active client projects, project overrides, and aliases.
- Projectless support triage when mailbox/rule policy allows it.
- Rule-level missing-project fallback overrides.

### Classification Foundation

Implemented deterministic support classification for:

- `code_bug`
- `infra_incident`
- `how_to_question`
- `feature_request`
- `account_access`
- `unsafe_or_prompt_injection`
- `unclear`

Classification metadata is persisted on inbound messages:

- category
- confidence
- severity
- recommended action
- final action
- summary
- safety flags
- rule version
- classified timestamp

The issue description includes classification metadata and an explicit warning that the original email is untrusted evidence. Email Ops shows classification badges, summaries, safety flags, low-confidence review items, quarantine items, and filtered message lists.

The system also has the type/DB/UI handling for `spam_or_irrelevant`, but not a real spam detector yet. That gap is tracked below.

### Policy Gate And Issue Creation

Implemented:

- Server-side policy gate separate from classifier recommendation.
- Unsafe/prompt-injection quarantine.
- Authorized support issue creation.
- Projectless triage issue creation when allowed.
- Rule priority and labels.
- Attachment linking to created issues.
- Inbound issue origin metadata and fingerprinting.
- Idempotent retries that avoid duplicate issue creation.

### Support Replies

Implemented:

- Per-mailbox opt-in support replies.
- Portuguese acknowledgement replies for accepted support reports.
- Request-more-info replies for unclear reports.
- Existing authorization and registration replies preserved.
- Reply outcomes stored on inbound messages.
- SMTP failures recorded without failing message processing.
- Retry-safe duplicate reply prevention.
- No support replies for unsafe/spam classifications.

### Code Bug Agent Automation

Implemented a conservative first automation layer:

- Mailbox-level opt-in.
- Configured assignable agent.
- Minimum classifier confidence gate.
- Trusted sender requirement.
- `code_bug` category requirement.
- Resolved project requirement.
- Configured project workspace requirement.
- Budget hard-stop gate.
- Safety flag block.
- Sanitized `todo` issue creation.
- Optional assignee wakeup.
- No automatic deploy.

Agents receive the Paperclip issue, not raw email authority.

### Deployment Foundation

Implemented:

- Project deployment targets.
- Deployment target environment/provider/URL/health-check/notes metadata.
- Deploy and rollback command descriptors.
- Explicit command-execution opt-in.
- Disabled target protection.
- `deploy_change` approvals linked to project issues.
- Deploy event records.
- Approval/rejection status transitions.
- Manual/agent-assisted deploy handoff states: `deploying`, `deployed`, `failed`, `rolled_back`.
- Deploy/rollback command evidence.
- Approved command execution from Paperclip only when explicitly enabled and approval/status/actor/workspace rules pass.
- Maintenance update opt-in with explicit recipients.
- Approval-gated maintenance message sends with retry-safe sent state.

This is an approval-gated deployment workflow, not autonomous deployment from email.

### Infrastructure Foundation

Implemented:

- Project infrastructure targets.
- Provider/account/environment/region/host metadata.
- Failover group and rank metadata.
- Metadata-only provider capability catalog.
- Rejection of credentials, tokens, passwords, and API keys in normal infra metadata.
- `repairActionsRequireApproval` boundary.
- Project health checks.
- Scheduled HTTP health-check runner.
- External monitor token creation/revocation.
- Token-protected external health evidence endpoint.
- Infra incident records.
- Incident grouping and occurrence counts.
- Evidence-only escalation.
- Trusted `infra_incident` support emails that resolve to a project can create/reuse infra incident records.
- Approval-gated infra repair/failover proposal records.
- Approved manual repair/failover evidence records.

This is an incident/evidence/proposal foundation, not provider repair automation.

## To Implement: Remaining Autonomous Support Work

The long-term autonomous support loop is not complete. The remaining work should continue to follow the same safety principle: email can provide evidence and trigger controlled workflow, but privileged actions require policy checks, approvals, and audit evidence.

### 1. Real Spam Classification

`spam_or_irrelevant` exists in the data model and UI, but Paperclip does not currently assign it through a real spam detector.

Recommended V1:

- Add a provider-verdict parser for raw headers and external intake metadata.
- Support SES spam/virus/authentication verdicts first.
- Support common IMAP spam headers such as `X-Spam-Flag`, `X-Spam-Status`, `X-Spam-Score`, and `Authentication-Results`.
- Support Mailgun or other route-provider spam metadata through external intake metadata.
- Classify provider-confirmed spam as `spam_or_irrelevant`.
- Quarantine provider-confirmed virus/malware as unsafe with a dedicated safety flag.
- Treat SPF/DKIM/DMARC failures as evidence, not automatic spam.
- Add only conservative local spam rules for obvious junk.
- Show provider spam evidence in Email Ops quarantine rows.

Tests should cover provider-confirmed spam, borderline verdicts, auth failures that are not spam, no issue creation, no support reply, and quarantine visibility.

### 2. Optional LLM-Assisted Classification

The current classifier is deterministic. The next classifier layer can use an LLM only as advisory input.

Requirements:

- Strict JSON schema.
- Deterministic fallback remains authoritative when LLM fails or is disabled.
- Server-side policy gate remains authoritative.
- Confidence thresholds.
- Eval corpus with real support examples.
- Low-confidence review queue.
- No LLM output can directly run agents, deploy code, access secrets, or repair infrastructure.

Recommended approach:

1. Keep the deterministic classifier as the first pass for high-confidence safety and obvious categories.
2. Ask an LLM only for ambiguous or low-confidence messages.
3. Store LLM model/version/prompt hash as classification evidence.
4. Require policy confirmation before any agent automation path.

### 3. Full Email-To-Code-Fix Workflow

The current system can create and optionally wake a coding-agent issue for safe code-bug reports. It does not guarantee a full autonomous fix/PR workflow from the email plan itself.

Remaining work:

- Define the exact agent issue template for email-originated code bugs.
- Require reproduction/inspection notes from the agent.
- Require focused tests or a clear reason tests could not be run.
- Require a patch/commit/PR handoff artifact.
- Link agent run output back to the inbound email issue.
- Show agent run status in Email Ops or the related issue view.
- Add tests around policy gates and budget behavior for email-originated agent tasks.

The raw email should remain attached as evidence only. The agent-facing issue should stay Paperclip-authored and sanitized.

### 4. Status Updates To Users

Support replies currently cover acknowledgement and clarification. The mature support loop needs richer status updates.

Remaining work:

- Decide which categories receive updates.
- Support Portuguese and English templates.
- Group updates by original sender, client, project, and incident/deploy context.
- Send issue-created, fix-started, fix-completed, deploy-approved, deploy-completed, and incident-resolved messages only when policy allows.
- Avoid leaking internal agent logs, secrets, stack traces, or raw infrastructure evidence.
- Prevent duplicate sends across retries.

This should be opt-in and auditable per mailbox/client/project.

### 5. Production PR/Patch And Deploy Handoff

Deploy foundations exist, but email-originated fixes are not yet a complete production workflow.

Remaining work:

- Connect email-originated code-bug issues to the normal PR/patch lifecycle.
- Require deploy readiness evidence from the agent or operator.
- Attach changed files, tests run, risk, rollback plan, and target snapshot to the deploy approval.
- Decide when an email-created issue is eligible for deploy approval.
- Show the full chain from inbound email -> issue -> agent run -> patch/PR -> deploy approval -> deploy event -> user update.

Deploy should remain explicit and approval-gated. Automatic production deploy from email should remain out of scope until the team has much more evidence.

### 6. Provider Repair And Failover Execution

Infrastructure foundation exists, but real provider repair/failover is intentionally not implemented.

Remaining work:

- Choose first provider adapters.
- Define secret binding model for provider credentials.
- Define provider-specific safe actions.
- Define approval requirements per action type.
- Require rollback plans and evidence.
- Add dry-run/planning mode.
- Add repair/failover execution records.
- Add external verification after repair.
- Add incident update messages only after verified outcomes.

Dangerous actions should remain approval-gated:

- DNS changes.
- Firewall changes.
- Credential rotation.
- Database changes.
- Backup restore.
- Server rebuilds.
- Production traffic failover.
- Provider API mutations.

### 7. External Backup Integrations

Paperclip can receive preserved raw messages, but it does not itself run an external backup mailbox or queue.

Remaining work:

- Decide where external support backup data lives.
- Define recommended provider setup, such as SES -> S3/SNS, Mailgun Routes, or another mailbox backup system.
- Document deployment-specific handoff steps.
- Add adapters or scripts that submit preserved `.eml` messages to Paperclip external intake.
- Add monitoring to prove the backup path is active.
- Add operator runbook for Paperclip downtime recovery.

The mature architecture should not depend on Paperclip being healthy to preserve outage reports.

### 8. Operator Decisions Still Needed

Before pushing further autonomy, decide:

- Which projects may receive projectless triage issues.
- Which users/domains can trigger support automation.
- Which agents are eligible for auto-assignment.
- What confidence threshold is required for automation.
- Which mailboxes send replies.
- Which languages reply templates support.
- Which categories get status updates.
- Which deployment targets exist per project.
- Which deploy actions require approval.
- Which infra actions can be proposed or executed.
- Which VPS/cloud providers are supported first.
- Where external backup support mail is preserved.

## Recommended Next Step

The next concrete implementation should be real spam classification through provider verdicts.

That is the smallest missing piece in the current inbound-email support foundation: the system already stores and handles spam classifications, but it does not reliably produce them. Implementing provider-backed spam evidence will improve safety without increasing agent, deploy, or infrastructure authority.
