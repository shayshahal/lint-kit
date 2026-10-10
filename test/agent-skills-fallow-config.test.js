/**
 * Foundation evidence for the frozen Fallow JSONC adapter contract in
 * docs/agent-skills-first-release-support.md (#40).
 *
 * The declaration links to the `.fallowrc.json` the installer writes, so this runs the real
 * installer and asserts the file's actual format and the identity paths the adapter is frozen to
 * read. No adapter ships in #40; this grounds the contract in the emitted configuration, so the
 * implementing issues do not cover it with a strict-JSON reader that cannot read it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseJsonc } from 'jsonc-parser';
import { main } from '../bin/lint-kit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'test', '.tmp-fallow-config');
fs.rmSync(TMP, { recursive: true, force: true });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** A repository (it has a .git) made of `files`. */
function project(name, files) {
	const dir = path.join(TMP, name);
	for (const [rel, text] of Object.entries({ '.git/HEAD': 'ref: refs/heads/main\n', ...files })) {
		fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		fs.writeFileSync(path.join(dir, rel), text);
	}
	return dir;
}

/** Run a lint-kit command with its progress output silenced. */
const quiet = async (argv) => {
	const log = console.log;
	console.log = () => {};
	try {
		return await main(argv);
	} finally {
		console.log = log;
	}
};

test('the installer writes a JSONC .fallowrc.json a strict-JSON policy reader cannot read', async () => {
	const dir = project('fallow-jsonc', {
		'package.json': JSON.stringify({ devDependencies: { svelte: '^5' } }),
		'lefthook.yml': 'pre-push:\n  commands:\n    test:\n      run: pnpm test\n',
		'src/routes/+page.svelte': '<div>Hello</div>\n',
	});
	assert.equal(await quiet(['init', '--no-install', '--cwd', dir, '--sets', 'structure']), 0);

	const source = path.join(dir, '.fallowrc.json');
	assert.ok(fs.existsSync(source), 'the installer wrote no .fallowrc.json');
	const text = fs.readFileSync(source, 'utf8');
	// JSONC despite the .json suffix: the real parser must preserve strings as it reads comments.
	assert.throws(() => JSON.parse(text));
	const errors = [];
	const configuration = parseJsonc(text, errors);
	assert.deepEqual(errors, [], 'the installed configuration must be valid JSONC');
	// These identities and values live in the actual checker source, not the enrollment.
	assert.equal(configuration.health.maxCognitive, 25);
	assert.equal(configuration.health.maxCrap, 100000);
	assert.equal(configuration.rules['unused-dev-dependencies'], 'error');
	assert.ok(configuration.ignorePatterns.includes('tools/**'));
	assert.equal(configuration.$schema, 'https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json');
});
