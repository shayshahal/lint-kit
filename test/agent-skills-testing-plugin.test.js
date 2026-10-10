/**
 * Foundation evidence for the frozen testing support decisions in
 * docs/agent-skills-first-release-support.md (#40).
 *
 * It runs the selected upstream plugin (@vitest/eslint-plugin) through ESLint's real RuleTester
 * against installed tooling, so the documented claims — which focused/async/skip APIs are caught,
 * which aliases are local shadows, and which imported names resolve to Vitest — are checked, not
 * asserted in prose. What the rule accepts is not proof the shape runs; the companion
 * test/agent-skills-vitest-runner.test.js runs the pinned Vitest CLI for that.
 *
 * No lint-kit testing set is installed by this issue. #47-#49 build on these results and must
 * not restate them as coverage the plugin does not provide.
 */

import assert from 'node:assert/strict';
import { describe, it, test } from 'node:test';
import { RuleTester } from 'eslint';
import vitestPlugin from '@vitest/eslint-plugin';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/** The exact version frozen by #40; a range would let the evidence drift. */
const FROZEN_PLUGIN_VERSION = '1.6.27';

/**
 * Vitest's test globals as a consumer's config declares them. The selected rules use scope
 * analysis: a locally bound `test`/`it`/`expect` is unrelated and must stay valid, while an
 * imported binding is recognized only when its source is `vitest`.
 */
const vitestGlobals = {
	test: 'readonly',
	it: 'readonly',
	describe: 'readonly',
	expect: 'readonly',
	vi: 'readonly',
};

const tester = new RuleTester({
	languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: vitestGlobals },
});

const vitestRule = (name) => vitestPlugin.rules[name];

test('the frozen plugin version is the installed one', () => {
	assert.equal(vitestPlugin.meta.version, FROZEN_PLUGIN_VERSION);
});

describe('no-focused-tests', () => {
	tester.run('no-focused-tests', vitestRule('no-focused-tests'), {
		valid: [
			"test('runs', () => {});",
			"describe('group', () => {});",
			// Locally bound runner names are unrelated objects, not Vitest calls.
			"const test = { only: () => {} };\ntest.only('other');",
			'function it() {}\nit.only("other");',
			// An import from another library does not resolve to Vitest.
			"import { test } from 'some-other-lib';\ntest.only('other');",
		],
		invalid: [
			{
				code: "test.only('a', () => {});",
				output: "test('a', () => {});",
				errors: [{ message: 'Focused tests are not allowed' }],
			},
			{
				code: "it.only('b', () => {});",
				output: "it('b', () => {});",
				errors: [{ message: 'Focused tests are not allowed' }],
			},
			{
				code: "describe.only('c', () => {});",
				output: "describe('c', () => {});",
				errors: [{ message: 'Focused tests are not allowed' }],
			},
			{
				code: "test.concurrent.only('d', async () => {});",
				output: "test.concurrent('d', async () => {});",
				errors: [{ message: 'Focused tests are not allowed' }],
			},
			{
				code: "test.only.each([1])('e', () => {});",
				output: "test.each([1])('e', () => {});",
				errors: [{ message: 'Focused tests are not allowed' }],
			},
			// Imported aliases resolve to the Vitest test function, whatever the local name.
			{
				code: "import { test as t } from 'vitest';\nt.only('f', () => {});",
				output: "import { test as t } from 'vitest';\nt('f', () => {});",
				errors: [{ message: 'Focused tests are not allowed' }],
			},
			{
				code: "import { it as test } from 'vitest';\ntest.only('g', () => {});",
				output: "import { it as test } from 'vitest';\ntest('g', () => {});",
				errors: [{ message: 'Focused tests are not allowed' }],
			},
		],
	});
});

describe('valid-expect', () => {
	tester.run('valid-expect', vitestRule('valid-expect'), {
		valid: [
			"test('awaited', async () => { await expect(fetch('x')).resolves.toBe('y'); });",
			"test('returned', () => { return expect(fetch('x')).resolves.toBe('y'); });",
			"test('synchronous', () => { expect(1).toBe(1); });",
			"test('shadowed expect', () => { const expect = (v) => v; expect(1); });",
			// The rule accepts the callback `done` form; the pinned runner deprecates it, so the
			// runner fixture proves it is NOT a legitimate passing shape (see vitest-runner.test.js).
			"test('done form', (done) => { expect(1).toBe(1); done(); });",
		],
		invalid: [
			// The fixer makes the callback async and awaits the assertion.
			{
				code: "test('unawaited', () => { expect(fetch('x')).resolves.toBe('y'); });",
				output: "test('unawaited', async () => { await expect(fetch('x')).resolves.toBe('y'); });",
				errors: [{ message: 'Async assertions must be awaited or returned' }],
			},
			// An imported alias of `expect` is still the Vitest assertion.
			{
				code: "import { expect as e, test } from 'vitest';\ntest('alias', () => { e(fetch('x')).resolves.toBe('y'); });",
				output:
					"import { expect as e, test } from 'vitest';\ntest('alias', async () => { await e(fetch('x')).resolves.toBe('y'); });",
				errors: [{ message: 'Async assertions must be awaited or returned' }],
			},
		],
	});
});

describe('valid-expect-in-promise', () => {
	tester.run('valid-expect-in-promise', vitestRule('valid-expect-in-promise'), {
		valid: [
			"test('returned chain', () => { return fetch('x').then((r) => { expect(r).toBe('y'); }); });",
			"test('awaited chain', async () => { await fetch('x').then((r) => { expect(r).toBe('y'); }); });",
		],
		invalid: [
			{
				code: "test('floating chain', () => { fetch('x').then((r) => { expect(r).toBe('y'); }); });",
				errors: [
					{
						message:
							'This promise should either be returned or awaited to ensure the expects in its chain are called',
					},
				],
			},
			{
				code: "import { test as t } from 'vitest';\nt('floating alias', () => { fetch('x').then((r) => { expect(r).toBe('y'); }); });",
				errors: [
					{
						message:
							'This promise should either be returned or awaited to ensure the expects in its chain are called',
					},
				],
			},
		],
	});
});

describe('no-disabled-tests', () => {
	tester.run('no-disabled-tests', vitestRule('no-disabled-tests'), {
		valid: [
			"test('runs', () => {});",
			"test.todo('later');",
			"it.todo('later');",
			"test.fails('expected failure', () => {});",
			// The runner's supported conditional skips stay valid.
			"test.skipIf(process.platform === 'win32')('win', () => {});",
			"test.runIf(true)('runs', () => {});",
			// Local shadows and non-Vitest imports are unrelated.
			'const test = { skip: () => {} };\ntest.skip("other");',
			"import { test } from 'some-other-lib';\ntest.skip('other');",
		],
		invalid: [
			{ code: "test.skip('a', () => {});", errors: [{ message: /Disabled test/ }] },
			{ code: "it.skip('b', () => {});", errors: [{ message: /Disabled test/ }] },
			{ code: "describe.skip('c', () => {});", errors: [{ message: /Disabled test suite/ }] },
			{ code: "test.skip.each([1])('f', () => {});", errors: [{ message: /Disabled test/ }] },
			// Imported aliases of the test function are reported.
			{
				code: "import { test as t } from 'vitest';\nt.skip('g', () => {});",
				errors: [{ message: /Disabled test/ }],
			},
			{
				code: "import { it as test } from 'vitest';\ntest.skip('h', () => {});",
				errors: [{ message: /Disabled test/ }],
			},
			// `test.skip` takes no condition: this is an unconditional skip whose name is `false`
			// (proved by the runner fixture). Reporting it is correct, not a false positive.
			{
				code: "test.skip(false, 'win only', () => {});",
				errors: [{ message: /Disabled test/ }],
			},
		],
	});
});
