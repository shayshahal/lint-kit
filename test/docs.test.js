import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import svelteSkills from '../src/svelte-skills.js';
import tailwindPatterns from '../src/tailwind-patterns.js';
import untranslatedText from '../src/untranslated-text.js';
import errorHandling from '../src/error-handling.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = 'https://github.com/shayshahal/lint-kit/blob/main/';

test('every rule links to a section of its docs page', () => {
	for (const plugin of [svelteSkills.plugin, untranslatedText.plugin, tailwindPatterns.plugin, errorHandling.plugin])
		for (const [name, rule] of Object.entries(plugin.rules)) {
			const url = rule.meta.docs.url;
			assert.ok(url?.startsWith(DOCS), `${name} has no docs url`);
			const [file, anchor] = url.slice(DOCS.length).split('#');
			assert.equal(anchor, name);
			const page = fs.readFileSync(path.join(ROOT, file), 'utf8');
			assert.match(page, new RegExp(`^## ${name}$`, 'm'), `${file} has no section for ${name}`);
		}
});
