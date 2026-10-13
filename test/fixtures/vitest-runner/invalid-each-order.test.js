/**
 * Executed by `test/agent-skills-vitest-runner.test.js`: `each()` returns a bare function, so a
 * `.only` (or `.skip`) applied after `.each(...)` is not a Vitest API. The runner reports a
 * collection failure naming the missing method.
 */

import { test } from 'vitest';

test.each([1]).only('invalid order', () => {});
