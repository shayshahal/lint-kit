/**
 * vitest: focused tests and asynchronous assertions that must be awaited or returned.
 *
 * Vitest focuses a run through `.only` on the test or describe function, and a focused test left in
 * a branch silently suppresses every other test in the file: the suite still passes, so the
 * coverage that went missing is reported nowhere. A floating promise chain fails the same way: it
 * runs its callback after the test has finished, so an expectation inside it never reports. The
 * checks are the rules `@vitest/eslint-plugin` maintains, wrapped so this set narrows them to the
 * lines a branch added like every other set (see inspection.mjs):
 *
 *   vitest/no-focused-tests          test.only / it.only / describe.only
 *   vitest/valid-expect              expect(…).resolves/.rejects not awaited or returned
 *   vitest/valid-expect-in-promise   a floating promise chain with an expectation in it
 *
 * Both async rules are syntactic: they resolve the `expect`/`test` bindings through scope analysis
 * and read the promise chain, and neither asks for type information, so no type-aware setup is
 * required or claimed. An assertion behind a project helper, or one reached through a reassigned
 * alias, is beyond what they can see.
 *
 * The runner evidence is test/fixtures/vitest-runner/unawaited-shape.test.js: the floating chain is
 * a silent pass and the returned chain is not. Vitest 4 attributes a dangling `.resolves` to the
 * running test rather than passing silently, so `valid-expect` is a stricter deterministic gate
 * than the runner's own detection; the awaited/returned form it writes is still the canonical one.
 *
 * The plugin pairs the two async rules in its own `recommended` config. They overlap on one shape:
 * a floating `.then`/`.catch`/`.finally` chain whose callback body is a single async assertion.
 * There `valid-expect` reports the chain `valid-expect-in-promise` already owns, and the
 * concise-arrow form reports both at the same node. The set keeps the rules as upstream ships them
 * instead of adding a cross-rule deduplicator: in the common block-body form the two reports are
 * two fixes the user has to make anyway, and the one same-node case is cleared by `valid-expect`'s
 * own autofix. `test/agent-skills-vitest-set.test.js` measures exactly which shapes overlap.
 *
 * No other rule from the plugin is turned on. Its `recommended` config would also enable the skip
 * rules, which are their own slice (#49), and this set adds nothing to oxlint or Jest: one engine
 * owns the shapes.
 *
 * Vitest exposes focus only through `.only`: `fit` and `fdescribe` are Jest names it does not
 * export, and `.only` cannot follow `.each(...)` (`test.each([…]).only` is a collection failure,
 * not a focused test). A prefix rule would have nothing to normalize, so none is selected.
 *
 * The rules apply to the standard `*.test.*` and `*.spec.*` files anywhere in the project, inside
 * or outside `src/`, so they do not depend on the application sets' `src/**` scope. Those sets are
 * unchanged: they keep their own `files` and `ignores`.
 */

import { createRequire } from 'node:module';
import { defineRule, settings } from './inspection.mjs';

/** Files the rules apply to: the project's tests wherever they live. */
export const DEFAULT_FILES = ['**/*.test.*', '**/*.spec.*'];
/** A `__tests__` file without a `.test.`/`.spec.` name is not matched; name it that way, or pass
 * `files`, to check it. */
export const DEFAULT_IGNORES = [];

const DOCS = new URL('./vitest.md', import.meta.url).href;

/**
 * The maintained plugin, loaded from the project that owns the set rather than from this shared
 * copy. `tools/eslint/` is one folder for every project in a repository and may sit outside all of
 * them, so a bare `import` would resolve `@vitest/eslint-plugin` from the wrong place: in an
 * isolated pnpm workspace the member's `node_modules` holds the plugin and the root's does not, so
 * the whole ESLint run would fail to load this module. `createRequire(from)` resolves it the way a
 * file beside the project's `eslint.rules.js` would — that project's `node_modules` first — and
 * the caller decides `from`, so it never reaches a sibling project.
 */
const loadPlugin = (from) => createRequire(from)('@vitest/eslint-plugin');

/** Where `@vitest/eslint-plugin` resolves from `from`, without loading it. */
const providerFile = (from) => createRequire(from).resolve('@vitest/eslint-plugin');

/** The upstream rule list this set turns on: focus, then the two async-assertion rules. */
export const UPSTREAM_RULES = ['no-focused-tests', 'valid-expect', 'valid-expect-in-promise'];

/** The loaded plugin with this copy's rules wrapped like every other set. */
function pluginFrom(vitestPlugin) {
	return {
		meta: { name: 'vitest' },
		rules: Object.fromEntries(
			UPSTREAM_RULES.map((name) => {
				const upstream = vitestPlugin.rules[name];
				return [
					name,
					defineRule({
						...upstream,
						meta: { ...upstream.meta, docs: { ...upstream.meta.docs, url: `${DOCS}#${name}` } },
					}),
				];
			}),
		),
	};
}

/**
 * One canonical plugin per resolved provider. ESLint refuses to merge two config entries that
 * declare the same plugin name with two different objects, so a `config()` call that wraps the
 * loaded plugin afresh each time would break the two compatible shapes: two `vitest.config()`
 * calls, and a generated `vitest.config({ from })` beside a hand-written `vitest.plugin`. The key
 * is the file the provider resolves to, so every anchor inside one project shares the wrapper and
 * two installs — a workspace root's and a member's — never do.
 */
const canonical = new Map();

/** The file this module's own anchor resolves to, or null where the shared copy has no plugin. */
let ownFile;
function ownProviderFile() {
	if (ownFile !== undefined) return ownFile;
	try {
		ownFile = providerFile(import.meta.url);
	} catch (error) {
		// A workspace member whose plugin lives in its own node_modules is the expected shape: the
		// shared copy resolves nothing. A different failure is real and must not be swallowed.
		if (error?.code !== 'MODULE_NOT_FOUND') throw error;
		ownFile = null;
	}
	return ownFile;
}

/** The canonical plugin for a config anchored at `from`; the module's own anchor is `plugin`. */
function pluginFor(from) {
	const file = providerFile(from);
	const known = canonical.get(file);
	if (known) return known;
	const wrapped = file === ownProviderFile() ? plugin : pluginFrom(loadPlugin(from));
	canonical.set(file, wrapped);
	return wrapped;
}

/**
 * The plugin for a config that spreads rules one by one. It resolves from this module's own
 * location — where `init` copied `tools/` — and is built on first access, so importing this module
 * where the plugin is absent does not load it. A generated `eslint.rules.js` uses `config({ from })`
 * for its own project instead, and reaches this same object when it is the same install.
 */
let ownRules;
export const plugin = {
	meta: { name: 'vitest' },
	get rules() {
		return (ownRules ??= pluginFrom(loadPlugin(import.meta.url)).rules);
	},
};

/**
 * One flat-config entry: the focus and async-assertion rules at error on the project's tests.
 * Vitest's globals are declared so a project that uses them without importing (globals: true) is
 * analyzed too; they declare names, they enable no rule.
 * @param {{ from?: string | URL, files?: string[], ignores?: string[], inspection?: 'full' | 'branch' | { mode: 'branch', base: string }, rules?: Record<string, import('eslint').Linter.RuleEntry> }} [options] - `from` is where the maintained plugin resolves from: a generated `eslint.rules.js` passes `import.meta.url`, so the plugin comes from the project that owns the config and not the shared `tools/` copy. `inspection` narrows the rules to the lines the branch added (see inspection.mjs); `rules` overrides a rule's entry.
 */
export function config({ from = import.meta.url, files = DEFAULT_FILES, ignores = [], inspection, rules: overrides = {} } = {}) {
	const vitestPlugin = loadPlugin(from);
	return [
		{
			name: 'vitest',
			files,
			ignores,
			plugins: { vitest: pluginFor(from) },
			languageOptions: { globals: vitestPlugin.environments.env.globals },
			...settings(inspection),
			rules: {
				'vitest/no-focused-tests': 'error',
				'vitest/valid-expect': 'error',
				'vitest/valid-expect-in-promise': 'error',
				...overrides,
			},
		},
	];
}

export default { plugin, config };
