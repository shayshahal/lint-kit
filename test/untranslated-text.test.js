import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config, rule } from '../src/untranslated-text.js';
import { lint, svelteTester, tsTester } from './helpers.js';

const S = 'src/routes/x.svelte';
const HEBREW = '[\\u0590-\\u05FF]';

svelteTester.run('no-untranslated-text (markup)', rule, {
	valid: [
		{ code: '<p>{m.greeting()}</p>', filename: S },
		{ code: '<a href="mailto:a@b.co">a@b.co</a>', filename: S },
		{ code: '<p>https://example.com</p><p>SAVE20</p><p>03-XXXXXXX</p><p>JPG, PNG</p>', filename: S },
		{ code: '<p>Facebook</p><span>PM</span>', filename: S },
		// one letter is not a word
		{ code: '<p>x</p><p>12</p>', filename: S },
		{ code: '<style>p { color: red; }</style><script>const a = 1;</script>', filename: S },
		{ code: '<p>Acme</p>', filename: S, options: [{ allow: ['Acme( Inc)?'] }] },
		{ code: '<input placeholder={m.search()} />', filename: S },
	],
	invalid: [
		{ code: '<p>Hello</p>', filename: S, errors: [{ messageId: 'text' }] },
		{ code: '<p>שלום</p>', filename: S, errors: 1 },
		{ code: '<p>Привет</p>', filename: S, errors: 1 },
		{ code: '<input placeholder="Search" aria-label="Search" />', filename: S, errors: 2 },
		{ code: '<img alt="A ring" src="/r.png" />', filename: S, errors: 1 },
		{
			code: '<p>Hello</p>',
			filename: S,
			options: [{ messages: { text: 'Use messages/en.json.' } }],
			errors: [{ message: 'Use messages/en.json.' }],
		},
	],
});

tsTester.run('no-untranslated-text (code)', rule, {
	valid: [
		// without bannedInCode, strings in code are not checked
		{ code: "const label = 'שלום';", filename: 'src/lib/x.ts' },
		{ code: "const label = 'Hello';", filename: 'src/lib/x.ts', options: [{ bannedInCode: HEBREW }] },
		{
			code: "const t = { he: 'שלום', en: 'Hello' };",
			filename: 'src/lib/x.ts',
			options: [{ bannedInCode: HEBREW, locales: ['he', 'en'] }],
		},
		{
			code: "const t = lang === 'en' ? 'Hello' : 'שלום';",
			filename: 'src/lib/x.ts',
			options: [{ bannedInCode: HEBREW, inlineLocales: true }],
		},
	],
	invalid: [
		{
			code: "const label = 'שלום';",
			filename: 'src/lib/x.ts',
			options: [{ bannedInCode: HEBREW }],
			errors: [{ messageId: 'code' }],
		},
		{
			code: 'const label = `שלום ${name}`;',
			filename: 'src/lib/x.ts',
			options: [{ bannedInCode: HEBREW }],
			errors: 1,
		},
		// a lone { he } is not a translation pair
		{
			code: "const t = { he: 'שלום' };",
			filename: 'src/lib/x.ts',
			options: [{ bannedInCode: HEBREW, locales: ['he', 'en'] }],
			errors: 1,
		},
		// a conditional passes only with inlineLocales
		{
			code: "const t = lang === 'en' ? 'Hello' : 'שלום';",
			filename: 'src/lib/x.ts',
			options: [{ bannedInCode: HEBREW }],
			errors: 1,
		},
	],
});

test('config() applies the rule to src/ and skips tests and stories', () => {
	const entries = config({ bannedInCode: HEBREW, ignores: ['src/lib/seo.ts'] });
	assert.deepEqual(entries[0].rules['untranslated-text/no-untranslated-text'], [
		'error',
		{ bannedInCode: HEBREW },
	]);
	assert.equal(lint('<p>Hello</p>', 'src/routes/+page.svelte', entries).length, 1);
	assert.equal(lint('<p>Hello</p>', 'src/tests/Page.svelte', entries).length, 0);
	assert.equal(lint('<p>Hello</p>', 'src/lib/Card.stories.svelte', entries).length, 0);
	assert.equal(lint("const a = 'שלום';", 'src/lib/seo.ts', entries).length, 0);
});
