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

## Secret scanning (`secret-scanning`)

Never selected from a dependency — a `gitleaks` entry in a project changes nothing — so a
repository asks for it with `--sets secret-scanning`, and a later run keeps it on. The set is
repository-wide, not per project: it copies `tools/security/gitleaks-check.mjs`,
`gitleaks-report.mjs` and `gitleaks-check.md` and writes the selected config, and needs no project
dependency (the command uses Node built-ins only).

| Config shape | Handling |
| --- | --- |
| `lefthook.yml` / `lefthook.yaml` | One repository-root pre-push command, `node tools/security/gitleaks-check.mjs --base <resolved>` (branch mode: the merge-base commit range plus the working tree). The base is the installer's usual one (`--base`, an existing step's base, lefthook's pre-push `files`, `origin/HEAD`, else `origin/main`), embedded only when it is a plain ref. It fails the push on an introduced finding and on any failure to run — a missing or wrong-version Gitleaks, an invalid config, a timeout — never a skipped success. The step carries no `root`, because the command refuses a source that is not the Git root. |
| A pre-push step that already scans secrets (its own `gitleaks` command), or that names the copied command in a non-equivalent shape (`echo gitleaks-check`, `... \|\| true`, a `root`/`glob`/`skip`, `--mode history`) | Left exactly as found; the run prints a manual action with the repository-root command to add instead. |
| A resolved base that is not a plain ref (for example a `root`/shell-fragment base read from an existing step) | The generated shell command would have to embed it, so nothing is wired; the run prints the step to add by hand. |
| No lefthook config | Nothing is wired; the run prints the pre-push step to add. |
| `tools/security/gitleaks.toml` already present | Left byte-for-byte. Reviewed exceptions live there; a re-run copies the command, report reader and docs again but never rewrites or broadens this config. |
| A root `package.json` | Gains the separate remediation script `secret-scanning:history` (`node tools/security/gitleaks-check.mjs --mode history`). |

The scanner is **not installed**: the command uses `gitleaks` on `PATH` or `--gitleaks <path>`,
refuses any version but 8.30.1, and never downloads. Exact provisioning steps, with the recorded
SHA-256 per platform, are in the copied `tools/security/gitleaks-check.md`. A platform with no
recorded asset, or a repository whose policy needs different exceptions, is a manual action, not
a silent substitution. Offline, an already-provisioned binary is passed with `--gitleaks`; with
none, the command exits 2 and the push is blocked. The initial/history audit is separate from the
push and is remediation, not a branch gate. Writing the hook does not install a required check or
change any forge protection: the local hook is feedback only, and CI must run the command from a
trusted revision with a trusted tool and config.

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
