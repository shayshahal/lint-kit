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
| Supported runner | Vitest `4.1.11`, exercised through its real CLI, with its maintained plugin [`@vitest/eslint-plugin`](https://www.npmjs.com/package/@vitest/eslint-plugin) `1.6.27` (both exact devDependencies of this repo for the freeze tests) | [#47](https://github.com/shayshahal/lint-kit/issues/47)–[#49](https://github.com/shayshahal/lint-kit/issues/49) |
| Policy format | `lint-kit.policy.json` *enrolls* checker configurations (it stores no value or severity); guarded numbers/severity/ignores are read from the actual configuration by a per-format adapter, and the only parsed adapter frozen now is `fallow-jsonc` for `.fallowrc.json` | [#41](https://github.com/shayshahal/lint-kit/issues/41), [#42](https://github.com/shayshahal/lint-kit/issues/42) |
| Guard CLI / exit contract | `0` clean or advisory-only, `1` unapproved enrolled change, `2` could not run. Trusted enrollment is an explicit input | [#41](https://github.com/shayshahal/lint-kit/issues/41) |
| Secret scanner | Gitleaks `v8.30.1`, pinned by release checksum | [#45](https://github.com/shayshahal/lint-kit/issues/45), [#46](https://github.com/shayshahal/lint-kit/issues/46) |
| Authorized adopter | lint-kit itself plus `init`-generated consumer fixtures only | Every first-release issue |
| Svelte/compiler overlap | Four covered accessibility shapes rejected by the installed `svelte-skills` config (`test/agent-skills-svelte-overlap.test.js`, 12 tests); unlabeled input and spread/composed UI documented as limits | Companion overlap slice |

## 1. Authorized adopting repository

The only authorized pilot is **a lint-kit-generated consumer fixture**: a throwaway directory the
repository's own tests create, run `init` in, and exercise with the installed tool. lint-kit's own
repository is the reference consumer for the installer path. The recorded pilot decision is
lint-kit and installer-generated fixtures only — no external repository may be edited or enrolled
in this work, and no partner project is guessed to fill the gap. So:

- An external adopter, its protected-branch settings, its required-check list and its approval
  provider are **unresolved release-gate prerequisites** for [#50](https://github.com/shayshahal/lint-kit/issues/50); they are not
  assumed anywhere in the first-release stacks.
- A fixture proves the installed command works in a shape `init` can produce. It is not evidence
  that a real consumer adopted the check, and no document may say otherwise.

## 2. Supported test runner and plugin

**Selected: Vitest `4.1.11` + `@vitest/eslint-plugin@1.6.27`.** Vitest is the runner a Vite/SvelteKit
project already uses; the plugin is the maintained successor to the deprecated `eslint-plugin-vitest`.
The runner and the plugin are both exact `devDependencies` here, so the plugin's optional peer is
exercised, not assumed.

Compatibility evidence, exercised with the installed toolchain (`eslint@10.11.0`, Node 26.10.0):

- The plugin declares peer `eslint >=8.57.0`, `node >=18`; `vitest`, `typescript` and
  `@typescript-eslint/eslint-plugin` are optional peers, so a consumer needs no Vitest install to
  lint. It runs under ESLint 10 flat config.
- Vitest `4.1.11` declares `node ^20.0.0 || ^22.0.0 || >=24.0.0`, which satisfies this repo's
  `engines: node >=20` on the 20/22/24+ lines. The latest major (Vitest 5) requires
  `^22.12.0 || ^24.0.0 || >=26.0.0`, so `4.1.11` is the newest release that still supports Node 20.
- Rejected: `eslint-plugin-vitest@0.5.4` (peer `eslint ^8.57.0 || ^9.0.0` — it does not support
  ESLint 10) and `eslint-plugin-jest` (viable, but selecting it would add a second runner engine
  and Jest is not the runner this stack targets). One runner only for the first release.

The frozen behavior is proven by two tests, not prose:

- `test/agent-skills-testing-plugin.test.js` runs the selected rules through ESLint's real
  `RuleTester`, including imported aliases and local shadows.
- `test/agent-skills-vitest-runner.test.js` runs the pinned Vitest CLI over
  `test/fixtures/vitest-runner/*.test.js` and asserts the runner's own JSON report, so a shape the
  rule accepts is not mistaken for a shape the runner executes.

The implementing issues must not claim more than these show.

### 2.1 Focused tests — owner [#47](https://github.com/shayshahal/lint-kit/issues/47)

| | |
| --- | --- |
| Rule | `vitest/no-focused-tests` (blocking). One rule, focus only — no prefix-styling rule is selected |
| Attribution | Branch-introduced findings, via the ESLint set's existing branch narrowing |
| Failing example | `test.only('a', () => {})`, `it.only(…)`, `describe.only(…)`, `test.concurrent.only(…)`, `test.only.each([…])(…)`, and their aliased-import forms |
| Counterexamples that must pass | A locally bound `const test = { only() {} }; test.only('x')`; `function it() {}`; a `test.only` imported from a library other than `vitest`; a plain `test('x', …)` |
| Limits to record | Vitest exposes focus only through `.only`, so there is no alias for a prefix rule to normalize: `fit`/`fdescribe` are Jest names Vitest does **not** export. `test.each([…]).only/skip` is a collection failure (`… is not a function`), not a focused or skipped test, so it is neither a supported form nor a coverage gap |

### 2.2 Asynchronous assertions — owner [#48](https://github.com/shayshahal/lint-kit/issues/48)

| | |
| --- | --- |
| Rules | `vitest/valid-expect` (and `vitest/valid-expect-in-promise` for an unreturned `.then` chain) |
| Failing example | `test('x', () => { expect(fetch('u')).resolves.toBe('y'); })` and `test('x', () => { fetch('u').then((r) => expect(r).toBe('y')); })`, including aliased `expect`/`test` imports |
| Counterexamples that must pass | `await expect(…).resolves…` inside an `async` test; `return expect(…).resolves…`; a synchronous test callback with a synchronous `expect`; a shadowed local `expect` |
| Limits to record | The check is syntactic. `valid-expect` autofixes the unawaited form by making the callback `async` and adding `await`; `valid-expect-in-promise` offers no fix. The rule also accepts the callback-`done` form, but Vitest 4.1.11 **deprecates** it — calling `done()` fails with "done() callback is deprecated, use promise instead" — so it is not a legitimate passing counterexample for this runner. Neither rule can resolve an assertion behind a dynamic matcher or an imported helper without types, so #48 must prove any type-aware requirement before claiming it |

### 2.3 Unconditional skips — owner [#49](https://github.com/shayshahal/lint-kit/issues/49)

| | |
| --- | --- |
| Rule | `vitest/no-disabled-tests` (blocking under enrolled policy) |
| Failing example | `test.skip('a', …)`, `it.skip(…)`, `describe.skip(…)`, `test.skip.each([…])(…)`, and their aliased-import forms |
| Counterexamples that must pass | `test.todo(…)` / `it.todo(…)`; the conditional forms `test.skipIf(cond)(…)` and `test.runIf(cond)(…)`; a locally bound `test`; a `test.skip` imported from a library other than `vitest` |
| Limits to record | There is no conditional `test.skip` API: the runner treats the first argument as the test name, so `test.skip(cond, 'why', …)` is an unconditional skip named after the condition value (the runner fixture pins this). `test.each([…]).skip` is a collection failure, not a skip. #49's scoped reason/owner/expiry quarantine (its own minimal format) is the only way to allow a real skip, and the plugin alone does not provide it |

The three sets above stay one owner each. No lint rule is added to `slop-patterns`, and the
application sets' existing test exclusions are kept.

### 2.4 Installed Svelte/compiler overlap — companion foundation slice

This document records the decision; the executable overlap fixture is
`test/agent-skills-svelte-overlap.test.js` (12 focused tests, companion commit
`1d344492052b3d5bcae69c2bd028c470ceb95cf9`, integrated into this stack by the coordinator). It
proves through the actual installed configuration (`svelte-skills` `config()` with
`svelte/valid-compile` at `{ ignoreWarnings: false }`) that the four already-covered accessibility
shapes are rejected: missing image alt text, an unnamed icon-only button, an inaccessible
non-interactive click handler, and a positive `tabindex`. Each diagnostic's owner is
`svelte/valid-compile` at severity `error`, and the test asserts no duplicate `svelte-skills/*` rule
matches those names.

- The uncovered shape is an **unlabeled input**: the installed Svelte compiler 5.57.1 exposes no
  "control has no associating label" warning (its `a11y_label_has_associated_control` is the
  inverse check), and `eslint-plugin-svelte` 3.23.0 ships no a11y rules. It is documented as a gap,
  not given a duplicate rule; any new rule for it waits for a demonstrated gap in the installed
  plugin.
- Spreads and composed children are opaque to the compiler (`<img {...rest} />`,
  `<Field label="Name" … />` pass), so those cases are recorded as limits; rendered-page
  verification is their mechanism. This slice makes no claim of complete accessibility coverage.

Overlap is exercised against the installed configuration, never a candidate's detector in
isolation.

## 3. Policy-regression guard

Owners [#41](https://github.com/shayshahal/lint-kit/issues/41)–[#44](https://github.com/shayshahal/lint-kit/issues/44). The frozen enrollment format and the
Fallow adapter are the only parsed inputs for the guard.

### 3.1 Enrollment format — links, not a second threshold authority

The guard stores no threshold, severity or ignore list of its own. `lint-kit.policy.json` (strict
JSON, supplied explicitly with `--policy`) *enrolls* the checker configurations the first release
watches: each enrollment declares the source path, the format, the adapter, and the identities to
read, each with its unit and direction. The number or severity itself is read from the checker's
own configuration at the trusted and target snapshots — never copied here.

```json
{
  "version": 1,
  "enrollments": [
    {
      "id": "fallow",
      "source": ".fallowrc.json",
      "format": "jsonc",
      "adapter": "fallow-jsonc",
      "identities": [
        { "id": "health.maxCognitive", "unit": "count", "direction": "max" },
        { "id": "health.maxCrap", "unit": "count", "direction": "max" },
        { "id": "rules", "unit": "severity-map", "direction": "min" },
        { "id": "ignorePatterns", "unit": "glob-list", "direction": "subset" }
      ]
    },
    {
      "id": "python-structure",
      "source": "tools/python/structure_check.py",
      "format": "opaque"
    }
  ]
}
```

- `source` is the authoritative checker configuration. `format` is `json`, `jsonc` or `opaque`;
  `opaque` means the whole file is protected but not parsed, so any change requires review.
- `identity` names the value inside that source. `unit` and `direction` are identity: changing
  either is a policy change, not a comparable number. Direction is never inferred from
  "raised/lowered" or from magnitude.
- Direction is explicit: `max` = a declared ceiling may not rise; `min` = a declared floor may not
  fall, with severity ordered `off < warn < error`; `subset` = the declared set may not grow (an
  added ignore is weaker).
- There is **no `value` and no stored severity in this file.** The guard reads each declared
  identity from `source` and compares it with its declared direction.
- Enrollment edits (a new/removed identity, or a changed `source`, `format` or `adapter`) are
  themselves a policy change and require approval.

**Fallow JSONC adapter (`fallow-jsonc`) — the only parsed checker configuration frozen now.**

- Source: `.fallowrc.json` (or `.fallowrc.jsonc`), the file `bin/lint-kit.js` `fallowConfig()`
  writes — real JSONC despite the `.json` suffix. It carries `//` comments and a `$schema`, so a
  strict-JSON reader fails on it; `test/agent-skills-fallow-config.test.js` proves that against the
  installer's own output.
- Read: strip `//` and `/* */` comments, then parse with a JSON parser. Comments are data; no
  `.js`/`.ts`/`.cjs` module is imported, evaluated or executed, and no expression is interpreted.
- Produce the declared identity's value at the trusted snapshot (`git show <trusted-ref>:<source>`)
  and at the target snapshot.
- An absent, wrong-typed, or non-JSONC identity (a JS expression, a template, a function call) is
  exit `2` — never a default, never "clean".
- A change elsewhere in the same file, outside the declared identities, is an enrolled opaque
  change: exit `1`, review required, with no fabricated verdict.
- YAML/TOML checker configurations are **not** frozen: no first-release checker writes one, so
  accepting them would be untested format expansion. They are a deferred decision, not support.

Unknown keys and unknown enum values in `lint-kit.policy.json` are parse errors (exit `2`).
Approval is never read from the file: there is no `APPROVED-BY` field, and approvals come from the
protected forge process (§6).

### 3.2 CLI, exit and baseline contract

- The command takes an explicit `--base` and `--target`, plus a separately supplied trusted
  enrollment (`--policy`).
- **Source baseline:** the diff the guard judges is the merge-base of the target and the base
  (`git merge-base`), using machine-safe path parsing. A deletion-only branch still runs.
- **Value baselines:** guarded values are read from each enrolled `source` at two snapshots — the
  trusted baseline CI selects and the target. The trusted enrollment is a separate explicit input,
  never implicitly loaded from the branch under review, and the branch cannot grant its own
  exemptions. The source-change baseline and the trusted value baseline are distinct and must not
  be conflated.
- **Local pre-push is feedback, not authorization.** It reports changes; required CI blocks them.
- Exit `0` = no unapproved blocking findings (advisory evidence may accompany it). Exit `1` =
  unapproved enrolled policy change. Exit `2` = the check could not run (missing/unresolvable base,
  malformed supported policy, unparseable enrolled source, tool failure). Missing evidence is never
  "clean": required CI blocks on both `1` and `2`.
- Initial support is a clean CI checkout and the pre-push working tree, including in-scope untracked
  files. No pre-commit/index mode until index analysis exists and is tested.

### 3.3 Findings and counterexamples

| Blocker | Failing example | Legitimate counterexample | Limit / owner |
| --- | --- | --- | --- |
| Threshold weakened | `.fallowrc.json` `health.maxCognitive 25 → 40` (a higher ceiling), or `health.maxCrap 100000 → 200000` | `25 → 20`, `100000 → 80000`, or an equal value (silent) | Numeric identity read from the checker source; direction declared — [#42](https://github.com/shayshahal/lint-kit/issues/42) |
| Severity downgraded | enrolled `rules.<id>` `"error" → "warn"`/`"off"` | `"off" → "error"`; `"warn" → "error"` | Fallow JSONC adapter, per rule key — [#42](https://github.com/shayshahal/lint-kit/issues/42) |
| Ignores widened | `ignorePatterns` gains `**` or a broader glob | a narrower ignore, or one removed | Set direction `subset`, read from the checker — [#42](https://github.com/shayshahal/lint-kit/issues/42) |
| Enrolled file changed | an opaque-enrolled file (e.g. `tools/python/structure_check.py`) changes; or a change outside the declared identities of a parsed source | None auto-cleared; it requires review | Unsupported shapes are review findings, never a guessed verdict — [#41](https://github.com/shayshahal/lint-kit/issues/41) |
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
  scanner failure, so the fail-closed wrapper must validate a parsed findings report (for example
  `--report-path` with JSON output) and should evaluate Gitleaks' dedicated findings `--exit-code`
  so a plain `1` is not overloaded. An unparseable or missing report is an execution failure,
  never "no leaks".

## 5. Enforcement ownership and severity

| Disposition | Owner | Example |
| --- | --- | --- |
| Blocking | The one engine that diagnoses the shape | `vitest/no-focused-tests`; an unapproved guard change |
| Advisory | The engine that reports a suspicious shape | snapshot-size signal ([#58](https://github.com/shayshahal/lint-kit/issues/58)); fallow `warn` |
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

- `pnpm install --frozen-lockfile` — the frozen lock resolves, now including Vitest `4.1.11` and its
  tree as an exact devDependency.
- `node --test test/agent-skills-testing-plugin.test.js` — the focused/async/skip plugin claims,
  including imported aliases and local shadows.
- `node --test test/agent-skills-vitest-runner.test.js` — the same shapes through the pinned Vitest
  CLI: `.only` focusing, `skipIf`/`runIf`, `test.skip(cond, …)` as a name, `test.todo`, the
  deprecated `done` callback, and `.each(…).only` failing collection.
- `node --test test/agent-skills-fallow-config.test.js` — the installer writes `.fallowrc.json` as
  JSONC with the enrolled identity paths, which a strict-JSON reader cannot parse.
- `pnpm test` and `pnpm typecheck` — the full suite (including the integrated Svelte overlap test)
  and the shipped-tool typecheck.
