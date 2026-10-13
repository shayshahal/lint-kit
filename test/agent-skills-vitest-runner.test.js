/**
 * Real-runner evidence for the frozen testing support decisions in
 * docs/agent-skills-first-release-support.md (#40).
 *
 * The plugin fixture (test/agent-skills-testing-plugin.test.js) proves what the selected ESLint
 * rules accept; it does not prove those shapes run. This file runs the pinned Vitest 4.1.11 CLI
 * over test/fixtures/vitest-runner/*.test.js and asserts the runner's process exit alongside its
 * JSON report, so the documented counterexamples and limits are observable runner behavior, not
 * prose. The two are not the same observation: a chain that rejects after its test has finished
 * exits the process 1 while the report says success, which is why the helper returns both.
 *
 * No lint-kit testing set is installed by this issue.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as vitest from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, 'fixtures', 'vitest-runner');
const vitestCli = path.resolve(here, '..', 'node_modules', 'vitest', 'vitest.mjs');

/** The exact runner version frozen by #40; the plugin's optional peer must fit it. */
const FROZEN_VITEST_VERSION = '4.1.11';

/** Run one fixture through the pinned Vitest CLI, returning both the process exit and its JSON
 *  report. They disagree for a chain that rejects after the test has finished: the individual
 *  result says passed and `report.success` is true, while the process exits 1. The helper reports
 *  both and every test asserts the pair it observed, rather than assuming one implies the other. */
function runVitestFixture(name, { args = [] } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-vitest-'));
	const out = path.join(dir, 'report.json');
	try {
		const cliArgs = [vitestCli, 'run', name, '--reporter=json', `--outputFile=${out}`, ...args];
		// This isolated fixture intentionally demonstrates focus. CI otherwise rejects .only.
		if (name === 'focus-shapes.test.js') cliArgs.push('--allowOnly');
		const result = spawnSync(process.execPath, cliArgs, {
			cwd: fixtureDir,
			encoding: 'utf8',
			timeout: 30_000,
		});
		assert.ifError(result.error);
		return { exit: result.status, report: JSON.parse(fs.readFileSync(out, 'utf8')) };
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/** Every assertion title and status in a JSON report, as a plain object. */
function statusByTitle(report) {
	return Object.fromEntries(
		report.testResults.flatMap((file) => file.assertionResults.map((a) => [a.title, a.status])),
	);
}

test('the frozen Vitest version is the installed one', () => {
	const pkg = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'node_modules', 'vitest', 'package.json'), 'utf8'));
	assert.equal(pkg.version, FROZEN_VITEST_VERSION);
});

test('Vitest exposes focus only through .only, and never through .each(...)', () => {
	// Real focus entry points the runner provides.
	assert.equal(typeof vitest.test.only, 'function');
	assert.equal(typeof vitest.test.only.each, 'function');
	assert.equal(typeof vitest.it.only, 'function');
	assert.equal(typeof vitest.describe.only, 'function');
	// Unconditional skip entry points.
	assert.equal(typeof vitest.test.skip, 'function');
	assert.equal(typeof vitest.test.skip.each, 'function');
	assert.equal(typeof vitest.test.skipIf, 'function');
	assert.equal(typeof vitest.test.runIf, 'function');
	// `each(...)` returns a bare function: the reversed order is not an API.
	assert.equal(vitest.test.each([1]).only, undefined);
	assert.equal(vitest.test.each([1]).skip, undefined);
	assert.equal(vitest.describe.each([1]).only, undefined);
	assert.equal(vitest.describe.each([1]).skip, undefined);
	// Jest focus aliases are not exported by Vitest, so no first-release claim may rely on them.
	assert.equal(vitest.fit, undefined);
	assert.equal(vitest.fdescribe, undefined);
	assert.equal(vitest.xit, undefined);
	assert.equal(vitest.xdescribe, undefined);
});

test('a condition passed to test.skip is the test name, not a condition', () => {
	const { exit, report } = runVitestFixture('executable-shapes.test.js');
	assert.equal(exit, 0);
	const status = statusByTitle(report);
	assert.equal(status['synchronous assertion'], 'passed');
	assert.equal(status['awaited promise assertion'], 'passed');
	assert.equal(status['returned promise assertion'], 'passed');
	assert.equal(status['expected failure executes'], 'passed');
	// The first argument is the name; "looks conditional" never becomes a test.
	assert.equal(status.false, 'skipped');
	assert.equal(status['looks conditional'], undefined);
	assert.equal(status['skipIf false runs'], 'passed');
	assert.equal(status['runIf false skips'], 'skipped');
	assert.equal(status['skip each 1'], 'skipped');
	assert.equal(status['skip each 2'], 'skipped');
	assert.equal(status['todo stays pending'], 'todo');
});

test('.only focuses its test and skips its unfocused sibling', () => {
	const { exit, report } = runVitestFixture('focus-shapes.test.js');
	assert.equal(exit, 0);
	const status = statusByTitle(report);
	assert.equal(status['focused test'], 'passed');
	assert.equal(status['unfocused test'], 'skipped');
});

test('the callback done form is deprecated and fails in the frozen runner', () => {
	const { exit, report } = runVitestFixture('done-shape.test.js');
	assert.equal(exit, 1);
	assert.equal(report.success, false);
	const [result] = report.testResults.flatMap((file) => file.assertionResults);
	assert.equal(result.title, 'done callback');
	assert.equal(result.status, 'failed');
	assert.match(result.failureMessages.join('\n'), /done\(\) callback is deprecated/);
});

test('a .only after .each(...) is a collection failure, not a focused test', () => {
	const { exit, report } = runVitestFixture('invalid-each-order.test.js');
	assert.equal(exit, 1);
	assert.equal(report.success, false);
	assert.match(report.testResults[0].message, /\.only is not a function/);
});

test('a floating expectation chain false-passes; returning it fails the test', () => {
	// The complement of the lint claim: both rules report the chain, and the runner shows why the
	// floating form is a silent pass — the test finishes before the callback asserts. This mixed
	// fixture exits 1 because the returned chain below fails; the standalone `floating-only.test.js`
	// is where the exit/report disagreement for the immediate chain is read on its own.
	const { exit, report } = runVitestFixture('unawaited-shape.test.js');
	const status = statusByTitle(report);
	assert.equal(exit, 1);
	assert.equal(report.success, false);
	assert.equal(status['floating chain with a failing expectation false passes'], 'passed');
	assert.equal(status['returning the chain catches the mismatch'], 'failed');
	assert.equal(status['a returned chain passes when the value matches'], 'passed');
	// Vitest 4 attributes a dangling `.resolves` assertion to the running test, so the direct shape
	// is not the silent pass the chain is; the rule still requires the awaited/returned form the
	// frozen support matrix decides, and its fix writes that form.
	assert.equal(status['an unawaited .resolves is still reported by the runner'], 'failed');
});

test('a standalone floating chain fails the process while its JSON report says success', () => {
	// control/48-floating-probe.json in the execution repo observed this on its own: an immediate
	// floating chain makes the process exit 1 from the late rejection, yet the individual test is
	// `passed`, `numFailedTests` is 0 and `report.success` is true. A driver that derives success
	// from the exit code, or the exit code from `report.success`, would get this case wrong.
	const { exit, report } = runVitestFixture('floating-only.test.js');
	assert.equal(exit, 1);
	assert.equal(report.success, true);
	assert.equal(report.numFailedTests, 0);
	assert.equal(report.numPassedTests, 1);
	assert.deepEqual(statusByTitle(report), { 'floating-only': 'passed' });
	assert.notEqual(exit === 0, report.success);
});

test('an unsettled chain is a silent pass floated and a timeout when returned', () => {
	// The genuinely deterministic false pass: the promise never settles, so the floating test has
	// nothing to wait for and returns immediately — exit 0, report success, individual test passed,
	// and the assertion inside the chain never runs. Returning the same chain makes the test wait,
	// so the explicit 300ms timeout in the fixture fires instead.
	const floated = runVitestFixture('unsettled-shape.test.js', { args: ['-t', 'floating unsettled chain'] });
	assert.equal(floated.exit, 0);
	assert.equal(floated.report.success, true);
	assert.equal(statusByTitle(floated.report)['floating unsettled chain'], 'passed');

	const returned = runVitestFixture('unsettled-shape.test.js', { args: ['-t', 'returned unsettled chain'] });
	assert.equal(returned.exit, 1);
	assert.equal(returned.report.success, false);
	const [result] = returned.report.testResults[0].assertionResults.filter((a) => a.title === 'returned unsettled chain');
	assert.equal(result.status, 'failed');
	// The JSON reporter collapses the timeout message to a stack; the duration is the evidence that
	// the fixture's explicit 300ms timeout fired rather than another failure.
	assert.ok(result.duration >= 250, `expected the 300ms timeout, ran ${result.duration}ms`);
});
