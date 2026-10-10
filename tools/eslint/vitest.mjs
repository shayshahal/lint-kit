/**
 * vitest: focused tests, asynchronous assertions that must be awaited or returned, and
 * unconditional skips guarded by a scoped quarantine.
 *
 * Vitest focuses a run through `.only` on the test or describe function, and a focused test left in
 * a branch silently suppresses every other test in the file: the suite still passes, so the
 * coverage that went missing is reported nowhere. A promise chain that is never returned or awaited
 * can hide a failing assertion the same way: it runs its callback after the test has finished. A
 * test disabled with `.skip`/`x*` is the same silent hole, so it is not deleted from the report but
 * excused only by a live, exactly addressed entry in the repository's `test-quarantine.json`
 * (`quarantine-ledger.mjs` beside this file owns that format). The checks are the rules
 * `@vitest/eslint-plugin` maintains, wrapped so this set narrows them to the lines a branch added
 * like every other set (see inspection.mjs):
 *
 *   vitest/no-focused-tests          test.only / it.only / describe.only
 *   vitest/valid-expect              expect(…).resolves/.rejects not awaited or returned
 *   vitest/valid-expect-in-promise   a floating promise chain with an expectation in it
 *   vitest/no-disabled-tests         test.skip / it.skip / describe.skip / x* / pending(), unless a
 *                                    live quarantine entry excuses that exact call
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
 * `no-disabled-tests` is the plugin rule for unconditional skips. Upstream already separates the
 * legitimate forms from the defect: `.todo`, `.fails` and `skipIf`/`runIf` stay valid, and only
 * `.skip`, the `x*` names and `pending()` report. The quarantine layer above it computes the
 * *enclosing call* (file plus the call's 1-based start line/column and the SHA-256 of its exact
 * source) and drops a report only for a live entry at that identity. A `test.skip('a')` with no
 * body keeps both native diagnostics (`missingFunction` plus `disabledTest`) — one entry covers
 * both; the layer invents no name filter. The rule never re-derives a title, so dynamic titles and
 * two tests with the same title at different sites stay distinct.
 *
 * The ledger is repository-wide and read at run time from the Git root of `context.cwd`; it is not
 * baked into the canonical plugin. The whole-ledger structural and expiry check is the separate
 * pre-push `check-quarantine-ledger.mjs`, which runs even when no test file is in a push. The rule
 * owns the unconditional skip; the validator owns the ledger's lifecycle.
 *
 * No other rule from the plugin is turned on. The plugin's own `recommended` config enables the
 * same four with `no-disabled-tests` at `warn`; this set keeps it blocking (`error`) and under its
 * own quarantine semantics. Vitest exposes focus only through `.only`: `fit` and `fdescribe` are
 * Jest names it does not export, and `.only` cannot follow `.each(...)` (`test.each([…]).only` is a
 * collection failure, not a focused test). A prefix rule would have nothing to normalize, so none
 * is selected. Upstream also reports the Jest-only `xit`/`xtest`/`xdescribe` and the Jest
 * `pending()`; those are recorded limits of the maintained rule, not advertised Vitest APIs.
 *
 * The rules apply to the standard `*.test.*` and `*.spec.*` files anywhere in the project, inside
 * or outside `src/`, so they do not depend on the application sets' `src/**` scope. Those sets are
 * unchanged: they keep their own `files` and `ignores`.
 */

import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { defineRule, isEligible, settings } from './inspection.mjs';
import {
	currentUtcDate,
	gitRootOf,
	hashSourceCallText,
	isQuarantineEntryExpired,
	readQuarantineLedger,
} from './quarantine-ledger.mjs';

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

/** The upstream rule list this set turns on: focus, the two async-assertion rules, then the skip
 * rule the quarantine layer wraps. It is private: the public config below is what a consumer sees,
 * and the test asserts the rule keys against its own literal roster rather than reading them back
 * from this list. */
const UPSTREAM_RULES = ['no-focused-tests', 'valid-expect', 'valid-expect-in-promise', 'no-disabled-tests'];

/** The one upstream rule a quarantine entry can excuse. */
const QUARANTINE_RULE = 'no-disabled-tests';

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
				for (const held of state.held) {
					const root = reportRoot(held.descriptor);
					if (root === null || !state.ownedRoots.has(root)) held.report(held.descriptor);
				}
				state.held = [];
				reportOwnership.delete(context.sourceCode);
			};

			const listeners =
				role === 'owner'
					? rule.create(Object.create(context, { report: { value: own } }))
					: rule.create(Object.create(context, { report: { value: (descriptor) => state.held.push({ descriptor, report }) } }));
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

/** The enclosing test/describe call a report belongs to. Only the callee side of a member/call
 *  chain is climbed, so a call passed as an argument (`foo(test.skip(…))`) does not become the
 *  identity. The result is the full `.skip.each(…)(…)`/`concurrent.skip`/`x*` call, including an
 *  inline group body, which is what the source hash covers. */
function enclosingCall(node) {
	let anchor = node;
	for (;;) {
		const parent = anchor.parent;
		if (!parent) break;
		if (parent.type === 'MemberExpression' && (parent.object === anchor || parent.property === anchor)) {
			anchor = parent;
			continue;
		}
		if (parent.type === 'CallExpression' && parent.callee === anchor) {
			anchor = parent;
			continue;
		}
		break;
	}
	return anchor.type === 'CallExpression' ? anchor : null;
}

/** The repository-relative path of the linted file, or null for stdin and files outside the root. */
function quarantineFile(context, root) {
	const filename = context.physicalFilename || context.filename;
	if (!filename || filename.startsWith('<')) return null;
	const resolved = path.resolve(context.cwd, filename);
	let absolute;
	try {
		absolute = realpathSync.native(resolved);
	} catch {
		absolute = resolved;
	}
	const relative = path.relative(root, absolute);
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
	return relative.split(path.sep).join('/');
}

/** A report's call identity: the enclosing call's 1-based start and its LF-normalized source hash. */
function callIdentity(context, descriptor) {
	const node = descriptor.node ?? null;
	const call = node ? enclosingCall(node) : null;
	if (!call) return null;
	const loc = call.loc?.start;
	if (!loc) return null;
	return {
		line: loc.line,
		column: loc.column + 1,
		sourceCallSha256: hashSourceCallText(context.sourceCode.getText(call)),
	};
}

/**
 * The skip rule with the quarantine layer. It reports through the same rule id and node as the
 * maintained rule, so a caller sees one diagnostic per native defect, and it keeps the upstream
 * async ownership untouched. A report whose location has a live entry with the matching source
 * hash is dropped; an entry at the location with a stale hash or a lapsed date is forced even on
 * an inherited line; otherwise the ordinary branch gate decides.
 *
 * Program:exit adds the one thing a location-only check cannot see: a call that moved to a line
 * Git still treats as unchanged. Every entry that no report consumed at its own location is
 * matched by its source hash against the reports of this file, and a match elsewhere is forced.
 * This reuses the upstream reports (there is no second detector), and an entry that consumed its
 * own location never fires, so two identical calls with one entry do not false-force the other.
 */
function quarantineRule(upstream, gated) {
	return {
		...gated,
		create(context) {
			const report = context.report.bind(context);
			const root = gitRootOf(context.cwd);
			const file = root ? quarantineFile(context, root) : null;
			const ledger = readQuarantineLedger(root);
			const entries = file && ledger.status === 'valid' ? ledger.entries.filter((entry) => entry.file === file) : [];
			if (entries.length === 0) {
				// No ledger entry for this file: the ordinary branch gate, unchanged.
				return upstream.create(
					Object.create(context, {
						report: { value: (descriptor) => (isEligible(context, descriptor) ? report(descriptor) : undefined) },
					}),
				);
			}
			const today = currentUtcDate();
			const consumed = new Set();
			const candidates = [];
			const listeners = upstream.create(
				Object.create(context, {
					report: {
						value: (descriptor) => {
							const identity = callIdentity(context, descriptor);
							if (!identity) {
								if (isEligible(context, descriptor)) report(descriptor);
								return;
							}
							const entry = entries.find(
								(candidate) => candidate.line === identity.line && candidate.column === identity.column,
							);
							if (entry) {
								if (entry.sourceCallSha256 !== identity.sourceCallSha256 || isQuarantineEntryExpired(entry, today)) {
									report(descriptor);
									return;
								}
								consumed.add(`${entry.line}:${entry.column}`);
								return; // a live entry excuses this call
							}
							if (isEligible(context, descriptor)) {
								report(descriptor);
								return;
							}
							candidates.push({ identity, descriptor });
						},
					},
				}),
			);
			const upstreamExit = listeners['Program:exit'];
			return {
				...listeners,
				'Program:exit'(node) {
					upstreamExit?.(node);
					const forced = new Set();
					for (const entry of entries) {
						if (consumed.has(`${entry.line}:${entry.column}`)) continue;
						for (const candidate of candidates) {
							if (candidate.identity.sourceCallSha256 !== entry.sourceCallSha256) continue;
							const key = `${candidate.identity.line}:${candidate.identity.column}`;
							if (forced.has(key)) continue;
							forced.add(key);
							report(candidate.descriptor);
						}
					}
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
				const gated = defineRule({
					...upstream,
					meta: { ...upstream.meta, docs: { ...upstream.meta.docs, url: `${DOCS}#${name}` } },
				});
				const rule =
					name === QUARANTINE_RULE ? quarantineRule(upstream, gated) : coordinateReports(ASYNC_RULE_ROLE[name], gated);
				return [name, rule];
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
				'vitest/no-disabled-tests': 'error',
				...overrides,
			},
		},
	];
}

export default { plugin, config };
