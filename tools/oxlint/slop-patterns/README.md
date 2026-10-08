# slop-patterns

Indirection that adds no behaviour, as an [oxlint](https://oxc.rs/docs/guide/usage/linter)
plugin. The rules come from the waste metrics SlopCodeBench measures — *trivial wrappers*,
*single-use functions*, *single-method classes* — kept to the ones a rule can name a
replacement for.

Only one of the three survived being run over a real repository: a single-use function is
mostly a route handler or a lifecycle hook a framework calls by name, and a single-method
class is mostly a middleware or an exception, so both report far more framework idiom than
slop. See "What was left out" below.

## no-trivial-wrapper

A named function whose entire body is one call that passes its own arguments on, unchanged
and in order, to another function. `formatCurrency(amount, currency)` returning
`formatMoney(amount, currency)` is a rename; `isLooseStoneType(t)` returning
`isLooseProductType(t)` is the same function under two names. The name reads as a place to
look, and there is nothing there.

```ts
export function formatCurrency(a: number, b?: string): string {
	return formatMoney(a, b);                       // reported
}

// instead
export { formatMoney as formatCurrency };
```

The rule passes anything that is not pure forwarding:

- a transformed, reordered, or added argument — `fetchUser(id.trim())`, `formatMoney(a, 'ILS')`;
- a default value, which is behaviour — `formatMoney(amount = 0)`;
- a callee that computes its own receiver — `new Intl.NumberFormat('en').format(amount)`;
- an anonymous function: an inline `(value) => fn(value)` is a callback signature being
  reshaped, is idiomatic, and has no name to remove;
- a body with more than one statement.

It also skips every function in a test file — a test double's `get`, `set` and `delete` forward
to a `Map` because they must mirror the real signature — and every function in `src/params.ts`.
SvelteKit names the matchers there and calls them from the router, so a one-line
`export const matchX = (param) => SET.has(param)` is the shape the framework requires.

Land it on `warn`. Over a 7,200-file SvelteKit monorepo it reports 33 functions in source;
about half are clear renames and half are getters and setters for one field
(`stoneCertificateFile() { return this.files.get(… })`) that read as deliberate.

### Wiring

`.oxlintrc.json` (the plugin path is relative to the config file):

```jsonc
{
	"jsPlugins": [{ "name": "slop-patterns", "specifier": "./tools/oxlint/slop-patterns/index.ts" }],
	"rules": {
		// TODO(slop-patterns-error): N findings — raise to error once they are cleaned up.
		"slop-patterns/no-trivial-wrapper": "warn"
	},
	"overrides": [
		{ "files": ["**/src/tests/**", "**/*.test.ts", "**/*.spec.ts"], "rules": { "slop-patterns/no-trivial-wrapper": "off" } }
	]
}
```

Fixtures and how to run them: `fixtures/no-trivial-wrapper/README.md`.

## What was left out

Measured over the same monorepo (742 Svelte, 7,217 TypeScript files):

| Rule | Findings | Why it is not here |
| --- | --- | --- |
| single-use function | 1,337 | Almost all are `handle`, `reroute`, `health_check`, route handlers and hooks a framework calls by name. Delta-gating does not help: every new route adds one. |
| single-method class | 0 | Every candidate was a Starlette middleware (`dispatch`) or an exception class (`__init__`), both required shapes. |
| verbosity, erosion, clone %, maintainability index | — | Whole-submission scores from a pinned binary, not local patterns, and a fixed threshold over a whole repository is what `structure` compares against its base instead. |
