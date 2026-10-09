# slop-patterns

Indirection that adds no behaviour, as an [oxlint](https://oxc.rs/docs/guide/usage/linter)
plugin. The rules come from the waste metrics SlopCodeBench measures — *trivial wrappers*,
*single-use functions*, *single-method classes* — kept to the ones a rule can name a
replacement for, plus the type-level shape of the same thing: an assertion that discards the
type a value had is a claim standing in for a check.

Of the three SlopCodeBench measures only one survived being run over a real repository: a
single-use function is mostly a route handler or a lifecycle hook a framework calls by name,
and a single-method class is mostly a middleware or an exception, so both report far more
framework idiom than slop. See "What was left out" below.

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
to a `Map` because they must mirror the real signature — and every function in `src/params/<name>.ts`.
SvelteKit names the matchers there and calls them from the router, so a one-line
`export const match = (param) => SET.has(param)` is the shape the framework requires. A file
beside the folder (`src/params.ts`) is not a matcher and is still reported.

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
		"slop-patterns/no-chained-type-assertions": "warn",
		"slop-patterns/no-trivial-wrapper": "warn"
	},
	"overrides": [
		{ "files": ["**/src/tests/**", "**/*.test.ts", "**/*.spec.ts"], "rules": { "slop-patterns/no-trivial-wrapper": "off" } }
	]
}
```

Fixtures and how to run them: `fixtures/no-trivial-wrapper/README.md`.

## no-chained-type-assertions

Two or more assertions nested in one expression: `input as unknown as User`,
`<Config><unknown>input`, or three deep. The first assertion throws away everything the
value's type said, so nothing downstream is checked, and the second is a claim no one has
verified. It is how generated code silences a type error instead of handling the case it is
about.

```ts
// reported
const user = input as unknown as User;

// instead: parse where the value enters, or keep the one assertion that is true
const user = parseUser(input);
const narrowed = isUser(input) ? (input as User) : null;
```

The rule passes a single assertion, and a chain of nothing but `as const`, which widens a
literal and asserts nothing about what it was. It reports the outermost assertion once for
the whole chain. Like `no-trivial-wrapper` it stays out of test files, where a double has to
stand in for a type it is not (`new FakeXHR() as unknown as XMLHttpRequest`) — over the
monorepo below that exemption alone is 35 of the 78 findings.

Land it on `warn`. Over the same monorepo (1,431 files under `packages/**/src`, including
`.svelte`), it reports 43, none in a test file.

## What was left out

Measured over the same monorepo (742 Svelte, 7,217 TypeScript files):

| Rule | Findings | Why it is not here |
| --- | --- | --- |
| single-use function | 1,337 | Almost all are `handle`, `reroute`, `health_check`, route handlers and hooks a framework calls by name. |
| single-method class | 0 | Every candidate was a Starlette middleware (`dispatch`) or an exception class (`__init__`), both required shapes. |
| trivial type alias (`type UserId = string`) | 2 | Too rare to be a rule: two primitive aliases in `packages/frontend/shared/filters/src/types.ts`, and neither is worth a finding. |
| a class of nothing but statics | 0 | The same measurement that left single-method classes out, on a different predicate. |
| verbosity, erosion, clone %, maintainability index | — | Whole-submission scores from a pinned binary, not local patterns, and a fixed threshold over a whole repository is what `structure` compares against its base instead. |

That first count is over a whole repository, which is not the population a rule fires on: a rule
sees new code. Running it over the 23 merges that touched Python in JewelryX's backend, a
function added by a branch and called at most twice is **4 of 15** short new functions, in **3 of
23** merges — the same order as the complexity gate, so the delta does help, and the earlier
"every new route adds one" was wrong: routes are decorated, and a rule excludes decorated
functions.

What the four were is why it is still not here. Two are `is_in_catalog` and
`in_catalog_listing_ids`, one call site each, whose names carry the domain meaning and whose
bodies await a repository call and so cannot be inlined readably. One is `_user_items`, shared by
a find and a count query, and **two call sites is what a helper is for**, not evidence of waste.
One had been deleted since. Judging them needs the call site, which a rule does not have, so the
advice "inline it" is wrong on well-factored code more often than on slop.
