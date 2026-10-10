# 08 Meta Skill And Orchestration

skills/using-agent-skills and references/orchestration-patterns.

---

# batch-E5 — using-agent-skills and orchestration-patterns

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent.

## skills/using-agent-skills/SKILL.md  (192 lines read)
verdict: 8 candidates. This meta-skill is a *routing table*, which makes it the best candidate in
the corpus for a "the documentation and the directory agree" check — three separate lists of skill
names that must all resolve, and one of them must equal the `skills/` listing exactly.

### every-skill-named-in-the-discovery-tree-exists
- source: skills/using-agent-skills/SKILL.md:19 — "├── Don't know what you want yet? ──────→ interview-me" and :21 — "├── New project/feature/change? ──→ spec-driven-development" (the tree runs to :42)
- classification: mechanical
- target: md-lint
- detection: every backticked or bare kebab-case skill name in the discovery flowchart must resolve to a directory under `skills/`. Extends `intent-skill-map-references-real-skills` (batch-GOV, which covers `AGENTS.md`) to this file; the same extraction over the arrow diagram.
- fail: the tree routes UI work to `frontend-design`, which is not a skill.
- pass: the tree as written, which names 23 real skills.
- false positives: a word that looks like a skill name but is prose (`interview-me` is a skill; `user-driven` is not); restrict extraction to the diagram block and the backticked forms.
- effort: S

### quick-reference-table-matches-the-skills-directory
- source: skills/using-agent-skills/SKILL.md:168-192 — "| Phase | Skill | One-Line Summary | … | Define | interview-me | … | Ship | shipping-and-launch | Pre-launch checklist, monitoring, rollback plan |"
- classification: mechanical
- target: md-lint
- detection: set equality in both directions — every `Skill` cell in the table must exist in `skills/`, and every directory in `skills/` must appear in the table. This is the strongest form of the rule: a new skill that is not added to the routing table is invisible to the meta-skill, and a removed skill leaves a dead route.
- fail: `skills/new-skill/` exists and the table has 23 rows naming 23 other skills.
- pass: the 23 rows matching the 23 non-exempt skills.
- false positives: a skill deliberately excluded from routing (the meta-skill itself); needs an exemption list, exactly as the source repo's own `SECTION_EXEMPT_SKILLS` does in `scripts/lib/skill-lint.js`.
- effort: M

### lifecycle-sequence-names-resolve
- source: skills/using-agent-skills/SKILL.md:146 — "1.  interview-me                → Extract what the user actually wants" and :161 — "16. shipping-and-launch         → Deploy safely"
- classification: mechanical
- target: md-lint
- detection: the same resolution check over the numbered lifecycle list — 16 names, each of which must exist under `skills/`, and each of which should also appear in the Quick Reference table.
- fail: a lifecycle step naming a skill that was renamed.
- pass: the list as written.
- false positives: none; these are machine identifiers.
- effort: S

### no-deleting-code-or-comments-the-task-did-not-touch
- source: skills/using-agent-skills/SKILL.md:102 — "Remove comments you don't understand" and :103 — "\"Clean up\" code orthogonal to the task" (two further prohibitions at :104-105)
- classification: mechanical
- target: pre-push script
- detection: a diff that removes a comment the branch did not itself add, removes a function/export that no task in `tasks/plan.md` names, or changes a file unrelated to the task's declared files. The comment half is exact (a deleted comment line whose content the branch never added); the unused-code half overlaps fallow's dead-code report, but here it is *removal without approval* rather than *introduction*.
- fail: a rate-limiting PR that also deletes an unexplained comment in `utils/legacy.ts`.
- pass: a deletion named in the task's acceptance criteria.
- false positives: a legitimate cleanup task; the rule must key on the task's declared files, which `tasks/plan.md` carries.
- effort: L

### no-features-outside-the-spec
- source: skills/using-agent-skills/SKILL.md:106 — "Add features not in the spec because they \"seem useful\"" (failure mode at :128 — "Building without a spec because \"it's obvious\"")
- classification: heuristic-only
- target: pre-push script
- detection: a new route, endpoint, config flag, or exported function added by a branch whose `SPEC.md` does not mention it. Needs a text match between the added capability's name and the spec, so it is a fuzzy check — but the *route table* case is crisp: a new route path with no corresponding spec section.
- fail: a branch adding `DELETE /me` with no mention in `SPEC.md`.
- pass: the route named in the spec's Success Criteria.
- false positives: an internal helper; scope to routes, exports, and config flags.
- effort: L

### surface-assumptions-before-implementing
- source: skills/using-agent-skills/SKILL.md:51 — "Before implementing anything non-trivial, explicitly state your assumptions" (the block form at :54-58; failure mode at :120)
- classification: mechanical
- target: pre-push script (transcript check)
- detection: an agent transcript in which a non-trivial implementation (more than N files changed) begins with no `ASSUMPTIONS I'M MAKING:` block. Turn and tool-call structure is explicit in the transcript format the corpus' own eval harness already parses.
- fail: a 12-file change with no assumptions block anywhere in the transcript.
- pass: the block at :54-58 before the first edit.
- false positives: a change the user fully specified; the rule should require the "non-trivial" threshold (files changed or new modules).
- effort: M

### stop-and-name-confusion-instead-of-guessing
- source: skills/using-agent-skills/SKILL.md:67 — "**STOP.** Do not proceed with a guess." and :68 — "Name the specific confusion." (the remaining two steps are :69-70) (the BAD/GOOD pair at :72-73; failure mode at :121)
- classification: heuristic-only
- target: pre-push script (transcript check)
- detection: a transcript containing a contradiction signal (a mismatch between the spec and the code that the agent itself noted) followed by continued implementation without a question. The mechanical half is the *question-absence* check after a contradiction is detected by any other check in this catalog (spec drift, version drift, artifact-path drift).
- fail: the agent notes "the spec says X but the code does Y" and edits the code anyway.
- pass: the GOOD form at :73.
- false positives: a trivial inconsistency the agent correctly resolved; needs a severity signal.
- effort: L

### simplicity-check-before-finishing
- source: skills/using-agent-skills/SKILL.md:91 — "Can this be done in fewer lines?" and :92 — "Are these abstractions earning their complexity?" (the failure statement is at :95)
- classification: heuristic-only
- target: structure_check.py
- detection: a branch that adds a large amount of new code relative to the task's declared scope, or adds an abstraction with a single call site. The second is exactly `slop-patterns`' single-use-function measure, which the plugin's own README says was **dropped** as too noisy (`tools/oxlint/slop-patterns/README.md` — "a single-use function is mostly a route handler or a lifecycle hook"). Recorded so the catalog notes that this rule was already tried and rejected on evidence.
- fail: a 900-line branch for a two-file task.
- pass: a branch proportional to the task.
- false positives: framework scaffolding; hence the source repo's own decision to leave it out.
- effort: L (and previously rejected)

## references/orchestration-patterns.md  (370 lines read; 1-200 reviewed in detail)
verdict: 7 candidates. The file is a pattern catalogue with a governing rule, three anti-patterns,
and an explicit frontmatter allowlist for plugin agents.

### plugin-agent-frontmatter-fields-are-on-the-allowlist
- source: references/orchestration-patterns.md:166 — "The fields that DO work in plugin agents are: `name`, `description`, `tools`, `disallowedTools`, `model`, `maxTurns`, `skills`, `memory`, `background`, `effort`, `isolation`, `color`, `initialPrompt`." (the denylist at :164 — "Plugin subagents do **not** support the `hooks`, `mcpServers`, or `permissionMode` frontmatter fields — these are silently ignored.")
- classification: mechanical
- target: md-lint
- detection: every top-level key in `agents/*.md` frontmatter must be in the 13-field allowlist. This is the allowlist form of `persona-frontmatter-plugin-agent-fields` (batch-GOV), which only checks the three known-bad keys; the allowlist catches a *future* unsupported key too. Same mechanism as `SPEC_FRONTMATTER_KEYS` in the source repo's `scripts/lib/skill-lint.js`.
- fail: a persona declaring `temperature: 0.2`.
- pass: the four existing personas, whose keys are all in the list.
- false positives: a host other than Claude Code that supports more fields; the rule needs a per-host allowlist.
- effort: S

### do-not-redefine-built-in-subagents
- source: references/orchestration-patterns.md:160 — "Don't redefine these. Layer your specialist personas (code-reviewer, security-auditor, test-engineer) on top of them." (the built-in list at :154-158 — "`Explore` | Read-only codebase search and analysis … `Plan` | Read-only research during plan mode. … `general-purpose` | Multi-step tasks needing both exploration and modification.")
- classification: mechanical
- target: md-lint
- detection: no file under `agents/` may be named `explore.md`, `plan.md`, or `general-purpose.md` (case-insensitively), because those names collide with the harness's built-ins. Three-item name denylist.
- fail: `agents/plan.md`.
- pass: the four existing persona names.
- false positives: a host with different built-ins; needs a configurable list.
- effort: S

### skills-and-mcpServers-fields-are-not-portable-to-teammate-mode
- source: references/orchestration-patterns.md:139 — "the `skills` and `mcpServers` frontmatter fields in a persona are honored when it runs as a subagent but **ignored when it runs as a teammate** — teammates load skills and MCP servers from your project and user settings, the same as a regular session."
- classification: mechanical
- target: md-lint
- detection: a persona that declares `skills` (a field on the :166 allowlist) without the dependency also being configured at the session level (a project `CLAUDE.md`/settings entry naming the same skill). The rule is a cross-file presence check: a persona-level `skills:` entry with no session-level equivalent is a persona that silently loses its skill in teammate mode.
- fail: `agents/code-reviewer.md` with `skills: [code-review-and-quality]` and no session-level configuration.
- pass: the dependency configured in the session settings, or no persona-level `skills` field.
- false positives: a repo that never uses teammate mode; needs an opt-in.
- effort: M

### parallel-fan-out-happens-in-one-turn
- source: references/orchestration-patterns.md:170 — "In Claude Code, parallel fan-out (Pattern 3) requires issuing **multiple Agent tool calls in a single assistant turn**. Sequential turns serialize execution. `/ship` calls this out explicitly." (the same rule at `.claude/commands/ship.md:68` — "1. The three Phase A personas run in parallel — never sequentially.")
- classification: mechanical
- target: pre-push script (transcript check)
- detection: a `/ship` run in which the three persona invocations appear in three separate assistant turns rather than one. The transcript's turn boundaries make this exact.
- fail: three turns, each with one Agent call.
- pass: one turn with three Agent calls.
- false positives: a host without parallel tool calls, where the rule should be silent rather than demanding the impossible.
- effort: M

### slash-command-that-only-routes-should-not-exist
- source: references/orchestration-patterns.md:44 — "**Anti-signal:** if the slash command's body is mostly \"decide which persona to call,\" delete it and let the user call the persona directly." (the worked anti-pattern at docs/agents.md:79 — "## Worked example: invalid orchestration (do not build this)")
- classification: heuristic-only
- target: md-lint
- detection: a command body (`.claude/commands/*.md`, `commands/*.toml`) whose text is dominated by routing language ("which persona", "decide", "choose the right agent") and which invokes no skill and produces no artifact of its own. Needs a heuristic on the body text.
- fail: a command whose whole body is a decision tree over persona names.
- pass: `/review`, which wraps one persona with a skill (:40).
- false positives: a legitimate multi-persona command with a merge step; the distinction is whether it produces a merged artifact (Pattern 3) or only routes.
- effort: L

### fan-out-validation-checklist-before-adopting
- source: references/orchestration-patterns.md:69 — "Can I run all sub-agents at the same time without ordering issues?" (the four-question checklist runs to :72; the fallback rule is :74)
- classification: heuristic-only
- target: md-lint
- detection: a new fan-out command with no recorded answers to the four questions — a checklist-presence check on the PR body, the same shape as the rollback-plan and launch-checklist rules. The four questions are stated verbatim, so the artifact schema is defined.
- fail: a new `/audit` command fanning out to four personas with no validation section in its PR.
- pass: the four answers recorded.
- false positives: a modification to an existing fan-out command; the rule applies to new ones.
- effort: M

### personas-do-not-invoke-personas
- source: references/orchestration-patterns.md:5 — "The governing rule: **the user (or a slash command) is the orchestrator. Personas do not invoke other personas.** Skills are mandatory hops inside a persona's workflow." (platform enforcement noted at :145)
- classification: heuristic-only
- target: md-lint
- detection: the same rule as `persona-must-not-invoke-another-persona` in batch-GOV, cited here as the catalog's governing statement and with the platform-enforcement note that makes it self-enforcing on Claude Code (`:145` — "\"Subagents cannot spawn other subagents\"").
- fail: `agents/code-reviewer.md` instructing the reviewer to call `security-auditor`.
- pass: a persona invoking a skill.
- false positives: the endorsed `/ship` fan-out described in prose; the rule must allow that exact pattern.
- effort: M
