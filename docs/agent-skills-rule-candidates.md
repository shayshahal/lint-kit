# Rule candidates from `addyosmani/agent-skills`

A catalog of every piece of guidance in [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills)
that can be mechanized as a lint rule or a rule, mapped onto the enforcement surfaces this
repository already installs.

- **Source:** `https://github.com/addyosmani/agent-skills` at commit
  **`1401c8b8030e023baeebb31781a6653fe8e93026`** (`git clone --depth 1`, read on 2026-10-09).
- **Corpus:** 210 tracked files, of which **118 are reviewable**. Excluded: 10 `*-test.*` files
  (the source repo's own regression suites, which are its fixtures rather than its guidance) and 82
  files under `evals/{cases,fixtures,plugin}/` (the eval corpus — planted-bug fixtures, trigger
  cases, grader prompts).
- **Candidates:** 458 total — **357 mechanically enforceable**, 100 enforceable only with a heuristic.
- **Method:** every file was read, and every candidate carries a verbatim quote with a file path and
  line number. All **701 citations were machine-verified** against the pinned clone: each path
  exists, each line number is in range, and each quoted string appears on exactly the lines cited.
  The verifier is reproducible; the run reports 0 failures and 0 off-by-one citations.
- **Nothing is asserted without a citation.** Where the source contradicts itself, the catalog says
  so rather than picking a side (see "Contradictions found in the source" below).

## How to read this

The **index below lists every candidate** with its classification and its source file. The full
detail for each candidate — the exact quote, the target surface, a detection sketch, a failing and a
passing example, the false-positive risk, and an effort estimate — lives in
[`agent-skills-rule-candidates/`](agent-skills-rule-candidates/), one file per area.

A candidate is **mechanical** when a rule can decide it from source text, a diff, git metadata, CI
config, or a file's structure. It is **heuristic-only** when the decision needs a judgement a rule
can approximate but not make — those are worth reporting and not worth failing a build on.

## Coverage

Every reviewable file in the source repo is accounted for below. Nothing was skipped: the
reconciliation started from `git ls-files` and the table is the whole set.

| source file | area | candidates in that area |
| --- | --- | ---: |
| `.agents/plugins/marketplace.json` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude-plugin/marketplace.json` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude-plugin/plugin.json` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude/commands/build.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude/commands/code-simplify.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude/commands/constraints.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude/commands/plan.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude/commands/review.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude/commands/ship.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude/commands/spec.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude/commands/test.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude/commands/webperf.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.claude/rules/skills-contributing.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.codex-plugin/plugin.json` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gemini/commands/build.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gemini/commands/code-simplify.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gemini/commands/constraints.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gemini/commands/planning.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gemini/commands/review.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gemini/commands/ship.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gemini/commands/spec.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gemini/commands/test.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gemini/commands/webperf.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gitattributes` | [17-remaining-files](agent-skills-rule-candidates/17-remaining-files.md) | — |
| `.github/ISSUE_TEMPLATE/skill-gap.yml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.github/workflows/test-plugin-install.yml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `.gitignore` | [17-remaining-files](agent-skills-rule-candidates/17-remaining-files.md) | — |
| `.opencode/skills` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `AGENTS.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `CLAUDE.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `CONTRIBUTING.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `LICENSE` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `README.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `agents/code-reviewer.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `agents/security-auditor.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `agents/test-engineer.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `agents/web-performance-auditor.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `commands/build.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `commands/code-simplify.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `commands/constraints.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `commands/planning.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `commands/review.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `commands/ship.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `commands/spec.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `commands/test.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `commands/webperf.toml` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/adoption-guide.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/advanced-per-agent-configuration.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/agents.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/antigravity-setup.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/codex-setup.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/commandcode-setup.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/comparison.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/copilot-cli-setup.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/copilot-setup.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/cursor-setup.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/developer-onboarding.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/gemini-cli-setup.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/getting-started.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/opencode-setup.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/other-hosts.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/skill-anatomy.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `docs/windsurf-setup.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `evals/README.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `evals/skill-impact.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `hooks/SDD-CACHE.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `hooks/SIMPLIFY-IGNORE.md` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `hooks/sdd-cache-post.sh` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `hooks/sdd-cache-pre.sh` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `hooks/session-start.sh` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `hooks/simplify-ignore.sh` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `plugin.json` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `references/accessibility-checklist.md` | [06-accessibility-and-security-checklists](agent-skills-rule-candidates/06-accessibility-and-security-checklists.md) | — |
| `references/definition-of-done.md` | [05-testing-references-and-spec-driven](agent-skills-rule-candidates/05-testing-references-and-spec-driven.md) | — |
| `references/observability-checklist.md` | [07-performance-and-observability-checklists](agent-skills-rule-candidates/07-performance-and-observability-checklists.md) | — |
| `references/orchestration-patterns.md` | [08-meta-skill-and-orchestration](agent-skills-rule-candidates/08-meta-skill-and-orchestration.md) | — |
| `references/performance-checklist.md` | [07-performance-and-observability-checklists](agent-skills-rule-candidates/07-performance-and-observability-checklists.md) | — |
| `references/security-checklist.md` | [06-accessibility-and-security-checklists](agent-skills-rule-candidates/06-accessibility-and-security-checklists.md) | — |
| `references/testing-patterns.md` | [05-testing-references-and-spec-driven](agent-skills-rule-candidates/05-testing-references-and-spec-driven.md) | — |
| `scripts/lib/skill-lint.js` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `scripts/run-evals.js` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `scripts/validate-artifact-paths.js` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `scripts/validate-commands.js` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `scripts/validate-reference-links.js` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `scripts/validate-skills.js` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `scripts/validate-versions.js` | [01-governance-and-validators](agent-skills-rule-candidates/01-governance-and-validators.md) | — |
| `skills/api-and-interface-design/SKILL.md` | [09-code-simplification-and-api-design](agent-skills-rule-candidates/09-code-simplification-and-api-design.md) | — |
| `skills/browser-testing-with-devtools/SKILL.md` | [10-browser-testing-and-ci](agent-skills-rule-candidates/10-browser-testing-and-ci.md) | — |
| `skills/ci-cd-and-automation/SKILL.md` | [10-browser-testing-and-ci](agent-skills-rule-candidates/10-browser-testing-and-ci.md) | — |
| `skills/code-review-and-quality/SKILL.md` | [11-code-review](agent-skills-rule-candidates/11-code-review.md) | — |
| `skills/code-simplification/SKILL.md` | [09-code-simplification-and-api-design](agent-skills-rule-candidates/09-code-simplification-and-api-design.md) | — |
| `skills/constraint-driven-development/SKILL.md` | [13-constraints-floor-guard-context](agent-skills-rule-candidates/13-constraints-floor-guard-context.md) | — |
| `skills/constraint-driven-development/references/floor-guard.md` | [13-constraints-floor-guard-context](agent-skills-rule-candidates/13-constraints-floor-guard-context.md) | — |
| `skills/context-engineering/SKILL.md` | [13-constraints-floor-guard-context](agent-skills-rule-candidates/13-constraints-floor-guard-context.md) | — |
| `skills/debugging-and-error-recovery/SKILL.md` | [12-docs-deprecation-debugging](agent-skills-rule-candidates/12-docs-deprecation-debugging.md) | — |
| `skills/deprecation-and-migration/SKILL.md` | [12-docs-deprecation-debugging](agent-skills-rule-candidates/12-docs-deprecation-debugging.md) | — |
| `skills/documentation-and-adrs/SKILL.md` | [12-docs-deprecation-debugging](agent-skills-rule-candidates/12-docs-deprecation-debugging.md) | — |
| `skills/doubt-driven-development/SKILL.md` | [16-doubt-interview-ideation](agent-skills-rule-candidates/16-doubt-interview-ideation.md) | — |
| `skills/frontend-ui-engineering/SKILL.md` | [15-frontend-ui-and-increments](agent-skills-rule-candidates/15-frontend-ui-and-increments.md) | — |
| `skills/git-workflow-and-versioning/SKILL.md` | [14-git-workflow](agent-skills-rule-candidates/14-git-workflow.md) | — |
| `skills/idea-refine/SKILL.md` | [16-doubt-interview-ideation](agent-skills-rule-candidates/16-doubt-interview-ideation.md) | — |
| `skills/idea-refine/examples.md` | [16-doubt-interview-ideation](agent-skills-rule-candidates/16-doubt-interview-ideation.md) | — |
| `skills/idea-refine/frameworks.md` | [16-doubt-interview-ideation](agent-skills-rule-candidates/16-doubt-interview-ideation.md) | — |
| `skills/idea-refine/refinement-criteria.md` | [16-doubt-interview-ideation](agent-skills-rule-candidates/16-doubt-interview-ideation.md) | — |
| `skills/idea-refine/scripts/idea-refine.sh` | [16-doubt-interview-ideation](agent-skills-rule-candidates/16-doubt-interview-ideation.md) | — |
| `skills/incremental-implementation/SKILL.md` | [15-frontend-ui-and-increments](agent-skills-rule-candidates/15-frontend-ui-and-increments.md) | — |
| `skills/interview-me/SKILL.md` | [16-doubt-interview-ideation](agent-skills-rule-candidates/16-doubt-interview-ideation.md) | — |
| `skills/observability-and-instrumentation/SKILL.md` | [03-performance-and-observability](agent-skills-rule-candidates/03-performance-and-observability.md) | — |
| `skills/performance-optimization/SKILL.md` | [03-performance-and-observability](agent-skills-rule-candidates/03-performance-and-observability.md) | — |
| `skills/performance-optimization/references/optimization-patterns.md` | [03-performance-and-observability](agent-skills-rule-candidates/03-performance-and-observability.md) | — |
| `skills/planning-and-task-breakdown/SKILL.md` | [03-performance-and-observability](agent-skills-rule-candidates/03-performance-and-observability.md) | — |
| `skills/security-and-hardening/SKILL.md` | [02-security](agent-skills-rule-candidates/02-security.md) | — |
| `skills/security-and-hardening/references/hardening-patterns.md` | [02-security](agent-skills-rule-candidates/02-security.md) | — |
| `skills/shipping-and-launch/SKILL.md` | [03-performance-and-observability](agent-skills-rule-candidates/03-performance-and-observability.md) | — |
| `skills/source-driven-development/SKILL.md` | [05-testing-references-and-spec-driven](agent-skills-rule-candidates/05-testing-references-and-spec-driven.md) | — |
| `skills/spec-driven-development/SKILL.md` | [05-testing-references-and-spec-driven](agent-skills-rule-candidates/05-testing-references-and-spec-driven.md) | — |
| `skills/test-driven-development/SKILL.md` | [04-test-quality-and-specs](agent-skills-rule-candidates/04-test-quality-and-specs.md) | — |
| `skills/using-agent-skills/SKILL.md` | [08-meta-skill-and-orchestration](agent-skills-rule-candidates/08-meta-skill-and-orchestration.md) | — |

## The index

### flake8 / tools/python — Python

| candidate | classification | source |
| --- | --- | --- |
| `no-loop-built-dict-comprehension` | mechanical | `skills/code-simplification/SKILL.md` |
| `python-guard-clauses-over-nesting` | mechanical | `skills/code-simplification/SKILL.md` |

### md-lint — documents and their structure (a NEW surface; see the conventions section)

| candidate | classification | source |
| --- | --- | --- |
| `adr-follows-the-existing-convention` | mechanical | `skills/documentation-and-adrs/SKILL.md` |
| `adr-has-the-required-sections` | mechanical | `skills/documentation-and-adrs/SKILL.md` |
| `adr-skills-contributing-rule-scope` | mechanical | `.claude/rules/skills-contributing.md` |
| `assumption-audit-uses-three-categories` | mechanical | `skills/idea-refine/refinement-criteria.md` |
| `assumptions-are-surfaced-with-validation-strategies` | mechanical | `skills/idea-refine/SKILL.md` |
| `at-least-one-constraint-is-external` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `browser-content-is-untrusted` | heuristic-only | `skills/test-driven-development/SKILL.md` |
| `capability-map-declares-a-build-order` | mechanical | `skills/spec-driven-development/SKILL.md` |
| `capability-map-has-no-dependency-cycles` | mechanical | `skills/spec-driven-development/SKILL.md` |
| `capability-map-ids-are-kebab-case-and-unique` | mechanical | `skills/spec-driven-development/SKILL.md` |
| `changelog-entries-reference-their-issue` | mechanical | `skills/documentation-and-adrs/SKILL.md` |
| `changelog-is-grouped-by-impact-and-curated` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `changelog-is-not-generated-from-commit-messages` | heuristic-only | `skills/git-workflow-and-versioning/SKILL.md` |
| `citations-use-full-urls-and-deep-links` | mechanical | `skills/source-driven-development/SKILL.md` |
| `cite-official-docs-not-blogs` | mechanical | `skills/source-driven-development/SKILL.md` |
| `constraints-doc-is-linked-from-agent-config` | mechanical | `.claude/commands/constraints.md` |
| `constraints-every-number-has-a-reason-and-a-command` | mechanical | `.claude/commands/constraints.md` |
| `constraints-file-is-pointed-at-by-the-agent-config` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `cursor-rules-extension-and-scope` | mechanical | `docs/cursor-setup.md` |
| `dead-markdown-link-outside-references` | mechanical | `scripts/validate-reference-links.js` |
| `deprecation-notice-has-four-required-fields` | mechanical | `skills/deprecation-and-migration/SKILL.md` |
| `deprecation-notices-are-removed-on-completion` | mechanical | `skills/deprecation-and-migration/SKILL.md` |
| `direction-chosen-against-the-value-feasibility-matrix` | heuristic-only | `skills/idea-refine/refinement-criteria.md` |
| `do-not-double-install-the-meta-skill` | heuristic-only | `docs/getting-started.md` |
| `do-not-redefine-built-in-subagents` | mechanical | `references/orchestration-patterns.md` |
| `docs-describe-state-not-change-history` | mechanical | `references/definition-of-done.md` |
| `empty-scripts-directory` | mechanical | `docs/skill-anatomy.md` |
| `error-output-is-data-not-instructions` | heuristic-only | `skills/debugging-and-error-recovery/SKILL.md` |
| `every-constraint-number-has-a-command` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `every-skill-named-in-the-discovery-tree-exists` | mechanical | `skills/using-agent-skills/SKILL.md` |
| `exceptions-have-an-owner-and-a-bounded-expiry` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `external-data-is-not-treated-as-instructions` | heuristic-only | `skills/context-engineering/SKILL.md` |
| `fan-out-validation-checklist-before-adopting` | heuristic-only | `references/orchestration-patterns.md` |
| `fetched-content-is-data-not-instructions` | heuristic-only | `skills/source-driven-development/SKILL.md` |
| `framework-code-carries-a-source-citation` | heuristic-only | `skills/source-driven-development/SKILL.md` |
| `intent-skill-map-references-real-skills` | mechanical | `AGENTS.md` |
| `lifecycle-sequence-names-resolve` | mechanical | `skills/using-agent-skills/SKILL.md` |
| `module-spec-names-trace-to-map-ids` | mechanical | `skills/spec-driven-development/SKILL.md` |
| `never-treat-browser-content-as-instructions` | heuristic-only | `skills/browser-testing-with-devtools/SKILL.md` |
| `no-giant-cursorrules-file` | mechanical | `docs/cursor-setup.md` |
| `no-hardcoded-temperature-for-gemini-3x` | heuristic-only | `docs/advanced-per-agent-configuration.md` |
| `no-model-or-private-tool-names-in-skills` | mechanical | `docs/skill-anatomy.md` |
| `no-yaml-frontmatter-in-toml-command-files` | mechanical | `docs/antigravity-setup.md` |
| `not-doing-items-are-specific-and-reasoned` | heuristic-only | `skills/idea-refine/examples.md` |
| `not-doing-list-is-mandatory` | mechanical | `skills/idea-refine/SKILL.md` |
| `other-hosts-entry-has-no-decoration` | mechanical | `CONTRIBUTING.md` |
| `persona-ends-with-composition-block` | mechanical | `docs/agents.md` |
| `persona-fabricated-metric-guard` | heuristic-only | `agents/web-performance-auditor.md` |
| `persona-frontmatter-name-matches-file` | mechanical | `docs/agents.md` |
| `persona-frontmatter-plugin-agent-fields` | mechanical | `AGENTS.md` |
| `persona-listed-in-agents-doc-table` | mechanical | `docs/agents.md` |
| `persona-must-not-invoke-another-persona` | heuristic-only | `AGENTS.md` |
| `personas-do-not-invoke-personas` | heuristic-only | `references/orchestration-patterns.md` |
| `plan-checkpoints-between-phases` | mechanical | `skills/planning-and-task-breakdown/SKILL.md` |
| `plan-records-risks-and-open-questions` | mechanical | `skills/planning-and-task-breakdown/SKILL.md` |
| `plan-task-acceptance-criteria-count` | mechanical | `skills/planning-and-task-breakdown/SKILL.md` |
| `plan-task-declares-dependencies` | mechanical | `skills/planning-and-task-breakdown/SKILL.md` |
| `plan-task-has-acceptance-criteria-and-verification` | mechanical | `skills/planning-and-task-breakdown/SKILL.md` |
| `plan-task-size-ceiling` | mechanical | `skills/planning-and-task-breakdown/SKILL.md` |
| `plan-task-title-has-no-and` | mechanical | `skills/planning-and-task-breakdown/SKILL.md` |
| `plugin-agent-frontmatter-fields-are-on-the-allowlist` | mechanical | `references/orchestration-patterns.md` |
| `post-launch-verification-steps` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `quick-reference-table-matches-the-skills-directory` | mechanical | `skills/using-agent-skills/SKILL.md` |
| `readme-covers-quick-start-commands-and-architecture` | mechanical | `skills/documentation-and-adrs/SKILL.md` |
| `reference-material-location-conflict` | mechanical | `CONTRIBUTING.md` |
| `rejection-ledger-row-for-rejected-skill-change` | heuristic-only | `CONTRIBUTING.md` |
| `reverted-optimizations-are-recorded` | mechanical | `skills/performance-optimization/SKILL.md` |
| `review-severity-vocabulary-is-closed` | mechanical | `.claude/commands/review.md` |
| `rules-file-exists-and-covers-four-areas` | mechanical | `skills/context-engineering/SKILL.md` |
| `setup-guides-must-not-tell-users-to-copy-agents-md` | heuristic-only | `docs/developer-onboarding.md` |
| `skill-description-must-not-summarize-the-workflow` | heuristic-only | `docs/skill-anatomy.md` |
| `skill-description-third-person-opener` | heuristic-only | `docs/skill-anatomy.md` |
| `skill-file-vs-supporting-file-threshold` | mechanical | `CLAUDE.md` |
| `skill-md-file-references-one-level-deep` | heuristic-only | `docs/skill-anatomy.md` |
| `skill-script-bash-shebang` | mechanical | `docs/skill-anatomy.md` |
| `skill-script-cleanup-trap` | mechanical | `docs/skill-anatomy.md` |
| `skill-script-fail-fast` | mechanical | `docs/skill-anatomy.md` |
| `skill-script-json-to-stdout` | heuristic-only | `docs/skill-anatomy.md` |
| `skill-script-repo-relative-path-reference` | mechanical | `docs/skill-anatomy.md` |
| `skill-script-status-on-stderr` | heuristic-only | `docs/skill-anatomy.md` |
| `skill-supporting-file-only-when-long` | mechanical | `docs/skill-anatomy.md` |
| `skills-and-mcpServers-fields-are-not-portable-to-teammate-mode` | mechanical | `references/orchestration-patterns.md` |
| `slash-command-that-only-routes-should-not-exist` | heuristic-only | `references/orchestration-patterns.md` |
| `spec-boundaries-are-three-tiered` | mechanical | `skills/spec-driven-development/SKILL.md` |
| `spec-covers-all-six-core-areas` | mechanical | `skills/spec-driven-development/SKILL.md` |
| `spec-has-testable-success-criteria` | heuristic-only | `skills/spec-driven-development/SKILL.md` |
| `spec-location-allowlist-drift` | mechanical | `.claude/commands/build.md` |
| `staged-rollout-has-numeric-thresholds` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `supporting-file-naming-for-script-helpers` | mechanical | `docs/skill-anatomy.md` |
| `unverified-patterns-are-explicitly-flagged` | heuristic-only | `skills/source-driven-development/SKILL.md` |
| `variations-span-more-than-one-framework` | heuristic-only | `skills/idea-refine/frameworks.md` |
| `variations-state-the-lens-that-generated-them` | mechanical | `skills/idea-refine/examples.md` |
| `vendor-field-belongs-under-metadata` | mechanical | `docs/advanced-per-agent-configuration.md` |
| `webperf-not-for-server-only-code` | heuristic-only | `.claude/commands/webperf.md` |

### other

| candidate | classification | source |
| --- | --- | --- |
| `host-guide-in-readme-requires-a-maintainer-run` | not | `CONTRIBUTING.md` |

### oxlint:slop-patterns — the AST plugin in tools/oxlint/slop-patterns

| candidate | classification | source |
| --- | --- | --- |
| `always-await-async-tests` | mechanical | `references/testing-patterns.md` |
| `assertions-are-specific` | mechanical | `references/testing-patterns.md` |
| `boolean-fields-use-is-has-can-prefix` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `cache-declares-staleness-and-invalidation` | mechanical | `skills/performance-optimization/SKILL.md` |
| `cache-eviction-and-ceiling-are-set` | mechanical | `references/performance-checklist.md` |
| `cache-invalidation-strategy-is-singular` | mechanical | `skills/performance-optimization/references/optimization-patterns.md` |
| `cache-key-covers-every-input` | heuristic-only | `skills/performance-optimization/SKILL.md` |
| `cache-layer-chosen-deliberately` | heuristic-only | `skills/performance-optimization/references/optimization-patterns.md` |
| `comments-explain-why-not-what` | heuristic-only | `skills/documentation-and-adrs/SKILL.md` |
| `correlation-id-on-every-log-line` | mechanical | `skills/observability-and-instrumentation/SKILL.md` |
| `cors-declares-methods-and-headers` | mechanical | `references/security-checklist.md` |
| `cors-no-wildcard-with-credentials` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `destructive-path-guard` | heuristic-only | `skills/security-and-hardening/SKILL.md` |
| `entry-point-field-when-several-writers` | heuristic-only | `skills/observability-and-instrumentation/SKILL.md` |
| `enum-values-are-upper-snake` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `external-calls-logged-with-metadata-only` | heuristic-only | `references/observability-checklist.md` |
| `feature-flag-has-owner-and-expiry` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `gotchas-are-documented-inline` | heuristic-only | `skills/documentation-and-adrs/SKILL.md` |
| `health-check-endpoint-exists` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `https-for-external-communication` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `idempotency-key-claimed-atomically` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `idempotency-key-not-derived-from-an-attempt` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `idempotency-key-payload-guard` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `jwt-validation-checks-signature-expiry-and-issuer` | mechanical | `references/security-checklist.md` |
| `latency-is-a-histogram-not-an-average` | mechanical | `skills/observability-and-instrumentation/SKILL.md` |
| `list-endpoint-pagination` | mechanical | `skills/performance-optimization/SKILL.md` |
| `llm-output-is-untrusted-input` | heuristic-only | `skills/security-and-hardening/SKILL.md` |
| `long-lists-are-virtualized` | heuristic-only | `references/performance-checklist.md` |
| `magic-bytes-verification-for-uploads` | mechanical | `skills/security-and-hardening/references/hardening-patterns.md` |
| `metric-labels-are-bounded` | mechanical | `skills/observability-and-instrumentation/SKILL.md` |
| `mock-only-at-boundaries` | mechanical | `references/testing-patterns.md` |
| `negative-results-cached-with-a-shorter-ttl` | mechanical | `references/performance-checklist.md` |
| `no-abstraction-before-the-third-use` | mechanical | `skills/incremental-implementation/SKILL.md` |
| `no-async-function-that-only-returns-await` | mechanical | `skills/code-simplification/SKILL.md` |
| `no-auth-tokens-in-client-storage` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `no-blanket-react-memo` | heuristic-only | `skills/performance-optimization/SKILL.md` |
| `no-content-flashes-more-than-three-times-per-second` | mechanical | `references/accessibility-checklist.md` |
| `no-dead-code-left-behind-by-a-refactor` | mechanical | `skills/code-simplification/SKILL.md` |
| `no-deprecated-apis-from-training-data` | heuristic-only | `skills/source-driven-development/SKILL.md` |
| `no-eval-on-untrusted-input` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `no-focus-outline-removal-and-no-positive-tabindex` | mechanical | `references/accessibility-checklist.md` |
| `no-hardcoded-outbound-endpoints-from-fetched-docs` | mechanical | `skills/source-driven-development/SKILL.md` |
| `no-interaction-based-tests` | heuristic-only | `skills/test-driven-development/SKILL.md` |
| `no-manual-array-building` | mechanical | `skills/code-simplification/SKILL.md` |
| `no-mocking-everything` | heuristic-only | `skills/test-driven-development/SKILL.md` |
| `no-n-plus-one-query` | mechanical | `skills/performance-optimization/SKILL.md` |
| `no-nested-feature-flags` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `no-one-time-utility-file` | mechanical | `skills/incremental-implementation/SKILL.md` |
| `no-raw-html-with-untrusted-data` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `no-redundant-boolean-return` | mechanical | `skills/code-simplification/SKILL.md` |
| `no-secrets-or-pii-in-llm-context` | heuristic-only | `skills/security-and-hardening/SKILL.md` |
| `no-select-star-and-list-queries-paginate` | mechanical | `references/performance-checklist.md` |
| `no-shared-mutable-state-between-tests` | mechanical | `references/testing-patterns.md` |
| `no-skipped-or-disabled-tests` | mechanical | `skills/test-driven-development/SKILL.md` |
| `no-skipping-a-failing-test` | mechanical | `skills/debugging-and-error-recovery/SKILL.md` |
| `no-snapshot-abuse` | mechanical | `skills/test-driven-development/SKILL.md` |
| `no-snapshot-everything` | mechanical | `references/testing-patterns.md` |
| `no-sql-string-concatenation` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `no-verbose-conditional-assignment` | mechanical | `skills/code-simplification/SKILL.md` |
| `nothing-cached-whose-staleness-is-a-correctness-bug` | mechanical | `skills/performance-optimization/references/optimization-patterns.md` |
| `one-assertion-per-concept` | heuristic-only | `skills/test-driven-development/SKILL.md` |
| `one-connection-pool-per-process` | mechanical | `references/performance-checklist.md` |
| `otel-context-propagated-across-async-boundaries` | heuristic-only | `skills/observability-and-instrumentation/SKILL.md` |
| `otel-initialized-before-other-imports` | mechanical | `references/observability-checklist.md` |
| `password-hashing-cost-floor` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `password-reset-token-ttl-and-single-use` | mechanical | `references/security-checklist.md` |
| `presumptive-blockers-are-surfaced` | heuristic-only | `skills/code-review-and-quality/SKILL.md` |
| `public-api-has-parameter-and-return-documentation` | mechanical | `skills/documentation-and-adrs/SKILL.md` |
| `query-by-role-not-test-id` | heuristic-only | `references/testing-patterns.md` |
| `query-params-and-response-fields-are-camel-case` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `rate-limit-auth-endpoints` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `rest-paths-use-plural-nouns-with-no-verbs` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `safe-defaults-are-opt-in` | mechanical | `skills/incremental-implementation/SKILL.md` |
| `session-cookie-flags` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `simplify-ignore-annotations-on-dedicated-lines` | mechanical | `hooks/SIMPLIFY-IGNORE.md` |
| `simplify-ignore-block-must-carry-a-reason` | mechanical | `hooks/simplify-ignore.sh` |
| `simplify-ignore-block-requires-a-reason (restated)` | mechanical | `hooks/SIMPLIFY-IGNORE.md` |
| `single-error-response-shape` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `ssrf-allowlist-on-user-supplied-urls` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `status-codes-follow-the-stated-mapping` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `status-codes-grouped-by-class-in-labels` | mechanical | `references/observability-checklist.md` |
| `strip-sensitive-fields-before-response` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `test-name-follows-the-unit-behavior-condition-pattern` | heuristic-only | `references/testing-patterns.md` |
| `third-party-responses-are-validated-before-use` | heuristic-only | `skills/api-and-interface-design/SKILL.md` |
| `timing-safe-comparison-for-secrets` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `trace-context-propagated-in-w3c-format` | mechanical | `references/observability-checklist.md` |
| `unbounded-fetch-is-the-named-bad-form` | mechanical | `skills/performance-optimization/references/optimization-patterns.md` |
| `upload-allowlist-and-size-cap` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `urls-validated-before-redirect` | mechanical | `references/security-checklist.md` |
| `use-button-for-actions-and-a-for-navigation` | mechanical | `references/accessibility-checklist.md` |
| `validation-only-at-boundaries` | heuristic-only | `skills/api-and-interface-design/SKILL.md` |
| `validation-uses-allowlists-and-constrains-length-and-range` | mechanical | `references/security-checklist.md` |

### pre-push / CI / hooks — diffs, git metadata, config, file presence

| candidate | classification | source |
| --- | --- | --- |
| `accessibility-audit-runs-in-ci` | mechanical | `references/accessibility-checklist.md` |
| `accessibility-tree-and-focus-order-checked` | mechanical | `skills/browser-testing-with-devtools/SKILL.md` |
| `adr-exists-for-significant-decisions` | heuristic-only | `skills/documentation-and-adrs/SKILL.md` |
| `alert-has-threshold-duration-runbook-and-two-severities` | mechanical | `skills/observability-and-instrumentation/SKILL.md` |
| `alerts-are-symptom-based` | heuristic-only | `skills/observability-and-instrumentation/SKILL.md` |
| `all-eight-quality-gates-present` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `api-keys-and-tool-permissions-are-scoped` | heuristic-only | `references/security-checklist.md` |
| `ask-first-database-schema-and-dependencies` | mechanical | `docs/copilot-setup.md` |
| `autonomous-build-requires-a-clean-baseline` | mechanical | `.claude/commands/build.md` |
| `autonomous-build-requires-a-spec-at-a-known-path` | mechanical | `.claude/commands/build.md` |
| `backfills-are-throttled` | heuristic-only | `skills/deprecation-and-migration/SKILL.md` |
| `bfcache-is-not-blocked` | mechanical | `references/performance-checklist.md` |
| `both-feature-flag-states-tested` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `branch-is-short-lived` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `branch-name-follows-the-prefix-convention` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `browser-verification-is-evidenced` | heuristic-only | `skills/browser-testing-with-devtools/SKILL.md` |
| `bug-fix-has-a-reproduction-test` | mechanical | `skills/test-driven-development/SKILL.md` |
| `bundle-size-budget-enforced-in-ci` | mechanical | `skills/performance-optimization/SKILL.md` |
| `cache-entries-require-a-validator` | mechanical | `hooks/SDD-CACHE.md` |
| `change-description-explains-why` | heuristic-only | `skills/code-review-and-quality/SKILL.md` |
| `change-size-thresholds` | mechanical | `skills/code-review-and-quality/SKILL.md` |
| `change-summary-is-provided` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `changelog-entry-written-in-the-same-change` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `changes-scoped-to-the-task` | heuristic-only | `references/definition-of-done.md` |
| `ci-failures-block-merge` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `ci-has-no-production-secrets` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `ci-runs-on-every-pr-and-main-push` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `clean-console-standard-is-a-gate` | mechanical | `skills/browser-testing-with-devtools/SKILL.md` |
| `commit-body-explains-why` | heuristic-only | `skills/git-workflow-and-versioning/SKILL.md` |
| `commit-does-one-logical-thing` | heuristic-only | `skills/git-workflow-and-versioning/SKILL.md` |
| `commit-subject-is-imperative-and-standalone` | mechanical | `skills/code-review-and-quality/SKILL.md` |
| `commit-subject-uses-a-conventional-type-prefix` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `component-files-are-colocated` | mechanical | `skills/frontend-ui-engineering/SKILL.md` |
| `composite-index-column-order` | mechanical | `references/performance-checklist.md` |
| `connection-pool-sized-not-raised` | heuristic-only | `skills/performance-optimization/SKILL.md` |
| `console-clean-standard` | mechanical | `skills/test-driven-development/SKILL.md` |
| `constraint-defaults-and-thresholds` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `constraints-guard-weakened-bar` | mechanical | `.claude/commands/constraints.md` |
| `constraints-trial-run-clean-on-the-current-branch` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `core-web-vitals-thresholds` | mechanical | `references/performance-checklist.md` |
| `dashboards-have-a-sane-default-range` | mechanical | `references/observability-checklist.md` |
| `dead-code-identified-before-deletion` | mechanical | `skills/code-review-and-quality/SKILL.md` |
| `default-to-the-isolated-browser-profile` | mechanical | `skills/browser-testing-with-devtools/SKILL.md` |
| `dependency-scripts-blocked-by-default` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `dependency-updates-are-automated` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `dependency-upgrade-reviews-the-changelog` | heuristic-only | `skills/code-review-and-quality/SKILL.md` |
| `dependency-versions-in-docs-match-the-manifest` | mechanical | `skills/source-driven-development/SKILL.md` |
| `deploy-env-vars-declared` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `destructive-schema-step-ships-alone` | mechanical | `skills/deprecation-and-migration/SKILL.md` |
| `end-to-end-verification-commands-are-run` | mechanical | `skills/debugging-and-error-recovery/SKILL.md` |
| `env-example-and-gitignore-for-secrets` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `env-file-conventions` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `error-budget-gate` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `eval-negative-trigger-declares-owner` | mechanical | `evals/README.md` |
| `eval-rank1-floor-must-not-be-lowered` | mechanical | `evals/README.md` |
| `every-commit-leaves-the-tree-green` | mechanical | `skills/incremental-implementation/SKILL.md` |
| `every-pr-passes-lint-typecheck-tests-build` | mechanical | `docs/copilot-setup.md` |
| `expression-index-for-function-queries` | mechanical | `references/performance-checklist.md` |
| `external-spec-system-is-not-duplicated` | mechanical | `skills/spec-driven-development/SKILL.md` |
| `fix-addresses-the-root-cause-not-the-symptom` | heuristic-only | `skills/debugging-and-error-recovery/SKILL.md` |
| `flaky-tests-are-fixed-not-rerun` | heuristic-only | `skills/ci-cd-and-automation/SKILL.md` |
| `floor-guard-detects-the-five-step-6-moves` | mechanical | `skills/constraint-driven-development/references/floor-guard.md` |
| `floor-guard-exit-codes-are-0-1-2` | mechanical | `skills/constraint-driven-development/references/floor-guard.md` |
| `floor-guard-honours-a-constraintsignore-file` | mechanical | `skills/constraint-driven-development/references/floor-guard.md` |
| `floor-guard-never-prints-the-matched-secret` | mechanical | `skills/constraint-driven-development/references/floor-guard.md` |
| `floor-guard-only-reports-moves-that-lower-the-bar` | mechanical | `skills/constraint-driven-development/references/floor-guard.md` |
| `floor-guard-reads-the-merge-base-diff-including-untracked` | mechanical | `skills/constraint-driven-development/references/floor-guard.md` |
| `floor-no-new-suppression-comments` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `floor-no-skipped-or-deleted-tests-without-a-reason` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `floor-no-unimplemented-stubs` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `floor-not-weakened-to-make-a-change-pass` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `fonts-are-limited-and-woff2` | mechanical | `references/performance-checklist.md` |
| `frozen-install-command-per-manager` | mechanical | `references/security-checklist.md` |
| `gitignore-covers-standard-exclusions` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `html-lang-and-descriptive-title` | mechanical | `references/accessibility-checklist.md` |
| `human-review-before-merge` | mechanical | `references/definition-of-done.md` |
| `idempotency-key-retention-outlives-the-retry-path` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `imports-resolve-to-real-modules` | mechanical | `skills/context-engineering/SKILL.md` |
| `incomplete-features-ship-behind-a-flag` | heuristic-only | `skills/incremental-implementation/SKILL.md` |
| `increment-checklist-commands-are-run` | mechanical | `skills/incremental-implementation/SKILL.md` |
| `index-change-justified-by-a-plan` | heuristic-only | `skills/performance-optimization/SKILL.md` |
| `install-script-policy-matches-the-pinned-manager-version` | mechanical | `references/security-checklist.md` |
| `instrumentation-added-for-a-bug-is-removed` | mechanical | `skills/debugging-and-error-recovery/SKILL.md` |
| `line-endings-are-pinned` | mechanical | `—` |
| `lockfile-is-never-hand-edited` | mechanical | `skills/code-review-and-quality/SKILL.md` |
| `lockfile-is-never-rewritten-by-ci` | mechanical | `references/security-checklist.md` |
| `log-output-is-spot-checked-for-structured-fields` | mechanical | `references/observability-checklist.md` |
| `long-tasks-are-broken-up` | heuristic-only | `references/performance-checklist.md` |
| `migration-has-a-tested-down-path` | mechanical | `skills/deprecation-and-migration/SKILL.md` |
| `migrations-have-a-rollback` | mechanical | `skills/incremental-implementation/SKILL.md` |
| `never-overwrite-an-incomplete-plan` | mechanical | `.claude/commands/plan.md` |
| `never-remove-a-failing-test` | mechanical | `docs/copilot-setup.md` |
| `no-agent-proposed-threshold-relaxation` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `no-batched-simplifications-in-one-commit` | mechanical | `skills/code-simplification/SKILL.md` |
| `no-build-artifacts-or-env-files-committed` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `no-commented-out-code` | mechanical | `skills/documentation-and-adrs/SKILL.md` |
| `no-competing-lockfiles` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `no-console-log-debugging-in-production` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `no-credential-access-through-js-execution` | mechanical | `skills/browser-testing-with-devtools/SKILL.md` |
| `no-css-in-js-runtime-cost-in-production` | mechanical | `references/performance-checklist.md` |
| `no-dead-code-debug-output-or-commented-blocks` | mechanical | `references/definition-of-done.md` |
| `no-delete-and-replace-in-one-commit` | mechanical | `skills/incremental-implementation/SKILL.md` |
| `no-deleting-code-or-comments-the-task-did-not-touch` | mechanical | `skills/using-agent-skills/SKILL.md` |
| `no-error-handling-removed-by-a-simplification` | mechanical | `skills/code-simplification/SKILL.md` |
| `no-external-requests-from-js-execution` | mechanical | `skills/browser-testing-with-devtools/SKILL.md` |
| `no-features-outside-the-spec` | heuristic-only | `skills/using-agent-skills/SKILL.md` |
| `no-force-push-to-a-shared-branch` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `no-forced-dependency-remediation` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `no-gate-is-disabled-or-skipped` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `no-large-change-without-a-test-run` | mechanical | `skills/incremental-implementation/SKILL.md` |
| `no-new-features-on-a-deprecated-system` | mechanical | `skills/deprecation-and-migration/SKILL.md` |
| `no-references-to-a-removed-system-remain` | mechanical | `skills/deprecation-and-migration/SKILL.md` |
| `no-render-blocking-javascript-or-css` | mechanical | `references/performance-checklist.md` |
| `no-repeated-test-run-without-a-change` | mechanical | `skills/test-driven-development/SKILL.md` |
| `no-scope-expansion-mid-increment` | heuristic-only | `skills/incremental-implementation/SKILL.md` |
| `no-secrets-in-ci-config` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `no-secrets-in-code-or-version-control` | mechanical | `docs/copilot-setup.md` |
| `no-secrets-in-source-or-history` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `no-squash-everything-later` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `no-stale-todo-comments` | mechanical | `skills/documentation-and-adrs/SKILL.md` |
| `no-todo-comments-at-launch` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `no-unrelated-changes-while-debugging` | mechanical | `skills/debugging-and-error-recovery/SKILL.md` |
| `no-unscoped-refactor-in-a-feature-commit` | mechanical | `skills/code-simplification/SKILL.md` |
| `no-vague-commit-subject` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `noticed-but-not-touching-is-recorded` | mechanical | `skills/incremental-implementation/SKILL.md` |
| `one-commit-per-task-in-autonomous-build` | heuristic-only | `.claude/commands/build.md` |
| `one-dependency-per-change` | mechanical | `skills/code-review-and-quality/SKILL.md` |
| `optimization-must-be-attributable` | heuristic-only | `skills/performance-optimization/SKILL.md` |
| `parallel-fan-out-happens-in-one-turn` | mechanical | `references/orchestration-patterns.md` |
| `path-filters-skip-irrelevant-jobs` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `perf-win-must-not-weaken-tests` | mechanical | `skills/performance-optimization/SKILL.md` |
| `performance-claims-are-backed-by-a-trace` | mechanical | `skills/browser-testing-with-devtools/SKILL.md` |
| `personal-data-retention-and-deletion-path` | heuristic-only | `skills/security-and-hardening/SKILL.md` |
| `pii-encrypted-at-rest-and-backups-encrypted` | mechanical | `references/security-checklist.md` |
| `pipeline-under-ten-minutes` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `plan-does-not-overwrite-an-incomplete-plan` | mechanical | `skills/planning-and-task-breakdown/SKILL.md` |
| `pre-commit-hygiene-is-automated` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `public-interface-changes-are-additive-and-optional` | mechanical | `skills/api-and-interface-design/SKILL.md` |
| `query-plan-captured-before-and-after` | mechanical | `references/performance-checklist.md` |
| `queue-depth-and-processing-duration-tracked` | mechanical | `references/observability-checklist.md` |
| `ratchet-compares-against-the-recorded-value` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `refactoring-and-feature-are-separate-changes` | mechanical | `skills/code-review-and-quality/SKILL.md` |
| `registry-signatures-verified` | mechanical | `references/security-checklist.md` |
| `regression-test-fails-without-the-fix` | mechanical | `skills/debugging-and-error-recovery/SKILL.md` |
| `release-is-tagged-and-version-derives-from-the-tag` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `removal-only-after-zero-active-usage` | mechanical | `skills/deprecation-and-migration/SKILL.md` |
| `responsive-breakpoints-are-tested` | mechanical | `skills/frontend-ui-engineering/SKILL.md` |
| `review-response-within-one-business-day` | mechanical | `skills/code-review-and-quality/SKILL.md` |
| `rollback-mechanism-exists` | mechanical | `skills/ci-cd-and-automation/SKILL.md` |
| `rollback-path-for-risky-changes` | mechanical | `references/definition-of-done.md` |
| `rollback-plan-present-and-complete` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `rule-of-500-on-a-refactor` | mechanical | `skills/code-simplification/SKILL.md` |
| `rules-files-are-current-and-accurate` | heuristic-only | `skills/documentation-and-adrs/SKILL.md` |
| `run-tests-before-commits` | mechanical | `docs/copilot-setup.md` |
| `runbook-exists-for-every-alert` | mechanical | `skills/observability-and-instrumentation/SKILL.md` |
| `runtime-verified-not-just-compiled` | heuristic-only | `references/definition-of-done.md` |
| `schema-changes-expand-then-contract` | mechanical | `skills/deprecation-and-migration/SKILL.md` |
| `screenshot-comparison-for-visual-changes` | mechanical | `skills/browser-testing-with-devtools/SKILL.md` |
| `security-headers-are-the-stated-set` | mechanical | `references/security-checklist.md` |
| `security-headers-on-every-response` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `semver-bump-matches-the-change` | mechanical | `skills/git-workflow-and-versioning/SKILL.md` |
| `session-start-hook-envelope` | mechanical | `hooks/session-start.sh` |
| `severity-labels-on-every-review-comment` | mechanical | `skills/code-review-and-quality/SKILL.md` |
| `ship-fanout-skip-predicate` | mechanical | `.claude/commands/ship.md` |
| `simplification-must-not-modify-tests` | mechanical | `skills/code-simplification/SKILL.md` |
| `slow-checks-are-not-in-the-edit-loop` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `spec-is-committed-and-saved-in-the-repo` | mechanical | `skills/spec-driven-development/SKILL.md` |
| `spec-is-referenced-from-the-pr` | mechanical | `skills/spec-driven-development/SKILL.md` |
| `spec-turn-ends-before-planning-or-code` | mechanical | `skills/spec-driven-development/SKILL.md` |
| `spec-updated-when-scope-or-decisions-change` | heuristic-only | `skills/spec-driven-development/SKILL.md` |
| `stop-and-name-confusion-instead-of-guessing` | heuristic-only | `skills/using-agent-skills/SKILL.md` |
| `surface-assumptions-before-implementing` | mechanical | `skills/using-agent-skills/SKILL.md` |
| `task-list-target-is-not-duplicated` | mechanical | `skills/planning-and-task-breakdown/SKILL.md` |
| `test-file-location-follows-convention` | mechanical | `skills/test-driven-development/SKILL.md` |
| `test-pyramid-ratio` | mechanical | `skills/test-driven-development/SKILL.md` |
| `test-sizes-respect-the-resource-model` | mechanical | `skills/test-driven-development/SKILL.md` |
| `tests-pass-on-first-run-is-a-signal` | mechanical | `skills/test-driven-development/SKILL.md` |
| `text-and-component-contrast-ratios` | mechanical | `references/accessibility-checklist.md` |
| `third-party-scripts-are-async-or-facaded` | mechanical | `references/performance-checklist.md` |
| `translations-are-not-accepted` | heuristic-only | `CONTRIBUTING.md` |
| `unused-and-duplicate-indexes-are-dropped` | mechanical | `references/performance-checklist.md` |
| `use-the-repositorys-own-test-command` | mechanical | `skills/test-driven-development/SKILL.md` |
| `verification-story-is-documented` | mechanical | `skills/code-review-and-quality/SKILL.md` |
| `wcag-contrast-threshold` | mechanical | `skills/shipping-and-launch/SKILL.md` |
| `zombie-code-gets-an-owner-or-removal` | mechanical | `skills/deprecation-and-migration/SKILL.md` |

### structure_check.py and jscpd — duplication and complexity against a merge-base

| candidate | classification | source |
| --- | --- | --- |
| `damp-over-dry-in-tests` | mechanical | `skills/test-driven-development/SKILL.md` |
| `file-size-boundary-with-decomposition` | mechanical | `skills/code-review-and-quality/SKILL.md` |
| `never-mix-formatting-with-behavior` | mechanical | `docs/copilot-setup.md` |
| `no-duplicated-business-logic` | mechanical | `references/definition-of-done.md` |
| `no-duplicated-content-between-skills` | mechanical | `docs/skill-anatomy.md` |
| `no-reimplementing-an-existing-utility` | mechanical | `skills/context-engineering/SKILL.md` |
| `no-skill-body-duplicated-into-rules-files` | mechanical | `docs/cursor-setup.md` |
| `no-speculative-abstraction` | mechanical | `skills/code-simplification/SKILL.md` |
| `simplicity-check-before-finishing` | heuristic-only | `skills/using-agent-skills/SKILL.md` |

### the ESLint sets in tools/eslint

| candidate | classification | source |
| --- | --- | --- |
| `animations-use-compositor-friendly-properties` | mechanical | `references/performance-checklist.md` |
| `authorization-checked-per-request` | heuristic-only | `skills/security-and-hardening/SKILL.md` |
| `autocomplete-attributes-on-known-fields` | mechanical | `references/accessibility-checklist.md` |
| `avoid-the-ai-aesthetic-defaults` | mechanical | `skills/frontend-ui-engineering/SKILL.md` |
| `color-is-not-the-only-signal` | heuristic-only | `references/accessibility-checklist.md` |
| `color-tokens-not-raw-hex` | mechanical | `skills/frontend-ui-engineering/SKILL.md` |
| `component-line-ceiling` | mechanical | `skills/frontend-ui-engineering/SKILL.md` |
| `composition-over-configuration` | heuristic-only | `skills/frontend-ui-engineering/SKILL.md` |
| `data-fetching-separated-from-presentation` | heuristic-only | `skills/frontend-ui-engineering/SKILL.md` |
| `dialog-manages-focus` | mechanical | `skills/frontend-ui-engineering/SKILL.md` |
| `dynamic-content-uses-a-live-region` | heuristic-only | `references/accessibility-checklist.md` |
| `empty-error-and-loading-states-are-handled` | mechanical | `skills/frontend-ui-engineering/SKILL.md` |
| `error-response-exposes-no-internals` | mechanical | `references/security-checklist.md` |
| `font-display-and-preload-for-lcp-fonts` | mechanical | `references/performance-checklist.md` |
| `form-error-messages-are-associated-with-their-field` | mechanical | `references/accessibility-checklist.md` |
| `form-input-has-an-associated-label` | mechanical | `references/accessibility-checklist.md` |
| `generic-error-bodies` | mechanical | `skills/security-and-hardening/SKILL.md` |
| `icon-only-controls-have-an-accessible-name` | mechanical | `references/accessibility-checklist.md` |
| `images-declare-dimensions-and-priority` | mechanical | `skills/performance-optimization/SKILL.md` |
| `images-have-modern-formats-and-responsive-sizes` | mechanical | `references/performance-checklist.md` |
| `img-has-alt-text` | mechanical | `references/accessibility-checklist.md` |
| `lcp-image-is-prioritised-and-not-lazy` | mechanical | `references/performance-checklist.md` |
| `loading-uses-skeletons-with-aria-busy` | mechanical | `skills/frontend-ui-engineering/SKILL.md` |
| `no-inline-styles-or-arbitrary-values` | mechanical | `skills/frontend-ui-engineering/SKILL.md` |
| `no-secrets-or-pii-as-span-attributes` | heuristic-only | `references/observability-checklist.md` |
| `no-secrets-or-pii-in-logs` | heuristic-only | `skills/observability-and-instrumentation/SKILL.md` |
| `no-sensitive-data-in-debug-logging` | heuristic-only | `skills/debugging-and-error-recovery/SKILL.md` |
| `no-sensitive-data-in-logs` | heuristic-only | `skills/security-and-hardening/SKILL.md` |
| `no-string-interpolated-log-lines` | mechanical | `skills/observability-and-instrumentation/SKILL.md` |
| `no-unstructured-console-log` | mechanical | `skills/observability-and-instrumentation/SKILL.md` |
| `no-verbose-conditional-rendering` | heuristic-only | `skills/code-simplification/SKILL.md` |
| `one-h1-and-no-skipped-heading-levels` | mechanical | `references/accessibility-checklist.md` |
| `optimistic-update-rolls-back-on-error` | mechanical | `skills/frontend-ui-engineering/SKILL.md` |
| `pii-out-of-telemetry` | heuristic-only | `skills/security-and-hardening/SKILL.md` |
| `prop-drilling-is-flagged-not-refactored` | heuristic-only | `skills/code-simplification/SKILL.md` |
| `security-events-are-logged-without-secrets` | heuristic-only | `references/security-checklist.md` |
| `table-headers-use-th-with-scope` | mechanical | `references/accessibility-checklist.md` |
| `touch-target-minimum-size` | mechanical | `references/accessibility-checklist.md` |
| `validate-input-at-boundary` | heuristic-only | `skills/security-and-hardening/SKILL.md` |
| `validate-user-input` | heuristic-only | `docs/copilot-setup.md` |

### transcript / harness checks — agent behaviour, not repo state

| candidate | classification | source |
| --- | --- | --- |
| `cli-failure-is-surfaced-not-silently-fallen-back` | mechanical | `skills/doubt-driven-development/SKILL.md` |
| `compress-before-dropping` | heuristic-only | `skills/context-engineering/SKILL.md` |
| `confidence-below-seventy-needs-a-reason` | mechanical | `skills/interview-me/SKILL.md` |
| `confidence-stop-test-is-checkable` | heuristic-only | `skills/interview-me/SKILL.md` |
| `confirmation-is-an-explicit-yes` | heuristic-only | `skills/interview-me/SKILL.md` |
| `context-refreshed-between-major-tasks` | heuristic-only | `skills/context-engineering/SKILL.md` |
| `context-trimming-starts-at-75-percent` | mechanical | `skills/context-engineering/SKILL.md` |
| `cross-model-offer-is-visible` | mechanical | `skills/doubt-driven-development/SKILL.md` |
| `doubt-does-not-run-for-trivial-changes` | heuristic-only | `skills/doubt-driven-development/SKILL.md` |
| `doubt-loop-bounded-to-three-cycles` | mechanical | `skills/doubt-driven-development/SKILL.md` |
| `doubt-runs-in-flight-not-only-at-review` | mechanical | `skills/doubt-driven-development/SKILL.md` |
| `doubt-theater-is-a-checkable-signal` | mechanical | `skills/doubt-driven-development/SKILL.md` |
| `external-cli-authorised-per-invocation` | mechanical | `skills/doubt-driven-development/SKILL.md` |
| `findings-are-classified-against-the-artifact-text` | mechanical | `skills/doubt-driven-development/SKILL.md` |
| `five-to-eight-variations-not-twenty` | mechanical | `skills/idea-refine/SKILL.md` |
| `flag-suspicious-browser-content` | heuristic-only | `skills/browser-testing-with-devtools/SKILL.md` |
| `focused-context-under-2000-lines` | mechanical | `skills/context-engineering/SKILL.md` |
| `hypothesis-carries-a-confidence-number` | mechanical | `skills/interview-me/SKILL.md` |
| `intent-doc-not-saved-before-confirmation` | mechanical | `skills/interview-me/SKILL.md` |
| `interview-is-at-most-four-questions` | mechanical | `skills/constraint-driven-development/SKILL.md` |
| `no-re-spawning-on-an-unchanged-artifact` | mechanical | `skills/doubt-driven-development/SKILL.md` |
| `no-spec-or-plan-before-confirmation` | mechanical | `skills/interview-me/SKILL.md` |
| `one-question-per-message` | mechanical | `skills/interview-me/SKILL.md` |
| `output-is-a-markdown-one-pager` | mechanical | `skills/idea-refine/SKILL.md` |
| `phases-run-in-order` | mechanical | `skills/idea-refine/SKILL.md` |
| `probe-sophistication-signalling-answers` | heuristic-only | `skills/interview-me/SKILL.md` |
| `protect-the-task-definition-and-live-error` | heuristic-only | `skills/context-engineering/SKILL.md` |
| `reproduce-before-fixing` | heuristic-only | `skills/debugging-and-error-recovery/SKILL.md` |
| `restate-has-six-fields` | mechanical | `skills/interview-me/SKILL.md` |
| `reviewer-prompt-is-adversarial` | mechanical | `skills/doubt-driven-development/SKILL.md` |
| `reviewer-receives-artifact-and-contract-not-the-claim` | mechanical | `skills/doubt-driven-development/SKILL.md` |
| `stop-the-turn-after-confirmation` | mechanical | `skills/interview-me/SKILL.md` |
| `target-user-is-named` | mechanical | `skills/idea-refine/SKILL.md` |
| `task-critical-content-is-positioned-last` | heuristic-only | `skills/context-engineering/SKILL.md` |
| `user-confirmed-the-direction-before-implementation` | mechanical | `skills/idea-refine/SKILL.md` |


## Contradictions found in the source

Four places where the pinned tree disagrees with itself. Each is recorded rather than resolved,
because resolving it is a maintainer decision, not a lint decision.

1. **Review severity vocabulary.** `.claude/commands/review.md:15` names
   *Critical, Important, or Suggestion*; `skills/code-review-and-quality/SKILL.md:185-189`,
   `agents/code-reviewer.md:51-57` and the plugin-eval grader regex
   (`evals/plugin/code-review-fires/graders/severity-labels.md`) all use
   *Critical, Required, Nit, Optional, Consider, FYI*. Two of the six words the command names are
   used nowhere else, and the grader would not match them.
2. **Where a skill's own references live.** `CONTRIBUTING.md:63` says "Don't put reference material
   inside skill directories — use `references/` instead", while `docs/skill-anatomy.md:178` blesses
   `skills/<name>/references/` for self-contained skills, and the tree contains five such
   directories. A rule either way would fail today's tree.
3. **Spec artifact locations.** `.claude/commands/build.md:31` (and both TOML surfaces) accept a
   spec at `spec/*`; `scripts/validate-artifact-paths.js:36-37`'s `ARTIFACT_ALLOWLIST` omits it.
   The validator was written to catch producer/consumer drift in the other direction.
4. **Enum casing.** `skills/api-and-interface-design/SKILL.md:154` requires `UPPER_SNAKE` enum
   values (`"IN_PROGRESS"`), while the same file's own query example at `:257` uses
   `status=in_progress` and its discriminated-union example at `:277` uses `type: 'in_progress'`.
   The rule needs to know which surface it governs (wire values vs internal tags) before it can be
   applied.

## Rules the source itself tried and rejected

One candidate in this catalog is not new work: the single-use-function measure. The source repo's
own `tools/oxlint/slop-patterns/README.md` records that of the three SlopCodeBench measures it
started from, *only one survived being run over a real repository* — a single-use function is mostly
a framework route handler or a lifecycle hook, and a single-method class is mostly a middleware or
an exception, so both "report far more framework idiom than slop". `skills/incremental-implementation/SKILL.md:232`
states the same rule from the other side ("Building abstractions before the third use case demands
it"). Recorded so the catalog does not propose re-adding a rule that was already removed on
evidence.

## Implementation conventions in this repository

So that a candidate's `target` field names a real API rather than an approximation.

### oxlint plugin — `tools/oxlint/slop-patterns/`

- `index.ts` registers rules with `eslintCompatPlugin({ meta: { name: "slop-patterns" }, rules: { "<kebab-name>": <rule> } })`.
- A rule lives in `rules/<kebab-name>.ts` and is built with `defineRule` from `@oxlint/plugins`:
  `meta: { type, docs: { description }, messages: { <messageId>: "…" } }`, then `create(context)`
  returning visitor keys (`ArrowFunctionExpression`, `FunctionDeclaration`, …). Reporting is
  `context.report({ node, messageId, data })`.
- Path-based exclusions live in `paths.ts` as exported regexes (`TEST_FILE`) and are applied at the
  top of `create` by returning `{}`.
- Fixtures: `fixtures/<kebab-name>/invalid-<shape>.ts`, `fixtures/<kebab-name>/valid-<shape>.ts`, and
  a `README.md` stating the expected count with a copy-pasteable `oxlint --config` invocation. A node
  test in `test/slop-patterns.test.js` covers the path-based exclusions the fixtures cannot.
- The plugin directory has no dependencies of its own (`package.json` is only `{"type":"module"}`),
  so `@oxlint/plugins` resolves from the host repository.

### ESLint sets — `tools/eslint/`

- One file per set: `<set>.mjs` plus a colocated `<set>.md`. Sets today: `svelte-skills`,
  `tailwind-patterns`, `error-handling`, `prose`, `untranslated-text`.
- Each set exports `DEFAULT_FILES`, `DEFAULT_IGNORES`, `config({ files, ignores, inspection, rules })`
  returning flat-config entries with every rule at `error`, and a `plugin` object. `defineRule` and
  `settings` come from `./inspection.mjs`; `inspection` narrows every rule to the lines the branch
  added (default `'branch'`).
- `test/docs.test.js` enforces the docs contract: every rule's `meta.docs.url` must be a `file:` URL
  inside the repo whose `#<rule-name>` fragment matches an `^## <rule-name>$` heading in the
  colocated `.md`. A new rule without its docs section fails `pnpm test`.
- Rules are exercised with ESLint's `RuleTester` in `test/<set>.test.js`.

### Python — `tools/python/`

- `tools/python/structure_check.py` is the merge-base comparison tool (complexity, duplication,
  import cycles, dead code); `python/tests/test_structure.py` is its suite. A candidate needing
  "the branch made it worse, not the whole repo" semantics reuses this shape.

### What has no surface yet

`md-lint` and the transcript/harness checks are **new surfaces**. 87 candidates target document
structure and 37 target agent behaviour; nothing in this repository implements either today. They
are listed with that target named explicitly rather than dropped, per the no-silent-narrowing rule,
and they are the largest single body of unimplemented work in the catalog.

## Validation commands

- `pnpm test` → `node --test "test/*.test.js"`
- `pnpm typecheck` → `tsc -p tsconfig.tools.json`
