/**
 * The installed vitest set (#47): the maintained focused-test rule from @vitest/eslint-plugin,
 * narrowed to the lines a branch added, on the project's tests inside and outside src/.
 *
 * The foundation evidence for what the plugin's rule accepts is
 * test/agent-skills-testing-plugin.test.js. This file proves the shipped set wraps exactly that
 * one rule, keeps the documented counterexamples, and charges only what a branch introduced; the
 * installer's hook wiring is test/agent-skills-vitest-install.test.js.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import vitest, { DEFAULT_FILES, config } from '../tools/eslint/vitest.mjs';
import errorHandling from '../tools/eslint/error-handling.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-vitest-set-'));
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

test('the set turns on one rule: the maintained focused-test rule, at error', () => {
	const [entry] = config();
	assert.deepEqual(Object.keys(vitest.plugin.rules), ['no-focused-tests']);
	assert.deepEqual(Object.keys(entry.rules), ['vitest/no-focused-tests']);
	assert.equal(entry.rules['vitest/no-focused-tests'], 'error');
	assert.equal(entry.plugins.vitest.rules['no-focused-tests'].meta.fixable, 'code');
	assert.deepEqual(DEFAULT_FILES, ['**/*.test.*', '**/*.spec.*']);
	// The plugin's recommended config turns on async and skip rules; none of them leaks in (#48, #49).
	for (const rule of ['vitest/valid-expect', 'vitest/valid-expect-in-promise', 'vitest/no-disabled-tests'])
		assert.ok(!(rule in entry.rules), rule);
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
