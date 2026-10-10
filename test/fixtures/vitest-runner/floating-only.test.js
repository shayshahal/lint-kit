/**
 * Executed by `test/agent-skills-vitest-runner.test.js`: one immediate floating chain and nothing
 * else, so its process exit and its JSON report can be read in isolation.
 *
 * The chain rejects after the test has finished. Vitest records the individual test as passed and
 * the report as success, but the process still exits 1 from the late rejection. Mixing this with
 * other failing tests hid the disagreement — the mixed fixture in `unawaited-shape.test.js` exits 1
 * for a different reason. This file is the isolated control.
 */

import { expect, test } from 'vitest';

test('floating-only', () => {
	Promise.resolve(1).then((v) => {
		expect(v).toBe(999);
	});
});
