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
6. **If unauthorized**:
   - For `employee_not_registered`, `project_not_authorized`, `project_not_identified`, and `project_match_ambiguous`, send a Portuguese auto-reply via `sendInboundEmailAuthorizationReply` (email.ts). Authorization replies are best-effort and SMTP failures are logged.
   - Otherwise mark `status: "skipped"`, store `error: <reason>`, log `inbound_email.message_skipped`.
7. **If authorized for a support request**: `createIssueFromMessage` — calls `issues.create` with subject as title, formatted description, `priority`/`labelIds` from the rule context, `projectId` from fuzzy detection, and `originKind: "inbound_email"` + `originFingerprint: rawSha256` so downstream dedupe at the issue level works. Then attaches each `inbound_email_attachments` row to the issue via `issueAttachments`.
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

## Project resolution

The shared support mailbox does not decide the project. Project resolution happens after sender authorization identifies the client and employee.

- Rule (`selectRule(message)`) is still matched against `inboundEmailRules` for priority/labels, but rule and mailbox `targetProjectId` are ignored for project routing.
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
