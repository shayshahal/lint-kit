/**
 * error-handling: errors that are caught and then lost. Three patterns that unreviewed generated
 * code is full of (slop-scan, github.com/modem-dev/slop-scan, measures them):
 *
 *   no-swallowed-catch       a catch block that is empty, only logs, or only returns an empty value
 *   no-default-promise-catch the same in a promise's .catch(): .catch(() => null),
 *                            .catch(() => {}), .catch(console.error)
 *   no-stringified-error     String(e), `${e}`, e + '' and e.toString() on a caught error
 *
 * A comment inside the catch block (or the .catch callback) is the reason it is deliberate, and
 * passes: `catch { /* the cache is optional *\/ }`.
 */

import { defineRule, settings } from './inspection.mjs';

/** Files the rules apply to by default; tests and stories mock and swallow on purpose. */
export const DEFAULT_FILES = ['src/**/*.svelte', 'src/**/*.ts', 'src/**/*.js'];
export const DEFAULT_IGNORES = ['src/tests/**', '**/*.test.ts', '**/*.spec.ts', '**/*.stories.*'];

const DOCS = new URL('./error-handling.md', import.meta.url).href;

/**
 * Flat-config entries with the three rules at error.
 * @param {{ files?: string[], ignores?: string[], inspection?: 'full' | 'branch' | { mode: 'branch', base: string }, rules?: Record<string, import('eslint').Linter.RuleEntry> }} [options] - ignores are added to the defaults; `inspection` narrows every rule to the lines the branch added (see inspection.mjs); `rules` overrides a rule's entry.
 */
export function config({ files = DEFAULT_FILES, ignores = [], inspection, rules: overrides = {} } = {}) {
	return [
		{
			name: 'error-handling',
			files,
			ignores: [...DEFAULT_IGNORES, ...ignores],
			plugins: { 'error-handling': plugin },
			...settings(inspection),
			rules: {
				'error-handling/no-swallowed-catch': 'error',
				'error-handling/no-default-promise-catch': 'error',
				'error-handling/no-stringified-error': 'error',
				...overrides,
			},
		},
	];
}

const LOGGERS = /^(console|log|logger|.*Logger)$/;
const LEVELS = new Set(['log', 'info', 'warn', 'error', 'debug', 'trace']);

/** console.error, logger.warn, this.logger.info… */
function isLogger(node) {
	if (node?.type !== 'MemberExpression' || node.computed || !LEVELS.has(node.property.name)) return false;
	const object = node.object.type === 'MemberExpression' ? node.object.property : node.object;
	return object.type === 'Identifier' && LOGGERS.test(object.name);
}

const isLogStatement = (s) =>
	s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' && isLogger(s.expression.callee);

/**
 * An empty value the caller cannot tell from a real result: null / undefined, '', [] or {}.
 * Booleans and numbers are answers and statuses (`catch { return false; }` in a predicate, an
 * exit code after the error is reported), so they pass.
 */
function isDefault(node) {
	if (!node) return true; // return;
	switch (node.type) {
		case 'Literal':
			return node.value === null || node.value === '';
		case 'Identifier':
			return node.name === 'undefined';
		case 'ArrayExpression':
			return node.elements.length === 0;
		case 'ObjectExpression':
			return node.properties.length === 0;
		case 'UnaryExpression':
			return node.operator === 'void';
		case 'TemplateLiteral':
			return node.expressions.length === 0 && node.quasis[0].value.cooked === '';
		default:
			return false;
	}
}

/**
 * What a handler block does with the error: 'empty', 'log' (logs and carries on), 'default'
 * (logs or not, then returns a fixed value), or null when it handles it.
 */
function swallows(statements) {
	if (statements.length === 0) return 'empty';
	const last = statements.at(-1);
	const returnsDefault = last.type === 'ReturnStatement' && isDefault(last.argument);
	const logs = returnsDefault ? statements.slice(0, -1) : statements;
	if (!logs.every(isLogStatement)) return null;
	return returnsDefault ? 'default' : 'log';
}

const hasComment = (context, node) => context.sourceCode.getCommentsInside(node).length > 0;

const MESSAGES = {
	empty: 'This catch drops the error. Handle it, rethrow it, or say in a comment here why it can be ignored.',
	log: 'This catch logs the error and carries on as if nothing failed. Handle it (fail(), error(), a state the UI shows) or rethrow it.',
	default:
		'This catch turns the error into a fixed value, so the caller cannot tell a failure from an empty result. Rethrow, or return something the caller checks.',
};

export const noSwallowedCatch = defineRule({
	meta: {
		type: 'problem',
		docs: { description: 'A catch block must handle or rethrow the error.', url: `${DOCS}#no-swallowed-catch` },
		schema: [],
		messages: MESSAGES,
	},
	create(context) {
		return {
			CatchClause(node) {
				const kind = swallows(node.body.body);
				if (kind && !hasComment(context, node.body)) context.report({ node, messageId: kind });
			},
		};
	},
});

/** The handler of `p.catch(handler)`. */
const catchHandler = (node) =>
	node.callee.type === 'MemberExpression' &&
	!node.callee.computed &&
	node.callee.property.name === 'catch' &&
	node.arguments.length === 1
		? node.arguments[0]
		: null;

export const noDefaultPromiseCatch = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description: "A promise's .catch() must handle or rethrow the error.",
			url: `${DOCS}#no-default-promise-catch`,
		},
		schema: [],
		messages: MESSAGES,
	},
	create(context) {
		return {
			CallExpression(node) {
				const handler = catchHandler(node);
				if (!handler) return;
				if (isLogger(handler)) return context.report({ node: handler, messageId: 'log' });
				if (handler.type !== 'ArrowFunctionExpression' && handler.type !== 'FunctionExpression') return;
				if (hasComment(context, handler.body)) return;
				// `promise.catch(() => {})` on a promise held elsewhere marks it handled; whoever
				// awaits it still gets the error. A fresh call's promise has nobody else.
				const held = ['Identifier', 'MemberExpression'].includes(node.callee.object.type);
				if (held && handler.body.type === 'BlockStatement' && handler.body.body.length === 0) return;
				const kind =
					handler.body.type === 'BlockStatement'
						? swallows(handler.body.body)
						: isDefault(handler.body)
							? 'default'
							: handler.body.type === 'CallExpression' && isLogger(handler.body.callee)
								? 'log'
								: null;
				if (kind) context.report({ node: handler, messageId: kind });
			},
		};
	},
});

/** `x instanceof Error` (or its negation) tested on this error, above `node`. */
function narrowed(node, name) {
	for (let n = node.parent; n; n = n.parent) {
		if (n.type !== 'ConditionalExpression' && n.type !== 'IfStatement') continue;
		const test = n.test.type === 'UnaryExpression' ? n.test.argument : n.test;
		if (test.type === 'BinaryExpression' && test.operator === 'instanceof' && test.left.name === name) return true;
	}
	return false;
}

/** How `ref` (the error) is turned into a string, if it is. */
function stringified(ref) {
	const p = ref.parent;
	if (p.type === 'CallExpression' && p.callee.type === 'Identifier' && p.callee.name === 'String' && p.arguments[0] === ref)
		return p;
	if (p.type === 'TemplateLiteral') return p;
	if (p.type === 'BinaryExpression' && p.operator === '+') {
		const other = p.left === ref ? p.right : p.left;
		if ((other.type === 'Literal' && typeof other.value === 'string') || other.type === 'TemplateLiteral') return p;
	}
	if (p.type === 'MemberExpression' && p.object === ref && p.property.name === 'toString' && p.parent.type === 'CallExpression')
		return p.parent;
	return null;
}

export const noStringifiedError = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description: 'A caught error is passed on whole, not turned into a string.',
			url: `${DOCS}#no-stringified-error`,
		},
		schema: [],
		messages: {
			stringified:
				"Turning a caught error into a string drops its stack and cause, and gives '[object Object]' for anything that is not an Error. Pass the error itself ({ cause: e }, logger.error(e)), or read e.message after `e instanceof Error`.",
		},
	},
	create(context) {
		const check = (param, scopeNode) => {
			if (param?.type !== 'Identifier') return;
			const [variable] = context.sourceCode.getDeclaredVariables(scopeNode).filter((v) => v.name === param.name);
			for (const { identifier } of variable?.references ?? []) {
				const node = stringified(identifier);
				if (node && !narrowed(node, param.name)) context.report({ node, messageId: 'stringified' });
			}
		};
		return {
			CatchClause(node) {
				check(node.param, node);
			},
			CallExpression(node) {
				const handler = catchHandler(node);
				if (handler?.type === 'ArrowFunctionExpression' || handler?.type === 'FunctionExpression')
					check(handler.params[0], handler);
			},
		};
	},
});

export const plugin = {
	meta: { name: 'error-handling' },
	rules: {
		'no-swallowed-catch': noSwallowedCatch,
		'no-default-promise-catch': noDefaultPromiseCatch,
		'no-stringified-error': noStringifiedError,
	},
};

export default { plugin, config };
