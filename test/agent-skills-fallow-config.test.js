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
	// JSONC despite the .json suffix: comments make the strict-JSON reader fail, which is why the
	// frozen adapter strips them instead of pretending strict JSON covers the file.
	assert.throws(() => JSON.parse(text));
	assert.match(text, /\/\//);
	// The identities the `fallow-jsonc` adapter is frozen to read. The values live here, not in
	// the enrollment declaration.
	for (const identity of ['health', 'maxCognitive', 'maxCrap', 'rules', 'ignorePatterns'])
		assert.ok(text.includes(`"${identity}"`), `.fallowrc.json has no ${identity}`);
});
