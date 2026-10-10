/**
 * vitest: focused tests. Vitest focuses a run through `.only` on the test or describe function,
 * and a focused test left in a branch silently suppresses every other test in the file: the suite
 * still passes, so the coverage that went missing is reported nowhere. The check is the rule
 * `@vitest/eslint-plugin` maintains (`vitest/no-focused-tests`), wrapped so this set narrows it to
 * the lines a branch added like every other set (see inspection.mjs).
 *
 * No other rule from the plugin is turned on. Its `recommended` config would also enable the async
 * and skip rules, which are their own slices (#48, #49), and this set adds nothing to oxlint or
 * Jest: one engine owns the shape.
 *
 * Vitest exposes focus only through `.only`: `fit` and `fdescribe` are Jest names it does not
 * export, and `.only` cannot follow `.each(...)` (`test.each([…]).only` is a collection failure,
 * not a focused test). A prefix rule would have nothing to normalize, so none is selected.
 *
 * The rule applies to the standard `*.test.*` and `*.spec.*` files anywhere in the project, inside
 * or outside `src/`, so it does not depend on the application sets' `src/**` scope. Those sets are
 * unchanged: they keep their own `files` and `ignores`.
 */

import { createRequire } from 'node:module';
import { defineRule, settings } from './inspection.mjs';

/** Files the rule applies to: the project's tests wherever they live. */
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

/** The loaded plugin with this copy's one rule wrapped like every other set. */
function pluginFrom(vitestPlugin) {
	const upstream = vitestPlugin.rules['no-focused-tests'];
	return {
		meta: { name: 'vitest' },
		rules: {
			'no-focused-tests': defineRule({
				...upstream,
				meta: { ...upstream.meta, docs: { ...upstream.meta.docs, url: `${DOCS}#no-focused-tests` } },
			}),
		},
	};
}

/**
 * The plugin for a config that spreads rules one by one. It resolves from this module's own
 * location — where `init` copied `tools/` — and is built on first access, so importing this module
 * where the plugin is absent does not load it. A generated `eslint.rules.js` uses `config({ from })`
 * for its own project instead.
 */
export const plugin = {
	meta: { name: 'vitest' },
	get rules() {
		return pluginFrom(loadPlugin(import.meta.url)).rules;
	},
};

/**
 * One flat-config entry: the focused-test rule at error on the project's tests. Vitest's globals
 * are declared so a project that uses them without importing (globals: true) is analyzed too;
 * they declare names, they enable no rule.
 * @param {{ from?: string | URL, files?: string[], ignores?: string[], inspection?: 'full' | 'branch' | { mode: 'branch', base: string }, rules?: Record<string, import('eslint').Linter.RuleEntry> }} [options] - `from` is where the maintained plugin resolves from: a generated `eslint.rules.js` passes `import.meta.url`, so the plugin comes from the project that owns the config and not the shared `tools/` copy. `inspection` narrows the rule to the lines the branch added (see inspection.mjs); `rules` overrides the rule's entry.
 */
export function config({ from = import.meta.url, files = DEFAULT_FILES, ignores = [], inspection, rules: overrides = {} } = {}) {
	const vitestPlugin = loadPlugin(from);
	return [
		{
			name: 'vitest',
			files,
			ignores,
			plugins: { vitest: pluginFrom(vitestPlugin) },
			languageOptions: { globals: vitestPlugin.environments.env.globals },
			...settings(inspection),
			rules: {
				'vitest/no-focused-tests': 'error',
				...overrides,
			},
		},
	];
}

export default { plugin, config };
