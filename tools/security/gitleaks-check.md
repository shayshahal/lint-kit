# gitleaks-check

The copied command that runs the pinned **Gitleaks 8.30.1** scanner over a repository and answers
three separate questions: what this branch introduced, what it inherited, and whether the check
could run at all. It is a wrapper, not a detector — the rules are Gitleaks' own, selected by
`gitleaks.toml` beside this file.

```sh
node tools/security/gitleaks-check.mjs --gitleaks /path/to/gitleaks-8.30.1
node tools/security/gitleaks-check.mjs --mode history --gitleaks gitleaks
```

The executable is not downloaded or installed here: point `--gitleaks` at a Gitleaks 8.30.1 binary,
or leave it out to use `gitleaks` on `PATH`. A different version is refused.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | branch mode: nothing introduced; history mode: nothing found |
| `1` | findings that fail: introduced findings in branch mode, any finding in history mode |
| `2` | the check could not run — never "no findings" |

Every one of these is exit `2`: a missing or non-executable binary, a version other than 8.30.1, a
missing or invalid config, a timeout, a Gitleaks error, a malformed or missing report, a report with
a non-redacted value, a source `.gitleaksignore`, an unresolvable `--base`, and a missing source
directory. A branch must not turn any of them into a pass; do not append `|| true`, and let CI block
on `1` **and** `2`.

## Modes

**`--mode branch`** (the default) is the branch gate. It resolves a base — `--base <ref>`, else
`origin/HEAD`, else `origin/main` — takes the merge-base with `HEAD`, and runs two scans:

- `gitleaks git` over the commits between that merge-base and `HEAD`. A secret that was committed
  and later deleted is still in this range, so it still fails the branch.
- `gitleaks dir` over the working tree, including untracked files.

Every finding from the commit range is introduced. A working-tree finding is introduced when it sits
on a line the branch added since the merge-base, or in a file git does not track yet; otherwise it is
**inherited** and is printed but does not fail. That distinction is the whole point: the base's own
secrets never fail a branch, and the branch's own always do.

**`--mode history`** is the initial audit, run separately. It scans every commit and the working
tree, and every finding is a finding — including the commits a later one deleted. It exits `1` when
anything is found, and its job is incident remediation, not gating a branch.

## Redaction and output

Gitleaks runs with `--redact=100`, so its reports carry `REDACTED` in `Secret` and `Match`, and its
stdout and stderr are discarded rather than forwarded. The report is read, validated and deleted; the
only thing printed is allowlisted metadata:

```
gitleaks-check: gitleaks 8.30.1 branch scan of /repo at 68c3c61, base --base origin/main
gitleaks-check: introduced generic-api-key src/x.ts:3 commit 0a1b2c3
gitleaks-check: inherited generic-api-key src/y.ts:9 (not introduced by this branch; incident remediation, not a branch blocker)
gitleaks-check: introduced 1, inherited 1
```

A report that does not parse, is not an array, or whose finding is missing a rule/file/line or whose
`Secret` is not `REDACTED` is exit `2`; the value is never printed. Parsing lives in
[gitleaks-report.mjs](gitleaks-report.mjs).

## Exceptions

Only the narrow, documented entries in `gitleaks.toml` may excuse a value. The command closes the
usual ways a branch could widen its own exceptions:

- `--config` selects that file explicitly, so `GITLEAKS_CONFIG`, `GITLEAKS_CONFIG_TOML` and a
  `.gitleaks.toml` in the scanned repository cannot change the rule set; `GITLEAKS_*` is removed
  from the child environment as well.
- `--ignore-gitleaks-allow` means a `# gitleaks:allow` comment in the branch does not excuse a line.
- A `.gitleaksignore` in the source is refused (exit `2`), because Gitleaks reads that file even
  when `--gitleaks-ignore-path` names another one, and an ambient fingerprint list is an unreviewed
  exception.

`gitleaks.toml` extends the upstream default rules and allowlists lint-kit's one documented dummy
value (`9f4c2b7e1a8d6f3c5e0b9a2d7c4f1e8b`, a placeholder written into generated fixtures). A
different value under the same assignment is still reported. Add a consumer's reviewed placeholders
to their own `--config` file, one value at a time — do not use a test-directory pattern.

## Limits

- Version-locked to 8.30.1; the deprecated `detect`/`protect` subcommands are not used.
- Branch mode attributes a working-tree finding by its **start line**, and by the merge-base with the
  base, not by the branch's upstream. Renames are diffed as git reports them. A path git prints in a
  form this command cannot match is treated as introduced, so an unattributable path can never hide a
  secret.
- The output dedupes by rule/file/line, so a secret several commits hold, or one the commit range
  and the working tree both hold, is listed once.
- It scans what Gitleaks scans: text files it can read, not binary content or file history beyond
  git. It makes no claim beyond the selected rule set, and only what it printed is what it checked.
