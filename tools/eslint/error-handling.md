# error-handling

Errors that are caught and then lost. All three patterns are common in unreviewed generated code
([slop-scan](https://github.com/modem-dev/slop-scan) measures them across a repository); these
rules stop them one line at a time, in `.svelte` files too.

A comment inside the catch block or the `.catch()` callback says why ignoring the error is right,
and the rule passes:

```ts
try {
	localStorage.setItem(key, value);
} catch {
	// private mode: the draft just isn't kept
}
```

`errorHandling.config()` takes `inspection`, which narrows all three rules to the lines the branch
added since the merge-base with its base (`init` writes it); `inspection.mjs` beside this file has
the detail.

## no-swallowed-catch

A `catch` block that is empty, only logs, or only returns an empty value (`null`, `undefined`,
`''`, `[]`, `{}`, nothing). The function then carries on as if nothing failed, and the caller
cannot tell a failure from an empty result. Booleans and numbers are answers and statuses, so
`catch { return false; }` in a predicate and an exit code after the error is logged pass.

```ts
try { await save(); } catch (e) { console.error(e); }      // reported
try { return JSON.parse(s); } catch { return null; }        // reported
try { await save(); } catch (e) {                           // instead
	return fail(500, { message: m.saveFailed() });
}
```

Handle the error (`fail()`, `error()`, a state the UI shows), rethrow it with
`new Error('…', { cause: e })`, or say in a comment why it can be ignored.

## no-default-promise-catch

The same in a promise's `.catch()`: `.catch(() => null)`, `.catch(() => [])`, `.catch(() => {})`,
`.catch(console.error)`, and a callback that only logs. An empty `.catch(() => {})` on a promise
held in a variable passes: it marks the promise handled, and whoever awaits it still gets the
error.

```ts
const items = await load().catch(() => []);                 // reported
const items = await load();                                 // instead: let it reach the error page
```

## no-stringified-error

`String(e)`, `` `${e}` ``, `'…' + e` and `e.toString()` on a caught error. The string drops the
stack and the cause, and anything that is not an `Error` becomes `'[object Object]'`. Pass the
error itself (`{ cause: e }`, `logger.error(e)`), or read `e.message` once `e instanceof Error`
is checked; `e instanceof Error ? e.message : String(e)` passes.
