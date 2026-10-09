import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { parse } from 'yaml';
import { main, patchEslintConfig, patchFlake8, patchOxlint, patchRuff, shellArgs } from '../bin/lint-kit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Inside the repo, so the generated configs resolve eslint and its plugins from its node_modules.
const TMP = path.join(ROOT, 'test', '.tmp');
fs.rmSync(TMP, { recursive: true, force: true });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** A repository (it has a .git) made of `files`. */
function project(name, files) {
	const dir = path.join(TMP, name);
	for (const [rel, text] of Object.entries({ '.git/HEAD': 'ref: refs/heads/main\n', ...files })) {
		fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		fs.writeFileSync(path.join(dir, rel), text);
	}
	return dir;
}

const quiet = async (argv) => {	const log = console.log;
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
/** lefthook's binary: the .CMD shim on Windows, where execFileSync needs a shell to run it. */
const LEFTHOOK = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'lefthook.CMD' : 'lefthook');

async function ruleIds(dir, file) {
	const [result] = await new ESLint({ cwd: dir }).lintFiles([path.join(dir, file)]);
	assert.equal(result.messages.filter((m) => m.fatal).length, 0, JSON.stringify(result.messages));
	return result.messages.map((m) => m.ruleId).sort();
}

/** Every file under `dir` but .git, relative. */
function files(dir, base = dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? (e.name === '.git' ? [] : files(path.join(dir, e.name), base)) : [path.relative(base, path.join(dir, e.name))],
	);
}

test('a Svelte project without an ESLint config gets one, and the rules copied into tools/eslint', async () => {
	const dir = project('svelte-new', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', tailwindcss: '^4' } }),
		'src/routes/+page.svelte':
			"<script lang=\"ts\">import { writable } from 'svelte/store';</script>\n<div class=\"h-screen\">Hello</div>\n",
	});
	assert.equal(await init(dir, '--yes'), 0);
	const own = text(dir, 'eslint.rules.js');
	assert.match(own, /import svelteSkills from '\.\/tools\/eslint\/svelte-skills\.mjs';/);
	assert.match(own, /tailwindPatterns\.config/);
	// no paraglide dependency, so not chosen by default, and not copied
	assert.doesNotMatch(own, /untranslatedText/);
	assert.ok(fs.existsSync(path.join(dir, 'tools/eslint/svelte-skills.md')));
	assert.equal(fs.existsSync(path.join(dir, 'tools/eslint/untranslated-text.mjs')), false);
	assert.deepEqual(await ruleIds(dir, 'src/routes/+page.svelte'), [
		'svelte-skills/no-legacy-syntax',
		'tailwind-patterns/viewport-vh',
	]);
});

test('an existing config spreads the rules last, a re-run changes nothing, and sets are only added', async () => {
	const config = "export default [{ rules: { 'no-var': 'error' } }];\n";
	const dir = project('svelte-existing', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', '@inlang/paraglide-js': '^2' } }),
		'eslint.config.js': `import svelte from 'eslint-plugin-svelte';\nimport tsParser from '@typescript-eslint/parser';\n\nexport default [\n\t...svelte.configs.recommended,\n\t{ files: ['**/*.svelte'], languageOptions: { parserOptions: { parser: tsParser } } },\n\t{ files: ['**/*.ts'], languageOptions: { parser: tsParser } },\n\t{ rules: { 'no-var': 'error' } },\n];\n`,
		'src/lib/x.ts': "var a = 1;\nimport { page } from '$app/stores';\n",
	});
	await init(dir, '--sets', 'svelte-skills');
	const once = text(dir, 'eslint.config.js');
	assert.deepEqual(await ruleIds(dir, 'src/lib/x.ts'), ['no-var', 'svelte-skills/no-legacy-syntax']);
	await init(dir, '--sets', 'svelte-skills');
	assert.equal(text(dir, 'eslint.config.js'), once);
	assert.equal(fs.existsSync(path.join(dir, 'eslint.rules.js.bak')), false);
	// another set: eslint.rules.js is rewritten and the old one kept
	await init(dir, '--sets', 'untranslated-text');
	assert.ok(fs.existsSync(path.join(dir, 'eslint.rules.js.bak')));
	assert.match(text(dir, 'eslint.rules.js'), /svelteSkills[\s\S]*untranslatedText/);
	assert.equal(patchEslintConfig(config).match(/toolRules/g).length, 2);
});

test('a CommonJS config is patched in place and ESLint loads the rules through it', async () => {
	const dir = project('svelte-cjs', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'eslint.config.cjs': `const svelte = require('eslint-plugin-svelte');\nconst tsParser = require('@typescript-eslint/parser');\n\nmodule.exports = [\n\t...(svelte.default ?? svelte).configs.recommended,\n\t{ files: ['**/*.ts'], languageOptions: { parser: tsParser } },\n\t{ rules: { 'no-var': 'error' } },\n];\n`,
		'src/lib/x.ts': "var a = 1;\nimport { page } from '$app/stores';\n",
	});
	await init(dir, '--sets', 'svelte-skills');
	assert.equal(fs.existsSync(path.join(dir, 'eslint.config.js')), false);
	assert.deepEqual(await ruleIds(dir, 'src/lib/x.ts'), ['no-var', 'svelte-skills/no-legacy-syntax']);
	const once = text(dir, 'eslint.config.cjs');
	await init(dir, '--sets', 'svelte-skills');
	assert.equal(text(dir, 'eslint.config.cjs'), once);
});

test('a TypeScript config is patched in place, not shadowed by a new eslint.config.js', async () => {
	const dir = project('svelte-ts', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'eslint.config.ts': "import { defineConfig } from 'eslint/config';\n\nexport default defineConfig([{ rules: { 'no-var': 'error' } }]);\n",
	});
	await init(dir, '--sets', 'svelte-skills');
	assert.equal(fs.existsSync(path.join(dir, 'eslint.config.js')), false);
	assert.equal(
		text(dir, 'eslint.config.ts'),
		"import toolRules from './eslint.rules.js';\nimport { defineConfig } from 'eslint/config';\n\nconst config = defineConfig([{ rules: { 'no-var': 'error' } }]);\n\nexport default [...[config].flat(), ...toolRules];\n",
	);
});

test('a FastAPI backend in a subfolder: FAP as a flake8 local plugin, lefthook steps, and the real tools', async () => {
	const files = {
		'lefthook.yml': '# hooks\npre-commit:\n  parallel: true\n  commands:\n    ruff:\n      run: ruff check\n',
		'backend/pyproject.toml': '[project]\nname = "api"\ndependencies = ["fastapi>=0.115", "weasyprint"]\n',
		'backend/api/main.py':
			'import time\nfrom fastapi import FastAPI\n\napp = FastAPI()\n\n\n@app.get("/")\nasync def home() -> dict:\n    time.sleep(1)\n    return {}\n',
	};
	const dir = project('fastapi', files);
	const backend = path.join(dir, 'backend');
	await init(dir, '--sets', 'fastapi');
	const pyproject = text(backend, 'pyproject.toml');
	assert.match(pyproject, /\[tool\.fastapi-rules\]\napp = "api"/);
	assert.match(pyproject, /lists what is missing:\n# {3}uv run python \.\.\/tools\/python\/fastapi_rules\.py check-deps\n/);
	assert.match(pyproject, /\[tool\.ruff\.lint\]\n# FAST, ASYNC: .*\nextend-select = \["FAST", "ASYNC"\]\n$/);
	assert.equal(
		text(backend, '.flake8'),
		'[flake8]\nselect = FAP\nmax-line-length = 100\n\n[flake8:local-plugins]\nextension =\n    FAP = fastapi_rules:Plugin\npaths =\n    ../tools/python\n',
	);
	assert.ok(fs.existsSync(path.join(dir, 'tools/python/fastapi_rules.py')));
	const steps = hooks(dir)['pre-commit'].commands;
	// ruff already runs, so there is no ruff step
	assert.deepEqual(Object.keys(steps), ['ruff', 'fastapi-rules', 'fastapi-deps']);
	assert.deepEqual(steps['fastapi-rules'], { glob: 'backend/api/*.py', root: 'backend/', run: 'uv run flake8 {staged_files}' });
	assert.equal(steps['fastapi-deps'].run, 'uv run python ../tools/python/fastapi_rules.py check-deps');
	assert.match(text(dir, 'lefthook.yml'), /^# hooks/);

	// idempotent
	const snapshot = ['backend/pyproject.toml', 'backend/.flake8', 'lefthook.yml'].map((f) => text(dir, f));
	await init(dir, '--sets', 'fastapi');
	assert.deepEqual(['backend/pyproject.toml', 'backend/.flake8', 'lefthook.yml'].map((f) => text(dir, f)), snapshot);

	// the real tools, from the python dev environment
	const bin = path.join(ROOT, 'python', '.venv', process.platform === 'win32' ? 'Scripts' : 'bin');
	if (!fs.existsSync(bin)) return; // `uv sync` in python/ first
	const out = (cmd, args) => {
		try {
			return execFileSync(path.join(bin, cmd), args, { cwd: backend, encoding: 'utf8' });
		} catch (e) {
			return e.stdout;
		}
	};
	assert.match(out('flake8', ['api']), /FAP001 `time\.sleep\(\)` blocks the event loop/);
	assert.match(out('python', ['../tools/python/fastapi_rules.py', 'check-deps']), /classify weasyprint/);
	assert.match(out('ruff', ['check', '--no-cache', 'api']), /ASYNC251/);
});

test('.flake8 with its own local plugins gets FAP added to each list', () => {
	const own = '[flake8]\nselect = E,X\n\n[flake8:local-plugins]\nextension =\n    X = mine:Plugin\npaths =\n    ./lint\n';
	assert.equal(
		patchFlake8(own, '../tools/python'),
		'[flake8]\nextend-select = FAP\nselect = E,X\n\n[flake8:local-plugins]\nextension =\n    FAP = fastapi_rules:Plugin\n    X = mine:Plugin\npaths =\n    ../tools/python\n    ./lint\n',
	);
	assert.equal(patchFlake8(patchFlake8(own, 't'), 't'), patchFlake8(own, 't'));
});

test('ruff rules join the config ruff reads, only what is missing', () => {
	const own = '[tool.ruff.lint]\nselect = ["E", "F"]\nextend-select = [\n  "B",\n  "ASYNC",\n]\n\n[tool.other]\nx = 1\n';
	const patched = patchRuff(own, 'tool.ruff.lint');
	assert.match(patched, /# FAST, ASYNC: .*\nextend-select = \[\n {2}"B",\n {2}"ASYNC", "FAST",\n\]/);
	assert.equal(patchRuff(patched, 'tool.ruff.lint'), patched);
	const table = '[lint]\nselect = ["E"]\n';
	assert.match(patchRuff(table, 'lint'), /^\[lint\]\n# FAST, ASYNC: .*\nextend-select = \["FAST", "ASYNC"\]\nselect = \["E"\]\n$/);
	const all = '[lint]\nextend-select = ["FAST", "ASYNC"]\n';
	assert.equal(patchRuff(all, 'lint'), all);
	// what select already has counts too
	const selected = '[lint]\nselect = [\n  "E",\n  "FAST",  # FastAPI\n  "ASYNC",\n]\n';
	assert.equal(patchRuff(selected, 'lint'), selected);
	assert.match(patchRuff('[lint]\nselect = ["FAST"]\n', 'lint'), /^extend-select = \["ASYNC"\]$/m);
});

test('files with CRLF line endings (a Windows checkout) keep them', async () => {
	const crlf = (s) => s.replace(/\n/g, '\r\n');
	const dir = project('crlf', {
		'lefthook.yml': crlf('pre-commit:\n  commands:\n    format:\n      run: pnpm format\n'),
		'backend/pyproject.toml': crlf('[project]\nname = "api"\ndependencies = ["fastapi"]\n\n[tool.ruff.lint]\nselect = ["E"]\n'),
		'backend/.flake8': crlf('[flake8]\nmax-line-length = 100\n'),
		'backend/app/main.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
	});
	await init(dir, '--sets', 'fastapi');
	for (const f of ['lefthook.yml', 'backend/pyproject.toml', 'backend/.flake8']) {
		const raw = fs.readFileSync(path.join(dir, f), 'utf8');
		assert.doesNotMatch(raw, /[^\r]\n/, `${f} has a bare LF`);
	}
	assert.match(text(dir, 'backend/pyproject.toml'), /^\[tool\.ruff\.lint\]\r\n# FAST, ASYNC: .*\r\nextend-select = \["FAST", "ASYNC"\]\r\nselect = \["E"\]/m);
});

test('a ruff.toml at the repository root gets the rules, not a pyproject.toml that would shadow it', async () => {
	const dir = project('ruff-root', {
		'ruff.toml': 'line-length = 100\n\n[lint]\nselect = ["E"]\n',
		'lefthook.yml': 'pre-commit:\n  commands:\n    types:\n      run: pnpm check\n',
		'pnpm-lock.yaml': '',
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'backend/pyproject.toml': '[project]\nname = "api"\ndependencies = ["fastapi"]\n',
		'backend/api/main.py': 'from fastapi import FastAPI\n\napp = FastAPI()\n',
	});
	await init(dir, '--sets', 'svelte-skills,fastapi');
	assert.match(text(dir, 'ruff.toml'), /\[lint\]\n# FAST, ASYNC: /);
	assert.doesNotMatch(text(dir, 'backend/pyproject.toml'), /tool\.ruff/);
	const steps = hooks(dir)['pre-commit'].commands;
	assert.deepEqual(steps.eslint, { glob: 'src/*.{js,ts,svelte}', run: 'pnpm exec eslint {staged_files}' });
	assert.deepEqual(steps.ruff, { glob: 'backend/*.py', root: 'backend/', run: 'uv run ruff check {staged_files}' });
});

test('typecheck: svelte-check --tsgo and pyright before each push', async () => {
	const dir = project('typecheck', {
		'lefthook.yml': 'pre-commit:\n  commands:\n    format:\n      run: pnpm format\n',
		'web/pnpm-lock.yaml': '',
		'web/package.json': JSON.stringify({ devDependencies: { svelte: '^5', '@sveltejs/kit': '^2' } }),
		'api/pyproject.toml': '[project]\nname = "api"\ndependencies = ["fastapi"]\n',
	});
	await init(dir, '--yes', '--base', 'dev'); // on by default: lefthook, a Svelte app
	const { 'svelte-check': svelteCheck, pyright } = hooks(dir)['pre-push'].commands;
	assert.deepEqual(svelteCheck, {
		glob: 'web/*.{svelte,ts,js}',
		root: 'web/',
		run: 'pnpm exec svelte-kit sync && pnpm exec svelte-check --tsgo',
	});
	assert.deepEqual(pyright, { glob: 'api/*.py', root: 'api/', run: 'uv run pyright' });
	const once = text(dir, 'lefthook.yml');
	await init(dir, '--yes', '--base', 'dev');
	assert.equal(text(dir, 'lefthook.yml'), once);
});

test('structure: fallow and structure_check.py before each push, against the branch lefthook diffs with', async () => {
	const dir = project('structure', {
		'lefthook.yml': 'pre-push:\n  files: git diff --name-only origin/dev...HEAD\n  commands:\n    test:\n      run: pnpm test\n',
		'pnpm-lock.yaml': '',
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', '@inlang/paraglide-js': '^2' } }),
		'backend/pyproject.toml': '[project]\nname = "api"\ndependencies = ["fastapi"]\n',
		'backend/app/main.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
	});
	await init(dir, '--sets', 'structure');
	const push = hooks(dir)['pre-push'];
	// a script, not a command: lefthook drops deleted files from a command's file list, so a
	// deletion-only push would skip fallow and never see the dead code it orphaned (#21)
	assert.deepEqual(push.scripts['fallow.sh'], {
		runner: 'bash',
		env: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'worktree.useRelativePaths', GIT_CONFIG_VALUE_0: 'false' },
	});
	assert.equal(text(dir, '.lefthook/pre-push/fallow.sh'), '#!/usr/bin/env bash\nset -e\npnpm exec fallow audit --base origin/dev\n');
	assert.deepEqual(push.commands['python-structure'], {
		glob: 'backend/*.py',
		root: 'backend/',
		run: 'uv run python ../tools/python/structure_check.py --base origin/dev app',
	});
	assert.ok(fs.existsSync(path.join(dir, 'tools/python/structure_check.py')));
	const fallowrc = text(dir, '.fallowrc.json');
	assert.match(fallowrc, /"ignorePatterns": \["backend\/\*\*", "tools\/\*\*", "\*\*\/paraglide\/\*\*", "\*\*\/\.svelte-check\/\*\*"\]/);
	assert.match(fallowrc, /"maxCrap": 100000/);
	assert.equal(JSON.parse(text(dir, 'package.json')).scripts['structure:brief'], 'fallow review --brief --base origin/dev');
	const once = text(dir, 'lefthook.yml');
	const scriptOnce = text(dir, '.lefthook/pre-push/fallow.sh');
	await init(dir, '--sets', 'structure');
	assert.equal(text(dir, 'lefthook.yml'), once);
	assert.equal(text(dir, '.lefthook/pre-push/fallow.sh'), scriptOnce);
	assert.equal(text(dir, '.fallowrc.json'), fallowrc);
});

test('structure: --base names the branch, and a fallow config the project has is kept', async () => {
	const own = '{ "rules": { "unused-files": "warn" } }\n';
	const dir = project('structure-base', {
		'lefthook.yml': 'pre-commit:\n  commands:\n    format:\n      run: pnpm format\n',
		'package.json': '{\n  "name": "web",\n  "devDependencies": { "typescript": "^5" }\n}\n',
		'package-lock.json': '',
		'.fallowrc.json': own,
	});
	await init(dir, '--sets', 'structure', '--base', 'qa');
	const push = hooks(dir)['pre-push'];
	assert.equal(push.scripts['fallow.sh'].runner, 'bash');
	assert.match(text(dir, '.lefthook/pre-push/fallow.sh'), /npx fallow audit --base origin\/qa/);
	assert.equal(push.commands?.['python-structure'], undefined); // no Python here
	assert.equal(text(dir, '.fallowrc.json'), own);
	assert.match(text(dir, 'package.json'), /^ {2}"scripts": \{\n {4}"structure:brief": "fallow review --brief --base origin\/qa"/m);
});

test('structure: a fallow step the project has, and long lines left as written', async () => {
	const long = `      run: ${'echo checking every file the branch touched && '.repeat(3)}true\n`;
	const lefthook = `pre-push:\n  commands:\n    fallow-audit:\n      run: pnpm exec fallow audit --base origin/dev\n    long:\n${long}`;
	const dir = project('structure-own-fallow', {
		'lefthook.yml': lefthook,
		'package.json': JSON.stringify({ devDependencies: { typescript: '^5' } }),
		'pnpm-lock.yaml': '',
	});
	await init(dir, '--sets', 'structure', '--base', 'dev');
	assert.equal(text(dir, 'lefthook.yml'), lefthook);
	// the repository's own fallow command is the policy, so no script is written beside it
	assert.equal(fs.existsSync(path.join(dir, '.lefthook/pre-push/fallow.sh')), false);
});

test('a deletion-only push reaches the fallow step (real lefthook, #21)', async () => {
	// lefthook drops a deleted path from every command's file list, and intersects a `files`
	// command with the push's own set, which a deletion-only push leaves empty. A command is
	// skipped however it is wired; a script is not filtered, so the dead code the deletion
	// orphaned is still checked. `fallow` itself is not installed here, so a marker stands in
	// for it: what the push proves is that the step is reached at all.
	const origin = path.join(TMP, 'lh-origin.git');
	const work = path.join(TMP, 'lh-work');
	execFileSync('git', ['init', '--bare', '-q', origin]);
	execFileSync('git', ['clone', '-q', origin, work]);
	const git = (...args) => execFileSync('git', args, { cwd: work, stdio: 'ignore' });
	git('config', 'user.email', 't@example.test');
	git('config', 'user.name', 't');
	fs.writeFileSync(path.join(work, 'pnpm-lock.yaml'), '');
	fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ devDependencies: { typescript: '^5' } }));
	fs.writeFileSync(path.join(work, 'lefthook.yml'), 'pre-push:\n  commands:\n    placeholder:\n      run: true\n');
	fs.mkdirSync(path.join(work, 'src'));
	fs.writeFileSync(path.join(work, 'src/app.ts'), 'export const x = 1;\n');
	await init(work, '--sets', 'structure', '--base', 'main');
	assert.equal(hooks(work)['pre-push'].scripts['fallow.sh'].runner, 'bash');
	fs.writeFileSync(path.join(work, '.lefthook/pre-push/fallow.sh'), '#!/usr/bin/env bash\nset -e\ntouch fallow-ran\n');
	git('add', '-A');
	git('commit', '-qm', 'base');
	git('branch', '-M', 'main');
	git('push', '-q', '-u', 'origin', 'main');
	git('checkout', '-qb', 'feature');
	git('push', '-q', '-u', 'origin', 'feature');
	execFileSync(LEFTHOOK, ['install'], { cwd: work, stdio: 'ignore', shell: process.platform === 'win32' });
	git('rm', '-q', 'src/app.ts');
	git('commit', '-qm', 'delete the only entry');
	git('push', 'origin', 'feature');
	assert.ok(fs.existsSync(path.join(work, 'fallow-ran')), 'the fallow script did not run on a deletion-only push');
});

test('a monorepo: each workspace member and Python project gets its own steps, tools/ is shared', async () => {
	const dir = project('monorepo', {
		'lefthook.yml': 'glob_matcher: doublestar\n',
		'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'services/api'\n",
		'pnpm-lock.yaml': '',
		'package.json': JSON.stringify({ devDependencies: { typescript: '^5' } }),
		'apps/admin/package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'apps/shop/package.json': JSON.stringify({ devDependencies: { svelte: '^5', tailwindcss: '^4' } }),
		// not a workspace member: a scratch folder
		'scratch/probe/package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'services/api/pyproject.toml': '[project]\nname = "api"\ndependencies = ["fastapi"]\n',
		'services/api/app/main.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
	});
	await init(dir, '--sets', 'svelte-skills,tailwind-patterns,fastapi,typecheck,structure', '--base', 'dev');
	assert.match(text(dir, 'apps/admin/eslint.rules.js'), /from '\.\.\/\.\.\/tools\/eslint\/svelte-skills\.mjs'/);
	assert.doesNotMatch(text(dir, 'apps/admin/eslint.rules.js'), /tailwind/);
	assert.match(text(dir, 'apps/shop/eslint.rules.js'), /tailwind-patterns\.mjs/);
	assert.equal(fs.existsSync(path.join(dir, 'scratch/probe/eslint.rules.js')), false);
	assert.match(text(dir, 'services/api/.flake8'), /paths =\n {4}\.\.\/\.\.\/tools\/python\n/);
	const { 'pre-commit': commit, 'pre-push': push } = hooks(dir);
	const globs = (steps) => Object.fromEntries(Object.entries(steps.commands).map(([k, v]) => [k, v.glob]));
	assert.deepEqual(globs(commit), {
		'eslint-admin': 'apps/admin/src/**/*.{js,ts,svelte}',
		'eslint-shop': 'apps/shop/src/**/*.{js,ts,svelte}',
		'fastapi-rules': 'services/api/app/**/*.py',
		'fastapi-deps': 'services/api/pyproject.toml',
		ruff: 'services/api/**/*.py',
	});
	assert.deepEqual(globs(push), {
		'svelte-check-admin': 'apps/admin/**/*.{svelte,ts,js}',
		'svelte-check-shop': 'apps/shop/**/*.{svelte,ts,js}',
		pyright: 'services/api/**/*.py',
		'python-structure': 'services/api/**/*.py',
	});
	assert.equal(push.scripts['fallow.sh'].runner, 'bash');
	assert.match(text(dir, '.lefthook/pre-push/fallow.sh'), /pnpm exec fallow audit --base origin\/dev/);
	assert.equal(push.commands['python-structure'].run, 'uv run python ../../tools/python/structure_check.py --base origin/dev app');
	assert.match(text(dir, '.fallowrc.json'), /"ignorePatterns": \["services\/api\/\*\*", "tools\/\*\*", "\*\*\/\.svelte-check\/\*\*"\]/);
});

test('after every set, nothing in the repository names the installer', async () => {
	const dir = project('invisible', {
		'lefthook.yml': 'pre-commit:\n  commands: {}\n',
		'pnpm-lock.yaml': '',
		'package.json': JSON.stringify({
			devDependencies: { svelte: '^5', tailwindcss: '^4', '@inlang/paraglide-js': '^2', '@sveltejs/kit': '^2' },
		}),
		'backend/pyproject.toml': '[project]\nname = "api"\ndependencies = ["fastapi"]\n',
		'backend/app/main.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
	});
	await init(dir, '--yes', '--base', 'dev');
	const written = files(dir);
	assert.ok(written.length > 15, written.join(', '));
	for (const file of written) assert.doesNotMatch(text(dir, file), /lint-kit|lint_kit|lintkit/i, file);
	// `commands: {}` becomes a block mapping, not one line of flow style
	assert.match(text(dir, 'lefthook.yml'), /^pre-commit:\n {2}commands:\n {4}eslint:\n/);
});

test('a step that already runs ESLint is left alone', async () => {
	const lefthook = 'pre-commit:\n  commands:\n    lint:\n      run: npx eslint --fix {staged_files}\n';
	const dir = project('eslint-hooked', {
		'lefthook.yml': lefthook,
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
	});
	await init(dir, '--sets', 'svelte-skills');
	assert.equal(text(dir, 'lefthook.yml'), lefthook);
});

test('an oxlint project gets the plugin in tools/oxlint and its config patched in place', async () => {
	const dir = project('oxlint', {
		'package.json': JSON.stringify({ devDependencies: { oxlint: '1.81.0' } }),
		'.oxlintrc.json': '{\n\t"rules": {\n\t\t"no-console": "error" // keep this note\n\t}\n}\n',
	});
	assert.equal(await init(dir, '--sets', 'slop-patterns'), 0);
	assert.ok(fs.existsSync(path.join(dir, 'tools/oxlint/slop-patterns/index.ts')));
	assert.ok(fs.existsSync(path.join(dir, 'tools/oxlint/slop-patterns/rules/no-trivial-wrapper.ts')));
	assert.ok(!fs.existsSync(path.join(dir, 'tools/oxlint/slop-patterns/fixtures')), 'fixtures are not copied');
	const config = text(dir, '.oxlintrc.json');
	assert.match(config, /"jsPlugins": \[\{ "name": "slop-patterns", "specifier": "\.\/tools\/oxlint\/slop-patterns\/index\.ts" \}\]/);
	assert.match(config, /"slop-patterns\/no-trivial-wrapper": "warn"/);
	// the file is hand-annotated: the existing rule keeps its comment, and the comma the new
	// entry needs goes before it rather than inside it
	assert.match(config, /"no-console": "error", \/\/ keep this note/);
	// the plugin is a tool that was copied in, so the repository must not lint it
	assert.match(config, /"ignorePatterns": \["tools\/oxlint\/slop-patterns\/\*\*"\]/);
});

test('an existing ignorePatterns keeps what it had and gains the plugin folder', async () => {
	const dir = project('oxlint-ignoring', {
		'package.json': JSON.stringify({ devDependencies: { oxlint: '1.81.0' } }),
		'.oxlintrc.json': '{\n\t"ignorePatterns": ["dist/", "build/"],\n\t"rules": {}\n}\n',
	});
	assert.equal(await init(dir, '--sets', 'slop-patterns'), 0);
	const config = text(dir, '.oxlintrc.json');
	assert.match(config, /"ignorePatterns": \["dist\/", "build\/", "tools\/oxlint\/slop-patterns\/\*\*"\]/);
});

test('a config that cannot name the plugin folder gains no ignore pattern', () => {
	// oxlint resolves these within the config file's directory and refuses `..`, so a project
	// whose config is not at the repository root would get a pattern it will not load at all.
	// Nothing is lost: oxlint lints the files it is pointed at, and that project is not pointed
	// at the root's tools/.
	const after = patchOxlint(TS_CONFIG, './../../tools/oxlint/slop-patterns/index.ts', true);
	assert.doesNotMatch(after, /ignorePatterns/);
	assert.match(after, /jsPlugins: \[\{ name: "slop-patterns", specifier: "\.\/\.\.\/\.\.\/tools\/oxlint\/slop-patterns\/index\.ts" \}\]/);
});

test('a plugin sitting beside the config gains no ignore pattern', () => {
	// The folder would be `.`, which would ignore the config's whole directory.
	assert.doesNotMatch(patchOxlint('{\n\t"rules": {}\n}\n', './x.ts'), /ignorePatterns/);
});

test('an oxlint.config.ts is patched in place, and no .oxlintrc.json appears beside it', async () => {
	const ts = [
		'import { defineConfig } from "oxlint";',
		'',
		'export default defineConfig({',
		'  rules: {',
		'    "no-console": "error", // keep this note',
		'  },',
		'});',
		'',
	].join('\n');
	const dir = project('oxlint-ts', {
		'package.json': JSON.stringify({ devDependencies: { oxlint: '1.81.0' } }),
		'oxlint.config.ts': ts,
	});
	assert.equal(await init(dir, '--sets', 'slop-patterns'), 0);
	// oxlint loads one config per directory, never a .oxlintrc.json beside a TypeScript one
	assert.ok(!fs.existsSync(path.join(dir, '.oxlintrc.json')), 'a JSON config must not appear');
	assert.ok(fs.existsSync(path.join(dir, 'tools/oxlint/slop-patterns/index.ts')), 'the plugin is still copied');
	const after = text(dir, 'oxlint.config.ts');
	assert.match(after, /jsPlugins: \[\{ name: "slop-patterns", specifier: "\.\/tools\/oxlint\/slop-patterns\/index\.ts" \}\]/);
	assert.match(after, /"slop-patterns\/no-trivial-wrapper": "warn"/);
	assert.match(after, /"no-console": "error", \/\/ keep this note/);
	// the object is found through defineConfig(, not the brace in `import { … }`
	assert.ok(after.startsWith('import { defineConfig } from "oxlint";\n'), 'the import is untouched');
});

test('an oxlint.config.mjs is patched in place, and no .oxlintrc.json appears beside it', async () => {
	const mjs = ['export default {', '  rules: {', '    "no-console": "error", // keep this note', '  },', '};', ''].join('\n');
	const dir = project('oxlint-mjs', {
		'package.json': JSON.stringify({ devDependencies: { oxlint: '1.81.0' } }),
		'oxlint.config.mjs': mjs,
	});
	assert.equal(await init(dir, '--sets', 'slop-patterns'), 0);
	// oxlint auto-discovers four names and this is not one of them, so a .oxlintrc.json written
	// beside it would sit in the repository unread: `oxlint -c ./oxlint.config.mjs` never looks
	// at it
	assert.ok(!fs.existsSync(path.join(dir, '.oxlintrc.json')), 'a JSON config must not appear');
	const after = text(dir, 'oxlint.config.mjs');
	assert.match(after, /jsPlugins: \[\{ name: "slop-patterns", specifier: "\.\/tools\/oxlint\/slop-patterns\/index\.ts" \}\]/);
	assert.match(after, /"slop-patterns\/no-trivial-wrapper": "warn"/);
	assert.match(after, /"no-console": "error", \/\/ keep this note/);
});

test('a CommonJS config is inserted into after module.exports =', () => {
	const before = ['module.exports = {', '\trules: {', '\t\t"no-console": "error"', '\t}', '};', ''].join('\n');
	assert.deepEqual(patchOxlint(before, './x.cjs', true).split('\n'), [
		'module.exports = {',
		'\tjsPlugins: [{ name: "slop-patterns", specifier: "./x.cjs" }],',
		'\trules: {',
		'\t\t"no-console": "error",',
		'\t\t"slop-patterns/no-trivial-wrapper": "warn" // TODO(slop-patterns-error): raise once the findings are cleaned up',
		'\t}',
		'};',
		'',
	]);
});

test('a second run over a config that already has the plugin says so and adds nothing', async () => {
	const dir = project('oxlint-again', {
		'package.json': JSON.stringify({ devDependencies: { oxlint: '1.81.0' } }),
		'.oxlintrc.json': '{\n\t"rules": {\n\t\t"no-console": "error"\n\t}\n}\n',
	});
	assert.equal(await init(dir, '--sets', 'slop-patterns'), 0);
	const first = text(dir, '.oxlintrc.json');
	const said = [];
	const log = console.log;
	console.log = (...args) => said.push(args.join(' '));
	try {
		assert.equal(await main(['init', '--no-install', '--sets', 'slop-patterns', '--cwd', dir]), 0);
	} finally {
		console.log = log;
	}
	assert.match(said.join('\n'), /already loads the slop-patterns plugin/);
	// "was left alone. Add …" is for a config whose shape was not recognized, and saying it about
	// a config that already has the plugin sends the reader looking for a problem that is not there
	assert.doesNotMatch(said.join('\n'), /was left alone/);
	assert.equal(text(dir, '.oxlintrc.json'), first, 'the config is untouched');
});

const TS_CONFIG = 'import { defineConfig } from "oxlint";\n\nexport default defineConfig({\n\trules: {\n\t\t"no-console": "error"\n\t}\n});\n';

test('a TypeScript config with neither key gains both, inside defineConfig(', () => {
	const after = patchOxlint(TS_CONFIG, './tools/oxlint/slop-patterns/index.ts', true);
	assert.deepEqual(after.split('\n'), [
		'import { defineConfig } from "oxlint";',
		'',
		'export default defineConfig({',
		'	ignorePatterns: ["tools/oxlint/slop-patterns/**"],',
		'\tjsPlugins: [{ name: "slop-patterns", specifier: "./tools/oxlint/slop-patterns/index.ts" }],',
		'\trules: {',
		'\t\t"no-console": "error",',
		'\t\t"slop-patterns/no-trivial-wrapper": "warn" // TODO(slop-patterns-error): raise once the findings are cleaned up',
		'\t}',
		'});',
		'',
	]);
	assert.equal(patchOxlint(after, './tools/oxlint/slop-patterns/index.ts', true), after, 'a re-run changes nothing');
});

test('an entry inside a one-line object carries no comment that would swallow the closing brace', () => {
	const after = patchOxlint('export default { rules: { "no-console": "error" } };\n', './x.ts', true);
	assert.doesNotMatch(after, /\/\//, 'nothing after the inserted entry may become a comment');
	assert.match(after, /"slop-patterns\/no-trivial-wrapper": "warn"\s*\}/);
	assert.match(after, /jsPlugins: \[\{ name: "slop-patterns", specifier: "\.\/x\.ts" \}\]/);
	assert.match(after, /"no-console": "error",/, 'the comma goes before the new entry, not after the old one');
});

test('an oxlint config that already lists plugins and rules gets one entry added to each', () => {
	const before = [
		'{',
		'  "ignorePatterns": ["dist/"],',
		'  "rules": {',
		'    "a/b": "error",',
		'    "c/d": "warn" // TODO(a): 65 findings',
		'  },',
		'  "jsPlugins": [',
		'    {',
		'      "name": "other",',
		'      "specifier": "./tools/oxlint/other/index.ts"',
		'    }',
		'  ]',
		'}',
		'',
	].join('\n');
	const after = patchOxlint(before, './tools/oxlint/slop-patterns/index.ts');
	assert.deepEqual(after.split('\n'), [
		'{',
		'  "ignorePatterns": ["dist/", "tools/oxlint/slop-patterns/**"],',
		'  "rules": {',
		'    "a/b": "error",',
		'    "c/d": "warn", // TODO(a): 65 findings',
		'    "slop-patterns/no-trivial-wrapper": "warn" // TODO(slop-patterns-error): raise once the findings are cleaned up',
		'  },',
		'  "jsPlugins": [',
		'    {',
		'      "name": "other",',
		'      "specifier": "./tools/oxlint/other/index.ts"',
		'    },',
		'    { "name": "slop-patterns", "specifier": "./tools/oxlint/slop-patterns/index.ts" }',
		'  ]',
		'}',
		'',
	]);
	// a re-run changes nothing
	assert.equal(patchOxlint(after, './tools/oxlint/slop-patterns/index.ts'), after);
});

test('an oxlint config with no jsPlugins or rules gains both', () => {
	const after = patchOxlint('{\n\t"ignorePatterns": ["dist/"]\n}\n', './tools/oxlint/slop-patterns/index.ts');
	assert.deepEqual(after.split('\n'), [
		// The rules object is created on one line, so its entry carries no `//` comment: anything
		// after it on that line would be swallowed, closing brace included (#17).
		'{',
		'\t"rules": { "slop-patterns/no-trivial-wrapper": "warn" },',
		'\t"jsPlugins": [{ "name": "slop-patterns", "specifier": "./tools/oxlint/slop-patterns/index.ts" }],',
		'	"ignorePatterns": ["dist/", "tools/oxlint/slop-patterns/**"]',
		'}',
		'',
	]);
});

test('an ESLint config with no recognizable export is left alone and the run goes on (#27)', async () => {
	const weird = 'const config = [];\nexport { config };\n';
	const dir = project('eslint-unrecognized', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'eslint.config.mjs': weird,
	});
	const said = [];
	const log = console.log;
	console.log = (...args) => said.push(args.join(' '));
	try {
		assert.equal(await main(['init', '--no-install', '--sets', 'svelte-skills', '--cwd', dir]), 0);
	} finally {
		console.log = log;
	}
	assert.equal(text(dir, 'eslint.config.mjs'), weird, 'the config is untouched');
	assert.match(said.join('\n'), /was left alone\. Spread the rules yourself/);
	// the abort this replaced would have skipped the rest of the install
	assert.ok(fs.existsSync(path.join(dir, 'tools/eslint/svelte-skills.mjs')));
	assert.ok(fs.existsSync(path.join(dir, 'eslint.rules.js')));
});

test('an oxlint config whose root object cannot be found is left alone (#27)', async () => {
	const weird = 'export default ["not", "an", "object"];\n';
	const dir = project('oxlint-unrecognized', {
		'package.json': JSON.stringify({ devDependencies: { oxlint: '1.81.0' } }),
		'oxlint.config.mjs': weird,
	});
	const said = [];
	const log = console.log;
	console.log = (...args) => said.push(args.join(' '));
	try {
		assert.equal(await main(['init', '--no-install', '--sets', 'slop-patterns', '--cwd', dir]), 0);
	} finally {
		console.log = log;
	}
	assert.equal(text(dir, 'oxlint.config.mjs'), weird, 'the config is untouched');
	assert.match(said.join('\n'), /was left alone\. Add/);
});

test('arguments with spaces survive the Windows shell', () => {
	const spec = 'some-package @ git+https://github.com/x/y@v1#subdirectory=python';
	assert.deepEqual(shellArgs(['add', '--dev', spec], true), ['add', '--dev', `"${spec}"`]);
	assert.deepEqual(shellArgs(['add', spec], false), ['add', spec]);
	// whitespace and cmd's metacharacters are quoted, plain flags and names are not
	assert.deepEqual(shellArgs(['install', '--save-dev', 'a b', 'x&y', 'a"b'], true), [
		'install',
		'--save-dev',
		'"a b"',
		'"x&y"',
		'"a""b"',
	]);
});
