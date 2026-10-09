import { eslintCompatPlugin } from "@oxlint/plugins";

import { noChainedTypeAssertionsRule } from "./rules/no-chained-type-assertions.ts";
import { noTrivialWrapperRule } from "./rules/no-trivial-wrapper.ts";

/**
 * Slop patterns: indirection and waste that adds no behaviour. From the waste metrics
 * SlopCodeBench measures (trivial wrappers, single-use functions, single-method classes), kept to
 * the ones a rule can name a replacement for, plus the type-level shape of the same thing: an
 * assertion that discards the type a value had is a claim standing in for a check.
 */
const slopPatternsPlugin = eslintCompatPlugin({
	meta: { name: "slop-patterns" },
	rules: {
		"no-chained-type-assertions": noChainedTypeAssertionsRule,
		"no-trivial-wrapper": noTrivialWrapperRule,
	},
});

export default slopPatternsPlugin;
