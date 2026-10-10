# Agent-skills first-release support matrix

Frozen by foundation [#40](https://github.com/shayshahal/lint-kit/issues/40). This is the support
contract the first-release stacks ([#41](https://github.com/shayshahal/lint-kit/issues/41)–[#50](https://github.com/shayshahal/lint-kit/issues/50))
implement against; it publishes the [revised proposal](agent-skills-lint-rule-proposals.md) and the
[roadmap](agent-skills-implementation-roadmap.md) without changing any existing default.

**Nothing here is installed.** No runtime check, installer set, or default changes in #40, so
`docs/support.md` and `docs/enforcement.md` are unchanged. Every selection below is opt-in for the
issue that implements it. Where a decision belongs to another owner, it says so instead of guessing.

## Frozen decisions

| Decision | Freeze | Implementing issue |
| --- | --- | --- |
| Supported runner | Vitest, with its maintained plugin [`@vitest/eslint-plugin`](https://www.npmjs.com/package/@vitest/eslint-plugin) `1.6.27` (devDependency of this repo for the freeze test) | [#47](https://github.com/shayshahal/lint-kit/issues/47)–[#49](https://github.com/shayshahal/lint-kit/issues/49) |
| Parsed policy format | `lint-kit.policy.json` (schema below), JSON parsed natively; `.yaml`/`.yml` accepted through the `yaml` parser. Never JavaScript | [#41](https://github.com/shayshahal/lint-kit/issues/41), [#42](https://github.com/shayshahal/lint-kit/issues/42) |
| Guard CLI / exit contract | `0` clean or advisory-only, `1` unapproved enrolled change, `2` could not run. Trusted policy is an explicit input | [#41](https://github.com/shayshahal/lint-kit/issues/41) |
| Secret scanner | Gitleaks `v8.30.1`, pinned by release checksum | [#45](https://github.com/shayshahal/lint-kit/issues/45), [#46](https://github.com/shayshahal/lint-kit/issues/46) |
| Authorized adopter | lint-kit itself plus `init`-generated consumer fixtures only | Every first-release issue |
| Svelte/compiler overlap | Four covered accessibility shapes rejected by the installed `svelte-skills` config; unlabeled input documented as a gap | Companion overlap slice |

## 1. Authorized adopting repository

The only authorized pilot is **a lint-kit-generated consumer fixture**: a throwaway directory the
repository's own tests create, run `init` in, and exercise with the installed tool. lint-kit's own
repository is the reference consumer for the installer path. Per `USER-DECISIONS.md`, no external
repository may be edited or enrolled, so:

- An external adopter, its protected-branch settings, its required-check list and its approval
  provider are **unresolved release-gate prerequisites** for [#50](https://github.com/shayshahal/lint-kit/issues/50); they are not
  assumed anywhere in the first-release stacks.
- A fixture proves the installed command works in a shape `init` can produce. It is not evidence
  that a real consumer adopted the check, and no document may say otherwise.

## 2. Supported test runner and plugin

**Selected: Vitest + `@vitest/eslint-plugin@1.6.27`.** Vitest is the runner a Vite/SvelteKit
project already uses; the plugin is the maintained successor to the deprecated `eslint-plugin-vitest`.

Compatibility evidence, exercised with the installed toolchain (`eslint@10.11.0`, Node 26.10.0):

- The plugin declares peer `eslint >=8.57.0`, `node >=18`; `vitest`, `typescript` and
  `@typescript-eslint/eslint-plugin` are optional peers, so a consumer needs no Vitest install to
  lint. It runs under ESLint 10 flat config.
- Rejected: `eslint-plugin-vitest@0.5.4` (peer `eslint ^8.57.0 || ^9.0.0` — it does not support
  ESLint 10) and `eslint-plugin-jest` (viable, but selecting it would add a second runner engine
  and Jest is not the runner this stack targets). One runner only for the first release.

The frozen behavior is proven by `test/agent-skills-testing-plugin.test.js`, which runs the real
plugin through ESLint's `RuleTester`. It pins the version and the examples below. The implementing
issues must not claim more than it shows.

### 2.1 Focused tests — owner [#47](https://github.com/shayshahal/lint-kit/issues/47)

| | |
| --- | --- |
| Rule | `vitest/no-focused-tests` (blocking) plus `vitest/no-test-prefixes` for the focus aliases |
| Attribution | Branch-introduced findings, via the ESLint set's existing branch narrowing |
| Failing example | `test.only('a', () => {})`, `describe.only('b', …)`, `test.concurrent.only(…)`, `test.only.each([…])(…)` |
| Counterexample that must pass | A shadowed local `const test = { only() {} }; test.only('x')`, a plain `test('x', …)`, a `describe.each([1]).only(…)` |
| Limits to record | `no-focused-tests` reports only `it`/`test`/`describe` and does not treat `fit`/`fdescribe` as focused; `no-test-prefixes` catches those aliases. A `.only` applied **after** `.each` (`describe.each([1]).only(…)`) is not reported by either rule and is a documented gap, not silent coverage |

### 2.2 Asynchronous assertions — owner [#48](https://github.com/shayshahal/lint-kit/issues/48)

| | |
| --- | --- |
| Rules | `vitest/valid-expect` (and `vitest/valid-expect-in-promise` for an unreturned `.then` chain) |
| Failing example | `test('x', () => { expect(fetch('u')).resolves.toBe('y'); })` and `test('x', () => { fetch('u').then((r) => expect(r).toBe('y')); })` |
| Counterexamples that must pass | `await expect(…).resolves…` inside an `async` test; `return expect(…).resolves…`; a callback test with a synchronous `expect`; a shadowed local `expect` |
| Limits to record | The check is syntactic. `valid-expect` autofixes the unawaited form by making the callback `async` and adding `await`; `valid-expect-in-promise` offers no fix. Neither can resolve an assertion behind a dynamic matcher or an imported helper without types, so #48 must prove any type-aware requirement before claiming it |

### 2.3 Unconditional skips — owner [#49](https://github.com/shayshahal/lint-kit/issues/49)

| | |
| --- | --- |
| Rule | `vitest/no-disabled-tests` (blocking under enrolled policy) |
| Failing example | `test.skip('a', …)`, `it.skip(…)`, `describe.skip(…)`, `xit(…)`, `xdescribe(…)`, `test.skip.each([…])(…)` |
| Counterexamples that must pass | `test.todo(…)` / `it.todo(…)`; the conditional forms `test.skipIf(cond)(…)` and `test.runIf(cond)(…)`; a shadowed local `xit` |
| Limits to record | The plugin does not separate a conditional `test.skip(cond, 'why', …)` from an unconditional skip, and does not report a `.skip` applied **after** `.each`. #49's scoped reason/owner/expiry quarantine (its own minimal format) must handle both; the plugin alone does not |

The three sets above stay one owner each. No lint rule is added to `slop-patterns`, and the
application sets' existing test exclusions are kept.

### 2.4 Installed Svelte/compiler overlap — companion foundation slice

This document records the decision; the executable overlap fixture is owned by the companion
overlap slice, which owns every Svelte test, fixture and rule. It must prove through the actual
installed configuration (`svelte-skills` `config()` with `svelte/valid-compile` at
`{ ignoreWarnings: false }`) that the four already-covered accessibility shapes are rejected:
missing image alt text, an unnamed icon-only button, an inaccessible non-interactive click handler,
and a positive `tabindex`. The uncovered shape is an unlabeled input: it is **documented as a gap,
not given a duplicate rule**, because the review probe passed it. Any new rule for it waits for a
demonstrated gap in the installed Svelte plugin. Overlap is exercised against the installed
configuration, never a candidate's detector in isolation.

## 3. Policy-regression guard

Owners [#41](https://github.com/shayshahal/lint-kit/issues/41)–[#44](https://github.com/shayshahal/lint-kit/issues/44). The frozen policy format is the single parsed
input for the guard.

### 3.1 Policy format

`lint-kit.policy.json`, supplied explicitly to the command; `.yaml`/`.yml` carry the same schema
and are parsed with a real YAML parser (JSON is valid YAML). **No `.js`/`.ts`/`.cjs` policy file is
loaded or executed** — an unsupported policy file is an execution failure (exit `2`), never a
friendly default.

```jsonc
{
  "version": 1,
  "constraints": [
    { "id": "coverage-lines", "checker": "vitest run --coverage", "metric": "coverage.lines", "unit": "percent", "direction": "min", "value": 80 },
    { "id": "complexity", "checker": "python tools/python/structure_check.py", "metric": "complexity", "unit": "score", "direction": "max", "value": 10 }
  ],
  "checks": [
    { "id": "slop-patterns/no-trivial-wrapper", "severity": "warn" }
  ],
  "enrolledPaths": ["eslint.config.js", ".oxlintrc.json", "tools/python/structure_check.py"],
  "ignore": ["tools/oxlint/slop-patterns/**"],
  "exceptions": [
    { "id": "W-1", "rule": "no-explicit-any", "path": "src/legacy/**", "reason": "tracked in ENG-441", "owner": "@handle", "expires": "2026-12-31" }
  ]
}
```

- `direction` is `min` or `max`; weakening is a lower `min` or a higher `max`. **Direction is never
  inferred from "raised/lowered" or a value's magnitude.**
- `unit`, `metric` and `checker` are identity: changing any of them is a policy change, not a
  comparable number.
- `checks[].severity` is the enrolled severity. `error → warn`/`off` is a policy change; `off → error`
  is tightening and silent.
- `ignore` and `exceptions` are guarded as policy themselves: adding `**`, or adding/extending an
  exception, cannot pass silently.
- Approval is **not** read from the file. There is no `APPROVED-BY` field; approvals come from the
  protected forge process (unresolved prerequisite — see §6). Unknown keys and unknown enum values
  are parse errors (exit `2`), not ignored.

### 3.2 CLI, exit and baseline contract

- The command takes an explicit base and target, and a separately supplied trusted policy snapshot.
- **Source baseline:** the diff the guard judges is the merge-base of the target and the base
  (`git merge-base`), using machine-safe path parsing. A deletion-only branch still runs.
- **Policy baseline:** the trusted policy is the `--policy` input chosen by CI. It is never
  implicitly loaded from the branch under review, and the branch cannot grant its own exemptions.
  The two baselines are distinct and must not be conflated.
- **Local pre-push is feedback, not authorization.** It reports changes; required CI blocks them.
- Exit `0` = no unapproved blocking findings (advisory evidence may accompany it). Exit `1` =
  unapproved enrolled policy change. Exit `2` = the check could not run (missing/unresolvable base,
  malformed supported policy, tool failure). Missing evidence is never "clean": required CI blocks
  on both `1` and `2`.
- Initial support is a clean CI checkout and the pre-push working tree, including in-scope untracked
  files. No pre-commit/index mode until index analysis exists and is tested.

| Blocker | Failing example | Legitimate counterexample | Limit / owner |
| --- | --- | --- | --- |
| Threshold weakened | `direction:"min", value: 80 → 70`, or `direction:"max", value: 10 → 20` | `80 → 90`, `10 → 8`, or an equal value (silent) | Numeric only, direction explicit — [#42](https://github.com/shayshahal/lint-kit/issues/42) |
| Severity downgraded | enrolled `error → warn`/`off` | `off → error` | Parsed formats only; JS config edits are review evidence — [#42](https://github.com/shayshahal/lint-kit/issues/42) |
| Ignores / exemptions widened | `ignore` gains `**`; a new or extended `exceptions` entry | A narrower ignore, or an exception removed | Structurally valid still needs approval — [#42](https://github.com/shayshahal/lint-kit/issues/42) |
| Enrolled file changed | `tools/python/structure_check.py` or the enrolled ESLint/oxlint config changes | None auto-cleared; it requires review | Unsupported formats are review findings, not a guessed verdict — [#41](https://github.com/shayshahal/lint-kit/issues/41) |
| Test deleted / assertion moved | A test deleted, or an assertion removed | A rename/move pair; a legitimate `@ts-expect-error` in a type test | Advisory only; cannot establish weaker behavioral coverage — [#42](https://github.com/shayshahal/lint-kit/issues/42) |

## 4. Secret scanning

Owner [#45](https://github.com/shayshahal/lint-kit/issues/45) / [#46](https://github.com/shayshahal/lint-kit/issues/46).

**Pinned: Gitleaks `v8.30.1`** (released 2026-03-21). Recorded platform checksums from the official
`gitleaks_8.30.1_checksums.txt`:

| Asset | SHA-256 |
| --- | --- |
| `gitleaks_8.30.1_windows_x64.zip` | `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e` |
| `gitleaks_8.30.1_linux_x64.tar.gz` | `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` |
| `gitleaks_8.30.1_darwin_arm64.tar.gz` | `b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5` |

- Scanning modes at this version: `gitleaks git` (history, `--log-opts` for a commit range),
  `gitleaks dir` (working tree/files), `gitleaks stdin`. The `detect`/`protect` names were deprecated
  in v8.19.0 and must not be copied as if stable.
- Redaction: `--redact` (or `--redact=<percent>`). No matched secret may appear in stdout, stderr or
  a report artifact.
- Baseline semantics: newly introduced findings block; an inherited secret from a history audit is
  an incident to surface, not harmless debt to hide. `--baseline-path` distinguishes the two.
- **Upstream limit that #45 must handle:** Gitleaks exits `0` for no leaks and `1` for **either**
  leaks or an error (`126` for an unknown flag). The exit code alone cannot separate findings from
  scanner failure, so a fail-closed wrapper must treat `exit 1` with no parseable findings report as
  an execution failure — never as "no leaks."

## 5. Enforcement ownership and severity

| Disposition | Owner | Example |
| --- | --- | --- |
| Blocking | The one engine that diagnoses the shape | `vitest/no-focused-tests`; an unapproved guard change |
| Advisory | The engine that reports a suspicious shape | snapshot-size signal (#58); fallow `warn` |
| Runtime verification | A configured test or measurement | awaited assertions pass under the runner |
| Review-only / external | Human review, forge state, agent control | protected branch settings, approval provider |

Each shape has exactly one owning engine: Svelte/compiler accessibility stays with the installed
`svelte-skills` `valid-compile` configuration; testing rules stay in the testing set; policy stays in
the guard; secrets stay in the Gitleaks wrapper. No engine diagnoses the same shape twice, and
advisory findings never become a `--max-warnings 0` gate.

## 6. Unresolved release-gate prerequisites

These are **not** decided by #40 and block [#50](https://github.com/shayshahal/lint-kit/issues/50) or default enablement:

- An external consumer repository, with permission, and its adoption decision.
- Its protected-branch settings, required-check list and the approval provider the guard trusts.
- Trusted-CI wiring that runs the guard from a trusted revision (owner [#44](https://github.com/shayshahal/lint-kit/issues/44)).
- A real measured pilot (reviewed findings, false positives, runtime cost) before any check becomes
  a default.

Until those exist, a local hook is feedback only and must not be described as enforcement.

## 7. Verification performed for this freeze

Run in this worktree with the installed toolchain:

- `pnpm install --frozen-lockfile` — the pre-existing lock resolves; adding the plugin is the only
  change.
- `node --test test/agent-skills-testing-plugin.test.js` — the focused/async/skip claims above,
  against the real plugin.
- `pnpm test` and `pnpm typecheck` — the full suite and the shipped-tool typecheck.
