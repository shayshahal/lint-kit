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
	assert.equal(text(dir, 'lefthook.yml'), own, "the repository's command is its policy");
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
