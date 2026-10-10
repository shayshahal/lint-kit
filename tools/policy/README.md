# policy-guard

Reports an unapproved change to an enrolled checker configuration. `init` copies this file into
`tools/policy/policy-guard.mjs`; the guard reads only Git objects and files, imports and executes
no repository code, and parses no checker format — an enrolled file is an opaque path whose
divergence from the trusted snapshot needs human review.

A repository declares the files the first release watches in `lint-kit.policy.json`. The guard
diffs the source change since the merge-base of `--base` and `--target`, keeps the paths that are
enrolled, and reports each one whose target bytes differ from the trusted snapshot. A change whose
target bytes already match the trusted snapshot is not a new unapproved change.

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
| `--mode committed\|working-tree` | Required. `committed` diffs the merge-base to the target commit; `working-tree` diffs the merge-base to the working tree and adds in-scope untracked files. |
| `--cwd <dir>` | Optional. The repository to inspect; defaults to the current directory. |

Refs are resolved with `git rev-parse --verify --end-of-options '<ref>^{commit}'`, so a ref such
as `--octopus` or `--output=file` fails with exit `2` and never becomes a Git option or writes a
file. Git discovery runs with `--no-ext-diff --no-textconv`, and changed paths are parsed from
`git diff --name-status -M -z` output, which is NUL-safe for Unicode, space and leading-dash
names.

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
        { "id": "health.maxCognitive", "unit": "score", "direction": "max" }
      ]
    },
    { "id": "python-structure", "source": "tools/python/structure_check.py", "format": "opaque" }
  ]
}
```

- `version` must be `1`.
- Every enrollment declares `id` (unique, non-empty), `source` (repository-relative, forward-slash
  after normalising `\`) and `format`.
- `format: "opaque"` protects the whole file and declares no `adapter` or `identities`. This
  slice treats every enrolled source as opaque.
- `format: "jsonc"` requires the frozen `fallow-jsonc` adapter and a non-empty `identities` array
  of `{ id, unit, direction }`. This slice validates the shape only; it reads no value, so it does
  not advertise parsed semantics.

## Limits

- `working-tree` mode compares the enrolled file's raw working-tree bytes with the trusted blob,
  and `--target` must be `HEAD`. A consumer whose checkout rewrites line endings (`core.autocrlf`)
  can therefore see an enrolled path reported when the committed content already matches the
  trusted snapshot; the result is fail-closed review, not a false clean.
- `working-tree` mode inspects the working tree relative to the merge-base, so an enrolled change
  committed and then reverted in the working tree is not reported by this mode. CI runs
  `committed` mode.
- No `pre-commit`/index mode, semantic value comparison, installer wiring or CI approval
  integration. Those are separate issues.
- Tested on Git `2.54.0` and the pinned Node 22 on Windows; CI also runs Ubuntu, which this local
  run does not prove.
