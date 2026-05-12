# Task: Merge upstream changes into our forked project while preserving local modifications

You are working in a git repository that is a fork of an upstream project. The local `master` branch contains multiple custom modifications that **must be preserved**. Your job is to pull the latest changes from upstream and merge them in, following the rules below.

## Setup
1. Verify the `upstream` remote exists (`git remote -v`).
   - The confirmed upstream URL for this fork is `https://github.com/paperclipai/paperclip.git`.
   - If the `upstream` remote is missing, add it with:
     `git remote add upstream https://github.com/paperclipai/paperclip.git`
   - If an `upstream` remote exists but points somewhere else, stop and ask for confirmation before proceeding.
2. Fetch upstream: `git fetch upstream`.
3. Create a working branch from local `master`: `git checkout -b merge/upstream-<date>`.
4. Inspect what's coming in: `git log HEAD..upstream/master --oneline` and `git diff HEAD...upstream/master`.

## Merge rules (apply per-conflict, in this order)

1. **Local changes are authoritative.** If a conflict involves a local modification that has no upstream equivalent, **always keep the local version**. Do not drop local features, configs, branding, or behavior changes.

2. **Pure upstream additions** (new files, new functions, refactors in areas we haven't touched) → take upstream as-is.

3. **Overlapping/similar functionality** (upstream and local both implement the same or related feature):
   - Read both implementations carefully.
   - Decide which is better along these axes: correctness, test coverage, performance, alignment with the rest of our local code, and forward-compatibility with future upstream merges.
   - Produce a **merged hybrid** that keeps our local behavior/contract but adopts upstream improvements (bug fixes, perf, new edge cases) where they don't regress us.
   - In a comment on the PR (not in code), explain what you took from each side and why.

4. **Ambiguous conflicts** — if you cannot confidently determine the right merge for a hunk (unclear intent, non-obvious behavioral difference, touches code you don't understand, or risks silently breaking a local feature):
   - **Do not guess.** Resolve that hunk by **keeping the local version** (`git checkout --ours <file>` for that file, or manually keep the `HEAD` side of the conflict).
   - Add a `// TODO(upstream-merge):` comment at the site noting what upstream change was skipped and why a human needs to review it.
   - List every such site at the end of your report.

## Deliverables
- The merge branch with all conflicts resolved per the rules above.
- A summary report containing:
  - Files where upstream was taken wholesale.
  - Files where a hybrid was produced (with a brief rationale per file).
  - Files/hunks where local was kept and upstream was deferred (the TODO list).
  - Any tests that were added, modified, or are now failing.
- Run the test suite and report results before declaring done. Do **not** push or open a PR — leave the branch local for human review.

## Hard constraints
- Never delete a local-only file unless upstream's change makes it provably redundant *and* no local code references it.
- Never `git reset --hard`, force-push, or rewrite history.
- If upstream removes a file we've modified locally, **keep our local file** and flag it as a TODO.
- If you're unsure whether something is a local modification, check `git log` on that file — if a non-upstream author touched it, treat it as local.

## Reporting back to the issue (CRM task)

Before finishing, post a short, scannable summary as a comment on the issue/task you are running under. Use this structure with terse bullets — no fluff:

- **Upstream range merged:** commit range or version (e.g. `abc123..def456`, ~N commits).
- **New features pulled in from upstream:** bullet list, one line each.
- **Upstream bug fixes / perf / refactors adopted:** bullet list.
- **Hybrid merges (local + upstream combined):** file → one-line rationale.
- **Local features preserved (potential conflict, kept ours):** bullet list.
- **Skipped / deferred (ambiguous, kept local + TODO):** file:line → what upstream wanted to change and why a human needs to look.
- **Tests:** pass/fail counts; list any new failures.
- **Branch name + next step for the human reviewer.**

Keep it under ~30 lines. The goal is for a human skimming the CRM to immediately understand what landed, what didn't, and where their attention is needed.
