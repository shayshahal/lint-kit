import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

/**
 * SvelteKit keeps its parameter matchers in `src/params/<name>.ts` and calls them from the
 * router by convention, so a one-line `export const match = (param) => SET.has(param)` there is
 * the shape the framework requires, not indirection worth removing. A file beside the folder
 * (`src/params.ts`) is not one, so it stays reportable.
 */
const SVELTEKIT_PARAM_MATCHERS = /(?:^|[/\\])src[/\\]params[/\\][^/\\]+\.[cm]?[jt]s$/u;

/**
 * A test double's `get`, `set` and `delete` forward to a `Map` because they must mirror the
 * real signature, so forwarding is the point there and the rule stays out of test files.
 */
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|[/\\](?:tests?|__tests__)[/\\]/u;

/**
 * `ESTree.Function` covers `FunctionDeclaration` and `FunctionExpression`; there is no
 * `ESTree.FunctionDeclaration` or `ESTree.FunctionExpression` to name, and referring to one is a
 * TS2694 that makes the union `any`, taking the type safety of every access below with it.
 */
type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

type CallLike = ESTree.CallExpression | ESTree.NewExpression;

/**
 * SlopCodeBench's `trivial_wrappers`: a function that only calls another function. Named
 * functions only: an inline `(value) => fn(value)` adapter is a callback signature being
 * reshaped, which is idiomatic and has no name to remove.
 */

/** Remove the wrappers that do not change which value the expression produces. */
function unwrap(expression: ESTree.Expression): ESTree.Expression {
	switch (expression.type) {
		case "AwaitExpression":
			return unwrap(expression.argument);
		case "ChainExpression":
		case "TSAsExpression":
		case "TSNonNullExpression":
		case "TSSatisfiesExpression":
		case "TSTypeAssertion":
			return unwrap(expression.expression);
		default:
			return expression;
	}
}

/** The one expression a function body evaluates to, when the body is nothing else. */
function soleBodyExpression(node: FunctionNode): ESTree.Expression | null {
	const body: ESTree.Node | null | undefined = node.body;
	if (body === null || body === undefined) return null;
	if (body.type !== "BlockStatement") return body as ESTree.Expression;
	if (body.body.length !== 1) return null;
	const statement = body.body[0];
	if (statement.type === "ReturnStatement") return statement.argument ?? null;
	if (statement.type === "ExpressionStatement") return statement.expression;
	return null;
}

/** The call the body makes, when that is all the body does. */
function soleForwardingCall(node: FunctionNode): CallLike | null {
	const body = soleBodyExpression(node);
	if (body === null) return null;
	const expression = unwrap(body);
	if (expression.type === "CallExpression" || expression.type === "NewExpression") {
		return expression;
	}
	return null;
}

/** Whether the expression is a plain reference to something, not a computed value. */
function isStaticReference(expression: ESTree.Expression): boolean {
	switch (expression.type) {
		case "Identifier":
		case "ThisExpression":
			return true;
		case "ChainExpression":
			return isStaticReference(expression.expression);
		case "MemberExpression":
			return !expression.computed && isStaticReference(expression.object);
		default:
			return false;
	}
}

/** Whether the call passes every parameter on unchanged, in order, and nothing else. */
function forwardsEveryParameter(node: FunctionNode, call: CallLike): boolean {
	const parameters = node.params;
	const args = call.arguments;
	if (parameters.length === 0 || parameters.length !== args.length) return false;
	return parameters.every((parameter, index) => {
		const argument = args[index];
		return (
			parameter.type === "Identifier" &&
			argument.type === "Identifier" &&
			parameter.name === argument.name
		);
	});
}

/** The name the wrapper is known by. Anonymous functions have none and are skipped. */
function wrapperName(node: FunctionNode): string | null {
	if (node.type === "FunctionDeclaration") return node.id?.name ?? null;
	if (node.type === "FunctionExpression" && node.id !== null) return node.id.name;
	const parent = node.parent;
	if (
		parent?.type === "VariableDeclarator" &&
		parent.id.type === "Identifier" &&
		parent.init === node
	) {
		return parent.id.name;
	}
	if (
		(parent?.type === "Property" || parent?.type === "MethodDefinition") &&
		parent.value === node &&
		parent.key.type === "Identifier"
	) {
		return parent.key.name;
	}
	return null;
}

/** Report a named function whose whole body forwards its own arguments to another function. */
export const noTrivialWrapperRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow a named function whose entire body forwards its arguments to another function, adding nothing of its own.",
		},
		messages: {
			trivialWrapper:
				"`{{name}}` adds nothing to `{{target}}`; it only forwards its arguments. Call `{{target}}` at the call sites, or keep `{{name}}` only once it validates, narrows, or transforms what it receives.",		},
	},
	create(context) {
		const sourceCode: SourceCode = context.sourceCode;
		const filename = context.filename.replaceAll("\\", "/");
		if (TEST_FILE.test(filename) || SVELTEKIT_PARAM_MATCHERS.test(filename)) {
			return {};
		}

		const check = (node: FunctionNode): void => {
			const name = wrapperName(node);
			if (name === null) return;
			const call = soleForwardingCall(node);
			if (call === null || !isStaticReference(call.callee)) return;
			if (!forwardsEveryParameter(node, call)) return;
			context.report({
				node,
				messageId: "trivialWrapper",
				data: { name, target: sourceCode.getText(call.callee) },
			});
		};

		return {
			ArrowFunctionExpression: check,
			FunctionDeclaration: check,
			FunctionExpression: check,
		};
	},
});
