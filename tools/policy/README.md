# policy-guard

Reports an unapproved change to an enrolled checker configuration. The command is available as a
copied file at `tools/policy/policy-guard.mjs`: the opt-in `policy-guard` `init` set copies it and
the `lint-kit.policy.json` enrollment it reads, or it can be copied and run by hand. The guard
reads only Git objects and files, and imports and executes no repository code. An `opaque`
enrollment is protected as a whole path, while a `jsonc` enrollment is read with `jsonc-parser`
and compared by the declared identity's direction.

A repository declares the files the first release watches in `lint-kit.policy.json`. The guard
takes the source change since the merge-base of `--base` and `--target`, keeps the paths that are
enrolled, and judges each changed one against the trusted snapshot. A change whose target bytes
already match the trusted snapshot is not a new unapproved change; an `opaque` change is review,
and a parsed change that is equal or tighter is silent.

## Command

```sh
node tools/policy/policy-guard.mjs \
  --base origin/main \
  --target HEAD \
  --trusted-ref "$TRUSTED_REF" \
  --policy lint-kit.policy.json \
  --mode committed
```

| Option | Meaning |
| --- | --- |
| `--base <ref>` | Required. The source-change base. Resolved to a commit; never inferred from branch files. |
| `--target <ref>` | Required. The source snapshot under review, resolved to a commit. In `working-tree` mode it must be `HEAD`. |
| `--trusted-ref <ref>` | Required. The approved snapshot, selected outside the branch. The enrollment is read from this commit only; it is never defaulted to `HEAD`, the target or the working tree. |
| `--policy <path>` | Required. Repository-relative enrollment file, read from the resolved `--trusted-ref` commit. The file is enrolled automatically, so changing it needs review. |
| `--mode committed\|working-tree` | Required. `committed` compares the merge-base to the target commit; `working-tree` compares the merge-base to the target commit and additionally reads the working tree directly, adding in-scope untracked files and raw working-tree changes. |
| `--cwd <dir>` | Optional. The repository to inspect; defaults to the current directory. |

Refs are resolved with `git rev-parse --verify --end-of-options '<ref>^{commit}'`, so a ref such
as `--octopus` or `--output=file` fails with exit `2` and never becomes a Git option or writes a
file. Git discovery runs with `--no-ext-diff --no-textconv --literal-pathspecs`, and changed paths
are parsed from `git diff --name-status -M -z` output, which is NUL-safe for Unicode, space and
leading-dash names. `working-tree` never asks Git to diff the filesystem: the committed change is
object-to-object, untracked status comes from `ls-files` metadata, and every enrolled path is read
raw and compared with its merge-base object. A repository clean filter therefore cannot hide a
mutation, and no filter command runs.

## Exit codes

| Exit | Meaning |
| --- | --- |
| `0` | Clean, or advisory only. Non-enrolled changes are reported as advisory and never gate. |
| `1` | At least one unapproved enrolled change. |
| `2` | The check could not run: a missing or unresolvable input, a malformed policy, or a Git failure. Missing evidence is never clean. |

Findings are printed with the stable id `enrolled-change` and a project-relative location:

```
policy-guard: enrolled-change: .fallowrc.json (modified)
policy-guard: 1 unapproved enrolled change(s); review required (local feedback is not authorization)
```

A local run is feedback, not authorization. Required CI blocks both `1` and `2`, and only the
protected forge process approves a policy change. Selecting a branch ref as `--trusted-ref` in a
local run is a caller choice, not CI authorization; a branch cannot grant its own exemptions
because the enrollment is read from the trusted commit and the policy file is self-protected.

## Enrollment format

`lint-kit.policy.json` is strict JSON. Unknown fields and unknown enum values are exit `2`; no
approval field is read.

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
        { "id": "health.maxCognitive", "unit": "score", "direction": "max" },
        { "id": "health.maxCrap", "unit": "score", "direction": "max" },
        { "id": "rules", "unit": "severity-map", "direction": "min" },
        { "id": "ignorePatterns", "unit": "glob-list", "direction": "subset" }
      ]
    },
    { "id": "python-structure", "source": "tools/python/structure_check.py", "format": "opaque" }
  ]
}
```

- `version` must be `1`.
- Every enrollment declares `id` (unique, non-empty), `source` (repository-relative, forward-slash
  after normalising `\`) and `format`.
- `format: "opaque"` protects the whole file and declares no `adapter` or `identities`; an
  `opaque` source is parsed no further.
- `format: "jsonc"` requires the frozen `fallow-jsonc` adapter and a non-empty `identities` array
  of `{ id, unit, direction }`, each checked against the adapter's known Fallow identities below.

## Parsed identities (`fallow-jsonc`)

`health.maxCognitive`, `health.maxCrap`, `rules` and `ignorePatterns` are the identities real
Fallow configuration has. An enrollment declares each one's `id`, `unit` and `direction`, and the
adapter rejects a declaration that disagrees with the identity's actual semantics (exit `2`), so a
forged `min` floor on a `max` ceiling cannot turn a rise into a clean result.

| Identity | Unit | Direction | A weakening |
| --- | --- | --- | --- |
| `health.maxCognitive` | `score` | `max` | the number rises |
| `health.maxCrap` | `score` | `max` | the number rises |
| `rules` | `severity-map` | `min` | a rule is removed, or its severity falls (`off < warn < error`); a new rule below `error` |
| `ignorePatterns` | `glob-list` | `subset` | the literal list gains a pattern (including `**`); replacing a glob is a review, not a guessed subset |

The value is read from the enrolled `source` at `--trusted-ref` and at the target; the enrollment
stores no number or severity. A change outside the declared identities — another key, a comment,
or whitespace — is `enrolled-unrecognized` and requires review, so parsing does not silently drop
the rest of the file. A missing, wrong-typed or non-JSONC value is exit `2`, never a default.

The enrollment file, the `--trusted-ref` source and the target source are each decoded as strict
UTF-8 before parsing. An invalid byte is exit `2` rather than being replaced with U+FFFD, so it
cannot read the same as a literal U+FFFD in the trusted snapshot and pass silently. A byte-order
mark is kept as text, so adding or removing one is a visible edit, not an implicit normalization.

The parser is loaded only when a `jsonc` enrollment has a changed source, so an `opaque`-only
repository never needs it. If the copied command cannot load `jsonc-parser`, the run exits `2`
rather than failing as an uncaught module error.

Findings name the identity and direction:

```
policy-guard: enrolled-change: .fallowrc.json (modified)
policy-guard: enrolled-weakened: health.maxCognitive raised from 25 to 40 (a max ceiling must not rise)
```

## Trusted CI (#44)

The template at `tools/policy/policy-guard-ci.yml` runs the guard from a protected revision so a
pull request cannot replace the checker, change its base, delete the enrollment or grant its own
exemption. It is **guidance, not an installed check**: `init` copies it beside the guard and never
writes anything under `.github/workflows/`. Copy it to `.github/workflows/policy-guard.yml` by
hand, and only after the external protections below are in place.

The job checks out the PR's **base commit** — not the PR — and runs
`node tools/policy/policy-guard-ci.mjs`. That helper fetches the base, head and trusted commits by
id into a fresh throwaway data repository and runs the guard in `committed` mode. Only `git fetch`
and `git cat-file` read the PR; no PR file is checked out, imported, sourced, installed or executed,
and no title, branch name or owner string is interpolated into a shell. The workflow permissions
are `contents: read`; it holds no write or secret privilege, so the job can never push, change a
check or a setting. Both exit `1` (an unapproved enrolled change) and exit `2` (the check could not
run) fail the job, so a missing trusted input is never clean.

What this guarantees, and only this: the guard binary, the enrollment and the parser are the
trusted revision's, and the PR is read as data. It does **not** by itself prove that the reported
check is the one a branch protection rule requires. A required status check is identified by its
name, and a branch can add a same-named workflow; the name `policy-guard` alone is not a unique
identity. To bind the check, a maintainer must use a protected mechanism that pins this exact
workflow — a ruleset **required workflows** entry, or an equivalent trusted check source — and keep
the base branch protected. `pull_request_target` is used so the workflow file comes from the base
branch, but that is a starting point, not the binding.

External actions a maintainer must take (none installed here):

1. Protect the base branch (require reviews; no force push; no direct push). A weakening policy
   pushed straight to base would become the trusted policy.
2. Bind this exact workflow as a required check through a ruleset required-workflows entry or an
   equivalent trusted source, rather than relying on the job name.
3. Keep the workflow and `lint-kit.policy.json` under that protected review.
4. Provision the frozen parser from the trusted revision's own lockfile, not the PR's (the template
   uses `pnpm install --frozen-lockfile --ignore-scripts`; substitute the repository's package
   manager). `init --sets policy-guard` adds `jsonc-parser` `3.3.1` to the root `package.json`.

### What is tested, and what is not

- Tested locally on Windows with a real local Git repository and the real copied helper: clean,
  weakened and tightened heads; a replaced guard, a package install hook, a `.npmrc` and a marker
  script that must never run; a deleted trusted enrollment; a missing parser; an unresolvable head;
  a malformed event; a refused non-`https`/`file` remote; a source base distinct from the trusted
  policy; an advanced base that still finds the merge base; and two different pull request heads.
  The template's own `run` command is parsed and executed against the fixture.
- Not tested here: GitHub Actions/Ubuntu execution, and the head-association and protection binding
  above. This repository's `main` is currently **unprotected** and has no effective rules, and there
  is no authorized external consumer, so a required-check binding was neither created nor observed.
  Those are release-gate blockers recorded, not adopter evidence. A local run is feedback, not
  authorization, and only the protected forge process approves a policy change.

## Limits

- `working-tree` mode compares the enrolled file's raw working-tree bytes with the trusted blob,
  and `--target` must be `HEAD`. A consumer whose checkout rewrites line endings (`core.autocrlf`)
  can therefore see an enrolled path reported when the committed content already matches the
  trusted snapshot. This is deliberate conservative review — reading raw bytes is what stops a
  clean filter from hiding a mutation — not a false clean. A consumer that wants no such review
  should pin `* text=auto eol=lf` in `.gitattributes`.
- `working-tree` mode reads the working tree directly for every enrolled path, so an enrolled
  change committed and then reverted in the working tree still has its committed form in the
  object-to-object change and is compared against the trusted snapshot. CI runs `committed` mode.
- No `pre-commit`/index mode. `working-tree` mode is what the installed pre-push script runs, so
  partial staging is judged by the working tree, not the index. No local run is authorization; the
  trusted CI template above is a manual maintainer action, and a branch's own copy of the guard,
  workflow or policy never authorizes anything.
- Numeric floor identities (a `min` numeric threshold such as a coverage percentage) are **not**
  supported: the frozen Fallow format has no such identity, so no floor key is fabricated. The
  `min` direction is exercised by the `rules` severity floors. YAML/TOML checker adapters remain
  deferred, and an `opaque` enrollment still protects those files.
- Tested on Git `2.54.0` and the pinned Node 22 on Windows; CI also runs Ubuntu, which this local
  run does not prove.

## Installed by `init`

`init --sets policy-guard` copies this command, the trusted-CI helper `policy-guard-ci.mjs` and
the manual template `policy-guard-ci.yml` into `tools/policy/`, writes a single
`lint-kit.policy.json`, wires one repository-root pre-push script, and provisions the parser the
`jsonc` adapter needs. It writes no `.github/workflows/` file and activates no check. What that set
can and cannot do:

- The script is a shell script, not a file-filtered command, so a deletion-only push still runs it.
  It runs `--mode working-tree` with an explicit `--base` and `--trusted-ref`, and exits `2` (never
  clean) when the trusted enrollment, the base or the parser needed for a parsed enrollment is
  missing. An existing command is recognised only when it has no file filter and the step is
  exactly `{ run }` for the supported run with an approved ref; a filtered command is a manual
  action.
- The generated manifest enrolls only what a fresh install can verify: the copied command as
  `opaque`, each real Fallow JSONC source with only the identities it provably has, and each copied
  checker/config source the release protects whole as `opaque`. An enrollment's `id` is its source
  path, so two configs a slug would fold together stay distinct. A config that is not a regular
  UTF-8 file is left unchanged and enrolled nowhere. A repeat never rewrites or broadens an
  existing manifest; an enrollment edit is a reviewed policy change.
- The `jsonc` adapter loads `jsonc-parser` `3.3.1` from the repository root, because the command
  lives at `tools/policy/`. A dependency in a single workspace member does not resolve there.
  `init` adds `jsonc-parser@3.3.1` to a root `package.json`; a repository without one or
  `--no-install` is a manual action. A different declared version is preserved as it is: the copied
  guard does not check the declared version and loads the parser only when a parsed enrollment
  needs it, so that version is untested here. A missing parser (needed to compare a parsed
  enrollment) exits `2`.
- A fresh enrollment must be reviewed and landed at the trusted ref before the local guard can run;
  until then the guard exits `2`. The local hook is feedback, not authorization: required CI must
  run the same command from a trusted ref and block exit `1` and `2`. That CI wiring is not
  installed here.
