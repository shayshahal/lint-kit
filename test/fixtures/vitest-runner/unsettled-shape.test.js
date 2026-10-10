/**
 * Executed by `test/agent-skills-vitest-runner.test.js`: the two ways an unsettled chain behaves.
 *
 * A floating chain whose promise never settles leaves the test with nothing to wait for, so the
 * test passes and the assertion inside the chain never runs: a genuine silent false pass, with no
 * sleep or poll timer needed. Returning the same chain makes the test wait for it, so the runner
 * times the test out instead of passing it. The 300ms timeout is explicit and short; the test in
 * the runner file selects each case with `-t`.
 */

import { expect, test } from 'vitest';

test('floating unsettled chain', () => {
	new Promise(() => {}).then(() => {
		expect(1).toBe(2);
	});
});

test('returned unsettled chain', () => {
	return new Promise(() => {}).then(() => {
		expect(1).toBe(2);
	});
}, 300);
