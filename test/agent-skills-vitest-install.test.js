/**
 * Installing the vitest set (#47): explicit opt-in, the peer the copied module imports, and the
 * hook wiring that makes ESLint see tests outside src/.
 *
 * The set's own behavior is test/agent-skills-vitest-set.test.js. These tests run the public
 * `init` command and the installed tools in temporary repositories, because the failures they
 * guard — a set nobody selected, a hook that filters the tests out, an upgrade that forgets them —
 * are only visible there.
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
import { eslintPeers, main } from '../bin/lint-kit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** lefthook's binary: the .CMD shim on Windows, where execFileSync needs a shell to run it. */
const LEFTHOOK = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'lefthook.CMD' : 'lefthook');
// Inside the repo, so the generated configs resolve eslint and its plugins from its node_modules.
const TMP = path.join(ROOT, 'test', '.tmp-vitest-install');
fs.rmSync(TMP, { recursive: true, force: true });
// Outside the repo, so nothing resolves through the checkout's node_modules: what a generated
// config finds here is what the project owns (or fails to).
const ISOLATED = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-vitest-outside-'));
after(() => fs.rmSync(ISOLATED, { recursive: true, force: true }));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** A repository (it has a .git) made of `files`. Each fixture gets its own folder. */
function project(name, files) {
	const dir = path.join(TMP, name);
	for (const [rel, text] of Object.entries({ '.git/HEAD': 'ref: refs/heads/main\n', ...files })) {
		fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		fs.writeFileSync(path.join(dir, rel), text);
	}
	return dir;
}

const quiet = async (argv) => {
	const log = console.log;
	console.log = () => {};
	try {
		return await main(argv);
	} finally {
		console.log = log;
	}
};
/** init with its questions skipped and no package manager run; the set wiring is what is tested. */
const init = (dir, ...args) => quiet(['init', '--no-install', '--cwd', dir, ...args]);
const text = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const hooks = (dir) => parse(text(dir, 'lefthook.yml'));
const eslintStep = (dir) => hooks(dir)['pre-commit'].commands.eslint;

/** A Svelte + Vitest project with a lefthook config, a lockfile naming pnpm, and a test outside src/. */
const consumer = (name, files = {}) =>
	project(name, {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', vitest: '4.1.11' } }),
		'pnpm-lock.yaml': '',
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'src/app.ts': 'export const a = 1;\n',
		'test/outside.test.js': "import { test } from 'vitest';\ntest.only('outside src', () => {});\n",
		...files,
	});

test('vitest is opt-in: --yes never selects it, --sets vitest installs it and a re-run keeps it', async () => {
	const dir = consumer('opt-in');
	assert.equal(await init(dir, '--yes'), 0);
	assert.doesNotMatch(text(dir, 'eslint.rules.js'), /vitest/);
	assert.equal(fs.existsSync(path.join(dir, 'tools/eslint/vitest.mjs')), false);

	assert.equal(await init(dir, '--sets', 'vitest'), 0);
	assert.match(text(dir, 'eslint.rules.js'), /import vitest from '\.\/tools\/eslint\/vitest\.mjs';/);
	assert.match(text(dir, 'eslint.rules.js'), /vitest\.config\(\{[\s\S]*inspection: 'branch',/);
	assert.ok(fs.existsSync(path.join(dir, 'tools/eslint/vitest.mjs')));
	assert.ok(fs.existsSync(path.join(dir, 'tools/eslint/vitest.md')));

	// Installed, so a later run that asks for nothing keeps it (sets are only added).
	const once = ['eslint.rules.js', 'lefthook.yml'].map((f) => text(dir, f));
	assert.equal(await init(dir, '--yes'), 0);
	assert.deepEqual(['eslint.rules.js', 'lefthook.yml'].map((f) => text(dir, f)), once);
});

test('the generated config anchors the plugin to the project, and an older generated one is repaired', async () => {
	const dir = consumer('anchor');
	await init(dir, '--sets', 'vitest');
	assert.match(text(dir, 'eslint.rules.js'), /from: import\.meta\.url/);
	// A config written before the anchor was added: the set was wired without it. A repeat run
	// repairs it — keeping the previous file — instead of leaving a config that cannot resolve
	// the plugin in a workspace member.
	const older = text(dir, 'eslint.rules.js').replace(/\t\tfrom: import\.meta\.url,\n/, '');
	fs.writeFileSync(path.join(dir, 'eslint.rules.js'), older);
	fs.rmSync(path.join(dir, 'eslint.rules.js.bak'), { force: true });
	await init(dir, '--yes');
	assert.match(text(dir, 'eslint.rules.js'), /from: import\.meta\.url/);
	assert.equal(text(dir, 'eslint.rules.js.bak'), older);
});

test('the peer is installed only for the set whose module imports it', () => {
	assert.deepEqual(eslintPeers(['svelte-skills']), [
		'eslint',
		'eslint-plugin-svelte',
		'svelte-eslint-parser',
		'@typescript-eslint/parser',
	]);
	// The frozen version, so a consumer install matches the support matrix, and only once.
	assert.deepEqual(eslintPeers(['vitest', 'svelte-skills']).filter((n) => n.startsWith('@vitest/')), [
		'@vitest/eslint-plugin@1.6.27',
	]);
});

test('the eslint step routes the test files outside src/ to ESLint', async () => {
	const dir = consumer('globs');
	await init(dir, '--sets', 'vitest');
	// lefthook ORs an array of globs; the application glob is unchanged and the test glob is new.
	assert.deepEqual(eslintStep(dir).glob, ['src/*.{js,ts,svelte}', '*.{test,spec}.*']);
	assert.equal(eslintStep(dir).run, 'pnpm exec eslint {staged_files}');

	// A nested workspace member's patterns are project-relative, and doublestar needs its own form.
	const mono = project('mono', {
		'lefthook.yml': 'glob_matcher: doublestar\npre-commit:\n  commands: {}\n',
		'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
		'package.json': '{}\n',
		'apps/admin/package.json': JSON.stringify({ devDependencies: { svelte: '^5', vitest: '4.1.11' } }),
	});
	await init(mono, '--sets', 'vitest');
	assert.deepEqual(eslintStep(mono).glob, ['apps/admin/src/**/*.{js,ts,svelte}', 'apps/admin/**/*.{test,spec}.*']);
	assert.equal(eslintStep(mono).root, 'apps/admin/');
	// The member's own config anchors the plugin where the member installed it, not at the root.
	assert.match(text(mono, 'apps/admin/eslint.rules.js'), /from: import\.meta\.url/);
});

test('an install without vitest keeps the single application glob', async () => {
	const dir = consumer('no-vitest');
	await init(dir, '--sets', 'svelte-skills');
	assert.equal(eslintStep(dir).glob, 'src/*.{js,ts,svelte}');
});

test('adding vitest to an existing install widens the eslint step it already has', async () => {
	const dir = consumer('upgrade');
	await init(dir, '--sets', 'svelte-skills');
	assert.equal(eslintStep(dir).glob, 'src/*.{js,ts,svelte}');
	await init(dir, '--sets', 'vitest');
	assert.deepEqual(eslintStep(dir).glob, ['src/*.{js,ts,svelte}', '*.{test,spec}.*']);
	assert.match(text(dir, 'eslint.rules.js'), /svelteSkills[\s\S]*vitest/);
	assert.ok(fs.existsSync(path.join(dir, 'eslint.rules.js.bak')));
	// A repeat adds nothing.
	const widened = text(dir, 'lefthook.yml');
	await init(dir, '--sets', 'vitest');
	assert.equal(text(dir, 'lefthook.yml'), widened);
});

test('a repository with its own eslint step keeps it, and the manual step is named', async () => {
	const own = 'pre-commit:\n  commands:\n    lint:\n      run: npx eslint --fix {staged_files}\n';
	const dir = consumer('own-step', { 'lefthook.yml': own });
	const said = [];
	const log = console.log;
	console.log = (...args) => said.push(args.join(' '));
	try {
		assert.equal(await main(['init', '--no-install', '--cwd', dir, '--sets', 'vitest']), 0);
	} finally {
		console.log = log;
	}
	// The repository's own command is its policy; only the new pre-push validator is added.
	assert.equal(hooks(dir)['pre-commit'].commands.lint.run, 'npx eslint --fix {staged_files}');
	assert.match(said.join('\n'), /the step that runs ESLint for this project was left alone; add \*\.\{test,spec\}\.\*/);
});

test('asking for vitest without the runner says so instead of claiming success', async () => {
	const dir = project('no-runner', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
	});
	const said = [];
	const log = console.log;
	console.log = (...args) => said.push(args.join(' '));
	try {
		assert.equal(await main(['init', '--no-install', '--cwd', dir, '--sets', 'vitest']), 0);
	} finally {
		console.log = log;
	}
	assert.match(said.join('\n'), /vitest was asked for but no project took it/);
	assert.equal(fs.existsSync(path.join(dir, 'tools/eslint/vitest.mjs')), false);
});

test('an existing plugin at another version is named, not reported as verified', async () => {
	const dir = consumer('other-version', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', vitest: '4.1.11', '@vitest/eslint-plugin': '1.5.0' } }),
	});
	const said = [];
	const log = console.log;
	console.log = (...args) => said.push(args.join(' '));
	try {
		assert.equal(await main(['init', '--no-install', '--cwd', dir, '--sets', 'vitest']), 0);
	} finally {
		console.log = log;
	}
	assert.match(said.join('\n'), /@vitest\/eslint-plugin@1\.5\.0 is left as it is; the vitest set is verified against 1\.6\.27/);
});

test('--no-install preserves the consumer package.json and an ESLint config it already had', async () => {
	const config = "export default [{ rules: { 'no-var': 'error' } }];\n";
	const dir = consumer('preserve', { 'eslint.config.js': config });
	const before = text(dir, 'package.json');
	await init(dir, '--sets', 'vitest');
	assert.equal(text(dir, 'package.json'), before, '--no-install adds no devDependency');
	assert.match(text(dir, 'eslint.config.js'), /'no-var': 'error'/);
	assert.match(text(dir, 'eslint.config.js'), /import toolRules from '\.\/eslint\.rules\.js';/);
});

/** Lint one file through the installed config in a fresh process, returning [ruleId, severity] pairs. */
function installedMessages(dir, file) {
	// A new process, because ESLint caches the config module it imported and this file also lints
	// another consumer.
	const script = `import { ESLint } from 'eslint';
const [r] = await new ESLint({ cwd: ${JSON.stringify(dir)} }).lintFiles([${JSON.stringify(path.join(dir, file))}]);
console.log(JSON.stringify(r.messages.map((m) => [m.ruleId, m.severity])));
`;
	return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' }));
}

test('the installed ESLint reports an outside-src focused test exactly once', async () => {
	const dir = consumer('installed');
	await init(dir, '--sets', 'vitest');
	assert.deepEqual(installedMessages(dir, 'test/outside.test.js'), [['vitest/no-focused-tests', 2]]);
});

test('the installed ESLint reports an outside-src unawaited assertion exactly once', async () => {
	const dir = consumer('installed-async');
	await init(dir, '--sets', 'vitest');
	fs.writeFileSync(
		path.join(dir, 'test/outside.test.js'),
		"import { expect, test } from 'vitest';\ntest('x', () => { expect(fetch('u')).resolves.toBe('y'); });\n",
	);
	assert.deepEqual(installedMessages(dir, 'test/outside.test.js'), [['vitest/valid-expect', 2]]);
});

test('a missing maintained plugin fails the check instead of skipping it', async () => {
	// The project is outside the repository and has no node_modules, so `@vitest/eslint-plugin`
	// cannot resolve from anywhere: the run must fail, not quietly report nothing.
	const dir = path.join(ISOLATED, 'no-peer');
	fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
	fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
	fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module', devDependencies: { svelte: '^5', vitest: '4.1.11' } }));
	fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
	fs.writeFileSync(path.join(dir, 'lefthook.yml'), 'pre-commit:\n  commands: {}\n');
	// A config that spreads only the copied rules, so the missing plugin — not a parser — is the failure.
	fs.writeFileSync(path.join(dir, 'eslint.config.js'), "import toolRules from './eslint.rules.js';\nexport default [...toolRules];\n");
	fs.writeFileSync(path.join(dir, 'test/outside.test.js'), "import { test } from 'vitest';\ntest.only('outside', () => {});\n");
	await init(dir, '--sets', 'vitest');

	const run = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js'), 'test/outside.test.js'], {
		cwd: dir,
		encoding: 'utf8',
	});
	assert.notEqual(run.status, 0, 'a missing plugin must not exit 0');
	assert.match(`${run.stdout}\n${run.stderr}`, /@vitest\/eslint-plugin/);
	assert.doesNotMatch(run.stdout, /no-focused-tests/, 'a config that could not load reports no rule');
});

test('the installed ESLint reports the concise floating chain once, through its owner', async () => {
	// The concise form is the shape both async rules see; the installed config must keep one owner
	// for it, not the duplicate upstream pairing. The owner is `valid-expect`, the rule with the fix.
	const dir = consumer('installed-concise');
	await init(dir, '--sets', 'vitest');
	fs.writeFileSync(
		path.join(dir, 'test/outside.test.js'),
		"import { expect, test } from 'vitest';\ntest('x', () => { fetch('u').then((r) => expect(r).resolves.toBe('y')); });\n",
	);
	assert.deepEqual(installedMessages(dir, 'test/outside.test.js'), [['vitest/valid-expect', 2]]);
});

test('the installed hook checks an outside-src test (real lefthook)', async () => {
	// A real repository, not project()'s .git/HEAD: git stages files and lefthook reads the index.
	const dir = path.join(TMP, 'hook-repo');
	fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ devDependencies: { svelte: '^5', vitest: '4.1.11' } }));
	fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
	fs.writeFileSync(path.join(dir, 'lefthook.yml'), 'pre-commit:\n  commands: {}\n');
	fs.writeFileSync(path.join(dir, 'src/app.ts'), 'export const a = 1;\n');
	const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
	git('init', '-q', '-b', 'main');
	git('config', 'user.email', 't@example.test');
	git('config', 'user.name', 't');
	await init(dir, '--sets', 'vitest');

	// The glob and the step are the installer's own; the run command points at this checkout's
	// ESLint so the test does not depend on a package manager install inside the fixture.
	const eslintBin = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js').replace(/\\/g, '/');
	fs.writeFileSync(
		path.join(dir, 'lefthook.yml'),
		text(dir, 'lefthook.yml').replace('pnpm exec eslint {staged_files}', `node "${eslintBin}" {staged_files}`),
	);
	assert.deepEqual(eslintStep(dir).glob, ['src/*.{js,ts,svelte}', '*.{test,spec}.*']);

	fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'test', 'outside.test.js'), "import { test } from 'vitest';\ntest.only('outside src', () => {});\n");
	git('add', '-A');
	assert.throws(
		() => execFileSync(LEFTHOOK, ['run', 'pre-commit'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' }),
		(error) => {
			assert.match(`${error.stdout}\n${error.stderr}`, /test[\\/]outside\.test\.js/);
			assert.match(`${error.stdout}\n${error.stderr}`, /vitest\/no-focused-tests/);
			return true;
		},
	);

	// The same file without .only passes, so what the hook charged was the focus, not the file.
	fs.writeFileSync(path.join(dir, 'test', 'outside.test.js'), "import { test } from 'vitest';\ntest('outside src', () => {});\n");
	git('add', '-A');
	execFileSync(LEFTHOOK, ['run', 'pre-commit'], { cwd: dir, stdio: 'ignore', shell: process.platform === 'win32' });
});

// ── the quarantine ledger and its repo-wide pre-push check (#49) ─────────────────

const sha256 = (value) => createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex');
const QUARANTINE_SCRIPT_BODY = '#!/usr/bin/env bash\nset -e\nnode tools/eslint/check-quarantine-ledger.mjs\n';

/** A real Git repository (git init, not a bare `.git/HEAD`): the ledger check reads Git. */
function realRepo(name, files = {}) {
	const dir = path.join(TMP, name);
	fs.mkdirSync(dir, { recursive: true });
	const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
	git('init', '-q', '-b', 'main');
	git('config', 'user.email', 't@example.test');
	git('config', 'user.name', 't');
	for (const [relative, textContent] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
		fs.writeFileSync(path.join(dir, relative), textContent);
	}
	git('add', '-A');
	git('commit', '--allow-empty', '-qm', 'base');
	return dir;
}

/** lefthook with the test runner's own Node first on PATH, so the installed script's `node` runs. */
const runPrePush = (dir) =>
	spawnSync(LEFTHOOK, ['run', 'pre-push'], {
		cwd: dir,
		encoding: 'utf8',
		shell: process.platform === 'win32',
		env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` },
	});

test('vitest installs the repo-wide ledger validator without touching the ledger or the policy', async () => {
	const ledger = '{\n\t"version": 1,\n\t"entries": []\n}\n';
	const policy = '{"version":1,"enrollments":[]}\n';
	const dir = consumer('quarantine-install', { 'test-quarantine.json': ledger, 'lint-kit.policy.json': policy });
	await init(dir, '--sets', 'vitest');
	assert.ok(fs.existsSync(path.join(dir, 'tools/eslint/quarantine-ledger.mjs')));
	assert.ok(fs.existsSync(path.join(dir, 'tools/eslint/check-quarantine-ledger.mjs')));
	// The installer never edits the ledger or the enrollment file.
	assert.equal(text(dir, 'test-quarantine.json'), ledger);
	assert.equal(text(dir, 'lint-kit.policy.json'), policy);
	// The validator is a non-file-filtered pre-push script, not a changed-file command.
	assert.deepEqual(hooks(dir)['pre-push'].scripts['test-quarantine.sh'], { runner: 'bash' });
	assert.equal(text(dir, '.lefthook/pre-push/test-quarantine.sh'), QUARANTINE_SCRIPT_BODY);
	// A repeat install refreshes the copied tools and keeps the hook.
	const before = text(dir, 'lefthook.yml');
	await init(dir, '--sets', 'vitest');
	assert.equal(text(dir, 'lefthook.yml'), before);
});

test('the install names the manual opaque enrollment instead of approving the ledger', async () => {
	const dir = consumer('quarantine-snippet');
	const said = [];
	const log = console.log;
	console.log = (...args) => said.push(args.join(' '));
	try {
		assert.equal(await main(['init', '--no-install', '--cwd', dir, '--sets', 'vitest']), 0);
	} finally {
		console.log = log;
	}
	const output = said.join('\n');
	assert.match(output, /test-quarantine\.json: not enrolled by this installer/);
	assert.match(output, /"id": "test-quarantine", "source": "test-quarantine\.json", "format": "opaque"/);
	assert.match(output, /enroll tools\/eslint\/vitest\.mjs and tools\/eslint\/quarantine-ledger\.mjs opaque/);
	assert.equal(fs.existsSync(path.join(dir, 'lint-kit.policy.json')), false, 'no automatic enrollment');
});

test('without lefthook the install prints a complete body, not a runner for a missing file', async () => {
	const dir = project('quarantine-no-lefthook', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', vitest: '4.1.11' } }),
		'pnpm-lock.yaml': '',
		'src/app.ts': 'export const a = 1;\n',
	});
	const said = [];
	const log = console.log;
	console.log = (...args) => said.push(args.join(' '));
	try {
		assert.equal(await main(['init', '--no-install', '--cwd', dir, '--sets', 'vitest']), 0);
	} finally {
		console.log = log;
	}
	const output = said.join('\n');
	assert.match(output, /no lefthook\.yml/);
	assert.match(output, /node tools\/eslint\/check-quarantine-ledger\.mjs/);
	assert.equal(fs.existsSync(path.join(dir, '.lefthook')), false, 'nothing references a file that was not written');
});

test('the real pre-push validator runs with no changed file and fails an expired entry', async () => {
	const dir = realRepo('quarantine-push', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', vitest: '4.1.11' } }),
		'pnpm-lock.yaml': '',
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'src/app.ts': 'export const a = 1;\n',
	});
	await init(dir, '--sets', 'vitest');
	const ledger = path.join(dir, 'test-quarantine.json');
	const entry = (expires) => ({
		file: 'test/gone.test.js',
		line: 1,
		column: 1,
		sourceCallSha256: '0'.repeat(64),
		reason: 'r',
		owner: 'o',
		expires,
	});
	// A docs-only change, not a test: the script is not file-filtered, so it still runs.
	fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'docs/readme.md'), '# docs\n');
	fs.writeFileSync(ledger, `${JSON.stringify({ version: 1, entries: [entry('2000-01-01')] })}\n`);
	const failing = runPrePush(dir);
	assert.notEqual(failing.status, 0, `${failing.stdout}\n${failing.stderr}`);
	assert.match(`${failing.stdout}\n${failing.stderr}`, /expired/);
	// The same no-test change passes once the entry is live.
	fs.writeFileSync(ledger, `${JSON.stringify({ version: 1, entries: [entry('2099-01-01')] })}\n`);
	const passing = runPrePush(dir);
	assert.equal(passing.status, 0, `${passing.stdout}\n${passing.stderr}`);
});

test('the real pre-push validator rejects a malformed ledger even when the push deletes the only test', async () => {
	const dir = realRepo('quarantine-delete', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', vitest: '4.1.11' } }),
		'pnpm-lock.yaml': '',
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'test/only.test.js': "import { test } from 'vitest';\ntest('x', () => {});\n",
	});
	await init(dir, '--sets', 'vitest');
	const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
	git('rm', '-q', 'test/only.test.js');
	git('commit', '-qm', 'delete the only test');
	fs.writeFileSync(path.join(dir, 'test-quarantine.json'), '{ not json\n');
	const result = runPrePush(dir);
	assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
	assert.match(`${result.stdout}\n${result.stderr}`, /invalid \(not-json\)/);
});

test('the installed ESLint reports an outside-src skip, and a live ledger entry excuses it', async () => {
	const dir = realRepo('installed-skip', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', vitest: '4.1.11' } }),
		'pnpm-lock.yaml': '',
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'src/app.ts': 'export const a = 1;\n',
	});
	await init(dir, '--sets', 'vitest');
	fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'test/outside.test.js'), "import { test } from 'vitest';\ntest.skip('outside', () => {});\n");
	assert.deepEqual(installedMessages(dir, 'test/outside.test.js'), [['vitest/no-disabled-tests', 2]]);
	// The legitimate forms stay quiet, so the rule separates conditional skips, TODOs and fails.
	fs.writeFileSync(
		path.join(dir, 'test/outside.test.js'),
		"import { test } from 'vitest';\ntest.todo('later');\ntest.fails('expected', () => {});\ntest.skipIf(true)('win', () => {});\n",
	);
	assert.deepEqual(installedMessages(dir, 'test/outside.test.js'), []);
	// A live entry at the call's identity excuses it; the identity is repo-relative.
	fs.writeFileSync(path.join(dir, 'test/outside.test.js'), "import { test } from 'vitest';\ntest.skip('outside', () => {});\n");
	fs.writeFileSync(
		path.join(dir, 'test-quarantine.json'),
		`${JSON.stringify({
			version: 1,
			entries: [
				{
					file: 'test/outside.test.js',
					line: 2,
					column: 1,
					sourceCallSha256: sha256("test.skip('outside', () => {})"),
					reason: 'flaky upstream',
					owner: '@team',
					expires: '2099-01-01',
				},
			],
		})}\n`,
	);
	assert.deepEqual(installedMessages(dir, 'test/outside.test.js'), []);
});

test('an orphan pre-push script of the same name is preserved, not overwritten or claimed', async () => {
	const orphan = '#!/usr/bin/env bash\necho mine\n';
	const dir = consumer('quarantine-orphan', { '.lefthook/pre-push/test-quarantine.sh': orphan });
	const said = [];
	const log = console.log;
	console.log = (...args) => said.push(args.join(' '));
	try {
		assert.equal(await main(['init', '--no-install', '--cwd', dir, '--sets', 'vitest']), 0);
	} finally {
		console.log = log;
	}
	assert.equal(text(dir, '.lefthook/pre-push/test-quarantine.sh'), orphan);
	assert.equal(hooks(dir)['pre-push']?.scripts?.['test-quarantine.sh'], undefined);
	assert.match(said.join('\n'), /a pre-push step for test-quarantine\.json is left as it is/);
});

test('a repository already running the validator keeps its own command', async () => {
	const own = 'pre-push:\n  commands:\n    ledger:\n      run: node tools/eslint/check-quarantine-ledger.mjs\n';
	const dir = consumer('quarantine-own-command', { 'lefthook.yml': own });
	await init(dir, '--sets', 'vitest');
	assert.equal(hooks(dir)['pre-push'].commands.ledger.run, 'node tools/eslint/check-quarantine-ledger.mjs');
	assert.equal(hooks(dir)['pre-push']?.scripts?.['test-quarantine.sh'], undefined);
});
