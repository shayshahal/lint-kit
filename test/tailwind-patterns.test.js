import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classRule, config, plugin, toDvh } from '../src/tailwind-patterns.js';
import { lint, svelteTester, tsTester } from './helpers.js';

const PAGE = 'src/routes/+page.svelte';
const UI = 'src/lib/components/ui/button/button.svelte';
const ids = (code, filename, options) =>
	lint(code, filename, config(options)).map(
		// no-restricted-imports puts its own sentence before the custom message
		(m) => `${m.ruleId}: ${m.message.replace(/^.* is restricted[^.]*. /, '').slice(0, 20)}`,
	);
const count = (code, filename, options) => lint(code, filename, config(options)).length;

test('transition-all: markup, cn() strings and template literals; ui/ too', () => {
	assert.equal(count('<div class="p-2 transition-all"></div>', PAGE), 1);
	assert.equal(count('<div class="hover:!transition-all"></div>', PAGE), 1);
	assert.equal(count("<script>const c = cn('transition-all', x);</script>", PAGE), 1);
	assert.equal(count('<script>const c = `a ${b} transition-all`;</script>', PAGE), 1);
	assert.equal(count('<div class="transition-all"></div>', UI), 1);
	assert.equal(count('<div class="transition-colors transition"></div>', PAGE), 0);
});

test('vh: h-screen and [..vh] fail, dvh / svh pass', () => {
	assert.equal(count('<div class="min-h-screen"></div>', PAGE), 1);
	assert.equal(count('<div class="max-h-[90vh]"></div>', PAGE), 1);
	assert.equal(count('<div class="max-h-[calc(100vh-2rem)]"></div>', UI), 1);
	assert.equal(count('<div class="h-dvh max-h-[90dvh] min-h-svh"></div>', PAGE), 0);
});

test('vh: --fix swaps in dvh and leaves the rest of the class alone', () => {
	assert.equal(toDvh('"md:min-h-screen h-screen! p-2 max-h-[90vh]"'), '"md:min-h-dvh h-dvh! p-2 max-h-[90dvh]"');
	assert.equal(toDvh('[calc(100vh-10vh)]'), '[calc(100dvh-10dvh)]');
	assert.equal(toDvh('`a ${b} h-screen`'), '`a ${b} h-dvh`');
	assert.equal(toDvh('"w-screen h-screen-ish 90vh"'), '"w-screen h-screen-ish 90vh"');
});

svelteTester.run('viewport-vh (svelte)', plugin.rules['viewport-vh'], {
	valid: [{ code: '<div class="h-dvh min-h-svh max-h-[90dvh]"></div>', filename: PAGE }],
	invalid: [
		{
			code: '<div class="p-2 min-h-screen"></div>',
			filename: PAGE,
			errors: [{ message: /dvh/ }],
			output: '<div class="p-2 min-h-dvh"></div>',
		},
		{
			code: '<div class={cn(\'max-h-[90vh]\', x)}></div>',
			filename: PAGE,
			errors: 1,
			output: '<div class={cn(\'max-h-[90dvh]\', x)}></div>',
		},
	],
});

tsTester.run('viewport-vh (ts)', plugin.rules['viewport-vh'], {
	valid: ["const c = 'h-dvh';"],
	invalid: [
		{
			code: 'const c = `sm:h-screen ${x}`;',
			errors: [{ message: 'custom' }],
			options: [{ message: 'custom' }],
			output: 'const c = `sm:h-dvh ${x}`;',
		},
	],
});

test('dark: colour overrides fail outside ui/ only; sizes after dark: pass', () => {
	assert.equal(count('<div class="dark:bg-zinc-900"></div>', PAGE), 1);
	assert.equal(count('<div class="md:dark:hover:text-white"></div>', PAGE), 1);
	assert.equal(count('<div class="dark:bg-zinc-900"></div>', UI), 0);
	assert.equal(count('<div class="dark:text-sm dark:border-2 dark:ring-offset-2"></div>', PAGE), 0);
});

test('bg-white / text-black fail only with darkMode, in ui/ too', () => {
	// one report per class string, however many tokens in it match
	const code = '<div class="bg-white"></div><p class="p-1 text-black/80"></p>';
	assert.equal(count(code, PAGE), 0);
	assert.equal(count(code, PAGE, { darkMode: true }), 2);
	assert.equal(count(code, UI, { darkMode: true }), 2);
	assert.equal(count('<div class="bg-white-ish"></div>', PAGE, { darkMode: true }), 0);
});

test('a dialog Content needs a Title', () => {
	const untitled = '<Dialog.Root><Dialog.Content><p>x</p></Dialog.Content></Dialog.Root>';
	const titled =
		'<Dialog.Root><Dialog.Content><Dialog.Title class="sr-only">t</Dialog.Title></Dialog.Content></Dialog.Root>';
	assert.equal(count(untitled, PAGE), 1);
	assert.equal(count(untitled.replaceAll('Dialog', 'Sheet'), PAGE), 1);
	assert.equal(count(titled, PAGE), 0);
	// the overlay wrappers live in ui/
	assert.equal(count(untitled, UI), 0);
});

test('icons import from their own path', () => {
	assert.equal(count("<script>import { XIcon } from '@lucide/svelte';</script>", PAGE), 1);
	assert.equal(count("import type { IconProps } from '@lucide/svelte';", 'src/lib/x.ts'), 0);
	assert.equal(count("import XIcon from '@lucide/svelte/icons/x';", 'src/lib/x.ts'), 0);
});

test('extra / extraUi / restrictedImports add to the defaults, messages replace', () => {
	const options = {
		uiFiles: ['src/ui/**'],
		extra: [{ selector: "CallExpression[callee.object.name='toast'][callee.property.name='error']", message: 'notify' }],
		extraUi: classRule(String.raw`/(^|\s)text-destructive(\s|$)/`, 'error text'),
		restrictedImports: [{ name: 'svelte/transition', importNames: ['fly'], message: 'motion' }],
		messages: { transitionAll: 'list them' },
	};
	const code =
		"<script>import { fly } from 'svelte/transition'; toast.error('x');</script><p class=\"text-destructive transition-all\"></p>";
	assert.deepEqual(ids(code, PAGE, options).sort(), [
		'no-restricted-imports: motion',
		'no-restricted-syntax: error text',
		'no-restricted-syntax: list them',
		'no-restricted-syntax: notify',
	]);
	// in the ui folder: extraUi and the defaults, not extra
	assert.deepEqual(ids(code, 'src/ui/x.svelte', options).sort(), [
		'no-restricted-imports: motion',
		'no-restricted-syntax: error text',
		'no-restricted-syntax: list them',
	]);
});
