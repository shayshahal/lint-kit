# policy-guard

Reports an unapproved change to an enrolled checker configuration. The command is available as a
copied file at `tools/policy/policy-guard.mjs` — installer wiring that copies it during `init` is
deferred (#43), so today it is copied or run manually. The guard reads only Git objects and
files, and imports and executes no repository code. An `opaque` enrollment is protected as a
whole path, while a `jsonc` enrollment is read with `jsonc-parser` and compared by the declared
identity's direction.

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
- No `pre-commit`/index mode, installer wiring or CI approval integration. Those are separate
  issues.
- Numeric floor identities (a `min` numeric threshold such as a coverage percentage) are **not**
  supported: the frozen Fallow format has no such identity, so no floor key is fabricated. The
  `min` direction is exercised by the `rules` severity floors. YAML/TOML checker adapters remain
  deferred, and an `opaque` enrollment still protects those files.
- Tested on Git `2.54.0` and the pinned Node 22 on Windows; CI also runs Ubuntu, which this local
  run does not prove.
