# lint-kit

An installer for the deterministic tools a repository uses: lint rules for **Svelte 5 /
SvelteKit**, **i18n**, **Tailwind / shadcn**, **error handling**, **indirection that adds
nothing** and **FastAPI**, the type checkers, and pre-push checks that a branch leaves the code's
structure no worse than its base. Each message says what to write instead.

`init` copies the rules into the repository's `tools/` folder and writes the tools' own config.
Nothing it leaves behind is named after it, and nothing depends on this repository afterwards:
the repository owns the copies, and only whoever runs `init` needs access here.

| Set | Tool | What it checks |
| --- | --- | --- |
| `svelte-skills` | ESLint | 22 rules: runes instead of Svelte 4 syntax, remote functions, throw-less `error()` / `redirect()`, `$state` written in `$effect` / `$derived`, `{@const}`, index and volatile `{#each}` keys… |
| `untranslated-text` | ESLint | text users read comes from the message catalogue (Paraglide `m.key()`) |
| `tailwind-patterns` | ESLint | `h-screen` / `vh`, `transition-all`, `dark:` overrides outside `ui/`, `bg-white` with dark mode, dialogs without a title, the `@lucide/svelte` barrel |
| `error-handling` | ESLint | catch blocks (and promise `.catch()`) that drop the error, only log it, return a fixed default, or turn it into a string |
| `slop-patterns` | oxlint | a named function whose whole body forwards its arguments to another function |
| `fastapi` | flake8 | FAP001–017: blocking calls reached from `async def`, Pydantic v1 config, `...` defaults, `Annotated` dependencies, router-level guards, bare status codes… |
| `typecheck` | svelte-check, pyright | the type checkers, as lefthook pre-push steps: `svelte-check --tsgo` (TypeScript 7's Go compiler) for Svelte projects, `pyright` for Python ones |
| `structure` | fallow, `structure_check.py` | lefthook pre-push steps that fail when a branch adds complexity, duplication, an import cycle or dead code its base did not have, and never on what was already there ([docs](docs/structure.md)) |

Each ESLint rule links to its section in the `.md` copied beside it in `tools/eslint/` (editors
show the link with the message); the FAP rules are listed in `tools/python/fastapi_rules.py`'s
docstring.

## Run it

```sh
npx github:shayshahal/lint-kit init          # or pin a release: github:shayshahal/lint-kit#v0.3.0
```

With this repository private, use a URL your git can clone it with, e.g.
`npx git+ssh://git@github.com/shayshahal/lint-kit.git init`.

It finds the repository's projects, asks which sets you want (defaults come from their
dependencies), installs the third-party tools with each project's package manager (and `uv` for
Python), copies the rules and writes the config.

**Projects.** In a monorepo, the JS projects are the workspace members (`pnpm-workspace.yaml`, or
`"workspaces"` in the root `package.json`), so a stray `package.json` in a scratch folder is not
one; without a workspace, every `package.json`. Python projects are every `pyproject.toml` with a
`[project]` table. Folders starting with `.`, `node_modules`, `dist` and `build` are skipped.
Each set goes into each project it fits, and with several projects a step's name ends in the
project's folder (`eslint-admin`, `svelte-check-shop`).

- **ESLint sets**, in each project that has an ESLint config or depends on Svelte, for the sets
  its dependencies call for (`svelte-skills`: svelte; `untranslated-text`: Paraglide;
  `tailwind-patterns`: tailwindcss; `error-handling`: svelte or typescript). The rules go to
  `tools/eslint/<set>.mjs`; the project's `eslint.rules.js` imports them with their options, and
  its ESLint config (`eslint.config.js`, or `.mjs` / `.cjs` / `.ts` / `.mts` / `.cts`) spreads it
  last. Without a config, the project gets an `eslint.config.js` with the Svelte / TypeScript
  parser setup.
- **fastapi**, in each Python project that depends on FastAPI: `tools/python/fastapi_rules.py`,
  loaded by flake8 as a local plugin (`[flake8:local-plugins]` in `.flake8`, which also selects
  `FAP`); `[tool.fastapi-rules]` in `pyproject.toml`; and ruff's `FAST` and `ASYNC` rules in the
  ruff config ruff reads for the project (`ruff.toml`, or `[tool.ruff.lint]`). FAP holds only
  what those rules miss, so the set expects both. `flake8` and `ruff` become dev dependencies.
- **oxlint sets**, in each project that depends on oxlint or has an oxlint config, for the sets
  its dependencies call for (`slop-patterns`: oxlint). The plugin goes to
  `tools/oxlint/<set>/`, and the project's config gains its `jsPlugins` entry and its rule at
  `warn`: `.oxlintrc.json` / `.jsonc` and `oxlint.config.ts` / `.mts` are both edited in place,
  never rewritten, so the per-rule finding counts and comments these configs are hand-annotated
  with stay where they are. Without a config, the project gets a `.oxlintrc.json`. There is no
  lefthook step either: a repository that runs oxlint already has one.
- **lefthook**: when the repository has a `lefthook.yml`, pre-commit steps run ESLint on staged
  `src/` files, flake8 (FAP) on the app package, `check-deps` when `pyproject.toml` changes, and
  `ruff check`. The ESLint and ruff steps are skipped when a step already runs that tool for the
  project. Globs follow `glob_matcher`: under `doublestar` they are `dir/**/*.py`.
- **typecheck**: pre-push steps, since a type checker needs the whole project, not the staged
  files: `svelte-kit sync && svelte-check --tsgo` for each Svelte project, `uv run pyright` for
  each Python one. `--tsgo` needs TypeScript 7 next to the 6 svelte-check loads Svelte with, so
  `init` adds `svelte-check` and `@typescript/native@npm:typescript@7` if they are missing. Like
  svelte-check's `--incremental`, `--tsgo` skips `.svelte` files outside the tsconfig's root
  folder. On by default when the repository has a `lefthook.yml`.
- **structure**: pre-push steps that compare the branch with its base. `fallow audit` runs at the
  workspace root (or in each JS project without a workspace), `tools/python/structure_check.py`
  in each Python project, which fails on a new complex function, new duplication or an import
  cycle the branch introduced. `--score` reports the verbosity and erosion composites
  SlopCodeBench records its results with, and never fails. The base comes from `--base`, else the `origin/<branch>...HEAD`
  lefthook's pre-push `files` diffs against, else `origin/HEAD`. `init` adds `fallow` and `jscpd`
  as dev dependencies, and `mccabe` to a Python project without flake8. A fallow root without a
  fallow config gets a `.fallowrc.json`, and `package.json` gets a `structure:brief` script:
  `fallow review --brief`, a "where to look" brief for a reviewer that always exits 0. On by
  default when the repository has a `lefthook.yml`. See [docs/structure.md](docs/structure.md).

**Re-running** copies `tools/` again (the copies are the installer's: edit the options in
`eslint.rules.js` and the config files, not the copies) and adds what is missing: a set, a
project, a step. It never removes anything; sets already there default to yes and stay in
`eslint.rules.js`. To drop a set, delete its config and steps by hand. Config files you edited
are left as they are; `eslint.rules.js` is rewritten when a set is added, and the previous one
kept as `eslint.rules.js.bak`.

Options: `--sets svelte-skills,fastapi` and `--yes` skip the questions, `--no-install` writes
files only, `--base <branch>` names the branch structure compares with, `--cwd <dir>` runs it on
another repository.

## ESLint sets

All four expect the Svelte and TypeScript parsers to be set up (eslint-plugin-svelte's
recommended config, `@typescript-eslint/parser`), and default to `src/**` with tests, specs and
stories left out. The options, in `eslint.rules.js`:

```js
import svelteSkills from './tools/eslint/svelte-skills.mjs';
import untranslatedText from './tools/eslint/untranslated-text.mjs';
import tailwindPatterns, { classRule } from './tools/eslint/tailwind-patterns.mjs';
import errorHandling from './tools/eslint/error-handling.mjs';

export default [
	...svelteSkills.config({ ignores: ['src/legacy/**'] }),
	...untranslatedText.config({
		allow: ['Acme( Inc)?'], // regex sources of strings that are not text
		bannedInCode: '[\\u0590-\\u05FF]', // a script no string in code may contain
		locales: ['he', 'en'], // an inline { he, en } pair counts as translated
		inlineLocales: false, // lang === 'en' ? 'X' : 'Y' passes (components without a catalogue)
		messages: { text: 'Use messages/en.json via m.key().' },
	}),
	...tailwindPatterns.config({
		uiFiles: ['src/lib/components/ui/**'],
		darkMode: true,
		// ESLint keeps one list per rule: add your own patterns here, not in a later entry
		extra: [{ selector: "CallExpression[callee.object.name='toast'][callee.property.name='error']", message: 'Use notify.error.' }],
		extraUi: classRule(String.raw`/(^|\s)text-destructive(\s|$)/`, 'Use text-error-text.'),
		restrictedImports: [{ name: 'svelte/transition', importNames: ['fly'], message: '…' }],
	}),
	...errorHandling.config(),
];
```

`svelteSkills.config()` also turns on three eslint-plugin-svelte rules: `valid-compile` with
warnings, `require-each-key` and `prefer-style-directive`. The plugins are exported too
(`svelteSkills.plugin`, `untranslatedText.plugin`, `tailwindPatterns.plugin`,
`errorHandling.plugin`) for wiring rules one by one.

`eslint --fix` rewrites what has one right answer: `class:` directives into the class attribute,
`{@const}` into `$derived`, `throw error()` into `error()`, `$derived(() => …)` into
`$derived.by`, and `h-screen` / `[90vh]` into `h-dvh` / `[90dvh]`.

## oxlint sets

```jsonc
// .oxlintrc.json — added by init, and the project's from then on
{
	"jsPlugins": [{ "name": "slop-patterns", "specifier": "./tools/oxlint/slop-patterns/index.ts" }],
	"rules": { "slop-patterns/no-trivial-wrapper": "warn" }
}
```

`slop-patterns` holds the waste patterns a rule can name a replacement for. Two of the three
SlopCodeBench measures are deliberately absent: a single-use function is mostly a route handler
or a lifecycle hook a framework calls by name, and a single-method class is mostly a middleware
or an exception. Over a 7,200-file SvelteKit monorepo those found 1,337 and 0 — see
[tools/oxlint/slop-patterns/README.md](tools/oxlint/slop-patterns/README.md).

Both oxlint config syntaxes are written into, because oxlint loads one config per directory and a
`.oxlintrc.json` beside a `oxlint.config.ts` would leave neither working. A TypeScript config is
found through its `defineConfig(` call, not the first `{` in the file — an
`import { defineConfig } from 'oxlint'` has one of those first — and its keys are written bare:

```ts
// oxlint.config.ts — the same two entries, in its own syntax
import { defineConfig } from 'oxlint';

export default defineConfig({
	jsPlugins: [{ name: 'slop-patterns', specifier: './tools/oxlint/slop-patterns/index.ts' }],
	rules: {
		'no-console': 'error', // an existing member keeps its comment, and gains its comma
		'slop-patterns/no-trivial-wrapper': 'warn',
	},
});
```

A config in neither shape (no `export default` to insert into) is left alone, with the two lines
to add printed instead.

`no-trivial-wrapper` reports a named function whose whole body is one call passing its own
arguments on unchanged. It passes a transformed, reordered or added argument, a default value,
an anonymous callback, a body with more than one statement, and a callee that computes its own
receiver (`new Intl.NumberFormat(…).format`). It leaves test files alone — a test double's `get`
and `set` forward to a `Map` because they must mirror the real signature — and `src/params.ts`,
where SvelteKit names the matchers and calls them from the router.

The set lands at `warn`. Rules are checked with `node --test test/slop-patterns.test.js`.

## fastapi

```toml
[tool.fastapi-rules]
app = "app"   # the application package, relative to pyproject.toml

[tool.fastapi-rules.dependencies]
weasyprint = ["weasyprint.HTML"]   # calls into it that block the event loop
inhouse-sdk = "async client only"  # or why it is safe in async code
```

```ini
# .flake8
[flake8]
select = FAP

[flake8:local-plugins]
extension =
    FAP = fastapi_rules:Plugin
paths =
    ../tools/python
```

FAP001 follows calls through your own sync helpers across modules, so it indexes the app package
once per run. Common libraries (bcrypt, boto3, pandas, openpyxl, reportlab, requests, Pillow,
sync redis / pymongo…) come classified; `python tools/python/fastapi_rules.py check-deps` fails
while a `[project.dependencies]` entry is classified nowhere, so adding a library means deciding.

## Develop

`tools/` holds exactly what `init` copies; `python/` is the dev environment for `tools/python`.

```sh
pnpm install && (cd python && uv sync)
pnpm test                      # RuleTester for every ESLint rule, and init end to end
(cd python && uv run pytest)   # every FAP rule, and structure_check.py (uses jscpd from pnpm install)
```

To release, bump the version in `package.json` and the pinned command above
(`test/version.test.js` fails until they agree). Once CI passes on `main`, the Release workflow
tags `v<version>` and publishes a GitHub release.
