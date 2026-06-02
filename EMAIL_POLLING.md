# Inbound Email Polling

## Implemented

Paperclip has the core inbound email polling flow implemented.

The system runs a standalone email worker that schedules and claims `email.*` background jobs, polls enabled IMAP mailboxes, imports raw RFC 822 messages, deduplicates them, stores the raw email and attachments, and processes each message into a terminal outcome.

Imported messages are persisted in `inbound_email_messages` with source cleanup state, classification fields, support reply fields, and links to created issues. Attachments are stored separately and linked to created Paperclip issues. Mailboxes and rules are company-scoped and configurable from the board UI.

Message processing resolves the sender against client email domains and registered client employees, detects client-employee registration commands, resolves the target project from the message text, applies mailbox/rule routing policy, creates triage issues for authorized support mail, and records activity for important transitions.

The current deterministic support classifier is implemented for the main support-intake categories:

- `code_bug`
- `infra_incident`
- `how_to_question`
- `feature_request`
- `account_access`
- `unsafe_or_prompt_injection`
- `unclear`

Classified support messages can create issues, request clarification, quarantine unsafe messages, send Portuguese support acknowledgements when enabled, and optionally turn trusted high-confidence code bug reports into assigned agent tasks when mailbox automation policy allows it.

External intake and recovery are also implemented. Operators can import preserved raw `.eml` messages singly or in bounded batches, public backup systems can submit raw messages through per-mailbox external intake tokens, and the normal raw-message import/dedupe/classification/issue flow is reused.

Related deployment and infrastructure foundations are implemented separately: deployment targets, approval-gated deploy events, command evidence, maintenance messages, infrastructure targets, health checks, external monitor evidence, infrastructure incidents, and repair/failover proposal records.

## To Implement: Provider-Backed Spam Classification

The database, shared types, processing logic, and UI already know about `spam_or_irrelevant`, but Paperclip does not currently have a real spam detector that assigns that category during normal classification.

Today, `spam_or_irrelevant` is represented and handled:

- It is a valid inbound email classification category.
- Inbound messages can store it in `classification_category`.
- The Email Ops quarantine panel can list skipped spam messages.
- Support replies are suppressed for spam/unsafe messages.
- Processing treats the category as a quarantine/discard final action if something has already assigned it.

The missing piece is detection. The deterministic classifier currently matches support categories and unsafe/prompt-injection patterns, but it does not contain a spam-specific signal source or robust spam pattern set. Paperclip should not try to become a full email-security product. The best V1 is to consume provider spam/authentication verdicts where available and only add a small local fallback.

### Goals

1. Automatically classify provider-confirmed spam as `spam_or_irrelevant`.
2. Preserve spam evidence without rendering raw untrusted HTML.
3. Keep spam messages out of issue creation, support replies, and agent automation.
4. Make the decision explainable in Email Ops.
5. Keep the design provider-agnostic so IMAP polling, SES/webhook intake, Mailgun, and future providers can all feed the same classifier contract.

### Suggested Architecture

Add an inbound email "provider verdicts" layer before the deterministic support classifier finalizes a message.

The flow should be:

1. Parse raw headers and external intake metadata into normalized verdict fields.
2. Evaluate high-confidence spam/security verdicts first.
3. If spam is confirmed, persist:
   - `classification_category = "spam_or_irrelevant"`
   - `classification_confidence = 90+` for provider-confirmed spam
   - `classification_severity = "low"` or `"medium"` depending on the signal
   - `classification_recommended_action = "discard_or_quarantine"`
   - `classification_final_action = "discard_or_quarantine"`
   - `classification_summary` explaining the provider verdict
   - `classification_safety_flags` only for security-relevant signals such as malware/phishing/failed auth
   - `classification_rule_version` identifying the provider-verdict classifier version
4. Skip issue creation and support replies.
5. Mark the source message seen after terminal quarantine so it is not reprocessed.
6. Show the message in Email Ops quarantine with the provider evidence.

### Data Model

The current schema can store the category and summary, but richer spam evidence would be useful.

Recommended minimal addition:

- Add `classificationEvidence` JSON on `inbound_email_messages`.

Suggested shape:

```json
{
  "provider": "ses",
  "spamVerdict": "FAIL",
  "virusVerdict": "PASS",
  "spfVerdict": "PASS",
  "dkimVerdict": "PASS",
  "dmarcVerdict": "PASS",
  "source": "headers",
  "rawHeaders": {
    "X-SES-Spam-Verdict": "FAIL",
    "X-SES-Virus-Verdict": "PASS"
  }
}
```

If adding a new column is too much for V1, store a concise explanation in `classification_summary` and provider signal names in `classification_safety_flags`. That is less expressive but enough to make the quarantine decision auditable.

### Provider Signals To Support First

#### Amazon SES

SES is the best first integration if inbound mail or backup intake can pass SES metadata.

Signals to read:

- `X-SES-Spam-Verdict`
- `X-SES-Virus-Verdict`
- `X-SES-Receipt`
- SNS/Lambda receipt notification fields:
  - `spamVerdict.status`
  - `virusVerdict.status`
  - `spfVerdict.status`
  - `dkimVerdict.status`
  - `dmarcVerdict.status`

Mapping:

- `spamVerdict.status = FAIL` -> `spam_or_irrelevant`
- `virusVerdict.status = FAIL` -> `unsafe_or_prompt_injection` or a future `malware_or_unsafe_attachment` category; until then, quarantine with safety flag `virus_verdict_fail`
- `spamVerdict.status = GRAY` -> do not auto-quarantine; add evidence and let normal support classification continue
- DMARC/SPF/DKIM failures alone should not be treated as spam for support mail, but they should lower trust or add evidence for operator review

#### Mailgun Routes

If inbound messages are captured by Mailgun Routes, pass Mailgun spam metadata into external intake metadata or headers.

Mapping:

- Provider says spam above configured threshold -> `spam_or_irrelevant`
- Borderline score -> normal support classification plus low-confidence review evidence

#### Cloudflare Email Security

Cloudflare Email Security is a stronger enterprise option for phishing, malware, BEC, vendor fraud, and spam, but it is operationally heavier than SES/Mailgun verdicts.

Use it only if this project needs serious mailbox protection. Paperclip should consume Cloudflare verdicts as evidence, not duplicate its detection logic.

#### Generic IMAP

For plain IMAP mailboxes, inspect common headers added by upstream mail systems:

- `X-Spam-Flag`
- `X-Spam-Status`
- `X-Spam-Score`
- `X-Spam-Level`
- `X-SES-Spam-Verdict`
- `Authentication-Results`

Mapping:

- `X-Spam-Flag: YES` -> `spam_or_irrelevant`
- Very high spam score -> `spam_or_irrelevant`
- Borderline score -> normal classification plus evidence
- Failed SPF/DKIM/DMARC alone -> evidence only, not automatic spam

### Local Fallback Rules

Add only conservative local spam rules. They should catch obvious junk without suppressing legitimate customer support messages.

Good candidates:

- Empty or near-empty body with suspicious links only.
- Repeated casino, crypto giveaway, SEO backlink, loan, pharmacy, adult content, or fake invoice language.
- Many unrelated external links from an unknown or unregistered sender.
- Subject/body dominated by tracking URLs and no project/support language.
- Known disposable sender domains, if the project maintains a list.

Avoid broad rules that would catch real support mail:

- Do not classify as spam just because the sender is unknown.
- Do not classify as spam just because SPF/DKIM/DMARC failed.
- Do not classify as spam just because the message contains billing, invoice, password, login, or token words; those overlap with real support.
- Do not classify as spam from LLM output unless the model is operating as an advisory signal behind a threshold and provider evidence is absent.

### API And UI Changes

Email Ops should expose spam evidence clearly:

- Show provider verdicts in the quarantine row/detail.
- Add filter chips for `unsafe`, `spam`, and `provider verdict`.
- Show whether the message was quarantined by provider evidence, local rule, or manual/operator action.
- Add a retry/reclassify action only for board operators.

Email Settings should eventually expose mailbox-level policy:

- `Spam handling`: `quarantine`, `mark_seen_only`, or `allow_but_flag`.
- `Provider spam verdict threshold`: for providers that expose scores.
- `Treat virus/malware verdict as unsafe quarantine`: enabled by default.
- `Authentication failure policy`: evidence only by default.

### Tests

Add focused tests for:

- SES header `X-SES-Spam-Verdict: FAIL` classifies as `spam_or_irrelevant`.
- SES `GRAY` does not quarantine by itself.
- Virus/malware verdict quarantines with an unsafe safety flag.
- `X-Spam-Flag: YES` classifies as spam.
- Failed SPF/DKIM/DMARC alone does not classify as spam.
- Spam messages do not create issues.
- Spam messages do not send support replies.
- Spam messages appear in the quarantine list.
- External intake metadata can carry provider verdicts and produce the same result as headers.

### Recommended V1 Implementation Plan

1. Add a small `inbound-email-provider-verdicts.ts` parser that extracts normalized verdicts from parsed email headers and external intake metadata.
2. Add a `classifyProviderSpamVerdict()` function that returns a classification only for high-confidence provider spam/virus signals.
3. Call provider-verdict classification before the existing deterministic support classifier.
4. Persist the same classification fields already used by normal messages.
5. Add optional `classificationEvidence` JSON if the team wants durable structured evidence; otherwise start with summary and safety flags.
6. Update Email Ops to show provider verdict evidence for quarantined messages.
7. Add tests for provider spam signals and non-spam authentication failures.

This keeps Paperclip's support classifier simple and auditable while making spam handling real enough for production use.
