import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const { version } = JSON.parse(read('package.json'));

// The release workflow tags v<package.json version>; the README's pinned install command names it.
test('the README pins the package.json version', () => {
	const pins = [...read('README.md').matchAll(/lint-kit#v(\d[\w.-]*)/g)].map((m) => m[1]);
	assert.ok(pins.length >= 1, 'README.md pins a version in its install command');
	for (const v of pins) assert.equal(v, version, 'README.md');
});

// The release workflow publishes the CHANGELOG's section for the version as the release notes, so
// a release with nothing to say has to fail here rather than publish an empty page. The extraction
// is the workflow's: the heading, then everything up to the next one.
test('the CHANGELOG has a section, with notes in it, for the package.json version', () => {
	const changelog = read('CHANGELOG.md');
	const start = changelog.indexOf(`\n## ${version}\n`);
	assert.ok(start !== -1, `CHANGELOG.md has a section for ${version}`);
	const rest = changelog.slice(start + 1);
	const next = rest.indexOf('\n## ', 1);
	const notes = rest.slice(0, next === -1 ? undefined : next).trim();
	assert.ok(notes.length > 0, `the ${version} section has notes`);
});
