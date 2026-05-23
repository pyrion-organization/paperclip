# Inbound Email Autonomous Support Readiness Audit

Date: 2026-05-23

Scope: deployment-readiness audit for `INBOUND_EMAIL_AUTONOMOUS_SUPPORT_PLAN.md`.

## Result

The implemented safe-foundation scope is ready for deployment review.

The current branch implements phases 1-7 as conservative, auditable foundations:
deterministic classification, projectless support intake controls, opt-in support
replies, policy-gated code-bug agent assignment, approval-gated deploy workflow,
evidence-only infrastructure topology and health monitoring, and external support
intake recovery.

Provider repair, DNS mutation, VPS failover, automatic infrastructure repair, and
automatic production deploys remain intentionally out of scope. The plan requires
separate credential, approval, rollback, and evidence controls before those
capabilities are added.

## Requirement Evidence

| Plan area | Evidence |
| --- | --- |
| Classification foundation | `server/src/services/inbound-email-classifier.ts`, `inbound_email_messages` classification fields, migration `0107_inbound_email_classification.sql`, classifier and service tests. |
| Policy gate and quarantine | `classifyAndPersistMessage`, `shouldQuarantineClassification`, skipped unsafe/spam handling, Email Ops quarantine list, tests for unsafe prompt-injection and spam. |
| Projectless support intake | mailbox `allow_projectless_triage`, mailbox/rule `project_fallback_mode`, rule category/body matching, projectless retry tests, rule shadowing regression tests. |
| Support replies | mailbox `support_replies_enabled`, persisted support reply status/reason/timestamps/errors, Reply-To targeting, retry-safe sent behavior, SMTP failure tests. |
| Code-bug agent automation | mailbox `agent_automation_*` fields, confidence/safety/project/workspace/budget gates, sanitized assigned issue creation, optional wakeup logging, no deploy side effect. |
| Approved deploy workflow | deployment target model, `deploy_change` approvals, deploy events, maintenance messages, command evidence, opt-in command execution, tests for approval/status/command gates. |
| Infrastructure foundation | infra targets, health checks, provider descriptors, credential metadata rejection, scheduled HTTP runner, grouped incidents, escalation metadata, external monitor token ingestion. |
| Infra repair boundary | `infra_repair` proposals require approval and evidence; provider mutation/failover execution is not present in routes/services. |
| External resilience | external intake records, board import/list/batch routes, mailbox tokens, public intake route, rate limiting before token/validation work, source conflict/idempotency behavior. |
| Operator UI | Email Settings external intake token controls, Email Ops external recovery/quarantine/review panels, Project Deployment Settings deploy/infra/monitor controls. |
| Operator docs | `EMAIL_POLLING.md` documents worker behavior, classification, support routing/replies, agent automation, deploy workflow, infra evidence, external recovery, and downtime procedure. |

## Verification

Current branch state before this audit document:

- `git status --short`: clean
- `pnpm -r typecheck`: passed in this branch after the approved deploy command work
- `pnpm test:run`: passed in this branch after the external intake and deploy-readiness work
- `pnpm build`: passed on 2026-05-23

`pnpm build` completed all workspace builds, including db migration numbering,
server TypeScript, UI TypeScript, Vite production build, plugin packages, and CLI
build. Vite reported existing chunk-size/dynamic-import warnings, but the build
exited successfully.

## Remaining Non-Goals

These are not gaps in the deployable safe foundation; they are future product
decisions from the plan:

- choosing which support categories should receive richer conversational replies,
- selecting projects and agents allowed for broader automation,
- setting production confidence thresholds per mailbox/project,
- defining real deployment target inventories and environments,
- designing credential storage and provider adapters for VPS repair/failover,
- deciding external backup storage for support mailbox preservation,
- grouping client-facing maintenance windows and incident updates.

Do not add automatic provider repair, DNS changes, failover, SSH/VPS mutation, or
automatic production deployment until those controls have their own design and
focused tests.
