/**
 * The joint first-release install (#50): the three opt-in stacks — `policy-guard`,
 * `secret-scanning` and `vitest` (#44/#46/#49) — installed into one consumer and exercised through
 * their real public entrypoints.
 *
 * The per-stack suites already run the installer, the copied command and the real `lefthook` hook
 * one stack at a time. What only a joint run can show is *coexistence*: one combined `init`, one
 * generated `lefthook.yml`, and one push whose steps do not drop, mask or rewrite each other. This
 * file therefore drives the public `node bin/lint-kit.js` CLI as a subprocess, the real copied
 * commands, the real pinned Gitleaks 8.30.1 and the real `lefthook` binary. It mocks no module and
 * adds no test-only production seam (there is no clock knob: the ledger lifecycle cases use
 * explicit `2000`/`2099` dates).
 *
 * Two things this file deliberately does not do:
 *
 *   - It never treats a local hook as protection. The `policy-guard.sh` pre-push script runs the
 *     mutable copy inside the repository, so a branch can replace it. The tamper case proves that
 *     with the *frozen* checkout executable and the guard's public `--cwd`/Git inputs, and labels
 *     it a local trusted-copy simulation — not protected-forge evidence.
 *   - It never enrolls a real approval. Where a live quarantine waiver is needed, the fixture
 *     hand-writes the installer-printed enrollment into its own committed, pushed **trusted base**
 *     and asserts that `init` itself never broadens the manifest or creates the ledger.
 *
 * Every credential is a synthetic hex placeholder. No real repository, adopter or secret is used.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { PINNED_GITLEAKS_VERSION, resolvePinnedGitleaks } from './gitleaks-binary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEFTHOOK = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'lefthook.CMD' : 'lefthook');
const JSONC_PARSER_SOURCE = path.join(ROOT, 'node_modules', 'jsonc-parser');
const GUARD = 'node tools/policy/policy-guard.mjs';
const SCANNER = 'node tools/security/gitleaks-check.mjs';
const SETS = 'policy-guard,secret-scanning,vitest';
const INIT_TIMEOUT_MS = 180_000;
const TOOL_TIMEOUT_MS = 120_000;

// No silent skip: this throws — failing the file — when the pinned scanner is not provisioned.
const GITLEAKS = await resolvePinnedGitleaks();
const GITLEAKS_DIR = path.dirname(GITLEAKS);
const NODE_PATH = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`;
/** The pinned scanner on PATH for the generated secret step; the rest of the env is inherited. */
const SCANNER_ENV = { PATH: `${GITLEAKS_DIR}${path.delimiter}${NODE_PATH}` };

// A private temporary directory for every spawned tool, so the copied commands' scan temp dirs
// never appear in the shared system temp that secret-scanning.test.js enumerates. Every spawn
// merges these three, even when a case supplies its own environment override.
const PRIVATE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-joint-tmp-'));
const ISOLATED_TMP = { TEMP: PRIVATE_TMP, TMP: PRIVATE_TMP, TMPDIR: PRIVATE_TMP };
const withIsolation = (env = {}) => ({ ...process.env, ...ISOLATED_TMP, ...env });

// Plain hex values the generic-api-key rule reports. None is a real credential.
const INTRODUCED = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
const INHERITED = '7c3e1a9b5d2f8046c1b7e3a9d5f26048';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-joint-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
after(() => fs.rmSync(PRIVATE_TMP, { recursive: true, force: true }));

const POLICY_SCRIPT_BODY = `#!/usr/bin/env bash\nset -e\n${GUARD} --base origin/main --target HEAD --trusted-ref origin/main --policy lint-kit.policy.json --mode working-tree\n`;
const QUARANTINE_SCRIPT_BODY = '#!/usr/bin/env bash\nset -e\nnode tools/eslint/check-quarantine-ledger.mjs\n';
const COPIED_FILES = [
	'tools/policy/policy-guard.mjs',
	'tools/policy/policy-guard-ci.mjs',
	'tools/policy/policy-guard-ci.yml',
	'tools/policy/README.md',
	'tools/security/gitleaks-check.mjs',
	'tools/security/gitleaks-report.mjs',
	'tools/security/gitleaks.toml',
	'tools/security/gitleaks-check.md',
	'tools/eslint/inspection.mjs',
	'tools/eslint/vitest.mjs',
	'tools/eslint/vitest.md',
	'tools/eslint/quarantine-ledger.mjs',
	'tools/eslint/check-quarantine-ledger.mjs',
	'lint-kit.policy.json',
];
const WAIVED_FILE = 'test/waiver-subject.test.js';
const WAIVED_CALL = "test.skip('waived', () => {})";
const fallowText = (maxCognitive) => `{\n\t"health": { "maxCognitive": ${maxCognitive} },\n\t"rules": { "unused-exports": "warn" }\n}\n`;
const ledgerText = (entries) => `${JSON.stringify({ version: 1, entries }, null, '\t')}\n`;
const BASE_FILES = {
	'package.json': JSON.stringify({ name: 'consumer', devDependencies: { svelte: '^5', vitest: '4.1.11' } }, null, '\t'),
	'pnpm-lock.yaml': '',
	'lefthook.yml': 'pre-commit:\n  commands: {}\n',
	'src/app.ts': 'export const a = 1;\n',
	'test/app.test.js': "import { test } from 'vitest';\ntest('works', () => {});\n",
	'.fallowrc.json': fallowText(25),
};

const text = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const hooks = (dir) => parse(text(dir, 'lefthook.yml'));
const sha256 = (value) => createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex');

/** Fail loudly when a spawned process did not finish, so an expected non-zero is never a timeout. */
function finished(result, label) {
	if (result.status === null)
		throw new Error(`${label} did not finish: ${result.error?.message ?? result.signal ?? 'unknown'}`);
	return result;
}

/** The real public installer, run as a CLI subprocess with a finite bound. */
function runInit(dir, install) {
	const args = [path.join(ROOT, 'bin', 'lint-kit.js'), 'init', '--cwd', dir, '--sets', SETS, ...(install ? [] : ['--no-install'])];
	const result = spawnSync(process.execPath, args, {
		cwd: ROOT,
		encoding: 'utf8',
		timeout: INIT_TIMEOUT_MS,
		env: withIsolation({ PATH: NODE_PATH }),
	});
	finished(result, `init in ${dir}`);
	assert.equal(result.status, 0, `init exited ${result.status}:\n${result.stdout}\n${result.stderr}`);
	return result.status;
}
/** The combined install with the sets wired but no package-manager run. */
const noInstallInit = (dir) => runInit(dir, false);
/** The combined install as a real consumer runs it: the public CLI installs the owned peers. */
const publicInstall = (dir) => runInit(dir, true);

/** A repository stub (it has a `.git`) made of `files`, for the installer's file logic. */
function project(name, files) {
	const dir = path.join(TMP, name);
	for (const [relative, content] of Object.entries({ '.git/HEAD': 'ref: refs/heads/main\n', ...files })) {
		fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
		fs.writeFileSync(path.join(dir, relative), content);
	}
	return dir;
}

function spawnGit(dir, args, env = { PATH: NODE_PATH }) {
	return finished(
		spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: withIsolation(env), timeout: TOOL_TIMEOUT_MS }),
		`git ${args.join(' ')}`,
	);
}

function git(dir, args) {
	const result = spawnGit(dir, args);
	assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
	return (result.stdout ?? '').trim();
}

/** The paths one branch added, changed or deleted since the trusted base. */
const changedPaths = (dir) => git(dir, ['diff', '--name-only', 'origin/main...HEAD']).split('\n').filter(Boolean);
/** The tracked/untracked state a case leaves behind, so an extra edit cannot hide. */
const statusPorcelain = (dir) => spawnGit(dir, ['status', '--porcelain']).stdout.trim();

/** A real repository git can run in, so the copied commands' own Git checks pass. */
function realRepository(name) {
	const dir = path.join(TMP, name);
	fs.mkdirSync(dir, { recursive: true });
	git(dir, ['init', '-q', '-b', 'main']);
	git(dir, ['config', 'user.email', 'joint@lint-kit.test']);
	git(dir, ['config', 'user.name', 'lint-kit']);
	return dir;
}

/** Keep node_modules out of the fixture's Git tree, so an `add -A` cannot commit the dependency. */
function excludeNodeModules(dir) {
	fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), 'node_modules/\napps/*/node_modules/\n');
}

/** The parser the copied guard resolves from its own location, as a root install would leave it. */
function installJsoncParser(dir) {
	if (!fs.existsSync(JSONC_PARSER_SOURCE)) throw new Error(`the frozen jsonc-parser is not installed at ${JSONC_PARSER_SOURCE}`);
	fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
	fs.cpSync(JSONC_PARSER_SOURCE, path.join(dir, 'node_modules', 'jsonc-parser'), { recursive: true, dereference: true });
}

function installLefthook(dir) {
	execFileSync(LEFTHOOK, ['install'], { cwd: dir, stdio: 'ignore', shell: process.platform === 'win32', timeout: TOOL_TIMEOUT_MS, env: withIsolation() });
}

function writeFile(dir, relative, content) {
	fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
	fs.writeFileSync(path.join(dir, relative), content);
}

const writeCredentialFile = (dir, name, value) => writeFile(dir, name, `const apiKey = "${value}";\n`);

/**
 * A clone of a fresh bare origin with the three sets installed, the manifest and hook landed on
 * `origin/main`, and lefthook installed only when the fixture has a real dependency tree.
 *
 * `prepareBase` runs after the install and before the base commit, so a case can hand-place a
 * reviewed enrollment or ledger entry into the committed, pushed trusted baseline — never the
 * working tree of a branch. With `install: false` the fixture copies the frozen `jsonc-parser` in
 * and drives the copied tools by hand, so it stays cheap and never links this checkout's
 * `node_modules`.
 */
async function combinedClone(name, { install = false, files = {}, prepareBase } = {}) {
	const origin = path.join(TMP, `${name}-origin.git`);
	const work = path.join(TMP, `${name}-work`);
	execFileSync('git', ['init', '--bare', '-q', origin], { timeout: TOOL_TIMEOUT_MS, env: withIsolation() });
	execFileSync('git', ['clone', '-q', origin, work], { timeout: TOOL_TIMEOUT_MS, env: withIsolation() });
	git(work, ['config', 'user.email', 'joint@lint-kit.test']);
	git(work, ['config', 'user.name', 'lint-kit']);
	for (const [relative, content] of Object.entries({ ...BASE_FILES, ...files })) writeFile(work, relative, content);
	if (install) await publicInstall(work);
	else {
		assert.equal(await noInstallInit(work), 0);
		installJsoncParser(work);
	}
	if (prepareBase) await prepareBase(work);
	excludeNodeModules(work);
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'base']);
	git(work, ['branch', '-M', 'main']);
	assert.equal(spawnGit(work, ['push', '-q', '-u', 'origin', 'main']).status, 0, 'the base push is clean');
	if (install) installLefthook(work);
	return work;
}

/** A reviewed, installer-printed enrollment and a ledger, hand-placed in a committed trusted base. */
function enrollLedger(dir, entries) {
	const manifest = JSON.parse(text(dir, 'lint-kit.policy.json'));
	manifest.enrollments.push({ id: 'test-quarantine', source: 'test-quarantine.json', format: 'opaque' });
	writeFile(dir, 'lint-kit.policy.json', `${JSON.stringify(manifest, null, '\t')}\n`);
	writeFile(dir, 'test-quarantine.json', ledgerText(entries));
}

/** The waiver entry the trusted base holds for the call the branch later adds. */
function trustedBaselineWaiver(dir) {
	enrollLedger(dir, [
		{
			file: WAIVED_FILE,
			line: 2,
			column: 1,
			sourceCallSha256: sha256(WAIVED_CALL),
			reason: 'reviewed upstream flake',
			owner: '@team',
			expires: '2099-01-01',
		},
	]);
}

/** A real repository git can push in, with a workspace root and one member project. */
async function workspaceConsumer(name) {
	const origin = path.join(TMP, `${name}-origin.git`);
	const work = path.join(TMP, `${name}-work`);
	execFileSync('git', ['init', '--bare', '-q', origin], { timeout: TOOL_TIMEOUT_MS, env: withIsolation() });
	execFileSync('git', ['clone', '-q', origin, work], { timeout: TOOL_TIMEOUT_MS, env: withIsolation() });
	git(work, ['config', 'user.email', 'joint@lint-kit.test']);
	git(work, ['config', 'user.name', 'lint-kit']);
	writeFile(work, 'pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n");
	writeFile(work, 'pnpm-lock.yaml', '');
	writeFile(work, 'package.json', '{"name":"root","private":true}\n');
	writeFile(work, 'lefthook.yml', 'pre-commit:\n  commands: {}\n');
	writeFile(work, 'apps/web/package.json', JSON.stringify({ name: 'web', devDependencies: { svelte: '^5', vitest: '4.1.11' } }));
	writeFile(work, 'apps/web/src/app.ts', 'export const a = 1;\n');
	writeFile(work, 'apps/web/test/app.test.js', "import { test } from 'vitest';\ntest('works', () => {});\n");
	writeFile(work, 'apps/web/.fallowrc.json', fallowText(25));
	// The real public install from the member, so the member owns its own provider tree.
	await runInit(path.join(work, 'apps', 'web'), true);
	excludeNodeModules(work);
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'base']);
	git(work, ['branch', '-M', 'main']);
	assert.equal(spawnGit(work, ['push', '-q', '-u', 'origin', 'main']).status, 0, 'the base push is clean');
	installLefthook(work);
	return work;
}

/** A git push with the pinned scanner on PATH, so the generated pre-push hook can find it. */
function push(dir, args, env = SCANNER_ENV) {
	const result = finished(
		spawnSync('git', ['push', ...args], { cwd: dir, encoding: 'utf8', env: withIsolation(env), timeout: TOOL_TIMEOUT_MS }),
		'git push',
	);
	return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Commit through the installed pre-commit hook (the real lefthook pre-commit step runs). */
function commit(dir, message) {
	const result = spawnGit(dir, ['commit', '-qm', message]);
	return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function runPrePush(dir, env = SCANNER_ENV) {
	const result = finished(
		spawnSync(LEFTHOOK, ['run', 'pre-push'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32', env: withIsolation(env), timeout: TOOL_TIMEOUT_MS }),
		'lefthook pre-push',
	);
	return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Run a copied command from inside the repository it was installed into. */
function runCopied(dir, file, args, env = SCANNER_ENV) {
	const result = finished(
		spawnSync(process.execPath, [path.join(dir, ...file.split('/')), ...args], { cwd: dir, encoding: 'utf8', env: withIsolation(env), timeout: TOOL_TIMEOUT_MS }),
		file,
	);
	const stdout = result.stdout ?? '';
	const stderr = result.stderr ?? '';
	return { code: result.status, stdout, stderr, output: `${stdout}${stderr}` };
}
const runGuard = (dir, args, env) => runCopied(dir, 'tools/policy/policy-guard.mjs', args, env);
const runScanner = (dir, args, env) => runCopied(dir, 'tools/security/gitleaks-check.mjs', args, env);
const runLedger = (dir, args = [], env) => runCopied(dir, 'tools/eslint/check-quarantine-ledger.mjs', args, env);

/** The installed ESLint, run as its own process against one file through the project's config. */
function runInstalledEslint(dir, file, env = { PATH: NODE_PATH }) {
	const result = finished(
		spawnSync(process.execPath, [path.join(dir, 'node_modules', 'eslint', 'bin', 'eslint.js'), file], { cwd: dir, encoding: 'utf8', env: withIsolation(env), timeout: TOOL_TIMEOUT_MS }),
		'eslint',
	);
	return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Return the fixture to a clean `main`, discarding a case's branch and untracked files. */
function resetMain(dir) {
	git(dir, ['checkout', '-q', '-f', 'main']);
	git(dir, ['reset', '-q', '--hard', 'main']);
	git(dir, ['clean', '-qfd']);
}

function startBranch(dir, name) {
	resetMain(dir);
	git(dir, ['checkout', '-qb', name]);
}

/** The scanner's own scratch directories that outlived a run — the assertion the old root check missed. */
const leakedScanDirectories = () =>
	fs.existsSync(PRIVATE_TMP) ? fs.readdirSync(PRIVATE_TMP).filter((name) => name.startsWith('gitleaks-check-')) : [];

/**
 * The one real, spaced-path installed consumer shared by the hook-level cases, so the public
 * install runs once. Its committed trusted base already carries the reviewed ledger enrollment and
 * a live waiver for {@link WAIVED_FILE}; the branch adds the disabled call that waiver names.
 */
let installedPromise;
const installedConsumer = () =>
	(installedPromise ??= combinedClone('installed consumer', { install: true, prepareBase: trustedBaselineWaiver }));

// ── fresh, repeat and true stale-code upgrade ───────────────────────────────────

test('a fresh combined install writes every copied tool, one manifest, one step per tool and no ledger', async () => {
	const dir = project('fresh', BASE_FILES);
	assert.equal(await noInstallInit(dir), 0);
	for (const file of COPIED_FILES) assert.ok(fs.existsSync(path.join(dir, file)), file);

	const config = hooks(dir);
	// Exactly one pre-push step per stack, none dropped and none duplicated.
	assert.deepEqual(config['pre-push'].scripts, { 'test-quarantine.sh': { runner: 'bash' }, 'policy-guard.sh': { runner: 'bash' } });
	assert.deepEqual(config['pre-push'].commands['secret-scanning'], { run: `${SCANNER} --base origin/main` });
	// The ESLint step is the vitest set's; focus/async are pre-commit, not pre-push.
	assert.deepEqual(config['pre-commit'].commands.eslint.glob, ['src/*.{js,ts,svelte}', '*.{test,spec}.*']);
	assert.equal(config['pre-commit'].commands.eslint.run, 'pnpm exec eslint {staged_files}');
	assert.equal(config['pre-push'].commands.eslint, undefined);
	assert.equal(text(dir, '.lefthook/pre-push/policy-guard.sh'), POLICY_SCRIPT_BODY);
	assert.equal(text(dir, '.lefthook/pre-push/test-quarantine.sh'), QUARANTINE_SCRIPT_BODY);

	// The installer creates no ledger and never enrolls one.
	assert.equal(fs.existsSync(path.join(dir, 'test-quarantine.json')), false);
	assert.doesNotMatch(text(dir, 'lint-kit.policy.json'), /test-quarantine/);
	// The named opaque enrollment is printed for review, not applied.
	assert.equal(JSON.parse(text(dir, 'package.json')).scripts['secret-scanning:history'], `${SCANNER} --mode history`);
});

test('a repeat combined install is byte-identical and adds no second step, manifest or ledger', async () => {
	const dir = project('repeat', BASE_FILES);
	assert.equal(await noInstallInit(dir), 0);
	// Consumer-reviewed edits the repeat must leave exactly as they are.
	const fallowEdited = `${text(dir, '.fallowrc.json')}// a reviewed comment\n`;
	writeFile(dir, '.fallowrc.json', fallowEdited);
	const manifest = JSON.parse(text(dir, 'lint-kit.policy.json'));
	manifest.enrollments.push({ id: 'test-quarantine', source: 'test-quarantine.json', format: 'opaque' });
	const manifestEdited = `${JSON.stringify(manifest, null, '\t')}\n`;
	writeFile(dir, 'lint-kit.policy.json', manifestEdited);
	const configEdited = `${text(dir, 'tools/security/gitleaks.toml')}\n# a reviewed consumer exception\n`;
	writeFile(dir, 'tools/security/gitleaks.toml', configEdited);

	const once = ['lefthook.yml', '.lefthook/pre-push/policy-guard.sh', '.lefthook/pre-push/test-quarantine.sh'].map((file) => text(dir, file));
	assert.equal(await noInstallInit(dir), 0);
	assert.deepEqual(['lefthook.yml', '.lefthook/pre-push/policy-guard.sh', '.lefthook/pre-push/test-quarantine.sh'].map((file) => text(dir, file)), once);
	assert.equal(text(dir, '.fallowrc.json'), fallowEdited);
	assert.equal(text(dir, 'lint-kit.policy.json'), manifestEdited, 'the manifest is not broadened');
	assert.equal(text(dir, 'tools/security/gitleaks.toml'), configEdited);
	assert.equal((text(dir, 'lefthook.yml').match(/policy-guard\.sh/g) ?? []).length, 1);
	assert.equal((text(dir, 'lefthook.yml').match(/test-quarantine\.sh/g) ?? []).length, 1);
	assert.equal((text(dir, 'lefthook.yml').match(/secret-scanning:/g) ?? []).length, 1);
	assert.equal(fs.existsSync(path.join(dir, 'test-quarantine.json')), false);
});

test('a true stale-code upgrade refreshes every copied tool and preserves the consumer manifest, config and hooks', async () => {
	const dir = project('upgrade', BASE_FILES);
	assert.equal(await noInstallInit(dir), 0);
	// An older copy of each stack's tool code, and consumer-owned files the upgrade must not touch.
	writeFile(dir, 'tools/policy/policy-guard.mjs', 'export const staleMarker = true;\n');
	writeFile(dir, 'tools/security/gitleaks-check.mjs', 'export const staleMarker = true;\n');
	writeFile(dir, 'tools/eslint/check-quarantine-ledger.mjs', 'console.log("stale");\n');
	const consumerConfig = `${text(dir, 'tools/security/gitleaks.toml')}\n# consumer review\n`;
	writeFile(dir, 'tools/security/gitleaks.toml', consumerConfig);
	const manifestEdited = text(dir, 'lint-kit.policy.json');
	writeFile(dir, 'lint-kit.policy.json', `${manifestEdited}\n`);
	const hooksOnce = text(dir, 'lefthook.yml');

	assert.equal(await noInstallInit(dir), 0);
	assert.doesNotMatch(text(dir, 'tools/policy/policy-guard.mjs'), /staleMarker/);
	assert.match(text(dir, 'tools/policy/policy-guard.mjs'), /export function main/);
	assert.doesNotMatch(text(dir, 'tools/security/gitleaks-check.mjs'), /staleMarker/);
	assert.match(text(dir, 'tools/security/gitleaks-check.mjs'), /PINNED_GITLEAKS_VERSION/);
	assert.doesNotMatch(text(dir, 'tools/eslint/check-quarantine-ledger.mjs'), /stale/);
	assert.match(text(dir, 'tools/eslint/check-quarantine-ledger.mjs'), /checkQuarantineLedger/);
	assert.equal(text(dir, 'tools/security/gitleaks.toml'), consumerConfig, 'the consumer config is preserved');
	assert.equal(text(dir, 'lint-kit.policy.json'), `${manifestEdited}\n`, 'the consumer manifest is preserved');
	assert.equal(text(dir, 'lefthook.yml'), hooksOnce);
	assert.equal(fs.existsSync(path.join(dir, 'test-quarantine.json')), false, 'the upgrade creates no ledger');
	assert.doesNotMatch(text(dir, 'lint-kit.policy.json'), /test-quarantine/);
});

// ── a real committed, trusted baseline enrollment and waiver ────────────────────

test('a live waiver hand-enrolled in the real trusted base excuses the branch call through the installed ESLint and the combined hooks', async () => {
	const work = await installedConsumer();
	// The anchor is the committed, pushed base — not a branch working tree.
	const trustedManifest = git(work, ['show', 'origin/main:lint-kit.policy.json']);
	assert.match(trustedManifest, /"id": "test-quarantine",\s+"source": "test-quarantine\.json",\s+"format": "opaque"/);
	const trustedEntry = JSON.parse(git(work, ['show', 'origin/main:test-quarantine.json'])).entries[0];
	assert.equal(trustedEntry.file, WAIVED_FILE);
	assert.equal(trustedEntry.sourceCallSha256, sha256(WAIVED_CALL), 'the trusted waiver matches the call the branch adds');
	assert.equal(trustedEntry.expires, '2099-01-01');

	startBranch(work, 'waiver');
	writeFile(work, WAIVED_FILE, `import { test } from 'vitest';\n${WAIVED_CALL};\n`);
	// The installed ESLint reads the trusted live waiver from the working tree and stays silent.
	const live = runInstalledEslint(work, WAIVED_FILE);
	assert.equal(live.code, 0, live.output);
	// The waiver is load-bearing: an expired copy makes the same eligible call report.
	const expiredLedger = JSON.parse(text(work, 'test-quarantine.json'));
	expiredLedger.entries[0].expires = '2000-01-01';
	writeFile(work, 'test-quarantine.json', ledgerText(expiredLedger.entries));
	const expired = runInstalledEslint(work, WAIVED_FILE);
	assert.notEqual(expired.code, 0, 'an expired waiver must not excuse the call');
	assert.match(expired.output, /vitest\/no-disabled-tests/);
	// Restore the exact trusted entry and prove the real combined pre-commit hook passes.
	writeFile(work, 'test-quarantine.json', ledgerText([trustedEntry]));
	git(work, ['add', '-A']);
	const committed = commit(work, 'a branch call excused by the trusted waiver');
	assert.equal(committed.code, 0, committed.output);
	// The branch changed only the call; it did not touch the enrollment or the ledger it relies on.
	assert.deepEqual(changedPaths(work), [WAIVED_FILE]);
	assert.equal(statusPorcelain(work).includes('lint-kit.policy.json'), false);
	// The same branch clears both hooks: a real push runs every pre-push step green.
	const pushed = push(work, ['origin', 'waiver']);
	assert.equal(pushed.code, 0, pushed.output);
	assert.match(pushed.output, /policy-guard: no unapproved enrolled change/);
	assert.match(pushed.output, /gitleaks-check: no findings/);
	assert.match(pushed.output, /test-quarantine\.json: 1 valid entry\(s\)/);
	resetMain(work);
});

test('the installer never creates the ledger and a repeat never broadens a hand-enrolled trusted base', async () => {
	const work = await combinedClone('enrolled-repeat', { prepareBase: trustedBaselineWaiver });
	const enrolledManifest = text(work, 'lint-kit.policy.json');
	const enrolledLedger = text(work, 'test-quarantine.json');
	assert.match(enrolledManifest, /test-quarantine/);
	assert.equal(await noInstallInit(work), 0);
	assert.equal(text(work, 'lint-kit.policy.json'), enrolledManifest, 'a repeat neither adds nor removes the manual enrollment');
	assert.equal(text(work, 'test-quarantine.json'), enrolledLedger, 'the fixture-owned ledger is untouched');
	assert.equal(JSON.parse(text(work, 'test-quarantine.json')).entries.length, 1);
});

// ── project-relative shapes ─────────────────────────────────────────────────────

test('a combined install from a nested pnpm workspace writes one root manifest and root pre-push steps', async () => {
	const dir = project('nested', {
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
		'pnpm-lock.yaml': '',
		'package.json': '{"name":"root","private":true}\n',
		'apps/web/package.json': JSON.stringify({ name: 'web', devDependencies: { svelte: '^5', vitest: '4.1.11' } }),
		'apps/web/.fallowrc.json': fallowText(25),
	});
	assert.equal(await noInstallInit(path.join(dir, 'apps', 'web')), 0, 'init from the workspace member');
	// One root manifest, one root secret step and one root quarantine script — not one per member.
	assert.ok(fs.existsSync(path.join(dir, 'lint-kit.policy.json')));
	assert.deepEqual(
		JSON.parse(text(dir, 'lint-kit.policy.json')).enrollments.map((enrollment) => enrollment.source).sort(),
		['apps/web/.fallowrc.json', 'tools/policy/policy-guard.mjs'],
	);
	assert.deepEqual(hooks(dir)['pre-push'].scripts, { 'test-quarantine.sh': { runner: 'bash' }, 'policy-guard.sh': { runner: 'bash' } });
	assert.deepEqual(hooks(dir)['pre-push'].commands['secret-scanning'], { run: `${SCANNER} --base origin/main` });
	// The member's ESLint step is project-relative, with the member glob.
	assert.equal(hooks(dir)['pre-commit'].commands.eslint.root, 'apps/web/');
	assert.deepEqual(hooks(dir)['pre-commit'].commands.eslint.glob, ['apps/web/src/*.{js,ts,svelte}', 'apps/web/*.{test,spec}.*']);
	assert.doesNotMatch(text(dir, 'lefthook.yml'), /tools\\security|tools\\policy/);
	assert.ok(fs.existsSync(path.join(dir, 'apps', 'web', 'eslint.rules.js')));
});

test('a real workspace member owns its Vitest provider and the root hooks charge a member test', async () => {
	const work = await workspaceConsumer('workspace-member');
	// The member installed its own provider, so the generated project config resolves it, not the root.
	assert.ok(fs.existsSync(path.join(work, 'apps', 'web', 'node_modules', '@vitest', 'eslint-plugin')), 'the member owns @vitest/eslint-plugin');
	startBranch(work, 'member');
	// Stage a focused member test: the real root pre-commit hook runs it under the member root.
	writeFile(work, 'apps/web/test/member.test.js', "import { test } from 'vitest';\ntest.only('member', () => {});\n");
	git(work, ['add', '-A']);
	const blocked = commit(work, 'a focused member test');
	assert.notEqual(blocked.code, 0, 'the root pre-commit hook must charge the member test');
	assert.match(blocked.output, /vitest\/no-focused-tests/);
	// Without the focus, the same member file passes pre-commit and the combined pre-push hook.
	writeFile(work, 'apps/web/test/member.test.js', "import { test } from 'vitest';\ntest('member', () => {});\n");
	git(work, ['add', '-A']);
	const passed = commit(work, 'a member test');
	assert.equal(passed.code, 0, passed.output);
	const pushed = push(work, ['origin', 'member']);
	assert.equal(pushed.code, 0, pushed.output);
	assert.match(pushed.output, /policy-guard: no unapproved enrolled change/);
	assert.match(pushed.output, /test-quarantine\.json: absent; no quarantine exceptions/);
	assert.match(pushed.output, /gitleaks-check: no findings/);
});

test('a combined install in a path with a space runs every installed command without a mangled path', async () => {
	const dir = realRepository(path.join('space dir', 'repo'));
	for (const [relative, content] of Object.entries(BASE_FILES)) writeFile(dir, relative, content);
	assert.equal(await noInstallInit(dir), 0);
	installJsoncParser(dir);
	excludeNodeModules(dir);
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'base']);

	// Each copied command runs from the spaced path with its own documented exit contract.
	assert.equal(runGuard(dir, ['--base', 'HEAD', '--target', 'HEAD', '--trusted-ref', 'HEAD', '--policy', 'lint-kit.policy.json', '--mode', 'working-tree']).code, 0);
	assert.equal(runScanner(dir, ['--gitleaks', GITLEAKS, '--base', 'HEAD']).code, 0);
	assert.equal(runLedger(dir).code, 0);
	assert.doesNotMatch(text(dir, 'lefthook.yml'), /tools\\security|tools\\policy/);
});

// ── the integrated hooks ────────────────────────────────────────────────────────

test('the integrated all-green push runs every step together: legitimate shapes pass and only the advisory is emitted', async () => {
	const work = await installedConsumer();
	assert.match(work, / /, 'the hooked consumer lives in a spaced path, so ESLint and the hooks run there');
	startBranch(work, 'green');
	// Legitimate counterexamples for the pre-commit ESLint step.
	writeFile(
		work,
		'test/legit.test.js',
		[
			"import { expect, test } from 'vitest';",
			"const t = { skip: () => {} };",
			"test('awaited', async () => { await expect(fetch('u')).resolves.toBe('y'); });",
			"test('returned', () => { return expect(fetch('u')).resolves.toBe('y'); });",
			"test('conditional skip', () => { test.skipIf(true)('win', () => {}); });",
			"test('todo', () => { test.todo('later'); });",
			"test('a local binding the rules cannot follow', () => { t.skip('other'); });",
			'',
		].join('\n'),
	);
	// A legitimate tightening of the enrolled ceiling, and a non-enrolled change for the advisory.
	writeFile(work, '.fallowrc.json', fallowText(20));
	writeFile(work, 'src/app.ts', 'export const a = 2;\n');
	git(work, ['add', '-A']);
	const committed = commit(work, 'legitimate shapes');
	assert.equal(committed.code, 0, committed.output);

	const pushed = push(work, ['origin', 'green']);
	assert.equal(pushed.code, 0, pushed.output);
	// Every pre-push step ran and reported; the guard's advisory did not gate the push.
	assert.match(pushed.output, /policy-guard: no unapproved enrolled change/);
	assert.match(pushed.output, /policy-guard: \d+ non-enrolled file\(s\) changed \(advisory\)/);
	assert.match(pushed.output, /test-quarantine\.json: 1 valid entry\(s\)/);
	assert.match(pushed.output, /gitleaks-check: no findings/);
	// ESLint is pre-commit only: the push output names no Vitest rule.
	assert.doesNotMatch(pushed.output, /vitest\//);
	resetMain(work);
});

test('a real Vitest warning is emitted by the pre-commit hook and still lets the commit pass', async () => {
	const work = await installedConsumer();
	startBranch(work, 'warning');
	// The project config sets the async owner to warn: an emitted warning, not an error.
	const rules = text(work, 'eslint.rules.js').replace("inspection: 'branch',", "inspection: 'branch',\n\t\trules: { 'vitest/valid-expect': 'warn' },");
	writeFile(work, 'eslint.rules.js', rules);
	writeFile(work, 'test/warn.test.js', "import { expect, test } from 'vitest';\ntest('w', () => { expect(fetch('u')).resolves.toBe('y'); });\n");
	git(work, ['add', '-A']);
	const committed = commit(work, 'an emitted warning');
	assert.equal(committed.code, 0, 'a warning must not gate the pre-commit hook');
	assert.match(committed.output, /warning\s+Async assertions must be awaited or returned\s+vitest\/valid-expect/);
	assert.match(committed.output, /0 errors, 1 warning/);
	resetMain(work);
});

test('the integrated pre-commit hook catches a focused, an unawaited and an unconditionally skipped test', async () => {
	const work = await installedConsumer();
	startBranch(work, 'defects');
	writeFile(
		work,
		'test/defects.test.js',
		[
			"import { expect, test } from 'vitest';",
			"test.only('focused', () => {});",
			"test('unawaited', () => { expect(fetch('u')).resolves.toBe('y'); });",
			"test.skip('disabled', () => {});",
			'',
		].join('\n'),
	);
	git(work, ['add', '-A']);
	const committed = commit(work, 'three defects');
	assert.notEqual(committed.code, 0, 'the pre-commit ESLint step must block the commit');
	assert.match(committed.output, /vitest\/no-focused-tests/);
	assert.match(committed.output, /vitest\/valid-expect/);
	assert.match(committed.output, /vitest\/no-disabled-tests/);
	resetMain(work);
});

test('the integrated pre-push hook catches a new secret and a weakened enrollment, and runs no ESLint', async () => {
	const work = await installedConsumer();
	startBranch(work, 'secret-and-weak');
	// Files the pre-commit ESLint step does not cover: only the pre-push steps judge this branch.
	writeCredentialFile(work, 'secret.ts', INTRODUCED);
	writeFile(work, '.fallowrc.json', fallowText(40));
	git(work, ['add', '-A']);
	const committed = commit(work, 'a secret and a weakened enrollment');
	assert.equal(committed.code, 0, committed.output);
	const pushed = push(work, ['origin', 'secret-and-weak']);
	assert.notEqual(pushed.code, 0);
	assert.match(pushed.output, /introduced generic-api-key secret\.ts:1/);
	assert.match(pushed.output, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
	// The same push also ran the ledger step, and none of the pre-push steps is ESLint.
	assert.match(pushed.output, /test-quarantine\.json:/);
	assert.doesNotMatch(pushed.output, /vitest\/(no-focused-tests|valid-expect|no-disabled-tests)/);
	assert.ok(!pushed.output.includes(INTRODUCED), 'the redacted push log must not carry the matched value');
	resetMain(work);
});

test('the mutable local guard is feedback, not protection: a hostile replacement passes locally and the frozen executable still catches it', async () => {
	const work = await combinedClone('tamper');
	startBranch(work, 'benign');
	writeFile(work, '.fallowrc.json', fallowText(40));
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'weaken the ceiling']);
	// A benign enrolled change is caught by the installed hook.
	const benign = runPrePush(work);
	assert.notEqual(benign.code, 0);
	assert.match(benign.output, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);

	startBranch(work, 'hostile');
	// Replace the mutable copy the local script runs with one that always passes, then weaken.
	writeFile(work, 'tools/policy/policy-guard.mjs', 'process.exit(0);\n');
	writeFile(work, '.fallowrc.json', fallowText(40));
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'replace the local guard and weaken']);
	const local = runPrePush(work);
	assert.equal(local.code, 0, `the replaced local guard makes the local hook pass:\n${local.output}`);

	// A local trusted-copy simulation: the frozen checkout executable, public `--cwd` and Git data.
	const trusted = runCopied(ROOT, 'tools/policy/policy-guard.mjs', [
		'--cwd', work,
		'--base', 'origin/main',
		'--target', 'HEAD',
		'--trusted-ref', 'origin/main',
		'--policy', 'lint-kit.policy.json',
		'--mode', 'working-tree',
	]);
	assert.equal(trusted.code, 1, trusted.output);
	assert.match(trusted.output, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
	assert.match(trusted.output, /enrolled-change: tools\/policy\/policy-guard\.mjs/);
});

// ── secrets: introduced, inherited, history, deleted-only and redaction ─────────

test('a branch-introduced secret fails, an inherited one does not, one deleted in a later commit is still introduced, and history keeps it', async () => {
	const work = await combinedClone('secrets', { files: { 'base-secret.ts': `const apiKey = "${INHERITED}";\n` } });
	const leaksBefore = leakedScanDirectories();
	// A clean branch inherits the base credential without being blocked by it.
	startBranch(work, 'clean');
	const inherited = runScanner(work, ['--gitleaks', GITLEAKS, '--base', 'origin/main']);
	assert.equal(inherited.code, 0, inherited.output);
	assert.match(inherited.stdout, /inherited generic-api-key base-secret\.ts:1/);
	assert.match(inherited.stdout, /not introduced by this branch/);
	assert.ok(!inherited.output.includes(INHERITED), 'the inherited value must not be printed');
	assert.ok(!inherited.output.includes(INTRODUCED));

	// Deleting the file in a later commit does not erase the branch's commit: the gate still blocks.
	startBranch(work, 'deleted-in-commits');
	writeFile(work, 'gone.ts', `const apiKey = "${INTRODUCED}";\n`);
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'add a credential']);
	git(work, ['rm', '-q', 'gone.ts']);
	git(work, ['commit', '-qm', 'delete it again']);
	assert.equal(fs.existsSync(path.join(work, 'gone.ts')), false, 'the working tree no longer holds the value');
	const deleted = runScanner(work, ['--gitleaks', GITLEAKS, '--base', 'origin/main']);
	assert.equal(deleted.code, 1, deleted.output);
	assert.match(deleted.stdout, /introduced generic-api-key gone\.ts:1 commit [0-9a-f]{7}/);
	assert.match(deleted.stdout, /inherited generic-api-key base-secret\.ts:1/);
	assert.ok(!deleted.output.includes(INTRODUCED), 'the introduced value must not be printed');
	assert.ok(!deleted.output.includes(INHERITED), 'the inherited value must not be printed either');

	startBranch(work, 'introduced');
	writeCredentialFile(work, 'branch-secret.ts', INTRODUCED);
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'add a credential']);
	const branch = runScanner(work, ['--gitleaks', GITLEAKS, '--base', 'origin/main']);
	assert.equal(branch.code, 1, branch.output);
	assert.match(branch.stdout, /introduced generic-api-key branch-secret\.ts:1/);
	assert.ok(!branch.output.includes(INTRODUCED), 'the matched value must not be printed');

	// The history audit reports the credential a later commit deleted, with its commit.
	writeFile(work, 'gone.ts', `const apiKey = "${INTRODUCED}";\n`);
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'add a credential that will be deleted']);
	git(work, ['rm', '-q', 'gone.ts']);
	git(work, ['commit', '-qm', 'delete it again']);
	const history = runScanner(work, ['--mode', 'history', '--gitleaks', GITLEAKS]);
	assert.equal(history.code, 1, history.output);
	assert.match(history.stdout, /^gitleaks-check: finding generic-api-key gone\.ts:1 commit [0-9a-f]{7}$/m);
	assert.ok(!history.output.includes(INTRODUCED));
	assert.ok(!history.output.includes(INHERITED), 'history redacts the inherited value too');
	// The scanner removed its own scratch directory and report: nothing outlives the run.
	assert.deepEqual(leakedScanDirectories(), leaksBefore, 'the scanner left no report or scratch directory behind');
});

test('the artifact-cleanup predicate reads the scanner scratch owner and rejects a planted leak', () => {
	const before = leakedScanDirectories();
	assert.deepEqual(before, [], 'no earlier case may have leaked a scanner scratch directory');
	const planted = fs.mkdtempSync(path.join(PRIVATE_TMP, 'gitleaks-check-'));
	try {
		assert.notDeepEqual(leakedScanDirectories(), before, 'the cleanup check must see a leaked scratch directory');
	} finally {
		fs.rmSync(planted, { recursive: true, force: true });
	}
	assert.deepEqual(leakedScanDirectories(), before);
});

// ── docs-only and deletion-only lifecycle in the combined hook ──────────────────

test('a real docs-only branch changes only docs and its live trusted ledger entry keeps the combined hook green', async () => {
	const work = await combinedClone('docs-live', {
		prepareBase: (dir) => enrollLedger(dir, [{ file: 'test/app.test.js', line: 2, column: 1, sourceCallSha256: sha256("test('works', () => {})"), reason: 'r', owner: 'o', expires: '2099-01-01' }]),
	});
	startBranch(work, 'docs');
	writeFile(work, 'docs/readme.md', '# docs\n');
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'docs only with a live entry']);
	// The branch is exactly docs: no ledger or manifest edit, and no extra working-tree edit.
	assert.deepEqual(changedPaths(work), ['docs/readme.md']);
	assert.equal(statusPorcelain(work), '');
	const live = runPrePush(work);
	assert.equal(live.code, 0, live.output);
	assert.match(live.output, /test-quarantine\.json: 1 valid entry\(s\)/);
	assert.match(live.output, /policy-guard: no unapproved enrolled change/);
	assert.match(live.output, /gitleaks-check: no findings/);
});

test('a real docs-only branch with an expired trusted ledger entry fails the unfiltered ledger step', async () => {
	const work = await combinedClone('docs-expired', {
		prepareBase: (dir) => enrollLedger(dir, [{ file: 'test/app.test.js', line: 2, column: 1, sourceCallSha256: sha256("test('works', () => {})"), reason: 'r', owner: 'o', expires: '2000-01-01' }]),
	});
	startBranch(work, 'docs');
	writeFile(work, 'docs/readme.md', '# docs\n');
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'docs only with an expired entry']);
	assert.deepEqual(changedPaths(work), ['docs/readme.md']);
	assert.equal(statusPorcelain(work), '');
	const expired = runPrePush(work);
	assert.notEqual(expired.code, 0, 'the expired entry fails the ledger step');
	assert.match(expired.output, /test-quarantine\.json: 1 expired entry\(s\)/);
	assert.match(expired.output, /policy-guard:/);
	assert.match(expired.output, /gitleaks-check:/);
});

test('a real deletion-only branch changes only deletions and the unfiltered steps still run', async () => {
	const work = await combinedClone('deletion-absent');
	startBranch(work, 'delete');
	git(work, ['rm', '-q', '.fallowrc.json', 'test/app.test.js']);
	git(work, ['commit', '-qm', 'delete the enrolled config and the only test']);
	assert.deepEqual(changedPaths(work).sort(), ['.fallowrc.json', 'test/app.test.js']);
	assert.equal(statusPorcelain(work), '');
	const absent = runPrePush(work);
	assert.notEqual(absent.code, 0, 'the deleted enrolled config fails the guard');
	assert.match(absent.output, /policy-guard: enrolled-change: \.fallowrc\.json/);
	assert.match(absent.output, /test-quarantine\.json: absent; no quarantine exceptions/);
});

test('a real deletion-only branch with a malformed trusted ledger fails that step while the guard still charges the deletion', async () => {
	const work = await combinedClone('deletion-malformed', { prepareBase: (dir) => writeFile(dir, 'test-quarantine.json', '{ not json\n') });
	startBranch(work, 'delete');
	git(work, ['rm', '-q', '.fallowrc.json', 'test/app.test.js']);
	git(work, ['commit', '-qm', 'delete the enrolled config and the only test']);
	assert.deepEqual(changedPaths(work).sort(), ['.fallowrc.json', 'test/app.test.js']);
	assert.equal(statusPorcelain(work), '');
	const malformed = runPrePush(work);
	assert.notEqual(malformed.code, 0);
	assert.match(malformed.output, /test-quarantine\.json: invalid \(not-json\)/);
	assert.match(malformed.output, /policy-guard: enrolled-change: \.fallowrc\.json/);
});

// ── missing evidence and tool execution never produce a clean verdict ────────────

test('a missing parser, an explicitly missing scanner and an absent ledger each keep their own verdict in one combined hook', async () => {
	// The generated secret step is wired to an explicitly absent `--gitleaks` path, so the case does
	// not depend on what a developer's ambient PATH happens to contain.
	const missing = path.join(TMP, 'explicitly-missing-gitleaks');
	const work = await combinedClone('missing', {
		prepareBase: (dir) =>
			writeFile(dir, 'lefthook.yml', text(dir, 'lefthook.yml').replace(`${SCANNER} --base origin/main`, `${SCANNER} --base origin/main --gitleaks ${missing}`)),
	});
	// Remove the parser so the guard cannot read the enrolled JSONC config.
	fs.rmSync(path.join(work, 'node_modules'), { recursive: true, force: true });
	startBranch(work, 'missing');
	writeFile(work, '.fallowrc.json', fallowText(40));
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'a change that needs the parser']);

	const run = runPrePush(work);
	assert.notEqual(run.code, 0);
	assert.match(run.output, /cannot load jsonc-parser/, 'the guard fails closed on a missing parser');
	assert.match(run.output, /the Gitleaks executable was not found/, 'the scanner fails closed at the explicit path');
	assert.match(run.output, /test-quarantine\.json: absent; no quarantine exceptions/, 'an absent ledger is 0, not a masked failure');

	// The same explicit path on its own is exit 2, never a clean verdict.
	const direct = runScanner(work, ['--gitleaks', missing, '--base', 'origin/main']);
	assert.equal(direct.code, 2, direct.output);
	assert.match(direct.stderr, /cannot check/);
	assert.doesNotMatch(direct.stdout, /no findings/);
});

test('a missing Vitest plugin provider fails the installed ESLint instead of silently skipping the rules', async () => {
	// Outside the repository, with no node_modules, so `@vitest/eslint-plugin` resolves from nowhere.
	const dir = path.join(TMP, 'no-provider');
	fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
	fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
	writeFile(dir, 'package.json', JSON.stringify({ type: 'module', name: 'isolated', devDependencies: { svelte: '^5', vitest: '4.1.11' } }));
	writeFile(dir, 'pnpm-lock.yaml', '');
	writeFile(dir, 'lefthook.yml', 'pre-commit:\n  commands: {}\n');
	writeFile(dir, 'test/outside.test.js', "import { test } from 'vitest';\ntest.only('outside', () => {});\n");
	await noInstallInit(dir);
	// A config that spreads only the copied rules, so the missing plugin is the failure, not a parser.
	writeFile(dir, 'eslint.config.js', "import toolRules from './eslint.rules.js';\nexport default [...toolRules];\n");

	const run = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js'), 'test/outside.test.js'], {
		cwd: dir,
		encoding: 'utf8',
		timeout: TOOL_TIMEOUT_MS,
		env: withIsolation({ PATH: NODE_PATH }),
	});
	finished(run, 'eslint without a provider');
	assert.notEqual(run.status, 0, 'a missing plugin must not exit 0');
	assert.match(`${run.stdout}\n${run.stderr}`, /@vitest\/eslint-plugin/);
	assert.doesNotMatch(run.stdout, /no-focused-tests/, 'a config that could not load reports no rule');
});

// ── the pinned provider is the one the file promises ────────────────────────────

test('the joint fixture pins Gitleaks 8.30.1 and the copied command names it', async () => {
	assert.equal(PINNED_GITLEAKS_VERSION, '8.30.1');
	const dir = realRepository('pin');
	for (const [relative, content] of Object.entries(BASE_FILES)) writeFile(dir, relative, content);
	assert.equal(await noInstallInit(dir), 0);
	assert.match(text(dir, 'tools/security/gitleaks.toml'), /minVersion = "v8\.30\.1"/);
	assert.match(text(dir, 'tools/security/gitleaks-check.md'), /8\.30\.1/);
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'base']);
	// The private temp isolation is merged even though this case supplies its own PATH override.
	const leakedBefore = leakedScanDirectories();
	const scanned = runScanner(dir, ['--gitleaks', GITLEAKS, '--base', 'HEAD'], { PATH: `${GITLEAKS_DIR}${path.delimiter}${NODE_PATH}` });
	assert.equal(scanned.code, 0, scanned.output);
	assert.match(scanned.stdout, /gitleaks-check: gitleaks 8\.30\.1 branch scan/);
	assert.deepEqual(leakedScanDirectories(), leakedBefore);
});
