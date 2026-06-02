# Clawpatch Fix Loop

This guide documents the workflow used on this branch to run Clawpatch, filter the results, fix selected findings, revalidate them, and commit the work.

## Scope

For this loop, focus on the main core of Paperclip:

- `server/`
- `ui/`
- `cli/`
- `packages/shared/`
- `packages/db/`
- Codex-specific adapter behavior when it affects the core Codex path
- Claude Code / `claude_local` adapter behavior when it affects the core Claude path

Ignore for now:

- plugin packages and plugin examples
- harness-only or test-harness issues unless they block core verification
- adapter/model findings outside Codex or Claude Code, such as Gemini, Grok, Pi, Cursor, OpenCode, Droid, ACPX, Hermes, and similar adapter-specific reports
- Hermes external-only package/dependency findings on this fork unless the current task is specifically about externalizing Hermes

The local Clawpatch config uses path-level excludes for plugin packages, non-Codex/non-Claude adapters, e2e/release-smoke harnesses, evals, and smoke fixtures. Keep `packages/adapters/codex-local/**` and `packages/adapters/claude-local/**` out of that exclude list.

## Review

Run a fresh Clawpatch review from the current branch:

```sh
clawpatch review --no-input --limit 10
```

Clawpatch writes a report under:

```text
.clawpatch/reports/<run-id>.md
```

The report is cumulative and can contain older findings. Use the feature IDs printed by the current review run to identify the findings produced by that run, then filter them by the scope above.

## Summarize

After the report finishes, summarize only the in-scope findings.

Keep the summary small and topic-oriented. Include enough detail for a maintainer to choose what to fix, for example:

- affected area
- short bug description
- finding ID when useful
- why it matters

Do not include ignored plugin, harness, non-Codex adapter, or Hermes externalization noise unless explicitly requested.

## Fix

When asked to fix, make narrow changes that address the accepted in-scope findings.

Use the existing codebase patterns. Avoid broad refactors. Preserve unrelated working-tree changes.

For each finding, prefer:

- a direct source fix
- a focused regression test
- the smallest relevant typecheck or test command

If a finding can be fixed with a narrower UI guard instead of a cross-layer API contract change, use the narrow fix when it satisfies the reported reproduction. Use broader contract changes only when the bug cannot be fixed locally.

## Verify

Run focused tests first, matching the changed area:

```sh
pnpm exec vitest run <test-files>
```

Then run the narrow package typecheck:

```sh
pnpm typecheck:ui
pnpm typecheck:server
pnpm typecheck:shared
pnpm typecheck:db
```

Use broader checks only when the change crosses package boundaries or targeted checks are insufficient.

## Revalidate

Revalidate each fixed finding by ID:

```sh
clawpatch revalidate --finding <finding-id>
```

Multiple revalidations can run in parallel. Treat a finding as done only when Clawpatch reports:

```text
outcome=fixed
```

If Clawpatch reports `open`, inspect the reasoning. Sometimes it points at stale generated artifacts or a remaining variant of the same bug.

## Commit

Commit only after the fix is verified and revalidated.

Before committing, inspect the working tree:

```sh
git status --short
git diff --stat
```

Stage only the files related to the current fix batch. Do not stage unrelated dirty files.

Commit with a concise message that describes the batch:

```sh
git add <fixed-files>
git commit -m "<short fix summary>"
```

After committing, confirm status:

```sh
git status --short
git log -1 --oneline
```

## Loop

Repeat the cycle:

1. Run `clawpatch review --no-input --limit 10`.
2. Filter out ignored topics.
3. Summarize in-scope findings.
4. Fix the selected findings.
5. Run focused tests and typechecks.
6. Run `clawpatch revalidate --finding ...` for every fixed finding.
7. Commit the verified fix batch.

Keep each commit scoped to one coherent batch of findings so future review and rollback stay simple.
