# 11 Code Review

skills/code-review-and-quality.

---

# batch-A3 — code-review-and-quality

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent (rule-bearing
sections 103-140, 179-260, 271-304, 356-398 read in full; the templates at 304-351 scanned).

## skills/code-review-and-quality/SKILL.md
verdict: 12 candidates. Several are numeric and therefore exact: change-size thresholds, a file-size
boundary, a review-response deadline, and a one-dependency-per-change rule.

### change-size-thresholds
- source: skills/code-review-and-quality/SKILL.md:108 — "~100 lines changed   → Good. Reviewable in one sitting." and :110 — "~1000 lines changed  → Too large. Split it." (the three bands are lines 108-110; red flag at :376)
- classification: mechanical
- target: pre-push script
- detection: three numeric bands on the merge-base diff's changed-line count. `~100` is the target, `~300` is a warning, `~1000` is a failure unless the change is one of the two stated exceptions (:126 — "Complete file deletions and automated refactoring where the reviewer only needs to verify intent"). The changed-line count is exactly what `structure_check.py` already computes against a base.
- fail: a 1,400-line PR with no stated exception.
- pass: a 90-line PR.
- false positives: a lockfile regeneration or a codemod; the exception at :126 must be honoured, ideally by naming the tool in the commit body.
- effort: S

### file-size-boundary-with-decomposition
- source: skills/code-review-and-quality/SKILL.md:113 — "**Watch file size, not just diff size.** A small diff can still push a file past a healthy boundary — around 1000 *total* lines in a single file (distinct from the ~1000 *changed*-lines threshold above) is a common inspection signal, not a hard cap. When a change materially grows an already-large file, ask whether to extract helpers, subcomponents, or modules *first*, before piling more on. Decompose, then add." (red flag at :381 — "A change that grows an already-large file instead of decomposing it")
- classification: mechanical
- target: structure_check.py
- detection: a diff that adds lines to a file already at or above ~1000 total lines, without reducing it. Distinct from `fallow`'s complexity rules because it is file length, not function complexity, and distinct from the change-size rule because a 20-line addition to a 2,000-line file trips it. The source explicitly calls it "a common inspection signal, not a hard cap", so warn.
- fail: a 30-line addition to a 1,900-line `routes.ts`.
- pass: the same addition after extracting a module.
- false positives: a generated file, a lockfile, a fixture; needs a path allowlist.
- effort: M

### refactoring-and-feature-are-separate-changes
- source: skills/code-review-and-quality/SKILL.md:128 — "**Separate refactoring from feature work.** A change that refactors existing code and adds new behavior is two changes — submit them separately." (rationalization at :365 — "\"The refactor makes it cleaner\" | Relocating complexity isn't reducing it.")
- classification: mechanical
- target: pre-push script
- detection: a single PR that both adds behaviour (a new branch, a new endpoint, a new export) and structurally changes code the behaviour does not require (a rename with call-site updates, an extraction, a reordering). Overlaps `no-unscoped-refactor-in-a-feature-commit` in batch A1; stated here from the review side.
- fail: a PR adding CSV export that also extracts three helpers in an unrelated module.
- pass: the export PR, then a refactor PR.
- false positives: a small rename at reviewer discretion (:128 — "Small cleanups (variable renaming) can be included at reviewer discretion").
- effort: L

### commit-subject-is-imperative-and-standalone
- source: skills/code-review-and-quality/SKILL.md:134 — "**First line:** Short, imperative, standalone. \"Delete the FizzBuzz RPC\" not \"Deleting the FizzBuzz RPC.\" Must be informative enough that someone searching history can understand the change without reading the diff." (the anti-pattern list at :138 — "\"Fix bug,\" \"Fix build,\" \"Add patch,\" \"Moving code from A to B,\" \"Phase 1,\" \"Add convenience functions.\"")
- classification: mechanical
- target: pre-commit hook (commit-msg)
- detection: three checks on the subject line — a non-imperative opener (a gerund or a past tense: `Fixing`, `Fixed`, `Added`, `Moving`), a subject under a minimum length or matching the six named anti-patterns verbatim, and a trailing period. The six anti-patterns are given as literal strings, so they can be matched exactly.
- fail: `Fixing the build.`
- pass: `Delete the FizzBuzz RPC`
- false positives: a conventional-commit prefix (`fix:`, `feat:`) which is imperative in spirit and must be accepted; the rule needs to strip a recognised prefix first.
- effort: S

### change-description-explains-why
- source: skills/code-review-and-quality/SKILL.md:136 — "**Body:** What is changing and why. Include context, decisions, and reasoning not visible in the code itself. Link to bug numbers, benchmark results, or design docs where relevant."
- classification: heuristic-only
- target: pre-push script
- detection: a PR whose body is empty or restates the subject with no rationale, and which references no issue, doc, or measurement. The mechanical half is the absence of a link and a body under N characters; the "explains why" part is not machine-checkable.
- fail: a PR titled `Fix login bug` with an empty body.
- pass: a body naming the issue and the reasoning.
- false positives: a trivial dependency bump where the link is the changelog; needs an exemption.
- effort: M

### verification-story-is-documented
- source: skills/code-review-and-quality/SKILL.md:200 — "- What tests were run?" and :203 — "- Are there screenshots for UI changes?" (the five questions are lines 199-205; exit criterion at :395)
- classification: mechanical
- target: pre-push script
- detection: five required elements in a PR body or a review artifact. Four are presence checks (`tests`, `build`, a manual-test note, a screenshot link); the fifth requires a before/after pair when the diff touches UI files. The list is stated verbatim, so the artifact schema is defined.
- fail: a PR with no verification section.
- pass: a section answering all five.
- false positives: a docs-only PR; needs a per-change-type reduction of the required set.
- effort: M

### severity-labels-on-every-review-comment
- source: skills/code-review-and-quality/SKILL.md:185 — "| *(no prefix)* | Required change | Must address before merge |" and :186 — "| **Critical:** | Blocks merge | Security vulnerability, data loss, broken functionality |" (the five labels are lines 185-189; red flag at :378)
- classification: mechanical
- target: pre-push script
- detection: every review comment in a review artifact must begin with one of the five prefixes (or carry none, which the table defines as "Required"). The closed set is given; a sixth label is a finding. Same rule as `review-severity-vocabulary-is-closed` in batch-GOV, which found the live drift in `.claude/commands/review.md`.
- fail: a review comment labelled `**Important:**`.
- pass: the five prefixes at :185-189.
- false positives: a quoted comment; needs to scope to the review's own comment list.
- effort: M

### dead-code-identified-before-deletion
- source: skills/code-review-and-quality/SKILL.md:239 — "**Ask before deleting:** \"Should I remove these now-unused elements: [list]?\"" and :241 — "Don't leave dead code lying around — it confuses future readers and agents." (the worked block is lines 244-248)
- classification: mechanical
- target: pre-push script
- detection: a diff that deletes an export or a component while the same branch introduced its replacement, with no `DEAD CODE IDENTIFIED` block in the PR body. The mechanical half is the deletion; the block is the required evidence. The `DEAD CODE IDENTIFIED:` marker is stated verbatim at :244.
- fail: a PR removing `formatLegacyDate()` with no identification block.
- pass: the block at :244-248.
- false positives: a deletion the task explicitly asked for; needs the task reference.
- effort: M

### review-response-within-one-business-day
- source: skills/code-review-and-quality/SKILL.md:255 — "**Respond within one business day** — this is the maximum, not the target"
- classification: mechanical
- target: pre-push script (forge metadata)
- detection: the time between a PR's `ready_for_review` event and its first review comment, read from the forge API. A single numeric threshold on a timestamp difference — the most directly computable rule in the file.
- fail: a PR open for three days with no review.
- pass: a review comment within one business day.
- false positives: a PR deliberately left in draft; the rule must key on the ready-for-review transition.
- effort: S

### one-dependency-per-change
- source: skills/code-review-and-quality/SKILL.md:297 — "**One dependency per change.** Upgrade and merge them individually (or in small related groups). When a bulk bump breaks the build, you've lost which package did it; a single-package change makes the cause obvious and the revert clean." (rationalization at :368 — "\"I'll upgrade everything in one PR to save time\" | A bulk bump that breaks the build hides which package did it."; red flag at :384)
- classification: mechanical
- target: pre-push script
- detection: a PR whose `package.json`/`pyproject.toml` diff bumps more than N direct dependencies at once, without a stated related group. Counting changed version lines in the manifest diff is exact.
- fail: a `chore: bump deps` PR with 34 version changes.
- pass: one package bumped, or a small named group (the source allows "small related groups").
- false positives: a Dependabot grouped update, which the source's own automation section endorses; needs a bot-author exemption.
- effort: S

### dependency-upgrade-reviews-the-changelog
- source: skills/code-review-and-quality/SKILL.md:296 — "**Read the changelog, not just the version number.** Semver is a promise the maintainer may not have kept — a \"patch\" can carry a behavioral change. For a major bump, read the migration notes and find what breaks." (exit criterion at :396 — "Dependency upgrades were reviewed against their changelog")
- classification: heuristic-only
- target: pre-push script
- detection: a dependency bump whose PR body or commit message links no changelog or release notes. The link's absence is mechanical; whether it was read is not.
- fail: `chore: bump axios to 1.8.0` with an empty body.
- pass: a body linking the release notes.
- false positives: a patch bump of a package with no published changelog; needs a fallback requirement (a test run instead).
- effort: M

### lockfile-is-never-hand-edited
- source: skills/code-review-and-quality/SKILL.md:300 — "**Keep the lockfile honest.** Commit it, review its diff, and never hand-edit it. The lockfile is the thing that actually pins what ships." (red flag at :385 — "A lockfile change that's hand-edited, uncommitted, or merged without reviewing its diff")
- classification: mechanical
- target: pre-push script
- detection: three findings — a lockfile change with no corresponding manifest change (the hand-edit signature), a lockfile present on disk but untracked or gitignored, and a lockfile whose diff is large relative to the manifest diff (a transitive-graph change the author did not name, which the source says to review at :299).
- fail: a `pnpm-lock.yaml` diff with no `package.json` change.
- pass: both files changed together.
- false positives: a lockfile regenerated after a resolution change with no manifest edit; needs a `--frozen-lockfile` verification to distinguish.
- effort: M

### presumptive-blockers-are-surfaced
- source: skills/code-review-and-quality/SKILL.md:398 — "**Presumptive blockers:** surface and propose the simpler design for each of these; escalate to Required only when the change actively makes structure worse: a refactor that relocates complexity instead of reducing it; a change that pushes a file past the size boundary with no decomposition; feature logic added to a shared module; a near-duplicate of an existing canonical helper; a silent fallback that hides an unclear invariant."
- classification: heuristic-only
- target: oxlint:slop-patterns + structure_check.py
- detection: five named structural signals. Four have mechanical forms — a file crossing the ~1000-line boundary (the rule above), feature logic added to a module imported by more than N callers, a new helper whose body matches an existing one (jscpd), and a `catch`/`??`/`||` fallback that swallows a value with no log and no test. The fifth (relocating complexity) needs the complexity delta that `structure_check.py` already computes.
- fail: a new `parseDate()` duplicating an existing `parseISO()`.
- pass: the canonical helper reused.
- false positives: a genuine second implementation for a different input domain; hence "presumptive" — surface, do not fail.
- effort: L
