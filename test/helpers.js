import { describe, it } from 'node:test';
import { Linter, RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import svelteParser from 'svelte-eslint-parser';
import svelte from 'eslint-plugin-svelte';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/** RuleTester for .svelte files (svelte-eslint-parser over TypeScript). */
export const svelteTester = new RuleTester({
	languageOptions: { parser: svelteParser, parserOptions: { parser: tsParser } },
});

/** RuleTester for .ts / .js files. */
export const tsTester = new RuleTester({ languageOptions: { parser: tsParser } });

/** The parser setup a project needs before any lint-kit config (the init command writes it). */
export const PARSERS = [
	...svelte.configs.recommended,
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: { parserOptions: { parser: tsParser } },
	},
	{
		files: ['**/*.ts', '**/*.js'],
		ignores: ['**/*.svelte.ts'],
		languageOptions: { parser: tsParser },
	},
];

/** Lint `code` as `filename` with `configs` after the parser setup; returns rule ids / messages. */
export function lint(code, filename, configs) {
	const messages = new Linter({ configType: 'flat' }).verify(
		code,
		[...PARSERS, ...configs],
		filename,
	);
	const fatal = messages.find((m) => m.fatal);
	if (fatal) throw new Error(`${filename}: ${fatal.message}`);
	return messages;
}
