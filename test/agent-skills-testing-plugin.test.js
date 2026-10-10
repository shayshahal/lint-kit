/**
 * Foundation evidence for the frozen testing support decisions in
 * docs/agent-skills-first-release-support.md (#40).
 *
 * It runs the selected upstream plugin (@vitest/eslint-plugin) through ESLint's real RuleTester
 * against installed tooling, so the documented claims — which focused/async/skip APIs are caught,
 * which aliases are not, and that shadowed identifiers pass — are checked, not asserted in prose.
 *
 * No lint-kit testing set is installed by this issue. #47-#49 build on these results and must
 * not restate them as coverage the plugin does not provide (for example, `fit`/`fdescribe`).
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
 * analysis, so a locally bound `test`/`it`/`expect` is unrelated and must stay valid.
 */
const vitestGlobals = {
	test: 'readonly',
	it: 'readonly',
	describe: 'readonly',
	expect: 'readonly',
	vi: 'readonly',
	fit: 'readonly',
	fdescribe: 'readonly',
	xit: 'readonly',
	xdescribe: 'readonly',
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
			// Documented gaps: the maintained rule checks `it`/`test`/`describe` only, so the
			// focus aliases pass here (no-test-prefixes below catches them), and a `.only`
			// applied after `.each` is not resolved to a focused call.
			"fit('alias', () => {});",
			"fdescribe('alias', () => {});",
			"describe.each([1]).only('gap', () => {});",
			"it.each([1]).only('gap', () => {});",
			// Shadowed runner names are unrelated objects, not vitest calls.
			"const test = { only: () => {} };\ntest.only('other');",
			'function it() {}\nit.only("other");',
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
		],
	});
});

describe('no-test-prefixes', () => {
	tester.run('no-test-prefixes', vitestRule('no-test-prefixes'), {
		valid: ["test('runs', () => {});", "describe('group', () => {});", "test.skip('skip', () => {});"],
		invalid: [
			{ code: "fit('a', () => {});", output: "it.only('a', () => {});", errors: [{ message: 'Use "it.only" instead' }] },
			{ code: "fdescribe('b', () => {});", output: "describe.only('b', () => {});", errors: [{ message: 'Use "describe.only" instead' }] },
			{ code: "xit('c', () => {});", output: "it.skip('c', () => {});", errors: [{ message: 'Use "it.skip" instead' }] },
			{ code: "xdescribe('d', () => {});", output: "describe.skip('d', () => {});", errors: [{ message: 'Use "describe.skip" instead' }] },
		],
	});
});

describe('valid-expect', () => {
	tester.run('valid-expect', vitestRule('valid-expect'), {
		valid: [
			"test('awaited', async () => { await expect(fetch('x')).resolves.toBe('y'); });",
			"test('returned', () => { return expect(fetch('x')).resolves.toBe('y'); });",
			"test('callback', (done) => { expect(1).toBe(1); done(); });",
			"test('shadowed expect', () => { const expect = (v) => v; expect(1); });",
		],
		invalid: [
			// The fixer makes the callback async and awaits the assertion.
			{
				code: "test('unawaited', () => { expect(fetch('x')).resolves.toBe('y'); });",
				output: "test('unawaited', async () => { await expect(fetch('x')).resolves.toBe('y'); });",
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
		],
	});
});

describe('no-standalone-expect', () => {
	tester.run('no-standalone-expect', vitestRule('no-standalone-expect'), {
		valid: ["test('inside', () => { expect(1).toBe(1); });", 'const expect = (v) => v;\nexpect(1);'],
		invalid: [
			{ code: 'expect(1).toBe(1);', errors: [{ message: 'Expect must be called inside a test block' }] },
		],
	});
});

describe('no-disabled-tests', () => {
	tester.run('no-disabled-tests', vitestRule('no-disabled-tests'), {
		valid: [
			"test('runs', () => {});",
			"test.todo('later');",
			"it.todo('later');",
			// Conditional platform skips are the runner's supported form and stay valid.
			"test.skipIf(process.platform === 'win32')('win', () => {});",
			"test.runIf(true)('runs', () => {});",
			'const xit = () => {};\nxit("other");',
			// Documented gap: a `.skip` applied after `.each` is not resolved to a disabled call.
			"test.each([1]).skip('gap', () => {});",
			"describe.each([1]).skip('gap', () => {});",
		],
		invalid: [
			{ code: "test.skip('a', () => {});", errors: [{ message: /Disabled test/ }] },
			{ code: "it.skip('b', () => {});", errors: [{ message: /Disabled test/ }] },
			{ code: "describe.skip('c', () => {});", errors: [{ message: /Disabled test suite/ }] },
			{ code: "xit('d', () => {});", errors: [{ message: /Disabled test/ }] },
			{ code: "xdescribe('e', () => {});", errors: [{ message: /Disabled test suite/ }] },
			{ code: "test.skip.each([1])('f', () => {});", errors: [{ message: /Disabled test/ }] },
			// Documented limit: a `.skip` carrying a condition is still reported; the plugin does
			// not separate it from an unconditional skip. #49 must add that policy itself.
			{
				code: "test.skip(process.platform === 'win32', 'win only', () => {});",
				errors: [{ message: /Disabled test/ }],
			},
		],
	});
});
