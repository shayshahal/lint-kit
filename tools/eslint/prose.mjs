/**
 * prose: the two things a comment can be wrong about, without an opinion about the code.
 *
 *   no-jargon    inflated vocabulary in a comment: `utilize`, `leverage`, `prior to`. Each one has
 *                a plain word that says the same thing, and the report carries it as a suggestion,
 *                so `--fix`-style edits are one keystroke. A word inside backticks or double
 *                quotes is being named, not used, and passes.
 *   prefer-jsdoc a `//` comment directly above an export or a member, which is documentation that
 *                editors cannot show: autofixed to `/** *\/`. A directive, a TODO/FIXME marker and
 *                a license header are not documentation and are left alone.
 *
 * Both are opinionated, so the set is opt-in: init never selects it from a project's dependencies
 * (see OPT_IN in bin/lint-kit.js), and a repository that wants it asks for it by name.
 */

import { defineRule, settings } from './inspection.mjs';

/** Files the rules apply to by default; tests, specs and stories are out of scope. */
export const DEFAULT_FILES = ['src/**/*.svelte', 'src/**/*.ts', 'src/**/*.js'];
export const DEFAULT_IGNORES = ['src/tests/**', '**/*.test.ts', '**/*.spec.ts', '**/*.stories.*'];

/**
 * Inflated word -> the plain one. Every form worth catching is its own entry, so the suggestion is
 * the word that belongs in that sentence (`utilizes` -> `uses`, not `use`) and the message is
 * never approximate. A word that is not here is a word someone will want: `extra` adds one and
 * `allow` drops one.
 *
 * `therefore` and `attempt` were measured on a real repository and taken out: 10 findings each,
 * and every one was the right word for its sentence (`the base is therefore applied at most once`,
 * `attempt token refresh and retry`). Formal is not inflated, and a retry has attempts.
 */
export const JARGON = {
	utilize: 'use',
	utilizes: 'uses',
	utilized: 'used',
	utilizing: 'using',
	utilization: 'use',
	leverage: 'use',
	leverages: 'uses',
	leveraged: 'used',
	leveraging: 'using',
	facilitate: 'help',
	facilitates: 'helps',
	facilitated: 'helped',
	endeavor: 'try',
	endeavors: 'tries',
	commence: 'start',
	commences: 'starts',
	initiate: 'start',
	initiates: 'starts',
	terminate: 'end',
	terminates: 'ends',
	ascertain: 'find out',
	demonstrate: 'show',
	demonstrates: 'shows',
	demonstrated: 'showed',
	additionally: 'also',
	furthermore: 'also',
	moreover: 'also',
	subsequently: 'then',
	obtain: 'get',
	obtains: 'gets',
	obtained: 'got',
	assist: 'help',
	assists: 'helps',
	sufficient: 'enough',
	sufficiently: 'enough',
	regarding: 'about',
	numerous: 'many',
	myriad: 'many',
	plethora: 'many',
	comprehensive: 'complete',
	delve: 'look into',
	'prior to': 'before',
	'in order to': 'to',
	'due to the fact that': 'because',
	'in the event that': 'if',
	'at this point in time': 'now',
	'for the purpose of': 'to',
	'is able to': 'can',
	'has the ability to': 'can',
	'a number of': 'some',
	'with regard to': 'about',
};

/** A directive is an instruction to a tool, not prose. */
const DIRECTIVE = /^\s*(eslint-|oxlint-|stylelint-|prettier-|@ts-|istanbul|v8 |c8 |global |exported )/u;

/** Spans of a comment that name a word rather than use it: `code` and "quoted". */
function quotedSpans(text) {
	const spans = [];
	for (const marker of ['`', '"']) {
		for (let at = text.indexOf(marker); at !== -1; at = text.indexOf(marker, at + 1)) {
			const end = text.indexOf(marker, at + 1);
			if (end === -1) break;
			spans.push([at, end]);
			at = end;
		}
	}
	return spans;
}

/** Report inflated vocabulary in a comment, with the plain word as a suggestion. */
export const noJargon = defineRule({
	meta: {
		type: 'suggestion',
		hasSuggestions: true,
		docs: {
			description: 'A comment says what it means in plain words.',
			url: new URL('./prose.md#no-jargon', import.meta.url).href,
		},
		schema: [
			{
				type: 'object',
				properties: {
					extra: { type: 'object', additionalProperties: { type: 'string' } },
					allow: { type: 'array', items: { type: 'string' } },
				},
				additionalProperties: false,
			},
		],
		messages: {
			jargon: '`{{word}}` is inflated prose; write `{{plain}}`.',
			use: 'Use `{{plain}}`.',
		},
	},
	create(context) {
		const { extra = {}, allow = [] } = context.options[0] ?? {};
		const allowed = new Set(allow.map((w) => w.toLowerCase()));
		const words = { ...JARGON, ...extra };
		const keys = Object.keys(words).filter((w) => !allowed.has(w.toLowerCase()));
		if (!keys.length) return {};
		// Longest first, so `in order to` wins over a word inside it.
		keys.sort((a, b) => b.length - a.length);
		const pattern = new RegExp(`\\b(${keys.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'giu');

		const check = (comment) => {
			if (DIRECTIVE.test(comment.value)) return;
			const text = comment.value;
			const quoted = quotedSpans(text);
			for (const match of text.matchAll(pattern)) {
				const at = match.index;
				if (quoted.some(([start, end]) => at >= start && at < end)) continue;
				const word = match[0];
				const plain = words[match[1].toLowerCase()];
				const [start, end] = [comment.range[0] + 2 + at, comment.range[0] + 2 + at + word.length];
				context.report({
					loc: { start: comment.loc.start, end: comment.loc.end },
					messageId: 'jargon',
					data: { word, plain },
					suggest: [{ messageId: 'use', data: { plain }, fix: (fixer) => fixer.replaceTextRange([start, end], plain) }],
				});
			}
		};
		return {
			Program() {
				for (const comment of context.sourceCode.getAllComments()) check(comment);
			},
		};
	},
});

/** Not documentation: an instruction to a tool, or a marker for work left to do. */
const NOT_DOCUMENTATION = /^\s*(eslint-|oxlint-|stylelint-|prettier-|@ts-|istanbul|v8 |c8 |TODO|FIXME|HACK|XXX|region|endregion)/iu;

/** The value of a `//` comment, without the marker and its single leading space. */
const lineText = (comment) => comment.value.replace(/^\s?/u, '').trimEnd();

/** A class member, an interface or type member, or an enum member: the surface of a type. */
const MEMBER = new Set(['MethodDefinition', 'PropertyDefinition', 'TSPropertySignature', 'TSMethodSignature', 'TSEnumMember']);

/** A `//` comment above an export or a member, as JSDoc. */
export const preferJsdoc = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		docs: {
			description: 'Documentation on an export or a member is JSDoc, which editors can show.',
			url: new URL('./prose.md#prefer-jsdoc', import.meta.url).href,
		},
		schema: [],
		messages: {
			jsdoc: 'A `//` comment here is documentation an editor will not show. Use `/** */`, which it will.',
		},
	},
	create(context) {
		const sourceCode = context.sourceCode;

		const check = (node) => {
			const last = sourceCode.getTokenBefore(node, { includeComments: true });
			if (last?.type !== 'Line' || last.loc.end.line + 1 !== node.loc.start.line) return;
			if (NOT_DOCUMENTATION.test(last.value)) return;
			// The whole run of `//` lines above, not only the one touching the declaration.
			let first = last;
			for (;;) {
				const before = sourceCode.getTokenBefore(first, { includeComments: true });
				if (before?.type !== 'Line' || before.loc.end.line + 1 !== first.loc.start.line) break;
				first = before;
			}
			if (NOT_DOCUMENTATION.test(first.value)) return;
			const between = sourceCode.getTokensBetween(first, last, { includeComments: true });
			const run = first === last ? [first] : [first, ...between, last];
			const lines = run.map(lineText);
			const indent = ' '.repeat(first.loc.start.column);
			const block =
				lines.length === 1
					? `/** ${lines[0]} */`
					: `/**\n${lines.map((line) => (line ? `${indent} * ${line}` : `${indent} *`)).join('\n')}\n${indent} */`;
			context.report({
				loc: { start: first.loc.start, end: last.loc.end },
				messageId: 'jsdoc',
				fix: (fixer) => fixer.replaceTextRange([first.range[0], last.range[1]], block),
			});
		};

		return {
			ExportNamedDeclaration: check,
			ExportDefaultDeclaration: check,
			...Object.fromEntries([...MEMBER].map((type) => [type, check])),
		};
	},
});

export const plugin = {
	meta: { name: 'prose' },
	rules: { 'no-jargon': noJargon, 'prefer-jsdoc': preferJsdoc },
};

/**
 * Flat-config entries with both rules at error.
 * @param {{ files?: string[], ignores?: string[], inspection?: 'full' | 'branch' | { mode: 'branch', base: string }, rules?: Record<string, import('eslint').Linter.RuleEntry> }} [options] - ignores are added to the defaults; `inspection` narrows both rules to the lines the branch added (see inspection.mjs); `rules` overrides a rule's entry.
 */
export function config({ files = DEFAULT_FILES, ignores = [], inspection, rules: overrides = {} } = {}) {
	return [
		{
			name: 'prose',
			files,
			ignores: [...DEFAULT_IGNORES, ...ignores],
			plugins: { prose: plugin },
			...settings(inspection),
			rules: {
				'prose/no-jargon': 'error',
				'prose/prefer-jsdoc': 'error',
				...overrides,
			},
		},
	];
}

export default { plugin, config, JARGON };
