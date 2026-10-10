import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { main } from '../bin/lint-kit.js';
import { PINNED_GITLEAKS_VERSION, resolvePinnedGitleaks } from './gitleaks-binary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEFTHOOK = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'lefthook.CMD' : 'lefthook');
// No silent skip: this throws, and fails the file, when the pinned scanner is not available.
const GITLEAKS = await resolvePinnedGitleaks();
const GITLEAKS_DIR = path.dirname(GITLEAKS);
const COMMAND = 'node tools/security/gitleaks-check.mjs';
const HISTORY_SCRIPT = 'secret-scanning:history';

// Plain hex values, assigned to `apiKey`, that Gitleaks' generic-api-key rule reports. None is a
// real credential. DUMMY is the one placeholder tools/security/gitleaks.toml allowlists.
const DUMMY = '9f4c2b7e1a8d6f3c5e0b9a2d7c4f1e8b';
const INTRODUCED = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
const INHERITED = '7c3e1a9b5d2f8046c1b7e3a9d5f26048';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-secret-install-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const quiet = async (argv) => {
	const log = console.log;
	console.log = () => {};
	try {
		return await main(argv);
	} finally {
		console.log = log;
	}
};
const init = (dir, ...args) => quiet(['init', '--no-install', '--cwd', dir, ...args]);
const text = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const hooks = (dir) => parse(text(dir, 'lefthook.yml'));
const installFiles = [
	'tools/security/gitleaks-check.mjs',
	'tools/security/gitleaks-report.mjs',
	'tools/security/gitleaks.toml',
	'tools/security/gitleaks-check.md',
];

test('a fresh install copies the pinned command and config and wires one repository-root step', async () => {
	const dir = project('fresh', {
		'lefthook.yml': 'pre-commit:\n  commands:\n    format:\n      run: pnpm format\n',
		'package.json': '{\n\t"name": "consumer",\n\t"devDependencies": { "svelte": "^5" }\n}\n',
	});
	assert.equal(await init(dir, '--sets', 'secret-scanning'), 0);
	for (const file of installFiles) assert.ok(fs.existsSync(path.join(dir, file)), file);
	// the selected config keeps the one narrow anchored exception and extends the upstream rules
	const config = text(dir, 'tools/security/gitleaks.toml');
	assert.match(config, /minVersion = "v8\.30\.1"/);
	assert.match(config, /\[extend\]\nuseDefault = true/);
	assert.match(config, new RegExp(`\\^${DUMMY}\\$`));
	// one repository-root step: no `root`, so it runs where the command requires the Git root
	assert.deepEqual(hooks(dir)['pre-push'].commands['secret-scanning'], { run: `${COMMAND} --base origin/main` });
	assert.equal(JSON.parse(text(dir, 'package.json')).scripts[HISTORY_SCRIPT], `${COMMAND} --mode history`);
	// the scanner is not an npm dependency, and the pre-commit step the repository had is kept
	assert.equal(JSON.parse(text(dir, 'package.json')).devDependencies.gitleaks, undefined);
	assert.deepEqual(hooks(dir)['pre-commit'].commands.format, { run: 'pnpm format' });
});

test('a default run never selects secret-scanning, even with a gitleaks dependency', async () => {
	const dir = project('default', {
		'lefthook.yml': 'pre-commit:\n  commands:\n    format:\n      run: pnpm format\n',
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', gitleaks: '^1' } }),
	});
	assert.equal(await init(dir, '--yes'), 0);
	assert.equal(fs.existsSync(path.join(dir, 'tools/security')), false);
	assert.equal(hooks(dir)['pre-push']?.commands?.['secret-scanning'], undefined);
});

test('a re-run changes nothing and preserves an edited consumer config byte-for-byte', async () => {
	const dir = project('repeat', {
		'lefthook.yml': 'pre-commit:\n  commands:\n    format:\n      run: pnpm format\n',
		'package.json': '{\n\t"name": "consumer"\n}\n',
	});
	await init(dir, '--sets', 'secret-scanning');
	const lefthookOnce = text(dir, 'lefthook.yml');
	const packageOnce = text(dir, 'package.json');
	const consumerConfig = `${text(dir, 'tools/security/gitleaks.toml')}\n# a reviewed consumer exception\n[[allowlists]]\ndescription = "reviewed"\nregexTarget = "secret"\nregexes = ["""^consumer-added$"""]\n`;
	fs.writeFileSync(path.join(dir, 'tools/security/gitleaks.toml'), consumerConfig);

	assert.equal(await init(dir, '--sets', 'secret-scanning'), 0);
	assert.equal(text(dir, 'lefthook.yml'), lefthookOnce, 'the step is not duplicated');
	assert.equal(text(dir, 'package.json'), packageOnce, 'the history script is not duplicated');
	assert.equal(text(dir, 'tools/security/gitleaks.toml'), consumerConfig, 'the consumer config is not rewritten');
	assert.equal((text(dir, 'lefthook.yml').match(/secret-scanning:/g) ?? []).length, 1);
});

test('a re-run refreshes stale copied tool code but never the consumer config or history script', async () => {
	const dir = project('upgrade', {
		'lefthook.yml': 'pre-commit:\n  commands:\n    format:\n      run: pnpm format\n',
		'package.json': '{\n\t"name": "consumer"\n}\n',
	});
	await init(dir, '--sets', 'secret-scanning');
	// an older copy of the command and report reader, and a consumer-edited config and script
	fs.writeFileSync(path.join(dir, 'tools/security/gitleaks-check.mjs'), 'export const staleMarker = true;\n');
	fs.writeFileSync(path.join(dir, 'tools/security/gitleaks-report.mjs'), 'export const staleMarker = true;\n');
	const editedConfig = `${text(dir, 'tools/security/gitleaks.toml')}\n# consumer review\n`;
	fs.writeFileSync(path.join(dir, 'tools/security/gitleaks.toml'), editedConfig);
	const ownHistory = '{\n\t"name": "consumer",\n\t"scripts": {\n\t\t"secret-scanning:history": "echo mine"\n\t}\n}\n';
	fs.writeFileSync(path.join(dir, 'package.json'), ownHistory);

	assert.equal(await init(dir, '--sets', 'secret-scanning'), 0);
	assert.doesNotMatch(text(dir, 'tools/security/gitleaks-check.mjs'), /staleMarker/, 'the copied command is refreshed');
	assert.match(text(dir, 'tools/security/gitleaks-check.mjs'), /PINNED_GITLEAKS_VERSION/);
	assert.doesNotMatch(text(dir, 'tools/security/gitleaks-report.mjs'), /staleMarker/, 'the report reader is refreshed');
	assert.match(text(dir, 'tools/security/gitleaks-report.mjs'), /parseGitleaksReport/);
	assert.equal(text(dir, 'tools/security/gitleaks.toml'), editedConfig, 'the consumer config is preserved');
	assert.equal(text(dir, 'package.json'), ownHistory, 'the consumer history script is preserved');
});

test('init from a nested workspace still writes one repository-root step with POSIX paths', async () => {
	const dir = project('nested-invoke', {
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
		'pnpm-lock.yaml': '',
		'package.json': '{"name":"root"}\n',
		'apps/web/package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
	});
	assert.equal(await init(path.join(dir, 'apps', 'web'), '--sets', 'secret-scanning'), 0);
	assert.ok(fs.existsSync(path.join(dir, 'tools', 'security', 'gitleaks-check.mjs')));
	assert.deepEqual(hooks(dir)['pre-push'].commands['secret-scanning'], { run: `${COMMAND} --base origin/main` });
	assert.doesNotMatch(text(dir, 'lefthook.yml'), /tools\\security/);
});

test('an existing secret scan is left unchanged, with the copied command to add printed', async () => {
	const own = 'pre-push:\n  commands:\n    gitleaks:\n      run: gitleaks detect --redact\n';
	const dir = project('own-hook', { 'lefthook.yml': own });
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'secret-scanning']);
	assert.equal(text(dir, 'lefthook.yml'), own, 'the repository step is untouched');
	assert.match(said, /pre-push "gitleaks" mentions secret scanning but is not the repository-root fail-closed run/);
	assert.match(said, /run: node tools\/security\/gitleaks-check\.mjs --base <ref>/);
});

test('an existing canonical repository-root step is recognised, and nothing is added', async () => {
	const own = 'pre-push:\n  commands:\n    secret-scanning:\n      run: node tools/security/gitleaks-check.mjs --base origin/develop\n';
	const dir = project('canonical-hook', { 'lefthook.yml': own });
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'secret-scanning']);
	assert.equal(text(dir, 'lefthook.yml'), own, 'the equivalent step is untouched');
	assert.match(said, /already runs the copied command at the repository root; nothing added/);
	assert.doesNotMatch(said, /mentions secret scanning/);
});

test('a step that only mentions the copied command is a manual action, not success', async () => {
	const shapes = {
		echo: 'pre-push:\n  commands:\n    docs:\n      run: echo gitleaks-check\n',
		orTrue: 'pre-push:\n  commands:\n    secret-scanning:\n      run: node tools/security/gitleaks-check.mjs --base origin/main || true\n',
		root: 'pre-push:\n  commands:\n    secret-scanning:\n      root: apps/web/\n      run: node tools/security/gitleaks-check.mjs --base origin/main\n',
		glob: 'pre-push:\n  commands:\n    secret-scanning:\n      glob: "*.ts"\n      run: node tools/security/gitleaks-check.mjs --base origin/main\n',
		skip: 'pre-push:\n  commands:\n    secret-scanning:\n      skip: true\n      run: node tools/security/gitleaks-check.mjs --base origin/main\n',
		history: 'pre-push:\n  commands:\n    secret-scanning:\n      run: node tools/security/gitleaks-check.mjs --mode history\n',
	};
	for (const [name, own] of Object.entries(shapes)) {
		const dir = project(`misleading-${name}`, { 'lefthook.yml': own });
		const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'secret-scanning']);
		assert.equal(text(dir, 'lefthook.yml'), own, `${name}: the step is untouched`);
		assert.doesNotMatch(said, /already runs the copied command/, name);
		assert.match(said, /mentions secret scanning but is not the repository-root fail-closed run/, name);
	}
});

test('an unusual --base is not embedded in a generated shell command', async () => {
	const dir = project('unusual-base', { 'lefthook.yml': 'pre-commit:\n  commands: {}\n' });
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'secret-scanning', '--base', 'origin/main; touch pwned']);
	assert.doesNotMatch(text(dir, 'lefthook.yml'), /pwned/);
	assert.doesNotMatch(said, /pwned/);
	assert.match(said, /the resolved base is not a plain ref/);
	assert.equal(hooks(dir)['pre-push']?.commands?.['secret-scanning'], undefined);
});

test('with no lefthook, nothing is wired and the pre-push step to add is printed', async () => {
	const dir = project('no-hook', {});
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'secret-scanning']);
	assert.equal(fs.existsSync(path.join(dir, 'lefthook.yml')), false);
	assert.ok(fs.existsSync(path.join(dir, 'tools/security/gitleaks-check.mjs')));
	assert.match(said, /this repository has no lefthook\.yml, so no pre-push step was added/);
	assert.match(said, /pre-push:\n\s+commands:\n\s+secret-scanning:\n\s+run: node tools\/security\/gitleaks-check\.mjs/);
});

test('with no lefthook, the printed step respects an explicit --base', async () => {
	const dir = project('no-hook-base', {});
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'secret-scanning', '--base', 'develop']);
	assert.match(said, /run: node tools\/security\/gitleaks-check\.mjs --base origin\/develop/);
});

test('the copied command fails closed when the pinned scanner is absent', async () => {
	const dir = realRepository('missing-tool');
	fs.writeFileSync(path.join(dir, 'lefthook.yml'), 'pre-commit:\n  commands:\n    format:\n      run: echo ok\n');
	await init(dir, '--sets', 'secret-scanning');
	writeCredentialFile(dir, 'introduced.ts', INTRODUCED);
	const result = runCopied(dir, ['--gitleaks', path.join(TMP, 'missing', 'gitleaks')]);
	assert.equal(result.code, 2, result.output);
	assert.match(result.stderr, /cannot check: the Gitleaks executable was not found/);
	assert.doesNotMatch(result.stdout, /no findings/);
	assert.ok(!result.output.includes(INTRODUCED), 'the matched value must not be printed');
});

test('the copied command reports an introduced credential on a source path with a space', async () => {
	const dir = realRepository(path.join('space dir', 'repo'));
	fs.writeFileSync(path.join(dir, 'lefthook.yml'), 'pre-commit:\n  commands:\n    format:\n      run: echo ok\n');
	await init(dir, '--sets', 'secret-scanning');
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'install']);
	writeCredentialFile(dir, 'introduced.ts', INTRODUCED);
	const result = runCopied(dir, ['--gitleaks', GITLEAKS, '--base', 'HEAD']);
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /introduced generic-api-key introduced\.ts:1/);
	assert.ok(!result.output.includes(INTRODUCED));
});

test('a Python-only repository gets the repository-wide set, with no history script', async () => {
	const dir = project('python-only', {
		'lefthook.yml': 'pre-commit:\n  commands:\n    format:\n      run: echo ok\n',
		'backend/pyproject.toml': '[project]\nname = "api"\ndependencies = ["fastapi"]\n',
	});
	assert.equal(await init(dir, '--sets', 'secret-scanning'), 0);
	assert.deepEqual(hooks(dir)['pre-push'].commands['secret-scanning'], { run: `${COMMAND} --base origin/main` });
	assert.ok(fs.existsSync(path.join(dir, 'tools/security/gitleaks-check.mjs')));
	assert.equal(fs.existsSync(path.join(dir, 'package.json')), false);
});

test('a workspace monorepo gets one repository-root step, not one per member', async () => {
	const dir = project('workspace', {
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
		'pnpm-lock.yaml': '',
		'package.json': '{"name":"root"}\n',
		'apps/web/package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'apps/admin/package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
	});
	assert.equal(await init(dir, '--sets', 'secret-scanning'), 0);
	assert.deepEqual(Object.keys(hooks(dir)['pre-push'].commands), ['secret-scanning']);
	assert.deepEqual(hooks(dir)['pre-push'].commands['secret-scanning'], { run: `${COMMAND} --base origin/main` });
});

test('the copied command blocks a Git-ignored untracked credential, with no baseline to inherit', async () => {
	const dir = realRepository('ignored');
	fs.writeFileSync(path.join(dir, 'lefthook.yml'), 'pre-commit:\n  commands:\n    format:\n      run: echo ok\n');
	await init(dir, '--sets', 'secret-scanning');
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'install']);
	fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.ts\n');
	writeCredentialFile(dir, 'ignored.ts', INTRODUCED);
	const result = runCopied(dir, ['--gitleaks', GITLEAKS, '--base', 'HEAD']);
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /introduced generic-api-key ignored\.ts:1/);
	assert.ok(!result.output.includes(INTRODUCED));
});

test('the history audit is a separate remediation command that reports an inherited credential', async () => {
	const dir = realRepository('history');
	fs.writeFileSync(path.join(dir, 'lefthook.yml'), 'pre-commit:\n  commands:\n    format:\n      run: echo ok\n');
	await init(dir, '--sets', 'secret-scanning');
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'install']);
	writeCredentialFile(dir, 'gone.ts', INHERITED);
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'add a credential']);
	git(dir, ['rm', '-q', 'gone.ts']);
	git(dir, ['commit', '-qm', 'delete it again']);

	const result = runCopied(dir, ['--mode', 'history', '--gitleaks', GITLEAKS]);
	assert.equal(result.code, 1, result.output);
	assert.match(result.stdout, /^gitleaks-check: finding generic-api-key gone\.ts:1 commit [0-9a-f]{7}$/m);
	assert.ok(!result.output.includes(INHERITED));
	// the push path is branch mode; with the installed tree as its own base it is clean
	const branch = runCopied(dir, ['--gitleaks', GITLEAKS, '--base', 'HEAD']);
	assert.equal(branch.code, 0, branch.output);
});

test('the generated pre-push hook rejects synthetic credentials in tests and workflow files', async () => {
	const work = clonedRepository('pre-push');
	const run = (...args) => git(work, args);
	fs.writeFileSync(path.join(work, 'lefthook.yml'), 'pre-commit:\n  commands:\n    format:\n      run: echo ok\n');
	fs.writeFileSync(path.join(work, 'package.json'), '{"name":"consumer"}\n');
	await init(work, '--sets', 'secret-scanning');
	run('add', '-A');
	run('commit', '-qm', 'base');
	run('branch', '-M', 'main');
	// the hook is not installed yet, so the first push establishes origin/main before a base is needed
	assert.equal(push(work, ['-q', '-u', 'origin', 'main']).code, 0, 'the base push is clean');
	installLefthook(work);
	// the hook is the one init generated: a command at the repository root
	assert.deepEqual(hooks(work)['pre-push'].commands['secret-scanning'], { run: `${COMMAND} --base origin/main` });

	run('checkout', '-qb', 'feature');
	fs.mkdirSync(path.join(work, '.github/workflows'), { recursive: true });
	fs.writeFileSync(path.join(work, 'secret.test.ts'), `const apiKey = "${INTRODUCED}";\n`);
	fs.writeFileSync(path.join(work, '.github/workflows/deploy.yml'), `apiKey: "${INTRODUCED}"\n`);
	run('add', '-A');
	run('commit', '-qm', 'add credentials');
	const rejected = push(work, ['origin', 'feature']);
	assert.notEqual(rejected.code, 0, rejected.output);
	assert.match(rejected.output, /introduced generic-api-key secret\.test\.ts:1/);
	assert.match(rejected.output, /introduced generic-api-key \.github\/workflows\/deploy\.yml:1/);
	assert.ok(!rejected.output.includes(INTRODUCED), 'the push log must not carry the matched value');

	run('checkout', '-q', 'main');
	run('checkout', '-qb', 'clean');
	fs.mkdirSync(path.join(work, '.github/workflows'), { recursive: true });
	fs.writeFileSync(path.join(work, 'clean.test.ts'), 'export const answer = 42;\n');
	fs.writeFileSync(path.join(work, '.github/workflows/ci.yml'), 'name: CI\non: [push]\n');
	run('add', '-A');
	run('commit', '-qm', 'clean');
	const accepted = push(work, ['origin', 'clean']);
	assert.equal(accepted.code, 0, accepted.output);
});

test('the copied config and docs name the pinned scanner version', async () => {
	const dir = project('pin', { 'lefthook.yml': 'pre-commit:\n  commands: {}\n' });
	await init(dir, '--sets', 'secret-scanning');
	assert.match(text(dir, 'tools/security/gitleaks.toml'), new RegExp(`v${PINNED_GITLEAKS_VERSION.replaceAll('.', '\\.')}`));
	assert.match(text(dir, 'tools/security/gitleaks.toml'), new RegExp(`\\^${DUMMY}\\$`));
	assert.match(text(dir, 'tools/security/gitleaks-check.md'), /8\.30\.1/);
});

test('the generated pre-push hook fails closed when the scanner cannot run', async () => {
	const work = clonedRepository('missing-tool-hook');
	const run = (...args) => git(work, args);
	fs.writeFileSync(path.join(work, 'lefthook.yml'), 'pre-commit:\n  commands:\n    format:\n      run: echo ok\n');
	await init(work, '--sets', 'secret-scanning');
	run('add', '-A');
	run('commit', '-qm', 'base');
	run('branch', '-M', 'main');
	assert.equal(push(work, ['-q', '-u', 'origin', 'main']).code, 0, 'the base push is clean');
	installLefthook(work);
	run('checkout', '-qb', 'feature');
	writeCredentialFile(work, 'secret.ts', INTRODUCED);
	run('add', '-A');
	run('commit', '-qm', 'add a credential');
	const rejected = pushWithoutScanner(work, ['origin', 'feature']);
	assert.notEqual(rejected.code, 0, rejected.output);
	assert.match(rejected.output, /cannot check|not found/i);
	assert.ok(!rejected.output.includes(INTRODUCED), 'the push log must not carry the matched value');
});

test('the documented CI shape runs the trusted command and config outside the source tree', async () => {
	const dir = realRepository('ci-trusted');
	fs.writeFileSync(path.join(dir, 'lefthook.yml'), 'pre-commit:\n  commands:\n    format:\n      run: echo ok\n');
	await init(dir, '--sets', 'secret-scanning');
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'install']);
	writeCredentialFile(dir, 'introduced.ts', INTRODUCED);
	// the trusted command, report reader and config copied to a temp path outside the source tree
	const trusted = path.join(TMP, 'ci-trusted-path');
	fs.mkdirSync(trusted, { recursive: true });
	for (const file of ['gitleaks-check.mjs', 'gitleaks-report.mjs', 'gitleaks.toml'])
		fs.copyFileSync(path.join(ROOT, 'tools', 'security', file), path.join(trusted, file));
	const result = spawnSync(
		process.execPath,
		[path.join(trusted, 'gitleaks-check.mjs'), '--source', dir, '--gitleaks', GITLEAKS, '--config', path.join(trusted, 'gitleaks.toml'), '--base', 'HEAD'],
		{ encoding: 'utf8', env: process.env },
	);
	const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
	assert.equal(result.status, 1, output);
	assert.match(result.stdout, /introduced generic-api-key introduced\.ts:1/);
	assert.ok(!output.includes(INTRODUCED));
});

/** Run an init and return everything it logged. */
async function capture(argv) {
	const lines = [];
	const log = console.log;
	console.log = (...args) => lines.push(args.join(' '));
	try {
		await main(argv);
	} finally {
		console.log = log;
	}
	return lines.join('\n');
}

/** A repository stub (it has a .git) made of `files`, for the installer's file logic. */
function project(name, files) {
	const dir = path.join(TMP, name);
	for (const [rel, content] of Object.entries({ '.git/HEAD': 'ref: refs/heads/main\n', ...files })) {
		fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		fs.writeFileSync(path.join(dir, rel), content);
	}
	return dir;
}

/** A repository git can run in, so the copied command's own Git checks pass. */
function realRepository(name) {
	const dir = path.join(TMP, name);
	fs.mkdirSync(dir, { recursive: true });
	git(dir, ['init', '-q', '-b', 'main']);
	git(dir, ['config', 'user.email', 'secret-install@lint-kit.test']);
	git(dir, ['config', 'user.name', 'lint-kit']);
	return dir;
}

/** A clone of a fresh bare origin. */
function clonedRepository(name) {
	const origin = path.join(TMP, `${name}-origin.git`);
	const work = path.join(TMP, `${name}-work`);
	execFileSync('git', ['init', '--bare', '-q', origin]);
	execFileSync('git', ['clone', '-q', origin, work]);
	git(work, ['config', 'user.email', 'secret-install@lint-kit.test']);
	git(work, ['config', 'user.name', 'lint-kit']);
	return work;
}

function installLefthook(dir) {
	execFileSync(LEFTHOOK, ['install'], { cwd: dir, stdio: 'ignore', shell: process.platform === 'win32' });
}

/** Run the copied command from inside the repository it was installed into. */
function runCopied(dir, args, environment = {}) {
	const result = spawnSync(process.execPath, [path.join(dir, 'tools/security/gitleaks-check.mjs'), ...args], {
		cwd: dir,
		encoding: 'utf8',
		env: { ...process.env, ...environment },
	});
	const stdout = result.stdout ?? '';
	const stderr = result.stderr ?? '';
	return { code: result.status, stdout, stderr, output: `${stdout}${stderr}` };
}

/** A push with the pinned scanner on PATH, so the generated hook can run it. */
function push(dir, args) {
	const result = spawnSync('git', ['push', ...args], {
		cwd: dir,
		encoding: 'utf8',
		env: { ...process.env, PATH: `${GITLEAKS_DIR}${path.delimiter}${process.env.PATH}` },
	});
	const stdout = result.stdout ?? '';
	const stderr = result.stderr ?? '';
	return { code: result.status, output: `${stdout}${stderr}` };
}

/** A push with the pinned scanner removed from PATH, so the generated hook fails closed on it. */
function pushWithoutScanner(dir, args) {
	const PATH = (process.env.PATH ?? '')
		.split(path.delimiter)
		.filter((entry) => entry && entry !== GITLEAKS_DIR && !/gitleaks/i.test(entry))
		.join(path.delimiter);
	const result = spawnSync('git', ['push', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH } });
	const stdout = result.stdout ?? '';
	const stderr = result.stderr ?? '';
	return { code: result.status, output: `${stdout}${stderr}` };
}

function git(dir, args) {
	const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
	return (result.stdout ?? '').trim();
}

function writeCredentialFile(directory, name, value) {
	fs.writeFileSync(path.join(directory, name), `const apiKey = "${value}";\n`);
}
