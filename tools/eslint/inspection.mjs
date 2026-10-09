/**
 * inspection: what a rule is allowed to charge a branch for.
 *
 *   'full'   (the default) every line of every file, which is what a rule does with no setting.
 *   'branch' only the lines the branch added or changed since the merge-base with its base, so
 *            adopting a set on a repository that is already large does not block every commit on
 *            what was there before. The base is `inspection.base` when the config names one, else
 *            `origin/HEAD`, else the branch's upstream.
 *
 * The merge-base, not HEAD, is what makes this work outside a pre-commit hook: CI and a pre-push
 * step lint a clean checkout, where nothing is staged and a diff against HEAD is empty. Comparing
 * with the base gives the same answer in the hook, in CI and in the editor, and matches the base
 * `structure_check.py` and `fallow audit` already gate against.
 *
 * A report is kept when the line range it points at meets an added line. Everything else reports:
 * a file git does not track yet (a new file is all new, and `git diff` never shows an untracked
 * one), no git, no repository, an unresolvable base, a file outside the repository, a path git
 * printed C-quoted, and a report with no line at all. A check that cannot tell must not pass.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** The modes a config may name. */
export const MODES = ['full', 'branch'];

/** Where a set's `config()` puts the mode, and where a rule's own option overrides it. */
const SETTINGS = 'inspection';

/** The option a config entry carries, and the same option on one rule's entry. */
const INSPECTION = {
	oneOf: [
		{ enum: MODES },
		{
			type: 'object',
			additionalProperties: false,
			required: ['mode', 'base'],
			properties: { mode: { const: 'branch' }, base: { type: 'string' } },
		},
	],
};

/** The mode one rule runs under: its own option, else the set's setting, else full. */
function modeOf(context) {
	const named = context.options?.[0]?.inspection ?? context.settings?.[SETTINGS];
	if (named === undefined) return { mode: 'full' };
	return typeof named === 'string' ? { mode: named } : named;
}

function git(cwd, args) {
	try {
		const options = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
		return execFileSync('git', args, options);
	} catch {
		return null;
	}
}

/**
 * `origin/HEAD`, else the branch's upstream. `init` writes the base the structure steps use when
 * `--base` names one, so the two gates compare with the same history.
 */
function defaultBase(root) {
	const head = git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])?.trim();
	if (head) return head;
	return git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])?.trim() || null;
}

/** `+++` header path -> the line numbers that follow it. null when a path came back quoted. */
function addedLines(diff) {
	const added = new Map();
	let lines = null;
	for (const line of diff.split('\n')) {
		if (line.startsWith('+++ ')) {
			const name = line.slice(4);
			if (name.startsWith('"')) return null; // C-quoted: it cannot be matched to a filename
			lines = name === '/dev/null' ? null : (added.get(name) ?? new Set());
			if (lines) added.set(name, lines);
			continue;
		}
		if (lines === null || !line.startsWith('@@ ')) continue;
		// @@ -old,count +new,count @@ heading — the third field is the range in this file.
		const [start, count] = line.split(' ')[2].slice(1).split(',');
		for (let n = Number(start); n < Number(start) + Number(count ?? 1); n++) lines.add(n);
	}
	return added;
}

/** {root, added, untracked} for the branch's base, or null when git cannot say (then everything
 *  reports). */
function branchLines(cwd, base) {
	const root = git(cwd, ['rev-parse', '--show-toplevel'])?.trim();
	if (!root) return null;
	const ref = base ?? defaultBase(root);
	if (!ref) return null;
	const mergeBase = git(root, ['merge-base', 'HEAD', ref])?.trim();
	if (!mergeBase) return null;
	// core.quotePath off, so a path with non-ASCII in it is the path and not an escape sequence.
	const diff = git(root, ['-c', 'core.quotePath=false', 'diff', '-U0', '--no-color', '--no-prefix', mergeBase]);
	if (diff === null) return null;
	const added = addedLines(diff);
	if (added === null) return null;
	const others = git(root, ['ls-files', '-z', '--others', '--exclude-standard']);
	if (others === null) return null;
	return { root, added, untracked: new Set(others.split('\0').filter(Boolean)) };
}

const cache = new Map();

/** One `git diff` per run, however many files are linted. */
function branchLinesOnce(cwd, base) {
	const key = `${cwd}\0${base ?? ''}`;
	if (!cache.has(key)) cache.set(key, branchLines(cwd, base));
	return cache.get(key);
}

/** The repository-relative path of the linted file, or null for stdin and files outside it. */
function relative(root, context) {
	const filename = context.physicalFilename || context.filename;
	if (!filename || filename.startsWith('<')) return null;
	const rel = path.relative(root, path.resolve(context.cwd, filename));
	if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
	return rel.split(path.sep).join('/');
}

/** The lines a report points at, or null when it names none. */
function linesOf(descriptor) {
	const loc = descriptor.loc ?? descriptor.node?.loc;
	if (!loc?.start?.line) return null;
	return [loc.start.line, loc.end?.line ?? loc.start.line];
}

/** Whether a report is on a line the branch added. Anything it cannot tell, it reports. */
export function isEligible(context, descriptor) {
	const named = modeOf(context);
	if (named.mode === 'full') return true;
	const state = branchLinesOnce(context.cwd, named.base);
	if (!state) return true;
	const file = relative(state.root, context);
	if (!file) return true;
	if (state.untracked.has(file)) return true; // a new file is all new
	const added = state.added.get(file);
	if (!added) return false; // tracked and unchanged since the base: nothing here is new
	const range = linesOf(descriptor);
	if (!range) return true;
	for (let line = range[0]; line <= range[1]; line++) if (added.has(line)) return true;
	return false;
}

/**
 * A rule with the `inspection` option on it, and every report it makes held to the lines the
 * branch added. Wrapping the rule is what keeps the check in one place: a rule's own reports stay
 * exactly as they are written.
 *
 * The child object is how ESLint itself hands a rule its context (`Object.create` in FileContext),
 * and it is also the only way to replace `report`: on the context it is a frozen own property, so
 * a proxy that returns something else for it throws.
 */
export function defineRule(rule) {
	const schema = rule.meta?.schema;
	const base = Array.isArray(schema) ? schema[0] : schema;
	return {
		...rule,
		meta: {
			...rule.meta,
			schema: [
				{
					type: 'object',
					additionalProperties: false,
					...base,
					properties: { inspection: INSPECTION, ...base?.properties },
				},
			],
		},
		create(context) {
			if (modeOf(context).mode === 'full') return rule.create(context);
			const report = context.report.bind(context);
			const gated = Object.create(context, {
				report: {
					value: (descriptor) => {
						if (isEligible(context, descriptor)) report(descriptor);
					},
				},
			});
			return rule.create(gated);
		},
	};
}

/**
 * The `settings` entry a set's config writes. Exported so every set names the mode the same way.
 * @param {'full' | 'branch' | { mode: 'branch', base: string }} [inspection]
 */
export function settings(inspection) {
	return inspection === undefined ? {} : { settings: { [SETTINGS]: inspection } };
}
