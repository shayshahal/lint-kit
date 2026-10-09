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

Hook steps need a `lefthook.yml` or `lefthook.yaml`; without one, typecheck and structure are not
installed and the run says so. pre-commit gets eslint, flake8 (FAP), the FastAPI dependency check
and ruff; pre-push gets svelte-check / pyright, fallow (as a script, so a deletion-only push still
runs it) and the Python structure check. A step that already runs the same tool for the project is
left alone, and a repository that already runs `fallow audit` in a command keeps it and gets no
script.

## Baseline selection

The branch a structure step compares against, in order:

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
