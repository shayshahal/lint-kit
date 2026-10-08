import { eslintCompatPlugin } from "@oxlint/plugins";

import { noTrivialWrapperRule } from "./rules/no-trivial-wrapper.ts";

/**
 * Slop patterns: indirection and waste that adds no behaviour. From the waste metrics
 * SlopCodeBench measures (trivial wrappers, single-use functions, single-method classes),
 * kept to the ones a rule can name a replacement for.
 */
const slopPatternsPlugin = eslintCompatPlugin({
	meta: { name: "slop-patterns" },
	rules: {
		"no-trivial-wrapper": noTrivialWrapperRule,
	},
});

export default slopPatternsPlugin;
