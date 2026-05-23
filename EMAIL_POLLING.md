# Inbound Email Polling Logic

End-to-end flow for inbound IMAP polling and message processing. Two-stage pipeline driven by a generic background-job queue.

## 1. Worker entry point (`server/src/email-worker.ts`)

A standalone Node process loops forever calling `svc.runEmailWorkerOnce(workerId, batchSize, { runScheduler })`:

- Env-tunable knobs: `PAPERCLIP_EMAIL_WORKER_IDLE_MS` (5s default), `_BATCH_SIZE` (10), `_SCHEDULER_INTERVAL_MS` (10s).
- Each tick: optionally run the scheduler, claim up to `batchSize` jobs, sleep `idleMs` if no work.
- SIGINT/SIGTERM flips a `stopped` flag for graceful drain (30s hard deadline).

## 2. One tick — `runEmailWorkerOnce` (inbound-email.ts:1086)

Three steps:

1. **`jobs.requeueStaleRunning(5 * 60_000)`** — any job marked `running` for >5min gets returned to the queue (handles crashed workers).
2. **`enqueueDueMailboxPollJobs()`** — the scheduler (only every 10s thanks to `runScheduler`).
3. **Claim and run** up to `batchSize` jobs via `runNextEmailJob`.

## 3. Scheduler — `enqueueDueMailboxPollJobs` (line 797)

- Loads every `inboundEmailMailboxes` row with `enabled = true`.
- For each, checks `lastPollAt + pollIntervalSeconds <= now`; if due, enqueues a `email.poll_mailbox` job.
- **Dedupe key** = `${mailboxId}:${floor(now / intervalMs)}` — bucketed by interval window, so multiple workers/ticks within the same window can't queue duplicate polls.

## 4. Job dispatch — `runNextEmailJob` (line 1062)

- `jobs.claimNext({ workerId, kindPrefix: "email." })` — atomic claim from `background_jobs`, scoped to `email.*` kinds.
- Two kinds:
  - `email.poll_mailbox` → `pollMailbox(companyId, mailboxId)`
  - `email.process_message` → `processMessage(companyId, messageId)`
- On success → `jobs.complete`; on throw → `jobs.fail` (which decrements attempts / schedules retry).

## 5. Stage A — `pollMailbox` (line 843)

For one mailbox:

1. Load row, decrypt password via `secretService` (`__inbound_email_password__:<mailboxId>`).
2. Stamp `lastPollAt = now` (so we don't double-poll even if IMAP hangs).
3. Open IMAP session via `fetchUnreadMessages` (inbound-email-imap.ts) — pulls up to `fetchLimit` (default 20) unseen messages.
4. For each raw RFC822 buffer, call `submitRawMessage({...processAfterImport: false})`, then process the message inline while the IMAP session is still open. If inline processing fails, enqueue `email.process_message` for retry.
5. Do not mark the source message as read merely because it was fetched. Source cleanup happens only after processing reaches a terminal outcome: issue creation deletes the source, clarification-style skips mark it seen, and terminal duplicate sources get the same delete/seen treatment as the original row.
6. On overall success → set `lastSuccessAt`, clear `lastError`. On failure → write `lastError`, rethrow (job will retry).

## 6. Stage A.5 — `submitRawMessage` (line 904)

Imports a raw email into the DB without yet creating an issue:

1. **Parse** via `parseInboundEmail` (MIME → subject, from, to, body text/html, attachments, `messageId`, `rawSha256`).
2. **Dedupe** via `findDuplicate` — matches on `(mailboxId, providerUid)` OR `rawSha256` OR `messageId`.
   - If duplicate exists and it's stuck in a non-terminal state without an issue, re-enqueue a process job (handles the case where the original import partially failed before the process job was scheduled).
3. **Store the raw email** to object storage (`storeRawEmail`) → `rawStorageKey`.
4. Insert an `inbound_email_messages` row with `status: "persisted"`.
5. Stream attachments to storage and insert `inbound_email_attachments`.
6. Log `inbound_email.message_imported` activity.
7. Enqueue `email.process_message` job for that message id.

This separation means parsing/storage and issue creation are **transactionally independent** — a flaky issues service won't lose mail, and a re-poll won't double-import.

The historical archive is storage-linked: raw `.eml` files are saved under `inbound-email/raw`, attachments under `inbound-email/attachments`, and the database rows link the message, attachment metadata, and created assets.

## 7. Stage B — `processMessage` (line 985)

Runs in its own job, so retries don't repeat IMAP I/O:

1. Re-read message; if already `processed`/`duplicate`/`skipped`, return (idempotent).
2. Flip `status: "processing"`.
3. Resolve sender identity — domain → active client → registered employee.
4. If the registered sender sent a registration command, handle the client employee registration path and do not create an issue.
5. Otherwise, `resolveProcessingContext` → `{mailbox, rule}` for mailbox settings plus optional priority/labels from matching rules, then `resolveSenderAuthorization` performs fuzzy project detection and optional employee project-link checks.
6. For recognized non-registration senders, run deterministic V1 support classification and persist category, confidence, severity, recommended/final action, summary, safety flags, rule version, and timestamp on the message.
6. **If unauthorized**:
   - For `employee_not_registered`, `project_not_authorized`, `project_not_identified`, and `project_match_ambiguous`, send a Portuguese auto-reply via `sendInboundEmailAuthorizationReply` (email.ts). Authorization replies are best-effort and SMTP failures are logged.
   - Otherwise mark `status: "skipped"`, store `error: <reason>`, log `inbound_email.message_skipped`.
7. **If authorized for a support request**: `createIssueFromMessage` — calls `issues.create` with subject as title, formatted description, `priority`/`labelIds` from the rule context, `projectId` from fuzzy detection or configured target project, and `originKind: "inbound_email"` + `originFingerprint: rawSha256` so downstream dedupe at the issue level works. Then attaches each `inbound_email_attachments` row to the issue via `issueAttachments`.
8. Flip support messages to `status: "processed"`, write `createdIssueId`, log `inbound_email.issue_created`.
9. Delete the source IMAP message after a successful issue creation, or after a required Portuguese authorization/registration reply is sent and the message is marked `skipped`. `project_not_identified` keeps the source email in the mailbox and marks it seen after the reply. Unknown-domain skips are not deleted, but they are marked seen so the poller does not keep fetching them.
10. On exception before terminal status → `status: "failed"`, `error: <msg>`, rethrow so the job-queue retry policy applies.
11. If source deletion fails after terminal status, keep the terminal status, store `source_delete_error`, rethrow, and let the job retry deletion without recreating the issue or resending the reply.

## Email employee registration

Registered client employees can register another employee by email without creating a Paperclip issue.

- The command is detected before project matching. Accepted phrases are token-aware and accent-insensitive: `cadastro de usuário`, `cadastrar usuário`, `novo usuário`, and `registrar usuário`.
- The email must include labeled fields: `Nome: Maria Silva` and `Email: maria@empresa.com`.
- The requested email must belong to one of the same client's accepted email domains.
- New employees copy the requester's `role`, `projectScope`, and selected project links. Existing employees keep their name; if role or project permissions differ, those permissions are updated to match the requester. Both writes (employee row + project-link replacement) run inside a single DB transaction so retries never observe a partial update.
- **Privilege model**: any registered employee can grant another address on an accepted client domain the same role/scope they hold themselves — there is no admin approval step and no "max role you can grant" gate. If `role` grants meaningful authority elsewhere, treat email-based registration as equivalent to letting any current employee create peers.
- Registration parsing only reads the subject and the new body content above quoted history (`Em … escreveu:`, `On … wrote:`, `>` lines, `-----Original Message-----`, etc.), so replies to old registration threads don't re-trigger the flow.
- Registration outcomes are terminal `skipped` messages with `employee_registration_*` skip reasons. They send a Portuguese reply and delete the source IMAP message after the reply succeeds. They never call `createIssueFromMessage`.

## Support classification V1

Classification is deterministic and conservative in V1. It does not call an LLM, auto-run agents, auto-deploy code, or fix infrastructure. The classifier treats the original email as untrusted evidence and stores its decision on `inbound_email_messages`.

- Categories: `code_bug`, `infra_incident`, `how_to_question`, `feature_request`, `account_access`, `spam_or_irrelevant`, `unsafe_or_prompt_injection`, and `unclear`.
- Safety patterns such as prompt-injection text, secret requests, dangerous commands, or immediate deploy instructions win before normal bug/infra/question matching.
- `code_bug`, `infra_incident`, `feature_request`, `how_to_question`, and `account_access` create triage issues for recognized senders. `code_bug` and `infra_incident` default to high priority when no rule priority applies; questions default to low. `unclear` keeps the existing project-clarification behavior when no project is identified.
- `unsafe_or_prompt_injection` and `spam_or_irrelevant` are skipped/quarantined and marked seen so the worker does not keep reprocessing them.
- If project matching fails with `project_not_identified`, classification can still create a projectless triage issue for a recognized sender when mailbox/rule policy allows it. Unknown domains, unregistered employees, unauthorized projects, and ambiguous project matches keep the existing authorization skip/reply behavior.
- Created issue descriptions include classification metadata plus an explicit warning that the original email is untrusted user-provided evidence.

## Support intake routing

Support intake routing is configured on the inbound mailbox and can be refined by inbound rules.

- Mailboxes default to allowing projectless triage (`allow_projectless_triage = true`) and using `create_projectless_triage` when a recognized support email does not identify a project.
- Operators can set mailbox `project_fallback_mode` to `request_clarification` to preserve the existing clarification reply/skip behavior for projectless reports.
- Inbound rules can now match classification category and body text in addition to sender and subject.
- Inbound rules can override the missing-project fallback for matching mail. A rule can allow projectless triage for a specific support category/body pattern, or force clarification for risky matches.
- `allow_projectless_triage = false` is a hard mailbox gate: matching rules cannot create projectless issues for that mailbox.

## Support replies V1

Support replies are per-mailbox opt-in via `support_replies_enabled`. When enabled and company SMTP is configured, the worker sends Portuguese acknowledgement replies after a classified support email reaches a terminal outcome.

- `code_bug`, `infra_incident`, `feature_request`, `how_to_question`, and `account_access` confirmations include the created issue identifier when one exists.
- `unclear` can send a request for project name, URL or screen, reproduction steps, expected behavior, actual behavior, screenshots, or logs, except when the existing project-identification authorization reply already handled that clarification.
- `unsafe_or_prompt_injection` and `spam_or_irrelevant` never send a support reply.
- Reply outcomes are stored on `inbound_email_messages` as status, reason, attempted/sent timestamps, and error text. SMTP-not-configured and send failures do not fail message processing or source cleanup, and sent replies are not duplicated by retries.

## Code bug agent automation V1

Agent automation is per-mailbox opt-in via `agent_automation_enabled`. When enabled, the mailbox must name an assignable `agent_automation_assignee_id`.

- Only trusted `code_bug` reports with a resolved project are eligible.
- The classifier confidence must be at or above `agent_automation_min_confidence` and the message must have no safety flags.
- Eligible messages persist `classification_final_action = create_agent_task`, create a sanitized issue in `todo`, assign the configured agent, and optionally wake the agent when `agent_automation_wake_enabled` is true.
- Projectless triage, unclear reports, infra incidents, feature requests, questions, account/access messages, unsafe messages, spam, unauthorized senders, ambiguous project matches, and low-confidence bug reports remain triage or skip flows.
- The created issue description still treats the original email as untrusted evidence; agents receive the Paperclip issue, not raw email authority.

## Approved deploy workflow foundation

Paperclip now stores deployment readiness metadata without executing production deploys automatically.

- Project configuration includes deployment targets with environment, provider, target URL, health-check URL, operator notes, deploy/rollback command descriptors, rollback instructions, and active/disabled status.
- Deployment targets can opt in to maintenance updates with an explicit recipient list.
- Agents or operators can request a `deploy_change` approval for a project issue and an active deployment target.
- Deploy approval payloads capture changed files, tests run, target snapshot, issue snapshot, risk notes, rollback plan, and optional maintenance message.
- Each request writes a project deploy event with `approval_requested`; approval and rejection update that event to `approved` or `rejected`.
- After approval, the requesting agent or board can record the manual deploy handoff as `deploying`, `deployed`, `failed`, or `rolled_back`. These transitions append audit metadata to the deploy event and log project activity.
- Approved deploy events can also store deploy/rollback command evidence. The command text must match the selected deployment target descriptor, the deploy approval must be approved, and rollback evidence is only accepted after the event is deployed, failed, or already rolled back. These records capture command type, status, optional output/note, and actor metadata; Paperclip still does not execute the command.
- Maintenance messages are explicit sends, not automatic side effects. They require approved deploy approval, an eligible deploy event status, target opt-in, configured recipients, and a message body. Delivery status, recipients, attempted/sent timestamps, and errors are stored on the deploy event. A `sent` message is not sent again on retry.
- Disabled targets cannot receive deploy approval requests.
- This foundation is intentionally approval-gated. It does not SSH to servers, run deploy commands, change DNS, or send customer maintenance mail automatically.

## Infrastructure topology and health foundation

Paperclip can now record project infrastructure metadata without mutating provider state.

- Project configuration can store infrastructure targets with environment, provider, provider account reference, region, role, host, failover group/rank, and active/disabled status.
- Known infrastructure providers are described by a metadata-only capability catalog (`manual`, `generic_vps`, `hetzner`, `digitalocean`, `linode`, `vultr`, `aws_lightsail`, `fly_io`, `render`). The descriptor records known health, repair, failover, and provider-support capabilities for planning and UI visibility only.
- Provider credentials, tokens, passwords, and API keys are rejected from infrastructure target metadata. Credentials must live in dedicated secret bindings before any future provider adapter can use them.
- Infrastructure targets default to `repairActionsRequireApproval = true`; the current system records topology and incidents but does not run provider repair, failover, DNS, SSH, or VPS commands.
- Project health checks can be configured as HTTP, TCP, or manual checks with target linkage, URL, expected status, interval, timeout, enabled flag, and last-known health result.
- Operators or approved automation can record health results as `healthy`, `degraded`, or `unhealthy`. Degraded/unhealthy results can create an infra incident and linked Paperclip issue.
- The server runs a conservative HTTP health-check scheduler by default. It evaluates due enabled HTTP checks, stores status/latency/error evidence, and creates or reuses open infra incidents for degraded/unhealthy results. Configure it with `PAPERCLIP_INFRA_HEALTH_SCHEDULER_ENABLED=false`, `PAPERCLIP_INFRA_HEALTH_SCHEDULER_INTERVAL_MS`, and `PAPERCLIP_INFRA_HEALTH_SCHEDULER_BATCH_SIZE`.
- Health results store evidence-only source fields (`operator`, `paperclip_scheduler`, or `external_monitor`), optional source ID/detail, and optional source metadata. External monitor submissions update health evidence and may create incidents, but they do not execute provider repair, failover, DNS, SSH, or deploy actions.
- Trusted inbound emails classified as `infra_incident` and resolved to a project create or reuse an active infrastructure incident record linked to the project. Projectless infra triage still creates only a triage issue until a project is identified.
- Infra incident records track source, grouping key, occurrence count, last occurrence time, escalation marker/reason, severity, status, recommended action, related health check, related infra target, and optional approval reference for future repair actions.
- Repeated active incidents are grouped by health check, target, or project-level inbound infra report. Escalation is evidence-only: by default urgent incidents escalate immediately and repeated incidents escalate after 3 occurrences. Tune with `PAPERCLIP_INFRA_INCIDENT_ESCALATION_REPEAT_THRESHOLD`, `PAPERCLIP_INFRA_INCIDENT_ESCALATE_URGENT_SEVERITY=false`, and `PAPERCLIP_INFRA_INCIDENT_ESCALATE_HIGH_SEVERITY=true`.
- Infra repair/failover proposals are explicit records linked to an infra incident and a normal `infra_repair` approval. They capture action type, rationale, proposed manual action, rollback plan, risk, provider/region context, and required evidence.
- Approval decisions move infra proposals to approved/rejected/revision-requested through the standard approvals flow. Evidence for manual repair/failover attempts is accepted only after approval and records status, notes, optional output, and actor metadata.

## External support intake recovery

Paperclip can preserve and recover raw support messages captured outside the normal IMAP polling path.

- External intake records are stored in `inbound_email_external_intake_records` with company, mailbox, source kind, source ID, optional source location, raw SHA-256, parsed Message-ID, status, linked inbound message, error, metadata, and timestamps.
- Supported source kinds are `webhook`, `queue`, `object_storage`, and `manual_recovery`. They represent preserved raw messages from an external backup mailbox, webhook provider, queue, or operator recovery run.
- Operators can import a preserved raw message through `POST /api/companies/:companyId/inbound-email/external-intake/import`. The payload supplies `mailboxId`, `sourceKind`, `sourceId`, optional `sourceLocation`, optional `metadata`, and `rawEmail`.
- Operators can also use **Inbound Email Ops → External Recovery Import** to paste a preserved raw message, choose the source kind/mailbox, record the backup source ID, and review recent external intake evidence.
- The import path calls the normal `submitRawMessage` flow with an external provider UID, so raw SHA/message-ID dedupe, attachment reconciliation, processing jobs, classification, issue creation, and support replies stay centralized.
- Recovery imports are idempotent by source. Reposting the same `(company, sourceKind, sourceId)` returns the existing intake record and linked message. Reusing a source ID with different raw bytes is rejected.
- Recovery imports are also idempotent by message fingerprint through the existing inbound email dedupe path. Different external sources that preserve the same raw email create separate intake evidence records but link to one inbound message.
- Failed imports keep a durable failed intake record with the error text and can be retried with the same source ID and raw email.
- This foundation does not fetch from external object storage, mutate mailbox provider state, repair infrastructure, fail over providers, or auto-deploy code. External monitoring remains evidence-only until explicit provider credentials, approvals, rollback, and alerting paths are added.

### External backup handoff format

During Paperclip downtime, the external support intake backup should preserve each original message as a raw RFC 822 `.eml` payload plus stable source metadata. The recovery importer expects operators or future webhook/queue adapters to provide:

| Field | Required | Meaning |
|---|---:|---|
| `mailboxId` | yes | The Paperclip inbound mailbox that should own the recovered message. |
| `sourceKind` | yes | One of `manual_recovery`, `webhook`, `queue`, or `object_storage`. |
| `sourceId` | yes | Stable unique external ID, such as queue message ID, webhook event ID, or object key. Reusing the same source ID with different raw bytes is rejected. |
| `sourceLocation` | no | Human-readable backup location, such as `s3://bucket/path/message.eml` or backup mailbox folder path. |
| `rawEmail` | yes | The original raw email including headers and body. Do not paste a rendered or summarized email. |
| `metadata` | no | Non-secret JSON metadata about provider, backup batch, receipt timestamp, or operator note. |

Recommended object-storage layout:

```text
support-backup/
  company-<company-id>/
    mailbox-<mailbox-id>/
      YYYY/MM/DD/
        <provider-message-id-or-random-id>.eml
        <provider-message-id-or-random-id>.json
```

The sidecar JSON should repeat `sourceKind`, `sourceId`, `sourceLocation`, receipt timestamp, provider, and mailbox address. It must not contain mailbox passwords, API keys, provider tokens, session cookies, or customer secrets beyond the email content already present in the `.eml`.

### Downtime recovery procedure

1. Confirm Paperclip is back online and migrations have applied.
2. Open **Inbound Email Ops → External Recovery Import**.
3. Select the mailbox that normally receives the message.
4. Choose the source kind and paste the stable source ID from the backup system.
5. Paste the raw `.eml` content into `Raw email`; optionally add the object path as `Source location`.
6. Submit the import and confirm the recent intake record is `imported` or `duplicate`.
7. Review **Processed Emails** or **Recent Failures**. If the recovered message failed processing, fix the underlying configuration or SMTP/authorization issue and retry the message.

Repeated imports are safe when the source ID and raw bytes are unchanged. Different backup sources that contain the same raw email are recorded separately as evidence but link to one inbound message through the existing message fingerprint dedupe.

## Project resolution

The shared support mailbox does not decide the project. Project resolution happens after sender authorization identifies the client and employee.

- Rules (`selectRule(message)`) are matched against `inboundEmailRules` after classification so they can use sender, subject, body text, classification category, priority, labels, and missing-project fallback overrides.
- Candidate projects are only active `client_projects` rows for the sender's active client.
- The matcher searches subject + body text against project name, client project name override, and client project aliases.
- Matching normalizes text by lowercasing, stripping accents, and removing spaces/punctuation, so `Oc Importer`, `oc-importer`, and `OCIMPORTER` all match.
- Single-token names or aliases such as `AI`, `IT`, or `OC` must appear as a whole token, so they do not match unrelated words like `failure` or `document`.
- The single strongest match wins. If there is no match, the sender gets `project_not_identified`. If multiple projects tie for strongest match, the sender gets `project_match_ambiguous`.

## Sender authorization

In `resolveSenderAuthorization`:

1. Normalize sender email + domain. If missing → `unknown_sender_domain`.
2. Find `clientEmailDomains` row matching `(companyId, domain)` joined to an `active` client. No match → `unknown_sender_domain`.
3. Find `clientEmployees` row matching `(companyId, clientId, email)`. No match → `employee_not_registered` (triggers reply).
4. Fuzzy-match subject/body against the active projects linked to the client. No match → `project_not_identified` (triggers reply and marks source seen). Ambiguous match → `project_match_ambiguous` (triggers reply and marks source seen so the sender can reply in the same thread).
5. If `employee.projectScope === "selected_projects"`, require a `clientEmployeeProjectLinks` row for `(employee, matched clientProject)`. Missing → `project_not_authorized`.

## Message status state machine

```
persisted → processing → processed   (issue created)
                       ↘ duplicate    (caught by findDuplicate)
                       ↘ skipped      (auth failure; terminal)
                       ↘ failed       (transient; retried via job)
```

Terminal `processed` messages with an issue and terminal `skipped` messages that already sent a required reply also track source mailbox cleanup with `source_deleted_at` / `source_delete_error` or `source_seen_at` / `source_seen_error`.

## Why this design

- **Two stages, two jobs**: IMAP fetching is bursty and slow; issue creation is fast and DB-bound. Splitting them lets retries be cheap and lets the raw email survive even if issue creation breaks.
- **Dedupe at three levels**: bucketed poll dedupe key (no thundering herd), `findDuplicate` for re-imports, and issue-level `originFingerprint`.
- **Generic `background_jobs` queue** — the same infrastructure handles claim/retry/stale-requeue; this module just registers `email.*` kinds.
