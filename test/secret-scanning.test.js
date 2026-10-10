import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PINNED_GITLEAKS_VERSION, resolvePinnedGitleaks } from './gitleaks-binary.js';
import { REDACTED, parseGitleaksReport } from '../tools/security/gitleaks-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMAND = path.join(ROOT, 'tools/security/gitleaks-check.mjs');
const CLEAN_FIXTURE = path.join(ROOT, 'test/fixtures/secret-scanning/clean.ts');
// No silent skip: this throws, and fails the file, when the pinned scanner is not available.
const GITLEAKS = await resolvePinnedGitleaks();

// Plain hex values, all reported by Gitleaks' generic-api-key rule when assigned to `apiKey`.
// DUMMY is the value tools/security/gitleaks.toml documents and allowlists; the others must be
// reported. None is a real credential or a provider-token shape.
const DUMMY = '9f4c2b7e1a8d6f3c5e0b9a2d7c4f1e8b';
const INTRODUCED = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
const INHERITED = '7c3e1a9b5d2f8046c1b7e3a9d5f26048';
const DELETED = '3d5f7a9c1e2b40586a7c9e1b3d5f7a9c';

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-secret-scanning-'));
after(() => {
	fs.rmSync(TEMP, { recursive: true, force: true });
});

test('branch mode fails an untracked credential without printing the matched value', () => {
	const repository = createRepository('untracked-credential');
	addCleanFixture(repository);
	const base = commitAll(repository, 'base');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);

	const result = scan(repository, ['--base', base]);

	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /^gitleaks-check: introduced generic-api-key introduced\.ts:1$/m);
	assert.match(result.stdout, /introduced 1, inherited 0/);
	for (const value of [INTRODUCED, DUMMY, INHERITED]) assert.doesNotMatch(result.output, new RegExp(value));
});

test('branch mode passes a clean branch and its documented allowlisted dummy value', () => {
	const repository = createRepository('clean-branch');
	addCleanFixture(repository);
	const base = commitAll(repository, 'base');
	writeFile(repository, 'added.ts', 'export const more = 1;\n');
	writeCredentialFile(repository, 'dummy.ts', DUMMY);
	commitAll(repository, 'add clean content and the allowlisted dummy');

	const result = scan(repository, ['--base', base]);

	assert.equal(result.code, 0, result.output);
	assert.match(result.stdout, /no findings/);
	for (const value of [DUMMY, INTRODUCED, INHERITED]) assert.doesNotMatch(result.output, new RegExp(value));
});

test('branch mode surfaces an inherited credential without failing the branch', () => {
	const repository = createRepository('inherited-credential');
	writeCredentialFile(repository, 'inherited.ts', INHERITED);
	const base = commitAll(repository, 'base');
	writeFile(repository, 'added.ts', 'export const more = 1;\n');
	commitAll(repository, 'add clean content');

	const result = scan(repository, ['--base', base]);

	assert.equal(result.code, 0, result.output);
	assert.match(result.stdout, /^gitleaks-check: inherited generic-api-key inherited\.ts:1 \(not introduced by this branch/m);
	assert.match(result.stdout, /introduced 0, inherited 1/);
	assert.doesNotMatch(result.output, new RegExp(INHERITED));
});

test('branch mode attributes the line the branch added, not the whole changed file', () => {
	const repository = createRepository('added-line-attribution');
	addCleanFixture(repository);
	writeCredentialFile(repository, 'shared.ts', INHERITED);
	const base = commitAll(repository, 'base');
	writeFile(repository, 'clean.ts', `${fs.readFileSync(CLEAN_FIXTURE, 'utf8')}export const added = 7;\nconst apiKey = "${INTRODUCED}";\n`);
	writeFile(repository, 'shared.ts', `const apiKey = "${INHERITED}";\nexport const touched = true;\n`);

	const result = scan(repository, ['--base', base]);

	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /^gitleaks-check: introduced generic-api-key clean\.ts:3$/m);
	assert.match(result.stdout, /^gitleaks-check: inherited generic-api-key shared\.ts:1 \(not introduced by this branch/m);
	assert.match(result.stdout, /introduced 1, inherited 1/);
	for (const value of [INTRODUCED, INHERITED]) assert.doesNotMatch(result.output, new RegExp(value));
});

test('branch mode fails a credential a later commit deleted', () => {
	const repository = createRepository('deleted-credential');
	addCleanFixture(repository);
	const base = commitAll(repository, 'base');
	writeCredentialFile(repository, 'gone.ts', DELETED);
	commitAll(repository, 'add a credential');
	git(repository, ['rm', '-q', 'gone.ts']);
	commitAll(repository, 'delete it again');

	const result = scan(repository, ['--base', base]);

	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /^gitleaks-check: introduced generic-api-key gone\.ts:1 commit [0-9a-f]{7}$/m);
	assert.doesNotMatch(result.output, new RegExp(DELETED));
});

test('history mode surfaces a credential only the history holds', () => {
	const repository = createRepository('history-credential');
	addCleanFixture(repository);
	commitAll(repository, 'base');
	writeCredentialFile(repository, 'gone.ts', DELETED);
	commitAll(repository, 'add a credential');
	git(repository, ['rm', '-q', 'gone.ts']);
	commitAll(repository, 'delete it again');

	const result = scan(repository, ['--mode', 'history']);

	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /^gitleaks-check: finding generic-api-key gone\.ts:1 commit [0-9a-f]{7}$/m);
	assert.match(result.stdout, /findings 1/);
	assert.doesNotMatch(result.output, new RegExp(DELETED));
});

test('history mode reports nothing for a repository that never held a credential', () => {
	const repository = createRepository('history-clean');
	addCleanFixture(repository);
	commitAll(repository, 'base');

	const result = scan(repository, ['--mode', 'history']);

	assert.equal(result.code, 0, result.output);
	assert.match(result.stdout, /no findings/);
});

test('an inline gitleaks:allow comment does not excuse a line', () => {
	const repository = createRepository('inline-allow');
	addCleanFixture(repository);
	const base = commitAll(repository, 'base');
	writeCredentialFile(repository, 'inline.ts', INTRODUCED, ' // gitleaks:allow');

	const result = scan(repository, ['--base', base]);

	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /^gitleaks-check: introduced generic-api-key inline\.ts:1$/m);
	assert.doesNotMatch(result.output, new RegExp(INTRODUCED));
});

test('a source .gitleaksignore is refused rather than honored', () => {
	const repository = createRepository('source-ignore');
	addCleanFixture(repository);
	const base = commitAll(repository, 'base');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);
	writeFile(repository, '.gitleaksignore', 'introduced.ts:generic-api-key:1\n');

	const result = scan(repository, ['--base', base]);

	assert.equal(result.code, 2, result.output);
	assert.match(result.stderr, /cannot check: a \.gitleaksignore in the source is not permitted/);
	assert.doesNotMatch(result.output, new RegExp(INTRODUCED));
});

test('GITLEAKS_CONFIG and an ambient .gitleaks.toml cannot widen the rule set', () => {
	const repository = createRepository('ambient-config');
	addCleanFixture(repository);
	const base = commitAll(repository, 'base');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);
	const permissive = path.join(TEMP, 'permissive.toml');
	writeFile(TEMP, 'permissive.toml', 'title = "permissive"\n[extend]\nuseDefault = false\n');
	writeFile(repository, '.gitleaks.toml', 'title = "permissive"\n[extend]\nuseDefault = false\n');

	const result = scan(repository, ['--base', base], { GITLEAKS_CONFIG: permissive });

	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /^gitleaks-check: introduced generic-api-key introduced\.ts:1$/m);
	assert.doesNotMatch(result.output, new RegExp(INTRODUCED));
});

test('a missing executable is an execution failure, never a clean result', () => {
	const repository = createRepository('missing-executable');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);

	const result = runCommand(['--source', repository, '--gitleaks', path.join(TEMP, 'not-here', 'gitleaks')]);

	assert.equal(result.code, 2, result.output);
	assert.match(result.stderr, /cannot check: the Gitleaks executable was not found/);
	assert.doesNotMatch(result.stdout, /no findings/);
});

test('a file that is not an executable is an execution failure', () => {
	const repository = createRepository('non-executable');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);
	const fake = path.join(TEMP, 'not-an-executable');
	writeFile(TEMP, 'not-an-executable', 'this is not a program\n');

	const result = runCommand(['--source', repository, '--gitleaks', fake]);

	assert.equal(result.code, 2, result.output);
	assert.match(result.stderr, /cannot check: (the Gitleaks executable was not found|Gitleaks could not be executed)/);
	assert.doesNotMatch(result.output, new RegExp(INTRODUCED));
});

test('a scanner that answers a different version is refused', () => {
	const repository = createRepository('version-mismatch');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);
	// A real executable that answers `version` with another version, so only the wrapper's check runs.
	writeFile(repository, path.join('version', 'index.js'), 'console.log("8.19.0");\n');

	const result = runCommand(['--source', repository, '--gitleaks', process.execPath]);

	assert.equal(result.code, 2, result.output);
	assert.match(result.stderr, new RegExp(`cannot check: Gitleaks 8\\.19\\.0 is not the pinned ${PINNED_GITLEAKS_VERSION.replaceAll('.', '\\.')}`));
	assert.doesNotMatch(result.output, new RegExp(INTRODUCED));
});

test('a scanner that does not finish in time is an execution failure', () => {
	const repository = createRepository('timeout');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);
	writeFile(repository, path.join('version', 'index.js'), 'console.log("8.30.1");\nsetTimeout(() => {}, 60000);\n');

	const result = runCommand(['--source', repository, '--gitleaks', process.execPath, '--timeout', '1']);

	assert.equal(result.code, 2, result.output);
	assert.match(result.stderr, /cannot check: Gitleaks did not finish within 1s/);
	assert.doesNotMatch(result.output, /no findings/);
});

test('an invalid config is an execution failure and prints no matched value', () => {
	const repository = createRepository('invalid-config');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);
	writeFile(TEMP, 'broken.toml', 'title = \n[[rules]\n');

	const result = runCommand(['--source', repository, '--config', path.join(TEMP, 'broken.toml'), '--gitleaks', GITLEAKS]);

	assert.equal(result.code, 2, result.output);
	assert.match(result.stderr, /cannot check:/);
	assert.doesNotMatch(result.output, new RegExp(INTRODUCED));
});

test('an unresolvable or injected base is an execution failure', () => {
	const repository = createRepository('bad-base');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);

	for (const base of ['does-not-exist', 'main; rm -rf /', '--base']) {
		const result = scan(repository, ['--base', base]);
		assert.equal(result.code, 2, `${base}: ${result.output}`);
		assert.match(result.stderr, /cannot check:/);
	}

	const injected = scan(repository, ['--base', 'HEAD; touch injected.txt']);
	assert.equal(injected.code, 2, injected.output);
	assert.ok(!fs.existsSync(path.join(repository, 'injected.txt')), 'a base reference must never run a command');
});

test('branch mode resolves a branch-name base and origin/HEAD by default', () => {
	const seed = createRepository('base-resolution-seed');
	addCleanFixture(seed);
	commitAll(seed, 'base');
	const remote = cloneRepository(seed, path.join(TEMP, 'base-resolution-remote.git'), true);
	const work = cloneRepository(remote, path.join(TEMP, 'base-resolution-work'));
	git(work, ['config', 'user.email', 'secret-scanning@lint-kit.test']);
	git(work, ['config', 'user.name', 'lint-kit']);
	writeCredentialFile(work, 'introduced.ts', INTRODUCED);

	const byDefault = scan(work);
	assert.equal(byDefault.code, 1, byDefault.output);
	assert.match(byDefault.stdout, /base origin\/HEAD/);

	const byBranch = scan(work, ['--base', 'main']);
	assert.equal(byBranch.code, 1, byBranch.output);
	assert.match(byBranch.stdout, /base main/);
});

test('an unsupported mode or option is an execution failure', () => {
	const repository = createRepository('unsupported-input');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);

	assert.equal(scan(repository, ['--mode', 'sideways']).code, 2);
	assert.equal(scan(repository, ['--severity=high']).code, 2);
	assert.equal(scan(repository, ['--timeout', '0']).code, 2);
});

test('--help names the modes and the exit codes', () => {
	const result = runCommand(['--help']);

	assert.equal(result.code, 0, result.output);
	assert.match(result.stdout, /--mode branch\|history/);
	assert.match(result.stdout, /Exit codes: 0 clean, 1 findings, 2 the check could not run/);
});

test('a scan leaves no report or temporary artifact behind', () => {
	const repository = createRepository('no-artifacts');
	writeCredentialFile(repository, 'inherited.ts', INHERITED);
	const base = commitAll(repository, 'base');
	writeCredentialFile(repository, 'introduced.ts', INTRODUCED);
	const before = leftoverScanDirectories();

	const result = scan(repository, ['--base', base]);

	assert.equal(result.code, 1, result.output);
	assert.deepEqual(leftoverScanDirectories(), before);
});

test('the report reader rejects anything that is not fully redacted', () => {
	const valid = JSON.stringify([
		{ RuleID: 'generic-api-key', File: 'src/a.ts', StartLine: 4, EndLine: 4, Commit: 'abc', Secret: REDACTED, Match: REDACTED, Author: 'someone@example.com' },
	]);
	const read = parseGitleaksReport(valid);
	assert.deepEqual(read, {
		ok: true,
		findings: [{ ruleId: 'generic-api-key', file: 'src/a.ts', startLine: 4, endLine: 4, commit: 'abc' }],
	});
	assert.doesNotMatch(JSON.stringify(read), /Secret|Match|Author|someone@example\.com/);

	const rejected = [
		'not json',
		'{"findings":[]}',
		'[null]',
		'[{"File":"a.ts","StartLine":1,"Secret":"REDACTED"}]',
		'[{"RuleID":"r","StartLine":1,"Secret":"REDACTED"}]',
		'[{"RuleID":"r","File":"a.ts","StartLine":0,"Secret":"REDACTED"}]',
		`[{"RuleID":"r","File":"a.ts","StartLine":1,"Secret":"hunter2-the-real-value"}]`,
	];
	for (const report of rejected) {
		const outcome = parseGitleaksReport(report);
		assert.equal(outcome.ok, false, report);
		assert.doesNotMatch(outcome.reason, /hunter2-the-real-value/);
	}
});

/** Every `gitleaks-check-*` directory currently in the OS temp directory. */
function leftoverScanDirectories() {
	return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('gitleaks-check-'));
}

/** A fresh git repository under the test temp directory. */
function createRepository(name) {
	const directory = path.join(TEMP, name);
	fs.mkdirSync(directory, { recursive: true });
	git(directory, ['init', '-q', '-b', 'main']);
	git(directory, ['config', 'user.email', 'secret-scanning@lint-kit.test']);
	git(directory, ['config', 'user.name', 'lint-kit']);
	return directory;
}

/** Clone `source` into `destination`, as a bare remote when asked. */
function cloneRepository(source, destination, bare = false) {
	const result = spawnSync('git', ['clone', '-q', ...(bare ? ['--bare'] : []), source, destination], {
		encoding: 'utf8',
	});
	assert.equal(result.status, 0, `git clone failed: ${result.stderr}`);
	return destination;
}

/** Run git in `directory` and fail the test when it does not succeed. */
function git(directory, args) {
	const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
	assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
	return (result.stdout ?? '').trim();
}

/** Stage and commit everything in `directory`, returning the new commit. */
function commitAll(directory, message) {
	git(directory, ['add', '-A']);
	git(directory, ['-c', 'commit.gpgsign=false', 'commit', '-qm', message]);
	return git(directory, ['rev-parse', 'HEAD']);
}

/** Write `content` to `name` under `directory`, creating folders as needed. */
function writeFile(directory, name, content) {
	const target = path.join(directory, name);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, content);
}

/** A file Gitleaks' generic-api-key rule reports for `value`. */
function writeCredentialFile(directory, name, value, suffix = '') {
	writeFile(directory, name, `const apiKey = "${value}";${suffix}\n`);
}

/** The committed fixture with nothing for a scanner to report. */
function addCleanFixture(directory) {
	fs.copyFileSync(CLEAN_FIXTURE, path.join(directory, 'clean.ts'));
}

/** Run the copied command and report its exit code and both streams. */
function runCommand(args, environment = {}) {
	const result = spawnSync(process.execPath, [COMMAND, ...args], {
		encoding: 'utf8',
		env: { ...process.env, ...environment },
	});
	const stdout = result.stdout ?? '';
	const stderr = result.stderr ?? '';
	return { code: result.status, stdout, stderr, output: `${stdout}${stderr}` };
}

/** Run the copied command over `repository` with the pinned scanner. */
function scan(repository, args = [], environment = {}) {
	return runCommand(['--source', repository, '--gitleaks', GITLEAKS, ...args], environment);
}
