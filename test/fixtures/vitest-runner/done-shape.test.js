/**
 * Executed by `test/agent-skills-vitest-runner.test.js`: the callback `done` form is deprecated in
 * the pinned runner, so it fails even though the selected `valid-expect` rule accepts it.
 */

import { expect, test } from 'vitest';

test('done callback', (done) => {
	expect(1).toBe(1);
	done();
});
