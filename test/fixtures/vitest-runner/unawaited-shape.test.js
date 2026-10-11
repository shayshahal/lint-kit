/**
 * Executed by `test/agent-skills-vitest-runner.test.js`: a floating promise chain runs its
 * callback after the test has finished, so a failing expectation inside it is never reported and
 * the test passes. Returning the chain is the shape the lint rules require. A direct unawaited
 * `.resolves` is included so the runner's own behavior for that shape is recorded, not assumed.
 */

import { expect, test } from 'vitest';

test('floating chain with a failing expectation false passes', () => {
	Promise.resolve(1).then((v) => {
		expect(v).toBe(999);
	});
});

test('returning the chain catches the mismatch', () => {
	return Promise.resolve(1).then((v) => {
		expect(v).toBe(999);
	});
});

test('a returned chain passes when the value matches', () => {
	return Promise.resolve(1).then((v) => {
		expect(v).toBe(1);
	});
});

test('an unawaited .resolves is still reported by the runner', () => {
	expect(Promise.resolve(1)).resolves.toBe(999);
});
