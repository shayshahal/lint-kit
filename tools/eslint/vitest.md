# vitest

Focused tests and asynchronous assertions. Vitest runs only the tests a branch left marked with
`.only`, and every other test in the file is skipped silently: the suite still passes, so nothing
reports the coverage that went missing. A promise chain that is never returned or awaited runs its
callback after the test has finished, so an expectation inside it can go unreported. The checks
are `vitest/no-focused-tests`, `vitest/valid-expect` and `vitest/valid-expect-in-promise` from
[`@vitest/eslint-plugin`](https://www.npmjs.com/package/@vitest/eslint-plugin), the maintained
plugin, wrapped so the set narrows them to the lines the branch added like the other sets.

The rules apply to `*.test.*` and `*.spec.*` files anywhere in the project, inside or outside
`src/`. They are the only rules this set turns on: the plugin's recommended config would also
enable skip checks, which are their own slice, and no other engine diagnoses these shapes.

`vitest.config()` takes `inspection`, which narrows the rules to the lines the branch added since
the merge-base with its base (`init` writes it); `inspection.mjs` beside this file has the detail.
It also takes `files` and `ignores` for a project that keeps its tests elsewhere, and `rules` to
change a rule's entry.

The generated `eslint.rules.js` calls `vitest.config({ from: import.meta.url })`. `from` is where
the maintained plugin is resolved from, so a pnpm workspace member finds the plugin in its own
`node_modules` even though `tools/eslint/` is copied once at the repository root. It defaults to
this module's own location, which is what a config that spreads `vitest.plugin` directly uses.

## no-focused-tests

`test.only()`, `it.only()` and `describe.only()`, including the imported-alias forms
(`import { test as t } from 'vitest'`), `test.concurrent.only()` and `test.only.each(…)`. ESLint's
`--fix` drops the `.only` and runs the whole file again.

```ts
test.only('saves the draft', () => {});      // reported
test('saves the draft', () => {});           // instead
```

Names that only look like Vitest's are left alone: a locally bound `const test = { only() {} }`,
a `function it(…) {}` of the project's own, or a `test.only` imported from a library other than
`vitest`. Vitest has no prefix focus API — `fit` and `fdescribe` are Jest names it does not
export — and `.only` after `.each(…)` is a collection failure, not a focused test, so neither is
reported or offered as a fix.

## valid-expect

An assertion on a promise — `.resolves` or `.rejects` — is awaited or returned, so the runner does
not finish the test before it runs.

```ts
test('saves', () => { expect(save()).resolves.toBe(id); });            // reported
test('saves', async () => { await expect(save()).resolves.toBe(id); }); // instead
test('saves', () => { return expect(save()).resolves.toBe(id); });     // or return it
```

`--fix` makes the callback `async` and adds `await`. The check resolves the `expect` binding
through scope: `import { expect as e } from 'vitest'` is still the assertion, while a locally
bound `expect`, or one from another library, is not. Vitest 4 attributes a dangling `.resolves`
assertion to the running test, so this rule is a stricter deterministic gate than the runner's own
detection; the awaited/returned form it writes is the one the frozen support decision names.

There is no rule that every `async` test must contain `await`. A test with nothing to await is not
a finding either way:

```ts
test('runs', async () => { start(); });       // not reported: no async assertion
test('runs', async () => { await start(); }); // not reported either
```

The plugin's default `asyncMatchers` also contains `toResolve` and `toReject`. Those are not
built-in Vitest 4 matchers — the frozen runner raises `Invalid Chai property: toResolve` — they are
extended matchers a project may install. The check reports `expect(…).toResolve()` /
`.toReject()` statically as if they were async assertions; this set does not present them as an
assertion API to use, and they are not exercised as a runtime shape.

## valid-expect-in-promise

A promise chain that has an expectation in it is returned or awaited. A floating
`.then`/`.catch`/`.finally` runs its callback after the test has already finished, so the assertion
inside it is outside the test's tracking: a chain that rejects, or one that never settles, is a
pass at the individual-test level, and the missing assertion is reported nowhere. That is the false
pass this rule closes.

```ts
test('loads', () => { fetch(url).then((r) => { expect(r.status).toBe(200); }); });        // reported
test('loads', () => { return fetch(url).then((r) => { expect(r.status).toBe(200); }); }); // instead
```

The runner does not always agree with its own report. A floating chain that rejects immediately
still makes the process exit 1 from the late rejection, while the JSON report records the test as
passed. So a floating assertion can escape the individual result, and an immediate rejection can
still fail the overall runner — `test/agent-skills-vitest-runner.test.js` measures both isolated.
Only a chain the test never waits for is the false pass; the returned chain is the shape to write.

## Overlap and ownership

The two async rules overlap on one shape: a floating chain whose callback body is a single async
assertion, `fetch(u).then((r) => expect(r).resolves.toBe(y))`, concise or block-bodied.
`valid-expect` owns the assertion and `valid-expect-in-promise` holds its report, dropping it when
the owner reported the same promise expression. The concise-arrow form is therefore one finding and
one fix (`--fix` awaits the chain); an assignment (`const p = fetch(u).then(…)`) is also one finding,
because the two rules' report nodes — the declarator and the promise expression inside it — reduce
to the same promise. The block form reports the chain and the inner assertion, two different promise
expressions each with its own fix, and keeps both.

Ownership does not depend on the order the two rules are registered, and it does not outlive the
run: the held report is released once every enabled rule has finished, and a reused `SourceCode`
starts clean, so a later run with the owner disabled still reports.

Severity follows the owning rule's entry: `'vitest/valid-expect': 'warn'` leaves one warn finding,
not an error reintroduced by the held rule. With the owner disabled
(`'vitest/valid-expect': 'off'`) nothing is owned, so the promise rule reports the shape at its own
entry instead.

## What the async check cannot see

Both async rules are syntactic and use no type information, so they see only what scope analysis
and the chain show:

- An assertion behind a project helper (`assertOk(fetch(url))`) or a reassigned alias
  (`const e = expect; e(...)`) is not resolved, and neither is `globalThis.expect`.
- `expect.poll(...)` is a separate plugin rule (`require-awaited-expect-poll`) that this set does
  not turn on.
- `toResolve` and `toReject` are not built-in Vitest 4 matchers, only an upstream extended-matcher
  convention the plugin's default `asyncMatchers` names; the rule reports them statically, the
  frozen runner does not provide them.
- A floating outer chain whose callback returns a nested chain is not reported (upstream limit).
- The callback `done` form is accepted by `valid-expect`, but Vitest 4 deprecates it — calling
  `done()` fails — so it is not a passing shape for this runner.

Test helpers in a `__tests__` folder that are not named `*.test.*` or `*.spec.*` are not checked.
Name them that way, or pass `files` to `vitest.config()`, to include them.
