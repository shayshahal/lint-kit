#!/usr/bin/env node
/**
 * lint-kit init: ask which rule sets this project gets, install them from git, write the config.
 *
 *   npx github:shayshahal/lint-kit init [--sets svelte-skills,untranslated-text,tailwind-patterns,fastapi]
 *                                        [--yes] [--no-install] [--ref <git ref>] [--python <dir>]
 *
 * ESLint sets: eslint.lint-kit.js holds lint-kit's entries and is rewritten on every run (so a
 * re-run adds or removes sets); eslint.config.js imports it once. A project without an ESLint
 * config gets one with the Svelte / TypeScript parser setup.
 * fastapi: [tool.lint-kit-fastapi] in pyproject.toml, FAP in .flake8, and lefthook steps when the
 * repository uses lefthook.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const REPO = 'shayshahal/lint-kit';
const SELF = JSON.parse(
	fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
);

export const SETS = {
	'svelte-skills': { kind: 'eslint', about: 'Svelte 5 / SvelteKit rules (22) from the Svelte skills and docs' },
	'untranslated-text': { kind: 'eslint', about: 'text users read comes from the message catalogue' },
	'tailwind-patterns': { kind: 'eslint', about: 'Tailwind / shadcn class conventions (vh, transition-all, dark:, dialog titles)' },
	fastapi: { kind: 'python', about: 'FastAPI rules ruff lacks, as a flake8 plugin (FAP001-017)' },
};
const ESLINT_PEERS = ['eslint', 'eslint-plugin-svelte', 'svelte-eslint-parser', '@typescript-eslint/parser'];

function parseArgs(argv) {
	const args = { command: argv[0], yes: false, install: true, ref: `v${SELF.version}` };
	for (let i = 1; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--yes' || a === '-y') args.yes = true;
		else if (a === '--no-install') args.install = false;
		else if (a === '--sets') args.sets = argv[++i].split(',').filter(Boolean);
		else if (a === '--ref') args.ref = argv[++i];
		else if (a === '--python') args.python = argv[++i];
		else if (a === '--cwd') args.cwd = argv[++i];
		else throw new Error(`unknown option ${a}`);
	}
	for (const s of args.sets ?? []) if (!SETS[s]) throw new Error(`unknown set ${s}; one of ${Object.keys(SETS)}`);
	return args;
}

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const say = (msg) => console.log(msg);

function detect(cwd, pythonDir) {
	const pkg = JSON.parse(read(path.join(cwd, 'package.json')) ?? '{}');
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	const pyproject = read(path.join(pythonDir, 'pyproject.toml')) ?? '';
	return {
		'svelte-skills': 'svelte' in deps,
		'untranslated-text': '@inlang/paraglide-js' in deps,
		'tailwind-patterns': 'tailwindcss' in deps,
		fastapi: /["']fastapi/i.test(pyproject),
	};
}

async function choose(args, defaults) {
	if (args.sets) return args.sets;
	if (args.yes) return Object.keys(SETS).filter((s) => defaults[s]);
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const chosen = [];
	for (const [name, { about }] of Object.entries(SETS)) {
		const hint = defaults[name] ? 'Y/n' : 'y/N';
		const answer = (await rl.question(`? ${name} — ${about} (${hint}) `)).trim().toLowerCase();
		if (answer ? answer.startsWith('y') : defaults[name]) chosen.push(name);
	}
	rl.close();
	return chosen;
}

function packageManager(cwd) {
	for (let dir = cwd; ; dir = path.dirname(dir)) {
		if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
		if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
		if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
		if (path.dirname(dir) === dir) return 'npm';
	}
}

function run(cmd, cmdArgs, cwd) {
	say(`$ ${cmd} ${cmdArgs.join(' ')}`);
	execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
}

// ── ESLint ──────────────────────────────────────────────────────────────────────

const ESLINT_ENTRIES = {
	'svelte-skills': () => `	...svelteSkills.config(),`,
	'untranslated-text': () => `	...untranslatedText.config({
		// allow: ['Acme( Inc)?'],          // brand names and other strings that are not text
		// bannedInCode: '[\\\\u0590-\\\\u05FF]', // a script no string in code may contain (Hebrew)
		// locales: ['he', 'en'],           // keys of an inline { he: '…', en: '…' } pair
	}),`,
	'tailwind-patterns': () => `	...tailwindPatterns.config({
		uiFiles: ['src/lib/components/ui/**'],
		darkMode: false, // true when the app toggles .dark: bg-white / text-black become errors
	}),`,
};
const ESLINT_IMPORTS = {
	'svelte-skills': "import svelteSkills from 'lint-kit/svelte-skills';",
	'untranslated-text': "import untranslatedText from 'lint-kit/untranslated-text';",
	'tailwind-patterns': "import tailwindPatterns from 'lint-kit/tailwind-patterns';",
};

export function lintKitConfig(sets) {
	const chosen = sets.filter((s) => SETS[s].kind === 'eslint');
	return `// Written by \`lint-kit init\`. Edit the options here; re-running init rewrites this file (it
// keeps the previous one as eslint.lint-kit.js.bak), so carry your edits over after a re-run.
${chosen.map((s) => ESLINT_IMPORTS[s]).join('\n')}

export default [
${chosen.map((s) => ESLINT_ENTRIES[s]()).join('\n')}
];
`;
}

const NEW_ESLINT_CONFIG = `import svelte from 'eslint-plugin-svelte';
import tsParser from '@typescript-eslint/parser';
import lintKit from './eslint.lint-kit.js';

export default [
	...svelte.configs.recommended,
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: { parserOptions: { parser: tsParser, extraFileExtensions: ['.svelte'] } },
	},
	{
		files: ['**/*.ts', '**/*.js'],
		ignores: ['**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: { parser: tsParser },
	},
	...lintKit,
	{ ignores: ['build/', '.svelte-kit/', 'dist/', 'node_modules/'] },
];
`;

/** Make eslint.config.js spread lint-kit's entries last: they hold one list per restricted-* rule. */
export function patchEslintConfig(text) {
	if (text.includes('eslint.lint-kit.js')) return text;
	const at = text.search(/^export default /m);
	if (at < 0) throw new Error('eslint.config.js has no `export default`; add ...lintKit yourself');
	const body = text.slice(at + 'export default '.length).replace(/;\s*$/, '');
	return (
		`import lintKit from './eslint.lint-kit.js';\n` +
		text.slice(0, at) +
		`const config = ${body};\n\n` +
		`export default [...[config].flat(), ...lintKit];\n`
	);
}

function writeEslint(cwd, sets) {
	const own = path.join(cwd, 'eslint.lint-kit.js');
	const next = lintKitConfig(sets);
	const previous = read(own);
	if (previous !== null && previous !== next) {
		fs.writeFileSync(`${own}.bak`, previous);
		say('  (previous eslint.lint-kit.js kept as eslint.lint-kit.js.bak)');
	}
	fs.writeFileSync(own, next);
	say('✔ eslint.lint-kit.js');
	const existing = ['eslint.config.js', 'eslint.config.mjs'].find((f) => fs.existsSync(path.join(cwd, f)));
	if (!existing) {
		fs.writeFileSync(path.join(cwd, 'eslint.config.js'), NEW_ESLINT_CONFIG);
		return say('✔ eslint.config.js (new, with the Svelte / TypeScript parser setup)');
	}
	const file = path.join(cwd, existing);
	const before = fs.readFileSync(file, 'utf8');
	const after = patchEslintConfig(before);
	if (after !== before) {
		fs.writeFileSync(file, after);
		say(`✔ ${existing} spreads ...lintKit last`);
	}
}

// ── Python ──────────────────────────────────────────────────────────────────────

/** The package that creates FastAPI(): the app setting. */
function findApp(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name.startsWith('.') || ['node_modules', 'tests'].includes(entry.name)) continue;
		const pkg = path.join(dir, entry.name);
		const main = ['main.py', '__init__.py', 'app.py'].map((f) => read(path.join(pkg, f))).find((t) => t?.includes('FastAPI('));
		if (main) return entry.name;
	}
	return 'app';
}

export function patchPyproject(text, app) {
	if (/^\[tool\.lint-kit-fastapi\]/m.test(text)) return text;
	return `${text.replace(/\s*$/, '\n')}\n[tool.lint-kit-fastapi]\napp = "${app}"\n\n# FAP001 knows common libraries. Classify the rest: the calls that block the event loop, or why\n# the library is safe in async code. \`lint-kit-fastapi check-deps\` lists what is missing.\n[tool.lint-kit-fastapi.dependencies]\n`;
}

export function patchFlake8(text) {
	if (text === null)
		return '# flake8 runs lint-kit\'s FastAPI rules (FAP); ruff or your other linters do the rest.\n[flake8]\nselect = FAP\nmax-line-length = 100\n';
	if (/\bFAP\b/.test(text)) return text;
	if (/^\[flake8\]\s*$/m.test(text)) return text.replace(/^\[flake8\]\s*$/m, '[flake8]\nextend-select = FAP');
	return `${text.replace(/\s*$/, '\n')}\n[flake8]\nextend-select = FAP\n`;
}

/** lefthook pre-commit steps: FAP on staged app files, check-deps when pyproject.toml changes. */
export function patchLefthook(text, pythonRoot, app) {
	const doc = parseDocument(text);
	const root = pythonRoot ? `${pythonRoot.replace(/\\/g, '/').replace(/\/?$/, '/')}` : '';
	if (!doc.hasIn(['pre-commit', 'commands'])) doc.setIn(['pre-commit', 'commands'], doc.createNode({}));
	const add = (name, value) => {
		if (!doc.hasIn(['pre-commit', 'commands', name])) doc.setIn(['pre-commit', 'commands', name], doc.createNode(value));
	};
	add('lint-kit-fastapi', {
		glob: `${root}${app}/**/*.py`,
		...(root ? { root } : {}),
		run: 'uv run flake8 {staged_files}',
	});
	add('lint-kit-fastapi-deps', {
		glob: `${root}pyproject.toml`,
		...(root ? { root } : {}),
		run: 'uv run lint-kit-fastapi check-deps',
	});
	return doc.toString();
}

function gitRoot(cwd) {
	for (let dir = cwd; ; dir = path.dirname(dir)) {
		if (fs.existsSync(path.join(dir, '.git'))) return dir;
		if (path.dirname(dir) === dir) return null;
	}
}

function writePython(pythonDir, args) {
	const pyproject = path.join(pythonDir, 'pyproject.toml');
	if (!fs.existsSync(pyproject)) throw new Error(`no pyproject.toml in ${pythonDir}; pass --python <dir>`);
	const app = findApp(pythonDir);
	if (args.install) {
		const spec = `lint-kit-fastapi @ git+https://github.com/${REPO}@${args.ref}#subdirectory=python`;
		if (fs.existsSync(path.join(pythonDir, 'uv.lock'))) run('uv', ['add', '--dev', spec], pythonDir);
		else say(`→ install it: pip install "${spec}"`);
	}
	fs.writeFileSync(pyproject, patchPyproject(fs.readFileSync(pyproject, 'utf8'), app));
	say(`✔ pyproject.toml [tool.lint-kit-fastapi] app = "${app}"`);
	const flake8 = path.join(pythonDir, '.flake8');
	fs.writeFileSync(flake8, patchFlake8(read(flake8)));
	say('✔ .flake8 selects FAP');
	const repo = gitRoot(pythonDir);
	const lefthook = repo && ['lefthook.yml', 'lefthook.yaml'].map((f) => path.join(repo, f)).find((f) => fs.existsSync(f));
	if (lefthook) {
		const rel = path.relative(repo, pythonDir);
		fs.writeFileSync(lefthook, patchLefthook(fs.readFileSync(lefthook, 'utf8'), rel, app));
		say(`✔ ${path.basename(lefthook)} runs FAP and check-deps before each commit`);
	}
}

// ── main ────────────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2)) {
	const args = parseArgs(argv);
	if (args.command !== 'init') {
		say('usage: lint-kit init [--sets a,b] [--yes] [--no-install] [--ref <git ref>] [--python <dir>]');
		say(`sets: ${Object.keys(SETS).join(', ')}`);
		return args.command ? 2 : 0;
	}
	const cwd = path.resolve(args.cwd ?? '.');
	const pythonDir = path.resolve(cwd, args.python ?? '.');
	const sets = await choose(args, detect(cwd, pythonDir));
	if (!sets.length) return say('nothing chosen'), 0;
	say(`rule sets: ${sets.join(', ')}`);

	if (sets.some((s) => SETS[s].kind === 'eslint')) {
		if (args.install) {
			const pm = packageManager(cwd);
			const pkg = JSON.parse(read(path.join(cwd, 'package.json')) ?? '{}');
			const has = { ...pkg.dependencies, ...pkg.devDependencies };
			const missing = ESLINT_PEERS.filter((p) => !(p in has));
			const add = pm === 'npm' ? ['install', '--save-dev'] : ['add', '-D'];
			run(pm, [...add, `github:${REPO}#${args.ref}`, ...missing], cwd);
		}
		writeEslint(cwd, sets);
	}
	if (sets.includes('fastapi')) writePython(pythonDir, args);
	say('done');
	return 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().then(
		(code) => process.exit(code),
		(error) => {
			console.error(`lint-kit: ${error.message}`);
			process.exit(1);
		},
	);
}
