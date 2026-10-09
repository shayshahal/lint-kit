/**
 * inspection: a set narrowed to the lines the branch added. These tests are the only place the
 * gate itself is exercised — every other suite lints whole files, which is the default.
 *
 * The fixtures are real repositories outside this one, because the gate asks git, and a directory
 * inside this checkout would answer with this checkout's own history.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import errorHandling, { config } from '../tools/eslint/error-handling.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-kit-inspection-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function git(dir, ...args) {
	return execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
		cwd: dir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

/** A catch that logs and carries on: one no-swallowed-catch finding, at the catch on line 4. */
const swallows = (name) =>
	`export function ${name}() {\n\ttry {\n\t\trisky();\n\t} catch (e) {\n\t\tconsole.log(e);\n\t}\n}\n`;

const AT_BASE = swallows('old');
/** The same file with a second one appended: the finding the branch adds is at line 12. */
const ON_BRANCH = `${AT_BASE}\n${swallows('fresh')}`;

/** A repository on `feature`, one commit past `main`, whose src/x.ts is `branch` there. */
function repository(name, base, branch, extra = {}) {
	const dir = path.join(TMP, name);
	fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'src/x.ts'), base);
	for (const [rel, text] of Object.entries(extra)) {
		fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		fs.writeFileSync(path.join(dir, rel), text);
	}
	git(dir, 'init', '-b', 'main');
	git(dir, 'add', '-A');
	git(dir, 'commit', '-m', 'base');
	git(dir, 'checkout', '-b', 'feature');
	fs.writeFileSync(path.join(dir, 'src/x.ts'), branch);
	git(dir, 'add', '-A');
	git(dir, 'commit', '-m', 'work');
	return dir;
}

/** The lines this set reports for `code` read as `filename` in `dir`. */
function lines(dir, code, filename = 'src/x.ts', options) {
	const messages = new Linter({ cwd: dir, configType: 'flat' }).verify(
		code,
		[
			{ files: ['**/*.ts'], languageOptions: { parser: tsParser } },
			...errorHandling.config({ inspection: { mode: 'branch', base: 'main' }, ...options }),
		],
		path.join(dir, filename),
	);
	const fatal = messages.find((m) => m.fatal);
	if (fatal) throw new Error(`${filename}: ${fatal.message}`);
	return messages.map((m) => m.line);
}

test('branch: the finding the branch added is reported, the one already at base is not', () => {
	const dir = repository('branch', AT_BASE, ON_BRANCH);
	assert.deepEqual(lines(dir, ON_BRANCH), [12]);
});

test('full: both findings, so the gate is what changed and not the rule', () => {
	const dir = repository('full', AT_BASE, ON_BRANCH);
	assert.deepEqual(lines(dir, ON_BRANCH, 'src/x.ts', { inspection: 'full' }), [4, 12]);
});

test('a file the branch has not committed yet is all new, so it reports in full', () => {
	const dir = repository('untracked', AT_BASE, ON_BRANCH);
	fs.writeFileSync(path.join(dir, 'src/new.ts'), swallows('added'));
	assert.deepEqual(lines(dir, swallows('added'), 'src/new.ts'), [4]);
});

test('a file the base already had, untouched since, reports nothing', () => {
	const dir = repository('untouched', AT_BASE, ON_BRANCH);
	assert.deepEqual(lines(dir, AT_BASE), []);
});

test('a report whose range covers a line the branch edited is kept, even when it starts on an old line', () => {
	const dir = repository('edited', AT_BASE, ON_BRANCH);
	// the branch rewrites the log call inside the catch that was already there, so line 5 is the
	// branch's now and the finding over lines 4-6 is charged to the branch. The appended function
	// is not charged: git aligns its identical lines with the base's and reports only the
	// declaration as added. A line-level diff cannot tell a copy from a move, and every algorithm
	// git offers answers the same way here.
	const edited = ON_BRANCH.replace('\t\tconsole.log(e);\n\t}\n}\n\n', '\t\tconsole.error(e);\n\t}\n}\n\n');
	fs.writeFileSync(path.join(dir, 'src/x.ts'), edited);
	assert.deepEqual(lines(dir, edited), [4]);
});

test('no repository, so nothing can be told apart: everything is reported', () => {
	const dir = path.join(TMP, 'no-git');
	fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
	assert.deepEqual(lines(dir, ON_BRANCH), [4, 12]);
});

test('a rule entry overrides the mode the set was given', () => {
	const dir = repository('override', AT_BASE, ON_BRANCH);
	const wide = { rules: { 'error-handling/no-swallowed-catch': ['error', { inspection: 'full' }] } };
	assert.deepEqual(lines(dir, ON_BRANCH, 'src/x.ts', wide), [4, 12]);
});

test('config() names its entry, writes the mode as a setting, and takes rule overrides', () => {
	const [plain] = config();
	assert.equal(plain.name, 'error-handling');
	assert.equal(plain.settings, undefined);
	assert.deepEqual(config({ inspection: 'branch' })[0].settings, { inspection: 'branch' });
	const [overridden] = config({ rules: { 'error-handling/no-swallowed-catch': 'warn' } });
	assert.equal(overridden.rules['error-handling/no-swallowed-catch'], 'warn');
	assert.equal(overridden.rules['error-handling/no-stringified-error'], 'error');
});
