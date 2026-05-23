# Calendar Paperclip

## 1. Purpose

Calendar Paperclip is a company-scoped obligations and renewals module for Paperclip.

It is not primarily a visual calendar. It is a structured operational registry for everything a company needs to remember, renew, review, pay, prove, or escalate by date.

Examples:

- domains and DNS renewals;
- VPS, hosting, backup, and infrastructure renewals;
- software subscriptions and API billing reviews;
- API tokens, OAuth applications, and certificates;
- legal, fiscal, accounting, insurance, and registration obligations;
- contracts, support periods, and project milestones;
- client payment dates and vendor payment dates;
- receipts, invoices, certificates, contracts, and proof documents;
- accounts bought with one email but billed or recovered with another.

The module should answer operational questions like:

```text
What renews this month?
Which high-risk items are overdue?
Which subscriptions are paid by which method?
Which account uses which login, billing, recovery, or technical email?
Which API tokens or certificates are near expiration?
Which obligations are missing required metadata?
Which reminders already produced tickets or emails?
Which receipts or invoices still need to be attached?
```

## 2. Core Principle

The module should be rule-driven, not agent-driven.

Agents may help create, classify, update, and enrich calendar records from messy inputs such as emails, invoices, contracts, screenshots, or PDFs. Agents should not be responsible for remembering deadlines or deciding when reminders run.

Correct responsibility split:

| Responsibility | Owner |
|---|---|
| Store calendar items | Paperclip database |
| Enforce company boundaries | Routes and services |
| Define recurrence and reminder rules | Application rules |
| Execute scans/reminders | Scheduled job, routine, or background worker |
| Create reminder tickets | Deterministic service code |
| Send reminder emails | Existing Paperclip email notification/outbox path |
| Parse emails/documents into proposals | Agents, with policy gates |
| Approve risky changes | Board/operator approval flow |
| Audit mutations | Existing `activity_log` plus item history where needed |

The philosophy:

```text
Agents help organize information.
Rules and scheduled jobs run the calendar.
Paperclip coordinates the work.
The database stores the truth.
```

## 3. Fit With Current Paperclip

This should integrate with existing Paperclip primitives instead of creating a parallel calendar platform.

Relevant existing surfaces:

| Existing Paperclip surface | How Calendar Paperclip should use it |
|---|---|
| `companies` | Every calendar entity is company-scoped |
| `issues` | Reminder, overdue, metadata, and review work becomes Paperclip issues |
| `issues.origin_kind`, `origin_id`, `origin_fingerprint` | Idempotent linking and duplicate prevention for generated tickets |
| `routines` and `routine_triggers` | Optional scheduling host for daily/weekly scans |
| `background_jobs` | Durable async work queue for calendar scan/reminder tasks |
| `email_notifications` | Outbound reminder email outbox; avoid a separate notification table unless the shared outbox proves insufficient |
| `inbound_email_messages` and `inbound_email_attachments` | Source evidence for email-assisted creation/update |
| `documents`, `assets`, and issue document/attachment links | Store or link receipts, invoices, contracts, and proof documents |
| `activity_log` | Audit mutating actions |
| `clients`, `client_projects`, `projects` | Optional relation targets for obligations tied to client/project work |
| `approvals` / issue approval flows | Gate high-risk mutations |

The first implementation should be a normal Paperclip feature:

```text
packages/db      -> Drizzle schema and migration
packages/shared  -> types, constants, validators, API contracts
server           -> services, routes, workers/schedulers, activity logs
ui               -> company-scoped pages and API client usage
```

## 4. Implementation Scope

The first deployable version should be useful without provider-specific integrations.

Build now:

- `calendar_items` table with the operational fields needed for renewals, payments, access recovery, ownership, source evidence, recurrence, and risk management;
- activity history through existing `activity_log` entries instead of a duplicate history subsystem;
- shared types, constants, validators, and API paths;
- server CRUD and scan routes with company access checks;
- manual UI for list, detail, create, update, complete, pause, cancel, and archive;
- dashboard sections for overdue, due soon, critical items, cost summaries, and missing metadata;
- daily reminder scanner;
- weekly missing metadata scanner;
- deterministic issue creation/update for reminders and reports;
- email-assisted calendar proposals with deterministic dedupe;
- reminder emails through the existing email notification/outbox path;
- activity log entries for mutations and deterministic scans.

Do not build in the generic Paperclip calendar unless a later provider integration explicitly needs it:

- automatic payments;
- direct fiscal submissions;
- direct domain renewals;
- provider-specific APIs;
- Google Calendar sync;
- full document vault workflow;
- AI extraction from arbitrary documents as the main path;
- custom notification/audit/ticket subsystems that duplicate existing Paperclip primitives.

## 5. Data Model

The table should stay generic enough to cover subscriptions, domains, contracts, invoices, certificates, tokens, and operational obligations without becoming provider-specific.

Recommended table:

```ts
export const calendarItems = pgTable(
  "calendar_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    status: text("status").notNull().default("active"),
    riskLevel: text("risk_level").notNull().default("medium"),
    priority: text("priority").notNull().default("medium"),

    providerName: text("provider_name"),
    relatedClientId: uuid("related_client_id").references(() => clients.id, { onDelete: "set null" }),
    relatedProjectId: uuid("related_project_id").references(() => projects.id, { onDelete: "set null" }),

    dueDate: date("due_date"),
    dueTime: text("due_time"),
    timezone: text("timezone").notNull().default("UTC"),
    recurrenceType: text("recurrence_type").notNull().default("none"),
    recurrenceRule: text("recurrence_rule"),
    nextDueDate: date("next_due_date"),

    amountCents: integer("amount_cents"),
    currency: text("currency").notNull().default("USD"),
    autoRenew: boolean("auto_renew").notNull().default(false),
    manualActionRequired: boolean("manual_action_required").notNull().default(true),
    paymentMethodLabel: text("payment_method_label"),
    paymentOwner: text("payment_owner"),
    costCenter: text("cost_center"),

    purchaseEmail: text("purchase_email"),
    accountLoginEmail: text("account_login_email"),
    billingEmail: text("billing_email"),
    recoveryEmail: text("recovery_email"),
    technicalContactEmail: text("technical_contact_email"),

    serviceUrl: text("service_url"),
    loginUrl: text("login_url"),
    billingUrl: text("billing_url"),
    documentationUrl: text("documentation_url"),

    sourceKind: text("source_kind").notNull().default("manual"),
    sourceEmailMessageId: uuid("source_email_message_id").references(() => inboundEmailMessages.id, { onDelete: "set null" }),
    confidenceScore: integer("confidence_score"),

    notes: text("notes"),
    internalNotes: text("internal_notes"),

    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    updatedByAgentId: uuid("updated_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id"),

    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastReminderScannedAt: timestamp("last_reminder_scanned_at", { withTimezone: true }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("calendar_items_company_status_idx").on(table.companyId, table.status),
    companyDueIdx: index("calendar_items_company_due_idx").on(table.companyId, table.nextDueDate),
    companyCategoryIdx: index("calendar_items_company_category_idx").on(table.companyId, table.category),
    companyRiskIdx: index("calendar_items_company_risk_idx").on(table.companyId, table.riskLevel),
  }),
);
```

Notes:

- Use integer cents for money instead of `NUMERIC`, unless the existing codebase already chooses another money representation for similar product data.
- Keep card numbers out of the schema. If a payment method needs sensitive metadata, link to secrets or store only a safe label controlled by the operator.
- Keep provider-specific fields out of the first table. Domain, certificate, subscription, token, and fiscal-specific details can move into JSON metadata or later typed extension tables.
- Prefer `nextDueDate` as the operational due field for reminder scans. Preserve `dueDate` as the current cycle date when that distinction matters.

## 6. Categories

Initial categories:

| Category | Examples |
|---|---|
| `fiscal` | tax filing, accountant package, annual statements |
| `domain` | company domains, client domains, DNS renewals |
| `hosting` | VPS, hosting, backup services |
| `software_subscription` | SaaS, cloud tools, API usage plans |
| `api_token` | OAuth tokens, API credentials, app review deadlines |
| `certificate` | digital certificates, SSL certificates, API certificates |
| `contract` | client/vendor contract renewal, support period |
| `payment_receivable` | expected client payment |
| `payment_payable` | invoice or vendor payment due |
| `legal` | registrations, filings, official documents |
| `project` | milestones, warranty/support end dates |
| `account` | developer, app store, cloud, or vendor account review |
| `insurance` | insurance renewal or review |
| `other` | fallback |

These should live in `packages/shared` as constants and validators, not as UI-only strings.

## 7. Status Model

Suggested statuses:

| Status | Meaning |
|---|---|
| `active` | Monitored and eligible for reminders |
| `pending_review` | Created by agent/import and requires approval |
| `done` | Completed for the current cycle |
| `overdue` | Past due and not completed |
| `paused` | Temporarily ignored |
| `cancelled` | No longer relevant |
| `archived` | Historical only |

Recurring items need explicit completion behavior:

```text
mark current cycle done
record activity/history
calculate next due date
set status back to active if recurrence continues
update next_due_date
```

## 8. Risk Levels

Every active item should have a risk level.

| Risk | Meaning |
|---|---|
| `low` | Minor inconvenience if missed |
| `medium` | Operational or financial friction |
| `high` | Service interruption, client impact, legal/fiscal risk |
| `critical` | Can stop production, lose important access, or create serious penalties |

Risk controls:

- reminder ladder;
- ticket priority;
- overdue escalation;
- approval requirements;
- dashboard grouping.

## 9. Recurrence

Use simple recurrence first:

```text
none
monthly
quarterly
semiannual
yearly
custom_rrule
manual
```

Examples:

```text
Domain renewal: yearly
Tax/accounting package: monthly
Certificate expiration: yearly or multi-year
API token review: monthly or manual
Vendor invoice: monthly
Contract review: yearly
```

Do not make recurrence an agent responsibility. The server should calculate `nextDueDate` deterministically.

## 10. Reminder Defaults

Default reminder ladder:

| Category | Risk | Reminders |
|---|---|---|
| `domain` | `critical` | 90, 60, 30, 15, 7, 1 days |
| `hosting` | `critical` | 30, 15, 7, 3, 1 days |
| `fiscal` | `high` | 15, 7, 3, 1 days |
| `certificate` | `high` | 60, 30, 15, 7, 1 days |
| `api_token` | `medium` / `high` | 30, 14, 7, 3, 1 days |
| `software_subscription` | `low` / `medium` | 7, 3, 1 days |
| `contract` | `medium` / `high` | 60, 30, 15, 7 days |
| `payment_receivable` | `medium` | 7, 3, 1 days |
| `payment_payable` | `medium` | 7, 3, 1 days |

These can be code constants in `packages/shared` or server service code. A `calendar_reminder_rules` table can be added later only if operators need runtime editing.

## 11. Idempotency And Dedupe

Calendar-generated work must be deterministic and idempotent.

Reminder email identity:

```text
company_id
calendar_item_id
next_due_date
days_before
channel
```

Reminder issue identity:

```text
origin_kind = "calendar_reminder"
origin_id = calendar_item_id
origin_fingerprint = `${next_due_date}:${days_before}:${channel_or_ticket_kind}`
```

Missing metadata report identity:

```text
origin_kind = "calendar_missing_metadata"
origin_id = company_id
origin_fingerprint = ISO week or report date
```

Email-assisted proposal identity:

```text
origin_kind = "calendar_email_proposal"
origin_id = inbound_email_messages.id
origin_fingerprint = extracted provider/domain/account key
```

The service should create or update existing open issues rather than creating duplicates.

## 12. Reminder Scanner

The reminder scanner should run daily through either:

- a built-in server/background job path; or
- a system-managed routine/trigger if that fits the deployment model.

Recommended schedule:

```text
Daily at 08:00 in the company/operator timezone
```

Responsibilities:

```text
1. Load active calendar items for the company.
2. Skip paused/cancelled/archived items.
3. Flag items without next_due_date for missing metadata.
4. Compute days until next_due_date.
5. Match reminder defaults.
6. Check existing email notification / issue identity.
7. Queue email notification when configured.
8. Create or update Paperclip issue when configured.
9. Record activity log entries.
10. Mark overdue when next_due_date has passed.
11. Escalate high-risk overdue items.
```

Do not create a separate `calendar_notifications` table unless the existing `email_notifications` and `issues` identity fields are proven insufficient.

## 13. Missing Metadata Scanner

The missing metadata scanner should run weekly and produce one report issue per company/week.

Recommended checks:

```text
Active item without next_due_date
High-risk item without provider
Subscription without amount or billing email
Item without purchase/login/billing email
Domain item without registrar/service URL in metadata
Certificate item without expiration date
API token item without owner/project/contact email
Auto-renew item without payment method label
Paid item without cost center
Item created by agent with low confidence and still active
```

Output should be grouped by severity inside one Paperclip issue:

```text
High priority:
- Main production domain has no renewal date.
- Digital certificate has no owner/contact email.

Medium priority:
- API billing review has no cost center.
- SaaS subscription has no billing URL.
```

## 14. Email Integration

Paperclip already stores inbound email messages and attachments. Calendar Paperclip should reuse that system.

Inbound use cases:

```text
Forward a renewal email.
Forward a billing email.
Forward a domain expiration email.
Forward a certificate notice.
Forward an invoice or receipt.
```

Agent-assisted flow:

```text
Inbound email is stored
classifier marks it as calendar-related
agent extracts structured proposal
service searches for a matching calendar item
service creates pending_review item or update proposal
operator approves or rejects high-impact changes
activity log records outcome
```

Matching keys:

```text
provider_name + account_login_email
provider_name + billing_email
domain name
subscription account/customer id
source email message/thread id
amount + provider + due date
```

Agents may propose:

```json
{
  "title": "Hosting renewal",
  "category": "hosting",
  "providerName": "Example Hosting",
  "nextDueDate": "2026-07-15",
  "amountCents": 7990,
  "currency": "USD",
  "riskLevel": "critical",
  "purchaseEmail": "ops@example.com",
  "accountLoginEmail": "admin@example.com",
  "billingEmail": "billing@example.com",
  "autoRenew": true,
  "paymentMethodLabel": "Company credit card",
  "notes": "Detected from renewal email."
}
```

Agents should not directly:

- mark high-risk items complete;
- change due dates on fiscal/legal/domain/certificate items;
- cancel subscriptions;
- change account login email;
- change DNS/domain/certificate data;
- make payments;
- submit obligations;
- renew or cancel services.

## 15. Approval Boundaries

Allowed automatic actions:

- send reminders;
- create or update reminder issues;
- mark low-risk items overdue;
- create pending-review proposals from email/document extraction;
- generate missing metadata reports;
- attach/link source evidence;
- log activity.

Actions requiring approval:

- marking high-risk or critical items as completed;
- changing due date for fiscal, legal, domain, certificate, or critical hosting items;
- cancelling an active subscription/obligation;
- changing payment method label or owner;
- changing account login/recovery/billing email;
- changing domain, DNS, certificate, or production service metadata;
- accepting low-confidence agent proposals.

Forbidden in early versions:

- automatic payments;
- automatic tax/fiscal submissions;
- automatic domain renewals;
- automatic subscription cancellations;
- automatic deletion of account records;
- automatic mutation of production provider accounts.

## 16. UI

The first UI should prioritize operations over decorative calendar views.

Required screens:

1. Dashboard
2. Items table
3. Item detail
4. Create/edit item form
5. Missing metadata report

Dashboard sections:

```text
Overdue
Due today
Due in 7 days
Due in 30 days
Critical items
Pending review
Missing metadata
Recently completed
```

Table columns:

```text
Due date
Title
Category
Provider
Risk
Amount
Auto-renew
Purchase email
Login email
Billing email
Status
```

Filters:

```text
Category
Risk
Provider
Status
Due date range
Auto-renew
Payment method
Purchase email
Billing email
Related client/project
```

Detail sections:

```text
Basic info
Dates and recurrence
Risk and status
Provider/account
Emails
Financial
Related client/project
Documents/source evidence
History/activity
```

Calendar view can come later. Table and dashboard views are more important for operations.

## 17. API Shape

Suggested company-scoped API:

```text
GET    /api/companies/:companyId/calendar/items
POST   /api/companies/:companyId/calendar/items
GET    /api/companies/:companyId/calendar/items/:itemId
PATCH  /api/companies/:companyId/calendar/items/:itemId
POST   /api/companies/:companyId/calendar/items/:itemId/complete
POST   /api/companies/:companyId/calendar/items/:itemId/pause
POST   /api/companies/:companyId/calendar/items/:itemId/archive
GET    /api/companies/:companyId/calendar/dashboard
GET    /api/companies/:companyId/calendar/missing-metadata
POST   /api/companies/:companyId/calendar/run-reminder-scan
POST   /api/companies/:companyId/calendar/run-metadata-scan
```

Route/service expectations:

- enforce company access;
- use shared validators;
- return consistent Paperclip errors;
- log activity for mutations;
- use approval gates for governed changes;
- do not let agent credentials access another company;
- avoid UI-only business logic.

## 18. Reminder Email Template

Subject:

```text
[Calendar Paperclip] Upcoming deadline: {{ title }} - due {{ next_due_date }}
```

Body:

```text
Item: {{ title }}
Category: {{ category }}
Risk: {{ risk_level }}
Due date: {{ next_due_date }}
Provider: {{ provider_name }}
Amount: {{ amount }} {{ currency }}

Account / email information:
- Purchase email: {{ purchase_email }}
- Login email: {{ account_login_email }}
- Billing email: {{ billing_email }}

Useful links:
- Login: {{ login_url }}
- Billing: {{ billing_url }}
- Documentation: {{ documentation_url }}

Notes:
{{ notes }}

Action required:
{{ suggested_action }}
```

Overdue subject:

```text
[Calendar Paperclip] OVERDUE: {{ title }}
```

## 19. Reminder Issue Template

Example issue title:

```text
Renew hosting service
```

Example description:

```text
This calendar item is due in 15 days.

Provider: Example Hosting
Risk: critical
Amount: USD 79.90
Purchase email: ops@example.com
Billing URL: https://example.com/billing

Checklist:
- Confirm auto-renew is active if expected.
- Confirm payment method is valid.
- Complete the renewal or payment.
- Attach receipt/proof.
- Mark the calendar item complete.
- Confirm next due date was advanced.
```

The generated issue should carry:

```text
origin_kind = "calendar_reminder"
origin_id = calendar_item_id
origin_fingerprint = due date + reminder step
```

## 20. Example Records

### Domain

```json
{
  "title": "Renew company domain",
  "category": "domain",
  "riskLevel": "critical",
  "providerName": "Domain Registrar",
  "nextDueDate": "2027-04-10",
  "autoRenew": false,
  "purchaseEmail": "ops@example.com",
  "accountLoginEmail": "admin@example.com",
  "billingEmail": "billing@example.com",
  "loginUrl": "https://registrar.example.com",
  "notes": "Main company domain. Critical."
}
```

### Hosting

```json
{
  "title": "Production VPS renewal",
  "category": "hosting",
  "riskLevel": "critical",
  "providerName": "Example Hosting",
  "nextDueDate": "2026-07-15",
  "amountCents": 7990,
  "currency": "USD",
  "autoRenew": true,
  "paymentMethodLabel": "Company credit card",
  "purchaseEmail": "ops@example.com",
  "accountLoginEmail": "admin@example.com",
  "billingEmail": "billing@example.com",
  "loginUrl": "https://hosting.example.com",
  "billingUrl": "https://hosting.example.com/billing",
  "notes": "Hosts production services."
}
```

### Software Subscription

```json
{
  "title": "API billing review",
  "category": "software_subscription",
  "riskLevel": "high",
  "providerName": "API Provider",
  "nextDueDate": "2026-06-01",
  "recurrenceType": "monthly",
  "currency": "USD",
  "autoRenew": true,
  "paymentMethodLabel": "Company card",
  "purchaseEmail": "admin@example.com",
  "accountLoginEmail": "admin@example.com",
  "billingEmail": "billing@example.com",
  "costCenter": "API infrastructure",
  "notes": "Review usage and cost monthly."
}
```

### Fiscal Obligation

```json
{
  "title": "Prepare monthly accountant package",
  "category": "fiscal",
  "riskLevel": "high",
  "nextDueDate": "2026-06-15",
  "recurrenceType": "monthly",
  "manualActionRequired": true,
  "technicalContactEmail": "ops@example.com",
  "billingEmail": "billing@example.com",
  "notes": "Prepare revenue, invoices, receipts, bank statement, and expense summary."
}
```

## 21. Implementation Phases

### Phase 1: Core Feature

Goal: useful immediately as a deployable Paperclip feature, no provider-specific integrations.

Build:

```text
calendar_items Drizzle schema
shared types/constants/validators
CRUD API and service
manual UI
dashboard/list/detail views
daily reminder scanner
weekly missing metadata scanner
issue generation with idempotency
email notifications through existing outbox
activity logging
focused tests
```

### Phase 2: Email-Assisted Creation

Build:

```text
calendar-related inbound email classification
agent extraction to structured proposal
matching/deduplication logic
pending_review workflow
approval gates for high-risk changes
source email/attachment linking
```

### Phase 3: Documents And Costs

Build:

```text
document/proof completeness checks
receipt and invoice linking
monthly/annual cost summary
cost by provider/project/payment method
subscription cost history if needed
```

### Phase 4: External Calendar Sync

External calendars should be display/notification surfaces, not the source of truth.

Flow:

```text
calendar_items
-> sync worker
-> external calendar provider
-> store external event id
```

### Phase 5: Provider-Specific Checks

Only after the generic system works.

Possible integrations:

```text
domain registrar checks
SSL certificate expiration checks
cloud/VPS invoice checks
API token expiration checks
developer account review checks
billing usage checks
```

## 22. Verification Expectations

Implementation should include focused tests for:

- company boundary enforcement;
- shared validators;
- create/update/list/detail routes;
- completion and recurrence advancement;
- reminder scan idempotency;
- generated issue dedupe;
- email notification enqueue behavior;
- missing metadata report grouping;
- approval-required mutation boundaries;
- inbound email proposal matching once Phase 2 starts.

Use targeted package checks first, then broader checks when preparing for handoff.

## 23. Final Recommendation

Calendar Paperclip should start as a generic, company-scoped operational obligations module.

The first implementation should be conservative:

```text
Manual entries
Small schema
Server-side rules
Scheduled scans
Existing email outbox
Existing issue system
Existing activity log
Agents only for structured proposals
Approval gates for risky changes
```

This gives Paperclip a reliable back-office calendar without overusing agents for responsibilities that belong to deterministic rules and auditable workflows.
