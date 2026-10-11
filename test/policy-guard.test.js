/**
 * policy-guard: the copied command that reports an unapproved enrolled checker change.
 *
 * These tests build real repositories outside this checkout, copy the command into them the way
 * `init` would, and run it as a subprocess. Only the exit code, stdout and stderr are asserted:
 * the point is the public command and the real Git it reads, not a helper inside it.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL_SOURCE = path.join(ROOT, 'tools', 'policy', 'policy-guard.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-policy-guard-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function git(dir, ...args) {
	return execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
		cwd: dir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

function write(dir, relativePath, content) {
	fs.mkdirSync(path.dirname(path.join(dir, relativePath)), { recursive: true });
	fs.writeFileSync(path.join(dir, relativePath), content);
}

function commit(dir, message) {
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', message);
}

function repository(name) {
	const dir = path.join(TMP, name);
	fs.mkdirSync(dir, { recursive: true });
	git(dir, 'init', '-b', 'main');
	return dir;
}

/** Copies the command into the fixture the way `init` ships it. */
function installTool(dir) {
	const target = path.join(dir, 'tools', 'policy', 'policy-guard.mjs');
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.copyFileSync(TOOL_SOURCE, target);
	return target;
}

const policy = (enrollments) => `${JSON.stringify({ version: 1, enrollments }, null, 2)}\n`;
const opaque = (id, source) => ({ id, source, format: 'opaque' });
const jsonc = (id, source, identities) => ({ id, source, format: 'jsonc', adapter: 'fallow-jsonc', identities });

/** A repository with the tool, a trusted policy on `main`, and one base commit. */
function project(name, { policy: policyText, enrollments, files } = {}) {
	const dir = repository(name);
	installTool(dir);
	write(dir, 'lint-kit.policy.json', policyText ?? policy(enrollments ?? [opaque('fallow', '.fallowrc.json')]));
	for (const [relativePath, content] of Object.entries(files ?? { '.fallowrc.json': '{"health":{"maxCognitive":25}}\n' })) {
		write(dir, relativePath, content);
	}
	commit(dir, 'base');
	return dir;
}

function branch(dir, name = 'feature') {
	git(dir, 'checkout', '-qb', name);
}

function guardArgs(overrides = {}) {
	const values = {
		base: 'main',
		target: 'HEAD',
		trustedRef: 'main',
		policy: 'lint-kit.policy.json',
		mode: 'committed',
		...overrides,
	};
	return [
		'--base',
		values.base,
		'--target',
		values.target,
		'--trusted-ref',
		values.trustedRef,
		'--policy',
		values.policy,
		'--mode',
		values.mode,
		...(values.extra ?? []),
	];
}

function guard(dir, args, { cwd = dir, env } = {}) {
	const result = spawnSync(process.execPath, [path.join(dir, 'tools', 'policy', 'policy-guard.mjs'), ...args], {
		cwd,
		encoding: 'utf8',
		env: env ? { ...process.env, ...env } : process.env,
	});
	return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// ── clean and advisory ───────────────────────────────────────────────────────────

test('committed: a non-enrolled change is clean and advisory only', () => {
	const dir = project('clean');
	branch(dir);
	write(dir, 'src/app.ts', 'export const x = 1;\n');
	commit(dir, 'app');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
	assert.match(result.stdout, /no unapproved enrolled change since main/);
	assert.match(result.stdout, /non-enrolled file\(s\) changed \(advisory\)/);
});

test('committed: an unchanged checkout is clean', () => {
	const dir = project('unchanged');
	branch(dir);
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
});

test('committed: a committed-only change is seen with a clean working tree', () => {
	const dir = project('committed-only');
	branch(dir);
	write(dir, '.fallowrc.json', '{"health":{"maxCognitive":40}}\n');
	commit(dir, 'weaken');
	const result = guard(dir, guardArgs({ mode: 'committed' }));
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json \(modified\)/);
});

// ── enrolled changes ─────────────────────────────────────────────────────────────

test('committed: a changed enrolled file needs review', () => {
	const dir = project('changed');
	branch(dir);
	write(dir, '.fallowrc.json', '{"health":{"maxCognitive":40}}\n');
	commit(dir, 'weaken');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /policy-guard: enrolled-change: \.fallowrc\.json/);
});

test('committed: deleting the enrolled file alone needs review', () => {
	const dir = project('deleted');
	branch(dir);
	git(dir, 'rm', '-q', '.fallowrc.json');
	commit(dir, 'delete');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json \(deleted\)/);
});

test('committed: adding an enrolled file needs review', () => {
	const dir = project('added', { files: { 'keep.txt': 'x\n' } });
	branch(dir);
	write(dir, '.fallowrc.json', '{}\n');
	commit(dir, 'add');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json \(added\)/);
});

test('committed: renaming the enrolled file away needs review', () => {
	const dir = project('renamed-away');
	branch(dir);
	git(dir, 'mv', '.fallowrc.json', '.fallowrc2.json');
	commit(dir, 'rename');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json/);
});

test('committed: an enrolled path that is the new name of a rename needs review', () => {
	const dir = project('renamed-in', {
		enrollments: [opaque('alt', 'configs/alt.json')],
		files: { 'configs/legacy.json': '{"a":1}\n' },
	});
	branch(dir);
	git(dir, 'mv', 'configs/legacy.json', 'configs/alt.json');
	commit(dir, 'rename');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: configs\/alt\.json \(renamed-to\)/);
});

test('committed: rename mispairing still reports the enrolled path that disappeared', () => {
	const dir = project('mispair');
	branch(dir);
	// The twin holds the enrolled file's bytes, so git pairs the twin with the rename and reports
	// the enrolled path as deleted. Matching only the rename's new side would miss it.
	write(dir, 'twin.json', '{"health":{"maxCognitive":25}}\n');
	commit(dir, 'twin');
	git(dir, 'mv', 'twin.json', 'renamed.json');
	git(dir, 'rm', '-q', '.fallowrc.json');
	commit(dir, 'swap');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json/);
});

test('committed: a jsonc enrollment is accepted and its source is treated as opaque', () => {
	const dir = project('jsonc', {
		enrollments: [jsonc('fallow', '.fallowrc.json', [{ id: 'health.maxCognitive', unit: 'score', direction: 'max' }])],
		files: { '.fallowrc.json': '// a comment, not strict JSON\n{"health":{"maxCognitive":25}}\n' },
	});
	branch(dir);
	write(dir, '.fallowrc.json', '// a comment, not strict JSON\n{"health":{"maxCognitive":40}}\n');
	commit(dir, 'weaken');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json/);
});

// ── paths ────────────────────────────────────────────────────────────────────────

test('committed: a Unicode path with a space is reported verbatim', () => {
	const dir = project('unicode', {
		enrollments: [opaque('i18n', 'config dir/café.json')],
		files: { 'config dir/café.json': '{"a":1}\n' },
	});
	branch(dir);
	write(dir, 'config dir/café.json', '{"a":2}\n');
	commit(dir, 'change');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: config dir\/café\.json \(modified\)/);
});

test('committed: a leading-dash path is reported', () => {
	const dir = project('dash', { enrollments: [opaque('dash', '-dash.json')], files: { '-dash.json': '{}\n' } });
	branch(dir);
	write(dir, '-dash.json', '{"b":2}\n');
	commit(dir, 'change');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: -dash\.json \(modified\)/);
});

test('committed: a Windows separator in the enrollment matches the forward-slash path', () => {
	const dir = project('separator', {
		enrollments: [opaque('sub', 'sub\\enrolled.json')],
		files: { 'sub/enrolled.json': '{}\n' },
	});
	branch(dir);
	write(dir, 'sub/enrolled.json', '{"b":2}\n');
	commit(dir, 'change');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: sub\/enrolled\.json \(modified\)/);
});

test('committed: running from a subdirectory still resolves the repository', () => {
	const dir = project('subcwd', { files: { '.fallowrc.json': '{}\n', 'sub/keep.txt': 'x\n' } });
	branch(dir);
	write(dir, '.fallowrc.json', '{"b":2}\n');
	commit(dir, 'change');
	const result = guard(dir, guardArgs(), { cwd: path.join(dir, 'sub') });
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json/);
});

test('--cwd selects the repository', () => {
	const dir = project('cwd');
	branch(dir);
	write(dir, '.fallowrc.json', '{"b":2}\n');
	commit(dir, 'change');
	const result = guard(dir, guardArgs({ extra: ['--cwd', dir] }), { cwd: os.tmpdir() });
	assert.equal(result.code, 1, result.stderr);
});

// ── working tree ─────────────────────────────────────────────────────────────────

test('working-tree: an unstaged enrolled change needs review', () => {
	const dir = project('wt-unstaged');
	branch(dir);
	write(dir, '.fallowrc.json', '{"health":{"maxCognitive":40}}\n');
	const result = guard(dir, guardArgs({ mode: 'working-tree' }));
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json \(modified\)/);
});

test('working-tree: a staged-only enrolled change needs review', () => {
	const dir = project('wt-staged');
	branch(dir);
	write(dir, '.fallowrc.json', '{"health":{"maxCognitive":40}}\n');
	git(dir, 'add', '.fallowrc.json');
	const result = guard(dir, guardArgs({ mode: 'working-tree' }));
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json/);
});

test('working-tree: an in-scope untracked enrolled file needs review', () => {
	const dir = project('wt-untracked', { files: { 'keep.txt': 'x\n' } });
	branch(dir);
	write(dir, '.fallowrc.json', '{}\n');
	const result = guard(dir, guardArgs({ mode: 'working-tree' }));
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json \(untracked\)/);
});

test('working-tree: an untracked file outside the enrollment is clean', () => {
	const dir = project('wt-outside');
	branch(dir);
	write(dir, 'notes.txt', 'x\n');
	const result = guard(dir, guardArgs({ mode: 'working-tree' }));
	assert.equal(result.code, 0, result.stderr);
});

test('working-tree: an ignored untracked enrolled file is not hidden by the ignore pattern', () => {
	const dir = project('wt-ignored', { files: { '.gitignore': '.fallowrc.json\n', 'keep.txt': 'x\n' } });
	branch(dir);
	write(dir, '.fallowrc.json', '{}\n');
	const result = guard(dir, guardArgs({ mode: 'working-tree' }));
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json \(untracked\)/);
});

test('working-tree: a target that is not HEAD fails with 2', () => {
	const dir = project('wt-target');
	branch(dir);
	write(dir, '.fallowrc.json', '{"b":2}\n');
	commit(dir, 'change');
	const result = guard(dir, guardArgs({ mode: 'working-tree', target: 'main' }));
	assert.equal(result.code, 2, result.stderr);
	assert.match(result.stderr, /HEAD/);
});

// ── trusted snapshot and self-enrollment ─────────────────────────────────────────

test('a source change matching the trusted snapshot bytes is not a new unapproved change', () => {
	const dir = repository('matching');
	installTool(dir);
	write(dir, 'lint-kit.policy.json', policy([opaque('fallow', '.fallowrc.json')]));
	write(dir, '.fallowrc.json', '{"health":{"maxCognitive":10}}\n');
	commit(dir, 'base');
	git(dir, 'branch', 'base');
	write(dir, '.fallowrc.json', '{"health":{"maxCognitive":25}}\n');
	commit(dir, 'approved');
	git(dir, 'checkout', '-qb', 'feature', 'base');
	write(dir, '.fallowrc.json', '{"health":{"maxCognitive":25}}\n');
	commit(dir, 'restore-to-approved');
	const result = guard(dir, guardArgs({ base: 'base' }));
	assert.equal(result.code, 0, result.stderr);
});

test('changing the enrollment file itself needs review', () => {
	const dir = project('self');
	branch(dir);
	write(dir, 'lint-kit.policy.json', policy([opaque('fallow', '.fallowrc.json'), opaque('extra', 'extra.json')]));
	commit(dir, 'enroll more');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: lint-kit\.policy\.json/);
});

test('a branch that deletes its own enrollment cannot make a changed file pass', () => {
	const dir = project('friendly');
	branch(dir);
	write(dir, '.fallowrc.json', '{"health":{"maxCognitive":99}}\n');
	write(dir, 'lint-kit.policy.json', policy([opaque('other', 'other.json')]));
	commit(dir, 'friendly');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json/);
});

test('a branch-owned approval field cannot authorize a change', () => {
	const dir = project('approved');
	branch(dir);
	write(dir, '.fallowrc.json', '{"health":{"maxCognitive":99}}\n');
	write(
		dir,
		'lint-kit.policy.json',
		`${JSON.stringify({ version: 1, approvedBy: 'shay', enrollments: [opaque('fallow', '.fallowrc.json')] }, null, 2)}\n`,
	);
	commit(dir, 'self-approve');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json/);
});

test('branch checker code is never imported or executed', () => {
	const marker = path.join(TMP, 'sideeffect-marker');
	const dir = project('sideeffect', {
		enrollments: [opaque('eslint', 'eslint.config.js')],
		files: { 'eslint.config.js': 'export default [];\n' },
	});
	branch(dir);
	write(
		dir,
		'eslint.config.js',
		`import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(marker)}, 'executed');\nexport default [];\n`,
	);
	commit(dir, 'side effect');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.equal(fs.existsSync(marker), false);
});

// ── fail-closed inputs ───────────────────────────────────────────────────────────

test('missing required arguments fail with 2', () => {
	const dir = project('missing-args');
	for (const args of [
		['--target', 'HEAD', '--trusted-ref', 'main', '--policy', 'lint-kit.policy.json', '--mode', 'committed'],
		['--base', 'main', '--trusted-ref', 'main', '--policy', 'lint-kit.policy.json', '--mode', 'committed'],
		['--base', 'main', '--target', 'HEAD', '--policy', 'lint-kit.policy.json', '--mode', 'committed'],
		['--base', 'main', '--target', 'HEAD', '--trusted-ref', 'main', '--mode', 'committed'],
		['--base', 'main', '--target', 'HEAD', '--trusted-ref', 'main', '--policy', 'lint-kit.policy.json'],
	]) {
		const result = guard(dir, args);
		assert.equal(result.code, 2, `${args.join(' ')}: ${result.stderr}`);
	}
});

test('an unknown argument and an invalid mode fail with 2', () => {
	const dir = project('bad-args');
	assert.equal(guard(dir, [...guardArgs(), '--wat']).code, 2);
	assert.equal(guard(dir, guardArgs({ mode: 'index' })).code, 2);
});

test('an unresolvable base, target or trusted ref fails with 2', () => {
	const dir = project('bad-refs');
	branch(dir);
	write(dir, '.fallowrc.json', '{}\n');
	commit(dir, 'change');
	assert.equal(guard(dir, guardArgs({ base: 'nope' })).code, 2);
	assert.equal(guard(dir, guardArgs({ target: 'nope' })).code, 2);
	assert.equal(guard(dir, guardArgs({ trustedRef: 'nope' })).code, 2);
});

test('a base that is a blob or a rev:path fails with 2', () => {
	const dir = project('blob-base');
	branch(dir);
	assert.equal(guard(dir, guardArgs({ base: 'main:.fallowrc.json' })).code, 2);
});

test('a malicious base ref fails with 2 and writes no file', () => {
	const dir = project('injection');
	branch(dir);
	for (const base of ['--octopus', '--output=marker', '--output=../escaped']) {
		const result = guard(dir, guardArgs({ base }));
		assert.equal(result.code, 2, `${base}: ${result.stderr}`);
	}
	assert.equal(fs.existsSync(path.join(dir, 'marker')), false);
	assert.equal(fs.existsSync(path.join(TMP, 'escaped')), false);
});

test('unrelated histories fail with 2', () => {
	const dir = project('unrelated');
	git(dir, 'checkout', '-q', '--orphan', 'unrelated');
	write(dir, 'other.txt', 'x\n');
	commit(dir, 'orphan root');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 2, result.stderr);
});

test('an unborn HEAD fails with 2', () => {
	const dir = project('unborn');
	git(dir, 'checkout', '-q', '--orphan', 'fresh');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 2, result.stderr);
});

test('a policy absent at the trusted ref fails with 2', () => {
	const dir = project('policy-absent');
	branch(dir);
	assert.equal(guard(dir, guardArgs({ policy: 'nope.json' })).code, 2);
});

test('a malformed or unknown-field policy fails with 2', () => {
	const cases = {
		notjson: '{\n',
		wrongversion: `${JSON.stringify({ version: 2, enrollments: [opaque('fallow', '.fallowrc.json')] })}\n`,
		unknownfield: `${JSON.stringify({ version: 1, approvals: [], enrollments: [opaque('fallow', '.fallowrc.json')] })}\n`,
		unknownenrollmentfield: `${JSON.stringify({ version: 1, enrollments: [{ ...opaque('fallow', '.fallowrc.json'), baseline: 'x' }] })}\n`,
		badformat: `${JSON.stringify({ version: 1, enrollments: [{ id: 'fallow', source: '.fallowrc.json', format: 'yaml' }] })}\n`,
		jsoncWithoutAdapter: `${JSON.stringify({ version: 1, enrollments: [{ id: 'fallow', source: '.fallowrc.json', format: 'jsonc' }] })}\n`,
		opaqueWithAdapter: `${JSON.stringify({ version: 1, enrollments: [{ id: 'fallow', source: '.fallowrc.json', format: 'opaque', adapter: 'fallow-jsonc' }] })}\n`,
		absoluteSource: `${JSON.stringify({ version: 1, enrollments: [opaque('fallow', '/etc/passwd')] })}\n`,
		traversalSource: `${JSON.stringify({ version: 1, enrollments: [opaque('fallow', '../outside.json')] })}\n`,
	};
	for (const [name, text] of Object.entries(cases)) {
		const dir = project(`policy-${name}`, { policy: text });
		branch(dir);
		const result = guard(dir, guardArgs());
		assert.equal(result.code, 2, `${name}: ${result.stdout}${result.stderr}`);
	}
});

test('an absolute or traversing --policy path fails with 2', () => {
	const dir = project('policy-path');
	branch(dir);
	assert.equal(guard(dir, guardArgs({ policy: '/etc/passwd' })).code, 2);
	assert.equal(guard(dir, guardArgs({ policy: '../lint-kit.policy.json' })).code, 2);
});

test('a symlinked enrolled path in the working tree fails with 2 rather than being followed', (t) => {
	const dir = project('symlink');
	branch(dir);
	const outside = path.join(TMP, 'outside-secret.json');
	write(TMP, 'outside-secret.json', '{}\n');
	fs.rmSync(path.join(dir, '.fallowrc.json'));
	try {
		fs.symlinkSync(outside, path.join(dir, '.fallowrc.json'), 'file');
	} catch {
		t.skip('this platform cannot create a file symlink without elevation');
		return;
	}
	const result = guard(dir, guardArgs({ mode: 'working-tree' }));
	assert.equal(result.code, 2, result.stderr);
	assert.match(result.stderr, /symbolic link/);
});

// ── snapshot boundary corrections ────────────────────────────────────────────────

test('working-tree: a clean filter cannot hide a weakened enrolled file', () => {
	const dir = project('filter-hide');
	branch(dir);
	const marker = path.join(dir, 'filter-ran');
	// The branch configures the filter after the baseline commit, as a branch could. Git only
	// runs it when a command converts the file; the guard reads raw bytes and objects, so the
	// filter never runs and the weakened content is still reported.
	write(
		dir,
		'hide-filter.cjs',
		`const fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(marker)}, 'ran');\nprocess.stdout.write('{"health":{"maxCognitive":25}}\n');\n`,
	);
	write(dir, '.gitattributes', '.fallowrc.json filter=hide\n');
	git(dir, 'config', 'filter.hide.clean', 'node hide-filter.cjs');
	write(dir, '.fallowrc.json', '{"health":{"maxCognitive":999}}\n');
	const result = guard(dir, guardArgs({ mode: 'working-tree' }));
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json/);
	assert.equal(fs.existsSync(marker), false);
});

test('working-tree: an enrolled path behind a linked parent directory fails with 2', (t) => {
	const dir = project('linked-parent', {
		enrollments: [opaque('linked', 'linked/secret.json')],
		files: { 'keep.txt': 'x\n' },
	});
	branch(dir);
	const outside = path.join(TMP, 'linked-parent-outside');
	fs.mkdirSync(outside, { recursive: true });
	write(TMP, 'linked-parent-outside/secret.json', '{}\n');
	try {
		fs.symlinkSync(outside, path.join(dir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
	} catch {
		t.skip('this platform cannot create a directory link');
		return;
	}
	const result = guard(dir, guardArgs({ mode: 'working-tree' }));
	assert.equal(result.code, 2, result.stderr);
	assert.match(result.stderr, /symbolic link in its path/);
});

test('a drive-relative path fails with 2 on every platform', () => {
	const dir = project('drive-relative');
	branch(dir);
	assert.equal(guard(dir, guardArgs({ policy: 'C:outside.json' })).code, 2);
	const enrolled = project('drive-relative-source', {
		enrollments: [opaque('drive', 'C:outside.json')],
		files: { '.fallowrc.json': '{}\n' },
	});
	branch(enrolled);
	assert.equal(guard(enrolled, guardArgs()).code, 2);
});

test('working-tree: a bracketed filename is matched literally, not as a pattern', () => {
	const dir = project('brackets', {
		enrollments: [opaque('bracket', 'config[1].json')],
		files: { 'config[1].json': '{"a":1}\n', 'config1.json': '{"a":2}\n' },
	});
	branch(dir);
	write(dir, 'config[1].json', '{"a":2}\n');
	// GIT_GLOB_PATHSPECS would let `config[1].json` match the similar `config1.json`; the guard
	// forces literal matching, so it compares the intended file and reports it.
	const result = guard(dir, guardArgs({ mode: 'working-tree' }), { env: { GIT_GLOB_PATHSPECS: '1' } });
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: config\[1\]\.json/);
});
