# 13 Constraints Floor Guard Context

skills/constraint-driven-development, its references/floor-guard, and skills/context-engineering.

---

# batch-B2 — constraint-driven-development, floor-guard, context-engineering

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent.

## skills/constraint-driven-development/SKILL.md  (311 lines; sections 102-140, 226-311 read in full)
verdict: 14 candidates. **This is the most important file in the corpus for lint-kit specifically:**
the floor at :104-108 is a five-rule list that lint-kit's own `--constraints guard` command was
written to implement, and `references/floor-guard.md` is a working specification for it. Every rule
here maps onto a surface lint-kit already ships.

### floor-no-new-suppression-comments
- source: skills/constraint-driven-development/SKILL.md:104 — "No new suppression comments: `@ts-ignore`, `eslint-disable`, `# noqa`, `# type: ignore`"
- classification: mechanical
- target: pre-push script (lint-kit's own `--constraints guard`)
- detection: a suppression comment *added* by the branch diff — `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `# noqa`, `# type: ignore`, `pylint: disable`, `nosec`, `// biome-ignore`. The four forms are named in the source; the branch-scoped comparison is what makes it fair. The floor-guard reference implements exactly this (its :10 names "a silenced checker (a new suppression comment)").
- fail: a diff adding `// eslint-disable-next-line no-explicit-any`.
- pass: the code fixed instead, or a suppression carrying a linked issue.
- false positives: a suppression moved rather than added, and one for a generated file; the diff-scoping handles the first, a path allowlist the second.
- effort: S

### floor-no-unimplemented-stubs
- source: skills/constraint-driven-development/SKILL.md:105 — "No unimplemented stubs: `throw new Error(\"Not implemented\")`, empty `catch {}`"
- classification: mechanical
- target: pre-push script
- detection: an added `throw new Error("Not implemented")`/`NotImplementedError`/`todo!()`/`unimplemented!()`, and an added empty `catch {}`/`except: pass`. Both forms are named verbatim; the empty-catch half overlaps `error-handling/no-swallowed-catch`, which lint-kit already ships — the delta is the branch scoping.
- fail: `throw new Error("Not implemented")` in a new function.
- pass: the implementation, or an explicit `# TODO(#412)` with an issue.
- false positives: an abstract method that legitimately throws; needs an exemption for a declared-abstract shape.
- effort: S

### floor-no-skipped-or-deleted-tests-without-a-reason
- source: skills/constraint-driven-development/SKILL.md:106 — "No skipped or deleted tests without a reason in the commit message"
- classification: mechanical
- target: pre-push script
- detection: three shapes — a newly added `.skip`/`xfail`/`@pytest.mark.skip`, a deleted test file, and an assertion removed from a test that stayed. The third is the subtle one the floor-guard reference names explicitly (its :10 — "a test made easier (`.skip`, a deleted test file, an assertion removed from a test that stayed)"). The escape is a reason in the commit message, so the rule checks both the diff and the message.
- fail: a diff deleting `test('rejects expired tokens')` with a message of `refactor: tidy tests`.
- pass: the same deletion with `test: drop the expired-token case, covered by the integration suite`.
- false positives: a test file renamed (a delete+add pair); needs the rename detection.
- effort: M

### floor-not-weakened-to-make-a-change-pass
- source: skills/constraint-driven-development/SKILL.md:108 — "This file does not get weakened to make a change pass" (red flag at :284 — "`CONSTRAINTS.md` changed in the same commit as the feature that was failing")
- classification: mechanical
- target: pre-push script
- detection: a diff that lowers a numeric threshold in `CONSTRAINTS.md` *and* changes source in the same commit or branch. The pairing is the finding, not the edit — the source's red flag states the exact condition. The floor-guard reference implements it as "a weakened threshold in `CONSTRAINTS.md`" (its :10).
- fail: one commit lowering `coverage` from 80 to 70 and adding a feature.
- pass: a threshold raised, or a lowered one in its own commit with a rationale.
- false positives: a threshold corrected because the tool's semantics changed; needs a rationale in the message.
- effort: S

### every-constraint-number-has-a-command
- source: skills/constraint-driven-development/SKILL.md:123-124 — "Every row names the command that produces the verdict. A dimension with a number and no command in this column is an aspiration, not a constraint." (red flag at :281 — "A dimension was written into CONSTRAINTS.md with a number but no tool behind it"; exit criterion at :296)
- classification: mechanical
- target: md-lint
- detection: every row in the "Enforced with numbers" table (:112-121) must have a non-empty `Checked by` cell containing an executable token. Eight example rows are given with their exact commands (`tsc --noEmit`, `biome check`, `gitleaks detect --redact`, `vitest run --coverage`, `semgrep scan --config p/default`, `osv-scanner scan source -r .`, `axe …`, `lighthouse …`). Extends `constraints-every-number-has-a-reason-and-a-command` in batch-GOV with the eight concrete commands.
- fail: `| Types | Zero type errors | | every edit |`
- pass: the eight rows at :114-121.
- false positives: a dimension measured but not yet enforced, which belongs in the separate "Measured, not yet enforced" table (:126-131); the rule must scope to the enforced table.
- effort: S

### exceptions-have-an-owner-and-a-bounded-expiry
- source: skills/constraint-driven-development/SKILL.md:135-137 — "| ID | Rule | Path | Reason | Owner | Expires | … | W1 | `no-explicit-any` | `src/legacy/**` | Rewrite tracked in ENG-441 | @addy | 2026-11-01 |" (red flag at :285 — "An exception has no owner, or an expiry more than a year out"; exit criterion at :300)
- classification: mechanical
- target: md-lint
- detection: every Exceptions row must carry all six columns, a parseable date in `Expires`, and a date no more than a year out. The table's own shape is the schema; the one-year ceiling is stated in the red flag.
- fail: `| W2 | no-explicit-any | src/x/** | | | 2030-01-01 |`
- pass: the row at :137.
- false positives: an exception deliberately permanent; the source has no such category, so the rule should error and let the owner argue.
- effort: S

### constraint-defaults-and-thresholds
- source: skills/constraint-driven-development/SKILL.md:238-248 — "| Constraint | Default | Why this number | … | Coverage of changed lines | ≥ 80% | … | Mutation score (if used) | ≥ 60% to start | … | LCP | ≤ 2500 ms | … | CLS | ≤ 0.1 | … | Exception lifetime | 90 days | … | Ratchet tolerance | 0.5% | …" (:250 — "State the number and the reason together.")
- classification: mechanical
- target: pre-push script
- detection: nine named defaults with their values and rationale. The checkable form is a config assertion: where a project declares a coverage/mutation/LCP/CLS/exception-lifetime/ratchet value, it should match the sane default unless a reason is recorded. Six numeric values, all stated.
- fail: `coverage.changedLines: 40` with no reason.
- pass: the defaults at :240-248.
- false positives: a project whose measured value differs from the default for a stated reason; the rule's escape is the recorded rationale (:250).
- effort: M

### ratchet-compares-against-the-recorded-value
- source: skills/constraint-driven-development/SKILL.md:230 — "The alternative asks for no decision: record where you are, then refuse to get worse. Put it in the \"Measured, not yet enforced\" table with today's number and a direction. Every check compares against the recorded value, not an aspiration." (the table at :128-131)
- classification: mechanical
- target: pre-push script
- detection: a metric in the "Measured, not yet enforced" table must have a recorded value and a direction (`must not fall`/`must not grow`), and the current measurement must not have moved the wrong way. The two directions are given verbatim; the comparison against the recorded value is the whole mechanism.
- fail: `Project coverage | 62.4% | must not fall` while the branch measures 61.1%.
- pass: the same row with the branch at or above 62.4%.
- false positives: a metric whose measurement method changed; needs a re-baseline marker.
- effort: M

### at-least-one-constraint-is-external
- source: skills/constraint-driven-development/SKILL.md:283 — "Every constraint is checked by the project's own test suite, with no external opinion" (exit criterion at :298 — "At least one constraint is external (not judged by this project's own tests)")
- classification: mechanical
- target: md-lint
- detection: the `Checked by` column must contain at least one tool outside the project's own test runner — the source's own table shows five (gitleaks, semgrep, osv-scanner, axe, lighthouse) alongside the project's tsc/biome/vitest. A count over the column.
- fail: a table whose every `Checked by` is `vitest`.
- pass: the mix at :114-121.
- false positives: a small project with no external tool available; the source's rationalization at :269 ("Tests you wrote prove you agree with yourself") argues against the exemption, so keep it an error with a documented escape.
- effort: S

### slow-checks-are-not-in-the-edit-loop
- source: skills/constraint-driven-development/SKILL.md:271 — "\"This will slow the agent down\" | Only if you put slow checks in the fast loop. That's a placement error, not an argument against constraints" (red flag at :287 — "Slow checks landed in the edit loop and someone has started passing `--no-verify`"; exit criterion at :297 — "the fast stage stays under a few seconds")
- classification: mechanical
- target: pre-commit hook
- detection: two findings — a pre-commit (edit-loop) hook invoking a check the source classifies as slow (semgrep, osv-scanner, axe, lighthouse, a full test suite), and a `--no-verify` appearing in a script or a commit instruction. The `Runs at` column at :114-121 is the intended placement, so the rule compares placement against it.
- fail: `.lefthook.yml` running `semgrep scan` on pre-commit.
- pass: semgrep on CI, types/lint/secrets on pre-commit, as the table prescribes.
- false positives: a fast semgrep ruleset; needs a duration measurement rather than a tool-name check.
- effort: M

### constraints-file-is-pointed-at-by-the-agent-config
- source: skills/constraint-driven-development/SKILL.md:140 — "Then add one line to `AGENTS.md` and `CLAUDE.md`: `Read CONSTRAINTS.md before writing code. Do not weaken it to make a change pass.`" (exit criterion at :301 — "`AGENTS.md` or `CLAUDE.md` points at the file")
- classification: mechanical
- target: md-lint
- detection: if `CONSTRAINTS.md` exists, `AGENTS.md` or `CLAUDE.md` must reference it. Same rule as `constraints-doc-is-linked-from-agent-config` in batch-GOV, cited here with the exact sentence the source prescribes.
- fail: the file present with no pointer.
- pass: the line at :140.
- false positives: a repo using a different agent-config filename; accept `GEMINI.md` and `.cursor/rules/`.
- effort: S

### no-agent-proposed-threshold-relaxation
- source: skills/constraint-driven-development/SKILL.md:286 — "The agent proposed relaxing a threshold instead of fixing the code"
- classification: mechanical
- target: pre-push script
- detection: a diff authored by an agent (per the commit trailer or the transcript) that lowers a threshold while the same branch has a failing check. Narrower than `floor-not-weakened` because the trigger is the agent's own proposal rather than any threshold edit.
- fail: a commit lowering `max-complexity` with the message "the check was too strict".
- pass: the complexity fixed.
- false positives: a genuinely mis-set threshold; needs a human-authored rationale.
- effort: M

### interview-is-at-most-four-questions
- source: skills/constraint-driven-development/SKILL.md:279 — "The interview ran past four questions, or produced a config the user can't explain"
- classification: mechanical
- target: transcript check
- detection: the constraint-setup interview (`.claude/commands/constraints.md:13` names "at most four questions") exceeding four questions in a transcript, or a produced `CONSTRAINTS.md` whose numbers the user never confirmed. The first half is countable; the second is not.
- fail: a seven-question intake.
- pass: the four named dimensions.
- false positives: a user who asked for more detail; needs an explicit user request to count as consent.
- effort: M

### constraints-trial-run-clean-on-the-current-branch
- source: skills/constraint-driven-development/SKILL.md:295 — "The floor is enforced and passes on the current codebase without changes" (exit criterion at :302 — "A trial run on the current branch produces no failures the user disagrees with")
- classification: mechanical
- target: pre-push script
- detection: install the constraints and run them against the current branch; any failure the user disagrees with means the constraint is wrong, not the code (the command states this at `.claude/commands/constraints.md:31`). The mechanical half is the clean run; the disagreement half is the human gate.
- fail: a floor that fails on the base commit.
- pass: a clean floor run.
- false positives: a repo with pre-existing violations in the floor's scope; the source's ratchet handles it by recording today's value.
- effort: M

## skills/constraint-driven-development/references/floor-guard.md  (182 lines; contract and adapting sections read in full)
verdict: 6 candidates. **This file is a working specification for a lint-kit feature**: it defines
the guard's input, its five detections, its exit codes, and its redaction rule. Everything below is
directly implementable, and lint-kit already ships the `--constraints guard` command that
`.claude/commands/constraints.md:31` describes.

### floor-guard-reads-the-merge-base-diff-including-untracked
- source: skills/constraint-driven-development/references/floor-guard.md:9 — "**Input:** the diff between the merge base and the working tree (added *and* removed lines, plus untracked files). A guard that reads only `git diff` misses new files and staged-but-uncommitted work."
- classification: mechanical
- target: pre-push script
- detection: an implementation check on the guard itself — it must diff against the merge base (not `HEAD`), must include untracked files, and must consider removed lines as well as added. Three properties, each testable with a fixture repo. The source names the exact failure (`git diff` alone).
- fail: a guard using `git diff HEAD` with no untracked-file handling.
- pass: `git diff $(git merge-base base HEAD)` plus `git ls-files --others`.
- false positives: none; the contract is stated.
- effort: S

### floor-guard-exit-codes-are-0-1-2
- source: skills/constraint-driven-development/references/floor-guard.md:11 — "**Exit codes:** `0` clean, `1` at least one floor violation (block the change), `2` the guard could not run (no merge base, not a git repo). Never let a `2` read as a `0`."
- classification: mechanical
- target: pre-push script
- detection: the three exit codes and the explicit rule that an execution failure must not be reported as clean. Testable with three fixtures: a clean repo, a violating repo, and a non-git directory.
- fail: a guard that exits 0 when `git merge-base` fails.
- pass: the three codes as specified.
- false positives: none.
- effort: S

### floor-guard-never-prints-the-matched-secret
- source: skills/constraint-driven-development/references/floor-guard.md:12 — "**Reports the rule and the location, never the matched secret value.** Redaction is not optional (Step 4)."
- classification: mechanical
- target: pre-push script
- detection: an output check — the finding line names the rule and the file:line but not the matched text. Testable by planting a secret-shaped string and asserting it does not appear in stdout/stderr.
- fail: `ERROR: found secret AKIAIOSFODNN7EXAMPLE at config.ts:12`
- pass: `ERROR: no-secrets at config.ts:12`
- false positives: none; redaction is a hard rule, and the source's own example commands use `--redact` (its :116 — "gitleaks detect --redact").
- effort: S

### floor-guard-only-reports-moves-that-lower-the-bar
- source: skills/constraint-driven-development/references/floor-guard.md:13 — "**Tightening is silent, loosening is loud:** only surfaces moves that lower the bar."
- classification: mechanical
- target: pre-push script
- detection: a threshold *raised* must not be reported; only a lowered one. One-directional comparison on the numeric cells of `CONSTRAINTS.md`. The floor-guard's five detections (its :10) are all bar-lowering moves by construction, which is the design constraint.
- fail: a guard that reports `coverage: 80 → 90` as a finding.
- pass: reporting only `80 → 70`.
- false positives: none.
- effort: S

### floor-guard-detects-the-five-step-6-moves
- source: skills/constraint-driven-development/references/floor-guard.md:10 — "**Detects the five Step 6 moves:** a weakened threshold in `CONSTRAINTS.md`, a test made easier (`.skip`, a deleted test file, an assertion removed from a test that stayed), a silenced checker (a new suppression comment), unfinished work (a stub or empty `catch`), a new Exceptions row."
- classification: mechanical
- target: pre-push script
- detection: the five detections, enumerated with their sub-cases. Three of the five are also floor rules above; the two deltas are "an assertion removed from a test that stayed" (a test that loses an `expect` without being deleted) and "a new Exceptions row" (an addition to the Exceptions table, which is a bar-lowering move even though the row itself is well-formed). Both are exact diff shapes.
- fail: a diff removing one `expect(...)` from an otherwise untouched test.
- pass: a test whose assertions all remain.
- false positives: a test refactored to move an assertion into a helper; needs to check the helper is called.
- effort: M

### floor-guard-honours-a-constraintsignore-file
- source: skills/constraint-driven-development/references/floor-guard.md:181 — "**A `.constraintsignore`** (one glob per line) lets you exempt a path the guard would otherwise flag; check each added line's file against it before flagging, so a genuine exception is a tracked file rather than a loosened rule."
- classification: mechanical
- target: pre-push script
- detection: the guard must read a `.constraintsignore` file of one glob per line and skip matching paths. The design point the source makes — an exemption is a *tracked file* rather than a loosened rule — is itself checkable: the guard's own exemptions live in version control, unlike an inline suppression.
- fail: a guard with no ignore mechanism, forcing users to disable the whole check.
- pass: the `.constraintsignore` mechanism.
- false positives: none; the mechanism is additive.
- effort: S

## skills/context-engineering/SKILL.md  (353 lines; sections 198-241, 314-353 read in full)
verdict: 10 candidates. Two rules are numeric (a 75% trimming threshold and a <2,000-line focus
target), and one — unresolvable imports — is the most directly lintable in the file.

### imports-resolve-to-real-modules
- source: skills/context-engineering/SKILL.md:338 — "Agent invents APIs or imports that don't exist" (anti-pattern row at :350 — "Agent references actual project files and APIs (not hallucinated ones)")
- classification: mechanical
- target: pre-push script
- detection: an import specifier added by the branch that resolves to no file, no package in the manifest, and no declared path alias. The strongest form of this rule and the only one that catches hallucination mechanically: a resolvable-import check on the added lines.
- fail: `import { parseTask } from './parsers/task-parser'` where the file does not exist.
- pass: the import resolving.
- false positives: a dynamic import of a virtual module (a bundler alias, a Vite `virtual:` specifier); needs an alias allowlist.
- effort: M

### no-reimplementing-an-existing-utility
- source: skills/context-engineering/SKILL.md:339 — "Agent re-implements utilities that already exist in the codebase"
- classification: mechanical
- target: structure_check.py / jscpd
- detection: a newly added function whose body is near-identical to an existing one elsewhere in the repo — the duplication check restricted to *new* code against the *whole* tree rather than the diff against the base. `jscpd` can be pointed at this; the source's phrasing names the failure precisely.
- fail: a new `formatIsoDate()` duplicating `toIso()`.
- pass: the existing helper imported.
- false positives: a deliberately forked implementation for a different domain; needs a threshold.
- effort: M

### context-trimming-starts-at-75-percent
- source: skills/context-engineering/SKILL.md:202 — "**Start trimming at 75% capacity, not 100%.** By the time the window is genuinely full, the model's attention is already fragmented across too many signals. The 75% threshold gives room to compress gracefully rather than cut desperately mid-task." (anti-pattern row at :324 — "Context cliff | Waiting until the window is full before managing it … | Start trimming at 75% capacity; compress rather than cut")
- classification: mechanical
- target: transcript check (harness)
- detection: a session whose context occupancy crosses 75% with no trimming action (a compaction, a summary, a context drop) recorded before the next task begins. The percentage is stated; occupancy is available to the harness.
- fail: a session reaching 95% with no compaction.
- pass: trimming at or before 75%.
- false positives: a short session that never approaches the threshold; the rule is conditional on crossing it.
- effort: M

### focused-context-under-2000-lines
- source: skills/context-engineering/SKILL.md:319 — "Context flooding | Agent loses focus when loaded with >5,000 lines of non-task-specific context. More files does not mean better output. | Include only what is relevant to the current task. Aim for <2,000 lines of focused context per task."
- classification: mechanical
- target: transcript check (harness)
- detection: two numeric bounds — a warning above 5,000 lines of loaded non-task-specific context, an error above that with the target being under 2,000 lines per task. Both numbers are stated, and the harness knows what it loaded.
- fail: 6,200 lines of context loaded for a single-file task.
- pass: 1,400 lines of focused context.
- false positives: a task that genuinely spans a large surface; the 2,000 figure is an aim, not a cap.
- effort: M

### rules-file-exists-and-covers-four-areas
- source: skills/context-engineering/SKILL.md:341 — "No rules file exists in the project" (exit criterion at :348 — "Rules file exists and covers tech stack, commands, conventions, and boundaries")
- classification: mechanical
- target: md-lint
- detection: a project with no `CLAUDE.md`/`AGENTS.md`/`.cursor/rules`, and one whose rules file omits any of the four named areas — tech stack, commands, code conventions, boundaries. The four areas correspond to the section headings the source itself models at :46-79.
- fail: a repo with no rules file at all.
- pass: the four sections at :46-79.
- false positives: a library with no project conventions; needs an explicit opt-out.
- effort: S

### task-critical-content-is-positioned-last
- source: skills/context-engineering/SKILL.md:234 — "Put the most task-critical content **last** in context. Models recall content at the start and end of the window more reliably than the middle (the lost-in-the-middle effect — Liu et al., 2023). Keep stable rules and specs at the start; put the active task material last, closest to the generation point" (exit criterion at :353)
- classification: heuristic-only
- target: transcript check (harness)
- detection: an assembly order in which the live error, the active file, or the current task statement is buried before background material. The source gives the intended layout at :237-238; the check is an ordering assertion on the context assembly, which a harness can make if it composes context itself.
- fail: a prompt that puts the failing test output before 3,000 lines of architecture docs.
- pass: the layout at :237-238.
- false positives: a harness that appends context in arrival order; the rule needs the harness to control assembly.
- effort: L

### protect-the-task-definition-and-live-error
- source: skills/context-engineering/SKILL.md:215 — "The original task definition and key constraints" and :216 — "The current error message or failing test output you are actively debugging" (the cut-first table is lines 206-211; exit criterion at :352)
- classification: heuristic-only
- target: transcript check (harness)
- detection: four categories that must survive a trimming step, against the four the source says to cut first (:208-211). A harness that compacts context can assert that the task statement and the live error are still present afterwards.
- fail: a compaction that drops the failing test output.
- pass: the four protected items retained.
- false positives: a task with no live error; the rule should require only the applicable items.
- effort: L

### compress-before-dropping
- source: skills/context-engineering/SKILL.md:222 — "Summarizing beats deleting. Before removing a long stretch of exploration, reduce it to one sentence capturing the conclusion:" (the worked before/after at :225-228)
- classification: heuristic-only
- target: transcript check (harness)
- detection: a trimming step that removes exploration without leaving a conclusion sentence — the source's example replaces eight messages with one summary line. Checkable as "a removed span is replaced by a summary", which needs the harness to control trimming.
- fail: exploration deleted outright.
- pass: the one-sentence summary at :226-227.
- false positives: a span whose conclusion is already recorded in an artifact; needs to check the artifact.
- effort: L

### external-data-is-not-treated-as-instructions
- source: skills/context-engineering/SKILL.md:342 — "External data files or config treated as trusted instructions without verification"
- classification: heuristic-only
- target: md-lint (agent configuration)
- detection: the fourth instance of this family in the corpus (with `browser-content-is-untrusted` in batch E, `fetched-content-is-data-not-instructions` in batch E2, and `error-output-is-data-not-instructions` in batch B1). Here the channel is a config or data file. Worth recording as one rule with four channels rather than four rules.
- fail: an agent following instructions found in a CSV or a YAML config.
- pass: the content quoted back to the user.
- false positives: a config that is genuinely the instruction source (a project rules file); needs the trust boundary to be explicit.
- effort: M

### context-refreshed-between-major-tasks
- source: skills/context-engineering/SKILL.md:320 — "Stale context | Agent references outdated patterns or deleted code | Start fresh sessions when context drifts" (exit criterion at :351 — "Context is refreshed when switching between major tasks")
- classification: heuristic-only
- target: transcript check (harness)
- detection: a session that switches to a new task while still carrying the previous task's exploration — detectable as a task boundary with no context reset, or as the agent editing a file whose content it read before a large intervening change.
- fail: a session implementing feature B while still holding feature A's dead ends.
- pass: a fresh session or a compaction at the boundary.
- false positives: closely related tasks where continuity helps; the source says "major tasks", so the boundary needs a heuristic.
- effort: L
