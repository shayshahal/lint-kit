# lint-kit

Lint rules for **Svelte 5 / SvelteKit**, **i18n**, **Tailwind / shadcn**, **error handling** and
**FastAPI**, with an `init` command that installs only the sets a project picks. Each message says
what to write instead.

| Set | Linter | What it checks |
| --- | --- | --- |
| `svelte-skills` | ESLint | 22 rules: runes instead of Svelte 4 syntax, remote functions, throw-less `error()` / `redirect()`, `$state` written in `$effect` / `$derived`, `{@const}`, index and volatile `{#each}` keys… |
| `untranslated-text` | ESLint | text users read comes from the message catalogue (Paraglide `m.key()`) |
| `tailwind-patterns` | ESLint | `h-screen` / `vh`, `transition-all`, `dark:` overrides outside `ui/`, `bg-white` with dark mode, dialogs without a title, the `@lucide/svelte` barrel |
| `error-handling` | ESLint | catch blocks (and promise `.catch()`) that drop the error, only log it, return a fixed default, or turn it into a string |
| `fastapi` | flake8 | FAP001–017: blocking calls reached from `async def`, Pydantic v1 config, `...` defaults, `Annotated` dependencies, router-level guards, bare status codes… |

Each ESLint rule links to its section in [`docs/`](docs) (editors show the link with the
message); the FAP rules are listed in the module docstring (below).

## Install

```sh
npx github:shayshahal/lint-kit init
```

It asks which sets you want (defaults come from your dependencies), installs them from git with
your package manager (and `uv` for the Python plugin), and writes the config:

- **ESLint sets:** `eslint.lint-kit.js` holds lint-kit's entries; your ESLint config
  (`eslint.config.js`, or `.mjs` / `.cjs` / `.ts` / `.mts` / `.cts`) spreads it last. Without
  one, you get an `eslint.config.js` with the Svelte / TypeScript parser setup.
- **fastapi:** `[tool.lint-kit-fastapi]` in `pyproject.toml`, `FAP` in `.flake8`, and ruff's
  `FAST` and `ASYNC` rules in the ruff config ruff reads for the backend (`ruff.toml`, or
  `[tool.ruff.lint]`), added to `extend-select` with a comment naming what was added. FAP holds
  only what those rules miss, so the set expects both. `ruff` becomes a dev dependency if it
  isn't one.
- **lefthook:** when the repository has a `lefthook.yml`, pre-commit steps run ESLint on staged
  `src/` files, flake8 (FAP) on the app package, `check-deps` when `pyproject.toml` changes, and
  `ruff check`. The ESLint and ruff steps are skipped when a step already runs that tool.

Re-run `init` to add or remove sets. Sets it installed before default to yes; turning fastapi off
removes the dev dependency, the settings table, the FAP selection, the ruff rules it added and the
lefthook steps (ruff itself stays installed). Turning every ESLint set off removes the ESLint step.

Options: `--sets svelte-skills,fastapi` and `--yes` skip the questions, `--no-install` writes
config only, `--ref <tag or sha>` pins another version, `--python <dir>` points at the backend
in a monorepo.

By hand:

```sh
pnpm add -D github:shayshahal/lint-kit#v0.2.0
uv add --dev "lint-kit-fastapi @ git+https://github.com/shayshahal/lint-kit@v0.2.0#subdirectory=python"
```

## ESLint sets

All four expect the Svelte and TypeScript parsers to be set up (eslint-plugin-svelte's
recommended config, `@typescript-eslint/parser`), and default to `src/**` with tests, specs and
stories left out.

```js
import svelteSkills from 'lint-kit/svelte-skills';
import untranslatedText from 'lint-kit/untranslated-text';
import tailwindPatterns, { classRule } from 'lint-kit/tailwind-patterns';
import errorHandling from 'lint-kit/error-handling';

export default [
	// …parsers
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

## fastapi

```toml
[tool.lint-kit-fastapi]
app = "app"   # the application package, relative to pyproject.toml

[tool.lint-kit-fastapi.dependencies]
weasyprint = ["weasyprint.HTML"]   # calls into it that block the event loop
inhouse-sdk = "async client only"  # or why it is safe in async code
```

```ini
# .flake8
[flake8]
select = FAP
```

FAP001 follows calls through your own sync helpers across modules, so it indexes the app package
once per run. Common libraries (bcrypt, boto3, pandas, openpyxl, reportlab, requests, Pillow,
sync redis / pymongo…) come classified; `lint-kit-fastapi check-deps` fails while a
`[project.dependencies]` entry is classified nowhere, so adding a library means deciding.

The rule list is in the module docstring: `python/src/lint_kit_fastapi/__init__.py`.

## Develop

```sh
pnpm install && (cd python && uv sync)
pnpm test                      # RuleTester for every ESLint rule, and init end to end
(cd python && uv run pytest)   # every FAP rule
```

To release, bump the version in `package.json`, `python/pyproject.toml`, the `Plugin` class in
`python/src/lint_kit_fastapi/__init__.py`, `python/uv.lock` and the install commands above
(`test/version.test.js` fails until they agree). Once CI passes on `main`, the Release workflow
tags `v<version>` and publishes a GitHub release.
