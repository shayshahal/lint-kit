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
