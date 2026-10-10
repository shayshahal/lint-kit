/**
 * Executed by `test/agent-skills-vitest-runner.test.js` through the pinned Vitest CLI. Every
 * shape here is a documented first-release claim; the driver asserts the runner's own status for
 * each. Deliberately no `.only` in this file: a focused test is run/verified on its own.
 */

import { expect, test } from 'vitest';

test('synchronous assertion', () => {
	expect(1).toBe(1);
});

test('awaited promise assertion', async () => {
	await expect(Promise.resolve(1)).resolves.toBe(1);
});

test('returned promise assertion', () => {
	return expect(Promise.resolve(1)).resolves.toBe(1);
});

test.fails('expected failure executes', () => {
	expect(1).toBe(2);
});

// `test.skip` takes no condition. The first argument becomes the test name, so this is an
// unconditional skip named "false" — the string "looks conditional" is ignored by the runner.
test.skip(false, 'looks conditional', () => {
	expect(true).toBe(true);
});

test.skipIf(false)('skipIf false runs', () => {
	expect(true).toBe(true);
});

test.runIf(false)('runIf false skips', () => {
	expect(true).toBe(true);
});

test.skip.each([1, 2])('skip each %i', () => {
	expect(true).toBe(true);
});

test.todo('todo stays pending');
