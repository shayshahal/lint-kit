/**
 * Quarantine lifecycle for the vitest set (#49): what an entry excuses, when it stops, and how the
 * repository-wide structural check sees it.
 *
 * These tests drive the real `Linter` over the shipped `vitest/no-disabled-tests` rule and a real
 * `test-quarantine.json`, and run the validator CLI against real repositories. The rule is the
 * only place the format is matched, and the validator is the only place the lifecycle (structural
 * validity and expiry) is decided, so this file checks each through its own public surface rather
 * than a string helper. The installer's hook wiring and the installed ESLint run are
 * test/agent-skills-vitest-install.test.js; the guard's view of the ledger is in
 * test/policy-guard.test.js.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { config } from '../tools/eslint/vitest.mjs';
import { checkQuarantineLedger } from '../tools/eslint/check-quarantine-ledger.mjs';
import { parseQuarantineLedger } from '../tools/eslint/quarantine-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATOR = path.join(ROOT, 'tools', 'eslint', 'check-quarantine-ledger.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-vitest-quarantine-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const PARSER = { files: ['**/*.{js,ts}'], languageOptions: { parser: tsParser } };

function git(dir, ...args) {
	return execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
		cwd: dir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

/** A Git repository with one `main` commit holding `files`. */
function repo(name, files = {}) {
	const dir = path.join(TMP, name);
	fs.mkdirSync(dir, { recursive: true });
	git(dir, 'init', '-b', 'main');
	for (const [relative, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
		fs.writeFileSync(path.join(dir, relative), text);
	}
	git(dir, 'add', '-A');
	git(dir, 'commit', '-q', '--allow-empty', '-m', 'base');
	return dir;
}

/** The repository-relative ledger a repository holds; absent until written. */
const ledgerFile = (dir) => path.join(dir, 'test-quarantine.json');
const writeLedger = (dir, entries) => fs.writeFileSync(ledgerFile(dir), `${JSON.stringify({ version: 1, entries }, null, '\t')}\n`);
const writeLedgerText = (dir, text) => fs.writeFileSync(ledgerFile(dir), text);

const sha256 = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

/** One entry, valid unless a field is overridden. */
const entry = (over = {}) => ({
	file: 'a.test.js',
	line: 1,
	column: 1,
	sourceCallSha256: sha256("test.skip('a', () => {})"),
	reason: 'flaky against the real payments API',
	owner: '@team-payments',
	expires: '2099-12-31',
	...over,
});

/** Lint `code` as `filename` in `dir` through the shipped set and return the message list. */
function lintMessages(dir, code, filename, options = {}) {
	const messages = new Linter({ cwd: dir, configType: 'flat' }).verify(code, [PARSER, ...config(options)], path.join(dir, filename));
	const fatal = messages.find((message) => message.fatal);
	if (fatal) throw new Error(`${filename}: ${fatal.message}`);
	return messages;
}

const skipMessages = (dir, code, filename, options) =>
	lintMessages(dir, code, filename, options).filter((message) => message.ruleId === 'vitest/no-disabled-tests');

// ── upstream behavior: what the rule reports without a ledger ─────────────────────

test('every unconditional-skip shape is one blocking native diagnostic per defect', () => {
	const dir = repo('shapes');
	const blocked = [
		"test.skip('a', () => {});",
		"it.skip('b', () => {});",
		"describe.skip('c', () => {});",
		"test.skip.each([1])('d', () => {});",
		"test.concurrent.skip('e', () => {});",
		"test.skip.fails('f', () => {});",
		"test['skip']('h', () => {});",
		"xit('i', () => {});",
		"xtest('j', () => {});",
		"xdescribe('k', () => {});",
		// The first argument is the name, not a condition: this is an unconditional skip.
		"test.skip(false, 'why', () => {});",
		// A dynamic title is still a skip; identity is the call, never the title.
		"test.skip(nameVar, () => {});",
		'pending();',
	];
	for (const code of blocked) {
		const messages = skipMessages(dir, code, 'a.test.js');
		assert.ok(messages.length >= 1, code);
		assert.equal(messages[0].severity, 2, code);
	}
	// `test.skip('a')` with no body keeps both native defects; the quarantine wraps both.
	const missing = skipMessages(dir, "test.skip('a');", 'a.test.js');
	assert.deepEqual(new Set(missing.map((message) => message.messageId)), new Set(['missingFunction', 'disabledTest']));
});

test('the legitimate forms upstream separates stay valid', () => {
	const dir = repo('allowed');
	const allowed = [
		"test.todo('later');",
		"it.todo('later');",
		"describe.todo('later');",
		"test.fails('expected failure', () => {});",
		"it.fails('expected failure', () => {});",
		"test.skipIf(process.platform === 'win32')('win', () => {});",
		"test.runIf(true)('runs', () => {});",
		"describe.skipIf(true)('group', () => {});",
		"describe.runIf(true)('group', () => {});",
		'const test = { skip: () => {} };\ntest.skip("other");',
		"import { test } from 'some-other-lib';\ntest.skip('other');",
	];
	for (const code of allowed) assert.deepEqual(skipMessages(dir, code, 'a.test.js'), [], code);
});

test('a non-test file is outside the set even when it calls test.skip', () => {
	const dir = repo('non-test');
	assert.deepEqual(lintMessages(dir, "test.skip('a', () => {});", 'src/app.ts'), []);
});

// ── a valid entry excuses exactly its call ────────────────────────────────────────

test('one live entry covers both native diagnostics of its call', () => {
	const dir = repo('covers-both');
	writeLedger(dir, [entry({ sourceCallSha256: sha256("test.skip('a')") })]);
	assert.deepEqual(skipMessages(dir, "test.skip('a');", 'a.test.js'), []);
});

test('duplicate titles at two sites are two identities, each excused alone', () => {
	const dir = repo('duplicate-titles');
	const code = "test.skip('dup', () => {});\ntest.skip('dup', () => {});\n";
	const hash = sha256("test.skip('dup', () => {})");
	writeLedger(dir, [entry({ line: 1, sourceCallSha256: hash })]);
	assert.deepEqual(skipMessages(dir, code, 'a.test.js').map((message) => message.line), [2]);
	writeLedger(dir, [entry({ line: 2, sourceCallSha256: hash })]);
	assert.deepEqual(skipMessages(dir, code, 'a.test.js').map((message) => message.line), [1]);
});

test('the enclosing-call identity covers .each, namespace, x-name, dynamic title and nesting', () => {
	const dir = repo('identities');
	const cases = [
		["test.skip.each([1])('a', () => {});", 1, 1, "test.skip.each([1])('a', () => {})"],
		["test.concurrent.skip('a', () => {});", 1, 1, "test.concurrent.skip('a', () => {})"],
		["xit('a', () => {});", 1, 1, "xit('a', () => {})"],
		["test.skip(nameVar, () => {});", 1, 1, 'test.skip(nameVar, () => {})'],
		["describe('g', () => {\n\ttest.skip('a', () => {});\n});", 2, 2, "test.skip('a', () => {})"],
	];
	for (const [code, line, column, call] of cases) {
		writeLedger(dir, [entry({ line, column, sourceCallSha256: sha256(call) })]);
		assert.deepEqual(skipMessages(dir, code, 'a.test.js'), [], code);
	}
});

test('a call passed as an argument keeps its own identity, not the caller call', () => {
	const dir = repo('argument-call');
	const code = "wrapper(test.skip('a', () => {}));\n";
	writeLedger(dir, [entry({ column: 9, sourceCallSha256: sha256("test.skip('a', () => {})") })]);
	assert.deepEqual(skipMessages(dir, code, 'a.test.js'), []);
});

test('an entry for one site does not excuse another, and a wrong-site entry excuses nothing', () => {
	const dir = repo('wrong-site');
	writeLedger(dir, [entry({ line: 5, sourceCallSha256: sha256("test.skip('a', () => {})") })]);
	assert.deepEqual(skipMessages(dir, "test.skip('a', () => {});", 'a.test.js').length, 1);
});

// ── fingerprint: the exact call bytes, LF-normalized ──────────────────────────────

test('a changed fingerprint at the same location forces a report even on an inherited line', () => {
	const dir = repo('fingerprint', { 'test/inherited.test.js': "test.skip('a', () => {});\n" });
	git(dir, 'checkout', '-qb', 'feature');
	// The line is inherited unchanged; only the entry's hash is wrong (it names a different call).
	writeLedger(dir, [entry({ file: 'test/inherited.test.js', sourceCallSha256: sha256("test.skip('b', () => {})") })]);
	const branch = { inspection: { mode: 'branch', base: 'main' } };
	assert.deepEqual(skipMessages(dir, "test.skip('a', () => {});\n", 'test/inherited.test.js', branch).map((m) => m.line), [1]);
	// The matching hash drops it in the same inherited file.
	writeLedger(dir, [entry({ file: 'test/inherited.test.js', sourceCallSha256: sha256("test.skip('a', () => {})") })]);
	assert.deepEqual(skipMessages(dir, "test.skip('a', () => {});\n", 'test/inherited.test.js', branch), []);
});

test('agreement is over the whole call: broadening an inline group body invalidates the waiver', () => {
	const dir = repo('broaden');
	const original = "describe.skip('g', () => {\n\ttest('a', () => {});\n});";
	const broadened = "describe.skip('g', () => {\n\ttest('a', () => {});\n\ttest('b', () => {});\n});";
	writeLedger(dir, [entry({ sourceCallSha256: sha256("describe.skip('g', () => {\n\ttest('a', () => {});\n})") })]);
	assert.deepEqual(skipMessages(dir, broadened, 'a.test.js').length, 1);
	assert.deepEqual(skipMessages(dir, original, 'a.test.js'), []);
});

test('the fingerprint is LF-normalized, so a CRLF checkout of the same call matches', () => {
	const dir = repo('crlf');
	// Inside a call that spans lines, a CRLF file hashes the same as the LF entry.
	const lf = "describe.skip('g', () => {\n\ttest('a', () => {});\n});";
	const crlf = lf.replace(/\n/g, '\r\n');
	writeLedger(dir, [entry({ sourceCallSha256: sha256("describe.skip('g', () => {\n\ttest('a', () => {});\n})") })]);
	assert.deepEqual(skipMessages(dir, crlf, 'a.test.js'), []);
});

// ── canonical paths: Windows 8.3 aliases and links out of the root ────────────────

/** The Windows 8.3 short form of an existing directory, or null where the platform has none. */
function shortPathOf(dir) {
	if (process.platform !== 'win32') return null;
	const result = spawnSync(
		'powershell',
		['-NoProfile', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${dir}').ShortPath`],
		{ encoding: 'utf8' },
	);
	return result.stdout.trim() || null;
}

/** Lint `code` for the `vitest/no-disabled-tests` rule when the caller names `file` under `cwd`. */
function rawSkipMessages(cwd, code, file) {
	return new Linter({ cwd, configType: 'flat' })
		.verify(code, [PARSER, ...config()], path.join(cwd, file))
		.filter((message) => message.ruleId === 'vitest/no-disabled-tests');
}

test('a live entry excuses a synthetic file named through a Windows 8.3 short parent', (t) => {
	// The GitHub Windows runner sets TMP to a short `RUNNER~1` path. A synthetic (never written)
	// Linter filename therefore has a short parent while the Git root resolves to its long name; the
	// rule must canonicalize the existing parent so the two compare, or every live waiver misses.
	const dir = repo('short-alias');
	const short = shortPathOf(dir);
	if (!short || short.toLowerCase() === dir.toLowerCase()) {
		t.skip('this filesystem has no distinct 8.3 short name for the fixture');
		return;
	}
	const code = "test.skip('a');";
	writeLedger(dir, [entry({ sourceCallSha256: sha256("test.skip('a')") })]);
	// The same virtual file is excused through the long and the short spelling of its parent.
	assert.deepEqual(rawSkipMessages(dir, code, 'a.test.js'), []);
	assert.deepEqual(rawSkipMessages(short, code, 'a.test.js'), []);
	// A leaf that exists under the short parent resolves through its own realpath, unchanged.
	fs.writeFileSync(path.join(dir, 'a.test.js'), code);
	assert.deepEqual(rawSkipMessages(short, code, 'a.test.js'), []);
});

test('a virtual file under a directory link out of the root is not waived', (t) => {
	const dir = repo('alias-junction');
	const outside = path.join(TMP, 'alias-outside');
	fs.mkdirSync(outside, { recursive: true });
	try {
		fs.symlinkSync(outside, path.join(dir, 'linkdir'), process.platform === 'win32' ? 'junction' : 'dir');
	} catch {
		t.skip('this platform cannot create a directory link without elevation');
		return;
	}
	const code = "test.skip('a', () => {});";
	writeLedger(dir, [entry({ file: 'linkdir/x.test.js' })]);
	// The canonicalized parent leaves the root, so the entry grants nothing.
	assert.equal(rawSkipMessages(dir, code, path.join('linkdir', 'x.test.js')).length, 1);
});

test('a leaf symlink to an existing file outside the root is not waived', (t) => {
	const dir = repo('alias-leaf');
	const outside = path.join(TMP, 'alias-leaf-outside.test.js');
	fs.writeFileSync(outside, "test.skip('a', () => {});");
	try {
		fs.symlinkSync(outside, path.join(dir, 'leaf.test.js'), 'file');
	} catch {
		t.skip('this platform cannot create a file symlink without elevation');
		return;
	}
	writeLedger(dir, [entry({ file: 'leaf.test.js' })]);
	assert.equal(rawSkipMessages(dir, "test.skip('a', () => {});", 'leaf.test.js').length, 1);
});

test('a virtual file under a dangling directory link is not waived', (t) => {
	// `realpath` of the ancestor fails with ENOENT because the link's target is gone, but the
	// ancestor itself is present: that is not an absent ordinary directory, and the virtual tail
	// under it must not be treated as inside the root.
	const dir = repo('dangling-linkdir');
	const target = path.join(TMP, 'dangling-target-dir');
	fs.mkdirSync(target, { recursive: true });
	try {
		fs.symlinkSync(target, path.join(dir, 'linkdir'), process.platform === 'win32' ? 'junction' : 'dir');
	} catch {
		t.skip('this platform cannot create a directory link without elevation');
		return;
	}
	fs.rmSync(target, { recursive: true, force: true }); // the link now dangles
	writeLedger(dir, [entry({ file: 'linkdir/x.test.js' })]);
	assert.equal(rawSkipMessages(dir, "test.skip('a', () => {});", path.join('linkdir', 'x.test.js')).length, 1);
});

test('a virtual file under an ordinary missing nested directory stays excused', () => {
	// The ancestor walk is still allowed to pass over genuinely absent directories: only a present,
	// unresolvable link stops it.
	const dir = repo('missing-nested');
	writeLedger(dir, [entry({ file: 'nested/deep/x.test.js' })]);
	assert.deepEqual(rawSkipMessages(dir, "test.skip('a', () => {});", path.join('nested', 'deep', 'x.test.js')), []);
});

// ── structural validity fails closed ──────────────────────────────────────────────

test('a structural problem anywhere makes the whole ledger grant nothing', () => {
	const dir = repo('structural');
	const code = "test.skip('a', () => {});";
	const valid = entry();
	const bad = [
		{ reason: '   ' },
		{ owner: '' },
		{ expires: '2026-02-30' },
		{ expires: '2026-13-01' },
		{ expires: '31-12-2026' },
		{ expires: 20261231 },
		{ line: 0 },
		{ column: -1 },
		{ file: '/absolute/a.test.js' },
		{ file: '../escape.test.js' },
		{ file: 'C:\\drive.test.js' },
		{ sourceCallSha256: 'not-a-hash' },
		{ extra: 'unknown field' },
	];
	for (const override of bad) {
		writeLedger(dir, [{ ...valid, ...override }]);
		assert.deepEqual(skipMessages(dir, code, 'a.test.js').length, 1, JSON.stringify(override));
	}
	// A duplicate identity and a malformed document are invalid too.
	writeLedger(dir, [valid, valid]);
	assert.equal(skipMessages(dir, code, 'a.test.js').length, 1);
	writeLedgerText(dir, '{ not json');
	assert.equal(skipMessages(dir, code, 'a.test.js').length, 1);
	writeLedgerText(dir, `${JSON.stringify({ version: 2, entries: [valid] })}\n`);
	assert.equal(skipMessages(dir, code, 'a.test.js').length, 1);
	// A valid ledger of the same shape does excuse it.
	writeLedger(dir, [valid]);
	assert.deepEqual(skipMessages(dir, code, 'a.test.js'), []);
});

test('missing and invalid ledgers are distinct: absent grants nothing but is not a failure', () => {
	const dir = repo('absent');
	assert.deepEqual(skipMessages(dir, "test.skip('a', () => {});", 'a.test.js').length, 1);
	assert.equal(checkQuarantineLedger({ cwd: dir }).code, 0);
});

test('an unknown top-level document field is not an approval and invalidates the ledger', () => {
	const dir = repo('document-field');
	const code = "test.skip('a', () => {});";
	writeLedgerText(dir, `${JSON.stringify({ version: 1, entries: [entry()], 'APPROVED-BY': 'self' })}\n`);
	assert.equal(skipMessages(dir, code, 'a.test.js').length, 1);
	const result = checkQuarantineLedger({ cwd: dir });
	assert.equal(result.code, 1);
	assert.match(result.lines.join('\n'), /invalid \(unknown-document-field\)/);
	// The documented `{version, entries}` document still excuses the call.
	writeLedger(dir, [entry()]);
	assert.deepEqual(skipMessages(dir, code, 'a.test.js'), []);
});

test('an invalid UTF-8 byte in the ledger fails closed instead of reporting a valid entry', () => {
	const dir = repo('invalid-utf8');
	const document = `${JSON.stringify({ version: 1, entries: [entry()] })}\n`;
	const [before, after] = document.split('flaky against the real payments API');
	fs.writeFileSync(ledgerFile(dir), Buffer.concat([Buffer.from(before), Buffer.from([0xff]), Buffer.from(after)]));
	const result = checkQuarantineLedger({ cwd: dir });
	assert.equal(result.code, 1);
	assert.match(result.lines.join('\n'), /invalid \(bad-encoding\)/);
	// No replacement character, reason or raw byte leaks into the metadata-only output.
	assert.doesNotMatch(result.lines.join('\n'), /\uFFFD|flaky|replacement/i);
	assert.equal(skipMessages(dir, "test.skip('a', () => {});", 'a.test.js').length, 1);
});

test('a symlinked, dangling or non-regular ledger fails closed and is never called absent', (t) => {
	const dir = repo('ledger-node-type');
	const outside = path.join(TMP, 'ledger-outside.json');
	fs.writeFileSync(outside, `${JSON.stringify({ version: 1, entries: [entry()] })}\n`);
	try {
		fs.symlinkSync(outside, ledgerFile(dir), 'file');
	} catch {
		t.skip('this platform cannot create a file symlink without elevation');
		return;
	}
	// A live entry behind a symlink is not followed: the link is not a regular ledger file.
	const linked = checkQuarantineLedger({ cwd: dir });
	assert.equal(linked.code, 1);
	assert.match(linked.lines.join('\n'), /invalid \(not-regular-file\)/);
	assert.equal(skipMessages(dir, "test.skip('a', () => {});", 'a.test.js').length, 1);
	fs.rmSync(ledgerFile(dir), { force: true });
	// A dangling link is present and unusable, not an absent optional file.
	fs.symlinkSync(path.join(TMP, 'missing-ledger.json'), ledgerFile(dir), 'file');
	const dangling = checkQuarantineLedger({ cwd: dir });
	assert.equal(dangling.code, 1);
	assert.match(dangling.lines.join('\n'), /invalid \(not-regular-file\)/);
	fs.rmSync(ledgerFile(dir), { force: true });
	// A directory named like the ledger is not absent either.
	fs.mkdirSync(ledgerFile(dir));
	assert.equal(checkQuarantineLedger({ cwd: dir }).code, 1);
});

test('the validator refuses an unresolvable repository context instead of a clean absent ledger', () => {
	const outside = path.join(TMP, 'no-git');
	fs.mkdirSync(outside, { recursive: true });
	fs.writeFileSync(
		path.join(outside, 'test-quarantine.json'),
		`${JSON.stringify({ version: 1, entries: [entry({ expires: '2000-01-01' })] })}\n`,
	);
	const cli = spawnSync(process.execPath, [VALIDATOR], { cwd: outside, encoding: 'utf8' });
	assert.equal(cli.status, 2, `${cli.stdout}\n${cli.stderr}`);
	assert.match(cli.stdout, /unavailable/);
	assert.doesNotMatch(cli.stdout, /absent/);
	// The API outcome matches the CLI, and a bad working directory is unavailable too.
	assert.equal(checkQuarantineLedger({ cwd: outside }).code, 2);
	assert.equal(checkQuarantineLedger({ cwd: path.join(outside, 'missing') }).code, 2);
});

// ── expiry boundary through the production clock ──────────────────────────────────

test('expiry is inclusive through its UTC day, and forces the report the next day', (t) => {
	const dir = repo('expiry');
	writeLedger(dir, [entry({ expires: '2026-06-01' })]);
	t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-01T00:00:00Z') });
	assert.deepEqual(skipMessages(dir, "test.skip('a', () => {});", 'a.test.js'), []);
	t.mock.timers.setTime(Date.parse('2026-06-01T23:59:59Z'));
	assert.deepEqual(skipMessages(dir, "test.skip('a', () => {});", 'a.test.js'), []);
	t.mock.timers.setTime(Date.parse('2026-06-02T00:00:00Z'));
	assert.equal(skipMessages(dir, "test.skip('a', () => {});", 'a.test.js').length, 1);
});

// ── branch semantics ──────────────────────────────────────────────────────────────

test('branch: inherited skips stay exempt, introduced skips fail, and entries work at both', () => {
	const dir = repo('branch', {
		'test/inherited.test.js': "test.skip('inherited', () => {});\n",
		'test/plain.test.js': "test('plain', () => {});\n",
	});
	git(dir, 'checkout', '-qb', 'feature');
	fs.writeFileSync(path.join(dir, 'test/introduced.test.js'), "test.skip('introduced', () => {});\n");
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', 'work');
	const branch = { inspection: { mode: 'branch', base: 'main' } };
	assert.deepEqual(skipMessages(dir, "test.skip('introduced', () => {});\n", 'test/introduced.test.js', branch).map((m) => m.line), [1]);
	assert.deepEqual(skipMessages(dir, "test.skip('inherited', () => {});\n", 'test/inherited.test.js', branch), []);
	writeLedger(dir, [
		entry({ file: 'test/inherited.test.js', sourceCallSha256: sha256("test.skip('inherited', () => {})") }),
		entry({ file: 'test/introduced.test.js', sourceCallSha256: sha256("test.skip('introduced', () => {})") }),
	]);
	assert.deepEqual(skipMessages(dir, "test.skip('inherited', () => {});\n", 'test/inherited.test.js', branch), []);
	assert.deepEqual(skipMessages(dir, "test.skip('introduced', () => {});\n", 'test/introduced.test.js', branch), []);
});

test('branch: an expired entry forces its report even on an inherited line', () => {
	const dir = repo('branch-expired', { 'test/inherited.test.js': "test.skip('a', () => {});\n" });
	git(dir, 'checkout', '-qb', 'feature');
	writeLedger(dir, [entry({ file: 'test/inherited.test.js', expires: '2000-01-01' })]);
	const branch = { inspection: { mode: 'branch', base: 'main' } };
	const messages = skipMessages(dir, "test.skip('a', () => {});\n", 'test/inherited.test.js', branch);
	assert.deepEqual(messages.map((m) => m.line), [1]);
});

test('branch: moving a skip breaks the old entry and needs a reviewed ledger update', () => {
	const dir = repo('moved', { 'test/moved.test.js': "test.skip('moved', () => {});\n" });
	git(dir, 'checkout', '-qb', 'feature');
	fs.writeFileSync(path.join(dir, 'test/moved.test.js'), "// moved down\n\ntest.skip('moved', () => {});\n");
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', 'move');
	const branch = { inspection: { mode: 'branch', base: 'main' } };
	const code = "// moved down\n\ntest.skip('moved', () => {});\n";
	writeLedger(dir, [entry({ file: 'test/moved.test.js', line: 1, sourceCallSha256: sha256("test.skip('moved', () => {})") })]);
	assert.deepEqual(skipMessages(dir, code, 'test/moved.test.js', branch).map((m) => m.line), [3]);
	writeLedger(dir, [entry({ file: 'test/moved.test.js', line: 3, sourceCallSha256: sha256("test.skip('moved', () => {})") })]);
	assert.deepEqual(skipMessages(dir, code, 'test/moved.test.js', branch), []);
});

test('branch: a moved call on a Git-unchanged line is still forced by its entry fingerprint', () => {
	// The old entry is unconsumed because the call left its position; the call now sits on a line
	// Git still treats as context, so only the fingerprint pass can charge it. This is the path an
	// entry that owns its own site must not spoof for a duplicate elsewhere.
	const callText = "test.skip('moved2', () => {})";
	const dir = repo('moved-unchanged', { 'a.test.js': `${callText};\nconst after = 1;\n` });
	git(dir, 'checkout', '-qb', 'feature');
	const moved = `const before = 1;\n${callText};\nconst after = 1;\n`;
	fs.writeFileSync(path.join(dir, 'a.test.js'), moved);
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', 'move the call down');
	const branch = { inspection: { mode: 'branch', base: 'main' } };
	writeLedger(dir, [entry({ line: 1, sourceCallSha256: sha256(callText) })]);
	assert.deepEqual(skipMessages(dir, moved, 'a.test.js', branch).map((m) => m.line), [2]);
	writeLedger(dir, [entry({ line: 2, sourceCallSha256: sha256(callText) })]);
	assert.deepEqual(skipMessages(dir, moved, 'a.test.js', branch), []);
});

test('an expired or stale entry at one duplicate call does not force an identical call elsewhere', () => {
	const callText = "test.skip('dup2', () => {})";
	const code = `${callText};\n${callText};\n`;
	const dir = repo('duplicate-waiver', { 'a.test.js': code });
	const branch = { inspection: { mode: 'branch', base: 'main' } };
	// Both calls are inherited, so without a matching entry the second stays baseline-exempt. The
	// first entry is expired: it forces only its own line, never the duplicate.
	writeLedger(dir, [entry({ line: 1, sourceCallSha256: sha256(callText), expires: '2000-01-01' })]);
	assert.deepEqual(skipMessages(dir, code, 'a.test.js', branch).map((m) => m.line), [1]);
	// A stale fingerprint at the first call likewise forces only that call.
	writeLedger(dir, [entry({ line: 1, sourceCallSha256: '0'.repeat(64) })]);
	assert.deepEqual(skipMessages(dir, code, 'a.test.js', branch).map((m) => m.line), [1]);
	// A live matching entry excuses the first call and leaves the duplicate inherited and exempt.
	writeLedger(dir, [entry({ line: 1, sourceCallSha256: sha256(callText) })]);
	assert.deepEqual(skipMessages(dir, code, 'a.test.js', branch), []);
});

test('with no Git root the rule grants no waivers rather than a clean run', () => {
	const dir = path.join(TMP, 'no-git-lint');
	fs.mkdirSync(dir, { recursive: true });
	assert.equal(checkQuarantineLedger({ cwd: dir }).code, 2);
	// Even a live-looking ledger is unreadable without a root: the rule reports the skip.
	fs.writeFileSync(ledgerFile(dir), `${JSON.stringify({ version: 1, entries: [entry()] })}\n`);
	assert.equal(skipMessages(dir, "test.skip('a', () => {});", 'a.test.js', { inspection: 'full' }).length, 1);
});

test('full inspection with a live ledger suppresses an inherited skip too', () => {
	const dir = repo('full-ledger');
	writeLedger(dir, [entry({ sourceCallSha256: sha256("test.skip('a', () => {})") })]);
	assert.deepEqual(skipMessages(dir, "test.skip('a', () => {});", 'a.test.js', { inspection: 'full' }), []);
});

// ── the repository-wide validator ─────────────────────────────────────────────────

test('the validator is independent of test selection: an expired entry fails with no test changed', () => {
	const dir = repo('validator', { 'docs/readme.md': '# docs\n', 'tools/notes.txt': 'x\n' });
	writeLedger(dir, [entry({ file: 'test/deleted.test.js', expires: '2000-01-01' })]);
	const result = checkQuarantineLedger({ cwd: dir });
	assert.equal(result.code, 1);
	assert.match(result.lines.join('\n'), /test\/deleted\.test\.js:1:1 expired 2000-01-01/);
});

test('the validator reports a missing ledger as clean and a present bad ledger as a failure', () => {
	const dir = repo('validator-structural');
	assert.equal(checkQuarantineLedger({ cwd: dir }).code, 0);
	writeLedgerText(dir, '{ not json');
	const bad = checkQuarantineLedger({ cwd: dir });
	assert.equal(bad.code, 1);
	assert.match(bad.lines.join('\n'), /invalid \(not-json\)/);
	// No raw parser output and no entry text in the message.
	assert.doesNotMatch(bad.lines.join('\n'), /Unexpected|token|reason|owner|flaky/i);
});

test('the validator accepts a live ledger and rejects an expired one', () => {
	const dir = repo('validator-live');
	writeLedger(dir, [entry({ expires: '2099-12-31' })]);
	const live = checkQuarantineLedger({ cwd: dir });
	assert.equal(live.code, 0);
	assert.match(live.lines.join('\n'), /1 valid entry/);
	writeLedger(dir, [entry({ expires: '2000-01-01' })]);
	assert.equal(checkQuarantineLedger({ cwd: dir }).code, 1);
});

test('the installed validator CLI exits 1 for an expired entry and prints metadata only', () => {
	const dir = repo('validator-cli');
	writeLedger(dir, [entry({ reason: 'secret-reason', owner: 'secret-owner', expires: '2000-01-01' })]);
	const result = spawnSync(process.execPath, [VALIDATOR], { cwd: dir, encoding: 'utf8' });
	assert.equal(result.status, 1, result.stderr);
	assert.match(result.stdout, /a\.test\.js:1:1 expired 2000-01-01/);
	assert.doesNotMatch(result.stdout, /secret-reason|secret-owner/);
});

test('parseQuarantineLedger is the one structural owner and never returns raw JSON errors', () => {
	assert.deepEqual(parseQuarantineLedger('{'), { status: 'invalid', problem: 'not-json' });
	assert.deepEqual(parseQuarantineLedger('[]'), { status: 'invalid', problem: 'not-object' });
	assert.deepEqual(parseQuarantineLedger('{"version":1,"entries":{}}'), { status: 'invalid', problem: 'bad-entries' });
	const parsed = parseQuarantineLedger(JSON.stringify({ version: 1, entries: [entry()] }));
	assert.equal(parsed.status, 'valid');
	assert.equal(parsed.entries[0].reason, 'flaky against the real payments API');
	assert.equal(parsed.entries[0].sourceCallSha256, sha256("test.skip('a', () => {})"));
});

test('the validator finds the repository-root ledger from a workspace member, not its own folder', () => {
	// A workspace member is a Git subdirectory: the ledger is fixed at the root, resolved from Git,
	// so running the check from the member does not look for (or miss) a member-local file.
	const dir = repo('member-cwd', { 'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n", 'apps/web/package.json': '{}\n' });
	const member = path.join(dir, 'apps', 'web');
	writeLedger(dir, [entry({ expires: '2000-01-01' })]);
	assert.equal(checkQuarantineLedger({ cwd: member }).code, 1);
	writeLedger(dir, [entry({ expires: '2099-01-01' })]);
	assert.equal(checkQuarantineLedger({ cwd: member }).code, 0);
	// The member directory itself holds no ledger; the root one is what was read.
	assert.equal(fs.existsSync(path.join(member, 'test-quarantine.json')), false);
});
