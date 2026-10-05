import assert from 'node:assert/strict';
import { test } from 'node:test';
import svelteSkills, { config, rules } from '../tools/eslint/svelte-skills.mjs';
import { lint, svelteTester, tsTester } from './helpers.js';

const S = 'src/routes/x.svelte';
const svelteCase = (code, errors, extra = {}) => ({ code, filename: S, errors, ...extra });
const ts = (code, errors, filename = 'src/lib/x.ts', extra = {}) => ({
	code,
	filename,
	// a valid case passes [] and must not carry the key
	...(Array.isArray(errors) && errors.length === 0 ? {} : { errors }),
	...extra,
});
const script = (body, markup = '') => `<script lang="ts">\n${body}\n</script>\n${markup}`;

svelteTester.run('no-legacy-syntax (svelte)', rules['no-legacy-syntax'], {
	valid: [
		{ code: script('let { a } = $props();', '<button onclick={() => a}>x</button>'), filename: S },
		{ code: '{@render children()}', filename: S },
	],
	invalid: [
		svelteCase('<button on:click={() => 1}>x</button>', [{ message: /onclick=/ }]),
		svelteCase('<div><slot /></div>', [{ message: /snippet/ }]),
		svelteCase('<svelte:component this={C} />', [{ message: /component variable/ }]),
		svelteCase(script('const p = $$props;'), [{ message: /\$props\(\)/ }]),
		svelteCase(script('export let a;'), [{ message: /export let/ }]),
		svelteCase(script('let a = 1; let b; $: b = a * 2;'), [{ message: /\$derived/ }]),
	],
});

tsTester.run('no-legacy-syntax (imports)', rules['no-legacy-syntax'], {
	valid: [
		ts("import { resolve } from '$app/paths';", []),
		ts("import { page } from '$app/state';", []),
		// export let is a prop only in a component
		ts('export let counter = 0;', []),
	],
	invalid: [
		ts("import { writable } from 'svelte/store';", [{ message: /class that has \$state/ }]),
		ts("import { run } from 'svelte/legacy';", [{ message: /migration shim/ }]),
		ts("import { page } from '$app/stores';", [{ message: /\$app\/state/ }]),
		ts("import { base, resolve } from '$app/paths';", [{ message: /base is deprecated/ }]),
		ts("import { createEventDispatcher } from 'svelte';", [{ message: /callback prop/ }]),
	],
});

svelteTester.run('prefer-attachment', rules['prefer-attachment'], {
	valid: [
		{
			code: script("import { enhance } from '$app/forms';", '<form use:enhance></form>'),
			filename: S,
		},
	],
	invalid: [
		svelteCase(script('function tip(node: HTMLElement) {}', '<div use:tip></div>'), [
			{ message: /\{@attach tip\}/ },
		]),
	],
});

svelteTester.run('no-class-directive', rules['no-class-directive'], {
	valid: [{ code: "<div class={['a', { b: x }]}></div>", filename: S }],
	invalid: [
		svelteCase('<div class="a" class:b={x}></div>', 1, {
			output: "<div class={['a', { b: x }]}></div>",
		}),
		svelteCase('<div class:active class:open={isOpen}></div>', 1, {
			output: '<div class={{ active, open: isOpen }}></div>',
		}),
		svelteCase('<div class="a {b}" class:c={d}></div>', 1, {
			output: '<div class={[`a ${b}`, { c: d }]}></div>',
		}),
		// A new class attribute after a spread would override the spread's class: report only.
		svelteCase('<div {...rest} class:a={x}></div>', 1, { output: null }),
	],
});

svelteTester.run('no-index-each-key', rules['no-index-each-key'], {
	valid: [
		{ code: '{#each items as item (item.id)}{item.name}{/each}', filename: S },
		// positions only: the item is unused
		{ code: '{#each dots as _, i (i)}<span></span>{/each}', filename: S },
	],
	invalid: [svelteCase('{#each items as item, i (i)}{item}{/each}', [{ message: /not a key/ }])],
});

tsTester.run('prefer-create-context', rules['prefer-create-context'], {
	valid: [ts("import { createContext } from 'svelte';", [])],
	invalid: [
		ts("import { setContext, getContext } from 'svelte';", [
			{ message: /createContext/ },
			{ message: /createContext/ },
		]),
	],
});

svelteTester.run('no-window-listener-in-effect', rules['no-window-listener-in-effect'], {
	valid: [
		{ code: script("function f() { window.addEventListener('resize', f); }"), filename: S },
		{ code: script("let el; $effect(() => { el.addEventListener('click', f); });"), filename: S },
	],
	invalid: [
		svelteCase(
			script(
				"import { onMount } from 'svelte'; onMount(() => { window.addEventListener('resize', f); });",
			),
			[{ message: /<svelte:window/ }],
		),
		svelteCase(script("$effect(() => { document.addEventListener('keydown', f); });"), [
			{ message: /<svelte:document/ },
		]),
	],
});

svelteTester.run('no-browser-check-in-effect', rules['no-browser-check-in-effect'], {
	valid: [{ code: script('let x = 1; $effect(() => { if (x) f(); });'), filename: S }],
	invalid: [
		svelteCase(
			script("import { browser } from '$app/environment'; $effect(() => { if (browser) f(); });"),
			[{ message: /never run on the server/ }],
		),
		svelteCase(script("$effect(() => { if (typeof window !== 'undefined') f(); });"), 1),
	],
});

svelteTester.run('derived-by-for-functions', rules['derived-by-for-functions'], {
	valid: [
		{ code: script('let a = 1; const d = $derived.by(() => a * 2);'), filename: S },
		{ code: script('let a = 1; const d = $derived(a * 2);'), filename: S },
	],
	invalid: [
		svelteCase(script('let a = 1; const d = $derived(() => a * 2);'), [{ message: /\$derived\.by/ }], {
			output: script('let a = 1; const d = $derived.by(() => a * 2);'),
		}),
	],
});

svelteTester.run('no-state-write-in-effect', rules['no-state-write-in-effect'], {
	valid: [
		// A callback the effect registers runs later.
		{
			code: script('let n = $state(0); $effect(() => { const id = setInterval(() => { n++; }); return () => clearInterval(id); });'),
			filename: S,
		},
		{ code: script('let n = $state(0); function inc() { n++; }'), filename: S },
	],
	invalid: [
		svelteCase(script('let a = $state(1); let n = $state(0); $effect(() => { n = a * 2; });'), [
			{ message: /Compute "n" with \$derived/ },
		]),
	],
});

tsTester.run('remote-error-not-throw', rules['remote-error-not-throw'], {
	valid: [
		ts(
			"import { query } from '$app/server'; import { error } from '@sveltejs/kit'; export const q = query(async () => { error(404, 'x'); });",
			[],
			'src/lib/data.remote.ts',
		),
		ts("function f() { throw new Error('x'); }", [], 'src/lib/data.remote.ts'),
	],
	invalid: [
		ts(
			"import { query } from '$app/server'; export const q = query(async () => { throw new Error('x'); });",
			[{ message: /Internal Error/ }],
			'src/lib/data.remote.ts',
		),
	],
});

tsTester.run('remote-functions-in-remote-files', rules['remote-functions-in-remote-files'], {
	valid: [
		ts("import { query } from '$app/server';", [], 'src/lib/data.remote.ts'),
		ts("import { getRequestEvent } from '$app/server';", []),
	],
	invalid: [ts("import { query, command } from '$app/server';", 2)],
});

svelteTester.run('no-await-const-in-boundary', rules['no-await-const-in-boundary'], {
	valid: [
		{ code: '<svelte:boundary>{#await q() then x}{x}{/await}</svelte:boundary>', filename: S },
	],
	invalid: [
		svelteCase('<svelte:boundary>{@const x = await q()}{x}</svelte:boundary>', [
			{ message: /loops forever/ },
		]),
	],
});

svelteTester.run('track-remote-query-args', rules['track-remote-query-args'], {
	valid: [
		{
			code: script("import { getPost } from './data.remote'; let { id } = $props(); const post = $derived(getPost(id));"),
			filename: S,
		},
		{ code: script("import { getPosts } from './data.remote'; const posts = getPosts();"), filename: S },
	],
	invalid: [
		svelteCase(
			script("import { getPost } from './data.remote'; let { id } = $props(); const post = getPost(id);"),
			[{ message: /\$derived\(getPost/ }],
		),
	],
});

svelteTester.run('no-const-tag', rules['no-const-tag'], {
	valid: [{ code: '{#if x}{const y = $derived(x * 2)}{y}{/if}', filename: S }],
	invalid: [
		svelteCase('{#if x}{@const y = x * 2}{y}{/if}', 1, {
			output: '{#if x}{const y = $derived(x * 2)}{y}{/if}',
		}),
		// A function reads its inputs when called: no $derived.
		svelteCase('{#if x}{@const f = () => x}{f()}{/if}', 1, {
			output: '{#if x}{const f = () => x}{f()}{/if}',
		}),
	],
});

tsTester.run('no-throw-kit-error', rules['no-throw-kit-error'], {
	valid: [
		ts("import { error } from '@sveltejs/kit'; export function load() { error(404, 'x'); }", []),
		ts("function error() { return new Error(); } function f() { throw error(); }", []),
	],
	invalid: [
		ts(
			"import { error, redirect as go } from '@sveltejs/kit'; export function load() { throw error(404, 'x'); throw go(303, '/'); }",
			[{ message: /error\(\) throws by itself/ }, { message: /redirect\(\) throws by itself/ }],
			'src/lib/x.ts',
			{
				output:
					"import { error, redirect as go } from '@sveltejs/kit'; export function load() { error(404, 'x'); go(303, '/'); }",
			},
		),
	],
});

tsTester.run('no-redirect-in-command', rules['no-redirect-in-command'], {
	valid: [
		ts(
			"import { form } from '$app/server'; import { redirect } from '@sveltejs/kit'; export const f = form(async () => { redirect(303, '/'); });",
			[],
			'src/lib/data.remote.ts',
		),
	],
	invalid: [
		ts(
			"import { command } from '$app/server'; import { redirect } from '@sveltejs/kit'; export const c = command(async () => { redirect(303, '/'); });",
			[{ message: /cannot redirect/ }],
			'src/lib/data.remote.ts',
		),
	],
});

svelteTester.run('no-state-write-in-derived', rules['no-state-write-in-derived'], {
	valid: [
		{
			code: script('let n = $state(0); const d = $derived.by(() => { let local = 0; local++; return local + n; });'),
			filename: S,
		},
		{ code: script('let n = $state(0); function inc() { n++; }'), filename: S },
	],
	invalid: [
		svelteCase(script('let n = $state(0); const d = $derived.by(() => { n++; return n; });'), [
			{ message: /state_unsafe_mutation/ },
		]),
		svelteCase(script('let o = $state({ a: 1 }); const d = $derived((o.a = 2));'), 1),
	],
});

svelteTester.run('no-flush-sync-in-effect', rules['no-flush-sync-in-effect'], {
	valid: [{ code: script("import { flushSync } from 'svelte'; function f() { flushSync(); }"), filename: S }],
	invalid: [
		svelteCase(script("import { flushSync } from 'svelte'; $effect(() => { flushSync(); });"), [
			{ message: /tick\(\)/ },
		]),
	],
});

tsTester.run('no-server-module-state', rules['no-server-module-state'], {
	valid: [
		ts('const cache = new Map();', [], 'src/routes/+page.server.ts'),
		ts('let count = 0;', [], 'src/lib/counter.ts'),
	],
	invalid: [
		ts('let cache = new Map();', [{ message: /shared between all requests/ }], 'src/routes/+page.server.ts'),
		ts('export let last = null;', 1, 'src/lib/data.remote.ts'),
	],
});

svelteTester.run('no-volatile-each-key', rules['no-volatile-each-key'], {
	valid: [{ code: '{#each items as item (item.id)}{item}{/each}', filename: S }],
	invalid: [
		svelteCase('{#each items as item ({ id: item.id })}{item}{/each}', [{ message: /each_key_volatile/ }]),
		svelteCase('{#each items as item ([item.a, item.b])}{item}{/each}', 1),
	],
});

svelteTester.run('no-checkbox-bind-value', rules['no-checkbox-bind-value'], {
	valid: [
		{ code: '<input type="checkbox" bind:checked={on} />', filename: S },
		{ code: '<input type="text" bind:value={t} />', filename: S },
	],
	invalid: [svelteCase('<input type="checkbox" bind:value={on} />', [{ message: /bind:checked/ }])],
});

tsTester.run('no-set-cookie-header', rules['no-set-cookie-header'], {
	valid: [ts("export function load({ setHeaders }) { setHeaders({ 'cache-control': 'max-age=60' }); }", [])],
	invalid: [
		ts("export function load({ setHeaders }) { setHeaders({ 'Set-Cookie': 'a=b' }); }", [
			{ message: /cookies\.set/ },
		]),
	],
});

test('every rule has a test above', async () => {
	const source = await import('node:fs').then((fs) =>
		fs.readFileSync(new URL(import.meta.url), 'utf8'),
	);
	const untested = Object.keys(rules).filter((name) => !source.includes(`rules['${name}']`));
	assert.deepEqual(untested, []);
});

test('config() turns every rule on at error, plus the three eslint-plugin-svelte rules', () => {
	const [entry] = config();
	assert.equal(Object.keys(rules).length, 22);
	for (const name of Object.keys(rules)) assert.equal(entry.rules[`svelte-skills/${name}`], 'error');
	assert.deepEqual(entry.rules['svelte/valid-compile'], ['error', { ignoreWarnings: false }]);
	assert.equal(entry.rules['svelte/require-each-key'], 'error');
	assert.equal(entry.rules['svelte/prefer-style-directive'], 'error');
	assert.ok(entry.ignores.includes('**/*.test.ts'));
	assert.equal(svelteSkills.config, config);
});

test('config() works in a real ESLint run, and skips tests', () => {
	const code = script("import { writable } from 'svelte/store';", '{#each xs as x}{x}{/each}');
	const ids = lint(code, 'src/routes/+page.svelte', config()).map((m) => m.ruleId);
	assert.deepEqual(ids.sort(), ['svelte-skills/no-legacy-syntax', 'svelte/require-each-key']);
	assert.deepEqual(
		lint(code, 'src/tests/Page.svelte', config()).filter((m) => m.ruleId?.startsWith('svelte-skills')),
		[],
	);
});
