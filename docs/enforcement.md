# Enforcement policy

Every check `init` installs is one of three kinds. The kind decides whether a finding fails the
hook, what severity the rule carries, and how the message reads. The checks are deterministic
rules or a comparison with the base; none of them is a guarantee about code quality, and the
scoring output is a signal, not a gate.

## Blocking

A finding fails the commit or push.

| Check | Where | Fails with |
| --- | --- | --- |
| ESLint sets (`svelte-skills`, `untranslated-text`, `tailwind-patterns`, `error-handling`, `prose`), every rule at `error`, on the lines the branch added | pre-commit (`eslint {staged_files}`) | ESLint exits 1 |
| flake8 FAP rules | pre-commit | flake8 exits 1 |
| ruff `FAST` / `ASYNC` | pre-commit | ruff exits 1 |
| `svelte-check --tsgo` (Svelte projects) | pre-push | svelte-check exits 1 |
| `pyright` (Python projects) | pre-push | pyright exits 1 |
| fallow `"error"` rules: dead code the branch introduced | pre-push (script) | `fallow audit` exits 1 |
| `structure_check.py`: a new / crossed complexity, new duplication, a new import cycle | pre-push | exits 1 |
| `gitleaks-check.mjs --mode branch` (opt-in `secret-scanning` set) | pre-push (`node tools/security/gitleaks-check.mjs --base <branch>`) | exit 1: an introduced secret; exit 2: the check could not run |

Secret scanning is opt-in: like `prose`, a dependency never selects it, so a repository asks for
it with `--sets secret-scanning` and it stays off by default. Its local step is feedback only —
writing the hook installs no required check and changes no forge protection, so an introduced
secret is caught in CI only when CI is wired to run the command from a trusted revision, with a
trusted tool and config, and block on both exit `1` and exit `2`. The history audit (`--mode
history`) is remediation, not a gate, and is not wired to a hook.

A blocking check is only ever charged for what the branch introduced. The structure tools compare
with the merge-base of the branch and its base, and fallow reports an inherited finding as
inherited; what the base already had never fails. The ESLint sets are narrowed the same way and
against the same base: `init` writes `inspection: 'branch'`, so a rule keeps a report only when the
range it points at meets a line the branch added ([inspection.mjs](../tools/eslint/inspection.mjs)).
The exceptions, all deliberate: `tailwind-patterns` writes two of ESLint's own rules
(`no-restricted-syntax`, `no-restricted-imports`) and those still see the whole file; a repository
that removes the setting gets whole-file linting; and a file git does not track yet is reported in
full, because a new file is all new. Each check has its own regression test: the ESLint
RuleTesters, `test/inspection.test.js` for the gate itself, `python/tests/test_structure.py`, and
the real-`oxlint` deletion test for the fallow script.

## Advisory

Reported, but never fails a hook `init` installs.

| Check | Where | Why it does not gate |
| --- | --- | --- |
| fallow `"warn"` rules (`unused-exports`, `unused-types`, `duplicate-exports`, `unused-enum-members`, `unused-class-members`) | pre-push | a signal worth reading, with legitimate exceptions |
| `slop-patterns/no-trivial-wrapper` and `slop-patterns/no-chained-type-assertions` at `warn` | the repository's own oxlint config | a forwarding function can be required by a framework or mirror an interface, and a test double has to stand in for a type it is not; #20 is one such wrapper |
| `pnpm structure:brief` (`fallow review --brief`) | a script the reviewer runs | a "where to look" brief; it always exits 0 |

Because the installed ESLint sets use `error`, a repository that downgrades one rule to `warn`
gets report-only behavior for it: ESLint exits 0 on warnings. `init` leaves that choice alone.

## Report-only

Never gates.

| Check | Where | Why |
| --- | --- | --- |
| `structure_check.py --score` (scb-check verbosity, erosion, cognitive erosion) | run by hand | a benchmark signal for comparing two runs; it moves for reasons a diff cannot see, so it is deliberately not a pre-push step |

## False-positive limits

`slop-patterns` deliberately exempts the two shapes that are forwarding but required: a SvelteKit
parameter matcher in `src/params/<name>.ts` and a test double in a test file. `#20` is the record
of the first; `test/slop-patterns.test.js` covers both, plus the equivalent wrapper outside those
paths, which is still reported. The error-handling and tailwind sets carry their own valid
fixtures for the interface mirrors they leave alone.

The scoring output above is not a claim about the code: it is scb-check's composite, reported so
two runs can be compared with a published SlopCodeBench run. The cognitive measure the gate does
use is held to the pinned scorer by the differential test in
[docs/adr-0001-cognitive-measure.md](adr-0001-cognitive-measure.md).
