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
import { fallowConfig } from '../bin/lint-kit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL_SOURCE = path.join(ROOT, 'tools', 'policy', 'policy-guard.mjs');
const JSONC_PARSER_SOURCE = path.join(ROOT, 'node_modules', 'jsonc-parser');
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

/**
 * The parser the copied guard resolves from its own location, as an installed consumer would
 * have it. `node_modules` is kept out of the fixture's Git tree through its local exclude, so a
 * later `git add -A` cannot make the dependency look like a source change.
 */
function installJsoncParser(dir) {
	const target = path.join(dir, 'node_modules', 'jsonc-parser');
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.cpSync(JSONC_PARSER_SOURCE, target, { recursive: true, dereference: true });
	fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), 'node_modules/\n');
}

const policy = (enrollments) => `${JSON.stringify({ version: 1, enrollments }, null, 2)}\n`;
const opaque = (id, source) => ({ id, source, format: 'opaque' });
const jsonc = (id, source, identities) => ({ id, source, format: 'jsonc', adapter: 'fallow-jsonc', identities });

/** A repository with the tool, a trusted policy on `main`, and one base commit. */
function project(name, { policy: policyText, enrollments, files, parser } = {}) {
	const dir = repository(name);
	installTool(dir);
	const text = policyText ?? policy(enrollments ?? [opaque('fallow', '.fallowrc.json')]);
	write(dir, 'lint-kit.policy.json', text);
	for (const [relativePath, content] of Object.entries(files ?? { '.fallowrc.json': '{"health":{"maxCognitive":25}}\n' })) {
		write(dir, relativePath, content);
	}
	commit(dir, 'base');
	// A parsed enrollment needs the dependency; an opaque-only repository must not be given one.
	if (parser ?? text.includes('fallow-jsonc')) installJsoncParser(dir);
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

// ── fallow-jsonc semantic comparison ─────────────────────────────────────────────

const FALLOW_IDENTITIES = [
	{ id: 'health.maxCognitive', unit: 'score', direction: 'max' },
	{ id: 'health.maxCrap', unit: 'score', direction: 'max' },
	{ id: 'rules', unit: 'severity-map', direction: 'min' },
	{ id: 'ignorePatterns', unit: 'glob-list', direction: 'subset' },
];

const raised = (config, from, to) => config.replace(`"maxCognitive": ${from}`, `"maxCognitive": ${to}`);

/** A repository whose trusted policy parses the real installer `.fallowrc.json` through the adapter. */
function fallowProject(name, { files, policy: policyText } = {}) {
	return project(name, {
		policy: policyText ?? policy([jsonc('fallow', '.fallowrc.json', FALLOW_IDENTITIES)]),
		files: { '.fallowrc.json': fallowConfig(['tools/**']), ...files },
	});
}

function revise(dir, text, message = 'revise the fallow config') {
	write(dir, '.fallowrc.json', text);
	commit(dir, message);
}

test('jsonc: the installer config parses through its comments and schema URL', () => {
	const dir = fallowProject('jsonc-installer');
	branch(dir);
	// The real `.fallowrc.json` carries `//` comments and a `$schema` URL; a regex comment
	// stripper would corrupt the URL. A tighter ceiling read from that file is silent.
	revise(dir, raised(fallowConfig(['tools/**']), 25, 20));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
	assert.match(result.stdout, /no unapproved enrolled change since main/);
});

test('jsonc: raising maxCognitive 25 -> 40 requires approval', () => {
	const dir = fallowProject('jsonc-max-raised');
	branch(dir);
	revise(dir, raised(fallowConfig(['tools/**']), 25, 40));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json/);
	assert.match(result.stdout, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
	assert.match(result.stdout, /max ceiling must not rise/);
});

test('jsonc: raising a 10 ceiling to 20 requires approval', () => {
	const dir = fallowProject('jsonc-max-10-20', { files: { '.fallowrc.json': raised(fallowConfig(['tools/**']), 25, 10) } });
	branch(dir);
	revise(dir, raised(fallowConfig(['tools/**']), 25, 20));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-weakened: health\.maxCognitive raised from 10 to 20/);
});

test('jsonc: raising maxCrap requires approval', () => {
	const dir = fallowProject('jsonc-crap-raised');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('"maxCrap": 100000', '"maxCrap": 200000'));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-weakened: health\.maxCrap raised from 100000 to 200000/);
});

test('jsonc: lowering a ceiling is silent', () => {
	const dir = fallowProject('jsonc-crap-lowered');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('"maxCrap": 100000', '"maxCrap": 80000'));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
});

test('jsonc: downgrading a rule severity requires approval', () => {
	const dir = fallowProject('jsonc-severity-down');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('"unused-dev-dependencies": "error"', '"unused-dev-dependencies": "warn"'));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-weakened: rules lowered unused-dev-dependencies from error to warn/);
});

test('jsonc: turning a rule off requires approval', () => {
	const dir = fallowProject('jsonc-severity-off');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('"unused-dev-dependencies": "error"', '"unused-dev-dependencies": "off"'));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /unused-dev-dependencies from error to off/);
});

test('jsonc: upgrading a rule severity is silent', () => {
	const dir = fallowProject('jsonc-severity-up');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('"unused-exports": "warn"', '"unused-exports": "error"'));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
});

test('jsonc: enabling an off rule is silent', () => {
	const dir = fallowProject('jsonc-severity-enable');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('"unused-component-props": "off"', '"unused-component-props": "error"'));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
});

test('jsonc: removing a protected rule requires approval', () => {
	const dir = fallowProject('jsonc-rule-removed');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('"unused-types": "warn",\n', ''));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-weakened: rules removed rule unused-types/);
});

test('jsonc: adding a weaker rule setting requires approval', () => {
	const dir = fallowProject('jsonc-rule-added-off');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('"unused-exports": "warn",', '"unused-exports": "warn",\n"brand-new-check": "off",'));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-weakened: rules added rule brand-new-check at off/);
});

test('jsonc: adding an error rule is silent', () => {
	const dir = fallowProject('jsonc-rule-added-error');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('"unused-exports": "warn",', '"unused-exports": "warn",\n"brand-new-check": "error",'));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
});

test('jsonc: adding an ignore pattern requires approval', () => {
	const dir = fallowProject('jsonc-ignore-added');
	branch(dir);
	revise(dir, fallowConfig(['tools/**', '**']));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-weakened: ignorePatterns added ignore "\*\*"/);
});

test('jsonc: removing an ignore pattern is silent', () => {
	const dir = fallowProject('jsonc-ignore-removed', { files: { '.fallowrc.json': fallowConfig(['tools/**', 'legacy/**']) } });
	branch(dir);
	revise(dir, fallowConfig(['tools/**']));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
});

test('jsonc: replacing an ignore glob with a narrower one requires approval', () => {
	const dir = fallowProject('jsonc-ignore-replaced');
	branch(dir);
	revise(dir, fallowConfig(['tools/src/**']));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-weakened: ignorePatterns added ignore "tools\/src\/\*\*"/);
});

test('jsonc: reordering an unchanged ignore set is silent', () => {
	const dir = fallowProject('jsonc-ignore-reorder', { files: { '.fallowrc.json': fallowConfig(['a/**', 'b/**']) } });
	branch(dir);
	revise(dir, fallowConfig(['b/**', 'a/**']));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
});

test('jsonc: a change outside the enrolled identities requires approval', () => {
	const dir = fallowProject('jsonc-outside');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('fallow-rs/fallow/main/schema.json', 'example.com/schema.json'));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-unrecognized: a value changed outside the enrolled identities/);
});

test('jsonc: a comment change is not silently dropped after parsing', () => {
	const dir = fallowProject('jsonc-comment');
	branch(dir);
	revise(dir, fallowConfig(['tools/**']).replace('// Reported, not failing.', '// reported, not failing'));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-unrecognized: a comment changed/);
});

test('jsonc: a supported tightening across identities is silent', () => {
	const dir = fallowProject('jsonc-tighten-all');
	branch(dir);
	revise(
		dir,
		fallowConfig(['tools/**']).replace('"maxCognitive": 25', '"maxCognitive": 20').replace('"unused-exports": "warn"', '"unused-exports": "error"'),
	);
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
});

test('jsonc: a missing or wrong-typed value fails with 2', () => {
	const cases = {
		missing: '{"rules":{},"ignorePatterns":[]}\n',
		stringScore: '{"health":{"maxCognitive":"25","maxCrap":100000},"rules":{},"ignorePatterns":[]}\n',
		badSeverity: '{"health":{"maxCognitive":25,"maxCrap":100000},"rules":{"unused-types":"fatal"},"ignorePatterns":[]}\n',
		badGlob: '{"health":{"maxCognitive":25,"maxCrap":100000},"rules":{},"ignorePatterns":[3]}\n',
		arrayRules: '{"health":{"maxCognitive":25,"maxCrap":100000},"rules":[],"ignorePatterns":[]}\n',
	};
	for (const [name, target] of Object.entries(cases)) {
		const dir = fallowProject(`jsonc-malformed-${name}`);
		branch(dir);
		revise(dir, target);
		const result = guard(dir, guardArgs());
		assert.equal(result.code, 2, `${name}: ${result.stdout}${result.stderr}`);
	}
});

test('jsonc: arbitrary executable config is never evaluated', () => {
	const marker = path.join(TMP, 'fallow-evaluated');
	const dir = fallowProject('jsonc-sideeffect');
	branch(dir);
	write(dir, '.fallowrc.json', `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(marker)}, 'x');\n`);
	commit(dir, 'js expression');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 2, result.stderr);
	assert.equal(fs.existsSync(marker), false);
});

test('jsonc: an unknown identity id fails with 2', () => {
	const dir = project('jsonc-unknown-id', {
		policy: policy([jsonc('fallow', '.fallowrc.json', [{ id: 'health.maxWeird', unit: 'score', direction: 'max' }])]),
		files: { '.fallowrc.json': fallowConfig(['tools/**']) },
	});
	branch(dir);
	assert.equal(guard(dir, guardArgs()).code, 2);
});

test('jsonc: a forged direction for a known identity fails with 2', () => {
	const dir = project('jsonc-forged-direction', {
		policy: policy([jsonc('fallow', '.fallowrc.json', [{ id: 'health.maxCognitive', unit: 'score', direction: 'min' }])]),
		files: { '.fallowrc.json': fallowConfig(['tools/**']) },
	});
	branch(dir);
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 2, result.stderr);
	assert.match(result.stderr, /direction for health\.maxCognitive must be max/);
});

test('jsonc: a wrong unit for a known identity fails with 2', () => {
	const dir = project('jsonc-wrong-unit', {
		policy: policy([jsonc('fallow', '.fallowrc.json', [{ id: 'rules', unit: 'score', direction: 'min' }])]),
		files: { '.fallowrc.json': fallowConfig(['tools/**']) },
	});
	branch(dir);
	assert.equal(guard(dir, guardArgs()).code, 2);
});

test('jsonc: a missing jsonc-parser fails with 2, not an uncaught exit', () => {
	const dir = project('jsonc-no-parser', {
		policy: policy([jsonc('fallow', '.fallowrc.json', FALLOW_IDENTITIES)]),
		files: { '.fallowrc.json': fallowConfig(['tools/**']) },
		parser: false,
	});
	branch(dir);
	revise(dir, raised(fallowConfig(['tools/**']), 25, 40));
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 2, `${result.stdout}${result.stderr}`);
	assert.match(result.stderr, /jsonc-parser/);
});

test('opaque: an opaque enrollment never needs the jsonc parser', () => {
	const dir = project('opaque-no-parser', {
		enrollments: [opaque('python-structure', 'tools/python/structure_check.py')],
		files: { 'tools/python/structure_check.py': 'print(1)\n' },
		parser: false,
	});
	branch(dir);
	write(dir, 'tools/python/structure_check.py', 'print(2)\n');
	commit(dir, 'change checker');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: tools\/python\/structure_check\.py/);
});

test('jsonc: a branch cannot redirect a ceiling by rewriting its enrollment', () => {
	const dir = fallowProject('jsonc-policy-tamper');
	branch(dir);
	revise(dir, raised(fallowConfig(['tools/**']), 25, 40));
	write(
		dir,
		'lint-kit.policy.json',
		policy([jsonc('fallow', '.fallowrc.json', [{ id: 'health.maxCognitive', unit: 'score', direction: 'min' }])]),
	);
	commit(dir, 'tamper');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: lint-kit\.policy\.json/);
	assert.match(result.stdout, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
});

test('jsonc: the trusted snapshot is independent of the source base', () => {
	const dir = fallowProject('jsonc-trusted-separate');
	branch(dir, 'approved');
	revise(dir, raised(fallowConfig(['tools/**']), 25, 40));
	git(dir, 'checkout', '-q', 'main');
	branch(dir, 'feature');
	revise(dir, raised(fallowConfig(['tools/**']), 25, 40));
	assert.equal(guard(dir, guardArgs({ trustedRef: 'approved' })).code, 0);
	assert.equal(guard(dir, guardArgs({ trustedRef: 'main' })).code, 1);
});

test('a guarded checker and a parsed config are both reported', () => {
	const dir = project('mixed-enrollments', {
		policy: policy([jsonc('fallow', '.fallowrc.json', FALLOW_IDENTITIES), opaque('structure', 'tools/python/structure_check.py')]),
		files: { '.fallowrc.json': fallowConfig(['tools/**']), 'tools/python/structure_check.py': 'print(1)\n' },
	});
	branch(dir);
	revise(dir, raised(fallowConfig(['tools/**']), 25, 40));
	write(dir, 'tools/python/structure_check.py', 'print(2)\n');
	commit(dir, 'weaken both');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: \.fallowrc\.json/);
	assert.match(result.stdout, /enrolled-change: tools\/python\/structure_check\.py/);
});

test('jsonc: the enrollment file itself is always an opaque review', () => {
	const dir = fallowProject('jsonc-policy-only');
	branch(dir);
	write(dir, 'lint-kit.policy.json', policy([jsonc('fallow', '.fallowrc.json', FALLOW_IDENTITIES), opaque('extra', 'extra.json')]));
	commit(dir, 'enroll more');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-change: lint-kit\.policy\.json/);
});

test('a test rename stays advisory and makes no coverage claim', () => {
	const dir = fallowProject('jsonc-test-rename');
	branch(dir);
	write(dir, 'test/old.test.js', "test('a', () => {});\n");
	commit(dir, 'add test');
	git(dir, 'mv', 'test/old.test.js', 'test/new.test.js');
	commit(dir, 'rename test');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, result.stderr);
	assert.match(result.stdout, /non-enrolled file\(s\) changed \(advisory\)/);
	assert.doesNotMatch(result.stdout, /coverage/);
});

// ── strict UTF-8 decoding of the raw bytes before JSONC/enrollment parsing ────────

/** Concatenates UTF-8 string pieces and raw byte pieces into one Buffer. */
const concatBytes = (...pieces) => Buffer.concat(pieces.map((piece) => (typeof piece === 'string' ? Buffer.from(piece, 'utf8') : piece)));

const UTF8_REPLACEMENT_BYTE = Buffer.from([0xff]);
const UTF8_LITERAL_REPLACEMENT_CHAR = Buffer.from([0xef, 0xbf, 0xbd]);
const UTF8_BYTE_ORDER_MARK = Buffer.from([0xef, 0xbb, 0xbf]);

/** A complete fallow config with `schema` in `$schema` and `maxCognitive` as the one ceiling. */
const fallowBytes = (schema, maxCognitive) =>
	concatBytes(`{"$schema":"${schema}","health":{"maxCognitive":${maxCognitive},"maxCrap":100000},"rules":{"unused-types":"warn"},"ignorePatterns":[]}\n`);

test('jsonc: an invalid byte in the target is not read as a literal U+FFFD', () => {
	const trusted = concatBytes('{"$schema":"', UTF8_LITERAL_REPLACEMENT_CHAR, '","health":{"maxCognitive":25,"maxCrap":100000},"rules":{"unused-types":"warn"},"ignorePatterns":[]}\n');
	const target = concatBytes('{"$schema":"', UTF8_REPLACEMENT_BYTE, '","health":{"maxCognitive":25,"maxCrap":100000},"rules":{"unused-types":"warn"},"ignorePatterns":[]}\n');
	const dir = fallowProject('jsonc-invalid-target', { files: { '.fallowrc.json': trusted } });
	branch(dir);
	write(dir, '.fallowrc.json', target);
	commit(dir, 'invalid byte outside an enrolled value');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 2, `${result.stdout}${result.stderr}`);
	assert.match(result.stderr, /\.fallowrc\.json is not valid UTF-8 at --target/);
});

test('jsonc: an invalid byte in the trusted snapshot fails with 2', () => {
	const trusted = concatBytes('{"$schema":"', UTF8_REPLACEMENT_BYTE, '","health":{"maxCognitive":25,"maxCrap":100000},"rules":{"unused-types":"warn"},"ignorePatterns":[]}\n');
	const target = concatBytes('{"$schema":"', UTF8_LITERAL_REPLACEMENT_CHAR, '","health":{"maxCognitive":20,"maxCrap":100000},"rules":{"unused-types":"warn"},"ignorePatterns":[]}\n');
	const dir = fallowProject('jsonc-invalid-trusted', { files: { '.fallowrc.json': trusted } });
	branch(dir);
	write(dir, '.fallowrc.json', target);
	commit(dir, 'tighten while the trusted snapshot holds an invalid byte');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 2, `${result.stdout}${result.stderr}`);
	assert.match(result.stderr, /\.fallowrc\.json is not valid UTF-8 at --trusted-ref/);
});

test('jsonc: an invalid byte in the enrollment file fails with 2', () => {
	const dir = repository('jsonc-invalid-enrollment');
	installTool(dir);
	write(
		dir,
		'lint-kit.policy.json',
		concatBytes('{"version":1,"enrollments":[{"id":"fallow","source":"configs/', UTF8_REPLACEMENT_BYTE, '.json","format":"opaque"}]}\n'),
	);
	commit(dir, 'base with an invalid enrollment byte');
	branch(dir);
	write(dir, 'src/app.ts', 'export const x = 1;\n');
	commit(dir, 'unrelated change');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 2, `${result.stdout}${result.stderr}`);
	assert.match(result.stderr, /lint-kit\.policy\.json is not valid UTF-8 at --trusted-ref/);
});

test('jsonc: a literal U+FFFD and further unicode survive a tightening', () => {
	const schema = '\uFFFD\u2014na\u00efve\u{1F600}';
	const dir = fallowProject('jsonc-unicode-tighten', { files: { '.fallowrc.json': fallowBytes(schema, 25) } });
	branch(dir);
	write(dir, '.fallowrc.json', fallowBytes(schema, 20));
	commit(dir, 'tighten the ceiling while the valid unicode stays');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 0, `${result.stdout}${result.stderr}`);
	assert.match(result.stdout, /no unapproved enrolled change since main/);
});

test('jsonc: a changed literal U+FFFD is still a review, not a silent match', () => {
	const dir = fallowProject('jsonc-fffd-edit', { files: { '.fallowrc.json': fallowBytes('\uFFFD', 25) } });
	branch(dir);
	write(dir, '.fallowrc.json', fallowBytes('plain', 25));
	commit(dir, 'replace the literal replacement character');
	const result = guard(dir, guardArgs());
	assert.equal(result.code, 1, result.stderr);
	assert.match(result.stdout, /enrolled-unrecognized: a value changed outside the enrolled identities/);
});

test('jsonc: adding a byte-order mark is a visible edit, not an implicit normalization', () => {
	const dir = fallowProject('jsonc-bom-added');
	branch(dir);
	write(dir, '.fallowrc.json', concatBytes(UTF8_BYTE_ORDER_MARK, fallowBytes('\uFFFD', 25)));
	commit(dir, 'add a byte-order mark');
	const result = guard(dir, guardArgs());
	assert.notEqual(result.code, 0, `${result.stdout}${result.stderr}`);
});
