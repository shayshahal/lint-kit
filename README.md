# lint-kit

Lint rules for **Svelte 5 / SvelteKit**, **i18n**, **Tailwind / shadcn** and **FastAPI**, with
an `init` command that installs only the sets a project picks. Each message says what to write
instead.

| Set | Linter | What it checks |
| --- | --- | --- |
| `svelte-skills` | ESLint | 22 rules: runes instead of Svelte 4 syntax, remote functions, throw-less `error()` / `redirect()`, `$state` written in `$effect` / `$derived`, `{@const}`, index and volatile `{#each}` keys… |
| `untranslated-text` | ESLint | text users read comes from the message catalogue (Paraglide `m.key()`) |
| `tailwind-patterns` | ESLint | `h-screen` / `vh`, `transition-all`, `dark:` overrides outside `ui/`, `bg-white` with dark mode, dialogs without a title, the `@lucide/svelte` barrel |
| `fastapi` | flake8 | FAP001–017: blocking calls reached from `async def`, Pydantic v1 config, `...` defaults, `Annotated` dependencies, router-level guards, bare status codes… |

## Install

```sh
npx github:shayshahal/lint-kit init
```

It asks which sets you want (defaults come from your dependencies), installs them from git with
your package manager (and `uv` for the Python plugin), and writes the config:

- **ESLint sets:** `eslint.lint-kit.js` holds lint-kit's entries; `eslint.config.js` spreads it
  last. Without an ESLint config, you get one with the Svelte / TypeScript parser setup. Re-run
  `init` to add or remove sets.
- **fastapi:** `[tool.lint-kit-fastapi]` in `pyproject.toml`, `FAP` in `.flake8`, and two
  pre-commit steps in `lefthook.yml` when the repository has one.

Options: `--sets svelte-skills,fastapi` and `--yes` skip the questions, `--no-install` writes
config only, `--ref <tag or sha>` pins another version, `--python <dir>` points at the backend
in a monorepo.

By hand:

```sh
pnpm add -D github:shayshahal/lint-kit#v0.1.2
uv add --dev "lint-kit-fastapi @ git+https://github.com/shayshahal/lint-kit@v0.1.2#subdirectory=python"
```

## ESLint sets

All three expect the Svelte and TypeScript parsers to be set up (eslint-plugin-svelte's
recommended config, `@typescript-eslint/parser`), and default to `src/**` with tests, specs and
stories left out.

```js
import svelteSkills from 'lint-kit/svelte-skills';
import untranslatedText from 'lint-kit/untranslated-text';
import tailwindPatterns, { classRule } from 'lint-kit/tailwind-patterns';

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
];
```

`svelteSkills.config()` also turns on three eslint-plugin-svelte rules: `valid-compile` with
warnings, `require-each-key` and `prefer-style-directive`. The plugins are exported too
(`svelteSkills.plugin`, `untranslatedText.plugin`) for wiring rules one by one.

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
