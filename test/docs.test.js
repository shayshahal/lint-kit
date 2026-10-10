import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import svelteSkills from '../tools/eslint/svelte-skills.mjs';
import tailwindPatterns from '../tools/eslint/tailwind-patterns.mjs';
import untranslatedText from '../tools/eslint/untranslated-text.mjs';
import errorHandling from '../tools/eslint/error-handling.mjs';
import prose from '../tools/eslint/prose.mjs';
import vitest from '../tools/eslint/vitest.mjs';

test('every rule links to a section of the docs copied beside it', () => {
	for (const plugin of [svelteSkills.plugin, untranslatedText.plugin, tailwindPatterns.plugin, errorHandling.plugin, prose.plugin, vitest.plugin])
		for (const [name, rule] of Object.entries(plugin.rules)) {
			const url = new URL(rule.meta.docs.url);
			assert.equal(url.protocol, 'file:', `${name} links outside the repository`);
			assert.equal(url.hash, `#${name}`);
			const page = fs.readFileSync(fileURLToPath(url), 'utf8');
			assert.match(page, new RegExp(`^## ${name}$`, 'm'), `${url.pathname} has no section for ${name}`);
		}
});
