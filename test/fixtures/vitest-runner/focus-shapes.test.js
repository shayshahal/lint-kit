/**
 * Executed by `test/agent-skills-vitest-runner.test.js` on its own: a `.only` suppresses every
 * unfocused test in the run, so this file must not share a run with the other fixtures.
 */

import { expect, test } from 'vitest';

test.only('focused test', () => {
	expect(1).toBe(1);
});

test('unfocused test', () => {
	expect(1).toBe(1);
});
