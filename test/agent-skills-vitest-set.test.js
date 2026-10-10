/**
 * The installed vitest set (#47, #48): the maintained focused-test and async-assertion rules from
 * @vitest/eslint-plugin, narrowed to the lines a branch added, on the project's tests inside and
 * outside src/.
 *
 * The foundation evidence for what the plugin's rules accept is
 * test/agent-skills-testing-plugin.test.js. This file proves the shipped set wraps exactly those
 * rules, keeps the documented counterexamples, charges only what a branch introduced, and measures
 * the one shape where the two async rules overlap; the installer's hook wiring and the actual
 * installed ESLint run are test/agent-skills-vitest-install.test.js.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import vitest, { DEFAULT_FILES, config } from '../tools/eslint/vitest.mjs';
import errorHandling from '../tools/eslint/error-handling.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-vitest-set-'));
/** This checkout's shared rules folder, the copy `init` would make in a consuming repository. */
const TOOLS = fileURLToPath(new URL('../tools/eslint/', import.meta.url));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** The parser setup the init command writes, so the set is exercised on the files it meets. */
const PARSER = { files: ['**/*.{js,ts}'], languageOptions: { parser: tsParser } };

/** Lint `code` as `filename` with the shipped config, plus any `extra` entries after it. */
function lint(code, filename, options, extra = []) {
	const messages = new Linter({ configType: 'flat' }).verify(
		code,
		[PARSER, ...config(options), ...extra],
		filename,
	);
	const fatal = messages.find((m) => m.fatal);
	if (fatal) throw new Error(`${filename}: ${fatal.message}`);
	return messages;
}

/**
 * The public rule roster this set ships, spelled out here so the assertion does not read it back
 * from the implementation. The production list is private; this literal is the independent check.
 */
const RULES = ['vitest/no-focused-tests', 'vitest/valid-expect', 'vitest/valid-expect-in-promise'];

test('the set turns on the maintained focus and async-assertion rules, at error', () => {
	const [entry] = config();
	assert.deepEqual(
		Object.keys(vitest.plugin.rules).map((name) => `vitest/${name}`),
		RULES,
	);
	assert.deepEqual(Object.keys(entry.rules), RULES);
	for (const id of RULES) assert.equal(entry.rules[id], 'error', id);
	assert.equal(entry.plugins.vitest.rules['no-focused-tests'].meta.fixable, 'code');
	assert.equal(entry.plugins.vitest.rules['valid-expect'].meta.fixable, 'code');
	assert.deepEqual(DEFAULT_FILES, ['**/*.test.*', '**/*.spec.*']);
	// The plugin's recommended config would also enable the skip rule; it stays out (#49).
	assert.ok(!('vitest/no-disabled-tests' in entry.rules));
});

test('the fix drops .only and leaves the rest of the call', () => {
	const fixed = new Linter({ configType: 'flat' }).verifyAndFix(
		"import { test as t } from 'vitest';\nt.only.each([1])('x', () => {});",
		[PARSER, ...config()],
		'src/a.test.js',
	);
	assert.equal(fixed.output, "import { test as t } from 'vitest';\nt.each([1])('x', () => {});");
});

/** Each focused shape the runner supports: exactly one blocker, at severity 2 (blocking). */
const FOCUSED = [
	['test.only', "test.only('a', () => {});"],
	['it.only', "it.only('b', () => {});"],
	['describe.only', "describe.only('c', () => {});"],
	['test.concurrent.only', "test.concurrent.only('d', async () => {});"],
	['test.only.each', "test.only.each([1])('e', () => {});"],
	['an imported test alias', "import { test as t } from 'vitest';\nt.only('f', () => {});"],
	['an imported it alias', "import { it as test } from 'vitest';\ntest.only('g', () => {});"],
];

/** Shapes that look like focus but are not Vitest's focused API, or are somebody else's method. */
const ALLOWED = [
	['a plain test', "test('plain', () => {});"],
	['a locally bound test', "const test = { only: () => {} };\ntest.only('other');"],
	['a local function it', 'function it() {}\nit.only("other");'],
	['a test imported from another library', "import { test } from 'some-other-lib';\ntest.only('other');"],
	// `each()` returns a bare function, so `.only` after it is a collection failure, not focus.
	['.only after .each(...)', "test.each([1]).only('invalid order', () => {});"],
	// Vitest exports no prefix focus API; these are Jest names it does not provide.
	['fit', "fit('not vitest', () => {});"],
	['fdescribe', "fdescribe('not vitest', () => {});"],
];

for (const [name, code] of FOCUSED)
	test(`${name} is one blocker`, () => {
		const messages = lint(code, 'src/a.test.js');
		assert.equal(messages.length, 1, JSON.stringify(messages));
		assert.equal(messages[0].ruleId, 'vitest/no-focused-tests');
		assert.equal(messages[0].severity, 2);
		assert.equal(messages[0].message, 'Focused tests are not allowed');
	});

for (const [name, code] of ALLOWED)
	test(`${name} passes`, () => {
		assert.deepEqual(lint(code, 'src/a.test.js'), []);
	});

/**
 * Async assertions the set blocks. Each shape is handled by exactly one rule: an unawaited async
 * assertion by `valid-expect`, a floating expectation chain by `valid-expect-in-promise`. The one
 * shape both report on is measured separately below.
 */
const ASYNC_FAILING = [
	['an unawaited .resolves', "test('x', () => { expect(fetch('u')).resolves.toBe('y'); });", 'vitest/valid-expect'],
	['an unawaited .rejects', "test('x', () => { expect(fetch('u')).rejects.toThrow(); });", 'vitest/valid-expect'],
	['an unawaited async matcher', "test('x', () => { expect(fetch('u')).toResolve(); });", 'vitest/valid-expect'],
	[
		'an aliased expect',
		"import { expect as e, test } from 'vitest';\ntest('x', () => { e(fetch('u')).resolves.toBe('y'); });",
		'vitest/valid-expect',
	],
	[
		'an aliased test',
		"import { test as t } from 'vitest';\nt('x', () => { expect(fetch('u')).resolves.toBe('y'); });",
		'vitest/valid-expect',
	],
	[
		'a floating .then chain',
		"test('x', () => { fetch('u').then((r) => { expect(r).toBe('y'); }); });",
		'vitest/valid-expect-in-promise',
	],
	[
		'a floating .catch chain',
		"test('x', () => { fetch('u').catch(() => { expect(x).toBe(1); }); });",
		'vitest/valid-expect-in-promise',
	],
	[
		'a chain assigned and dropped',
		"test('x', () => { const p = fetch('u').then((r) => { expect(r).toBe('y'); }); });",
		'vitest/valid-expect-in-promise',
	],
];

for (const [name, code, ruleId] of ASYNC_FAILING)
	test(`${name} is one blocker`, () => {
		const messages = lint(code, 'src/a.test.js');
		assert.equal(messages.length, 1, JSON.stringify(messages));
		assert.equal(messages[0].ruleId, ruleId);
		assert.equal(messages[0].severity, 2);
	});

/** The awaited/returned counterpart of every failing shape, plus the shapes that must stay quiet. */
const ASYNC_ALLOWED = [
	['an awaited assertion', "test('x', async () => { await expect(fetch('u')).resolves.toBe('y'); });"],
	['a returned assertion', "test('x', () => { return expect(fetch('u')).resolves.toBe('y'); });"],
	['a returned chain', "test('x', () => { return fetch('u').then((r) => { expect(r).toBe('y'); }); });"],
	['an awaited chain', "test('x', async () => { await fetch('u').then((r) => { expect(r).toBe('y'); }); });"],
	['a synchronous expectation', "test('x', () => { expect(1).toBe(1); });"],
	['a shadowed expect', "test('x', () => { const expect = (v) => v; expect(1); });"],
	[
		'an expect imported from another library',
		"import { expect } from 'some-other-lib';\ntest('x', () => { expect(fetch('u')).resolves.toBe('y'); });",
	],
	// An async test that needs no await is not a finding: there is no blanket "await in every async
	// test". This async callback contains no `await` at all and is still allowed.
	['an async test with no await', "test('x', async () => { runs(); });"],
	['a synchronous test with no assertion', "test('x', () => { runs(); });"],
	// The rule accepts the callback `done` form; the pinned runner deprecates it, so the runner
	// fixture (test/agent-skills-vitest-runner.test.js) proves it is not a passing shape.
	['the callback done form', "test('x', (done) => { expect(1).toBe(1); done(); });"],
];

for (const [name, code] of ASYNC_ALLOWED)
	test(`${name} passes`, () => {
		assert.deepEqual(lint(code, 'src/a.test.js'), []);
	});

test('the async rules are syntactic: a helper or a reassigned alias is not resolved', () => {
	// Neither rule asks for type information, and no type-aware setup is configured or claimed. The
	// bindings it cannot follow are the documented limits, not a missing install.
	const opaque = [
		"import { assertOk } from './assert-ok';\ntest('x', () => { assertOk(fetch('u')); });",
		"const e = expect;\ntest('x', () => { e(fetch('u')).resolves.toBe('y'); });",
		"test('x', () => { globalThis.expect(fetch('u')).resolves.toBe('y'); });",
		// `expect.poll` has its own plugin rule, which this set does not turn on.
		"test('x', () => { expect.poll(() => x).toBe(1); });",
		// A floating outer chain whose callback returns a nested chain is not seen (upstream limit).
		"test('x', () => { fetch('u').then((r) => { return fetch('v').then((s) => { expect(s).toBe('y'); }); }); });",
	];
	for (const code of opaque) assert.deepEqual(lint(code, 'src/a.test.js'), [], code);
});

test('measured overlap: the concise form is one owned finding, the block form two', () => {
	// Block body: the floating chain (valid-expect-in-promise) and the inner assertion
	// (valid-expect) are different nodes with different fixes, so both reports stay.
	const blockCode = "test('x', () => { fetch('u').then((r) => { expect(r).resolves.toBe('y'); }); });";
	const block = lint(blockCode, 'src/a.test.js');
	assert.deepEqual(
		block.map((m) => `${m.ruleId}@${m.line}:${m.column}`).sort(),
		['vitest/valid-expect@1:44', 'vitest/valid-expect-in-promise@1:19'].sort(),
	);
	// valid-expect's autofix awaits the inner assertion and leaves the outer chain floating, so the
	// two fixes are genuinely independent and the promise rule's report remains.
	const blockFixed = new Linter({ configType: 'flat' }).verifyAndFix(blockCode, [PARSER, ...config()], 'src/a.test.js');
	assert.deepEqual(blockFixed.messages.map((m) => m.ruleId), ['vitest/valid-expect-in-promise']);

	// Concise arrow: the two rules report nodes at the same start, and one valid-expect fix — await
	// the chain — clears both. The owner keeps the single finding and the held report is dropped.
	const conciseCode = "test('x', () => { fetch('u').then((r) => expect(r).resolves.toBe('y')); });";
	const concise = lint(conciseCode, 'src/a.test.js');
	assert.deepEqual(concise.map((m) => `${m.ruleId}@${m.line}:${m.column}`), ['vitest/valid-expect@1:19']);
	const conciseFixed = new Linter({ configType: 'flat' }).verifyAndFix(conciseCode, [PARSER, ...config()], 'src/a.test.js');
	assert.deepEqual(conciseFixed.messages, []);
	assert.equal(conciseFixed.output, "test('x', async () => { await fetch('u').then((r) => expect(r).resolves.toBe('y')); });");
});

test('the owner keeps the finding, and the held report is not stale across runs or files', () => {
	const concise = "test('x', () => { fetch('u').then((r) => expect(r).resolves.toBe('y')); });";
	// A repeated verify of the same file, and the same code under another filename, both start from
	// empty: the ownership registry lives on the file's SourceCode, not in module state.
	for (const file of ['src/a.test.js', 'src/a.test.js', 'src/b.test.js']) {
		assert.deepEqual(lint(concise, file).map((m) => m.ruleId), ['vitest/valid-expect'], file);
	}
	// With the owner off, the promise rule still reports the same assertion instead of staying
	// silent, and its own entry is the one that survives.
	assert.deepEqual(
		lint(concise, 'src/a.test.js', { rules: { 'vitest/valid-expect': 'off' } }).map((m) => m.ruleId),
		['vitest/valid-expect-in-promise'],
	);
});

test('the surviving report carries its own rule and severity', () => {
	const concise = "test('x', () => { fetch('u').then((r) => expect(r).resolves.toBe('y')); });";
	// The owner's entry decides the severity of the one surviving finding: a warn owner is a warn,
	// not an error reintroduced by the held rule.
	assert.deepEqual(
		lint(concise, 'src/a.test.js', { rules: { 'vitest/valid-expect': 'warn' } }).map((m) => [m.ruleId, m.severity]),
		[['vitest/valid-expect', 1]],
	);
	// With the owner disabled there is no override to inherit: the held report uses its own entry.
	assert.deepEqual(
		lint(concise, 'src/a.test.js', {
			rules: { 'vitest/valid-expect': 'off', 'vitest/valid-expect-in-promise': 'warn' },
		}).map((m) => [m.ruleId, m.severity]),
		[['vitest/valid-expect-in-promise', 1]],
	);
});

test('tests inside and outside src/ are checked, and an application path is not', () => {
	for (const file of ['src/x.test.ts', 'test/outside.test.js', 'deep/nested/y.spec.ts', 'a.test.mjs'])
		assert.equal(lint("test.only('x', () => {});", file).length, 1, file);
	// A non-test application file is outside the set's files, even with an only() of its own.
	assert.deepEqual(lint("const test = { only() {} };\ntest.only('x');", 'src/app.ts'), []);
});

test('a test file is not pulled into an application set', () => {
	// The application sets keep their own files and ignores, so a swallowed catch in a test file
	// is not charged here: the focus rule is the only finding.
	const code = "test.only('x', () => {\n\ttry {\n\t\trisky();\n\t} catch (e) {\n\t\tconsole.log(e);\n\t}\n});\n";
	const messages = lint(code, 'src/x.test.ts', undefined, errorHandling.config());
	assert.deepEqual(messages.map((m) => m.ruleId), ['vitest/no-focused-tests']);
});

test('config() names its entry, writes the mode as a setting, and takes rule overrides', () => {
	const [plain] = config();
	assert.equal(plain.name, 'vitest');
	assert.equal(plain.settings, undefined);
	assert.deepEqual(plain.files, DEFAULT_FILES);
	// Vitest's globals are declared so a project that uses them without importing is analyzed.
	assert.ok(plain.languageOptions.globals.test && plain.languageOptions.globals.describe);
	assert.deepEqual(config({ inspection: 'branch' })[0].settings, { inspection: 'branch' });
	const [overridden] = config({ files: ['e2e/**/*.e2e.ts'], rules: { 'vitest/no-focused-tests': 'warn' } });
	assert.deepEqual(overridden.files, ['e2e/**/*.e2e.ts']);
	assert.equal(overridden.rules['vitest/no-focused-tests'], 'warn');
});

// ── where the maintained plugin resolves from ─────────────────────────────────

/** A stand-in for `@vitest/eslint-plugin` in `dir`'s own node_modules, tagged so a test can tell
 *  which project the set loaded it from. The real pinned plugin is exercised in the install tests;
 *  this is about resolution, and a project whose plugin comes from anywhere else is the bug. */
function isolatedPlugin(dir, marker) {
	const pkg = path.join(dir, 'node_modules', '@vitest/eslint-plugin');
	fs.mkdirSync(pkg, { recursive: true });
	fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@vitest/eslint-plugin', version: '1.6.27', main: 'index.cjs' }));
	fs.writeFileSync(
		path.join(pkg, 'index.cjs'),
		`module.exports = {
	meta: { name: 'vitest', marker: ${JSON.stringify(marker)} },
	environments: { env: { globals: { test: true } } },
	rules: { 'no-focused-tests': { meta: { marker: ${JSON.stringify(marker)}, docs: {} }, create: () => ({}) } },
};
`,
	);
	return pathToFileURL(path.join(dir, 'eslint.rules.js'));
}

test('config({ from }) loads the plugin from the project that owns the config', () => {
	const from = isolatedPlugin(path.join(TMP, 'anchor'), 'anchor');
	const [entry] = config({ from });
	assert.equal(entry.plugins.vitest.rules['no-focused-tests'].meta.marker, 'anchor');
	assert.equal(entry.languageOptions.globals.test, true);
	// The default still resolves the real plugin from this checkout, so root config usage works.
	assert.notEqual(config()[0].plugins.vitest.rules['no-focused-tests'].meta.marker, 'anchor');
});

test("one project's plugin never resolves from a sibling project", () => {
	const a = isolatedPlugin(path.join(TMP, 'sibling-a'), 'a');
	const b = isolatedPlugin(path.join(TMP, 'sibling-b'), 'b');
	assert.equal(config({ from: a })[0].plugins.vitest.rules['no-focused-tests'].meta.marker, 'a');
	assert.equal(config({ from: b })[0].plugins.vitest.rules['no-focused-tests'].meta.marker, 'b');
});

// ── one plugin identity per resolved provider ──────────────────────────────────

/** The messages ESLint reports for a focused test under `configs`, through the real flat config. */
function focused(configs) {
	const messages = new Linter({ configType: 'flat' }).verify("test.only('x', () => {});", configs, 'a.test.js');
	return messages.map((m) => [m.ruleId, m.severity]);
}

test('two config() calls for one provider stay mergeable, and the later override still applies', () => {
	const [first] = config({ inspection: 'full' });
	const [second] = config({ inspection: 'full', rules: { 'vitest/no-focused-tests': 'warn' } });
	assert.equal(first.plugins.vitest, second.plugins.vitest, 'the provider must have one wrapper');
	// Pre-fix this threw `Cannot redefine plugin "vitest"`; a focused test must still be one finding,
	// at the severity the later entry asked for.
	assert.deepEqual(focused([first, second]), [['vitest/no-focused-tests', 1]]);
});

test('the public plugin and a config() entry are one object', () => {
	assert.equal(config()[0].plugins.vitest, vitest.plugin);
	// The rules are built once per provider, not on every getter access.
	assert.equal(vitest.plugin.rules, vitest.plugin.rules);
	const messages = focused([
		{ files: ['**/*.test.js'], plugins: { vitest: vitest.plugin } },
		...config({ inspection: 'full' }),
	]);
	assert.deepEqual(messages, [['vitest/no-focused-tests', 2]]);
});

test("a generated root config's own anchor reaches the public plugin", () => {
	// `init` writes `from: import.meta.url` into <project>/eslint.rules.js; from the shared
	// tools/eslint/ copy that is a different URL, but it is the same install, so one identity.
	const from = new URL('../eslint.rules.js', import.meta.url);
	assert.equal(config({ from })[0].plugins.vitest, vitest.plugin);
	const messages = focused([
		{ files: ['**/*.test.js'], plugins: { vitest: vitest.plugin } },
		...config({ from, inspection: 'full' }),
	]);
	assert.deepEqual(messages, [['vitest/no-focused-tests', 2]]);
});

test('every anchor in one project shares a wrapper; two installs never do', () => {
	const dir = path.join(TMP, 'anchors');
	isolatedPlugin(dir, 'own');
	const rules = pathToFileURL(path.join(dir, 'eslint.rules.js'));
	const configFile = pathToFileURL(path.join(dir, 'eslint.config.js'));
	assert.equal(config({ from: rules })[0].plugins.vitest, config({ from: configFile })[0].plugins.vitest);
	assert.equal(config({ from: rules })[0].plugins.vitest.rules, config({ from: rules })[0].plugins.vitest.rules);
	const other = isolatedPlugin(path.join(TMP, 'anchors-other'), 'other');
	assert.notEqual(config({ from: rules })[0].plugins.vitest, config({ from: other })[0].plugins.vitest);
	assert.equal(config({ from: other })[0].plugins.vitest.rules['no-focused-tests'].meta.marker, 'other');
});

/** A copy of the maintained module at `root`, the shared copy a consuming repository gets. */
async function copiedAt(root) {
	const tools = path.join(root, 'tools', 'eslint');
	fs.mkdirSync(tools, { recursive: true });
	for (const file of ['inspection.mjs', 'vitest.mjs', 'vitest.md'])
		fs.copyFileSync(path.join(TOOLS, file), path.join(tools, file));
	return import(pathToFileURL(path.join(tools, 'vitest.mjs')).href);
}

test('a workspace member resolves its own plugin while the shared copy has none', async () => {
	const copied = await copiedAt(path.join(TMP, 'workspace-no-root-plugin'));
	// Importing the shared copy is inert: the root has no plugin, and none is loaded yet.
	assert.equal(copied.plugin.meta.name, 'vitest');
	const from = isolatedPlugin(path.join(TMP, 'workspace-no-root-plugin', 'apps', 'web'), 'member');
	const sibling = isolatedPlugin(path.join(TMP, 'workspace-no-root-plugin', 'apps', 'admin'), 'admin');
	// The member's own plugin is found, and a sibling's is never reached.
	assert.equal(copied.config({ from })[0].plugins.vitest.rules['no-focused-tests'].meta.marker, 'member');
	assert.equal(copied.config({ from: sibling })[0].plugins.vitest.rules['no-focused-tests'].meta.marker, 'admin');
	assert.notEqual(copied.config({ from })[0].plugins.vitest, copied.config({ from: sibling })[0].plugins.vitest);
	// The public plugin has no plugin to load, so using it fails loudly rather than reporting nothing.
	assert.throws(() => copied.plugin.rules, (error) => error.code === 'MODULE_NOT_FOUND');
});

test('an unexpected failure resolving the shared copy is not swallowed', async () => {
	const root = path.join(TMP, 'workspace-unexpected-root');
	const copied = await copiedAt(root);
	// The root has a package by that name, but it exports no `require` condition: the discovery of
	// the shared copy's identity must rethrow, not treat every failure as "no plugin here".
	const pkg = path.join(root, 'node_modules', '@vitest', 'eslint-plugin');
	fs.mkdirSync(pkg, { recursive: true });
	fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@vitest/eslint-plugin', version: '1.6.27', exports: { '.': { import: './index.mjs' } } }));
	const from = isolatedPlugin(path.join(root, 'apps', 'web'), 'member');
	assert.throws(() => copied.config({ from }), (error) => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
});

// ── branch attribution, in a real repository outside this checkout ──────────────

function git(dir, ...args) {
	return execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
		cwd: dir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

/** A repository on `feature`, one commit past `main`: inherited.test.js is untouched, and the
 *  branch adds introduced.test.js. Both hold a focused test. */
function repository(name) {
	const dir = path.join(TMP, name);
	fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'test', 'inherited.test.js'), "test.only('inherited', () => {});\n");
	fs.writeFileSync(path.join(dir, 'test', 'plain.test.js'), "test('plain', () => {});\n");
	git(dir, 'init', '-b', 'main');
	git(dir, 'add', '-A');
	git(dir, 'commit', '-m', 'base');
	git(dir, 'checkout', '-b', 'feature');
	fs.writeFileSync(path.join(dir, 'test', 'introduced.test.js'), "test.only('introduced', () => {});\n");
	fs.writeFileSync(
		path.join(dir, 'test', 'inherited.test.js'),
		"test.only('inherited', () => {});\ntest('added by the branch', () => {});\n",
	);
	git(dir, 'add', '-A');
	git(dir, 'commit', '-m', 'work');
	return dir;
}

/** The messages the set reports for `code` as `filename` in `dir`. */
function branchMessages(dir, code, filename, options = {}) {
	const messages = new Linter({ cwd: dir, configType: 'flat' }).verify(
		code,
		[PARSER, ...config({ inspection: { mode: 'branch', base: 'main' }, ...options })],
		path.join(dir, filename),
	);
	const fatal = messages.find((m) => m.fatal);
	if (fatal) throw new Error(`${filename}: ${fatal.message}`);
	return messages.map((m) => m.line);
}

const REPO = repository('branch');

test('branch: the focused test the branch introduced is reported, the inherited one is not', () => {
	assert.deepEqual(branchMessages(REPO, "test.only('introduced', () => {});\n", 'test/introduced.test.js'), [1]);
	assert.deepEqual(
		branchMessages(REPO, "test.only('inherited', () => {});\ntest('added by the branch', () => {});\n", 'test/inherited.test.js'),
		[],
	);
	assert.deepEqual(branchMessages(REPO, "test('plain', () => {});\n", 'test/plain.test.js'), []);
});

test('full: the inherited finding is reported too, so the gate is what changed', () => {
	assert.deepEqual(
		branchMessages(REPO, "test.only('inherited', () => {});\ntest('added by the branch', () => {});\n", 'test/inherited.test.js', {
			inspection: 'full',
		}),
		[1],
	);
});

test('branch: an async assertion the branch introduced is reported, an inherited one is not', () => {
	const assertion = "test('x', () => { expect(fetch('u')).resolves.toBe('y'); });";
	// introduced.test.js is new, so every line is the branch's.
	assert.deepEqual(branchMessages(REPO, `${assertion}\n`, 'test/introduced.test.js'), [1]);
	// inherited.test.js line 1 is from main; the branch added line 2.
	assert.deepEqual(branchMessages(REPO, `${assertion}\ntest('added by the branch', () => {});\n`, 'test/inherited.test.js'), []);
	assert.deepEqual(
		branchMessages(REPO, "test('base line', () => {});\n" + `${assertion}\n`, 'test/inherited.test.js'),
		[2],
	);
});
