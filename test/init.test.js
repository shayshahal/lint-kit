import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { parse } from 'yaml';
import { main, patchEslintConfig, shellArgs } from '../bin/lint-kit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Inside the repo, so the generated configs resolve eslint and its plugins from its node_modules.
const TMP = path.join(ROOT, 'test', '.tmp');
fs.rmSync(TMP, { recursive: true, force: true });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function project(name, files) {
	const dir = path.join(TMP, name);
	for (const [rel, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		fs.writeFileSync(path.join(dir, rel), text);
	}
	// what `pnpm add github:shayshahal/lint-kit` would put there
	fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
	fs.symlinkSync(ROOT, path.join(dir, 'node_modules', 'lint-kit'), 'junction');
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

async function ruleIds(dir, file) {
	const [result] = await new ESLint({ cwd: dir }).lintFiles([path.join(dir, file)]);
	assert.equal(result.messages.filter((m) => m.fatal).length, 0, JSON.stringify(result.messages));
	return result.messages.map((m) => m.ruleId).sort();
}

test('a Svelte project without an ESLint config gets one, from what it depends on', async () => {
	const dir = project('svelte-new', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5', tailwindcss: '^4' } }),
		'src/routes/+page.svelte':
			"<script lang=\"ts\">import { writable } from 'svelte/store';</script>\n<div class=\"h-screen\">Hello</div>\n",
	});
	assert.equal(await quiet(['init', '--yes', '--no-install', '--cwd', dir]), 0);
	const own = fs.readFileSync(path.join(dir, 'eslint.lint-kit.js'), 'utf8');
	assert.match(own, /svelteSkills\.config\(\)/);
	assert.match(own, /tailwindPatterns\.config/);
	// no paraglide dependency, so not chosen by default
	assert.doesNotMatch(own, /untranslatedText/);
	assert.deepEqual(await ruleIds(dir, 'src/routes/+page.svelte'), [
		'svelte-skills/no-legacy-syntax',
		'tailwind-patterns/viewport-vh',
	]);
});

test('an existing config keeps its entries, spreads lint-kit last, and a re-run changes nothing', async () => {
	const config = "export default [{ rules: { 'no-var': 'error' } }];\n";
	const dir = project('svelte-existing', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'eslint.config.js': `import svelte from 'eslint-plugin-svelte';\nimport tsParser from '@typescript-eslint/parser';\n\nexport default [\n\t...svelte.configs.recommended,\n\t{ files: ['**/*.svelte'], languageOptions: { parserOptions: { parser: tsParser } } },\n\t{ files: ['**/*.ts'], languageOptions: { parser: tsParser } },\n\t{ rules: { 'no-var': 'error' } },\n];\n`,
		'src/lib/x.ts': "var a = 1;\nimport { page } from '$app/stores';\n",
	});
	await quiet(['init', '--sets', 'svelte-skills', '--no-install', '--cwd', dir]);
	const once = fs.readFileSync(path.join(dir, 'eslint.config.js'), 'utf8');
	assert.deepEqual(await ruleIds(dir, 'src/lib/x.ts'), ['no-var', 'svelte-skills/no-legacy-syntax']);
	await quiet(['init', '--sets', 'svelte-skills', '--no-install', '--cwd', dir]);
	assert.equal(fs.readFileSync(path.join(dir, 'eslint.config.js'), 'utf8'), once);
	assert.equal(fs.existsSync(path.join(dir, 'eslint.lint-kit.js.bak')), false);
	// choosing another set rewrites lint-kit's file and keeps the old one
	await quiet(['init', '--sets', 'svelte-skills,untranslated-text', '--no-install', '--cwd', dir]);
	assert.ok(fs.existsSync(path.join(dir, 'eslint.lint-kit.js.bak')));
	assert.equal(patchEslintConfig(config).match(/lintKit/g).length, 2);
	// every set turned off: lint-kit's list is empty and the config still loads
	await quiet(['init', '--sets', '', '--no-install', '--cwd', dir]);
	assert.doesNotMatch(fs.readFileSync(path.join(dir, 'eslint.lint-kit.js'), 'utf8'), /import/);
	// (a fresh process: this one has the previous eslint.lint-kit.js in its module cache)
	const eslint = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
	let report;
	try {
		report = execFileSync(process.execPath, [eslint, '--format', 'json', 'src/lib/x.ts'], { cwd: dir, encoding: 'utf8' });
	} catch (e) {
		report = e.stdout;
	}
	assert.deepEqual(JSON.parse(report)[0].messages.map((m) => m.ruleId), ['no-var']);
});

test('a set lint-kit installed stays on by default, so --yes does not drop it', async () => {
	const dir = project('installed', {
		'package.json': '{}',
		'eslint.lint-kit.js': "import tailwindPatterns from 'lint-kit/tailwind-patterns';\n",
		'pyproject.toml': '[project]\nname = "a"\n\n[tool.lint-kit-fastapi]\napp = "a"\n',
	});
	await quiet(['init', '--yes', '--no-install', '--cwd', dir]);
	assert.match(fs.readFileSync(path.join(dir, 'eslint.lint-kit.js'), 'utf8'), /tailwindPatterns\.config/);
	assert.match(fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8'), /\[tool\.lint-kit-fastapi\]/);
});

test('a CommonJS config is patched in place and ESLint loads lint-kit through it', async () => {
	const dir = project('svelte-cjs', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'eslint.config.cjs': `const svelte = require('eslint-plugin-svelte');\nconst tsParser = require('@typescript-eslint/parser');\n\nmodule.exports = [\n\t...(svelte.default ?? svelte).configs.recommended,\n\t{ files: ['**/*.ts'], languageOptions: { parser: tsParser } },\n\t{ rules: { 'no-var': 'error' } },\n];\n`,
		'src/lib/x.ts': "var a = 1;\nimport { page } from '$app/stores';\n",
	});
	await quiet(['init', '--sets', 'svelte-skills', '--no-install', '--cwd', dir]);
	assert.equal(fs.existsSync(path.join(dir, 'eslint.config.js')), false);
	assert.deepEqual(await ruleIds(dir, 'src/lib/x.ts'), ['no-var', 'svelte-skills/no-legacy-syntax']);
	const once = fs.readFileSync(path.join(dir, 'eslint.config.cjs'), 'utf8');
	await quiet(['init', '--sets', 'svelte-skills', '--no-install', '--cwd', dir]);
	assert.equal(fs.readFileSync(path.join(dir, 'eslint.config.cjs'), 'utf8'), once);
});

test('a TypeScript config is patched in place, not shadowed by a new eslint.config.js', async () => {
	const dir = project('svelte-ts', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'eslint.config.ts': "import { defineConfig } from 'eslint/config';\n\nexport default defineConfig([{ rules: { 'no-var': 'error' } }]);\n",
	});
	await quiet(['init', '--sets', 'svelte-skills', '--no-install', '--cwd', dir]);
	assert.equal(fs.existsSync(path.join(dir, 'eslint.config.js')), false);
	assert.equal(
		fs.readFileSync(path.join(dir, 'eslint.config.ts'), 'utf8'),
		"import lintKit from './eslint.lint-kit.js';\nimport { defineConfig } from 'eslint/config';\n\nconst config = defineConfig([{ rules: { 'no-var': 'error' } }]);\n\nexport default [...[config].flat(), ...lintKit];\n",
	);
});

test('a FastAPI backend in a subfolder: settings, .flake8, lefthook steps, and flake8 finds FAP', async () => {
	const files = {
		'.git/HEAD': 'ref: refs/heads/main\n',
		'lefthook.yml': '# hooks\npre-commit:\n  parallel: true\n  commands:\n    ruff:\n      run: ruff check\n',
		'backend/pyproject.toml':
			'[project]\nname = "api"\ndependencies = ["fastapi>=0.115", "weasyprint"]\n',
		'backend/api/main.py':
			'import time\nfrom fastapi import FastAPI\n\napp = FastAPI()\n\n\n@app.get("/")\nasync def home() -> dict:\n    time.sleep(1)\n    return {}\n',
	};
	const dir = project('repo', files);
	const backend = path.join(dir, 'backend');
	await quiet(['init', '--sets', 'fastapi', '--no-install', '--cwd', dir, '--python', 'backend']);
	const pyproject = fs.readFileSync(path.join(backend, 'pyproject.toml'), 'utf8');
	assert.match(pyproject, /\[tool\.lint-kit-fastapi\]\napp = "api"/);
	assert.match(fs.readFileSync(path.join(backend, '.flake8'), 'utf8'), /select = FAP/);
	const hooks = parse(fs.readFileSync(path.join(dir, 'lefthook.yml'), 'utf8'));
	assert.deepEqual(Object.keys(hooks['pre-commit'].commands), [
		'ruff',
		'lint-kit-fastapi',
		'lint-kit-fastapi-deps',
	]);
	assert.equal(hooks['pre-commit'].commands['lint-kit-fastapi'].glob, 'backend/api/**/*.py');
	assert.equal(hooks['pre-commit'].commands['lint-kit-fastapi'].root, 'backend/');
	assert.match(fs.readFileSync(path.join(dir, 'lefthook.yml'), 'utf8'), /^# hooks/);

	// idempotent
	const snapshot = ['backend/pyproject.toml', 'backend/.flake8', 'lefthook.yml'].map((f) =>
		fs.readFileSync(path.join(dir, f), 'utf8'),
	);
	await quiet(['init', '--sets', 'fastapi', '--no-install', '--cwd', dir, '--python', 'backend']);
	assert.deepEqual(
		['backend/pyproject.toml', 'backend/.flake8', 'lefthook.yml'].map((f) =>
			fs.readFileSync(path.join(dir, f), 'utf8'),
		),
		snapshot,
	);

	// turned off: back to what the repository had
	const original = (f) => files[f];
	await quiet(['init', '--sets', '', '--no-install', '--cwd', dir, '--python', 'backend']);
	assert.equal(fs.readFileSync(path.join(backend, 'pyproject.toml'), 'utf8'), original('backend/pyproject.toml'));
	assert.equal(fs.existsSync(path.join(backend, '.flake8')), false);
	assert.equal(fs.readFileSync(path.join(dir, 'lefthook.yml'), 'utf8'), original('lefthook.yml'));
	await quiet(['init', '--sets', 'fastapi', '--no-install', '--cwd', dir, '--python', 'backend']);

	// the real tools, from the python package's dev environment
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
	assert.match(out('lint-kit-fastapi', ['check-deps']), /classify weasyprint/);
});

test('arguments with spaces survive the Windows shell', () => {
	const spec = 'lint-kit-fastapi @ git+https://github.com/x/y@v1#subdirectory=python';
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
