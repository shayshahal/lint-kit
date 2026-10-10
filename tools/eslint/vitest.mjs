/**
 * vitest: focused tests and asynchronous assertions that must be awaited or returned.
 *
 * Vitest focuses a run through `.only` on the test or describe function, and a focused test left in
 * a branch silently suppresses every other test in the file: the suite still passes, so the
 * coverage that went missing is reported nowhere. A promise chain that is never returned or awaited
 * can hide a failing assertion the same way: it runs its callback after the test has finished. The
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
 * The runner evidence is test/fixtures/vitest-runner/*.test.js: a floating chain with an assertion
 * that never runs is a silent pass — the test finishes first, so the result says passed. A floating
 * chain that rejects an immediate assertion is not that silent pass: Vitest attributes the late
 * rejection to the process, so the CLI exits 1 while the individual test and the JSON report still
 * say passed. Only the chain the test never waits for is the false pass the rule closes; the
 * returned chain is the shape it asks for.
 *
 * The plugin pairs the two async rules in its own `recommended` config. They overlap on one shape:
 * a floating `.then`/`.catch`/`.finally` chain whose callback body is a single async assertion.
 * `valid-expect` owns that assertion and `valid-expect-in-promise` holds its report (see
 * `coordinateReports`), so the concise-arrow form `fetch(u).then((r) => expect(r).resolves.toBe(y))`
 * is one finding whose one fix clears it, and the assigned form `const p = fetch(u).then(…)` is one
 * finding too because the two reports reduce to the same promise expression. The block-body form
 * reports two different promise expressions with two fixes and keeps both.
 * `test/agent-skills-vitest-set.test.js` measures exactly which shapes overlap.
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

/** The upstream rule list this set turns on: focus, then the two async-assertion rules. It is
 * private: the public config below is what a consumer sees, and the test asserts the rule keys
 * against its own literal roster rather than reading them back from this list. */
const UPSTREAM_RULES = ['no-focused-tests', 'valid-expect', 'valid-expect-in-promise'];

/**
 * The role a rule plays when both async rules can see one assertion. `valid-expect` is the owner:
 * it is the one with the fix, and awaiting the chain clears both reports. `valid-expect-in-promise`
 * holds its report until the owner has reported.
 */
const ASYNC_RULE_ROLE = { 'valid-expect': 'owner', 'valid-expect-in-promise': 'held' };

/**
 * Report-level coordination between the two async rules, which is what keeps one assertion with one
 * owner. The concise arrow `fetch(u).then((r) => expect(r).resolves.toBe(y))` is a floating chain
 * (`valid-expect-in-promise`) whose body is also an unawaited assertion (`valid-expect`). The two
 * rules report the same promise expression (see `promiseExpression`) and one `valid-expect` fix —
 * await the chain — clears both, so this is one finding: the owner keeps it and the held report for
 * the same promise is dropped. A block body reports the chain and the inner assertion, two
 * different promise expressions each with its own fix, so both stay; an assignment reports the
 * declarator and the promise expression inside it, which reduce to the same promise, so it is one
 * finding whose one fix awaits the chain.
 *
 * Both rules report from `Program:exit`, and the two are registered in whatever order the config
 * lists them. The held reports are therefore not released at the first `Program:exit`: each enabled
 * rule marks itself finished, and the release — using the held report's captured context, so its
 * own rule and severity survive — runs when the last participant has finished. If the owner is
 * disabled nothing is owned and every held report is released.
 *
 * The registry is keyed by the file's `SourceCode`. ESLint may reuse one `SourceCode` across
 * `verify` calls, so the state is released, and the entry dropped, as soon as every participant of
 * that run has finished; the next run starts empty rather than inheriting the previous owner's
 * promises.
 */
const reportOwnership = new WeakMap();

/** The per-`SourceCode` coordination state: the promise expressions the owner reported, the held
 * reports, and how many coordinated rules are still running. */
function ownershipFor(sourceCode) {
	let state = reportOwnership.get(sourceCode);
	if (!state) {
		state = { ownedRoots: new Set(), held: [], pending: 0 };
		reportOwnership.set(sourceCode, state);
	}
	return state;
}

/**
 * The promise expression a report is about. The two rules report one promise through different
 * nodes: `valid-expect` reports the promise expression itself, while `valid-expect-in-promise`
 * reports the statement or declaration that wraps it. Reducing a report to the expression it wraps
 * gives the two rules one identity for one promise, so an assignment's declarator and its chain are
 * recognized as the same promise instead of two. This is a plain unwrap of the containers the AST
 * puts around an expression, not an assertion or promise-chain matcher.
 */
function promiseExpression(node) {
	switch (node?.type) {
		case 'ExpressionStatement':
			return node.expression;
		case 'VariableDeclarator':
			return node.init ?? node;
		case 'AssignmentExpression':
			return node.right;
		default:
			return node ?? null;
	}
}

/** A report's promise expression, or its location when it has no node. */
function reportRoot(descriptor) {
	const expression = descriptor.node ? promiseExpression(descriptor.node) : null;
	return expression ?? descriptor.loc ?? null;
}

/**
 * The rule with the coordination its role needs, layered outside `defineRule` so the owner records
 * only reports the branch gate kept, and with no role the rule is untouched (the focus rule).
 */
function coordinateReports(role, rule) {
	if (!role) return rule;
	return {
		...rule,
		create(context) {
			const state = ownershipFor(context.sourceCode);
			const report = context.report.bind(context);
			state.pending += 1;

			/** The owner's report: record the promise it is about, then report it through the rule. */
			const own = (descriptor) => {
				const root = reportRoot(descriptor);
				if (root !== null) state.ownedRoots.add(root);
				report(descriptor);
			};

			let finished = false;
			/** Mark this participant done; the last one releases the held reports and the state. */
			const finish = () => {
				if (finished) return;
				finished = true;
				if (--state.pending > 0) return;
				for (const descriptor of state.held) {
					const root = reportRoot(descriptor);
					if (root === null || !state.ownedRoots.has(root)) report(descriptor);
				}
				state.held = [];
				reportOwnership.delete(context.sourceCode);
			};

			const listeners =
				role === 'owner'
					? rule.create(Object.create(context, { report: { value: own } }))
					: rule.create(Object.create(context, { report: { value: (descriptor) => state.held.push(descriptor) } }));
			const upstreamExit = listeners['Program:exit'];
			return {
				...listeners,
				'Program:exit'(node) {
					upstreamExit?.(node);
					finish();
				},
			};
		},
	};
}

/** The loaded plugin with this copy's rules wrapped like every other set. */
function pluginFrom(vitestPlugin) {
	return {
		meta: { name: 'vitest' },
		rules: Object.fromEntries(
			UPSTREAM_RULES.map((name) => {
				const upstream = vitestPlugin.rules[name];
				return [
					name,
					coordinateReports(
						ASYNC_RULE_ROLE[name],
						defineRule({
							...upstream,
							meta: { ...upstream.meta, docs: { ...upstream.meta.docs, url: `${DOCS}#${name}` } },
						}),
					),
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
