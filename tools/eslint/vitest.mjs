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

import vitestPlugin from '@vitest/eslint-plugin';
import { defineRule, settings } from './inspection.mjs';

/** Files the rule applies to: the project's tests wherever they live. */
export const DEFAULT_FILES = ['**/*.test.*', '**/*.spec.*'];
/** A `__tests__` file without a `.test.`/`.spec.` name is not matched; name it that way, or pass
 * `files`, to check it. */
export const DEFAULT_IGNORES = [];

const DOCS = new URL('./vitest.md', import.meta.url).href;

const upstream = vitestPlugin.rules['no-focused-tests'];

/** The upstream rule, with this copy's documentation link, narrowed to the branch's lines. */
const noFocusedTests = defineRule({
	...upstream,
	meta: { ...upstream.meta, docs: { ...upstream.meta.docs, url: `${DOCS}#no-focused-tests` } },
});

export const plugin = { meta: { name: 'vitest' }, rules: { 'no-focused-tests': noFocusedTests } };

/**
 * One flat-config entry: the focused-test rule at error on the project's tests. Vitest's globals
 * are declared so a project that uses them without importing (globals: true) is analyzed too;
 * they declare names, they enable no rule.
 * @param {{ files?: string[], ignores?: string[], inspection?: 'full' | 'branch' | { mode: 'branch', base: string }, rules?: Record<string, import('eslint').Linter.RuleEntry> }} [options] - `inspection` narrows the rule to the lines the branch added (see inspection.mjs); `rules` overrides the rule's entry.
 */
export function config({ files = DEFAULT_FILES, ignores = [], inspection, rules: overrides = {} } = {}) {
	return [
		{
			name: 'vitest',
			files,
			ignores,
			plugins: { vitest: plugin },
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
