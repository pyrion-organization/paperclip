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
4. For each raw RFC822 buffer, call `submitRawMessage({...processAfterImport: true})`.
5. If `mailbox.markSeen`, flag it `\Seen` on the server (failures are logged, not fatal).
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

## 7. Stage B — `processMessage` (line 985)

Runs in its own job, so retries don't repeat IMAP I/O:

1. Re-read message; if already `processed`/`duplicate`/`skipped`, return (idempotent).
2. Flip `status: "processing"`.
3. `resolveProcessingContext` → `{mailbox, rule, targetProjectId}` (rule wins over mailbox default).
4. `resolveSenderAuthorization` — domain → client → employee → optional project link checks.
5. **If unauthorized**:
   - For `employee_not_registered` and `project_not_authorized`, send a Portuguese auto-reply via `sendInboundEmailAuthorizationReply` (email.ts). If SMTP isn't configured, the reply step throws → job retries (intentional: don't skip-silently when SMTP is just misconfigured).
   - Otherwise mark `status: "skipped"`, store `error: <reason>`, log `inbound_email.message_skipped`.
6. **If authorized**: `createIssueFromMessage` — calls `issues.create` with subject as title, formatted description, `priority`/`labelIds`/`projectId` from the rule context, and `originKind: "inbound_email"` + `originFingerprint: rawSha256` so downstream dedupe at the issue level works. Then attaches each `inbound_email_attachments` row to the issue via `issueAttachments`.
7. Flip the message to `status: "processed"`, write `createdIssueId`, log `inbound_email.issue_created`.
8. On exception → `status: "failed"`, `error: <msg>`, rethrow so the job-queue retry policy applies.

## Project resolution

`targetProjectId = rule?.targetProjectId ?? mailbox.targetProjectId ?? null`

- Rule (`selectRule(message)`) is matched against the mailbox's `inboundEmailRules` via `matchesPattern` on sender/subject/etc.
- Mailbox default is the fallback.
- Nothing is inferred from the email body/subject; project is purely configuration.

## Sender authorization

In `resolveSenderAuthorization`:

1. Normalize sender email + domain. If missing → `unknown_sender_domain`.
2. Find `clientEmailDomains` row matching `(companyId, domain)` joined to an `active` client. No match → `unknown_sender_domain`.
3. Find `clientEmployees` row matching `(companyId, clientId, email)`. No match → `employee_not_registered` (triggers reply).
4. If `targetProjectId` is null → allowed.
5. Find `clientProjects` row for `(companyId, clientId, targetProjectId)`. No match → `project_not_authorized` (triggers reply).
6. If `employee.projectScope === "selected_projects"`, require a `clientEmployeeProjectLinks` row for `(employee, clientProject)`. Missing → `project_not_authorized`.

## Message status state machine

```
persisted → processing → processed   (issue created)
                       ↘ duplicate    (caught by findDuplicate)
                       ↘ skipped      (auth failure; terminal)
                       ↘ failed       (transient; retried via job)
```

## Why this design

- **Two stages, two jobs**: IMAP fetching is bursty and slow; issue creation is fast and DB-bound. Splitting them lets retries be cheap and lets the raw email survive even if issue creation breaks.
- **Dedupe at three levels**: bucketed poll dedupe key (no thundering herd), `findDuplicate` for re-imports, and issue-level `originFingerprint`.
- **Generic `background_jobs` queue** — the same infrastructure handles claim/retry/stale-requeue; this module just registers `email.*` kinds.
