# Agent-skills first-release gate

The three first-release stacks are merged on `main` as opt-in sets: the `policy-guard` guard, the
`secret-scanning` scanner and the `vitest` testing set ([#41](https://github.com/shayshahal/lint-kit/issues/41)–[#49](https://github.com/shayshahal/lint-kit/issues/49)).
This document records the release gate ([#50](https://github.com/shayshahal/lint-kit/issues/50)) in
bounded form: what a generated consumer fixture actually exercises, what stays unmeasured, and the
go/no-go for protected enforcement, default enablement and later pilots. It is the evidence
companion to the frozen [support matrix](agent-skills-first-release-support.md) and to the copied
contracts in [tools/policy/README.md](../tools/policy/README.md),
[tools/security/gitleaks-check.md](../tools/security/gitleaks-check.md) and
[tools/eslint/vitest.md](../tools/eslint/vitest.md).

## Authorized pilot

The user authorized **generated consumer fixtures only**: a throwaway Git repository that this
repository's own tests create, run `init` in, and exercise with the installed command or hook.
lint-kit's own repository is the reference consumer for the installer path. No external repository
was edited, enrolled or measured, and no partner project is guessed to fill the gap.

A fixture proves an installed command works in a shape `init` can produce. It is **not** adoption
evidence, and no generated result here is a real-world false-positive rate: the counterexamples are
synthetic shapes. Where a joint case needs a live quarantine waiver, the fixture hand-writes the
enrollment into its own committed trusted base — a test construction, not a production approval and
not an installer capability.

## What ships, and what it does not

- **Three opt-in sets, one parsed adapter.** `policy-guard`, `secret-scanning` and `vitest` are
  never selected from a dependency; a repository asks for each by name and it stays on a re-run. The
  only parsed checker configuration frozen now is the `fallow-jsonc` adapter for `.fallowrc.json` /
  `.fallowrc.jsonc`; every other reviewed file is protected whole (`opaque`) rather than evaluated.
- **Consumer configuration is preserved.** A repeat run changes nothing; an upgrade refreshes the
  copied tool code, widens an ESLint step for a newly added set, and leaves user configs and
  reviewed policy files byte-for-byte. No set broadens an existing `lint-kit.policy.json`.
- **No automatic protection.** `init` writes no `.github/workflows/` file, activates no check and
  installs no forge protection. The shipped `policy-guard-ci.yml` is a manual template. Nothing here
  claims that `init` protects every checker configuration or turns a local hook into enforcement.
- **The quarantine ledger is not created or enrolled.** `init` wires the pre-push
  `check-quarantine-ledger.mjs` validator and prints the enrollment snippet; the repository creates
  its own `test-quarantine.json`, and enrolling it `opaque` is a reviewed trusted-ref change made by
  hand.
- **A fresh enrollment is a prerequisite, not a pass.** The guard's enrollment must be reviewed and
  landed at the trusted ref before a local run can succeed; until then it exits `2`, never clean.

## Where the checks run

The testing rules run where their files are staged, and the whole-repository checks run before a
push, unfiltered, so a deletion-only or docs-only push still runs them:

| Check | Hook | Fails with |
| --- | --- | --- |
| `vitest` ESLint rules (`no-focused-tests`, `valid-expect`, `valid-expect-in-promise`, `no-disabled-tests`) | pre-commit (`eslint {staged_files}`) | ESLint exits 1 |
| `check-quarantine-ledger.mjs` (whole-ledger validity and expiry) | pre-push (script) | exits 1, or 2 when the Git root cannot be resolved |
| `gitleaks-check.mjs --mode branch` | pre-push (command) | exit 1 introduced finding, exit 2 could not run |
| policy guard | pre-push (script) | exit 1 unapproved enrolled change, exit 2 could not run |

Advisory output never gates: in the joint run the guard's non-enrolled-change advisory and a real
`vitest/valid-expect` warning (`0 errors, 1 warning`) are reported while the hook still passes, and
no finding here is turned into a `--max-warnings 0` gate. The three installed sets run no fallow
checker, so no fallow `warn` rule is exercised by this hook. A **mutable local
command or hook is feedback, not authorization**: required CI must run the frozen helper and policy
from a trusted revision and block both `1` and `2`, and only the protected forge process approves a
policy change.

## Joint installed-workflow matrix

The joint test file this gate adds — `test/agent-skills-first-release-integration.test.js` at
`50fa52208affc411fa5b3b9c5cb9e314230252d1` (blob
`788476af0473457fe6416e32b9a028a9279b5902`, sha256
`a755b263b61055d70843d4c182c666ea1f9f5f5ac72a76453e15b304d549d917`) — installs
`--sets policy-guard,secret-scanning,vitest` into a generated consumer and runs the combined hooks
and the copied commands through their public entrypoints: the public `node bin/lint-kit.js` CLI,
the copied tools, the pinned Gitleaks `8.30.1` and the real `lefthook` `2.2.1` binary (provisioned
from the reference checkout's own `node_modules`, not a consumer dependency). It mocks no
module and adds no test-only seam (there is no clock knob: the ledger lifecycle cases use explicit
`2000`/`2099` dates). It covers fresh, repeat and true stale-code upgrade installation; a nested
pnpm workspace member and a spaced path, each running the real hooks; the focused, async and
disabled-test ESLint findings through the real generated **pre-commit** hook; the guard, scanner
and ledger findings through the combined **pre-push** hook; an all-green result on both hooks;
secret attribution and redaction; the deletion-only and docs-only lifecycle; a missing-evidence
failure that cannot read as clean; and the pinned provider.

The independent run was `node --test "test/*.test.js"` (with `pnpm typecheck`), the pinned Node
`22.23.3` first on `PATH`. Each spawned fixture command gets a private `TEMP`/`TMP`/`TMPDIR`, and a
case that runs the generated secret step puts the pinned Gitleaks directory on `PATH`; no module is
linked into this checkout.

The `vitest` ESLint rules are **pre-commit only**: a push never runs them, so a combined detection
claim is never made from a push alone. The pre-commit ESLint step and the combined pre-push hook are
exercised separately.

The cases below are recorded from a completed independent **Windows** run of that file; the slice's
own Ubuntu/Windows CI run awaits its PR and is **not** claimed here. A case is recorded only from a
completed run: an unfinished or skipped case stays unobserved.

| Case field | What the Windows run observed |
| --- | --- |
| Fixture shape | a root consumer; a nested pnpm workspace whose member (`apps/web`) runs the real public install and the root hooks; and a spaced-path consumer on which the real hooks run ESLint |
| `init` argv | `node bin/lint-kit.js init --cwd <dir> --sets policy-guard,secret-scanning,vitest` (`--no-install` for the shape-only fixtures) |
| Installed artifacts | all 14 copied files present; one `lint-kit.policy.json`; the pre-commit ESLint step, both pre-push scripts and the secret-scanning command; no ledger created |
| Repeat / upgrade | a second run is byte-identical; stale copied tools are refreshed; consumer `.fallowrc.json`, manifest and `gitleaks.toml` are preserved |
| Pre-commit detection | a staged `test.only`, an unawaited `expect(...).resolves` and an unconditional `skip` are blocked, naming `vitest/no-focused-tests`, `vitest/valid-expect` and `vitest/no-disabled-tests` |
| Pre-push detection | the combined pre-push hook reports `introduced generic-api-key secret.ts:1` and `enrolled-weakened: health.maxCognitive raised from 25 to 40`, runs the ledger step, and names no `vitest/*` rule |
| All green (both hooks) | the legitimate staged set passes the pre-commit ESLint step, and an all-legitimate push passes every combined step with only the guard's non-enrolled advisory |
| Advisory never gates | that advisory and a real `vitest/valid-expect` warning (`0 errors, 1 warning`) are reported while the hook still passes |
| Pre-commit counterexamples | awaited/returned assertions, a conditional `skipIf`, `test.todo` and a local binding produce no `vitest/*` error |
| Pre-push counterexamples | a tightened `.fallowrc.json` (25 → 20) and a live trusted-base ledger entry stay green |
| Attribution and redaction | introduced vs inherited are reported as `path:line` (with `commit` in history); the synthetic values are absent from the scanner's stdout and stderr, and the scanner removes its own report and scratch directory — the transient report JSON itself is neither read nor measured |
| Lifecycle | docs-only and deletion-only pushes run the unfiltered pre-push scripts, with exact changed-path and clean-tree assertions; expired and malformed ledgers fail, an absent ledger is `0` |
| No evidence | a missing parser, an explicitly missing scanner and an absent ledger each keep their own verdict in one combined hook, which is non-zero |
| Versions | Node `22.23.3`, pnpm `11.3.0`, Git `2.54.0.windows.1`, ESLint `10.12.0` (the installed consumer; the reference checkout pins `10.11.0`), `@vitest/eslint-plugin` `1.6.27`, Vitest `4.1.11`, `jsonc-parser` `3.3.1`, lefthook `2.2.1`, Gitleaks `8.30.1`, Windows 11 `10.0.26300` |
| Runtime cost | a warm local Windows run; per-case durations below |

### Per-case runtime (Windows, warm)

Runner `duration_ms` per case, range `0.001`–`16.927` s. The two large cases are dominated by the
one-time real `init` (pnpm installing the owned peers into the fixture), so they measure setup plus
hooks, not isolated check overhead. The case sum is **73.460 s**; the full
`node --test "test/*.test.js"` wall clock is **77.171 s**, which also includes the other test files
running in parallel.

| # | Case | s |
| --- | --- | --- |
| 1 | fresh combined install | 0.232 |
| 2 | repeat combined install | 0.533 |
| 3 | true stale-code upgrade | 0.555 |
| 4 | live trusted-base waiver through the installed ESLint and combined hooks | 16.927 |
| 5 | installer never creates or broadens the ledger | 1.020 |
| 6 | nested pnpm workspace install | 0.144 |
| 7 | real workspace member provider and root hooks | 16.362 |
| 8 | spaced-path install and copied commands | 2.135 |
| 9 | all-green combined push with the advisory | 4.782 |
| 10 | real Vitest warning in pre-commit | 2.388 |
| 11 | pre-commit focused/async/disabled defects | 2.087 |
| 12 | pre-push secret and weakened enrollment | 2.563 |
| 13 | guard tamper (trusted-copy simulation) | 4.695 |
| 14 | secrets: introduced/inherited/history/deleted | 5.976 |
| 15 | artifact-cleanup predicate | 0.001 |
| 16 | docs-only branch with a live ledger | 2.355 |
| 17 | docs-only branch with an expired ledger | 2.372 |
| 18 | deletion-only branch | 2.460 |
| 19 | deletion-only branch with a malformed ledger | 2.412 |
| 20 | missing parser, missing scanner and absent ledger | 1.655 |
| 21 | missing Vitest provider | 0.455 |
| 22 | pinned Gitleaks `8.30.1` | 1.354 |

## Evidence already observed

- The corrected joint file (`50fa52208affc411fa5b3b9c5cb9e314230252d1`) passed an independent
  Windows run at the coordinator: **650 tests, 650 pass, 0 fail, 0 skip, 0 todo** in 77.171 s wall
  clock, with `pnpm typecheck` clean. The test worker reported the same 22-case file green and the
  Python suite at **80 passed**; the Python run is not yet independently repeated. One earlier
  worker full-suite run hung in the runner and was killed on its timeout; the cause was not
  diagnosed, and the later runs (this independent suite included) completed green.
- The prerequisite combined `main` (`9ea00c606483f140e1cf310515879b3302a0c946`) passed its earlier
  independent Node suite, the TypeScript tools check and the Ubuntu and Windows CI matrix.
- The joint run used Node `22.23.3`, pnpm `11.3.0` and Git `2.54.0.windows.1`; the prerequisite CI
  observed Git `2.55.0` (`2.55.0.windows.5`). The installed consumer resolved ESLint `10.12.0`; the
  reference checkout pins ESLint `10.11.0`, which is not the consumer's version.
- The pinned Gitleaks `8.30.1` ran on Windows through the joint fixture, and the prerequisite
  Ubuntu CI job executed the checksum-pinned Linux asset. Only the macOS asset and its runtime stay
  unobserved here; this slice's own Ubuntu/Windows CI awaits its PR.
- A read-only forge observation recorded `main` unprotected (`protected=false`), no effective branch
  rules (`[]`) and ADMIN viewer permission. Nothing was changed.

## Release-gate status: NO-GO

The following prerequisites are unresolved and are **not** satisfied by this change. They block
protected enforcement, default enablement and every later pilot:

1. **No external adopter.** Only lint-kit and `init`-generated fixtures are authorized; a fixture is
   not an adopting repository.
2. **No protected enforcement.** `main` was observed unprotected with no effective rules, and no
   branch protection, ruleset or required-workflow binding was created.
3. **No approved check identity.** The binding of the exact workflow as a required check through a
   ruleset required-workflows entry (or an equivalent trusted source), and the approval provider the
   guard would trust, are forge-side and unmeasured.
4. **No head-association proof.** GitHub's aggregation of the pull request head commit and its
   association with the merge are properties this repository neither runs nor measures.
5. **No authoritative waiver.** A quarantine entry is structural permission, not approval, and its
   enrollment is a manual trusted-ref change.
6. **A real measured pilot is missing.** Reviewed findings, false positives and runtime cost from a
   real consumer do not exist; the synthetic matrix is not a substitute.

Because of these, the bounded change **does not close [#50](https://github.com/shayshahal/lint-kit/issues/50)**:
#50's external-pilot acceptance remains open until a separately authorized adopter, its protections
and its measured pilot exist. Later pilots #51–#62 stay gated, and any default enablement needs its
own explicit authorization.

## Release status

The first-release additions are unreleased `main`, not part of the published `v0.4.0` tag: the
package version stays `0.4.0`, no tag or release is created, and no document claims the new sets are
in `v0.4.0`. The existing Release workflow only creates a release when the version tag is absent;
`v0.4.0` already exists, and the post-policy runs created no new release.
