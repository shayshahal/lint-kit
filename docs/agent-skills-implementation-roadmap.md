# Agent-skills implementation roadmap

Tracking issue: [#39](https://github.com/shayshahal/lint-kit/issues/39). Based on the approved
[revised proposal](agent-skills-lint-rule-proposals.md), not the full candidate inventory.

**Status:** issues created; no implementation PRs started. There are 23 scoped work issues
plus the tracking issue. Phase 0 and the first-release stacks are the initial commitment;
the 12 later issues are gated pilots, not promises to implement every candidate.

## Stack rules

- Each work issue targets one focused PR, including its own tests and matching docs.
- Foundation [#40](https://github.com/shayshahal/lint-kit/issues/40) lands first and freezes the runner, policy formats, tool versions
  and authorized adopting repository. Missing selections are explicit blockers, not agent guesses.
- Stack roots branch from `main` after prerequisites land. Successors target the preceding
  feature branch while it is unmerged, so each review shows only that issue's diff.
- Merge bottom-up, then retarget/rebase descendants onto `main`. A cross-stack prerequisite
  must be merged or explicitly present in the dependent branch's ancestry.
- Each slice must remain independently testable. Partial installation is not advertised as
  finished enforcement. Local policy-guard hooks provide feedback, not trusted authorization.
- Later pilots require first-release evidence and their named adopter/support decisions before
  coding. If existing tools leave no worthwhile gap, record evidence instead of manufacturing code.
- No capability is enabled by default, no consumer is enrolled without permission, and no
  release/tagging or implementation work is authorized merely by issue creation.

## First-release dependency map

```text
Foundation #40
  |
  +-- Policy guard:    #41 -> #42 -> #43 -> #44
  +-- Secret scanning: #45 -> #46
  +-- Testing:         #47 -> #48 -> #49
                       (#49 also depends on #42 landing)

All three tails -> release gate #50
Release evidence -> explicitly selected phase 2/3 pilots
```

This is three independent PR stacks, not one long branch containing unrelated features.
The release gate branches from `main` once all three tails have landed.

## Foundation and first release

| Issue | Slice | PR parent | Other prerequisites |
| --- | --- | --- | --- |
| [#40](https://github.com/shayshahal/lint-kit/issues/40) | Freeze the first-release support matrix and overlap fixtures | `main` | None |
| [#41](https://github.com/shayshahal/lint-kit/issues/41) | Add branch snapshot comparison and a fail-closed command | `main` | [#40](https://github.com/shayshahal/lint-kit/issues/40) |
| [#42](https://github.com/shayshahal/lint-kit/issues/42) | Detect directional threshold and configuration weakening | [#41](https://github.com/shayshahal/lint-kit/issues/41) | None |
| [#43](https://github.com/shayshahal/lint-kit/issues/43) | Install opt-in local pre-push feedback | [#42](https://github.com/shayshahal/lint-kit/issues/42) | None |
| [#44](https://github.com/shayshahal/lint-kit/issues/44) | Enforce policy changes from trusted CI | [#43](https://github.com/shayshahal/lint-kit/issues/43) | None |
| [#45](https://github.com/shayshahal/lint-kit/issues/45) | Add a pinned, redacted, fail-closed Gitleaks command | `main` | [#40](https://github.com/shayshahal/lint-kit/issues/40) |
| [#46](https://github.com/shayshahal/lint-kit/issues/46) | Install opt-in Gitleaks checks and audit guidance | [#45](https://github.com/shayshahal/lint-kit/issues/45) | None |
| [#47](https://github.com/shayshahal/lint-kit/issues/47) | Install a runner-specific test set with no-focused-tests | `main` | [#40](https://github.com/shayshahal/lint-kit/issues/40) |
| [#48](https://github.com/shayshahal/lint-kit/issues/48) | Enforce awaited or returned asynchronous assertions | [#47](https://github.com/shayshahal/lint-kit/issues/47) | None |
| [#49](https://github.com/shayshahal/lint-kit/issues/49) | Guard unconditional skips with scoped quarantine lifecycle | [#48](https://github.com/shayshahal/lint-kit/issues/48) | [#42](https://github.com/shayshahal/lint-kit/issues/42) |
| [#50](https://github.com/shayshahal/lint-kit/issues/50) | Verify and document the first-release stacks end to end | `main` | [#44](https://github.com/shayshahal/lint-kit/issues/44), [#46](https://github.com/shayshahal/lint-kit/issues/46), [#49](https://github.com/shayshahal/lint-kit/issues/49) |

The issues contain the exact scope, non-goals, supported-input decisions and acceptance tests.
Do not implement sibling work just because it appears in the same proposal section.
In particular, trusted CI enforcement is a separate guard PR; the local-hook PR alone must not
claim that modifying the branch's checker or exemptions cannot bypass enforcement.

## Phase 2: gated expansion

| Issue | Pilot | PR parent | Prerequisites |
| --- | --- | --- | --- |
| [#51](https://github.com/shayshahal/lint-kit/issues/51) | Integrate one curated, pinned Semgrep rule set | `main` | [#50](https://github.com/shayshahal/lint-kit/issues/50) |
| [#52](https://github.com/shayshahal/lint-kit/issues/52) | Integrate one ecosystem audit or OSV scan | `main` | [#50](https://github.com/shayshahal/lint-kit/issues/50) |
| [#53](https://github.com/shayshahal/lint-kit/issues/53) | Ship one evidence-backed library-specific detector | `main` | [#51](https://github.com/shayshahal/lint-kit/issues/51) |
| [#54](https://github.com/shayshahal/lint-kit/issues/54) | Validate one declared skill frontmatter format | `main` | [#50](https://github.com/shayshahal/lint-kit/issues/50) |
| [#55](https://github.com/shayshahal/lint-kit/issues/55) | Validate local references and declared artifact/exception links | [#54](https://github.com/shayshahal/lint-kit/issues/54) | Parent PR |

The security-lint pilot selects exactly one supported library/interface and detector after the
Semgrep overlap results. It does not authorize all five security/cache families in one PR.
Skill validation is its own two-PR stack: declared format first, reference/policy links second.

## Phase 3: project-driven pilots

| Issue | Pilot | Prerequisites |
| --- | --- | --- |
| [#56](https://github.com/shayshahal/lint-kit/issues/56) | Enforce one explicit structured-logger convention | [#50](https://github.com/shayshahal/lint-kit/issues/50), [#51](https://github.com/shayshahal/lint-kit/issues/51) |
| [#57](https://github.com/shayshahal/lint-kit/issues/57) | Enforce one declared token-system convention | [#50](https://github.com/shayshahal/lint-kit/issues/50) |
| [#58](https://github.com/shayshahal/lint-kit/issues/58) | Tune duplication exemptions and snapshot-size advice | [#50](https://github.com/shayshahal/lint-kit/issues/50) |
| [#59](https://github.com/shayshahal/lint-kit/issues/59) | Add explicit route/state accessibility and console verification | [#50](https://github.com/shayshahal/lint-kit/issues/50) |
| [#60](https://github.com/shayshahal/lint-kit/issues/60) | Compare one declared public interface against a trusted base | [#50](https://github.com/shayshahal/lint-kit/issues/50) |
| [#61](https://github.com/shayshahal/lint-kit/issues/61) | Measure one declared artifact or page budget | [#50](https://github.com/shayshahal/lint-kit/issues/50) |
| [#62](https://github.com/shayshahal/lint-kit/issues/62) | Run one focused test against base and fixed implementation | [#50](https://github.com/shayshahal/lint-kit/issues/50) |

Each is a new root PR on `main` after its prerequisites, not a continuation of an unrelated
stack. The issue's start condition requires a real adopting project, declared policy and
reproducible fixture. The performance and contract pilots choose one measurement/surface each;
the regression experiment chooses one focused reproducible bug/test.

## Completion evidence

Every implementation issue requires public-command or installed-tool tests, legitimate
counterexamples, explicit execution-failure behavior and documentation of only shipped scope.
Installation changes also require fresh/repeat/upgrade tests and declared Windows/POSIX support.

The first-release gate records reviewed pilot findings, false positives and runtime cost,
checks guard tampering and scanner failures, and verifies that advisory signals never become
hidden blockers. External CI/review protections remain explicit maintainer prerequisites.
Only that evidence can unblock later pilots or support a separate default-enablement decision.
