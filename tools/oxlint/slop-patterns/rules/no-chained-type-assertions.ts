import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { TEST_FILE } from "../paths.ts";

/**
 * `x as unknown as User`: two assertions in a row, and the first one throws away everything the
 * value's type said. It is how generated code silences a type error instead of handling the case
 * it is about: nothing downstream is checked any more, and the second assertion is a claim no one
 * has verified. The pair is reported, never a single assertion, and a chain of nothing but
 * `as const` is left alone — it widens a literal and asserts nothing about what it was.
 */
type Assertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

function isAssertion(node: ESTree.Node | null | undefined): node is Assertion {
	return node?.type === "TSAsExpression" || node?.type === "TSTypeAssertion";
}

/** `as const`, which is a widening of a literal and not a claim about the value's type. */
function isConstAssertion(node: Assertion): boolean {
	if (node.type !== "TSAsExpression") return false;
	const annotation = node.typeAnnotation;
	return (
		annotation.type === "TSTypeReference" &&
		annotation.typeName.type === "Identifier" &&
		annotation.typeName.name === "const"
	);
}

/** Report two or more assertions nested in one expression, except an all-`as const` chain. */
export const noChainedTypeAssertionsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow nested type assertions, which discard the type evidence the value carried.",
		},
		messages: {
			chained:
				"Two assertions in a row erase the type the value actually has, so nothing downstream is checked. Parse it where it enters (`parseUser(input)`), or keep the one assertion that is true after a check (`if (isUser(input)) input as User`).",
		},
	},
	create(context) {
		const filename = context.filename.replaceAll("\\", "/");
		if (TEST_FILE.test(filename)) return {};

		const check = (node: Assertion): void => {
			// The outermost assertion reports once for the whole chain.
			if (isAssertion(node.parent)) return;
			let depth = 0;
			let constOnly = true;
			let inner: ESTree.Node = node;
			while (isAssertion(inner)) {
				depth += 1;
				if (!isConstAssertion(inner)) constOnly = false;
				inner = inner.expression;
			}
			if (depth < 2 || constOnly) return;
			context.report({ node, messageId: "chained" });
		};
		return {
			TSAsExpression: check,
			TSTypeAssertion: check,
		};
	},
});
