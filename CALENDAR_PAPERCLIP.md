# Calendar Paperclip

## Implemented: Operational Obligations Foundation

Calendar Paperclip is implemented as a company-scoped operational obligations module.

It is not primarily a visual calendar. It is a structured registry for renewals, payments, access recovery, provider accounts, certificates, contracts, client/vendor dates, proof documents, and other date-driven operational work.

The core principle is implemented:

> Agents can help organize information, but rules and scheduled services run the calendar.

Calendar items live in the Paperclip database, company access is enforced in routes/services, reminders and missing-details checks are deterministic, generated work uses Paperclip issues and email notifications, and mutations are logged through the existing activity system.

## Implemented Surfaces

### Data Model

Implemented:

- `calendar_items` table.
- `calendar_item_documents` table.
- Company-scoped indexes for status, due date, category, risk, source email, and provider.
- Relation fields for clients, projects, inbound email source messages, documents, assets, and source email attachments.
- Operational fields for:
  - title and description
  - category
  - status
  - risk and priority
  - provider
  - due date, due time, timezone, recurrence, and next due date
  - amount, currency, payment profile, auto-renew, payment owner, payment method, and cost center
  - purchase, login, billing, recovery, and technical contact emails
  - service, login, billing, and documentation URLs
  - source kind, confidence score, metadata, notes, and internal notes
  - actor attribution and scan/completion timestamps

The implementation also links calendar payable items into the payments system through payment entries and payment profiles.

### Shared Contracts

Implemented:

- Shared category, status, risk, recurrence, source-kind, and document-type constants.
- Shared calendar item types.
- Shared dashboard, detail, document, reminder status, cost summary, missing-details, and list response types.
- Shared validators for create, update, complete, filter, document attachment, and email proposal payloads.
- Calendar origin constants for generated issues:
  - `calendar_reminder`
  - `calendar_missing_details`
  - `calendar_email_proposal`

### API And Service

Implemented company-scoped API:

- `GET /api/companies/:companyId/calendar/items`
- `POST /api/companies/:companyId/calendar/items`
- `GET /api/companies/:companyId/calendar/items/:itemId`
- `PATCH /api/companies/:companyId/calendar/items/:itemId`
- `POST /api/companies/:companyId/calendar/items/:itemId/complete`
- `POST /api/companies/:companyId/calendar/items/:itemId/pause`
- `POST /api/companies/:companyId/calendar/items/:itemId/activate`
- `POST /api/companies/:companyId/calendar/items/:itemId/archive`
- `POST /api/companies/:companyId/calendar/items/:itemId/cancel`
- `GET /api/companies/:companyId/calendar/dashboard`
- `GET /api/companies/:companyId/calendar/missing-details`
- `POST /api/companies/:companyId/calendar/email-proposals`
- `POST /api/companies/:companyId/calendar/items/:itemId/documents`

Implemented service behavior:

- Company boundary checks.
- Reference validation for clients, projects, payment profiles, source emails, documents, assets, and email attachments.
- Create/list/detail/update/status/complete flows.
- Recurrence advancement on completion.
- High-risk completion approval confirmation.
- Governed update/cancel approval confirmation.
- Activity log entries for mutations and scans.
- Calendar document/source-evidence attachment.
- Search and filters for operational table use.
- Dashboard aggregation.
- Missing-details detection.
- Reminder scanner.
- Scheduled scan runner across companies.

The old plan mentioned manual scan routes such as `run-reminder-scan` and `run-metadata-scan`. Those are intentionally not exposed as public board routes in the current implementation; scanning exists through the service/scheduler path.

### UI

Implemented:

- Company-scoped Calendar navigation.
- Operational dashboard.
- Reminder status panel.
- Items table.
- Search and filtering.
- Create/edit item dialog.
- Detail tabs for overview, payment, contacts, links, notes, documents, and history.
- Pause, activate, archive, cancel, and complete actions.
- Approval confirmation prompts for governed changes.
- Missing-details surface.
- Cost summary.
- Recently completed and due/risk dashboard sections.
- Document attachment display.
- Activity/history display.

The implementation correctly prioritizes table/dashboard operations over a decorative month-grid calendar.

### Reminder And Missing-Details Scans

Implemented:

- Deterministic reminder defaults by category/risk.
- Reminder issue creation/update using origin identity.
- Overdue issue handling.
- Overdue status marking.
- Reminder email notification enqueueing through the existing `email_notifications` outbox.
- Reminder email dedupe by recipient, item, due date, and timing.
- Reminder scan activity summaries.
- Failed reminder email status reporting.
- Weekly missing-details report issue creation/update.
- Missing-details issue dedupe by company/week.
- Missing-details findings for operational gaps such as missing due date, provider, contact email, payment profile, billing URL, cost center, stale scan state, and low-confidence pending review.

### Email-Assisted Proposals

Implemented foundation:

- `email_agent` source kind.
- Calendar email proposal endpoint.
- Source inbound email linkage.
- Confidence score.
- Proposal matching key stored in metadata.
- Deterministic dedupe for repeated proposals from the same source/matching key.
- Pending-review calendar item creation.
- Review issue creation/update using `calendar_email_proposal` origin identity.

This is the proposal persistence and review workflow. It is not yet a full autonomous email/document extraction pipeline.

### Documents, Payments, And Cost Tracking

Implemented:

- Calendar document links to documents, assets, source emails, source email attachments, or URL evidence.
- Calendar item detail includes documents and activity history.
- Payable calendar items can sync linked payment entries.
- Completion can complete the current linked payment entry and advance recurring payment cycles.
- Calendar dashboard includes monthly recurring, annual renewal, and upcoming 30-day cost summaries.
- Payments UI supports calendar-linked payables.

### Tests

Implemented coverage exists for:

- Calendar routes and company boundary behavior.
- Route shape, including that manual scan routes are not exposed.
- Calendar service create/list/detail.
- Completion and recurrence advancement.
- Payable/payment profile linkage.
- Reminder scan idempotency and email dedupe.
- Missing-details reports.
- Email proposal dedupe.
- Calendar UI rendering, search, missing details, documents, and history.

## To Implement: Remaining Calendar Work

The generic operational obligations foundation is implemented. Remaining work should focus on deeper automation, provider integrations, richer extraction, and operator workflow polish without turning agents into the source of truth.

### 1. Real Email/Document Extraction Pipeline

The proposal endpoint exists, but Paperclip still needs the pipeline that classifies inbound emails/documents as calendar-related and extracts structured proposals.

Remaining work:

- Add calendar-related inbound email classification.
- Add agent or LLM extraction into the existing strict calendar proposal schema.
- Parse renewal notices, invoices, receipts, domain warnings, certificate notices, and subscription emails.
- Link extracted proposals to source email bodies and attachments.
- Generate safe pending-review items or update proposals.
- Require approval for low-confidence or high-impact proposed changes.
- Show extraction evidence and confidence in the Calendar UI.
- Add tests for matching/dedupe across real-world provider examples.

Agents should propose structured data only. They should not directly renew, cancel, pay, complete high-risk items, or change critical due dates.

### 2. Stronger Approval Workflow

The current implementation uses `approvalConfirmed` confirmation gates for governed changes. That is useful, but it is not the full Paperclip approval system.

Remaining work:

- Convert high-risk calendar changes into first-class `calendar_governed_change` approvals when appropriate.
- Link approvals to calendar items and generated issues.
- Capture old/new values in approval payloads.
- Require approval before applying sensitive changes instead of applying after a UI confirmation.
- Add revision/rejection flow for agent-created proposals.
- Record approval decision evidence in item history.

Governed changes should include:

- completing high-risk or critical items,
- changing fiscal/legal/domain/certificate due dates,
- cancelling active obligations,
- changing account login, billing, recovery, or technical contact emails,
- changing payment profile/owner,
- accepting low-confidence extraction proposals.

### 3. External Calendar Sync

External calendars should be display and reminder surfaces, not the source of truth.

Remaining work:

- Add sync metadata for provider/event IDs if not already sufficient in `metadata`.
- Add one-way export to Google Calendar, Outlook, or CalDAV.
- Keep Paperclip as authoritative source.
- Record external sync status and last sync error.
- Avoid syncing sensitive internal notes or recovery details.
- Add resync/backfill controls.
- Add tests for idempotent event creation/update.

Recommended flow:

```text
calendar_items
-> sync worker
-> external calendar provider
-> external event id stored as metadata/evidence
```

### 4. Provider-Specific Checks

The current system tracks obligations manually and through proposals. Provider-specific checks remain future work.

Possible integrations:

- Domain registrar renewal/expiration checks.
- SSL certificate expiration checks.
- VPS/cloud invoice and renewal checks.
- SaaS/API billing usage checks.
- OAuth application and token expiration checks.
- Developer account review deadline checks.
- Insurance/legal/fiscal reminder data from approved external systems.

Rules:

- Provider checks should read and report first.
- Provider credentials must use the secret system.
- Mutating provider actions such as renewal, cancellation, payment, DNS, or account changes are out of scope until approval and rollback controls exist.

### 5. Runtime Reminder Rule Configuration

Reminder defaults are implemented in code. Runtime-editable reminder rules are still future work.

Remaining work:

- Decide whether operators need company/category-specific reminder ladders.
- Add a `calendar_reminder_rules` table only if code defaults prove insufficient.
- Support per-item reminder overrides.
- Add UI for reminder policy preview.
- Keep generated issue/email identity deterministic.

### 6. Richer Document And Proof Workflow

Document links exist, but a full proof/vault workflow is not implemented.

Remaining work:

- Required proof policies by category.
- Receipt/invoice completeness checks beyond basic missing details.
- Document type-specific review.
- Proof attachment requirements before completing high-risk items.
- OCR/LLM extraction from uploaded receipts or PDFs.
- Audit view showing which proof closed a cycle.

### 7. Cost Reporting And History

Calendar dashboard has basic cost summaries and payment linkage. Deeper cost intelligence remains future work.

Remaining work:

- Subscription cost history.
- Monthly/annual cost by provider.
- Cost by project/client/cost center.
- Renewal cost drift detection.
- Missing receipt/invoice reports.
- Forecast views for upcoming renewal spend.

### 8. Operational Scheduler Controls

Scheduled scans exist, but richer operator controls can be added later.

Remaining work:

- Admin-visible last scheduled calendar scan status.
- Manual "run scan now" operation for board operators, if desired.
- Per-company scan timezone configuration.
- Scan failure alerts.
- Backfill scan controls for newly imported items.

Manual scan routes were part of the old plan but are not exposed in the current API. Add them only if operators need the control and they are protected by board access and activity logging.

### 9. Provider-Safe Actions

Early versions should continue to forbid:

- automatic payments,
- automatic tax/fiscal submissions,
- automatic domain renewals,
- automatic subscription cancellations,
- automatic deletion of account records,
- automatic mutation of production provider accounts.

If any of these become desirable later, they should be implemented as approval-gated provider actions with explicit evidence, rollback/undo notes, and strong audit logs.

## Recommended Next Step

The next concrete implementation should be the real email/document extraction pipeline for calendar proposals.

The storage, review, dedupe, and UI foundation already exists. Adding controlled extraction from inbound emails and attachments would make Calendar Paperclip more useful without giving agents authority over payments, renewals, provider accounts, or high-risk completion decisions.
