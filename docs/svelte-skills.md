# svelte-skills

Svelte 5 / SvelteKit rules from the Svelte skills and docs. Each section says what the rule
reports, why, and what to write instead. Rules marked **fix** are rewritten by `eslint --fix`.

`svelteSkills.config()` also turns on three eslint-plugin-svelte rules: `valid-compile` with
warnings, `require-each-key` and `prefer-style-directive`.

## no-legacy-syntax

Svelte 4 syntax that runes mode replaces: `on:click`, `<slot>`, `<svelte:fragment>`,
`<svelte:component>`, `<svelte:self>`, `$$props` / `$$restProps` / `$$slots`, `export let`, `$:`,
`svelte/store`, `svelte/legacy`, `$app/stores`, the deprecated `$app/paths` exports (`base`,
`assets`, `resolveRoute`) and the deprecated `svelte` exports (`createEventDispatcher`,
`SvelteComponent`, `ComponentType`, `ComponentEvents`).

```svelte
<!-- reported -->
<script>
	export let count;
	$: double = count * 2;
</script>
<button on:click={() => count++}>{double}</button>

<!-- instead -->
<script>
	let { count } = $props();
	const double = $derived(count * 2);
</script>
<button onclick={() => count++}>{double}</button>
```

## prefer-attachment

An action defined in the same file (`use:tip` where `tip` is declared there). Write it as an
attachment and use `{@attach tip}`. Library actions such as `use:enhance` stay.

## no-class-directive

**fix.** `class:name={…}` directives. Svelte 5's `class` attribute takes arrays and objects.

```svelte
<div class="a" class:b={x}></div>   <!-- reported -->
<div class={['a', { b: x }]}></div>  <!-- instead -->
```

## no-index-each-key

An `{#each}` keyed by its index. The index stays the same when items move, so Svelte updates the
wrong DOM. Key by the item's id (or the value itself when values are unique). A list whose item is
unused (`{#each dots as _, i (i)}`) passes: the index is the only identity there.

## prefer-create-context

`setContext` / `getContext` / `hasContext` with a key. Use
`const [getX, setX] = createContext<T>()`, which is type-safe and needs no key.

## no-window-listener-in-effect

`window.addEventListener` / `document.addEventListener` in `onMount` or `$effect`. Use
`<svelte:window on…={handler} />` (or `<svelte:document>`); Svelte adds and removes it for you.

## no-browser-check-in-effect

`if (browser)` or `typeof window` inside an `$effect`. Effects never run on the server, so the
check is dead code.

## derived-by-for-functions

**fix.** `$derived(() => …)`. `$derived` takes an expression; given a function, the value is the
function. Use `$derived.by(() => …)`.

## no-state-write-in-effect

A `$state` / `$derived` variable assigned in the body of an `$effect`. Compute it with `$derived`
(writable, so it can still be set), or set it in the event handler that causes the change.
Callbacks the effect registers (timers, listeners) run later and pass.

## remote-error-not-throw

`throw new Error(…)` in a remote function handler. It reaches the client as "Internal Error". Use
`error(status, message)` from `@sveltejs/kit`, or `invalid()` in a `form()` for a recoverable
problem.

## remote-functions-in-remote-files

`query` / `command` / `form` / `prerender` imported outside a `*.remote.ts` file. Remote functions
live in remote files.

## no-await-const-in-boundary

`{@const x = await …}` inside `<svelte:boundary>`. It loops forever on client navigation when
pages share a query ([sveltejs/svelte#17717](https://github.com/sveltejs/svelte/issues/17717)).
Use `{#await}` or the query's properties.

## track-remote-query-args

A remote query called at the top of a component with reactive arguments. Its arguments are read
once, so the query never re-runs.

```svelte
<script>
	import { getPost } from './data.remote';
	let { id } = $props();
	const post = getPost(id);            // reported
	const post = $derived(getPost(id));  // instead
</script>
```

## no-const-tag

**fix.** `{@const x = y}` is legacy. Write `{const x = $derived(y)}`; a function needs no
`$derived`.

## no-throw-kit-error

**fix.** `throw error(…)` / `throw redirect(…)`. Since SvelteKit 2 they throw by themselves; call
them without `throw`.

## no-redirect-in-command

`redirect()` inside a `command()` handler. A command cannot redirect: return
`{ redirect: location }` and `goto()` it on the client.

## no-state-write-in-derived

`$state` written while a `$derived` is computed. It throws (`state_unsafe_mutation`). Derive the
value, or write it in the event that causes the change.

## no-flush-sync-in-effect

`flushSync()` in the body of an `$effect`. It throws (`flush_sync_in_effect`); use `await tick()`.

## no-server-module-state

A module-level `let` / `var` in server-only code (`*.server.ts`, `*.remote.ts`). Module state on
the server is shared between all requests, so between users. Keep it in the request
(`event.locals`, the load return value).

## no-volatile-each-key

An `{#each}` keyed by an object or array literal. The key is new on every run
(`each_key_volatile`). Key by a stable id, or join the parts into a string.

## no-checkbox-bind-value

`bind:value` on `<input type="checkbox">`. A checkbox holds its state in `checked`: use
`bind:checked` (`bind:group` for a list).

## no-set-cookie-header

`set-cookie` passed to `setHeaders`. SvelteKit refuses it; use `cookies.set(name, value, { path })`.
