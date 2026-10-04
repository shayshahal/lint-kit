#!/usr/bin/env node
/**
 * lint-kit init: ask which rule sets this project gets, install them from git, write the config.
 *
 *   npx github:shayshahal/lint-kit init [--sets svelte-skills,untranslated-text,tailwind-patterns,error-handling,fastapi]
 *                                        [--yes] [--no-install] [--ref <git ref>] [--python <dir>]
 *
 * ESLint sets: eslint.lint-kit.js holds lint-kit's entries and is rewritten on every run (so a
 * re-run adds or removes sets); eslint.config.* imports it once. A project without an ESLint
 * config gets one with the Svelte / TypeScript parser setup.
 * fastapi: [tool.lint-kit-fastapi] in pyproject.toml, FAP in .flake8, ruff's FAST and ASYNC rules
 * in the ruff config.
 * When the repository uses lefthook, pre-commit steps run what was chosen on staged files.
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
	'error-handling': { kind: 'eslint', about: 'catch blocks that drop, only log, or stringify the error' },
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
	// a set lint-kit already installed stays on unless it is turned off
	const own = read(path.join(cwd, 'eslint.lint-kit.js')) ?? '';
	const installed = (set) => own.includes(`from 'lint-kit/${set}'`);
	return {
		'svelte-skills': 'svelte' in deps || installed('svelte-skills'),
		'untranslated-text': '@inlang/paraglide-js' in deps || installed('untranslated-text'),
		'tailwind-patterns': 'tailwindcss' in deps || installed('tailwind-patterns'),
		'error-handling': 'svelte' in deps || 'typescript' in deps || installed('error-handling'),
		fastapi: /["']fastapi/i.test(pyproject) || FASTAPI_TABLE.test(pyproject),
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

/**
 * On Windows npm / pnpm are .cmd files, which only run through a shell; quote what it would split.
 * A quote inside is doubled: cmd stays inside the quotes, and the program reads "" as one ".
 */
export function shellArgs(args, shell = process.platform === 'win32') {
	return shell ? args.map((arg) => (/[\s&|<>^"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg)) : args;
}

function run(cmd, cmdArgs, cwd) {
	const shell = process.platform === 'win32';
	say(`$ ${cmd} ${shellArgs(cmdArgs, true).join(' ')}`);
	execFileSync(cmd, shellArgs(cmdArgs, shell), { cwd, stdio: 'inherit', shell });
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
	'error-handling': () => `	...errorHandling.config(),`,
};
const ESLINT_IMPORTS = {
	'svelte-skills': "import svelteSkills from 'lint-kit/svelte-skills';",
	'untranslated-text': "import untranslatedText from 'lint-kit/untranslated-text';",
	'tailwind-patterns': "import tailwindPatterns from 'lint-kit/tailwind-patterns';",
	'error-handling': "import errorHandling from 'lint-kit/error-handling';",
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

/** ESLint's own lookup order. */
export const ESLINT_CONFIGS = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].map((ext) => `eslint.config.${ext}`);

/** Make the ESLint config spread lint-kit's entries last: they hold one list per restricted-* rule. */
export function patchEslintConfig(text) {
	if (text.includes('eslint.lint-kit.js')) return text;
	const esm = text.search(/^export default /m);
	if (esm >= 0) {
		const body = text.slice(esm + 'export default '.length).replace(/;\s*$/, '');
		return (
			`import lintKit from './eslint.lint-kit.js';\n` +
			text.slice(0, esm) +
			`const config = ${body};\n\n` +
			`export default [...[config].flat(), ...lintKit];\n`
		);
	}
	// CommonJS cannot import eslint.lint-kit.js synchronously; ESLint awaits an exported promise.
	const cjs = text.match(/^module\.exports\s*=\s*/m);
	if (!cjs) throw new Error('the ESLint config has no `export default` or `module.exports`; add ...lintKit yourself');
	const body = text.slice(cjs.index + cjs[0].length).replace(/;\s*$/, '');
	return (
		text.slice(0, cjs.index) +
		`const config = ${body};\n\n` +
		`module.exports = (async () => [...[config].flat(), ...(await import('./eslint.lint-kit.js')).default])();\n`
	);
}

/** The command that runs a dev dependency's binary. */
const EXEC = { pnpm: 'pnpm exec', yarn: 'yarn', npm: 'npx' };

/** lefthook pre-commit step: ESLint on staged files under src/, unless a step already runs ESLint. */
export function patchLefthookEslint(text, root, exec) {
	const doc = parseDocument(text);
	const dir = lefthookRoot(root);
	addLefthookStep(doc, 'lint-kit-eslint', /\beslint\b/, {
		glob: `${dir}src/*.{js,ts,svelte}`,
		...(dir ? { root: dir } : {}),
		run: `${exec} eslint {staged_files}`,
	});
	return doc.toString();
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
	const existing = ESLINT_CONFIGS.find((f) => fs.existsSync(path.join(cwd, f)));
	if (!existing) {
		fs.writeFileSync(path.join(cwd, 'eslint.config.js'), NEW_ESLINT_CONFIG);
		say('✔ eslint.config.js (new, with the Svelte / TypeScript parser setup)');
	} else {
		const file = path.join(cwd, existing);
		const before = fs.readFileSync(file, 'utf8');
		const after = patchEslintConfig(before);
		if (after !== before) {
			fs.writeFileSync(file, after);
			say(`✔ ${existing} spreads ...lintKit last`);
		}
	}
	const lefthook = lefthookFile(cwd);
	if (!lefthook) return;
	const before = fs.readFileSync(lefthook.file, 'utf8');
	const after = sets.some((s) => SETS[s].kind === 'eslint')
		? patchLefthookEslint(before, path.relative(lefthook.repo, cwd), EXEC[packageManager(cwd)])
		: unpatchLefthook(before, ['lint-kit-eslint']);
	if (after !== before) {
		fs.writeFileSync(lefthook.file, after);
		say(`✔ ${path.basename(lefthook.file)} ${after.includes('lint-kit-eslint') ? 'runs' : 'no longer runs'} ESLint before each commit`);
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
	if (text === null) return FLAKE8_NEW;
	if (/\bFAP\b/.test(text)) return text;
	if (/^\[flake8\]\s*$/m.test(text)) return text.replace(/^\[flake8\]\s*$/m, '[flake8]\nextend-select = FAP');
	return `${text.replace(/\s*$/, '\n')}\n[flake8]\nextend-select = FAP\n`;
}

/** `root` for a lefthook step: the folder relative to the repository, with a trailing slash. */
const lefthookRoot = (rel) => (rel ? `${rel.replace(/\\/g, '/').replace(/\/?$/, '/')}` : '');

/**
 * Add a pre-commit step unless it is there, or another step already runs the same tool (`runs`).
 * lefthook's globs are not path-aware: `*` crosses folders, and `app/**\/*.py` misses app/main.py.
 */
function addLefthookStep(doc, name, runs, value) {
	if (!doc.hasIn(['pre-commit', 'commands'])) doc.setIn(['pre-commit', 'commands'], doc.createNode({}));
	const steps = doc.getIn(['pre-commit', 'commands']).toJSON() ?? {};
	if (name in steps) return;
	if (runs && Object.values(steps).some((step) => runs.test(step?.run ?? ''))) return;
	doc.setIn(['pre-commit', 'commands', name], doc.createNode(value));
}

/**
 * lefthook pre-commit steps: FAP on staged app files, check-deps when pyproject.toml changes, and
 * ruff unless a step already runs it.
 */
export function patchLefthook(text, pythonRoot, app) {
	const doc = parseDocument(text);
	const root = lefthookRoot(pythonRoot);
	const at = root ? { root } : {};
	addLefthookStep(doc, 'lint-kit-fastapi', null, { glob: `${root}${app}/*.py`, ...at, run: 'uv run flake8 {staged_files}' });
	addLefthookStep(doc, 'lint-kit-fastapi-deps', null, {
		glob: `${root}pyproject.toml`,
		...at,
		run: 'uv run lint-kit-fastapi check-deps',
	});
	addLefthookStep(doc, 'lint-kit-ruff', /\bruff\b/, { glob: `${root}*.py`, ...at, run: 'uv run ruff check {staged_files}' });
	return doc.toString();
}

/** The repository's lefthook config, if it has one. */
function lefthookFile(cwd) {
	const repo = gitRoot(cwd);
	const file = repo && ['lefthook.yml', 'lefthook.yaml'].map((f) => path.join(repo, f)).find((f) => fs.existsSync(f));
	return file ? { repo, file } : null;
}

// ── ruff ──

/** ruff's own rules for FastAPI and async code; FAP holds only what they cannot express. */
export const RUFF_RULES = ['FAST', 'ASYNC'];
const RUFF_MARK = '# lint-kit-fastapi added';

/**
 * The ruff config that applies to pythonDir: the nearest ruff.toml, .ruff.toml or pyproject.toml
 * with [tool.ruff], up to the repository root. Without one, pythonDir's pyproject.toml.
 */
export function findRuffConfig(pythonDir, repo) {
	for (let dir = pythonDir; ; dir = path.dirname(dir)) {
		for (const name of ['.ruff.toml', 'ruff.toml']) if (fs.existsSync(path.join(dir, name))) return { file: path.join(dir, name), table: 'lint' };
		if (/^\[tool\.ruff[\].]/m.test(read(path.join(dir, 'pyproject.toml')) ?? '')) return { file: path.join(dir, 'pyproject.toml'), table: 'tool.ruff.lint' };
		if (!repo || dir === repo || path.dirname(dir) === dir) break;
	}
	return { file: path.join(pythonDir, 'pyproject.toml'), table: 'tool.ruff.lint' };
}

const tableHeader = (table) => new RegExp(`^\\[${table.replace(/\./g, '\\.')}\\][ \\t]*(#.*)?$`, 'm');
const quoted = (codes) => codes.map((c) => `"${c}"`).join(', ');

/** Add RUFF_RULES to the lint table's extend-select, with a comment that says which were added. */
export function patchRuff(text, table) {
	if (text.includes(RUFF_MARK)) return text;
	const header = tableHeader(table);
	const found = header.exec(text);
	if (!found) {
		const lines = `[${table}]\n${RUFF_MARK} ${RUFF_RULES.join(', ')}\nextend-select = [${quoted(RUFF_RULES)}]\n`;
		return `${text.replace(/\s*$/, '\n')}\n${lines}`;
	}
	const start = found.index + found[0].length + 1;
	const next = text.slice(start).search(/^\s*\[/m);
	const end = next < 0 ? text.length : start + next;
	const body = text.slice(start, end);
	const select = /^extend-select\s*=\s*\[([^\]]*)\]/m.exec(body);
	if (!select) {
		const lines = `${RUFF_MARK} ${RUFF_RULES.join(', ')}\nextend-select = [${quoted(RUFF_RULES)}]\n`;
		return text.slice(0, start) + lines + text.slice(start);
	}
	const has = new Set([...select[1].matchAll(/["']([A-Z0-9]+)["']/g)].map((m) => m[1]));
	const missing = RUFF_RULES.filter((c) => !has.has(c));
	if (!missing.length) return text;
	const items = select[1].replace(/[\s,]*$/, '');
	const at = start + select.index + select[0].indexOf('[') + 1 + items.length;
	const added = `${items ? ', ' : ''}${quoted(missing)}`;
	return text.slice(0, start + select.index) + `${RUFF_MARK} ${missing.join(', ')}\n` + text.slice(start + select.index, at) + added + text.slice(at);
}

/** The ruff config without what patchRuff added. */
export function unpatchRuff(text, table) {
	const mark = new RegExp(`^${RUFF_MARK} (.*)\\n`, 'm').exec(text);
	if (!mark) return text;
	const codes = mark[1].split(', ');
	let out = text.slice(0, mark.index) + text.slice(mark.index + mark[0].length);
	const created = `extend-select = [${quoted(codes)}]\n`;
	if (out.startsWith(created, mark.index)) out = out.slice(0, mark.index) + out.slice(mark.index + created.length);
	else {
		const line = out.slice(mark.index);
		const close = line.indexOf(']');
		const inner = line.slice(0, close).replace(`, ${quoted(codes)}`, '').replace(quoted(codes), '');
		out = out.slice(0, mark.index) + inner + line.slice(close);
	}
	// a table left empty (patchRuff wrote it): drop it with the blank lines before it
	const header = tableHeader(table).exec(out);
	if (header && /^\s*(\[|$)/.test(out.slice(header.index + header[0].length))) {
		const before = out.slice(0, header.index).replace(/\n+$/, '\n');
		const after = out.slice(header.index + header[0].length).replace(/^\s*\n/, '');
		out = after ? `${before}\n${after}` : before;
	}
	return out;
}

const FASTAPI_TABLE = /^\[tool\.lint-kit-fastapi[\].]/m;
const FLAKE8_NEW =
	"# flake8 runs lint-kit's FastAPI rules (FAP); ruff or your other linters do the rest.\n[flake8]\nselect = FAP\nmax-line-length = 100\n";
const LEFTHOOK_STEPS = ['lint-kit-fastapi', 'lint-kit-fastapi-deps', 'lint-kit-ruff'];

/** pyproject.toml without the [tool.lint-kit-fastapi] tables (the comments before a later table stay). */
export function unpatchPyproject(text) {
	const lines = text.split('\n');
	const out = [];
	let inside = false;
	let held = []; // comments and blank lines inside lint-kit's tables, kept if a foreign table follows
	for (const line of lines) {
		const header = /^\s*\[/.test(line);
		if (header) {
			const ours = /^\s*\[tool\.lint-kit-fastapi[\].]/.test(line);
			if (inside && !ours) out.push(...held.filter((l, i) => held.slice(i).some((x) => x.trim())));
			held = [];
			inside = ours;
			if (ours) continue;
		}
		if (!inside) out.push(line);
		else if (/^\s*(#|$)/.test(line)) held.push(line);
		else held = [];
	}
	return `${out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '')}\n`;
}

/** .flake8 without lint-kit's FAP selection; null when init wrote the whole file. */
export function unpatchFlake8(text) {
	if (text === FLAKE8_NEW) return null;
	return text
		.replace(/^extend-select\s*=\s*FAP\s*\n/m, '')
		.replace(/^(extend-select\s*=.*?),\s*FAP\b/m, '$1')
		.replace(/^(extend-select\s*=\s*)FAP\s*,\s*/m, '$1')
		.replace(/\n*\[flake8\]\s*$/, '\n'); // the section init appended, now empty
}

/** lefthook.yml without lint-kit's pre-commit steps. */
export function unpatchLefthook(text, steps = LEFTHOOK_STEPS) {
	const doc = parseDocument(text);
	for (const name of steps) doc.deleteIn(['pre-commit', 'commands', name]);
	if (doc.getIn(['pre-commit', 'commands'])?.items?.length === 0) doc.deleteIn(['pre-commit', 'commands']);
	if (doc.getIn(['pre-commit'])?.items?.length === 0) doc.deleteIn(['pre-commit']);
	return doc.toString();
}

/** Turn fastapi off: the dev dependency, settings, FAP selection and lefthook steps. */
function removePython(pythonDir, args) {
	const pyproject = path.join(pythonDir, 'pyproject.toml');
	const text = read(pyproject);
	if (text === null || !FASTAPI_TABLE.test(text)) return;
	const depends = /lint-kit-fastapi/.test(unpatchPyproject(text));
	if (args.install && depends && fs.existsSync(path.join(pythonDir, 'uv.lock')))
		run('uv', ['remove', '--dev', 'lint-kit-fastapi'], pythonDir);
	fs.writeFileSync(pyproject, unpatchPyproject(read(pyproject)));
	say('✔ pyproject.toml without [tool.lint-kit-fastapi] (its dependency list is in git history)');
	const flake8 = path.join(pythonDir, '.flake8');
	const flake8Text = read(flake8);
	if (flake8Text !== null) {
		const next = unpatchFlake8(flake8Text);
		if (next === null) {
			fs.rmSync(flake8);
			say('✔ .flake8 removed (init wrote it)');
		} else {
			fs.writeFileSync(flake8, next);
			if (/^select\s*=\s*FAP\s*$/m.test(next)) say('→ .flake8 still selects only FAP: change select yourself');
			else say('✔ .flake8 no longer selects FAP');
		}
	}
	const repo = gitRoot(pythonDir);
	const ruff = findRuffConfig(pythonDir, repo);
	const ruffText = read(ruff.file);
	if (ruffText !== null && unpatchRuff(ruffText, ruff.table) !== ruffText) {
		fs.writeFileSync(ruff.file, unpatchRuff(ruffText, ruff.table));
		say(`✔ ${path.basename(ruff.file)} without the ruff rules lint-kit added (ruff itself stays installed)`);
	}
	const lefthook = lefthookFile(pythonDir);
	if (lefthook) {
		const before = fs.readFileSync(lefthook.file, 'utf8');
		const after = unpatchLefthook(before);
		if (after !== before) {
			fs.writeFileSync(lefthook.file, after);
			say(`✔ ${path.basename(lefthook.file)} without the FAP and ruff steps`);
		}
	}
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
		const ruff = /["']ruff\b/.test(fs.readFileSync(pyproject, 'utf8')) ? [] : ['ruff'];
		if (fs.existsSync(path.join(pythonDir, 'uv.lock'))) run('uv', ['add', '--dev', spec, ...ruff], pythonDir);
		else say(`→ install it: pip install "${spec}"${ruff.map((r) => ` ${r}`).join('')}`);
	}
	fs.writeFileSync(pyproject, patchPyproject(fs.readFileSync(pyproject, 'utf8'), app));
	say(`✔ pyproject.toml [tool.lint-kit-fastapi] app = "${app}"`);
	const flake8 = path.join(pythonDir, '.flake8');
	fs.writeFileSync(flake8, patchFlake8(read(flake8)));
	say('✔ .flake8 selects FAP');
	const repo = gitRoot(pythonDir);
	const ruff = findRuffConfig(pythonDir, repo);
	const ruffText = read(ruff.file) ?? '';
	if (patchRuff(ruffText, ruff.table) !== ruffText) {
		fs.writeFileSync(ruff.file, patchRuff(ruffText, ruff.table));
		say(`✔ ${path.relative(pythonDir, ruff.file)} turns on ruff's ${RUFF_RULES.join(' and ')} rules`);
	}
	const lefthook = lefthookFile(pythonDir);
	if (lefthook) {
		const rel = path.relative(lefthook.repo, pythonDir);
		fs.writeFileSync(lefthook.file, patchLefthook(fs.readFileSync(lefthook.file, 'utf8'), rel, app));
		say(`✔ ${path.basename(lefthook.file)} runs FAP, check-deps and ruff before each commit`);
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
	const hadEslint = fs.existsSync(path.join(cwd, 'eslint.lint-kit.js'));
	const hadPython = FASTAPI_TABLE.test(read(path.join(pythonDir, 'pyproject.toml')) ?? '');
	if (!sets.length && !hadEslint && !hadPython) return say('nothing chosen'), 0;
	say(`rule sets: ${sets.join(', ') || 'none'}`);

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
	} else if (hadEslint) writeEslint(cwd, sets); // every ESLint set turned off: an empty list
	if (sets.includes('fastapi')) writePython(pythonDir, args);
	else removePython(pythonDir, args);
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
