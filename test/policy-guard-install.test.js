/**
 * The opt-in `policy-guard` install set (#43).
 *
 * These tests run the real installer, the real copied command and the real generated lefthook
 * pre-push script. They assert the public artifacts (the copied files, the enrollment manifest,
 * the generated hook) and the command's exit code, stdout and stderr, not installer internals.
 * The parser-resolvable cases install or copy the frozen `jsonc-parser` 3.3.1 where the copied
 * command resolves it (the repository root), never through a symlink back into this checkout.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { main } from '../bin/lint-kit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEFTHOOK = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'lefthook.CMD' : 'lefthook');
const JSONC_PARSER_SOURCE = path.join(ROOT, 'node_modules', 'jsonc-parser');
const COMMAND = 'node tools/policy/policy-guard.mjs';
const POLICY_SCRIPT = 'policy-guard.sh';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-policy-install-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const scriptBody = (base) =>
	`#!/usr/bin/env bash\nset -e\n${COMMAND} --base ${base} --target HEAD --trusted-ref ${base} --policy lint-kit.policy.json --mode working-tree\n`;
const fallowText = (maxCognitive, rules = '{\n\t\t"unused-exports": "warn"\n\t}') =>
	`{\n\t"health": { "maxCognitive": ${maxCognitive} },\n\t"rules": ${rules}\n}\n`;
const installFiles = ['tools/policy/policy-guard.mjs', 'tools/policy/README.md', 'lint-kit.policy.json'];

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
const enrollments = (dir) => JSON.parse(text(dir, 'lint-kit.policy.json')).enrollments;
const bySource = (dir, source) => enrollments(dir).find((enrollment) => enrollment.source === source);

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
	return dir;
}

/** Keep node_modules out of the fixture's Git tree, so an add -A cannot commit the dependency. */
function excludeNodeModules(dir) {
	fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), 'node_modules/\n');
}

/** The parser the copied guard resolves from its own location, as a root install would leave it. */
function installJsoncParser(dir) {
	if (!fs.existsSync(JSONC_PARSER_SOURCE)) throw new Error(`the frozen jsonc-parser is not installed at ${JSONC_PARSER_SOURCE}`);
	fs.cpSync(JSONC_PARSER_SOURCE, path.join(dir, 'node_modules', 'jsonc-parser'), { recursive: true, dereference: true });
	excludeNodeModules(dir);
}

function installLefthook(dir) {
	execFileSync(LEFTHOOK, ['install'], { cwd: dir, stdio: 'ignore', shell: process.platform === 'win32' });
}

/** Run the copied command from inside the repository it was installed into. */
function runCopied(dir, args) {
	const result = spawnSync(process.execPath, [path.join(dir, 'tools', 'policy', 'policy-guard.mjs'), ...args], {
		cwd: dir,
		encoding: 'utf8',
		env: process.env,
	});
	const stdout = result.stdout ?? '';
	const stderr = result.stderr ?? '';
	return { code: result.status, stdout, stderr, output: `${stdout}${stderr}` };
}

/** Git push with the generated hook installed (the copy's parser is already on disk). */
function push(dir, args) {
	const result = spawnSync('git', ['push', ...args], { cwd: dir, encoding: 'utf8' });
	const stdout = result.stdout ?? '';
	const stderr = result.stderr ?? '';
	return { code: result.status, output: `${stdout}${stderr}` };
}

function git(dir, args) {
	const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
	return (result.stdout ?? '').trim();
}

/** A clone of a fresh bare origin, with the base files written but not yet committed. */
function clonedRepository(name) {
	const origin = path.join(TMP, `${name}-origin.git`);
	const work = path.join(TMP, `${name}-work`);
	execFileSync('git', ['init', '--bare', '-q', origin]);
	execFileSync('git', ['clone', '-q', origin, work]);
	git(work, ['config', 'user.email', 'policy-install@lint-kit.test']);
	git(work, ['config', 'user.name', 'lint-kit']);
	return work;
}

/**
 * A cloned repository with the set installed, the manifest and policy landed on `origin/main`,
 * and lefthook installed. `parser` controls whether the copied command can resolve jsonc-parser.
 */
async function hookedClone(name, { parser = true } = {}) {
	const work = clonedRepository(name);
	fs.writeFileSync(path.join(work, 'package.json'), '{"name":"consumer"}\n');
	fs.writeFileSync(path.join(work, 'pnpm-lock.yaml'), '');
	fs.writeFileSync(path.join(work, 'lefthook.yml'), 'pre-push:\n  commands:\n    placeholder:\n      run: echo ok\n');
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(25));
	await init(work, '--sets', 'policy-guard', '--base', 'main');
	if (parser) installJsoncParser(work);
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'base']);
	git(work, ['branch', '-M', 'main']);
	assert.equal(push(work, ['-q', '-u', 'origin', 'main']).code, 0, 'the base push is clean');
	installLefthook(work);
	return work;
}

// ── fresh, repeat, upgrade ──────────────────────────────────────────────────────

test('a fresh install copies the command and README, enrolls the config it can read, and wires one root script', async () => {
	const dir = project('fresh', {
		'lefthook.yml': 'pre-commit:\n  commands:\n    format:\n      run: pnpm format\n',
		'package.json': '{\n\t"name": "consumer",\n\t"devDependencies": { "svelte": "^5" }\n}\n',
		// JSONC with comments, the real shape the installer writes and the adapter reads
		'.fallowrc.json':
			'{\n\t// the checker\'s own values, never copied into the enrollment\n\t"ignorePatterns": ["tools/**"],\n\t"rules": { "unused-exports": "warn", "unused-dev-dependencies": "error" },\n\t"health": { "maxCognitive": 25, "maxCrap": 100000 }\n}\n',
		'tools/python/structure_check.py': '"""the copied Python structure checker"""\n',
	});
	assert.equal(await init(dir, '--sets', 'policy-guard'), 0);
	for (const file of installFiles) assert.ok(fs.existsSync(path.join(dir, file)), file);

	assert.equal(bySource(dir, 'tools/policy/policy-guard.mjs')?.format, 'opaque');
	const fallow = bySource(dir, '.fallowrc.json');
	assert.equal(fallow?.format, 'jsonc');
	assert.equal(fallow?.adapter, 'fallow-jsonc');
	assert.deepEqual(
		fallow?.identities?.map((identity) => identity.id).sort(),
		['health.maxCognitive', 'health.maxCrap', 'ignorePatterns', 'rules'],
	);
	assert.deepEqual(bySource(dir, 'tools/python/structure_check.py'), {
		id: 'tools-python-structure-check-py',
		source: 'tools/python/structure_check.py',
		format: 'opaque',
	});
	// metadata links only: no threshold, severity or ignore value is copied into the manifest
	assert.doesNotMatch(text(dir, 'lint-kit.policy.json'), /"value"|maxCognitive"?\s*:\s*25|unused-exports|tools\/\*\*/);

	// a script, not a file-filtered command, so a deletion-only push still reaches it
	assert.deepEqual(hooks(dir)['pre-push'].scripts[POLICY_SCRIPT], { runner: 'bash' });
	assert.equal(text(dir, `.lefthook/pre-push/${POLICY_SCRIPT}`), scriptBody('origin/main'));
	assert.equal(hooks(dir)['pre-push'].commands, undefined);
	// the repository's own pre-commit step is kept
	assert.deepEqual(hooks(dir)['pre-commit'].commands.format, { run: 'pnpm format' });
});

test('an install that also writes the Fallow config enrolls that exact file', async () => {
	const dir = project('structure-together', {
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'pnpm-lock.yaml': '',
		'package.json': JSON.stringify({ devDependencies: { typescript: '^5' } }),
		'src/app.ts': 'export const x = 1;\n',
	});
	assert.equal(await init(dir, '--sets', 'structure,policy-guard'), 0);
	// the structure set wrote the JSONC config; the manifest enrolls that same file's identities
	assert.ok(fs.existsSync(path.join(dir, '.fallowrc.json')));
	assert.deepEqual(
		bySource(dir, '.fallowrc.json')?.identities?.map((identity) => identity.id).sort(),
		['health.maxCognitive', 'health.maxCrap', 'ignorePatterns', 'rules'],
	);
	assert.deepEqual(Object.keys(hooks(dir)['pre-push'].scripts).sort(), ['fallow.sh', POLICY_SCRIPT]);
});

test('a default run never selects policy-guard, even with a jsonc-parser dependency', async () => {
	const dir = project('default', {
		'lefthook.yml': 'pre-commit:\n  commands:\n    format:\n      run: pnpm format\n',
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', 'jsonc-parser': '3.3.1' } }),
		'.fallowrc.json': '{"health":{"maxCognitive":25}}\n',
	});
	assert.equal(await init(dir, '--yes'), 0);
	assert.equal(fs.existsSync(path.join(dir, 'tools', 'policy')), false);
	assert.equal(fs.existsSync(path.join(dir, 'lint-kit.policy.json')), false);
	assert.equal(hooks(dir)['pre-push']?.scripts?.[POLICY_SCRIPT], undefined);
});

test('a repeat preserves an edited manifest and config byte-for-byte and adds no second step', async () => {
	const dir = project('repeat', {
		'lefthook.yml': 'pre-commit:\n  commands:\n    format:\n      run: pnpm format\n',
		'package.json': '{"name":"consumer"}\n',
		'.fallowrc.json': fallowText(25),
	});
	await init(dir, '--sets', 'policy-guard');
	const lefthookOnce = text(dir, 'lefthook.yml');
	const scriptOnce = text(dir, `.lefthook/pre-push/${POLICY_SCRIPT}`);
	const fallowOnce = text(dir, '.fallowrc.json');
	// a reviewed enrollment the consumer added by hand
	const edited = JSON.parse(text(dir, 'lint-kit.policy.json'));
	edited.enrollments.push({ id: 'flake8', source: '.flake8', format: 'opaque' });
	fs.writeFileSync(path.join(dir, 'lint-kit.policy.json'), `${JSON.stringify(edited, null, '\t')}\n`);
	fs.writeFileSync(path.join(dir, '.fallowrc.json'), `${fallowOnce}\n// a reviewed comment\n`);

	assert.equal(await init(dir, '--sets', 'policy-guard'), 0);
	assert.equal(text(dir, 'lint-kit.policy.json'), `${JSON.stringify(edited, null, '\t')}\n`);
	assert.equal(text(dir, 'lefthook.yml'), lefthookOnce, 'the script is not duplicated');
	assert.equal(text(dir, `.lefthook/pre-push/${POLICY_SCRIPT}`), scriptOnce);
	assert.equal(text(dir, '.fallowrc.json'), `${fallowOnce}\n// a reviewed comment\n`);
	assert.equal((text(dir, 'lefthook.yml').match(/policy-guard\.sh/g) ?? []).length, 1);
});

test('an upgrade refreshes the copied command and README but preserves the manifest', async () => {
	const dir = project('upgrade', {
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'package.json': '{"name":"consumer"}\n',
		'.fallowrc.json': fallowText(25),
	});
	await init(dir, '--sets', 'policy-guard');
	fs.writeFileSync(path.join(dir, 'tools/policy/policy-guard.mjs'), 'export const staleMarker = true;\n');
	fs.writeFileSync(path.join(dir, 'tools/policy/README.md'), 'stale readme\n');
	const manifestEdited = `${text(dir, 'lint-kit.policy.json')}\n`;
	fs.writeFileSync(path.join(dir, 'lint-kit.policy.json'), manifestEdited);

	assert.equal(await init(dir, '--sets', 'policy-guard'), 0);
	assert.doesNotMatch(text(dir, 'tools/policy/policy-guard.mjs'), /staleMarker/, 'the copied command is refreshed');
	assert.match(text(dir, 'tools/policy/policy-guard.mjs'), /export function main/);
	assert.doesNotMatch(text(dir, 'tools/policy/README.md'), /^stale/m, 'the copied README is refreshed');
	assert.match(text(dir, 'tools/policy/README.md'), /Installed by `init`/);
	assert.equal(text(dir, 'lint-kit.policy.json'), manifestEdited, 'the consumer manifest is preserved');
});

test('init from a nested workspace writes one repository-root script with POSIX paths', async () => {
	const dir = project('nested', {
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
		'pnpm-lock.yaml': '',
		'package.json': '{"name":"root"}\n',
		'apps/web/package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'apps/web/.fallowrc.json': fallowText(25),
	});
	assert.equal(await init(path.join(dir, 'apps', 'web'), '--sets', 'policy-guard'), 0);
	assert.ok(fs.existsSync(path.join(dir, 'lint-kit.policy.json')));
	assert.equal(bySource(dir, 'apps/web/.fallowrc.json')?.format, 'jsonc');
	assert.deepEqual(hooks(dir)['pre-push'].scripts[POLICY_SCRIPT], { runner: 'bash' });
	assert.equal(text(dir, `.lefthook/pre-push/${POLICY_SCRIPT}`), scriptBody('origin/main'));
	assert.doesNotMatch(text(dir, 'lefthook.yml'), /tools\\policy/);
});

// ── enrollment derivation ───────────────────────────────────────────────────────

test('the manifest enrolls only identities the real Fallow JSONC provably has', async () => {
	const subset = project('subset', { 'package.json': '{"name":"c"}\n', '.fallowrc.json': '{\n\t// comment\n\t"rules": { "unused-exports": "error" }\n}\n' });
	assert.equal(await init(subset, '--sets', 'policy-guard'), 0);
	assert.deepEqual(bySource(subset, '.fallowrc.json')?.identities?.map((identity) => identity.id), ['rules']);

	// a wrong-typed score and an unknown severity are not readable identities, so the file is
	// protected opaque instead of enrolling a comparison the guard would fail on
	const opaque = project('wrong-type', {
		'package.json': '{"name":"c"}\n',
		'.fallowrc.json': '{"health":{"maxCognitive":"25"},"rules":{"a":"fatal"}}\n',
	});
	const said = await capture(['init', '--no-install', '--cwd', opaque, '--sets', 'policy-guard']);
	assert.equal(bySource(opaque, '.fallowrc.json')?.format, 'opaque');
	assert.doesNotMatch(text(opaque, 'lint-kit.policy.json'), /fallow-jsonc/);
	assert.match(said, /protected opaque; the fallow-jsonc adapter found no readable enrolled identity/);
});

test('an executable Fallow shape is protected opaque without evaluation', async () => {
	const source = 'export default { rules: { "unused-exports": "warn" } };\n';
	const dir = project('executable', { 'package.json': '{"name":"c"}\n', 'fallow.config.js': source });
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard']);
	assert.equal(text(dir, 'fallow.config.js'), source, 'the source is untouched');
	assert.deepEqual(bySource(dir, 'fallow.config.js'), {
		id: 'fallow-config-js',
		source: 'fallow.config.js',
		format: 'opaque',
	});
	assert.match(said, /protected opaque; this Fallow shape has no parsed adapter/);
});

// ── pre-push wiring ─────────────────────────────────────────────────────────────

test('with no lefthook, nothing is wired and the script to add is printed', async () => {
	const dir = project('no-hook', { 'package.json': '{"name":"c"}\n' });
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard']);
	assert.equal(fs.existsSync(path.join(dir, 'lefthook.yml')), false);
	assert.ok(fs.existsSync(path.join(dir, 'lint-kit.policy.json')));
	assert.match(said, /this repository has no lefthook\.yml, so no pre-push script was added/);
	assert.match(said, /scripts:\n\s+policy-guard\.sh:\n\s+runner: bash/);
	assert.doesNotMatch(said, /already runs the copied guard/);
});

test('an existing canonical repository-root script is recognised, and nothing is added', async () => {
	const own = `pre-push:\n  scripts:\n    ${POLICY_SCRIPT}:\n      runner: bash\n`;
	const dir = project('canonical-script', {
		'lefthook.yml': own,
		'package.json': '{"name":"c"}\n',
		[`.lefthook/pre-push/${POLICY_SCRIPT}`]: scriptBody('origin/develop'),
	});
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard']);
	assert.equal(text(dir, 'lefthook.yml'), own);
	assert.match(said, /already runs the copied guard; nothing added/);
});

test('a pre-push script of the same name with a misleading body is a manual action, not success', async () => {
	const own = `pre-push:\n  scripts:\n    ${POLICY_SCRIPT}:\n      runner: bash\n`;
	const body = `#!/usr/bin/env bash\nset -e\necho policy-guard.mjs || true\n`;
	const dir = project('script-mismatch', {
		'lefthook.yml': own,
		'package.json': '{"name":"c"}\n',
		[`.lefthook/pre-push/${POLICY_SCRIPT}`]: body,
	});
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard']);
	assert.equal(text(dir, `.lefthook/pre-push/${POLICY_SCRIPT}`), body, 'the consumer script is untouched');
	assert.doesNotMatch(said, /already runs the copied guard/);
	assert.match(said, /is not the supported working-tree run/);
});

test('an equivalent repository-root command is recognised, and nothing is added', async () => {
	const own = `pre-push:\n  commands:\n    policy-check:\n      run: ${COMMAND} --base origin/develop --target HEAD --trusted-ref origin/develop --policy lint-kit.policy.json --mode working-tree\n`;
	const dir = project('canonical-command', { 'lefthook.yml': own, 'package.json': '{"name":"c"}\n' });
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard']);
	assert.equal(text(dir, 'lefthook.yml'), own);
	assert.match(said, /pre-push "policy-check" already runs the copied guard at the repository root/);
	assert.doesNotMatch(said, /names the copied guard but is not/);
});

test('a step that only mentions the copied command is a manual action, not success', async () => {
	const canonical = `${COMMAND} --base origin/main --target HEAD --trusted-ref origin/main --policy lint-kit.policy.json --mode working-tree`;
	const shapes = {
		echo: `pre-push:\n  commands:\n    docs:\n      run: echo ${COMMAND}\n`,
		orTrue: `pre-push:\n  commands:\n    policy-guard:\n      run: ${canonical} || true\n`,
		root: `pre-push:\n  commands:\n    policy-guard:\n      root: apps/web/\n      run: ${canonical}\n`,
		glob: `pre-push:\n  commands:\n    policy-guard:\n      glob: "*.fallowrc.json"\n      run: ${canonical}\n`,
		skip: `pre-push:\n  commands:\n    policy-guard:\n      skip: true\n      run: ${canonical}\n`,
		committed: `pre-push:\n  commands:\n    policy-guard:\n      run: ${COMMAND} --base origin/main --target HEAD --trusted-ref origin/main --policy lint-kit.policy.json --mode committed\n`,
		headTrust: `pre-push:\n  commands:\n    policy-guard:\n      run: ${COMMAND} --base origin/main --target HEAD --trusted-ref HEAD --policy lint-kit.policy.json --mode working-tree\n`,
		wrongPolicy: `pre-push:\n  commands:\n    policy-guard:\n      run: ${COMMAND} --base origin/main --target HEAD --trusted-ref origin/main --policy other.json --mode working-tree\n`,
	};
	for (const [name, own] of Object.entries(shapes)) {
		const dir = project(`misleading-${name}`, { 'lefthook.yml': own, 'package.json': '{"name":"c"}\n' });
		const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard']);
		assert.equal(text(dir, 'lefthook.yml'), own, `${name}: the step is untouched`);
		assert.doesNotMatch(said, /already runs the copied guard/, name);
		assert.match(said, /names the copied guard but is not the repository-root working-tree run/, name);
		assert.equal(hooks(dir)['pre-push'].scripts?.[POLICY_SCRIPT], undefined, name);
	}
});

test('an unusual --base is not embedded in a generated shell command', async () => {
	const dir = project('unusual-base', { 'lefthook.yml': 'pre-commit:\n  commands: {}\n', 'package.json': '{"name":"c"}\n' });
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard', '--base', 'origin/main; touch pwned']);
	assert.doesNotMatch(text(dir, 'lefthook.yml'), /pwned/);
	assert.doesNotMatch(said, /pwned/);
	assert.match(said, /the resolved base is not a plain ref/);
	assert.equal(hooks(dir)['pre-push']?.scripts?.[POLICY_SCRIPT], undefined);
});

// ── dependency provisioning ─────────────────────────────────────────────────────

test('a real install provisions jsonc-parser 3.3.1 at the root and the copied command resolves it', async () => {
	const dir = realRepository('provision');
	fs.writeFileSync(path.join(dir, 'package.json'), '{\n\t"name": "consumer",\n\t"private": true\n}\n');
	fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
	fs.writeFileSync(path.join(dir, 'lefthook.yml'), 'pre-push:\n  commands:\n    placeholder:\n      run: echo ok\n');
	fs.writeFileSync(path.join(dir, '.fallowrc.json'), fallowText(25));
	assert.equal(await quiet(['init', '--cwd', dir, '--sets', 'policy-guard']), 0);
	assert.equal(JSON.parse(text(dir, 'package.json')).devDependencies['jsonc-parser'], '3.3.1');
	assert.ok(fs.existsSync(path.join(dir, 'node_modules', 'jsonc-parser', 'package.json')), 'the dependency is installed');
	excludeNodeModules(dir);
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'base']);

	const args = ['--base', 'main', '--target', 'HEAD', '--trusted-ref', 'HEAD', '--policy', 'lint-kit.policy.json', '--mode', 'working-tree'];
	assert.equal(runCopied(dir, args).code, 0, 'the copied command resolves the installed parser');
	fs.writeFileSync(path.join(dir, '.fallowrc.json'), fallowText(40));
	const weakened = runCopied(dir, args);
	assert.equal(weakened.code, 1);
	assert.match(weakened.stdout, /health\.maxCognitive raised from 25 to 40/);
});

test('a dependency in one workspace member does not resolve from the root tools/policy command', async () => {
	const dir = realRepository('nested-dep');
	fs.mkdirSync(path.join(dir, 'apps', 'web'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
	fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
	fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"root"}\n');
	fs.writeFileSync(path.join(dir, 'apps/web/package.json'), JSON.stringify({ devDependencies: { 'jsonc-parser': '3.3.1' } }));
	fs.writeFileSync(path.join(dir, '.fallowrc.json'), fallowText(25));
	assert.equal(await init(dir, '--sets', 'policy-guard'), 0);
	// the parser is present, but only where the member would keep it
	fs.mkdirSync(path.join(dir, 'apps', 'web', 'node_modules'), { recursive: true });
	fs.cpSync(JSONC_PARSER_SOURCE, path.join(dir, 'apps', 'web', 'node_modules', 'jsonc-parser'), { recursive: true, dereference: true });
	excludeNodeModules(dir);
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'base']);
	// the enrolled value changes, so the guard must load the parser to compare it
	fs.writeFileSync(path.join(dir, '.fallowrc.json'), fallowText(40));
	const result = runCopied(dir, ['--base', 'main', '--target', 'HEAD', '--trusted-ref', 'HEAD', '--policy', 'lint-kit.policy.json', '--mode', 'working-tree']);
	assert.equal(result.code, 2, result.output);
	assert.match(result.stderr, /cannot load jsonc-parser/);
});

test('a repository path with a space installs and runs the copied command', async () => {
	const dir = realRepository(path.join('space dir', 'repo'));
	fs.writeFileSync(path.join(dir, 'package.json'), '{\n\t"name": "consumer",\n\t"private": true\n}\n');
	fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
	fs.writeFileSync(path.join(dir, 'lefthook.yml'), 'pre-push:\n  commands:\n    placeholder:\n      run: echo ok\n');
	fs.writeFileSync(path.join(dir, '.fallowrc.json'), fallowText(25));
	assert.equal(await init(dir, '--sets', 'policy-guard'), 0);
	installJsoncParser(dir);
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'base']);
	const args = ['--base', 'main', '--target', 'HEAD', '--trusted-ref', 'HEAD', '--policy', 'lint-kit.policy.json', '--mode', 'working-tree'];
	assert.equal(runCopied(dir, args).code, 0, 'the copied command runs from a path with a space');
	fs.writeFileSync(path.join(dir, '.fallowrc.json'), fallowText(40));
	const weakened = runCopied(dir, args);
	assert.equal(weakened.code, 1);
	assert.match(weakened.stdout, /health\.maxCognitive raised from 25 to 40/);
	assert.doesNotMatch(text(dir, 'lefthook.yml'), /tools\\policy/);
});

test('--no-install prints the manual parser step and claims nothing', async () => {
	const dir = project('no-install', {
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'package.json': '{"name":"c"}\n',
		'pnpm-lock.yaml': '',
	});
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard']);
	assert.match(said, /--no-install was given, so add it by hand: pnpm add -D jsonc-parser@3\.3\.1/);
	assert.equal(JSON.parse(text(dir, 'package.json')).devDependencies, undefined);
});

test('a repository without a root package.json is a manual dependency action, not a silent install', async () => {
	const dir = project('rootless', {
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'apps/web/package.json': '{"name":"web"}\n',
	});
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard']);
	assert.match(said, /no root package\.json, so init added none/);
	assert.equal(fs.existsSync(path.join(dir, 'package.json')), false);
	assert.ok(fs.existsSync(path.join(dir, 'lint-kit.policy.json')));
});

test('an unsupported declared jsonc-parser version is preserved, with a manual message', async () => {
	const own = '{\n\t"name":"c",\n\t"devDependencies": { "jsonc-parser": "3.2.0" }\n}\n';
	const dir = project('unsupported-version', { 'lefthook.yml': 'pre-commit:\n  commands: {}\n', 'package.json': own });
	const said = await capture(['init', '--no-install', '--cwd', dir, '--sets', 'policy-guard']);
	assert.equal(text(dir, 'package.json'), own);
	assert.match(said, /declares jsonc-parser@3\.2\.0, not the 3\.3\.1/);
});

// ── the real generated hook ─────────────────────────────────────────────────────

test('the generated pre-push script blocks a deletion-only change to an enrolled config (real lefthook)', async () => {
	const work = await hookedClone('deletion');
	git(work, ['checkout', '-qb', 'feature']);
	git(work, ['rm', '-q', '.fallowrc.json']);
	git(work, ['commit', '-qm', 'delete the enrolled config']);
	const rejected = push(work, ['origin', 'feature']);
	assert.notEqual(rejected.code, 0, rejected.output);
	assert.match(rejected.output, /enrolled-change: \.fallowrc\.json/);
});

test('the generated pre-push script blocks a weakening and permits a legitimate tightening (real lefthook)', async () => {
	const work = await hookedClone('weaken');
	git(work, ['checkout', '-qb', 'weaken']);
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(40));
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'weaken the ceiling']);
	const rejected = push(work, ['origin', 'weaken']);
	assert.notEqual(rejected.code, 0, rejected.output);
	assert.match(rejected.output, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);

	git(work, ['checkout', '-q', 'main']);
	git(work, ['checkout', '-qb', 'tighten']);
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(20));
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'tighten the ceiling']);
	const accepted = push(work, ['origin', 'tighten']);
	assert.equal(accepted.code, 0, accepted.output);
});

test('the generated pre-push script fails closed when the parser is missing (real lefthook)', async () => {
	const work = await hookedClone('no-parser', { parser: false });
	git(work, ['checkout', '-qb', 'feature']);
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(20));
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'a change that needs the parser']);
	const rejected = push(work, ['origin', 'feature']);
	assert.notEqual(rejected.code, 0, rejected.output);
	assert.match(rejected.output, /cannot load jsonc-parser/);
});

test('a fresh enrollment must be landed at the trusted ref first; before that the push fails closed', async () => {
	const work = clonedRepository('bootstrap');
	fs.writeFileSync(path.join(work, 'package.json'), '{"name":"consumer"}\n');
	fs.writeFileSync(path.join(work, 'pnpm-lock.yaml'), '');
	fs.writeFileSync(path.join(work, 'lefthook.yml'), 'pre-push:\n  commands:\n    placeholder:\n      run: echo ok\n');
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(25));
	await init(work, '--sets', 'policy-guard', '--base', 'main');
	installJsoncParser(work);
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'base']);
	git(work, ['branch', '-M', 'main']);
	// origin/main is deliberately never pushed, so the trusted enrollment does not exist yet
	installLefthook(work);
	git(work, ['checkout', '-qb', 'feature']);
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(40));
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'weaken before the enrollment landed']);
	const rejected = push(work, ['origin', 'feature']);
	assert.notEqual(rejected.code, 0, rejected.output);
	assert.match(rejected.output, /policy-guard: .*failed/);
});

test('the generated pre-push script fails closed when the enrollment is missing at the trusted ref', async () => {
	const work = clonedRepository('no-config');
	fs.writeFileSync(path.join(work, 'package.json'), '{"name":"consumer"}\n');
	fs.writeFileSync(path.join(work, 'pnpm-lock.yaml'), '');
	fs.writeFileSync(path.join(work, 'lefthook.yml'), 'pre-push:\n  commands:\n    placeholder:\n      run: echo ok\n');
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(25));
	await init(work, '--sets', 'policy-guard', '--base', 'main');
	installJsoncParser(work);
	// the manifest is never landed at the trusted ref
	fs.rmSync(path.join(work, 'lint-kit.policy.json'));
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'base without the enrollment']);
	git(work, ['branch', '-M', 'main']);
	assert.equal(push(work, ['-q', '-u', 'origin', 'main']).code, 0, 'the base push is clean');
	installLefthook(work);
	git(work, ['checkout', '-qb', 'feature']);
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(40));
	git(work, ['add', '-A']);
	git(work, ['commit', '-qm', 'change with no enrollment at the trusted ref']);
	const rejected = push(work, ['origin', 'feature']);
	assert.notEqual(rejected.code, 0, rejected.output);
	assert.match(rejected.output, /policy .* does not exist at --trusted-ref/);
});

test('the installed working-tree run judges partial staging by the working tree, not the index', async () => {
	const work = await hookedClone('partial');
	const args = ['--base', 'origin/main', '--target', 'HEAD', '--trusted-ref', 'origin/main', '--policy', 'lint-kit.policy.json', '--mode', 'working-tree'];
	// the index carries a weakening, the working tree is safe: the index must not be read
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(40));
	git(work, ['add', '.fallowrc.json']);
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(25));
	const stagedOnly = runCopied(work, args);
	assert.equal(stagedOnly.code, 0, stagedOnly.output);
	// the index is safe, the working tree weakens: the working tree must be read
	git(work, ['add', '.fallowrc.json']);
	fs.writeFileSync(path.join(work, '.fallowrc.json'), fallowText(40));
	const workingTree = runCopied(work, args);
	assert.equal(workingTree.code, 1, workingTree.output);
	assert.match(workingTree.stdout, /enrolled-weakened: health\.maxCognitive raised from 25 to 40/);
});

test('the copied README records the pinned parser and the feedback-not-authorization boundary', async () => {
	const dir = project('readme', { 'package.json': '{"name":"c"}\n' });
	await init(dir, '--sets', 'policy-guard');
	const readme = text(dir, 'tools/policy/README.md');
	assert.match(readme, /jsonc-parser/);
	assert.match(readme, /3\.3\.1/);
	assert.match(readme, /feedback, not authorization/);
	assert.doesNotMatch(readme, /installer wiring that copies it during `init` is\s+deferred/);
});
