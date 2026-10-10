# Proposal: reliable enforcement from agent-skills

**Status: proposed, not implemented.** This replaces the earlier “255 adoptable now” proposal.
The goal is fewer trustworthy checks and a small number of useful new mechanisms, not a lint
rule for every sentence of guidance.

## Basis and decisions

- Source: [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills/tree/1401c8b8030e023baeebb31781a6653fe8e93026)
  at commit `1401c8b8030e023baeebb31781a6653fe8e93026`.
- Research: [candidate index](agent-skills-rule-candidates.md) and
  [area details](agent-skills-rule-candidates/). They retain the original quotes, detection
  sketches and examples; their classifications and effort estimates are not acceptance decisions.
- Current capabilities: [enforcement policy](enforcement.md), [structure checks](structure.md),
  [installation support](support.md) and [README](../README.md).
- Review corrections: audit the actual installed configuration, distinguish syntax from semantic
  evidence, consolidate duplicates, and move runtime/harness/forge requirements off the lint surface.

This document is the implementation shortlist. Candidates not explicitly selected below remain
research or guidance, not an implicit backlog. It does not claim an exhaustive new classification
of every catalog entry. New recommendations beyond the earlier proposal are marked **Added**.

### Recommended scope

| Decision | Work |
| --- | --- |
| Build first | A policy-regression guard, maintained security-scanner integrations, and a small testing set |
| Add after a pilot | Narrow security lint checks and structural skill/document validation |
| Keep opt-in and later | Logging conventions, design tokens, browser verification, contract compatibility and performance budgets |
| Reuse instead of rebuild | Installed Svelte/compiler checks, existing error/structure/type checks, established test plugins and Ruff |
| Do not build | Call-count architecture rules, aesthetic policing, test-quality ratios, or agent-transcript enforcement |

All new sets and integrations are initially opt-in. Existing installation defaults and enforcement
behavior stay unchanged. Adoption into a default requires a separate decision based on measured signal.

## 1. Acceptance policy

A recognizable pattern is not necessarily the violation described by the source. For example,
“query inside a loop” is detectable; “avoidable N+1 query” requires additional evidence.

| Disposition | Requirement | Behavior |
| --- | --- | --- |
| Blocking | Evidence establishes a narrow violation of an explicit, applicable policy | Fails on a new violation, or requires genuine approval for a policy change |
| Advisory | Evidence establishes a useful suspicious shape, but legitimate uses remain | Reports the shape and its limits; never fails an installed hook |
| Runtime verification | A configured test or measurement supplies the evidence | Gates only the behavior/routes/artifacts actually exercised |
| Review-only / external | Requires product knowledge, human judgment, forge state or agent execution control | No repository lint verdict |

The engine does not choose severity. An advisory ESLint rule must be installed at `warn`, not
`error`, and must not be turned into a gate through `--max-warnings 0`.

For every selected check:

1. Probe the real installed configuration for overlap before implementing.
2. Prefer a maintained upstream check. Write custom rules only for a demonstrated gap.
3. State supported syntax, framework/library versions, file scope and known blind spots.
4. Include failing fixtures and legitimate counterexamples, not just one happy path.
5. Attribute findings to what the branch introduced, using the tool's appropriate comparison.
   Global runtime measurements need their own declared budget/baseline, not added-line filtering.
6. Make diagnostics describe what was detected, why it matters and what to do instead.
7. Separate violations from inability to check. A required check that cannot run must not pass.
8. Preserve the installer model: copied tools/configuration, no runtime dependency on lint-kit,
   repeatable installation, and honest manual instructions for unsupported configuration shapes.

Do not introduce a general rule engine, a universal checker configuration, or a custom taint engine.
Each new mechanism should hide its own analysis behind one small command interface.

## 2. Existing mechanisms: reuse and targeted additions

### 2.1 Testing set — first release

Create a separate optional testing set, not more rules in `slop-patterns`. Current application
ESLint sets and slop rules exclude tests; the new set must explicitly include the project's test
paths, including tests outside `src/`, and wire those paths into any installed hook.

Start with one supported runner and its maintained plugin. Expand only with tested adapters.
Use type-aware linting where promise behavior needs types; the current parser setup alone does
not provide that capability. Do not install multiple engines diagnosing the same shape.

| Check / family | Exact scope | Severity | Origin |
| --- | --- | --- | --- |
| **Added: no focused tests** | Known runner APIs such as `.only`, `fit` and `fdescribe`; unrelated methods with the same names pass | Blocking | Review addition: complements [skip candidates](agent-skills-rule-candidates/04-test-quality-and-specs.md#no-skipped-or-disabled-tests) |
| Await or return asynchronous assertions | Supported async assertion APIs must be awaited or returned from the test; do not require `await` when returning is correct | Blocking where the upstream rule establishes promise handling | [Async test guidance](agent-skills-rule-candidates/05-testing-references-and-spec-driven.md) |
| Undocumented unconditional skips | Known unconditional skip APIs without a scoped quarantine; conditional platform skips, expected-failure tests and TODO cases are not all the same violation | Blocking only under the selected runner policy | [Skip candidates](agent-skills-rule-candidates/04-test-quality-and-specs.md#no-skipped-or-disabled-tests) |
| Snapshot-size signal | Newly added or enlarged snapshot artifacts above a project-selected size budget; report size, not “test quality” | Advisory; later, not required for the first release | [Snapshot candidates](agent-skills-rule-candidates/04-test-quality-and-specs.md#no-snapshot-abuse) |

A quarantine needs a reason, owner and expiry under a declared project policy. A linked issue
alone is not proof of approval. Existing quarantines need an explicit enrollment policy; do not
silently convert them all into new failures.

**Acceptance:** real-runner fixtures cover aliased imports, awaited and returned assertions,
conditional skips, quarantines, shadowed identifiers and test directories outside `src/`.
Installed hook tests prove test files are actually checked.

### 2.2 Narrow security lint — after scanner integration

Keep these in a separate optional security set, or use an equivalent maintained Semgrep rule.
Support declared library interfaces; matching a function named `verify`, `logger` or `sanitize`
is not enough. Unresolved dynamic configuration is not proof that the application is insecure.

| Family | Selected detector | Limits / severity | Origin |
| --- | --- | --- | --- |
| Insecure CORS configuration | Explicit wildcard origin plus credentials on a supported CORS interface | Blocking configuration contradiction; not proof of end-to-end CORS safety | [CORS guidance](agent-skills-rule-candidates/02-security.md#cors-no-wildcard-with-credentials) |
| Insecure JWT options | Explicitly disabled signature/expiry verification or disallowed algorithms on supported verification interfaces | Blocking explicit bypass; do not claim that an issuer check somewhere nearby establishes correct validation | [JWT checklist](agent-skills-rule-candidates/06-accessibility-and-security-checklists.md) |
| Session-cookie options | Explicit unsafe settings in a declared production session-cookie interface | Blocking against project policy; `sameSite: 'none'` can be valid with Secure and an appropriate CSRF defense | [Session cookies](agent-skills-rule-candidates/02-security.md#session-cookie-flags) |
| Response leakage | Direct stack/internal-error payloads through supported response interfaces | Start advisory; promote only shapes with unambiguous internal data and a measured pilot. Do not ban every `err.message` | [Error response guidance](agent-skills-rule-candidates/06-accessibility-and-security-checklists.md) |
| Missing cache capacity | A supported cache constructor explicitly configured without the capacity controls required by that library/project | Advisory first; TTL is not necessarily a memory bound | [Cache guidance](agent-skills-rule-candidates/07-performance-and-observability-checklists.md) |

Do not ship a fixed password-hashing cost across algorithms, hardware and applications. Use a
project-selected password policy with library-specific checks if a concrete project needs it.

### 2.3 Optional conventions — later

| Family | Scope | Behavior | Origin |
| --- | --- | --- | --- |
| Structured logging | One declared logger interface in application code; allow its supported message-plus-fields form | Blocking only as an explicit project convention. Exclude CLIs/tool scripts where prose output is intentional | [Logging guidance](agent-skills-rule-candidates/03-performance-and-observability.md) |
| Sensitive-data sinks | Consolidate logs, debug output, span attributes and other telemetry into one analysis family, with separate sink adapters | Name-based matching is advisory. Prefer maintained dataflow checks; even those do not prove complete PII protection | [Security](agent-skills-rule-candidates/02-security.md) and [observability](agent-skills-rule-candidates/03-performance-and-observability.md) |
| Design tokens | Declared token system and application paths | Opt-in convention; allow token definitions, third-party/generated code and legitimate dynamic values | [UI guidance](agent-skills-rule-candidates/15-frontend-ui-and-increments.md) |
| Test duplication exemptions | Relax production duplication policy for repetitive test setup/assertions | Configuration change, not a new rule; do not exempt production code merely because a test imports it | [DAMP over DRY](agent-skills-rule-candidates/04-test-quality-and-specs.md#damp-over-dry-in-tests) |

### 2.4 Do not duplicate installed checks

The review probed `svelteSkills.config()` through the repository's actual parser setup. Its
[`svelte/valid-compile` configuration](../tools/eslint/svelte-skills.mjs) includes compiler warnings
and already rejects the tested shapes for missing image alt text, unnamed icon-only buttons,
inaccessible non-interactive click handlers and positive `tabindex`.

Do not implement duplicate Svelte rules for those shapes. This is not a claim that every
accessibility requirement is covered. An unlabeled input probe passed; evaluate an existing
Svelte input-label rule before writing one, and use rendered-page verification for composed UI.

Likewise:

- Empty catches and swallowed errors belong to the existing error-handling family.
- New dead code, duplication, complexity and import cycles belong to the existing structure checks.
- Import/type correctness should first use the existing type checker and upstream tooling.
- Generic Python simplifications should use suitable Ruff rules, not FastAPI `FAP` codes.
- Numeric file/component length remains a review signal, not an instruction to split a module.

Overlap tests must exercise the installed configuration, not a candidate's detector in isolation.

## 3. New mechanism: policy-regression guard

**Priority: first.** This is the largest new capability justified by the corpus.
It protects the verification policy from being weakened to make a change pass.

Sources: [constraint/floor candidates](agent-skills-rule-candidates/13-constraints-floor-guard-context.md)
and [governance candidates](agent-skills-rule-candidates/01-governance-and-validators.md#constraints-guard-weakened-bar).
Despite claims in the catalog, lint-kit does not currently ship a constraints guard.

### Scope and findings

Use parsed, supported configuration adapters. Start with the threshold configurations lint-kit
already writes and explicit changes to protected checker files. Do not try to semantically
interpret arbitrary JavaScript configuration or every CI shell command in the first release.

| Change | Disposition |
| --- | --- |
| Minimum coverage/mutation score lowered | Requires policy-change approval |
| Maximum complexity/bundle size/latency raised | Requires policy-change approval |
| **Added: rule downgraded from `error` to `warn`/`off`** | Requires policy-change approval |
| **Added: ignores/exclusions widened, check removed, or new fail-open setting** | Requires approval for supported shapes; unknown changes to protected configuration require review, not a fabricated semantic verdict |
| Checker implementation, guard configuration or baseline modified | Requires policy-change approval |
| Suppression or unconditional skip added | Report with the owning lint/test check; require a scoped exception under enrolled policy, without duplicate diagnostics |
| Exception added, extended or broadened | Requires policy-change approval, even when structurally valid |
| Test deleted or assertions removed | Advisory review evidence. Account for renames/moves; cannot establish weaker behavioral coverage |
| Stub or empty catch added | Delegate to existing/narrow lint checks. Abstract methods and test fixtures are legitimate counterexamples |

**Added: each numerical constraint has an explicit direction, unit and checker identity.**

| Constraint | Direction | Weaker | Stronger |
| --- | --- | --- | --- |
| Coverage | Minimum, percent | `80 → 70` | `80 → 90` |
| Complexity | Maximum, score | `10 → 20` | `10 → 8` |
| Bundle size | Maximum, gzip bytes | `200000 → 300000` | `200000 → 150000` |

Do not infer direction from “raised/lowered” or compare arbitrary numeric Markdown cells.
Protect the actual checker configuration. If a project also has `CONSTRAINTS.md`, validate its
links to the authoritative configuration rather than create a second editable authority.
Changes to units, checker identity or measurement method are policy changes, not comparable values.
Tightening is silent; recognized loosening is explicit.

### Trust and execution contract

- Local pre-push use is feedback, not authorization. It must run for deletion-only changes too.
- Required CI runs the guard from a trusted revision against an explicitly resolved target/base,
  with trusted baseline policy. The branch under review cannot choose a friendlier base, replace
  the executing guard, or grant its own exemptions.
- The source-change diff uses the merge-base convention; the trusted policy baseline is selected
  by CI. Do not conflate the two or trust `HEAD` policy merely because it is committed.
- Approvals come from protected forge controls or a separately reviewed policy change, not from
  commit-message text or a self-authored `APPROVED-BY:` field. CI wiring and permissions must be
  protected as well; a copied hook alone cannot enforce this trust model.
- An ignore file is optional, not automatically created. Adding `**` or any broader exemption is
  itself guarded. If approval integration is absent, local use reports changes and required CI
  blocks enrolled policy changes until a maintainer resolves them through the protected process.
- Initial support: clean CI checkout and pre-push working-tree comparison, including untracked
  files within scope. No pre-commit mode until index-based analysis is implemented and tested;
  partially staged files must not be assessed as though the working tree were the staged content.
- Exit `0`: no unapproved blocking findings. Exit `1`: policy violations/unapproved changes.
  Exit `2`: check could not run. Required CI blocks on both `1` and `2`; advisory evidence may
  accompany `0`. Missing base, malformed supported configuration or tool failure is not “clean.”

### Acceptance tests

Cover both threshold directions, unchanged/tightened policy, removed keys/checks, severity
changes, enlarged ignores, malicious exemption additions, changed checker code, deletion-only
branches, renamed tests, moved assertions, legitimate type-test `@ts-expect-error`, missing bases,
untracked files and unsupported configuration changes. A CI integration test must show that
changing the branch's copy of the guard cannot bypass the trusted check.

## 4. New mechanism: maintained security-scanner integration

**Priority: first, alongside the guard.** The new work is installation, invocation, baseline
handling and failure semantics—not inventing scanner algorithms.

Sources: [security guidance](agent-skills-rule-candidates/02-security.md),
[security checklist](agent-skills-rule-candidates/06-accessibility-and-security-checklists.md) and
[constraint tools](agent-skills-rule-candidates/13-constraints-floor-guard-context.md#every-constraint-number-has-a-command).

| Integration | Selected scope | Enforcement |
| --- | --- | --- |
| Gitleaks | Newly introduced secrets in source, CI files and commits; initial/history scan separately | Block new findings; redact values in all output/artifacts |
| Semgrep | A pinned, curated rule set for applicable languages/frameworks; injection/unsafe sinks where supported | Pilot advisory, then promote individual high-signal rules. No claim of complete vulnerability detection |
| Ecosystem audit or OSV Scanner | Supported manifests/lockfiles and configured vulnerability policy | Opt-in CI gate for new findings at project-selected severity; scanner/network failure is distinct from no findings |

Tests and fixtures are included in secret scanning. Documented dummy values may have narrow
allowlists; test paths are not a blanket exemption. An inherited secret is an incident/remediation
finding, not harmless debt; the initial audit must surface it even when it is outside a branch gate.

**Added: fail-closed scanner execution.** Missing executable, invalid configuration, unsupported
required input, timeout and malformed output must be reported as check failures. Do not use
`|| true` or silently omit an opted-in required scanner. Keep command syntax/version compatibility
in integration tests rather than copying example commands as if they were stable interfaces.

Do not automatically run forced dependency remediation or disable install scripts universally.
Those are manager/version-specific project policies, with legitimate build-script requirements.
Frozen installs and lockfile consistency can use the package manager's own verification commands.
A lockfile-only diff does not prove hand editing.

**Acceptance:** new/known findings, redaction, fixture credentials, missing tools, failures,
malformed reports and repeat installation. Produce manual wiring for unsupported environments;
never report that required CI protection was installed when only a local hook was written.

## 5. New mechanism: structural skill/document validation

**Priority: pilot after the first release.** A deterministic new document surface is worthwhile;
a prose-quality judge is not.

Source: [upstream validators and governance](agent-skills-rule-candidates/01-governance-and-validators.md),
particularly the already implemented `scripts/lib/skill-lint.js` checks. “Already implemented
upstream” means useful precedent, not “already installed by lint-kit.” Preserve license/attribution
when adapting code and port relevant upstream fixtures.

### First pilot

1. Parse YAML/TOML with real parsers for one explicitly selected skill/host format.
2. Validate required identity fields, field types, naming rules and host/version-specific supported
   keys. Do not impose agent-skills' prose templates on all skill repositories.
3. Resolve literal local reference targets within the declared roots. Distinguish authored links,
   code examples, templates and intentionally generated future artifacts.
4. Where artifact locations are declared, compare producer/consumer references with that project
   declaration. Do not mandate `SPEC.md` or `tasks/todo.md` for projects using another system.
5. **Added: validate scoped exceptions** for required fields, expiry and scope. Supply the clock
   explicitly in tests; expired enrolled exceptions fail. Maximum lifetime is project-selected.

Dangling task dependency IDs and cycles are a later extension only for a declared structured
artifact schema. Do not infer dependencies or contradictory requirements from arbitrary prose.

Each adapter specifies its input format/version and reference-resolution semantics. Incompatible
or unknown host formats are reported as unsupported, not silently validated against another host.

**Acceptance:** valid/invalid frontmatter, supported vendor metadata, identity mismatch, real and
template links, generated targets, deleted reference targets and exception expiry. Deletion of a
referenced file must be caught even when the referring Markdown file itself was not edited.
Structural validity makes no claim about instruction safety, spec completeness or task quality.

## 6. Later opt-in integrations, not more AST rules

| Mechanism | Candidates to consolidate | Actual evidence and limits |
| --- | --- | --- |
| Browser verification | Accessibility audit, clean console, focus order, responsive checks, screenshot comparisons | Reuse a project's browser runner with Axe, console/uncaught-error collection and explicit keyboard/focus assertions. Configure routes, states, viewports and scoped expected warnings. Axe does not prove focus behavior or complete accessibility |
| Public-contract compatibility | Additive interfaces, breaking-change detection, semver signals | Compare declared OpenAPI/schema/export surfaces against a trusted base using existing compatibility tools. Private changes do not imply a public break; format comparison is not behavioral compatibility |
| Performance budgets | Bundle size, Web Vitals, traces, image/font priority | Measure built artifacts and declared pages with existing tools. Record units, environment and budget. Separate lab results from field percentiles; do not use universal source numbers as project budgets |
| **Added: regression-test verification** | Reproduction test, RED evidence, test fails without fix | Optional focused experiment: run a specified new test against the old implementation and the fix, or use mutation testing. Report setup/tool failures separately; unrelated failure on the base is not reproduction evidence |

Introduce these only with an adopting project and a real fixture. Reuse its test/build commands;
never invent a command from the presence of a manifest. Do not install heavyweight browser,
database or performance dependencies into every repository.

## 7. Valuable requirements outside generic lint-kit enforcement

These remain important, but the earlier detection sketches did not supply adequate evidence.

| Requirement | Where it belongs |
| --- | --- |
| Health endpoint responds; deployed environment is complete | Application/deployment smoke tests |
| Authorization on every request and tenant/object access | Application policy plus positive/negative integration tests |
| Atomic idempotency claims, payload guards and key retention | Database constraints, concurrency tests and retry-chain design |
| SSRF protection, safe redirects and upload validation | Maintained dataflow checks for known defects plus application/runtime tests; named nearby validation calls are not proof |
| Security headers on responses | Runtime HTTP assertions for declared routes/deployment configuration |
| Migration rollback, safe expand/contract and backfill throttling | Project-specific database/deployment verification; a rollback file alone proves nothing |
| Correlation IDs, trace propagation, bounded metric cardinality | Instrumentation conventions plus runtime telemetry tests; global application claims need global evidence |
| Cache consistency, key completeness and acceptable staleness | Domain design and application tests |
| Human review, required checks, no shared-branch force push | Protected forge settings/review controls, not local Git hooks |
| Credential access, destructive commands and external navigation approval | Agent/runtime permissions and sandbox controls |
| Agent question count, doubt cycles, confidence, context trimming or task ordering | Agent harness/evals, outside lint-kit |

Do not build a forge administration platform or an agent-session recorder for this proposal.
The policy guard may rely on protected forge controls, but must document that external dependency.

## 8. Rejected automation and source corrections

### Drop from the implementation roadmap

| Candidate/group | Reason |
| --- | --- |
| `no-abstraction-before-the-third-use`, `no-one-time-utility-file`, single-use-helper measures | Caller count does not measure useful depth. Lint-kit already rejected the related measure; changing one use to three does not fix it |
| AI-aesthetic defaults; mandatory skeletons instead of spinners | Product/style choices. Keep accessibility and performance requirements separately |
| `test-pyramid-ratio`, assertion-count/concept proxies, `tests-pass-on-first-run-is-a-signal` | Counts and commit layout do not establish test quality; they encourage gaming |
| `no-repeated-test-run-without-a-change` | Repetition can investigate flakiness/environmental behavior; transcripts are also outside scope |
| `mock-only-at-boundaries`, broad assertion-specificity and over-mocking scores | Paths/names/counts cannot establish the right test seam or intended behavior; retain review guidance |
| Singular cache invalidation; no caching of names such as `balance`/`permission` | TTL plus event invalidation can be valid; names do not establish consistency requirements |
| Branch-age/review-response limits, no squash merging, one dependency per change | Team workflow policies, not portable defaults |
| Universal boolean prefixes, enum casing or plural REST nouns | Optional team conventions, not defects; do not prioritize custom rules |
| Blanket no-test-changes/no-error-handler-removal during refactors; no delete-and-replace commits | Legitimate atomic changes/refactors exist. Behavioral verification is stronger than a deletion prohibition |
| Missing loading/error/empty-state names, “one connection pool per process” by call count, N+1 by loop shape | Cross-module/runtime ownership is not established by these proxies |
| General prose judges: good comments, complete ADRs, accurate specs, meaningful review rationale | Structural checks can validate fields/links, not truth or sufficiency |

A detector such as “database call inside a loop” may later earn a narrowly named advisory check
for a specific ORM. It is not selected now and must not be advertised as proving “N+1.”

### Correct the interpretation before implementation

- **Idempotency:** a UUID generated once per operation is valid. The defect is generating a new
  key inside each retry attempt, not using random UUIDs in general.
- **Accessibility:** WCAG 2.2 AA's [target-size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
  is 24 CSS pixels with exceptions, not a universal 44px minimum. Its
  [large-text contrast definition](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
  distinguishes 18pt regular and 14pt bold; it is not simply “18px+.” Apply current standards and
  rendered measurements, not literal adoption of incorrect source prose.
- **bfcache:** do not ban security-required `Cache-Control: no-store`;
  [Chrome supports some such pages in bfcache](https://developer.chrome.com/docs/web-platform/bfcache-ccns).
- **Security claims:** a function called `sanitize` or `assertAllowedHost` is not evidence that
  data is safe. Validation must apply to the actual value, sink and runtime behavior.
- **Citation quality:** the earlier timing-safe-comparison entry quoted “grep the staged diff.”
  That does not substantiate the rule. Verify derivation, not only quotation location, before
  accepting a source-backed check. Recommendations added here are identified as such.

The candidate catalog remains unchanged research. In particular, its “mechanical” labels,
aggregate counts, constraints-guard availability claim and attribution of rejected helper
measures must not be copied into implementation documentation as verified facts.

## 9. Rollout and release criteria

The [implementation roadmap](agent-skills-implementation-roadmap.md) turns this scope into
one-PR issues with explicit stack parents and cross-stack dependencies. Track execution in
[GitHub issue #39](https://github.com/shayshahal/lint-kit/issues/39): foundation first, then
three independent first-release stacks. Later issues are gated pilots, not release commitments.

| Phase | Deliverable | Exit criterion |
| --- | --- | --- |
| 0: overlap and pilot | Real-config overlap tests; choose one adopting repository and supported formats/runners | Every first-release check has precise scope, counterexamples and an owner; no duplicate diagnostic |
| 1: first release | Guard MVP, Gitleaks integration, testing set with focus/async/skip checks | Installed-tool tests pass; trusted CI cannot be bypassed by branch changes; execution failures cannot report clean |
| 2: targeted expansion | Curated Semgrep/dependency scanning, selected narrow security rules, skill/document pilot | Real-project findings reviewed; only sufficiently reliable shapes promoted to blocking |
| 3: project-driven options | Logging/design conventions, browser/contract/performance integrations; optional regression experiment | An adopting project supplies configuration and reproducible fixtures; no broad automatic installation |

Do not implement every phase as one change. Phase 1 is the initial commitment; later phases
require a successful pilot and separate scope decisions. Guard CI trust wiring is required before
claiming enforcement; an initial local-only version must be described as feedback.

For every shipped set/integration:

- Unit fixtures cover positive findings, legitimate counterexamples and tool/configuration errors.
- End-to-end tests run the actual installed command, including fresh/repeat/upgrade installs,
  project-relative paths, monorepos and supported Windows/POSIX environments.
- Baseline and deletion-only behavior are tested where applicable; diagnostics retain stable
  rule IDs and useful locations without leaking secrets.
- Upstream versions/configuration compatibility are recorded. Unsupported shapes are left alone
  with a concrete manual action, following the existing support policy.
- Colocated docs, installer docs, support docs and enforcement policy describe only what shipped.
  New rule docs use the existing rule-section/test conventions.
- A pilot records reviewed findings, false positives and runtime cost. A blocker must demonstrate
  that its documented legitimate counterexamples pass; importance alone is not confidence.

**Success:** a branch cannot silently weaken enrolled verification, new focused/incorrectly
handled async tests and newly introduced secrets are caught, and checks never mistake missing
evidence for a clean verdict. Everything else stays opt-in, advisory or outside lint-kit until
its detector earns stronger claims.
