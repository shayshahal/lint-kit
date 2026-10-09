import assert from 'node:assert/strict';
import { test } from 'node:test';
import prose, { config, JARGON, noJargon, preferJsdoc } from '../tools/eslint/prose.mjs';
import { lint, svelteTester, tsTester } from './helpers.js';

const S = 'src/routes/x.svelte';
const ts = (code, errors, extra = {}) => ({
	code,
	filename: 'src/lib/x.ts',
	...(Array.isArray(errors) && errors.length === 0 ? {} : { errors }),
	...extra,
});

tsTester.run('no-jargon', noJargon, {
	valid: [
		// plain words, and the same words inside code spans or quotes
		ts('// Use the cache for this.\nconst a = 1;\n', []),
		ts('// Call `utilize` once the payload is here.\nconst a = 1;\n', []),
		ts('// The docs call it "leverage".\nconst a = 1;\n', []),
		// a directive is not prose
		ts('// eslint-disable-next-line no-console\nconsole.log(1);\n', []),
		ts('// @ts-expect-error the fixture has no types\nconst a: number = "x";\n', []),
		// a word the project allowed, and the identifier itself is never a comment
		ts('// utilize the buffer\nconst a = 1;\n', [], { options: [{ allow: ['utilize'] }] }),
		ts('const utilize = (x) => x;\n', []),
	],
	invalid: [
		ts('// We utilize the cache here.\nconst a = 1;\n', [
			{ messageId: 'jargon', data: { word: 'utilize', plain: 'use' }, suggestions: [{ messageId: 'use', output: '// We use the cache here.\nconst a = 1;\n' }] },
		]),
		// the form that belongs in the sentence is what the suggestion writes
		ts('// It utilizes the cache.\nconst a = 1;\n', [
			{ messageId: 'jargon', data: { word: 'utilizes', plain: 'uses' }, suggestions: [{ messageId: 'use', output: '// It uses the cache.\nconst a = 1;\n' }] },
		]),
		// a phrase, and a block comment
		ts('/* Prior to the request, warm the cache. */\nconst a = 1;\n', [
			{ messageId: 'jargon', data: { word: 'Prior to', plain: 'before' }, suggestions: 1 },
		]),
		// several hits in one comment are several findings
		ts('// Additionally, we leverage the cache in order to be fast.\nconst a = 1;\n', [
			{ messageId: 'jargon', data: { word: 'Additionally', plain: 'also' }, suggestions: 1 },
			{ messageId: 'jargon', data: { word: 'leverage', plain: 'use' }, suggestions: 1 },
			{ messageId: 'jargon', data: { word: 'in order to', plain: 'to' }, suggestions: 1 },
		]),
		// `extra` adds the project's own word
		ts('// The widget is idempotent.\nconst a = 1;\n', [{ messageId: 'jargon', data: { word: 'idempotent', plain: 'safe to repeat' }, suggestions: 1 }], {
			options: [{ extra: { idempotent: 'safe to repeat' } }],
		}),
	],
});

svelteTester.run('no-jargon (svelte)', noJargon, {
	valid: [{ code: '<script lang="ts">\n\t// Use the cache.\n\tconst a = 1;\n</script>\n', filename: S }],
	invalid: [
		{
			code: '<script lang="ts">\n\t// Utilize the cache.\n\tconst a = 1;\n</script>\n',
			filename: S,
			errors: [{ messageId: 'jargon', data: { word: 'Utilize', plain: 'use' }, suggestions: 1 }],
		},
	],
});

tsTester.run('prefer-jsdoc', preferJsdoc, {
	valid: [
		// already JSDoc
		ts('/** The user id. */\nexport const id = 1;\n', []),
		// a comment above code that is not an export or a member
		ts('// keep this in step with the server\nconst id = 1;\n', []),
		// a blank line breaks the association
		ts('// about the next thing\n\nexport const id = 1;\n', []),
		// a marker for work left to do is not documentation
		ts('// TODO: rename this\nexport const id = 1;\n', []),
		// a directive is not documentation
		ts('// eslint-disable-next-line no-var\nexport var id = 1;\n', []),
	],
	invalid: [
		{
			code: '// The user id.\nexport const id = 1;\n',
			filename: 'src/lib/x.ts',
			errors: [{ messageId: 'jsdoc' }],
			output: '/** The user id. */\nexport const id = 1;\n',
		},
		// a run of `//` lines becomes one block
		{
			code: '// The user id.\n// Set once at sign-up.\nexport const id = 1;\n',
			filename: 'src/lib/x.ts',
			errors: [{ messageId: 'jsdoc' }],
			output: '/**\n * The user id.\n * Set once at sign-up.\n */\nexport const id = 1;\n',
		},
		// a class member, keeping its indentation
		{
			code: 'class User {\n\t// The name shown in the UI.\n\tname = "x";\n}\n',
			filename: 'src/lib/x.ts',
			errors: [{ messageId: 'jsdoc' }],
			output: 'class User {\n\t/** The name shown in the UI. */\n\tname = "x";\n}\n',
		},
		// an exported interface and one of its members, both at once
		{
			code: '// A user.\nexport interface User {\n\t// The id.\n\tid: number;\n}\n',
			filename: 'src/lib/x.ts',
			errors: [{ messageId: 'jsdoc' }, { messageId: 'jsdoc' }],
			output: '/** A user. */\nexport interface User {\n\t/** The id. */\n\tid: number;\n}\n',
		},
		// a default export
		{
			code: '// The entry point.\nexport default function run() {}\n',
			filename: 'src/lib/x.ts',
			errors: [{ messageId: 'jsdoc' }],
			output: '/** The entry point. */\nexport default function run() {}\n',
		},
	],
});

test('config() wires both rules at error and names its entry', () => {
	const [entry] = config();
	assert.equal(entry.name, 'prose');
	assert.deepEqual(entry.rules, { 'prose/no-jargon': 'error', 'prose/prefer-jsdoc': 'error' });
	assert.deepEqual(Object.keys(prose.plugin.rules), ['no-jargon', 'prefer-jsdoc']);
});

test('the set is off until it is asked for: no dependency selects it, and it lints only src', () => {
	assert.ok(Object.keys(JARGON).length > 30);
	const messages = lint('// Utilize the cache.\nconst a = 1;\n', 'src/lib/x.ts', config());
	assert.equal(messages.length, 1);
	assert.equal(lint('// Utilize the cache.\nconst a = 1;\n', 'src/tests/x.ts', config()).length, 0);
	assert.equal(lint('// Utilize the cache.\nconst a = 1;\n', 'src/lib/x.spec.ts', config()).length, 0);
});

test('the suggestion replaces the word in place, leaving the rest of the comment alone', () => {
	const code = '// We utilize the cache.\nconst a = 1;\n';
	const [message] = lint(code, 'src/lib/x.ts', config());
	const [suggestion] = message.suggestions;
	assert.equal(suggestion.desc, 'Use `use`.');
	// ESLint never applies a suggestion on its own, so apply the edit it carries
	const [start, end] = suggestion.fix.range;
	assert.equal(code.slice(0, start) + suggestion.fix.text + code.slice(end), '// We use the cache.\nconst a = 1;\n');
});
