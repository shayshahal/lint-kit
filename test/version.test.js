import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const { version } = JSON.parse(read('package.json'));

// init installs the tag v<package.json version>, and the release workflow tags that version, so
// every other place that names it must agree.
test('every file names the package.json version', () => {
	const found = {
		'python/pyproject.toml': read('python/pyproject.toml').match(/^version = "(.+)"/m)?.[1],
		'python/src/lint_kit_fastapi/__init__.py': read('python/src/lint_kit_fastapi/__init__.py').match(
			/^class Plugin:\n(?: {4}.*\n)*? {4}version = "(.+)"/m,
		)?.[1],
		'python/uv.lock': read('python/uv.lock').match(/^name = "lint-kit-fastapi"\nversion = "(.+)"/m)?.[1],
	};
	for (const [file, v] of Object.entries(found)) assert.equal(v, version, file);
	const pins = [...read('README.md').matchAll(/lint-kit[#@]v(\d[\w.-]*)/g)].map((m) => m[1]);
	assert.ok(pins.length >= 2, 'README.md pins a version in its install commands');
	for (const v of pins) assert.equal(v, version, 'README.md');
});
