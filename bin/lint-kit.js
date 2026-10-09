#!/usr/bin/env node
/**
 * lint-kit init: install the deterministic tools a repository uses, and nothing named after this
 * installer. The rules are copied into the repository's tools/ folder; everything else is the
 * tools' own config.
 *
 *   npx github:shayshahal/lint-kit init [--sets svelte-skills,untranslated-text,tailwind-patterns,
 *                                        error-handling,fastapi,typecheck,structure]
 *                                        [--yes] [--no-install] [--base <branch>] [--cwd <dir>]
 *
 * Projects: in a monorepo, the members of the JS workspace (pnpm-workspace.yaml, or "workspaces"
 * in the root package.json) plus every pyproject.toml with a [project] table; without a
 * workspace, every package.json and pyproject.toml outside node_modules and hidden folders.
 * Each set is wired into each project it fits.
 *
 * ESLint sets: tools/eslint/<set>.mjs (and its .md), imported by each project's eslint.rules.js,
 * which its ESLint config spreads last. fastapi: tools/python/fastapi_rules.py, a flake8 local
 * plugin (.flake8), [tool.fastapi-rules] in pyproject.toml, ruff's FAST and ASYNC rules.
 * typecheck: svelte-check --tsgo and pyright as lefthook pre-push steps. structure: pre-push
 * steps that fail when a branch makes the code's structure worse than at its base (fallow audit;
 * tools/python/structure_check.py). When the repository uses lefthook, pre-commit steps run the
 * linters on staged files.
 *
 * It only adds and updates: a re-run copies the tools again and adds what is missing; turning a
 * set off is done by hand.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

/** This installer's checkout: the files under tools/ are copied from here. */
const SELF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SETS = {
	'svelte-skills': { kind: 'eslint', about: 'Svelte 5 / SvelteKit rules (22) from the Svelte skills and docs' },
	'untranslated-text': { kind: 'eslint', about: 'text users read comes from the message catalogue' },
	'tailwind-patterns': { kind: 'eslint', about: 'Tailwind / shadcn class conventions (vh, transition-all, dark:, dialog titles)' },
	'error-handling': { kind: 'eslint', about: 'catch blocks that drop, only log, or stringify the error' },
	'slop-patterns': { kind: 'oxlint', about: 'a function that only forwards its arguments, and assertions that discard a type (oxlint)' },
	fastapi: { kind: 'python', about: 'FastAPI rules ruff lacks, as a flake8 plugin (FAP001-017)' },
	typecheck: { kind: 'typecheck', about: 'svelte-check --tsgo and pyright before each push (lefthook)' },
	structure: {
		kind: 'structure',
		about: 'fail a push that adds complexity, duplication or dead code the base did not have (lefthook)',
	},
};
/** The JS project dependency each ESLint set is for. */
const ESLINT_FOR = {
	'svelte-skills': (deps) => 'svelte' in deps,
	'untranslated-text': (deps) => '@inlang/paraglide-js' in deps,
	'tailwind-patterns': (deps) => 'tailwindcss' in deps,
	'error-handling': (deps) => 'svelte' in deps || 'typescript' in deps,
};
const ESLINT_PEERS = ['eslint', 'eslint-plugin-svelte', 'svelte-eslint-parser', '@typescript-eslint/parser'];
/** The JS project dependency each oxlint set is for. */
const OXLINT_FOR = {
	'slop-patterns': (deps) => 'oxlint' in deps,
};

function parseArgs(argv) {
	const args = { command: argv[0], yes: false, install: true };
	for (let i = 1; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--yes' || a === '-y') args.yes = true;
		else if (a === '--no-install') args.install = false;
		else if (a === '--sets') args.sets = argv[++i].split(',').filter(Boolean);
		else if (a === '--cwd') args.cwd = argv[++i];
		else if (a === '--base') args.base = argv[++i];
		else throw new Error(`unknown option ${a}`);
	}
	for (const s of args.sets ?? []) if (!SETS[s]) throw new Error(`unknown set ${s}; one of ${Object.keys(SETS)}`);
	return args;
}

/** A file's text with LF line endings (a Windows checkout has CRLF), or null. */
const read = (file) => (file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null);
/** Write `text` (LF) to `file`, in the line endings the file already has. */
function write(file, text) {
	const crlf = fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('\r\n');
	fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
}

/** Write a lefthook script body under `.lefthook/<hook>/`, where lefthook runs scripts from. */
function writeHookScript(repo, hook, name, body) {
	const file = path.join(repo, '.lefthook', hook, name);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	write(file, body);
}
const say = (msg) => console.log(msg);
const posix = (p) => p.replace(/\\/g, '/');
/** `to` relative to `from`, with slashes; '.' for the same folder. */
const rel = (from, to) => posix(path.relative(from, to)) || '.';
const where = (project) => project.rel || '.';

// ── projects ────────────────────────────────────────────────────────────────────

function gitRoot(cwd) {
	for (let dir = cwd; ; dir = path.dirname(dir)) {
		if (fs.existsSync(path.join(dir, '.git'))) return dir;
		if (path.dirname(dir) === dir) return null;
	}
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '__pycache__']);

/** package.json and pyproject.toml files under `repo`, as relative folders ('' for the root). */
function manifests(repo) {
	const found = { 'package.json': [], 'pyproject.toml': [] };
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
			} else if (entry.name in found) found[entry.name].push(rel(repo, dir).replace(/^\.$/, ''));
		}
	};
	walk(repo);
	return found;
}

/** A workspace glob (packages/*, apps/**) as a regular expression over relative folders. */
const globRegex = (glob) =>
	new RegExp(
		`^${glob
			.replace(/^\.\//, '')
			.replace(/\/+$/, '')
			.replace(/[.+^${}()|[\]\\]/g, '\\$&')
			.replace(/\*\*/g, '\u0000')
			.replace(/\*/g, '[^/]*')
			.replace(/\u0000/g, '.*')}$`,
	);

/** The JS workspace's member globs, or null when the repository has no workspace. */
function workspaceGlobs(repo) {
	const pnpm = read(path.join(repo, 'pnpm-workspace.yaml'));
	if (pnpm !== null) return parseDocument(pnpm).toJSON()?.packages ?? [];
	const pkg = JSON.parse(read(path.join(repo, 'package.json')) ?? '{}');
	const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
	return ws ?? null;
}

function hasEslintConfig(dir) {
	return ESLINT_CONFIGS.some((f) => fs.existsSync(path.join(dir, f)));
}

/**
 * The repository's projects. JS: { dir, rel, deps, pm, exec }, the workspace members when there
 * is a workspace (so a stray package.json in a scratch folder is not a project), else every
 * package.json. Python: { dir, rel, text } for every pyproject.toml with a [project] table.
 */
export function findProjects(repo) {
	const found = manifests(repo);
	const globs = workspaceGlobs(repo);
	const member = (r) => {
		if (!globs) return true;
		if (r === '') return true;
		const include = globs.filter((g) => !g.startsWith('!')).some((g) => globRegex(g).test(r));
		const exclude = globs.filter((g) => g.startsWith('!')).some((g) => globRegex(g.slice(1)).test(r));
		return include && !exclude;
	};
	const js = found['package.json'].filter(member).map((r) => {
		const dir = path.join(repo, r);
		const pkg = JSON.parse(read(path.join(dir, 'package.json')) || '{}');
		const pm = packageManager(dir);
		return { dir, rel: r, deps: { ...pkg.dependencies, ...pkg.devDependencies }, pm, exec: EXEC[pm] };
	});
	const py = found['pyproject.toml']
		.map((r) => ({ dir: path.join(repo, r), rel: r, text: read(path.join(repo, r, 'pyproject.toml')) }))
		.filter((p) => /^\[project\]/m.test(p.text));
	return { js, py, workspace: globs !== null };
}

const isFastapi = (py) => /["']fastapi/i.test(py.text) || FASTAPI_TABLE.test(py.text);

/** The folders fallow runs in: the workspace root, or each project without one. */
const fallowRoots = (projects) =>
	projects.workspace ? projects.js.filter((p) => p.rel === '') : projects.js;

/** Step names: `base` alone for one project, `base-<folder>` for each of several. */
function stepNames(base, list) {
	const short = (p) => (p.rel ? path.posix.basename(p.rel) : 'root');
	const clash = new Set(list.map(short).filter((s, i, all) => all.indexOf(s) !== i));
	return new Map(
		list.map((p) => [p, list.length === 1 ? base : `${base}-${clash.has(short(p)) ? p.rel.replace(/\//g, '-') : short(p)}`]),
	);
}

// ── choosing ────────────────────────────────────────────────────────────────────

/** The text of every lefthook script under `.lefthook/`: the fallow body is no longer in
 * `lefthook.yml`, so a re-run has to read it to know the set is already installed. */
function hookScriptText(repo) {
	const root = path.join(repo, '.lefthook');
	if (!fs.existsSync(root)) return '';
	const walk = (dir) =>
		fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
			entry.isDirectory()
				? walk(path.join(dir, entry.name))
				: [read(path.join(dir, entry.name)) ?? ''],
		);
	return walk(root).join('\n');
}

/** What is there already, so a re-run keeps it on. */
function installed(repo, projects) {
	const hooks = read(lefthookFile(repo)?.file) ?? '';
	const own = projects.js.map((p) => read(path.join(p.dir, ESLINT_RULES)) ?? '').join('\n');
	return {
		eslint: (set) => own.includes(`tools/eslint/${set}.mjs`),
		oxlint: (set) => projects.js.some((p) => (read(oxlintConfig(p.dir)) ?? '').includes(set)),
		fastapi: projects.py.some((p) => FASTAPI_TABLE.test(p.text)),
		typecheck: /svelte-check --tsgo|uv run pyright/.test(hooks),
		structure: /structure_check\.py --base|fallow audit --base/.test(`${hooks}\n${hookScriptText(repo)}`),
	};
}

function detect(repo, projects) {
	const had = installed(repo, projects);
	const hooks = lefthookFile(repo) !== null;
	const anyDep = (dep) => projects.js.some((p) => dep in p.deps);
	const fastapi = projects.py.some(isFastapi);
	const eslint = Object.fromEntries(
		Object.keys(ESLINT_FOR).map((s) => [s, had.eslint(s) || eslintProjects(projects).some((p) => ESLINT_FOR[s](p.deps))]),
	);
	const oxlint = Object.fromEntries(
		Object.keys(OXLINT_FOR).map((s) => [s, had.oxlint(s) || oxlintProjects(projects).some((p) => OXLINT_FOR[s](p.deps))]),
	);
	return {
		...eslint,
		...oxlint,
		fastapi: had.fastapi || fastapi,
		typecheck: had.typecheck || (hooks && (anyDep('svelte') || fastapi)),
		structure: had.structure || (hooks && (anyDep('svelte') || anyDep('typescript') || fastapi)),
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

// ── running ─────────────────────────────────────────────────────────────────────

function packageManager(cwd) {
	for (let dir = cwd; ; dir = path.dirname(dir)) {
		if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
		if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
		if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
		if (path.dirname(dir) === dir) return 'npm';
	}
}

/** The command that runs a dev dependency's binary. */
const EXEC = { pnpm: 'pnpm exec', yarn: 'yarn', npm: 'npx' };

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

/** Add JS dev dependencies the project does not have yet. */
function addJs(project, names) {
	const missing = names.filter((n) => !(n.replace(/(.)@.*$/, '$1') in project.deps));
	if (!missing.length) return;
	run(project.pm, [...(project.pm === 'npm' ? ['install', '--save-dev'] : ['add', '-D']), ...missing], project.dir);
	for (const n of missing) project.deps[n.replace(/(.)@.*$/, '$1')] = 'added';
}

/** Add Python dev dependencies the project does not mention yet. */
function addPython(py, names) {
	const missing = names.filter((n) => !new RegExp(`["']${n}\\b`).test(py.text));
	if (!missing.length) return;
	if (fs.existsSync(path.join(py.dir, 'uv.lock'))) run('uv', ['add', '--dev', ...missing], py.dir);
	else say(`→ ${where(py)}: install ${missing.join(' ')} (pip install ${missing.join(' ')})`);
	py.text = read(path.join(py.dir, 'pyproject.toml'));
}

// ── tools/ ──────────────────────────────────────────────────────────────────────

/** Copy files from this installer's tools/ into the repository's; they are rewritten every run. */
function copyDir(from, to) {
	fs.mkdirSync(to, { recursive: true });
	for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
		// A set's fixtures are the installer's, run against the checkout they came from:
		// oxlint has to resolve @oxlint/plugins for them, which the installed repository
		// cannot promise. The rule they cover is the copy that ships.
		if (entry.name === 'fixtures') continue;
		if (entry.isDirectory()) copyDir(path.join(from, entry.name), path.join(to, entry.name));
		else fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
	}
}

function copyTools(repo, files) {
	for (const file of files) {
		const from = path.join(SELF, 'tools', file);
		const to = path.join(repo, 'tools', file);
		if (fs.statSync(from).isDirectory()) copyDir(from, to);
		else {
			fs.mkdirSync(path.dirname(to), { recursive: true });
			fs.copyFileSync(from, to);
		}
	}
	if (files.length) say(`✔ tools/: ${files.join(', ')}`);
}

// ── ESLint ──────────────────────────────────────────────────────────────────────

const ESLINT_RULES = 'eslint.rules.js';
const ESLINT_NAMES = {
	'svelte-skills': 'svelteSkills',
	'untranslated-text': 'untranslatedText',
	'tailwind-patterns': 'tailwindPatterns',
	'error-handling': 'errorHandling',
};
/**
 * What init writes for every ESLint set: a rule reports only the lines the branch added since the
 * merge-base with its base, so a repository that is already large is not blocked by what was
 * there before. 'full' lints the whole file. The base is origin/HEAD, else the branch's upstream;
 * name one where branches merge elsewhere: { mode: 'branch', base: 'origin/dev' }.
 */
const INSPECTION = `		inspection: 'branch',`;
const ESLINT_ENTRIES = {
	'svelte-skills': () => `	...svelteSkills.config({
${INSPECTION}
	}),`,
	'untranslated-text': () => `	...untranslatedText.config({
${INSPECTION}
		// allow: ['Acme( Inc)?'],          // brand names and other strings that are not text
		// bannedInCode: '[\\\\u0590-\\\\u05FF]', // a script no string in code may contain (Hebrew)
		// locales: ['he', 'en'],           // keys of an inline { he: '…', en: '…' } pair
	}),`,
	'tailwind-patterns': () => `	...tailwindPatterns.config({
${INSPECTION}
		uiFiles: ['src/lib/components/ui/**'],
		darkMode: false, // true when the app toggles .dark: bg-white / text-black become errors
	}),`,
	'error-handling': () => `	...errorHandling.config({
${INSPECTION}
	}),`,
};

/** A project ESLint sets can go into: one that has an ESLint config, or a Svelte one. */
const eslintProjects = (projects) => projects.js.filter((p) => 'svelte' in p.deps || hasEslintConfig(p.dir));

/** eslint.rules.js: the copied rule sets, imported from tools/eslint, with their options. */
export function rulesConfig(sets, tools) {
	const chosen = Object.keys(ESLINT_ENTRIES).filter((s) => sets.includes(s));
	return `// The rules in ${tools}/, with their options. eslint.config spreads this list last.
${chosen.map((s) => `import ${ESLINT_NAMES[s]} from '${tools}/${s}.mjs';`).join('\n')}

export default [
${chosen.map((s) => ESLINT_ENTRIES[s]()).join('\n')}
];
`;
}

const NEW_ESLINT_CONFIG = `import svelte from 'eslint-plugin-svelte';
import tsParser from '@typescript-eslint/parser';
import toolRules from './${ESLINT_RULES}';

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
	...toolRules,
	{ ignores: ['build/', '.svelte-kit/', 'dist/', 'node_modules/'] },
];
`;

/** ESLint's own lookup order. */
export const ESLINT_CONFIGS = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].map((ext) => `eslint.config.${ext}`);

/** Make the ESLint config spread eslint.rules.js last: it holds one list per restricted-* rule.
 * An unrecognized shape is left alone (docs/support.md): null tells `writeEslint` to say so. */
export function patchEslintConfig(text) {
	if (text.includes(ESLINT_RULES)) return text;
	const esm = text.search(/^export default /m);
	if (esm >= 0) {
		const body = text.slice(esm + 'export default '.length).replace(/;\s*$/, '');
		return (
			`import toolRules from './${ESLINT_RULES}';\n` +
			text.slice(0, esm) +
			`const config = ${body};\n\n` +
			`export default [...[config].flat(), ...toolRules];\n`
		);
	}
	// CommonJS cannot import eslint.rules.js synchronously; ESLint awaits an exported promise.
	const cjs = text.match(/^module\.exports\s*=\s*/m);
	// Neither shape: the config is left as it is and `writeEslint` says what to add.
	if (!cjs) return null;
	const body = text.slice(cjs.index + cjs[0].length).replace(/;\s*$/, '');
	return (
		text.slice(0, cjs.index) +
		`const config = ${body};\n\n` +
		`module.exports = (async () => [...[config].flat(), ...(await import('./${ESLINT_RULES}')).default])();\n`
	);
}

/** The ESLint sets a project gets: the chosen ones it fits, and those it has (sets only get added). */
function eslintSetsFor(project, sets) {
	const had = read(path.join(project.dir, ESLINT_RULES)) ?? '';
	return Object.keys(ESLINT_FOR).filter(
		(s) => had.includes(`tools/eslint/${s}.mjs`) || (sets.includes(s) && ESLINT_FOR[s](project.deps)),
	);
}

/** Wire `wanted` ESLint sets into one project. */
function writeEslint(repo, project, wanted, args) {
	const own = path.join(project.dir, ESLINT_RULES);
	const previous = read(own);
	if (args.install) addJs(project, ESLINT_PEERS);
	const next = rulesConfig(wanted, rel(project.dir, path.join(repo, 'tools', 'eslint')).replace(/^(?!\.)/, './'));
	if (previous !== null && previous !== next) {
		write(`${own}.bak`, previous);
		say(`  (previous ${ESLINT_RULES} kept as ${ESLINT_RULES}.bak)`);
	}
	write(own, next);
	say(`✔ ${where(project)}: ${ESLINT_RULES} (${wanted.join(', ')})`);
	const existing = ESLINT_CONFIGS.find((f) => fs.existsSync(path.join(project.dir, f)));
	if (!existing) {
		write(path.join(project.dir, 'eslint.config.js'), NEW_ESLINT_CONFIG);
		say(`✔ ${where(project)}: eslint.config.js (new, with the Svelte / TypeScript parser setup)`);
	} else {
		const file = path.join(project.dir, existing);
		const before = read(file);
		const after = patchEslintConfig(before);
		if (after === null) {
			// A config shape this does not understand: leave it, and say what to add. Aborting the
			// whole run would skip every later project and set.
			say(
				`→ ${where(project)}: ${existing} was left alone. Spread the rules yourself:\n` +
					`    import toolRules from './${ESLINT_RULES}';\n` +
					`    export default [...yourConfig, ...toolRules];`,
			);
		} else if (after !== before) {
			write(file, after);
			say(`✔ ${where(project)}: ${existing} spreads ${ESLINT_RULES} last`);
		}
	}
}

// ── oxlint ──────────────────────────────────────────────────────────────────────

/**
 * What oxlint accepts as `-c <file>`. Its own auto-discovery is the first four, but `--config`
 * takes any path with a JS/TS extension, so a project running `oxlint -c ./oxlint.config.mjs`
 * has a config that is real and reachable and that discovery alone would miss. The JSONC two
 * are the ones this can insert into; the rest are module syntax.
 */
const OXLINT_CONFIGS = [
	'.oxlintrc.json',
	'.oxlintrc.jsonc',
	'oxlint.config.ts',
	'oxlint.config.mts',
	'oxlint.config.cts',
	'oxlint.config.js',
	'oxlint.config.mjs',
	'oxlint.config.cjs',
];
/** The ones this can insert into; the TypeScript configs are a different syntax. */
const OXLINT_JSONC = ['.oxlintrc.json', '.oxlintrc.jsonc'];

/** This project's oxlint config, if it has one. */
function oxlintConfig(dir) {
	return OXLINT_CONFIGS.map((f) => path.join(dir, f)).find((f) => fs.existsSync(f)) ?? null;
}

const oxlintProjects = (projects) =>
	projects.js.filter((p) => 'oxlint' in p.deps || oxlintConfig(p.dir) !== null);

/** The sets a project already names in its oxlint config, plus the ones its dependencies call for. */
function oxlintSetsFor(project, sets) {
	const config = read(oxlintConfig(project.dir)) ?? '';
	return Object.keys(OXLINT_FOR).filter(
		(s) => config.includes(s) || (sets.includes(s) && OXLINT_FOR[s](project.deps)),
	);
}

/** The index of the quote closing the string that opens at `i`. */
function skipString(text, i, quote = '"') {
	for (let j = i + 1; j < text.length; j++) {
		if (text[j] === '\\') j++;
		else if (text[j] === quote) return j;
	}
	return text.length;
}

/** Skip spaces, tabs and the two JavaScript comment forms, and return where the next token is. */
function skipTrivia(text, i) {
	while (i < text.length) {
		const c = text[i];
		if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
		else if (c === '/' && text[i + 1] === '/') {
			const end = text.indexOf('\n', i);
			if (end < 0) return text.length;
			i = end;
		} else if (c === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 1);
			if (end < 0) return text.length;
			i = end + 2;
		} else return i;
	}
	return i;
}

/** The index of the value's last character that starts at `i`: the closing quote of a string,
 * the bracket that matches an object or array, or the last character of a primitive. */
function skipValue(text, i) {
	const open = text[i];
	if (open === '"' || open === "'") return skipString(text, i, open);
	if (open !== '{' && open !== '[') {
		let j = i;
		while (j < text.length && !',}]'.includes(text[j])) j++;
		return j - 1;
	}
	const close = open === '{' ? '}' : ']';
	let depth = 0;
	for (; i < text.length; i++) {
		const c = text[i];
		if (c === '"' || c === "'") i = skipString(text, i, c);
		else if (c === '/' && text[i + 1] === '/') {
			const end = text.indexOf('\n', i);
			i = end < 0 ? text.length : end;
		} else if (c === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 1);
			if (end < 0) return text.length - 1;
			i = end + 1;
		} else if (c === open) depth++;
		else if (c === close && --depth === 0) return i;
	}
	return text.length - 1;
}

/** The indentation of the line `pos` sits on. */
const lineIndent = (text, pos) => /^[ \t]*/.exec(text.slice(text.lastIndexOf('\n', pos) + 1))[0];

/** The span of the value of a member `key` of the object that opens at `open`, or null.
 *
 * Only depth-1 members count: a `rules` inside an `overrides` entry is not the config's root
 * `rules`, and a line-based match used to take the first one anywhere in the file. In JSONC the
 * key is quoted; in a TypeScript config it is usually bare, so the quotes are optional. */
function jsoncValue(text, key, open) {
	if (open < 0 || text[open] !== '{') return null;
	let i = open + 1;
	while (i < text.length) {
		i = skipTrivia(text, i);
		if (text[i] === '}') return null;
		let name;
		if (text[i] === '"' || text[i] === "'") {
			const end = skipString(text, i, text[i]);
			name = text.slice(i + 1, end);
			i = end + 1;
		} else {
			const bare = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
			if (!bare) return null;
			name = bare[0];
			i += bare[0].length;
		}
		i = skipTrivia(text, i);
		if (text[i] !== ':') return null;
		const start = skipTrivia(text, i + 1);
		const end = skipValue(text, start);
		if (name === key) return { start, end };
		i = skipTrivia(text, end + 1);
		if (text[i] === ',') i++;
	}
	return null;
}

/**
 * Add `entry` as the last member under the top-level `key`, leaving comments where they are.
 * Null when the key is absent. Comment-only and blank lines are not members, so the comma goes
 * after the last real one rather than in front of a comment; an empty container in either layout
 * takes the entry directly. `open` is the object `jsoncValue` scans.
 */
function jsoncAppend(text, key, entry, open) {
	const value = jsoncValue(text, key, open);
	if (value === null) return null;
	const inner = text.slice(value.start + 1, value.end);
	if (inner.trim() === '') {
		if (!inner.includes('\n')) {
			const before = text.slice(0, value.end).replace(/[ \t\r]+$/, '');
			return `${before}${entry}${text.slice(value.end)}`;
		}
		// An empty multiline container: the entry sits one level in from the brackets, so the
		// closing bracket keeps its own line.
		const indent = lineIndent(text, value.start);
		return `${text.slice(0, value.start + 1)}\n${indent}\t${entry}\n${indent}${text.slice(value.end)}`;
	}
	if (!inner.includes('\n')) {
		const sep = inner.trimEnd().endsWith(',') ? '' : ', ';
		const before = text.slice(0, value.end).replace(/[ \t\r]+$/, '');
		// A space before the closing brace is kept, so adding a second entry to a one-line object
		// does not close it up (`{ "a": 1, "b": 2 }`, not `{ "a": 1, "b": 2}`).
		const space = text.slice(before.length, value.end) === '' ? '' : ' ';
		return `${before}${sep}${entry}${space}${text.slice(value.end)}`;
	}
	const lineStart = text.lastIndexOf('\n', value.end) + 1;
	let end = lineStart - 1;
	while (end > value.start) {
		const start = text.lastIndexOf('\n', end - 1) + 1;
		if (start <= value.start) return null;
		const line = text.slice(start, end);
		const comment = line.indexOf('//');
		// A comment-only line is not a member: inserting after it would put the comma in front of
		// the comment, on a line of its own, and oxlint rejects that. Keep looking backwards.
		if ((comment === -1 ? line : line.slice(0, comment)).trim() !== '') {
			const indent = /^[ \t]*/.exec(line)[0];
			const head = (comment === -1 ? line : line.slice(0, comment)).replace(/[ \t\r]+$/, '');
			const tail = comment === -1 ? '' : ` ${line.slice(comment)}`;
			const sep = head.endsWith(',') ? '' : ',';
			return `${text.slice(0, start)}${head}${sep}${tail}\n${indent}${entry}${text.slice(end)}`;
		}
		end = start - 1;
	}
	return null;
}

/** Add a whole top-level `key: value` to a config object that has no such key. */
function jsoncAddKey(text, key, value, open, ts) {
	if (jsoncValue(text, key, open) !== null || open < 0) return null;
	const rest = text.slice(open + 1);
	// Whatever followed the brace keeps its own line, so a key added to a one-line object is
	// still a depth-1 member for the next lookup rather than sitting after it on that line.
	const tail = rest.startsWith('\n') ? rest : `\n\t${rest.replace(/^[ \t]+/, '')}`;
	return `${text.slice(0, open + 1)}\n\t${keyText(key, ts)}: ${value},${tail}`;
}

/** Where the top-level config object opens. */
function configObjectStart(text, ts) {
	if (!ts) {
		const start = skipTrivia(text, 0);
		return text[start] === '{' ? start : text.indexOf('{');
	}
	// A module config wraps the object, and `import { defineConfig }` puts a brace before it, so
	// the first `{` in the file is the wrong one. `.js`, `.mjs` and `.cts` default-export it;
	// `.cjs`, and a `.js` in a CommonJS package, assign it to `module.exports`.
	const call = /\bdefineConfig\s*\(\s*\{/u.exec(text);
	if (call) return call.index + call[0].lastIndexOf('{');
	const exported = /^[ \t]*(?:export default\s*|module\.exports\s*=\s*)\{/mu.exec(text);
	return exported ? exported.index + exported[0].lastIndexOf('{') : -1;
}

/** `key` as the config's syntax writes it: quoted in JSONC, bare for a TypeScript identifier. */
const keyText = (key, ts) => (ts && /^[A-Za-z_$][\w$]*$/u.test(key) ? key : `"${key}"`);

/** Whether a config already registers the plugin in `jsPlugins`, so a second run says so
 * instead of falling through to the message for a config whose shape was not recognized. */
const PLUGIN_REGISTERED = /["']?name["']?[ \t]*:[ \t]*["']slop-patterns["']/u;

/** The `jsPlugins` entry for the set. */
const pluginEntry = (specifier, ts) =>
	ts
		? `{ name: "slop-patterns", specifier: ${JSON.stringify(specifier)} }`
		: `{ "name": "slop-patterns", "specifier": ${JSON.stringify(specifier)} }`;

/**
 * The set's rules, each at `warn`: any of them can be right about a framework shape the rule
 * cannot see, so none of them gates a hook (docs/enforcement.md).
 */
const SLOP_RULES = ['no-trivial-wrapper', 'no-chained-type-assertions'];

/** One `rules` entry, annotated the way the configs in the wild are. */
const ruleEntry = (name, comment) =>
	`"slop-patterns/${name}": "warn"${comment ? ' // TODO(slop-patterns-error): raise once the findings are cleaned up' : ''}`;

/**
 * The plugin's own folder, as an ignore pattern, or null when the config cannot name it. The
 * repository should not lint a tool that was copied into it: JewelryX's config already ignores
 * `tools/oxlint/anti-slop/**` for its own vendored plugin, and without the matching entry here
 * the one init installs is linted with the repository's rules — 3 warnings on JewelryX, one of
 * them its `anti-slop` rule asking for a `SAFETY:` comment inside our source.
 *
 * oxlint resolves these within the config file's directory and refuses `..`: a project whose
 * config is not at the repository root would get a pattern it will not load at all. That is the
 * one case where the entry is left out, and nothing is lost by it — oxlint only lints the files
 * it is pointed at, and that project is not pointed at the root's tools/.
 */
const ignoreEntry = (specifier) => {
	const folder = path.posix.dirname(specifier).replace(/^\.\//u, '');
	// `.` is a plugin sitting beside the config, which would ignore the config's whole folder.
	return folder === '.' || folder.startsWith('..') ? null : JSON.stringify(`${folder}/**`);
};

/**
 * Add `ignore` (a JSON string) to the config's `ignorePatterns`, creating the array if absent.
 * Null when there is nothing to add: the pattern is already there (a quoted form counts too) or
 * the config's shape cannot take it. One place, so the fresh and upgrade paths cannot drift.
 */
function addIgnore(text, ignore, open, ts) {
	if (ignore === null || text.includes(ignore.slice(1, -1))) return null;
	if (jsoncValue(text, 'ignorePatterns', open) !== null) {
		return jsoncAppend(text, 'ignorePatterns', ignore, open);
	}
	return jsoncAddKey(text, 'ignorePatterns', `[${ignore}]`, open, ts);
}

/**
 * Add the slop-patterns plugin to an oxlint config, in place. Rewriting the file would drop the
 * comments and finding counts these configs are hand-annotated with, so this only inserts.
 * `ts` is for `oxlint.config.ts` / `.mts`, whose keys are bare and whose object is wrapped.
 */
export function patchOxlint(text, specifier, ts = false) {
	if (text.includes('slop-patterns')) return text;
	const add = (body, key, entry, array) => {
		const open = configObjectStart(body, ts);
		const found = jsoncValue(body, key, open);
		// An entry carries its `//` comment only where it lands on a line of its own: with anything
		// after it on the line — a closing brace, another member — that becomes the comment.
		const inline = found === null || !body.slice(found.start + 1, found.end).includes('\n');
		const value = typeof entry === 'function' ? entry(!inline) : entry;
		return (
			jsoncAppend(body, key, value, open) ??
			jsoncAddKey(body, key, array ? `[${value}]` : `{ ${value} }`, open, ts)
		);
	};
	const withPlugins = add(text, 'jsPlugins', pluginEntry(specifier, ts), true);
	if (withPlugins === null) return text;
	// One call per rule, so each entry lands with the indentation the config already uses.
	let withRules = withPlugins;
	for (const name of SLOP_RULES) {
		const next = add(withRules, 'rules', (comment) => ruleEntry(name, comment), false);
		if (next === null) return text;
		withRules = next;
	}
	const ignore = ignoreEntry(specifier);
	if (ignore === null) return withRules;
	return addIgnore(withRules, ignore, configObjectStart(withRules, ts), ts) ?? withRules;
}

/**
 * Add the plugin's own folder to `ignorePatterns` when the config can safely name it (see
 * `ignoreEntry`). This is the upgrade path: the plugin is already registered, so `patchOxlint`
 * returns early, but an older `init` may have left the vendored folder out. Null when there is
 * nothing to add.
 */
export function patchOxlintIgnore(text, specifier, ts = false) {
	return addIgnore(text, ignoreEntry(specifier), configObjectStart(text, ts), ts);
}

/** Wire the oxlint sets into one project's config. */
function writeOxlint(repo, project, wanted) {
	const specifier = `./${rel(project.dir, path.join(repo, 'tools', 'oxlint', 'slop-patterns', 'index.ts'))}`;
	const file = oxlintConfig(project.dir);
	if (file === null) {
		// A fresh config names the vendored folder too, so the repository does not lint the tool it
		// just had copied in. `ignoreEntry` is null when the config cannot safely name it.
		const ignore = ignoreEntry(specifier);
		const fresh = `{\n\t"jsPlugins": [\n\t\t{ "name": "slop-patterns", "specifier": ${JSON.stringify(specifier)} }\n\t],\n\t"rules": {\n${SLOP_RULES.map((name) => `\t\t${ruleEntry(name, false)}`).join(',\n')}\n\t}${ignore ? `,\n\t"ignorePatterns": [${ignore}]` : ''}\n}\n`;
		write(path.join(project.dir, '.oxlintrc.json'), fresh);
		say(`✔ ${where(project)}: .oxlintrc.json (new, with the slop-patterns plugin)`);
		return;
	}
	const name = path.basename(file);
	const before = read(file);
	if (PLUGIN_REGISTERED.test(before)) {
		// A re-run over an install that predates the exclusion still repairs it; repeated runs add
		// nothing. A config whose shape cannot name the folder keeps that deliberate omission.
		const repaired = patchOxlintIgnore(before, specifier, !OXLINT_JSONC.includes(name));
		if (repaired !== null && repaired !== before) {
			write(file, repaired);
			say(`✔ ${where(project)}: ${name} gains the vendored-plugin ignore pattern`);
			return;
		}
		say(`✔ ${where(project)}: ${name} already loads the slop-patterns plugin`);
		return;
	}
	const after = patchOxlint(before, specifier, !OXLINT_JSONC.includes(name));
	if (after !== before) {
		write(file, after);
		say(`✔ ${where(project)}: ${name} loads the slop-patterns plugin`);
		return;
	}
	// Recognized by name but not by shape (no `export default`, so no object to insert into).
	say(
		`→ ${where(project)}: ${name} was left alone. Add\n` +
			`    jsPlugins: [{ name: 'slop-patterns', specifier: '${specifier}' }]\n` +
			`    rules: { ${SLOP_RULES.map((r) => `'slop-patterns/${r}': 'warn'`).join(', ')} }`,
	);
}

// ── lefthook ────────────────────────────────────────────────────────────────────

/** The repository's lefthook config, if it has one. */
function lefthookFile(repo) {
	const file = ['lefthook.yml', 'lefthook.yaml'].map((f) => path.join(repo, f)).find((f) => fs.existsSync(f));
	return file ? { repo, file } : null;
}

/**
 * lefthook.yml written back as it was: the yaml library folds lines over 80 characters by default,
 * which rewrites every long `run:` the project has even when the installer changes nothing.
 */
const AS_WRITTEN = { lineWidth: 0 };

/** `root` for a lefthook step: the folder relative to the repository, with a trailing slash. */
const lefthookRoot = (r) => (r ? `${posix(r).replace(/\/?$/, '/')}` : '');

/**
 * A glob for every file under `dir` (a lefthookRoot) matching `pattern`. lefthook's default
 * matcher lets `*` cross folders, and `app/**\/*.py` misses app/main.py; with
 * `glob_matcher: doublestar` `*` stops at a folder, and `**\/` also matches none.
 */
const everywhere = (doc, dir, pattern) =>
	doc.get('glob_matcher') === 'doublestar' ? `${dir}**/${pattern}` : `${dir}${pattern}`;

/**
 * Add a step to `hook` unless one of that name is there (a re-run keeps the user's edits), or a
 * step already runs the same tool for this project (`runs`): one whose root is the project's, or
 * any step when the project is the only one of its kind.
 */
function addStep(doc, hook, name, value, runs, only) {
	if (!doc.hasIn([hook, 'commands'])) doc.setIn([hook, 'commands'], doc.createNode({}));
	const steps = doc.getIn([hook, 'commands']).toJSON() ?? {};
	if (name in steps) return;
	const same = (step) => only || (step?.root ?? '') === (value.root ?? '');
	if (runs && Object.values(steps).some((step) => runs.test(step?.run ?? '') && same(step))) return;
	// `commands: {}` would otherwise get every step on one line
	const commands = doc.getIn([hook, 'commands']);
	if (commands.flow && !commands.items.length) commands.flow = false;
	doc.setIn([hook, 'commands', name], doc.createNode(value));
}

/** Add a lefthook script unless its file is already there, or a command already runs the tool.
 * Returns whether a script of this name is ours, so the caller writes the body only then. */
function addScript(doc, hook, name, value, runs) {
	if (doc.hasIn([hook, 'scripts', name])) return true;
	const commands = doc.getIn([hook, 'commands'])?.toJSON() ?? {};
	if (runs && Object.values(commands).some((step) => runs.test(step?.run ?? ''))) return false;
	if (!doc.hasIn([hook, 'scripts'])) doc.setIn([hook, 'scripts'], doc.createNode({}));
	// `scripts: {}` would otherwise get every script on one line
	const scripts = doc.getIn([hook, 'scripts']);
	if (scripts.flow && !scripts.items.length) scripts.flow = false;
	doc.setIn([hook, 'scripts', name], doc.createNode(value));
	return true;
}

/** Apply `edit(doc)` to lefthook.yml, if the repository has one. */
function editLefthook(repo, edit) {
	const lefthook = lefthookFile(repo);
	if (!lefthook) return false;
	const before = read(lefthook.file);
	const doc = parseDocument(before);
	edit(doc);
	const after = doc.toString(AS_WRITTEN);
	if (after !== before) write(lefthook.file, after);
	return true;
}

// ── fastapi ─────────────────────────────────────────────────────────────────────

const FASTAPI_TABLE = /^\[tool\.fastapi-rules[\].]/m;

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

export function patchPyproject(text, app, check) {
	if (FASTAPI_TABLE.test(text)) return text;
	return `${text.replace(/\s*$/, '\n')}\n[tool.fastapi-rules]\napp = "${app}"\n\n# FAP001 knows common libraries. Classify the rest: the calls that block the event loop, or why\n# the library is safe in async code. This lists what is missing:\n#   ${check}\n[tool.fastapi-rules.dependencies]\n`;
}

/** .flake8 that selects FAP and loads tools/python/fastapi_rules.py as a local plugin. */
export function patchFlake8(text, toolsDir) {
	const plugin = `[flake8:local-plugins]\nextension =\n    FAP = fastapi_rules:Plugin\npaths =\n    ${toolsDir}\n`;
	if (text === null) return `[flake8]\nselect = FAP\nmax-line-length = 100\n\n${plugin}`;
	let out = text;
	if (!/\bFAP\b/.test(out.replace(/^.*fastapi_rules.*$/gm, '')))
		out = /^\[flake8\]\s*$/m.test(out)
			? out.replace(/^\[flake8\]\s*$/m, '[flake8]\nextend-select = FAP')
			: `${out.replace(/\s*$/, '\n')}\n[flake8]\nextend-select = FAP\n`;
	if (out.includes('fastapi_rules:Plugin')) return out;
	if (!/^\[flake8:local-plugins\]/m.test(out)) return `${out.replace(/\s*$/, '\n')}\n${plugin}`;
	// the project has local plugins of its own: add one more to each list
	return out
		.replace(/^(\[flake8:local-plugins\][\s\S]*?^extension\s*=.*)$/m, '$1\n    FAP = fastapi_rules:Plugin')
		.replace(/^(\[flake8:local-plugins\][\s\S]*?^paths\s*=.*)$/m, `$1\n    ${toolsDir}`);
}

/** ruff's own rules for FastAPI and async code; FAP holds only what they cannot express. */
export const RUFF_RULES = ['FAST', 'ASYNC'];
const RUFF_NOTE = '# FAST, ASYNC: ruff\'s FastAPI and async rules (FAP in .flake8 has the rest)';

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

/** Add whichever of RUFF_RULES the lint table's select / extend-select lack to extend-select. */
export function patchRuff(text, table) {
	const header = tableHeader(table);
	const found = header.exec(text);
	if (!found) return `${text.replace(/\s*$/, '\n')}\n[${table}]\n${RUFF_NOTE}\nextend-select = [${quoted(RUFF_RULES)}]\n`;
	const start = found.index + found[0].length + 1;
	const next = text.slice(start).search(/^\s*\[/m);
	const end = next < 0 ? text.length : start + next;
	const body = text.slice(start, end);
	const lists = [...body.matchAll(/^(?:extend-)?select\s*=\s*\[([^\]]*)\]/gm)].map((m) => m[1]).join(' ');
	const has = new Set([...lists.matchAll(/["']([A-Z0-9]+)["']/g)].map((m) => m[1]));
	const missing = RUFF_RULES.filter((c) => !has.has(c));
	if (!missing.length) return text;
	const select = /^extend-select\s*=\s*\[([^\]]*)\]/m.exec(body);
	if (!select) return text.slice(0, start) + `${RUFF_NOTE}\nextend-select = [${quoted(missing)}]\n` + text.slice(start);
	const items = select[1].replace(/[\s,]*$/, '');
	const at = start + select.index + select[0].indexOf('[') + 1 + items.length;
	const note = body.includes(RUFF_NOTE) ? '' : `${RUFF_NOTE}\n`;
	return text.slice(0, start + select.index) + note + text.slice(start + select.index, at) + `${items ? ', ' : ''}${quoted(missing)}` + text.slice(at);
}

function writeFastapi(repo, py, args) {
	const app = findApp(py.dir);
	const tools = rel(py.dir, path.join(repo, 'tools', 'python'));
	const check = `uv run python ${tools}/fastapi_rules.py check-deps`;
	if (args.install) addPython(py, ['flake8', 'ruff']);
	const pyproject = path.join(py.dir, 'pyproject.toml');
	write(pyproject, patchPyproject(read(pyproject), app, check));
	py.text = read(pyproject);
	const flake8 = path.join(py.dir, '.flake8');
	write(flake8, patchFlake8(read(flake8), tools));
	const ruff = findRuffConfig(py.dir, repo);
	const ruffText = read(ruff.file) ?? '';
	if (patchRuff(ruffText, ruff.table) !== ruffText) write(ruff.file, patchRuff(ruffText, ruff.table));
	if (ruff.file === pyproject) py.text = read(pyproject);
	say(`✔ ${where(py)}: [tool.fastapi-rules] app = "${app}", FAP in .flake8, ruff's FAST and ASYNC`);
	return { py, app, check };
}

/** pre-commit steps: FAP on staged app files, check-deps when pyproject.toml changes, and ruff. */
function stepsFastapi(doc, wired) {
	const names = stepNames('fastapi-rules', wired.map((w) => w.py));
	for (const { py, app, check } of wired) {
		const root = lefthookRoot(py.rel);
		const at = root ? { root } : {};
		const name = names.get(py);
		const only = wired.length === 1;
		const flake8 = { glob: everywhere(doc, `${root}${app}/`, '*.py'), ...at, run: 'uv run flake8 {staged_files}' };
		addStep(doc, 'pre-commit', name, flake8, /\bflake8\b/, only);
		const deps = { glob: `${root}pyproject.toml`, ...at, run: check };
		addStep(doc, 'pre-commit', name.replace('fastapi-rules', 'fastapi-deps'), deps, /\bcheck-deps\b/, only);
		const ruff = { glob: everywhere(doc, root, '*.py'), ...at, run: 'uv run ruff check {staged_files}' };
		addStep(doc, 'pre-commit', name.replace('fastapi-rules', 'ruff'), ruff, /\bruff\b/, only);
	}
}

// ── typecheck ───────────────────────────────────────────────────────────────────

/** svelte-check's --tsgo runs TypeScript 7 (Go) beside the TypeScript 6 it loads Svelte with. */
const TSGO = ['@typescript/native', '@typescript/native-preview'];

function writeTypecheck(projects, doc, args) {
	const svelte = projects.js.filter((p) => 'svelte' in p.deps);
	const svelteNames = stepNames('svelte-check', svelte);
	for (const p of svelte) {
		if (args.install) addJs(p, ['svelte-check', ...(TSGO.some((t) => t in p.deps) ? [] : ['@typescript/native@npm:typescript@7'])]);
		const dir = lefthookRoot(p.rel);
		const sync = '@sveltejs/kit' in p.deps ? `${p.exec} svelte-kit sync && ` : '';
		const step = { glob: everywhere(doc, dir, '*.{svelte,ts,js}'), ...(dir ? { root: dir } : {}), run: `${sync}${p.exec} svelte-check --tsgo` };
		addStep(doc, 'pre-push', svelteNames.get(p), step, /\bsvelte-check\b/, svelte.length === 1);
	}
	const pyNames = stepNames('pyright', projects.py);
	for (const py of projects.py) {
		if (args.install) addPython(py, ['pyright']);
		const dir = lefthookRoot(py.rel);
		const step = { glob: everywhere(doc, dir, '*.py'), ...(dir ? { root: dir } : {}), run: 'uv run pyright' };
		addStep(doc, 'pre-push', pyNames.get(py), step, /\bpyright\b/, projects.py.length === 1);
	}
	return [...svelte, ...projects.py].map(where);
}

// ── structure ───────────────────────────────────────────────────────────────────

/**
 * fallow audit checks the base out in a temporary worktree, and fallow 3.31 cannot create one
 * where worktree.useRelativePaths is on (a bare repository with worktrees beside it). Turning it
 * off for the step does nothing in an ordinary clone.
 */
const RELATIVE_WORKTREES_OFF = {
	GIT_CONFIG_COUNT: '1',
	GIT_CONFIG_KEY_0: 'worktree.useRelativePaths',
	GIT_CONFIG_VALUE_0: 'false',
};
const BRIEF_SCRIPT = 'structure:brief';

/**
 * The branch this repository's branches merge into, as a remote ref: --base, the base a structure
 * step already names, the origin/<branch> lefthook's pre-push `files` diffs against, origin/HEAD,
 * else origin/main. Never "main" by assumption when the project says otherwise: a branch off dev
 * compared with main would own every commit dev has that main does not.
 */
export function findBase(args, lefthookText, repo) {
	if (args.base) return args.base.includes('/') ? args.base : `origin/${args.base}`;
	const push = parseDocument(lefthookText).toJSON()?.['pre-push'] ?? {};
	// A structure step's base sits in a command's `run` or, for fallow, in the script it runs.
	// Reuse whatever ref it names — another remote or a local branch, not only origin/* — so a
	// later step compares with the same history the existing one does.
	const written = /(?:structure_check\.py|fallow audit) --base (\S+)/.exec(
		`${lefthookText}\n${hookScriptText(repo)}`,
	);
	if (written) return written[1];
	const files = /\b(origin\/[\w./-]+?)\.\.\.?HEAD\b/.exec(push.files ?? '');
	if (files) return files[1];
	try {
		const options = { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
		return execFileSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], options).trim();
	} catch {
		say('→ no origin/HEAD, so structure compares with origin/main; pass --base <branch> if branches merge elsewhere');
		return 'origin/main';
	}
}

/**
 * A .fallowrc.json for a project without one. The rules are the ones JewelryX gates every push
 * with; what only JewelryX needs (its entry files, ignored folders and exports) stays there.
 */
export function fallowConfig(ignores) {
	const list = ignores.map((p) => `"${p}"`).join(', ');
	return `{
	"$schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",
	// \`fallow audit\` fails a push on an "error" finding the branch introduced; "warn" findings
	// are reported, and what the base had never fails.
	"ignorePatterns": [${list}],
	"rules": {
		// Dead code a branch leaves behind fails the push.
		"unused-dev-dependencies": "error",
		"unused-load-data-keys": "error",
		"unused-server-actions": "error",
		"unrendered-components": "error",
		"re-export-cycle": "error",
		// Reported, not failing.
		"unused-exports": "warn",
		"unused-types": "warn",
		"duplicate-exports": "warn",
		"unused-enum-members": "warn",
		"unused-class-members": "warn",
		// Vite bundles an app whichever list a package is in.
		"dev-dependencies-in-production": "off",
		// fallow 3.31 reports props passed as bind:x or {x} shorthand as unused.
		"unused-component-props": "off"
	},
	// Cognitive 25, not 15. CRAP is off: with no coverage file fallow estimates coverage and
	// flags almost any untested function over six branches.
	"health": { "maxCognitive": 25, "maxCrap": 100000 }
}
`;
}

/** What structure_check.py checks: the app package when there is one, else the whole folder. */
function pythonScope(py) {
	const app = findApp(py.dir);
	return fs.existsSync(path.join(py.dir, app)) ? app : '.';
}

/** package.json with `scripts[name]` set, in the file's own indentation. */
function withScript(text, name, command) {
	const pkg = JSON.parse(text);
	pkg.scripts = { ...pkg.scripts, [name]: command };
	return `${JSON.stringify(pkg, null, /\n([ \t]+)"/.exec(text)?.[1] ?? '\t')}\n`;
}

/** The nearest JS project at or above `dir`: where jscpd goes for a Python project there. */
const jsAbove = (projects, dir) =>
	projects.js
		.filter((p) => !path.relative(p.dir, dir).startsWith('..'))
		.sort((a, b) => b.dir.length - a.dir.length)[0];

function writeStructure(repo, projects, doc, base, args) {
	const roots = fallowRoots(projects);
	const fallowNames = stepNames('fallow', roots);
	for (const p of roots) {
		if (args.install) addJs(p, ['fallow']);
		const inside = (d) => !path.relative(p.dir, d).startsWith('..');
		const members = projects.js.filter((j) => inside(j.dir));
		const has = (dep) => members.some((j) => dep in j.deps);
		if (!['.fallowrc.json', '.fallowrc.jsonc', 'fallow.toml', '.fallow.toml'].some((f) => fs.existsSync(path.join(p.dir, f)))) {
			const ignores = [
				...projects.py.filter((py) => inside(py.dir) && py.dir !== p.dir).map((py) => `${rel(p.dir, py.dir)}/**`),
				...(p.dir === repo ? ['tools/**'] : []),
				...(has('@inlang/paraglide-js') ? ['**/paraglide/**'] : []),
				...(has('svelte') ? ['**/.svelte-check/**'] : []),
			];
			write(path.join(p.dir, '.fallowrc.json'), fallowConfig(ignores));
			say(`✔ ${where(p)}: .fallowrc.json (new: the rules fallow audit gates a push on)`);
		}
		const pkgFile = path.join(p.dir, 'package.json');
		const text = read(pkgFile);
		if (!JSON.parse(text).scripts?.[BRIEF_SCRIPT]) {
			write(pkgFile, withScript(text, BRIEF_SCRIPT, `fallow review --brief --base ${base}`));
			say(`✔ ${where(p)}: package.json script ${BRIEF_SCRIPT}, where a reviewer should look (always exits 0)`);
		}
		const dir = lefthookRoot(p.rel);
		// A command is skipped when the push's changed set has no file left after the glob filter;
		// a deletion-only push leaves none, and the dead code it orphaned goes unchecked. A lefthook
		// script is not file-filtered, so it runs either way.
		const name = `${fallowNames.get(p)}.sh`;
		const run = `${p.exec} fallow audit --base ${base}`;
		const body = `#!/usr/bin/env bash\nset -e\n${dir ? `cd ${JSON.stringify(dir)} && ` : ''}${run}\n`;
		// Only when the script is ours: a repository that already runs fallow in a command keeps
		// that policy and gains no stray file.
		if (addScript(doc, 'pre-push', name, { runner: 'bash', env: RELATIVE_WORKTREES_OFF }, /\bfallow audit\b/)) {
			writeHookScript(repo, 'pre-push', name, body);
		}
	}
	const pyNames = stepNames('python-structure', projects.py);
	for (const py of projects.py) {
		const js = jsAbove(projects, py.dir);
		if (args.install) {
			if (js) addJs(js, ['jscpd']);
			if (!/["'](flake8|mccabe)\b/.test(py.text)) addPython(py, ['mccabe']);
		}
		if (!js) say(`→ ${where(py)}: structure_check.py needs jscpd in a node_modules/.bin at or above it, or on PATH`);
		const dir = lefthookRoot(py.rel);
		const tools = rel(py.dir, path.join(repo, 'tools', 'python'));
		addStep(doc, 'pre-push', pyNames.get(py), {
			glob: everywhere(doc, dir, '*.py'),
			...(dir ? { root: dir } : {}),
			run: `uv run python ${tools}/structure_check.py --base ${base} ${pythonScope(py)}`,
		});
	}
	return [...roots.map((p) => `fallow (${where(p)})`), ...projects.py.map((py) => `structure_check.py (${where(py)})`)];
}

// ── main ────────────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2)) {
	const args = parseArgs(argv);
	if (args.command !== 'init') {
		say('usage: lint-kit init [--sets a,b] [--yes] [--no-install] [--base <branch>] [--cwd <dir>]');
		say(`sets: ${Object.keys(SETS).join(', ')}`);
		return args.command ? 2 : 0;
	}
	const cwd = path.resolve(args.cwd ?? '.');
	const repo = gitRoot(cwd) ?? cwd;
	const projects = findProjects(repo);
	const sets = await choose(args, detect(repo, projects));
	if (!sets.length) return say('nothing chosen'), 0;
	say(`sets: ${sets.join(', ')}`);
	say(`projects: ${[...projects.js, ...projects.py].map(where).join(', ') || 'none'}`);

	// the files tools/ gets, from what each set is wired into
	const linted = eslintProjects(projects)
		.map((p) => ({ p, wanted: eslintSetsFor(p, sets) }))
		.filter(({ wanted }) => wanted.length);
	const eslintSets = Object.keys(ESLINT_FOR).filter((s) => linted.some(({ wanted }) => wanted.includes(s)));
	const oxlinted = oxlintProjects(projects)
		.map((p) => ({ p, wanted: oxlintSetsFor(p, sets) }))
		.filter(({ wanted }) => wanted.length);
	const oxlintSets = Object.keys(OXLINT_FOR).filter((s) => oxlinted.some(({ wanted }) => wanted.includes(s)));
	const fastapi = sets.includes('fastapi') ? projects.py.filter(isFastapi) : [];
	const structure = sets.includes('structure');
	copyTools(repo, [
		...(eslintSets.length ? ['eslint/inspection.mjs'] : []),
		...eslintSets.flatMap((s) => [`eslint/${s}.mjs`, `eslint/${s}.md`]),
		...oxlintSets.map((s) => `oxlint/${s}`),
		...(fastapi.length ? ['python/fastapi_rules.py'] : []),
		...(structure && projects.py.length ? ['python/structure_check.py'] : []),
	]);

	for (const { p, wanted } of linted) writeEslint(repo, p, wanted, args);
	for (const { p, wanted } of oxlinted) writeOxlint(repo, p, wanted);
	const wired = fastapi.map((py) => writeFastapi(repo, py, args));
	const hooked = editLefthook(repo, (doc) => {
		const eslintNames = stepNames('eslint', linted.map(({ p }) => p));
		for (const { p } of linted) {
			const dir = lefthookRoot(p.rel);
			const step = { glob: everywhere(doc, `${dir}src/`, '*.{js,ts,svelte}'), ...(dir ? { root: dir } : {}), run: `${p.exec} eslint {staged_files}` };
			addStep(doc, 'pre-commit', eslintNames.get(p), step, /\beslint\b/, linted.length === 1);
		}
		stepsFastapi(doc, wired);
		if (sets.includes('typecheck')) say(`✔ lefthook.yml: typecheck before each push in ${writeTypecheck(projects, doc, args).join(', ') || 'no project'}`);
		if (structure) {
			const base = findBase(args, doc.toString(AS_WRITTEN), repo);
			say(`✔ lefthook.yml: ${writeStructure(repo, projects, doc, base, args).join(', ') || 'nothing'} before each push, against ${base}`);
		}
	});
	if (!hooked && (sets.includes('typecheck') || structure))
		say('→ typecheck and structure run as lefthook pre-push steps, and this repository has no lefthook.yml');
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
