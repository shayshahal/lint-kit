# Supported installation shapes

What `init` wires, and what it does when it meets a shape it does not understand. Every supported
row is covered by a workflow test that runs `init` and the installed tool or hook, not only a
string helper; every unsupported shape is left byte-for-byte as it was found, with the manual
action named. `init` never reports a wiring it did not make.

## Oxlint (`slop-patterns`)

| Config shape | Handling |
| --- | --- |
| `.oxlintrc.json`, `.oxlintrc.jsonc` | Patched in place. The root object is the first `{` outside comments; members are found at depth 1. Quoted keys, `//` and `/* */` comments, compact or multiline layout, any member order, and empty containers are all supported. Existing rules, comments and order are preserved. |
| `oxlint.config.js` / `.mjs` / `.cjs` / `.ts` / `.mts` / `.cts` | Patched in place. The root object is found through `defineConfig({`, `export default {` or `module.exports = {`; keys may be bare or quoted. |
| No config | A fresh `.oxlintrc.json` with `jsPlugins`, `rules` and (when nameable) `ignorePatterns`. |
| The plugin already registered | No duplicate entries. An install that predates the vendored ignore pattern gains it; otherwise the run says the config already loads the plugin. |
| A root object not recognizable (e.g. `export default [...]`) | Left exactly as found; the run prints the `jsPlugins` and `rules` entries to add. |

The `jsPlugins` specifier is relative to the config's own folder. `ignorePatterns` gains
`<folder>/**` only when that folder is neither `.` nor starts with `..`: oxlint resolves the
patterns inside the config's directory and refuses `..`, and a folder beside the config would
ignore the config's whole directory. Those cases keep their deliberate omission.

## Projects

Root projects, pnpm / npm workspace members, and Python projects (`pyproject.toml` with a
`[project]` table). A nested project's specifier is project-relative, and its ignore pattern is
omitted when it cannot safely name the root's `tools/`. Folders starting with `.`, and
`node_modules`, `dist` and `build`, are skipped.

## Hooks

Hook steps need a `lefthook.yml` or `lefthook.yaml`; without one, typecheck, structure and the
policy guard are not installed and the run says so. pre-commit gets eslint, flake8 (FAP), the
FastAPI dependency check and ruff; pre-push gets svelte-check / pyright, fallow (as a script, so a
deletion-only push still runs it), the Python structure check, and the policy guard (also as a
script). A step that already runs the same tool for the project is left alone, and a repository
that already runs `fallow audit` in a command keeps it and gets no script.

## Policy guard (`policy-guard`)

Opt-in. `init` copies `tools/policy/policy-guard.mjs` and its README, writes one
`lint-kit.policy.json`, and wires one repository-root pre-push script.

| Config shape | Handling |
| --- | --- |
| `.fallowrc.json`, `.fallowrc.jsonc` | The frozen `fallow-jsonc` adapter. The manifest enrolls only the identities the real JSONC provably has (`health.maxCognitive`, `health.maxCrap`, `rules`, `ignorePatterns`), each present and already the type its unit compares. The number, severity or ignore list itself stays in the checker's file; the enrollment declares a link, never a value. |
| A Fallow config the adapter cannot read, or an unknown/executable Fallow shape (`fallow.toml`, `.fallow.toml`, `fallow.config.{js,mjs,cjs,ts}`) | Protected `opaque`; the file is never parsed or evaluated, and the run says so. |
| `tools/policy/policy-guard.mjs` | `opaque`, so a silent edit to the guard itself is an enrolled change. |
| `tools/python/structure_check.py`, when present | `opaque`. |
| An existing `lint-kit.policy.json` | Left byte-for-byte. A repeat never rewrites or broadens it; a new enrollment is a reviewed policy change made by hand. |
| A pre-push step that already runs the guard | A repository-root script whose step is exactly `{ runner: bash }` and whose body is the exact generated body, or a command that is exactly `{ run }` for the supported repository-root working-tree run with an approved (plain, non-`HEAD`) ref, is recognised and nothing is added. Any other shape that names the copied command is preserved with the supported step printed, never called equivalent. |
| An orphan `.lefthook/pre-push/policy-guard.sh` with no configured step | Left byte-for-byte unless its body is the exact generated body, in which case the step is wired without rewriting it. A directory, symbolic link or unreadable file is never followed or overwritten. |
| No `lefthook.yml` | No step is wired and no file or config is created; the complete manual action (the script body with an explicit base and trusted ref, and the yml) is printed. |
| No root `package.json` | `jsonc-parser@3.3.1` is not installed; a manual action is printed and `init` creates no package. A different declared version is preserved as it is, with a manual message: the copied guard does not check the declared version and loads the parser only when a parsed enrollment needs it, so that version is untested here. |

The script is not file-filtered, so a deletion-only push still runs it. It runs
`--mode working-tree` with an explicit `--base` and `--trusted-ref`; a local run names the same ref
for both, deliberately, and the guard never defaults the trusted snapshot to `HEAD`. An existing
pre-push command runs either way only when it has no file filter: a command with a `glob` or
`files` filter is skipped when the push leaves no matching file, so that shape is a manual action,
not an equivalent. The parser resolves from the repository root, because the command lives at
`tools/policy/`: a dependency in one workspace member does not resolve there. A missing base, a
missing enrollment at the trusted ref, or a missing parser (needed to compare a parsed enrollment)
exits `2`, never clean.

Protected and deferred: the first release protects the copied guard as a whole, each readable
Fallow JSONC source by its declared identities, and `tools/python/structure_check.py` whole.
YAML/TOML checker adapters (Python thresholds in `pyproject.toml`, `.flake8`, ruff) are deferred;
those files are not enrolled.

## Baseline selection

The branch a structure or policy-guard step compares against, in order:

1. `--base <branch>` (a bare name means `origin/<branch>`);
2. the `--base` an existing structure step already names — a command's `run` or the fallow
   script's body, any remote or local ref;
3. the `origin/<branch>...HEAD` that lefthook's `pre-push.files` diffs against;
4. `origin/HEAD`;
5. `origin/main`, with a message that says so.

## Fresh, upgrade, repeat

A fresh install copies `tools/`, writes or patches the configs and adds the dev dependencies. An
upgrade refreshes the copies, repairs a registered plugin that lacks the vendored ignore pattern,
and leaves user configs and steps as they are. A repeat run changes nothing.

## Unsupported shapes

An ESLint config with neither `export default` nor `module.exports`, and an oxlint config whose
root object cannot be found, are both left exactly as found; the run prints the entries to add and
goes on with the other projects and sets.
