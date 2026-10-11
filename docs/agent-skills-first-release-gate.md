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
synthetic shapes.

## What ships, and what it does not

- **Three opt-in sets, one parsed adapter.** `policy-guard`, `secret-scanning` and `vitest` are
  never selected from a dependency; a repository asks for each by name and it stays on a re-run. The
  only parsed checker configuration frozen now is the `fallow-jsonc` adapter for `.fallowrc.json`;
  every other reviewed file is protected whole (`opaque`) rather than evaluated.
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

Advisory output never gates: a policy advisory and a fallow `warn` rule are reported and the hook
still passes, and no finding here is turned into a `--max-warnings 0` gate. A **mutable local
command or hook is feedback, not authorization**: required CI must run the frozen helper and policy
from a trusted revision and block both `1` and `2`, and only the protected forge process approves a
policy change.

## Joint installed-workflow matrix

The one new test this gate adds installs `--sets policy-guard,secret-scanning,vitest` into a
generated consumer and runs the combined hooks and the copied commands. It is written to cover
fresh, repeat and stale-code upgrade installation, a nested pnpm workspace and a spaced path,
combined detection of a focused test, an unawaited assertion, an unconditional skip, a synthetic
credential and a weakened enrollment, the legitimate counterexamples, secret attribution and
redaction, the deletion-only and docs-only lifecycle, and a missing-evidence failure that cannot
read as clean.

Results are recorded with the change after independent review and the final CI run. Until then
every case below is **pending and unmeasured**: no count, runtime or false-positive rate is claimed
here.

| Case field | Contract the case asserts | Status |
| --- | --- | --- |
| Fixture shape | root, nested pnpm workspace, and a path with a space | pending |
| `init` argv | `init --sets policy-guard,secret-scanning,vitest [--no-install]` | pending |
| Installed artifacts | all copied files present; one `lint-kit.policy.json`; the four hook entries; no step dropped | pending |
| Repeat / upgrade | second run byte-identical; stale tool copies refreshed; consumer `gitleaks.toml` and manifest preserved | pending |
| Combined detection | non-zero push naming the owning ESLint, scanner and guard findings | pending |
| Legitimate counterexamples | one all-green push: awaited/returned assertions, `todo`, `skipIf`, a tightened ceiling, a live ledger entry | pending |
| Attribution and redaction | introduced vs inherited; the synthetic value absent from output and report | pending |
| Lifecycle | the unfiltered scripts fire on a docs-only and a deletion-only push; expired ledger fails, absent ledger is clean | pending |
| No evidence | a missing parser or scanner makes only its own step exit 2; the combined push is non-zero | pending |
| Versions | Node, pnpm, Git, ESLint, `@vitest/eslint-plugin`, Vitest, Gitleaks, lefthook, OS | pending |
| Runtime cost | measured wall-clock per case and total | pending |

A case is recorded only from a completed run: an unfinished or skipped case stays pending.

## Evidence already observed

- The final combined `main` (`9ea00c606483f140e1cf310515879b3302a0c946`) passed independent Node
  tests, the TypeScript tools check and the reported Python suite, plus the Ubuntu and Windows CI
  matrix.
- The CI matrix used Node `22.23.3`; the local run used Node `22.23.3`, pnpm `11.3` and Git
  `2.54.0.windows.1`, and the prerequisite CI observed Git `2.55.0` (`2.55.0.windows.5`).
- The Ubuntu CI that ran on the merged prerequisites executed the real checksum-pinned Linux
  Gitleaks `8.30.1` asset, so the scanner's Linux provider path is observed there; only the Windows
  and macOS assets remain unexecuted here.
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
