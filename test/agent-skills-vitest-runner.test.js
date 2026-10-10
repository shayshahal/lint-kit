/**
 * Real-runner evidence for the frozen testing support decisions in
 * docs/agent-skills-first-release-support.md (#40).
 *
 * The plugin fixture (test/agent-skills-testing-plugin.test.js) proves what the selected ESLint
 * rules accept; it does not prove those shapes run. This file runs the pinned Vitest 4.1.11 CLI
 * over test/fixtures/vitest-runner/*.test.js and asserts the runner's own JSON report, so the
 * documented counterexamples and limits are observable runner behavior, not prose.
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

/** Run one fixture through the pinned Vitest CLI, checking its exit and JSON report. */
function runVitestFixture(name, expectedExit = 0) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-vitest-'));
	const out = path.join(dir, 'report.json');
	try {
		const args = [vitestCli, 'run', name, '--reporter=json', `--outputFile=${out}`];
		// This isolated fixture intentionally demonstrates focus. CI otherwise rejects .only.
		if (name === 'focus-shapes.test.js') args.push('--allowOnly');
		const result = spawnSync(process.execPath, args, {
			cwd: fixtureDir,
			encoding: 'utf8',
			timeout: 30_000,
		});
		assert.ifError(result.error);
		assert.equal(result.status, expectedExit, `Vitest fixture ${name}: ${result.stderr}`);
		const report = JSON.parse(fs.readFileSync(out, 'utf8'));
		assert.equal(report.success, expectedExit === 0, `Vitest fixture ${name}: report outcome`);
		return report;
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
	const status = statusByTitle(runVitestFixture('executable-shapes.test.js'));
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
	const status = statusByTitle(runVitestFixture('focus-shapes.test.js'));
	assert.equal(status['focused test'], 'passed');
	assert.equal(status['unfocused test'], 'skipped');
});

test('the callback done form is deprecated and fails in the frozen runner', () => {
	const report = runVitestFixture('done-shape.test.js', 1);
	const [result] = report.testResults.flatMap((file) => file.assertionResults);
	assert.equal(result.title, 'done callback');
	assert.equal(result.status, 'failed');
	assert.match(result.failureMessages.join('\n'), /done\(\) callback is deprecated/);
});

test('a .only after .each(...) is a collection failure, not a focused test', () => {
	const report = runVitestFixture('invalid-each-order.test.js', 1);
	assert.equal(report.success, false);
	assert.match(report.testResults[0].message, /\.only is not a function/);
});

test('a floating expectation chain false-passes; returning it fails the test', () => {
	// The complement of the lint claim: both rules report the chain, and the runner shows why the
	// floating form is a silent pass — the test finishes before the callback asserts.
	const status = statusByTitle(runVitestFixture('unawaited-shape.test.js', 1));
	assert.equal(status['floating chain with a failing expectation false passes'], 'passed');
	assert.equal(status['returning the chain catches the mismatch'], 'failed');
	assert.equal(status['a returned chain passes when the value matches'], 'passed');
	// Vitest 4 attributes a dangling `.resolves` assertion to the running test, so the direct shape
	// is not the silent pass the chain is; the rule still requires the awaited/returned form the
	// frozen support matrix decides, and its fix writes that form.
	assert.equal(status['an unawaited .resolves is still reported by the runner'], 'failed');
});
