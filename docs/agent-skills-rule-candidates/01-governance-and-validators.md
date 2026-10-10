# 01 Governance And Validators

The source repo's own machinery: its validators, hooks, CI, docs conventions, personas, commands and manifests. Includes the rules it already mechanizes (precedent) and the ones it states but does not check.

---

# batch-GOV — governance, validators, hooks, repo conventions

Source repo: https://github.com/addyosmani/agent-skills @ `1401c8b8030e023baeebb31781a6653fe8e93026`
Extracted by: lead agent (non-skill files). Skill/reference corpus handled by batches A–E.

## scripts/lib/skill-lint.js  (584 lines read)
verdict: ZERO new candidates — this file IS the already-mechanized rule set. Listed here as
proven-enforceable precedent, not as new work:
- SKILL.md present in every skill dir; frontmatter has `name` + `description`; `name` == dir name;
  dir is kebab-case; description <= 1024 chars; description carries a non-negated "Use when" trigger;
  required sections present; non-empty subdirectories; supporting `.md` kebab-case;
  frontmatter is valid YAML (not merely splittable); top-level frontmatter keys limited to the spec
  set; declared workflow steps must each have a `### Step N:` section; dead cross-skill references
  (warning); SKILL.md > 500 lines (warning).
  Evidence: `scripts/lib/skill-lint.js` lines 1–40 (check inventory), 201–201 region, and
  `scripts/lib/skill-lint-test.js` (650 lines) — the test file is the fixture convention a new rule
  should copy.

## scripts/validate-skills.js  (69 lines read)
verdict: no mechanizable candidates (thin CLI wrapper over skill-lint.js; exit code 1 on errors).

## scripts/validate-versions.js  (34 lines read)
verdict: no new candidates — already mechanized: every plugin manifest
(`plugin.json`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`,
`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`) must carry the same
`version` as `plugin.json`.

## scripts/validate-artifact-paths.js  (128 lines read)
verdict: no new candidates — already mechanized: only `SPEC.md`, `docs/SPEC.md`,
`tasks/plan.md`, `tasks/todo.md` may be referenced as spec/plan/todo artifacts by the
producers/consumers listed in `GUARDED_FILES`.

## scripts/validate-reference-links.js  (187 lines read)
verdict: one follow-up candidate (below).

### dead-markdown-link-outside-references
- source: scripts/validate-reference-links.js:32-34 — "Scope is deliberately narrow: only `references/*.md` links, only SKILL.md and `skills/<name>/references/*.md` files. It is not a general markdown path linter"
- classification: mechanical
- target: md-lint
- detection: resolve every relative markdown link / image in the repo's tracked `.md` files; report any that do not exist on disk. The repo deliberately excludes this (it would fail on intentional forward references like `tasks/todo.md`, `PERF.md`, `docs/ideas/[idea-name].md`), so the rule needs an allowlist of intentionally-absent paths and should run on `docs/`, `references/`, `README.md`, `CONTRIBUTING.md`, `agents/`, `commands/` — not on `skills/`.
- fail: README.md links `docs/nope-setup.md` and the file does not exist.
- pass: README.md links `docs/getting-started.md`, which exists.
- false positives: placeholder targets (`tasks/todo.md`, `docs/ideas/[idea-name].md`), host-local absolute paths, `#anchor`-only links.
- effort: S

## scripts/validate-commands.js  (222 lines read)
verdict: no new candidates — already mechanized: command parity across `.claude/commands/`,
`.gemini/commands/`, `commands/`, identical `description` across the three, and YAML validity of
Claude command frontmatter.

## scripts/run-evals.js  (638 lines read)
verdict: no new candidates — already mechanized: every skill has a case file, >=3 positive and >=2
negative triggers and >=1 behavioral eval, `skill_name` matches a real skill, eval `kind` in
{execution,dialogue}, execution evals have real fixtures, fixture paths cannot escape the workspace,
description-collision at >=0.75 cosine (error) / >=0.5 (warn), and the `--min-rank1` ratchet.
One policy rule in `evals/README.md` is not checkable by this script (see below).

## hooks/session-start.sh  (33 lines read)
verdict: one candidate.

### session-start-hook-envelope
- source: hooks/session-start.sh:10-11 — "Every output path must emit the standard SessionStart envelope `{\"hookSpecificOutput\": {\"hookEventName\": \"SessionStart\", \"additionalContext\": \"...\"}}`"
- classification: mechanical
- target: pre-push script
- detection: every `echo`/`printf`/`jq -cn` that produces hook output in `hooks/session-start.sh` (and any hook registered for `SessionStart`) must emit valid JSON containing `hookSpecificOutput.hookEventName == "SessionStart"` and a string `additionalContext`. Parse each emitted line with `JSON.parse`.
- fail: a fallback branch printing `session-start: jq missing`.
- pass: the existing `jq -cn '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $context}}'` branch.
- false positives: `>&2` diagnostic writes, which are not hook output.
- effort: S
- NOTE: `hooks/session-start-test.sh` already asserts the payload for both the jq and no-jq branches, so this is precedent rather than new capability — the generalisable rule is "any hook emitting into a host's stdout protocol is validated by a parsing test".

## hooks/simplify-ignore.sh  (352 lines read)
verdict: one candidate (a vocabulary/convention rule rather than a code rule).

### simplify-ignore-block-must-carry-a-reason
- source: hooks/simplify-ignore.sh:87 — "reason=$(printf '%s' \"$line\" | sed -n 's/.*simplify-ignore-start:[[:space:]]*//p'" and the placeholder it builds is `${prefix}BLOCK_${h}` with no reason when none was given
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a `simplify-ignore-start` / `simplify-ignore-end` pair whose start marker has no `: <reason>` text is a suppression with no stated justification. Flag comment tokens matching `simplify-ignore-start(?!\s*:)`. The hook already tolerates a reasonless block, so this rule tightens it.
- fail: `// simplify-ignore-start` … `// simplify-ignore-end`
- pass: `// simplify-ignore-start: the generated fixture is intentionally verbose`
- false positives: the hook's own source and its test file, which contain the marker as a string literal — exempt `hooks/simplify-ignore*.sh`.
- effort: S

## hooks/sdd-cache-pre.sh / sdd-cache-post.sh  (106 + 135 lines read)
verdict: no mechanizable candidates — the pair's own contract (URL-only cache key, sha256 first 32
chars, never cache without ETag/Last-Modified) is stated in comments and covered by
`hooks/sdd-cache-test.sh`. The shared-hash-format rule is worth naming as precedent: two files must
agree on the key format, and a test asserts it.

## hooks/sdd-cache-test.sh, hooks/session-start-test.sh, hooks/simplify-ignore-test.sh  (246+47+476 lines read)
verdict: no candidates (test files; they are the fixture convention).

## scripts/lib/skill-lint-test.js, scripts/*-test.js, scripts/floor-guard-reference-test.js  (tests)
verdict: no candidates — test suites.

## .github/workflows/test-plugin-install.yml  (167 lines read)
verdict: no candidates — the CI definition that runs the validators above plus
`claude plugin validate .`.

## docs/skill-anatomy.md  (203 lines read)
verdict: 13 mechanizable candidates. This is the richest source of NOT-yet-mechanized rules in the
repo, because it is the normative document that `skill-lint.js` only partially implements.

### skill-script-bash-shebang
- source: docs/skill-anatomy.md:142 — "Use a `#!/bin/bash` shebang."
- classification: mechanical
- target: md-lint
- detection: every file under `skills/*/scripts/` with a `.sh` extension must have `#!/bin/bash` as its first line (`.sh` == bash per this convention, so `#!/bin/sh` and `#!/usr/bin/env bash` are both wrong here).
- fail: `skills/idea-refine/scripts/idea-refine.sh` starting `#!/bin/sh`.
- pass: first line `#!/bin/bash`.
- false positives: a `.py`/`.js` helper under `scripts/`, which this rule should skip.
- effort: S

### skill-script-fail-fast
- source: docs/skill-anatomy.md:143 — "Use `set -e` for fail-fast behavior."
- classification: mechanical
- target: md-lint
- detection: every `skills/*/scripts/*.sh` must contain a `set -e` (accept `set -euo pipefail` and `set -eu`).
- fail: a helper script with no `set` line.
- pass: `set -euo pipefail`.
- false positives: a script that deliberately inspects a non-zero exit status with `set +e` later; the rule only requires the directive to be present, not to be the final state.
- effort: S

### skill-script-status-on-stderr
- source: docs/skill-anatomy.md:144 — "Write status messages to stderr: `echo \"Message\" >&2`."
- classification: heuristic-only
- target: md-lint
- detection: in `skills/*/scripts/*.sh`, a progress/status line (`echo`/`printf` of prose without `>&2`, not inside a `$( … )` capture, not `>>` a file) is a candidate. Prose = the argument contains a space and no shell metacharacters.
- fail: `echo "Generating refinement report..."`.
- pass: `echo "Generating refinement report..." >&2`.
- false positives: stdout payloads, which the next rule requires; JSON/CSV/`jq` pipelines; text that is the script's return value.
- effort: M

### skill-script-json-to-stdout
- source: docs/skill-anatomy.md:145 — "Write machine-readable output (JSON) to stdout."
- classification: heuristic-only
- target: md-lint
- detection: in `skills/*/scripts/*.sh` that emit structured results, the structured emitter must not be redirected to stderr and must not be `>&2`-suffixed.
- fail: `jq -n '{...}' >&2`.
- pass: `jq -n '{...}'` on stdout.
- false positives: scripts that produce no machine-readable output at all.
- effort: M

### skill-script-cleanup-trap
- source: docs/skill-anatomy.md:146 — "Include a cleanup trap for temporary files."
- classification: mechanical
- target: md-lint
- detection: any `skills/*/scripts/*.sh` that creates a temp path (`mktemp`, `mktemp -d`, `$$`-suffixed temp file, `trap`-less `TMPDIR`) must also register a `trap … EXIT` (or `RETURN`) that removes it.
- fail: `TMP=$(mktemp)` with no `trap` anywhere in the file.
- pass: `trap 'rm -f "$TMP"' EXIT` after the `mktemp`.
- false positives: a script using a temp file it deliberately keeps, which should carry an explicit `# no-cleanup: <reason>` marker rather than silently pass.
- effort: S

### skill-script-repo-relative-path-reference
- source: docs/skill-anatomy.md:147 — "Reference the script path as `skills/<skill-name>/scripts/<script>.sh` (repo-relative)."
- classification: mechanical
- target: md-lint
- detection: inside a `skills/<name>/SKILL.md`, a reference to its own helper script must be the repo-relative `skills/<name>/scripts/<script>.sh` form. Flag bare `scripts/<script>.sh`, `./scripts/…`, and `$(dirname …)`-style forms in prose (fenced code excluded).
- fail: "Run `scripts/idea-refine.sh` to score the idea."
- pass: "Run `skills/idea-refine/scripts/idea-refine.sh` to score the idea."
- false positives: the same string inside a fenced block showing the script's own internals.
- effort: S

### skill-supporting-file-only-when-long
- source: docs/skill-anatomy.md:109-110 — "Create supporting files only when: Reference material exceeds 100 lines" and :114 — "Keep patterns and principles inline when under 50 lines."
- classification: mechanical
- target: md-lint
- detection: a supporting `.md` beside a SKILL.md whose line count is < 100 is a candidate to inline (warn); a SKILL.md containing a section longer than 50 lines that is mirrored as its own file is a candidate. Report as a warning, mirroring the 500-line budget's warning severity.
- fail: `skills/foo/examples.md` at 43 lines.
- pass: `skills/idea-refine/frameworks.md` at 99 lines (at the boundary).
- false positives: a short file that is a runnable checklist; the >=50-line inline threshold is a second, separate check.
- effort: S

### skill-md-file-references-one-level-deep
- source: docs/skill-anatomy.md:136 — "Keep file references one level deep. Link directly from `SKILL.md` to supporting files rather than chaining through intermediate documents."
- classification: heuristic-only
- target: md-lint
- detection: build the link graph rooted at each SKILL.md; flag a target reached only via another supporting file (depth >= 2) when the intermediate document is not itself a skill.
- fail: SKILL.md -> `references/tier-a.md` -> `references/tier-b.md` where tier-b is never linked from SKILL.md.
- pass: SKILL.md links both supporting files directly.
- false positives: a deliberate three-level reference library; the rule should warn, not error.
- effort: M

### skill-description-must-not-summarize-the-workflow
- source: docs/skill-anatomy.md:42 — "Do not summarize the workflow — if the description contains process steps, the agent may follow the summary instead of reading the full skill."
- classification: heuristic-only
- target: md-lint
- detection: flag a frontmatter `description` containing an enumerated process, i.e. `\b\d+\.\s` or a step arrow `→`, or three or more imperative verbs chained by "then". Complements the existing trigger and 1024-char checks.
- fail: `description: Does X. 1. Read the spec. 2. Write tests. Use when refactoring.`
- pass: `description: Simplifies code for clarity. Use when refactoring code for clarity without changing behavior.`
- false positives: a description whose "1." is a version number or a proper noun.
- effort: S

### skill-description-third-person-opener
- source: docs/skill-anatomy.md:33 — "`description`: Start with what the skill does in third person, then include one or more clear \"Use when\" trigger conditions. Include both *what* and *when*."
- classification: heuristic-only
- target: md-lint
- detection: the first sentence of `description` must open with a third-person verb (`-s` form: Designs, Simplifies, Reviews, Guides, Investigates) or the imperative noun-phrase form used elsewhere, and must not open with "I", "You", "We", "This skill", or a bare imperative ("Write …", "Use …").
- fail: `description: I help you simplify code. Use when refactoring.`
- pass: `description: Simplifies code for clarity. Use when refactoring code for clarity.`
- false positives: "Use when …" as the *second* clause is correct and must not be flagged; skills whose name is a noun phrase ("api-and-interface-design designs …") are fine.
- effort: S

### no-model-or-private-tool-names-in-skills
- source: docs/skill-anatomy.md:163 — "if a step cannot be justified without naming a model, a model version, or one agent's private tool name, it belongs in an issue, not in a skill. Describe the capability (\"run the focused test command\", \"write the file\"), not the mechanism one runtime happens to expose (`run_command`, `write_to_file`)."
- classification: mechanical
- target: md-lint
- detection: in `skills/**/*.md`, flag model identifiers (`gpt-*`, `claude-*`, `opus`, `sonnet`, `haiku`, `gemini-*`, `llama`, `o1`/`o3`/`o4` as model names) and a denylist of host-private tool names (`run_command`, `write_to_file`, `str_replace_editor`, `apply_patch`, `computer_use`, `read_file` as an imperative) outside of a section explicitly about cross-model portability. The rule must be a warning with an inline exemption marker, because `docs/skill-anatomy.md` itself names examples.
- fail: skills/foo/SKILL.md step "Call `write_to_file` with the new contents."
- pass: "Write the file." / "Run the focused test command."
- false positives: a skill legitimately discussing model selection; the vendor-name list must exclude generic words ("pro", "flash").
- effort: M

### no-duplicated-content-between-skills
- source: docs/skill-anatomy.md:189 — "Don't duplicate content between skills — reference and link instead." (restated at CONTRIBUTING.md:59 — "Don't duplicate content between skills — reference other skills instead" and CLAUDE.md:60 — "Never: Duplicate content between skills — reference other skills instead")
- classification: mechanical
- target: jscpd / structure_check.py
- detection: run copy-paste detection across `skills/**/*.md` with a threshold tuned for prose (e.g. >= 15 lines / >= 100 tokens) and report duplicate blocks that appear in two or more skills without a `references/` home. lint-kit already ships `jscpd` as a devDependency and `structure_check.py` already fails on new duplication for code.
- fail: the same "How to write a failing test" block in `test-driven-development/SKILL.md` and `debugging-and-error-recovery/SKILL.md`.
- pass: one copy in `references/testing-patterns.md`, linked from both.
- false positives: a shared table of severity labels or a code fence reproduced as an example; exclude fenced code blocks and short lists.
- effort: M

### empty-scripts-directory
- source: docs/skill-anatomy.md:116 — "If a skill does not need runnable helpers, do not create an empty `scripts/` directory just to mirror other skills."
- classification: mechanical
- target: md-lint
- detection: already implemented for *any* skill subdirectory by `lintSkillLayout` in `scripts/lib/skill-lint.js` (isEffectivelyEmpty → "Empty directory `scripts/`"). Listed for completeness; no new work.
- fail: —
- pass: —
- false positives: —
- effort: — (done)

### supporting-file-naming-for-script-helpers
- source: docs/skill-anatomy.md:176 — "Supporting files: `lowercase-hyphen-separated.md`" together with :178 — "the emerging convention for self-contained, distributable skills is to group them in a `references/` directory inside the skill directory"
- classification: mechanical
- target: md-lint
- detection: implement the same `KEBAB_CASE` check for the contents of a skill's own `references/` directory. `lintSkillLayout` already walks arbitrary depth for `.md` files, so this is covered; a `.md` file inside `skills/<name>/references/` with an uppercase or underscore name is already an error.
- fail: —
- pass: —
- false positives: —
- effort: — (done)

### reference-material-location-conflict
- source: CONTRIBUTING.md:63 — "Don't put reference material inside skill directories — use `references/` instead" vs docs/skill-anatomy.md:178 — "the emerging convention for self-contained, distributable skills is to group them in a `references/` directory inside the skill directory"
- classification: mechanical
- target: md-lint
- detection: this is a *contradiction in the source*, not a rule to implement. Flagged so the catalog records it: a rule either forbids `skills/<name>/references/` (CONTRIBUTING) or blesses it (skill-anatomy, and the live tree has 5 such directories). Whichever survives, adding it as a check would fail today's tree, so it needs a maintainer decision before implementation.
- fail: —
- pass: —
- false positives: —
- effort: S (implement) / unknown (decide)

## CONTRIBUTING.md  (137 lines read)
verdict: 6 mechanizable candidates.

### eval-negative-trigger-declares-owner
- source: evals/README.md:91 — "Declare that skill in `owner` where you can: the runner then asserts the owner **outranks** this skill, turning the negative into a real pairwise routing test instead of one that can pass vacuously when the prompt matches nothing."
- classification: mechanical
- target: pre-push script (extends `scripts/run-evals.js`)
- detection: every entry in `evals/cases/*.json` → `trigger.negative[]` should carry `owner` naming another real skill; warn when absent, error when `owner` names an unknown skill or names the case's own skill.
- fail: `{ "prompt": "Update the architecture diagram" }` with no `owner`.
- pass: `{ "prompt": "Update the architecture diagram", "owner": "documentation-and-adrs" }`
- false positives: a negative prompt that legitimately matches no other skill, which is exactly the vacuous case the README warns about — hence warn-level.
- effort: S

### eval-rank1-floor-must-not-be-lowered
- source: evals/README.md:101 — "Raise the floor as routing improves; never lower it to make a regression pass."
- classification: mechanical
- target: pre-push script / CI check
- detection: the `--min-rank1` value in `.github/workflows/test-plugin-install.yml` must be monotonically non-decreasing against the value on the base branch. Compare `git show <merge-base>:.github/workflows/test-plugin-install.yml` with the working copy and fail on a decrease. This is the same branch-vs-merge-base shape `structure_check.py` already uses.
- fail: base = `--min-rank1 95`, head = `--min-rank1 85`.
- pass: base = `--min-rank1 95`, head = `--min-rank1 98`.
- false positives: a deliberate, documented floor reset after a taxonomy change; needs an explicit override marker in the commit message.
- effort: S

### rejection-ledger-row-for-rejected-skill-change
- source: CONTRIBUTING.md:73 — "If a skill or description change is rejected based on eval results, add one row to the ledger with the date, affected skill, concise attempted change, before-to-after rank-1 score, and rejected PR link and outcome."
- classification: heuristic-only
- target: md-lint
- detection: `evals/skill-impact.md` rows must have all five fields (date, skill, change, before→after rank-1 score, PR link + outcome). A markdown-table check: fixed column count, a parseable date, an `owner/repo#nnn` or URL, and a two-number score cell. Cannot detect a *missing* row, only a malformed one.
- fail: a row with the PR link column empty.
- pass: a row with date, skill, change, `100 → 62`, and the PR link plus outcome.
- false positives: a header separator row; the table may legitimately be empty at some revisions.
- effort: S

### translations-are-not-accepted
- source: CONTRIBUTING.md:89 — "We don't accept translations of the documentation (README, `docs/`) or of skills and their content… Keep all skills, docs, and contributions in English."
- classification: heuristic-only
- target: markdown lint / pre-push script
- detection: flag tracked files under `docs/`, `skills/`, and `references/` whose path carries a locale suffix (`*.ja.md`, `*.zh-CN.md`, `README.es.md`) or that sit under a `i18n/`, `locale/`, `translations/`, or `docs/<lang>/` directory. Path-based, so no false positives on prose.
- fail: `docs/getting-started.ja.md`.
- pass: `docs/getting-started.md`.
- false positives: legitimate identifiers containing a two-letter token (`docs/ai-setup.md`); require the suffix to match a known language code list.
- effort: S

### other-hosts-entry-has-no-decoration
- source: CONTRIBUTING.md:77 — "Every other host gets one line in [docs/other-hosts.md](docs/other-hosts.md): the host name and its install command. No dedicated setup page, vendor links, logos, emoji, or screenshots."
- classification: mechanical
- target: md-lint
- detection: in `docs/other-hosts.md`: no image syntax `![…](…)`, no emoji code points, no links to vendor marketing domains, and each host entry is one line. Flag a second paragraph or an `###` subheading per host as a dedicated setup page in disguise.
- fail: `### Acme CLI\n\n![Acme](acme.png)\n\nInstall: …`
- pass: `- **Acme CLI** — `npm i -g acme`` on one line.
- false positives: a link to the host's docs site, which is arguably a vendor link; scope the domain check to social/marketing domains only.
- effort: S

### host-guide-in-readme-requires-a-maintainer-run
- source: CONTRIBUTING.md:80 — "A host moves into the README once a maintainer has run it and is willing to keep its entry current."
- classification: not mechanizable — a claim about a human action with no artifact to check. Recorded for coverage, not proposed.
- target: none — no surface can verify that a person ran something.
- detection: nothing to detect. The nearest checkable neighbour is `other-hosts-entry-has-no-decoration` (above), which constrains the *form* of a host entry once it exists.
- fail: n/a.
- pass: n/a.
- false positives: n/a.
- effort: n/a.

### adr-skills-contributing-rule-scope
- source: .claude/rules/skills-contributing.md:3-4 — "paths:\n  - \"skills/**\""
- classification: mechanical
- target: md-lint
- detection: every file matching `.claude/rules/*.md` must have frontmatter with a non-empty `paths` list, and every glob in `paths` must match at least one tracked file (a stale scope silently disables the rule).
- fail: `paths: ["skills-legacy/**"]` where the directory no longer exists.
- pass: `paths: ["skills/**"]`.
- false positives: a rule intended to apply to future paths; should warn.
- effort: S

## AGENTS.md  (92 lines read)
verdict: 3 mechanizable candidates.

### persona-must-not-invoke-another-persona
- source: AGENTS.md:78 — "Composition rule: **the user (or a slash command) is the orchestrator. Personas do not invoke other personas.** A persona may invoke skills."
- classification: heuristic-only
- target: md-lint
- detection: in `agents/*.md`, flag invocation-shaped references to another persona: a backticked `agents/<other>.md` path, or phrases `use the <role> agent`, `invoke the <role>`, `delegate to <role>` where `<role>` is another file stem in `agents/`. A bare mention in a "hand off to" sentence is a true positive; a mention of a *skill* is not.
- fail: agents/code-reviewer.md says "Then use the `security-auditor` persona to check auth."
- pass: "Then use the `security-and-hardening` skill."
- false positives: a persona reproducing a `/ship`-style fan-out description as prose — only one orchestration pattern is endorsed (AGENTS.md:80), so the rule should allow exactly the `parallel fan-out with a merge step` wording.
- effort: M

### persona-frontmatter-plugin-agent-fields
- source: AGENTS.md:84 — "Plugin agents silently ignore the `hooks`, `mcpServers`, and `permissionMode` frontmatter fields."
- classification: mechanical
- target: md-lint
- detection: no file under `agents/` may use `hooks`, `mcpServers`, or `permissionMode` in its YAML frontmatter, because the plugin path ignores them — a declared-but-ignored field is a silent no-op. Report as an error with that reason.
- fail: `agents/test-engineer.md` frontmatter contains `permissionMode: acceptEdits`.
- pass: no such keys.
- false positives: none identified; these keys have no effect on the plugin path at all.
- effort: S

### intent-skill-map-references-real-skills
- source: AGENTS.md:24 — "The agent should automatically map user intent to skills:" (the map runs to line 32)
- classification: mechanical
- target: md-lint
- detection: every backticked kebab-case skill name in `AGENTS.md`'s intent map and lifecycle map must resolve to a directory under `skills/`. `skill-lint.js` already checks cross-references *inside* skills (`SKILL_REF_PATTERNS`) but not in `AGENTS.md`/`CLAUDE.md`.
- fail: AGENTS.md maps UI work to `frontend-design`, which is not a skill.
- pass: AGENTS.md maps UI work to `frontend-ui-engineering`.
- false positives: the same backtick pattern used for a non-skill concept; restrict the extraction to the two list blocks.
- effort: S

## CLAUDE.md  (60 lines read)
verdict: 1 mechanizable candidate (plus restatements).

### skill-file-vs-supporting-file-threshold
- source: CLAUDE.md:35 — "Supporting files only created when content exceeds 100 lines"
- classification: mechanical
- target: md-lint
- detection: the same rule as `skill-supporting-file-only-when-long` above, stated here; implements the CLAUDE.md boundary. Also note CLAUDE.md:57-60 "Boundaries → Always / Never" rules are the normative source for the `never-add-vague-advice` candidate in batch-GOV: the `no-model-or-private-tool-names-in-skills` and `no-duplicated-content-between-skills` rules are the checkable halves of lines 59-60.
- fail: —
- pass: —
- false positives: —
- effort: S

## .claude/rules/skills-contributing.md  (15 lines read)
verdict: covered by `adr-skills-contributing-rule-scope` above; the anti-duplication content is covered by
`no-duplicated-content-between-skills`.

## docs/advanced-per-agent-configuration.md  (read: frontmatter policy section)
verdict: 1 candidate, largely already mechanized.

### vendor-field-belongs-under-metadata
- source: docs/advanced-per-agent-configuration.md:7 — "Fields such as `kind`, `model`, `temperature`, `max_turns`, `tools`, and `context` must not appear at the top level of a skill. They belong under `metadata` or in a separate per-agent adapter file"
- classification: mechanical
- target: md-lint
- detection: already implemented — `SPEC_FRONTMATTER_KEYS` in `scripts/lib/skill-lint.js` rejects any top-level key outside the six spec fields. The only new work is extending the same check to `agents/*.md` and `commands/*.toml` frontmatter, which `validate-commands.js` currently validates for YAML syntax but not for key scope.
- fail: —
- pass: —
- false positives: —
- effort: S (extension)

### no-hardcoded-temperature-for-gemini-3x
- source: docs/advanced-per-agent-configuration.md:45 — "Google recommends omitting `temperature` for Gemini 3.x models and using `thinking_level` instead. Do not hardcode `temperature` on skills or subagents routed to 3.x models"
- classification: heuristic-only
- target: md-lint
- detection: a per-agent adapter file or a `metadata` block that pins both a `gemini-3*` model and a `temperature` value.
- fail: `metadata: { model: gemini-3-pro, temperature: 0.2 }`
- pass: `metadata: { model: gemini-3-pro, thinking_level: high }`
- false positives: any non-Gemini model paired with a temperature.
- effort: S

## agents/*.md  (102+112+95+184 lines read)
verdict: 4 mechanizable candidates. Note that NO validator currently reads `agents/` at all —
`validate-skills.js` walks `skills/` only — so this whole directory is unguarded.

### persona-frontmatter-name-matches-file
- source: docs/agents.md:119 — "Create `agents/<role>.md` with the same frontmatter format used by existing personas." (the format itself is shown by agents/code-reviewer.md:2-3 — `name: code-reviewer` / `description: … Use for thorough code review before merge.`)
- classification: mechanical
- target: md-lint
- detection: extend `lintSkillContent`'s frontmatter checks to `agents/*.md`: frontmatter present, `name` == file stem, `description` present and non-empty. The trigger check must accept `Use for …` as well as `Use when …`, because every persona in this repo uses `Use for`.
- fail: `agents/code-reviewer.md` with `name: reviewer`.
- pass: `name: code-reviewer` matching the stem.
- false positives: none; the four existing personas all conform.
- effort: S

### persona-ends-with-composition-block
- source: docs/agents.md:104 — "Every persona file ends with a \"Composition\" block stating where it fits." (restated at :121 — "Add a **Composition** block at the bottom (Invoke directly when / Invoke via / Do not invoke from another persona).")
- classification: mechanical
- target: md-lint
- detection: every `agents/*.md` must end with a `## Composition` section, and that section must contain all three of the documented lines (`Invoke directly when`, `Invoke via`, `Do not invoke from another persona`). All four current personas satisfy it (code-reviewer.md:98, security-auditor.md:108, test-engineer.md:91, web-performance-auditor.md:180).
- fail: a new `agents/db-auditor.md` with no Composition section.
- pass: the four existing files.
- false positives: none identified.
- effort: S

### persona-listed-in-agents-doc-table
- source: docs/agents.md:122 — "Add the persona to the table at the top of this file."
- classification: mechanical
- target: md-lint
- detection: the set of file stems in `agents/*.md` must equal the set of persona links in the table at the top of `docs/agents.md` (lines 5-10 today). Report a persona file with no table row, and a table row whose `../agents/<name>.md` link does not resolve.
- fail: `agents/db-auditor.md` exists but the table has no row for it.
- pass: the four current files and four current rows.
- false positives: none identified.
- effort: S

### persona-fabricated-metric-guard
- source: agents/web-performance-auditor.md:43 — "**Never fabricate metrics.** An LLM reading static source code cannot measure real-world LCP, INP, or CLS. If no tool data is provided:" and :169 — "Always label scorecard values with their source. Never present lab values as field values or vice versa."
- classification: heuristic-only
- target: md-lint
- detection: in a generated performance scorecard, every numeric metric value must carry a source label from the tooling list at agents/web-performance-auditor.md:29-39 (`lighthouse`, `chrome-devtools`, `psi`, `web-vitals`), and a value marked `field` must not come from a lab-only source. Applies to the *output artifact*, so the rule lives in the eval/grader layer rather than a source linter.
- fail: `LCP: 2.1s` with no source.
- pass: `LCP: 2.1s (field, CrUX)`.
- false positives: a metric quoted from a user-supplied report; require the label, not a specific tool.
- effort: M

## docs/agents.md  (123 lines read)
verdict: no candidates beyond those above — the persona rules are the normative source for the
three `persona-*` checks, and `:115` restates the ignored-frontmatter-fields rule.

## docs/developer-onboarding.md  (116 lines read)
verdict: no new candidates — restates the composition rule (:23), the no-duplication rule (:24,
":88" — "reference material goes in `references/`, never inside the skill"), and the AGENTS.md
scope caveat (:26 — "setup guides must never tell users to copy them into their own projects").
That last one IS mechanizable:

### setup-guides-must-not-tell-users-to-copy-agents-md
- source: docs/developer-onboarding.md:26 — "`AGENTS.md` and `CLAUDE.md` at the repo root configure agents working on *this repo*. They are not reusable assets and setup guides must never tell users to copy them into their own projects"
- classification: heuristic-only
- target: md-lint
- detection: in `docs/*-setup.md`, `docs/other-hosts.md`, `README.md`, and `docs/getting-started.md`, flag an instruction pairing a copy/install verb (`copy`, `cp `, `paste`, `add to your`) with `AGENTS.md` or `CLAUDE.md` in the same sentence, outside of a negation or a link to the scope caveat.
- fail: "Copy `CLAUDE.md` into your project root."
- pass: "`AGENTS.md` configures agents working on this repository itself; do not copy it into your project."
- false positives: a sentence that *forbids* the copy, which is the desired wording — the rule must skip sentences containing `do not`, `never`, or `not`.
- effort: S

## docs/getting-started.md  (208 lines read)
verdict: 1 candidate.

### do-not-double-install-the-meta-skill
- source: docs/getting-started.md:47 — "If your host already discovers and activates skills from their descriptions, do not also paste `using-agent-skills` into an always-on system prompt or rules file. That creates two routers for the same task." (same rule at docs/adoption-guide.md:31)
- classification: heuristic-only
- target: md-lint
- detection: a repo that both declares native skill routing (a host plugin manifest, `.claude-plugin/plugin.json`, or a `skills/` glob) and embeds the `using-agent-skills` body in an always-on file (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*`, a `SessionStart` hook). Warn with the two-router reason. This is the rule `hooks/session-start.sh`'s own header cites as the reason it is not wired by the plugin.
- fail: a `SessionStart` hook that cats `using-agent-skills/SKILL.md` *and* a plugin manifest that already exposes `./skills`.
- pass: exactly one of the two.
- false positives: a host without native routing, which is precisely the case the hook exists for.
- effort: M

## .claude/commands/ship.md  (72 lines read)
verdict: 1 candidate.

### ship-fanout-skip-predicate
- source: .claude/commands/ship.md:72 — "**Skip the fan-out only if all of the following are true:** the change touches 2 files or fewer, the diff is under 50 lines, and it does not touch auth, payments, data access, or config/env. Otherwise, default to fan-out."
- classification: mechanical
- target: pre-push script
- detection: a numeric, file-and-diff predicate with an explicit path denylist — directly computable from a merge-base diff. If the diff has >2 files, or >=50 changed lines, or touches a path matching `auth|payment|billing|data|db|migrations|config|env|\.env`, then the `/ship` fan-out is required; a run that reports no specialist reports is a violation.
- fail: a 400-line diff touching `src/auth/session.ts` shipped with no specialist reports.
- pass: the same diff shipped with code-reviewer + security-auditor + test-engineer reports.
- false positives: an explicitly user-accepted override, which the same file already allows for Critical findings (line 71).
- effort: M

## commands/*.toml, .claude/commands/*.md (other), .gemini/commands/*.toml  (read: ship.md, review.md + parity already validated)
verdict: no candidates beyond `ship-fanout-skip-predicate` and the already-mechanized parity checks.

## hooks/SIMPLIFY-IGNORE.md  (92 lines read)
verdict: 2 candidates.

### simplify-ignore-block-requires-a-reason (restated)
- source: hooks/SIMPLIFY-IGNORE.md:64 — "/* simplify-ignore-start */           // basic — hides the block"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: same rule as `simplify-ignore-block-must-carry-a-reason` above. The doc shows the reason form as the useful one; the basic form hides code with no stated justification. Recommend warn-level.
- fail: —
- pass: —
- false positives: —
- effort: S

### simplify-ignore-annotations-on-dedicated-lines
- source: hooks/SIMPLIFY-IGNORE.md:83 — "**Single-line blocks hide the entire line.** If `simplify-ignore-start` and `simplify-ignore-end` appear on the same line as other code, the whole line is hidden from the model, not just the annotated portion. Use dedicated lines for annotations."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: flag a `simplify-ignore-start` line that contains anything other than the comment marker and the marker itself (i.e. code on the same line before the comment). The hook's own single-line handling is the acknowledged hazard.
- fail: `const x = compute(); /* simplify-ignore-start: keep */`
- pass: a line whose only content is the comment.
- false positives: a leading-language comment style where the prefix is required (`<!-- simplify-ignore-start -->`), which is still a dedicated line.
- effort: S

## hooks/SDD-CACHE.md  (167 lines read)
verdict: 1 candidate.

### cache-entries-require-a-validator
- source: hooks/SDD-CACHE.md:71 — "Entries without an `ETag` or `Last-Modified` header are never cached — without a validator, the hook cannot verify freshness later, and caching would mean trusting memory."
- classification: mechanical
- target: pre-push script
- detection: every JSON file under `.claude/sdd-cache/` must carry a non-empty `etag` or `last_modified` field. Both hook scripts already refuse to write such an entry (sdd-cache-post.sh removes the file when neither header is present), so this is a defensive invariant check on the cache directory — cheap, and it catches a hand-edited or corrupted entry.
- fail: `{"url": "…", "content": "…"}` with no validators.
- pass: `{"url": "…", "etag": "W/\"abc\"", "content": "…"}`.
- false positives: none — the directory is gitignored and machine-written.
- effort: S

## docs/copilot-setup.md  (162 lines read)
verdict: 7 candidates. **Important for the catalog**: lines 58-83 are a ready-made
`.github/copilot-instructions.md` template the pack recommends to *downstream* repos. Each line in
it is a rule about the consumer's repository — i.e. exactly what lint-kit installs — and each is
mechanizable. These are the highest-leverage candidates in the whole corpus for that reason.

### no-secrets-in-code-or-version-control
- source: docs/copilot-setup.md:71 — "No secrets in code or version control" (restated at :81 — "Never: Commit secrets")
- classification: mechanical
- target: pre-commit hook
- detection: run a secret scanner (gitleaks/trufflehog rules) over the staged diff, plus a high-entropy string check on added lines in non-test files, plus the standard key-prefix denylist (`AKIA`, `sk-`, `ghp_`, `xox[baprs]-`, `-----BEGIN … PRIVATE KEY-----`).
- fail: `const apiKey = "sk-live-9f3…";` on an added line.
- pass: `const apiKey = process.env.API_KEY;`
- false positives: fixture data and test constants; lint-kit's `error-handling` and `tailwind-patterns` sets already carry valid fixtures for interface mirrors, so the same pattern applies — exempt `**/fixtures/**`, `**/*.test.*`, and any line carrying a `// not-a-secret` marker.
- effort: M

### never-mix-formatting-with-behavior
- source: docs/copilot-setup.md:76 — "Never mix formatting changes with behavior changes"
- classification: mechanical
- target: structure_check.py
- detection: classify each changed hunk in a merge-base diff as formatting-only (whitespace, quote style, trailing comma, import reorder, line wrapping) or behaviour-affecting (any token change other than the above). If a single commit contains both classes and the formatting-only hunks touch files the behaviour hunks do not, report "mixed diff — split the formatting commit". This is the same merge-base comparison shape `structure_check.py` already implements for complexity and duplication.
- fail: a commit that reformats `utils.ts` and fixes a bug in `parser.ts`.
- pass: two commits, `style: reformat utils` then `fix: parser off-by-one`.
- false positives: a formatter run that is the *only* change in a file also touched behaviourally; a rename plus its call-site update.
- effort: L

### never-remove-a-failing-test
- source: docs/copilot-setup.md:81 — "Never: Commit secrets, remove failing tests, skip verification"
- classification: mechanical
- target: pre-push script
- detection: in the branch diff, a deleted `test`/`it`/`def test_` block, a newly added `@pytest.mark.skip` / `it.skip` / `describe.skip` / `test.skip` / `xit`, a newly added `expect.assertions(0)`, or a test body replaced by `expect(true).toBe(true)`. Report when the corresponding source file also changed in the same branch — that is the shape that hides a regression rather than reflecting a genuine removal.
- fail: the diff deletes `test('rejects expired token')` and edits `src/auth/token.ts`.
- pass: the diff deletes a test for a function deleted in the same commit.
- false positives: a test moved between files; a skip added with a linked issue in the same line — exempt `skip.*#\d+`.
- effort: M

### every-pr-passes-lint-typecheck-tests-build
- source: docs/copilot-setup.md:70 — "Every PR must pass: lint, type check, tests, build"
- classification: mechanical
- target: pre-push script
- detection: assert the repository's CI config (`.github/workflows/*.yml`, `.gitlab-ci.yml`, etc.) contains a job that runs each of the four classes — a linter invocation, a type checker (`tsc`/`pyright`/`mypy`), a test runner, and a build command. Report which of the four has no CI step.
- fail: a workflow that runs `pnpm test` and `pnpm build` but no type check.
- pass: the four present, or a documented `# no-build: <reason>` marker.
- false positives: a repo whose build is the test command, or a language with no type checker; needs a per-class opt-out marker.
- effort: M

### ask-first-database-schema-and-dependencies
- source: docs/copilot-setup.md:80 — "Ask first: Database schema changes, new dependencies"
- classification: mechanical
- target: pre-push script
- detection: flag a diff that adds a file under a migrations directory (`**/migrations/**`, `**/alembic/**`, `**/prisma/schema.prisma` changes) or adds an entry to a dependency manifest (`package.json` `dependencies`/`devDependencies`, `pyproject.toml`, `requirements*.txt`). This is a "needs human sign-off" gate rather than a failure — exit non-zero only in a `--strict` mode.
- fail: a new `alembic/versions/abc_drop_column.py` with no accompanying approval note.
- pass: a migration file whose commit message or PR body carries an `APPROVED-BY:` line.
- false positives: a version bump of an existing dependency, which the rule can distinguish from an addition.
- effort: M

### run-tests-before-commits
- source: docs/copilot-setup.md:79 — "Always: Run tests before commits, validate user input"
- classification: mechanical
- target: pre-commit hook (lefthook)
- detection: the repository must have a pre-commit or pre-push hook that invokes the test command; report when no hook runs tests at all. lint-kit's `lefthook` dependency makes this a config assertion rather than new machinery.
- fail: `.lefthook.yml` with only `eslint` on pre-commit and nothing on pre-push.
- pass: a pre-push step running the suite.
- false positives: a repo that deliberately runs tests only in CI, which should carry an explicit opt-out.
- effort: S

### validate-user-input
- source: docs/copilot-setup.md:79 — "Always: Run tests before commits, validate user input"
- classification: heuristic-only
- target: eslint:error-handling
- detection: a request handler / boundary function that reads `req.body`, `req.query`, `req.params`, `sys.argv`, `os.environ`, or a JSON parse result and uses a field without a preceding schema validation call (`zod`, `pydantic`, `valibot`, `joi`, `yup`). lint-kit's `error-handling` set already covers part of this surface; the delta is the "validated at the boundary" shape from `skills/api-and-interface-design/SKILL.md`.
- fail: `const { id } = req.body; db.delete(id);`
- pass: `const { id } = CreateSchema.parse(req.body);`
- false positives: an internal handler already validated by middleware; needs a per-file `// validated-at: middleware` marker.
- effort: L

## docs/cursor-setup.md  (225 lines read)
verdict: 3 candidates.

### no-skill-body-duplicated-into-rules-files
- source: docs/cursor-setup.md:23 — "**Do not** copy entire `SKILL.md` bodies into rules; that duplicates `.cursor/skills/` and wastes context." (same rule at :206 — "Duplicate instructions | Remove skill content from rules; keep one source")
- classification: mechanical
- target: md-lint / jscpd
- detection: run copy-paste detection between a host rules directory (`.cursor/rules/**`, `.cursorrules`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) and `skills/**/*.md`; report any block of >= 10 consecutive matching lines. This is the same jscpd mechanism as `no-duplicated-content-between-skills`, pointed at the rules files instead of at two skills.
- fail: `.cursor/rules/tdd.mdc` containing 40 lines copied from `skills/test-driven-development/SKILL.md`.
- pass: a rules file that names the skill and links to it.
- false positives: a shared code fence reproduced as an example; exclude fenced blocks and lines < 10.
- effort: M

### no-giant-cursorrules-file
- source: docs/cursor-setup.md:217 — "- [ ] Skip giant `.cursorrules` unless required by legacy tooling"
- classification: mechanical
- target: md-lint
- detection: a `.cursorrules` file at the repo root is a legacy-format rule dump; warn when present and error when it exceeds a line threshold (the checklist's word is "giant"; 200 lines is a defensible default).
- fail: a 900-line `.cursorrules`.
- pass: no `.cursorrules`, or a short one carrying a `# legacy: <reason>` marker.
- false positives: a repo genuinely pinned to an old Cursor version; hence a warn with an override.
- effort: S

### cursor-rules-extension-and-scope
- source: docs/cursor-setup.md:13 — "| **Project rules** | `.cursor/rules/*.mdc` | Always-on or file-scoped instructions (`alwaysApply`, `globs`) |" and :204 — "Rules ignored | Extension `.mdc`? Correct `alwaysApply` / `globs`?"
- classification: mechanical
- target: md-lint
- detection: every file under `.cursor/rules/` must end in `.mdc` and its frontmatter must carry either `alwaysApply: true` or a non-empty `globs` list; a rule with neither is silently inert.
- fail: `.cursor/rules/style.md` with no frontmatter.
- pass: `.cursor/rules/style.mdc` with `globs: ["src/**/*.ts"]`.
- false positives: a `.md` file under `.cursor/rules/` that is documentation rather than a rule; require an explicit `# docs-only` marker.
- effort: S

## docs/antigravity-setup.md  (128 lines read)
verdict: 1 candidate.

### no-yaml-frontmatter-in-toml-command-files
- source: docs/antigravity-setup.md:64 — "Do not add YAML frontmatter to the TOML files as a workaround. Gemini CLI reads the parallel TOML command format with a strict parser, and `---` frontmatter makes those files invalid TOML"
- classification: mechanical
- target: md-lint
- detection: no file matching `commands/*.toml` or `.gemini/commands/*.toml` may begin with a `---` line, and every one must parse as TOML.
- fail: `.gemini/commands/review.toml` starting with `---\ndescription: …\n---`.
- pass: a TOML file beginning with `description = "…"`.
- false positives: none — `---` is never valid TOML.
- effort: S

## docs/gemini-cli-setup.md, docs/codex-setup.md, docs/opencode-setup.md, docs/commandcode-setup.md, docs/windsurf-setup.md, docs/comparison.md, docs/other-hosts.md, docs/adoption-guide.md, docs/getting-started.md (rest)
verdict: no candidates beyond those already recorded. The recurring rules in this group are the
`/planning` vs `/plan` name collision (already mechanized by `NAME_MAP` in
`scripts/validate-commands.js`), the do-not-double-install rule (`do-not-double-install-the-meta-skill`),
the do-not-copy-AGENTS.md rule (`setup-guides-must-not-tell-users-to-copy-agents-md`), and the
prefer-skills-over-always-on-context rule (same as the double-install rule, docs/gemini-cli-setup.md:130).

## evals/skill-impact.md  (6 lines read)
verdict: covered by `rejection-ledger-row-for-rejected-skill-change` — the ledger is empty today
(header + column row only), so the rule currently has no rows to check.

## evals/fixtures/**, evals/cases/**, evals/plugin/**
verdict: no candidates — these are the eval corpus (planted-bug fixtures, trigger cases, grader
prompts), not guidance. `scripts/run-evals.js` already enforces their schema.

## Feasibility probes (measured, not assumed)

These were run against the pinned tree to check that the "already mechanized" claims are live and
to measure false-positive risk on the two riskiest new rules.

#### P1 — the source repo's own validators pass today
Commands run in the clone at `1401c8b8`:
```
node scripts/validate-skills.js          -> 25 skills checked — 0 error(s), 0 warning(s) — PASSED
node scripts/validate-reference-links.js -> 25 skills checked — 0 error(s) — PASSED
node scripts/validate-versions.js        -> All plugin manifests use version 0.6.12.
node scripts/validate-commands.js        -> 9 commands checked — 0 error(s) — PASSED
node scripts/validate-artifact-paths.js  -> 14 files checked — 0 error(s) — PASSED
node --test scripts/lib/skill-lint-test.js -> pass 62, fail 0
```
Conclusion: every rule in the "already mechanized" category is enforced by CI in the source repo and
has a passing regression suite. They are precedent for a lint-kit implementation, not proposals.

#### P2 — Script Requirements have exactly one instance, and it conforms
`find skills -path '*/scripts/*' -type f` returns exactly one file:
`skills/idea-refine/scripts/idea-refine.sh`. Against the five rules at docs/skill-anatomy.md:142-147:
- `#!/bin/bash` shebang — present (line 1)
- `set -e` — present (line 2)
- status messages to stderr — both `echo` lines end in `>&2` (lines 10, 12)
- machine-readable output to stdout — the final `echo '{"status": "ready", …}'` is unredirected (line 16)
- repo-relative script path reference — `skills/idea-refine/scripts/idea-refine.sh` appears once in
  `skills/idea-refine/SKILL.md`
Conclusion: the rules are satisfied by the single example, so **false-positive risk is unmeasured**
for them. They should land at `warn` until a second script exists. The cleanup-trap rule cannot fire
today at all (the script creates no temp file), so it is speculative and should not ship first.

#### P3 — `no-model-or-private-tool-names-in-skills` false positives, measured
A grep for `gpt-[0-9]|claude-[0-9a-z]|opus|sonnet|haiku|gemini-[0-9]|llama` over `skills/` and
`references/` returns 5 hits:
- `skills/code-simplification/SKILL.md:8` — an attribution blockquote naming the Claude Code
  Simplifier plugin the skill was adapted from. **Not a violation** (not a workflow step).
- `references/orchestration-patterns.md:113,123,166,265` — a reference doc that is explicitly about
  host-specific orchestration and recommends per-model routing (`Haiku for test-engineer`, `Sonnet
  for code-reviewer`, `Opus for security-auditor`). **Not a violation**, and it directly contradicts
  a naive repo-wide rule.
A grep for host-private tool names (`run_command`, `write_to_file`, `str_replace_editor`,
`apply_patch`, `computer_use`, `read_file`) returns **zero** hits in `skills/` and `references/`.
Conclusion: the rule must be scoped to *imperative workflow steps inside `skills/**/SKILL.md`*, must
exempt `references/**` and blockquote attribution lines, and should land at `warn`. With that scope
the measured false-positive count on today's tree is 1 (the attribution line) out of 5 hits — so the
attribution exemption is required, not optional. The private-tool-name half is clean and can be an
error immediately.

## .claude/commands/*.md bodies — build, test, constraints, spec, plan, code-simplify, webperf, review  (read in full, 236 lines)
verdict: 10 candidates. These command bodies carry the most explicit, numeric process rules in the
repo, and several are self-described lint specs.

### constraints-guard-weakened-bar
- source: .claude/commands/constraints.md:31 — "`/constraints guard` — inspect the diff for a weakened bar: lowered thresholds, skipped or deleted tests, new suppression comments, unfinished stubs, new exceptions"
- classification: mechanical
- target: pre-push script
- detection: five named detections against the merge-base diff — (1) a lowered numeric threshold in a config file (`coverage`, `max-complexity`, `size-limit`, `branches`), (2) an added `skip`/`xfail`/`.only` or a deleted test block, (3) an added suppression comment (`eslint-disable`, `# noqa`, `# type: ignore`, `// @ts-ignore`, `pylint: disable`, `nosec`), (4) an added stub (`TODO`, `NotImplementedError`, `throw new Error('not implemented')`, `pass  # TODO`), (5) a new row in a `CONSTRAINTS.md` exceptions table. Each is a separate rule with its own message.
- fail: the diff adds `# type: ignore` to `tools/x.py` and lowers `coverage.fail_under` from 80 to 70.
- pass: a suppression added with a linked issue (`# type: ignore  # see #123`).
- false positives: a genuinely obsolete suppression being *moved* rather than added; require the line to be newly added, which the merge-base comparison already gives.
- effort: M

### constraints-every-number-has-a-reason-and-a-command
- source: .claude/commands/constraints.md:19 — "Write CONSTRAINTS.md at the repo root with a Floor section, enforced numbers, measured-only metrics with today's values, and an exceptions table with owners and expiry dates. Every number needs a stated reason." and :21 — "Record the exact command next to each rule in CONSTRAINTS.md"
- classification: mechanical
- target: md-lint
- detection: parse `CONSTRAINTS.md`; every table row that carries a numeric value must have a non-empty reason cell and a non-empty command cell containing an executable token (a known runner: `npx`, `pnpm`, `python`, `pytest`, `semgrep`, `gitleaks`, `osv-scanner`, `lighthouse`, `stryker`). Exceptions rows must have both an owner and a parseable expiry date.
- fail: `| coverage | 80 | — | — |`
- pass: `| coverage | 80 | measured 2026-01 at 78, this is the ratchet | `pnpm test --coverage` |`
- false positives: the Floor section, which is stated as always-enforced without numbers; skip rows above the enforced-numbers heading.
- effort: S

### constraints-doc-is-linked-from-agent-config
- source: .claude/commands/constraints.md:25 — "Add a line to CLAUDE.md telling agents to read CONSTRAINTS.md and never weaken it to make a change pass."
- classification: mechanical
- target: md-lint
- detection: if `CONSTRAINTS.md` exists at the repo root, then `CLAUDE.md` or `AGENTS.md` must contain a reference to it. The reverse is not required.
- fail: `CONSTRAINTS.md` present, neither agent config file mentions it.
- pass: `CLAUDE.md` has a line naming `CONSTRAINTS.md`.
- false positives: a repo using a different agent-config filename (`GEMINI.md`, `.cursor/rules/`), which the rule should accept as an alternative.
- effort: S

### autonomous-build-requires-a-clean-baseline
- source: .claude/commands/build.md:32 — "Run `git status --porcelain`. If there are uncommitted changes outside the expected planning artifacts (`SPEC.md`, `docs/SPEC.md`, `spec/*`, `tasks/plan.md`, `tasks/todo.md`), stop and ask the user to commit, stash, or confirm how to handle them."
- classification: mechanical
- target: pre-push script
- detection: a closed allowlist of planning artifacts plus a `git status --porcelain` emptiness check. Directly computable.
- fail: `/build auto` runs with `src/parser.ts` modified and uncommitted.
- pass: the only dirty paths are `tasks/plan.md` and `tasks/todo.md`.
- false positives: a build invoked deliberately over a dirty tree by the user, which the command already routes to an explicit confirmation.
- effort: S

### autonomous-build-requires-a-spec-at-a-known-path
- source: .claude/commands/build.md:31 — "Look only for a spec at a known path: `SPEC.md` at the repo root, `docs/SPEC.md`, or a file under `spec/`. A README or arbitrary doc does **not** count."
- classification: mechanical
- target: pre-push script
- detection: file-presence check over exactly three locations. This is the rule `scripts/validate-artifact-paths.js` guards from the other side.
- fail: only `README.md` exists; `/build auto` proceeds.
- pass: `SPEC.md` at the root.
- false positives: none — the command explicitly excludes everything else.
- effort: S

### spec-location-allowlist-drift
- source: .claude/commands/build.md:31 — "or a file under `spec/`" vs scripts/validate-artifact-paths.js:36-37 — "'SPEC.md', // spec, project root … 'docs/SPEC.md', // spec, alternate location accepted by /build"
- classification: mechanical
- target: md-lint (on the pipeline files)
- detection: the set of spec locations the pipeline *accepts* (`SPEC.md`, `docs/SPEC.md`, `spec/*`) must equal the set `ARTIFACT_ALLOWLIST` *permits*. Today `spec/*` is accepted by `/build` in all three host surfaces but is absent from the allowlist, so a future reference to `spec/SPEC.md` would fail CI while `/build` would accept it. This is exactly the producer/consumer drift `validate-artifact-paths.js` was written to catch, in the one direction it does not check.
- fail: `spec/SPEC.md` referenced anywhere in the guarded files.
- pass: the allowlist containing `spec/SPEC.md` alongside `SPEC.md` and `docs/SPEC.md`.
- false positives: none — it is a set-equality assertion between two lists in the same repo.
- effort: S

### never-overwrite-an-incomplete-plan
- source: .claude/commands/plan.md:18 — "If tasks/plan.md or tasks/todo.md already exists with unchecked tasks for different work, stop and ask before writing — never silently overwrite an incomplete plan."
- classification: mechanical
- target: pre-commit hook
- detection: when the staged diff rewrites `tasks/plan.md` or `tasks/todo.md`, fail if the base version contains an unchecked `- [ ]` item that the new version no longer contains as unchecked or checked — i.e. a task silently disappears. Requires reading both versions of the file, which a pre-commit hook can do from the index and HEAD.
- fail: the diff deletes `- [ ] Add rate limiting` from `tasks/todo.md` without checking it off.
- pass: `- [ ] Add rate limiting` becomes `- [x] Add rate limiting`.
- false positives: a deliberate re-plan after user approval; needs a `--replan` escape or a commit-message marker.
- effort: M

### review-severity-vocabulary-is-closed
- source: .claude/commands/review.md:15 — "Categorize findings as Critical, Important, or Suggestion." vs skills/code-review-and-quality/SKILL.md:185-189 — "| *(no prefix)* | Required change | Must address before merge | … | **Critical:** | … | **Nit:** | … | **Optional:** / **Consider:** | … | **FYI** | …" vs agents/code-reviewer.md:51-57 — "**Critical** … **Required** … **Optional** … **Nit**"
- classification: mechanical
- target: md-lint
- detection: the review severity vocabulary is a closed set used in four places (the command, the skill, the persona, and the plugin-eval grader regex at `evals/plugin/code-review-fires/graders/severity-labels.md`). "Important" and "Suggestion" appear **only** in the command body and in no other surface. Rule: every file that names review severities must draw from the shared set `{Critical, Required, Nit, Optional, Consider, FYI}`; flag any other capitalised severity word in a review-output instruction.
- fail: `.claude/commands/review.md` naming "Important".
- pass: the skill's own table.
- false positives: prose uses of "important" in lowercase, which the rule excludes by requiring the capitalised form inside a review-output instruction.
- effort: S
- MEASURED: this is a **live defect in the pinned tree**, not a hypothetical — 2 of the 6 labels the command names (`Important`, `Suggestion`) are used by no other surface, and the eval grader would not match them.

### one-commit-per-task-in-autonomous-build
- source: .claude/commands/build.md:35 — "Stage only the files that task touched plus its task-status update — never `git add -A` blindly — and make one commit per task so any point is a clean rollback."
- classification: heuristic-only
- target: pre-commit hook
- detection: flag a commit that stages a path the task did not touch. Needs a task→file mapping the plan does not carry, so the checkable half is narrower: flag a staged set that includes files unrelated to any file the same commit modifies in the plan's task section, or — simpler and fully mechanical — flag `git add -A` / `git add .` appearing in an autonomous build transcript.
- fail: a build transcript containing `git add -A`.
- pass: `git add src/parser.ts tasks/todo.md`.
- false positives: a task whose declared file set is incomplete.
- effort: M

### webperf-not-for-server-only-code
- source: .claude/commands/webperf.md:5 — "`/webperf` targets web applications specifically. Do not use it for utility libraries, CLIs, or server-only code with no browser-facing output."
- classification: heuristic-only
- target: md-lint (on the invocation, not the repo)
- detection: a `/webperf` run in a repo whose manifest declares no browser entry (`main`/`module`/`exports` with a DOM target, no `svelte`/`react`/`vue`/`html` dependency, no `index.html`) should warn before spending tokens.
- fail: `/webperf` in a Node CLI with no HTML output.
- pass: `/webperf` in a SvelteKit app.
- false positives: a library that ships a browser bundle without a framework dependency.
- effort: S

## .claude/commands/*.md and commands/*.toml and .gemini/commands/*.toml (parity already mechanized)
verdict: the three surfaces are held in step on `description` only; their *bodies* are allowed to
differ. `commands/build.toml:30-31` carries the same spec-path and clean-baseline text as the
Claude body, so the `spec-location-allowlist-drift` and `autonomous-build-*` rules apply to all
three surfaces and should be checked on all three.

## .github/ISSUE_TEMPLATE/skill-gap.yml  (read)
verdict: no mechanizable candidates — an issue form whose fields mirror CONTRIBUTING.md's
"Reporting Issues" section; it is the intake path, not a rule.

## plugin manifests (plugin.json, .claude-plugin/plugin.json, .codex-plugin/plugin.json, .agents/plugins/marketplace.json, .claude-plugin/marketplace.json, .opencode/skills)
verdict: no new candidates — version equality is already mechanized by `validate-versions.js`;
`.opencode/skills` is a one-line pointer to `../skills/`, which is a convention worth naming
(an alias file, not a copy) but not a lint.

## evals/README.md  (read: full)
verdict: covered by the `eval-*` candidates above. Also states the two behavioral kinds
(`execution` requires non-empty `files[]`; `dialogue` may omit it) — already enforced by
`scripts/run-evals.js`.

## docs/*-setup.md, docs/comparison.md, docs/getting-started.md, docs/agents.md, docs/developer-onboarding.md, docs/other-hosts.md, README.md
verdict: no mechanizable candidates beyond `dead-markdown-link-outside-references` and
`other-hosts-entry-has-no-decoration`. These are prose guides for users; the only enforceable
properties are link resolution and the artifact-path allowlist, both already covered.
