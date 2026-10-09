# Enforcement policy

Every check `init` installs is one of three kinds. The kind decides whether a finding fails the
hook, what severity the rule carries, and how the message reads. The checks are deterministic
rules or a comparison with the base; none of them is a guarantee about code quality, and the
scoring output is a signal, not a gate.

## Blocking

A finding fails the commit or push.

| Check | Where | Fails with |
| --- | --- | --- |
| ESLint sets (`svelte-skills`, `untranslated-text`, `tailwind-patterns`, `error-handling`), every rule at `error` | pre-commit (`eslint {staged_files}`) | ESLint exits 1 |
| flake8 FAP rules | pre-commit | flake8 exits 1 |
| ruff `FAST` / `ASYNC` | pre-commit | ruff exits 1 |
| `svelte-check --tsgo` (Svelte projects) | pre-push | svelte-check exits 1 |
| `pyright` (Python projects) | pre-push | pyright exits 1 |
| fallow `"error"` rules: dead code the branch introduced | pre-push (script) | `fallow audit` exits 1 |
| `structure_check.py`: a new / crossed complexity, new duplication, a new import cycle | pre-push | exits 1 |

A blocking check is only ever charged for what the branch introduced. The structure tools compare
with the merge-base of the branch and its base, and fallow reports an inherited finding as
inherited; what the base already had never fails. Each has its own regression test: the ESLint
RuleTesters, `python/tests/test_structure.py`, and the real-`oxlint` deletion test for the fallow
script.

## Advisory

Reported, but never fails a hook `init` installs.

| Check | Where | Why it does not gate |
| --- | --- | --- |
| fallow `"warn"` rules (`unused-exports`, `unused-types`, `duplicate-exports`, `unused-enum-members`, `unused-class-members`) | pre-push | a signal worth reading, with legitimate exceptions |
| `slop-patterns/no-trivial-wrapper` at `warn` | the repository's own oxlint config | a forwarding function can be required by a framework or mirror an interface; #20 is one such wrapper |
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
