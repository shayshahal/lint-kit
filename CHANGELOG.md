# Changelog

What each release changed, newest first. The section is named after the version in
`package.json`; the Release workflow tags `v<version>` and publishes that section as the release
notes, and `test/version.test.js` fails until the two agree.

## 0.4.0

The sets are charged only for what a branch adds, and two rule sets arrive.

- **The ESLint sets take `inspection`, and `init` writes `inspection: 'branch'`.** A rule reports
  only the lines the branch added or changed since the merge-base with its base, so installing a
  set on a repository that is already large no longer blocks the first commit on what was there
  before. `docs/enforcement.md` already said a blocking check does this, and it was not true of the
  sets until now. `full`, the default with no setting, reports the whole file. Re-running `init`
  over an existing install writes the option and keeps the previous `eslint.rules.js` as `.bak`.
- **`slop-patterns/no-chained-type-assertions`**: `input as unknown as User` throws away the type
  the value had and then claims one nobody checked. 43 findings over 1,431 files of the monorepo
  the other rules were measured on. Test files are exempt, as they are for `no-trivial-wrapper`.
- **A `prose` set, opt-in**: `no-jargon` (inflated vocabulary in a comment, with the plain word as
  an editor suggestion) and `prefer-jsdoc` (a `//` comment above an export or a member, autofixed
  to `/** */`). No dependency selects it — ask for it with `--sets prose`. 7 and 203 findings over
  791 files of the same monorepo.
- Fixed: on Windows the gate compared a path git spelled with the 8.3 short name (`RUNNER~1`)
  against the long one, so `path.relative` between the two was `..\..\..` and every report fell
  back to the whole file.

Left out on purpose, with the measurements in `tools/oxlint/slop-patterns/README.md`:
`type UserId = string` (2 findings), a class of nothing but statics (0), and the prose rules
`max-comment-length` and `no-em-dash` (1,510 and 16,969 — prose rather than slop).
