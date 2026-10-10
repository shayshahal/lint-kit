# 14 Git Workflow

skills/git-workflow-and-versioning.

---

# batch-C1 — git-workflow-and-versioning

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent (file read in
full).

## skills/git-workflow-and-versioning/SKILL.md  (355 lines read)
verdict: 17 candidates. The most mechanical file in the corpus for a repo-side linter: nearly every
rule is a property of git metadata (branch age, commit message shape, tag, version string) rather
than of source code, so most belong in a `commit-msg`/`pre-push` hook rather than an AST rule.

### branch-is-short-lived
- source: skills/git-workflow-and-versioning/SKILL.md:134 — "Keep branches short-lived (merge within 1-3 days) — long-lived branches are hidden costs" (rationalization at :320 — "\"Branches add overhead\" | Short-lived branches are free … Long-lived branches are the problem — merge within 1-3 days."; red flag at :334)
- classification: mechanical
- target: pre-push script
- detection: the age of the current branch's first commit ahead of the merge-base, compared against a three-day threshold. Pure git metadata; the number is stated.
- fail: a branch whose first divergence from `main` is nine days old.
- pass: a branch opened yesterday.
- false positives: a long-running release branch, which the skill explicitly permits at :31 ("Release branches are acceptable"); the rule must exempt `release/*`.
- effort: S

### commit-subject-uses-a-conventional-type-prefix
- source: skills/git-workflow-and-versioning/SKILL.md:89 — "- `feat` — New feature" and :90 — "- `fix` — Bug fix" (the six types are lines 89-94; the format is at :83; exit criterion at :345)
- classification: mechanical
- target: pre-commit hook (commit-msg)
- detection: every commit subject must match `^(feat|fix|refactor|test|docs|chore)(\([^)]+\))?: .+`. The six types are enumerated, so the set is closed; a seventh type is a finding.
- fail: `updated the auth module`
- pass: `feat: add email validation to registration endpoint` as at :71.
- false positives: a merge commit or a revert commit, which git generates; exempt `Merge ` and `Revert ` prefixes.
- effort: S

### no-vague-commit-subject
- source: skills/git-workflow-and-versioning/SKILL.md:330 — "Commit messages like \"fix\", \"update\", \"misc\"" and :77 — "# Bad: Describes what's obvious from the diff"
- classification: mechanical
- target: pre-commit hook (commit-msg)
- detection: a subject matching a denylist of bare words (`fix`, `update`, `misc`, `wip`, `changes`, `stuff`, `cleanup`, `tweaks`) or a subject under a minimum length, or a subject that is only a filename (`update auth.ts`). Three exact shapes; the denylist is the configuration.
- fail: `fix`
- pass: `fix: reject expired tokens in the session middleware`
- false positives: a subject that *contains* one of the words but is specific (`fix: update the pagination cursor`); the rule must match whole-subject, not substring.
- effort: S

### commit-body-explains-why
- source: skills/git-workflow-and-versioning/SKILL.md:85 — "<optional body explaining why, not what>" and :73 — "Prevents invalid email formats from reaching the database."
- classification: heuristic-only
- target: pre-commit hook (commit-msg)
- detection: a commit with no body whose diff is non-trivial (more than N changed lines or more than one file), or a body that restates the subject. The presence half is mechanical; "explains why" is not.
- fail: a 300-line commit with a subject and nothing else.
- pass: the body at :73-75.
- false positives: a mechanical rename; needs a size/kind threshold.
- effort: M

### branch-name-follows-the-prefix-convention
- source: skills/git-workflow-and-versioning/SKILL.md:141 — "feature/<short-description>   → feature/task-creation" and :142 — "fix/<short-description>       → fix/duplicate-tasks" (the four prefixes are lines 141-145)
- classification: mechanical
- target: pre-push script
- detection: the branch name must match `^(feature|fix|chore|refactor)/[a-z0-9-]+$`. The four prefixes are given with examples.
- fail: `my-work`
- pass: `feature/task-creation` as at :141.
- false positives: `main`/`develop`/`release/*`, which are not feature branches; exempt the long-lived names.
- effort: S

### no-force-push-to-a-shared-branch
- source: skills/git-workflow-and-versioning/SKILL.md:335 — "Force-pushing to shared branches"
- classification: mechanical
- target: pre-push script + branch protection
- detection: two halves — a non-fast-forward push to a branch that has an open PR (visible in the push output or the forge's `force-push` event), and the branch-protection setting that would allow it. The forge API exposes the second directly.
- fail: a `git push --force` to a branch with an open PR.
- pass: a force-push to a personal branch with no PR.
- false positives: a rebase on a personal branch, which the skill's own trunk-based advice implies; the rule must key on "shared" (an open PR or a protected branch).
- effort: M

### gitignore-covers-standard-exclusions
- source: skills/git-workflow-and-versioning/SKILL.md:248 — "**Have a `.gitignore`** that covers: `node_modules/`, `dist/`, `.env`, `.env.local`, `*.pem`" (red flag at :332 — "No `.gitignore` in the project"; exit criterion at :349)
- classification: mechanical
- target: pre-push script
- detection: the five named patterns must be covered by `.gitignore` (directly or by a broader pattern that subsumes them). Five presence assertions, each with the pattern named verbatim.
- fail: a `.gitignore` with only `node_modules/`.
- pass: all five covered.
- false positives: a repo with no Node (`dist/` irrelevant); the rule should derive the required set from the repo's own artifacts — if `dist/` exists or the manifest declares a build, require it.
- effort: S

### no-build-artifacts-or-env-files-committed
- source: skills/git-workflow-and-versioning/SKILL.md:333 — "Committing `node_modules/`, `.env`, or build artifacts" (the policy at :247 — "**Don't commit** build output (`dist/`, `.next/`), environment files (`.env`), or IDE config")
- classification: mechanical
- target: pre-push script
- detection: any tracked path under `node_modules/`, `dist/`, `.next/`, `build/`, or matching `.env`, `.env.local`, `*.pem`, plus `.vscode/settings.json` (unless the repo intends to share it — the source carves that out at :247). A tracked-file listing check.
- fail: `.env` in `git ls-files`.
- pass: the same file gitignored and untracked.
- false positives: a committed `.env.test` (which the CI skill requires at its :276) and a shared `.vscode/settings.json`; both need explicit exemptions.
- effort: S

### change-summary-is-provided
- source: skills/git-workflow-and-versioning/SKILL.md:196 — "CHANGES MADE:" and :200 — "THINGS I DIDN'T TOUCH (intentionally):" (the three blocks are lines 196-207; the rationale is at :209)
- classification: mechanical
- target: pre-push script
- detection: three named blocks in the PR body or the agent's change summary, with `CHANGES MADE`, `THINGS I DIDN'T TOUCH`, and `POTENTIAL CONCERNS` as literal markers. Presence-only; the content quality is not checkable.
- fail: a PR with a diff and no summary.
- pass: the three blocks at :196-207.
- false positives: a one-line fix where the summary is noise; needs a size threshold.
- effort: S

### pre-commit-hygiene-is-automated
- source: skills/git-workflow-and-versioning/SKILL.md:232 — "Automate this with git hooks:" (the five manual steps at :215-230; the config at :234-241)
- classification: mechanical
- target: pre-commit hook (lefthook)
- detection: the repo must have a hook runner configured (`lint-staged` + husky as at :237-240, or lefthook) covering at least lint, format, and a secret grep on staged files. The five manual steps at :217-229 are the required set; the finding is the absence of any automated equivalent.
- fail: a repo with no hook configuration at all.
- pass: the `lint-staged` block at :237-240 plus a secret check.
- false positives: a repo that runs everything in CI instead; needs an explicit opt-out, though the skill's own framing ("before every commit") argues for the local hook.
- effort: M

### semver-bump-matches-the-change
- source: skills/git-workflow-and-versioning/SKILL.md:279 — "MAJOR  breaking change — consumers must change their code to upgrade" and :281 — "PATCH  bug fix, backward-compatible — safe to upgrade" (the three levels are lines 279-281; red flag at :336; exit criterion at :353)
- classification: mechanical
- target: pre-push script
- detection: classify the diff against the public surface (a removed export, a changed signature, a removed field — the same signals as `public-interface-changes-are-additive-and-optional` in batch A1) and compare with the version bump in the manifest. A breaking diff under a minor or patch bump is the finding; the source states the mapping exactly.
- fail: `1.4.0 → 1.4.1` with a removed public export.
- pass: `1.4.0 → 2.0.0` for the same diff.
- false positives: a pre-1.0 package; needs the source's own conservative rule (:284 — "When unsure whether a change is breaking, assume it is").
- effort: L

### release-is-tagged-and-version-derives-from-the-tag
- source: skills/git-workflow-and-versioning/SKILL.md:288 — "A release is an immutable point in history, not a moving branch. Tag it so it can always be reproduced" and :295 — "Derive the version from the tag rather than hand-editing it in scattered files, so the artifact, the tag, and the changelog can never disagree." (red flag at :337 — "A release with no tag, or a version number hand-edited out of sync with the tag"; exit criterion at :354)
- classification: mechanical
- target: pre-push script
- detection: two assertions — every release has an annotated tag (`git tag -a v…` as at :291), and the version string in every manifest equals the tag's version. The second is the same check the source repo itself implements in `scripts/validate-versions.js` across five manifests; the delta here is comparing them against the git tag rather than against each other.
- fail: `plugin.json` at `1.4.1` with no `v1.4.1` tag.
- pass: the tag and all manifests at `1.4.0`.
- false positives: a monorepo with per-package versions; needs a per-package tag convention.
- effort: M

### changelog-is-grouped-by-impact-and-curated
- source: skills/git-workflow-and-versioning/SKILL.md:299 — "A changelog is not `git log`. It's the curated, consumer-facing answer to \"what changed and do I care?\" — grouped by `Added / Changed / Fixed / Deprecated / Removed / Security`, newest on top, every entry phrased around user impact, not internal mechanics." (the worked entry at :302-309; red flag at :338; exit criterion at :355)
- classification: mechanical
- target: md-lint
- detection: three checks on `CHANGELOG.md` — every version heading uses the six named groups and no others, headings are newest-first, and each entry is a human sentence rather than a commit subject. The last is the fuzzy one; the first two are exact, and the group list is closed.
- fail: `### Improvements` as a group heading.
- pass: the `### Added` / `### Fixed` / `### Deprecated` entry at :302-309.
- false positives: a project using a different changelog convention; the rule should be opt-in on the file's presence.
- effort: M

### changelog-entry-written-in-the-same-change
- source: skills/git-workflow-and-versioning/SKILL.md:311 — "Write the entry in the same change that makes the change, while the impact is fresh — not reconstructed from commit archaeology at release time." (rationalization at :325 — "\"We'll write the changelog at release time\" | By then the impact is reconstructed from memory and half of it is missing.")
- classification: mechanical
- target: pre-push script
- detection: a user-facing commit (`feat:`/`fix:` with a change to a public surface or a UI file) with no `CHANGELOG.md` modification in the same commit or branch. The trigger set is the six commit types; the required file is named.
- fail: a `feat:` commit adding an endpoint with no changelog change.
- pass: the changelog entry in the same commit.
- false positives: an internal refactor (`refactor:`, `chore:`) that consumers cannot observe; exempt those types.
- effort: M

### changelog-is-not-generated-from-commit-messages
- source: skills/git-workflow-and-versioning/SKILL.md:324 — "\"The changelog is just the commit log\" | Commits are for you; the changelog is for consumers, curated by impact. Generating one from raw commits buries what matters."
- classification: heuristic-only
- target: md-lint
- detection: a `CHANGELOG.md` whose entries are verbatim commit subjects (a high match rate between the changelog's bullet text and the git log's subjects for the same range). Computable as a similarity ratio.
- fail: a changelog whose every bullet is a `chore:`/`refactor:` commit subject.
- pass: bullets phrased around user impact as at :304-308.
- false positives: a small release where the commit subjects happen to be user-facing; needs a ratio threshold.
- effort: M

### no-squash-everything-later
- source: skills/git-workflow-and-versioning/SKILL.md:319 — "\"I'll squash it all later\" | Squashing destroys the development narrative. Prefer clean incremental commits from the start."
- classification: mechanical
- target: pre-push script
- detection: a PR merged as a single squash commit whose source branch had more than N commits — readable from the forge API's `merged` event (`merge_method: squash` plus the commit count). The skill prefers incremental commits, so the finding is the squash of a multi-commit branch.
- fail: a 14-commit branch squashed into one.
- pass: a rebase-merge preserving the commits, or a genuinely single-commit branch.
- false positives: a repo whose policy is squash-merge for a tidy main; needs an explicit policy flag rather than a default.
- effort: M

### commit-does-one-logical-thing
- source: skills/git-workflow-and-versioning/SKILL.md:50 — "Each commit does one logical thing" (the BAD example at :62 — "x1y2z3a Add task feature, fix sidebar, update deps, refactor utils"; exit criterion at :344)
- classification: heuristic-only
- target: pre-push script
- detection: a commit whose diff spans unrelated top-level areas (a feature directory, a dependency manifest, and a utility module) and whose subject lists them with commas or "and". The subject heuristic is mechanical and the source's own BAD example is the pattern.
- fail: the subject at :62.
- pass: the four separate commits at :55-58.
- false positives: a single change that legitimately touches a manifest plus its source; needs the areas to be genuinely unrelated.
- effort: M
