# vitest

Focused tests. Vitest runs only the tests a branch left marked with `.only`, and every other test
in the file is skipped silently: the suite still passes, so nothing reports the coverage that went
missing. The check is `vitest/no-focused-tests` from
[`@vitest/eslint-plugin`](https://www.npmjs.com/package/@vitest/eslint-plugin), the maintained
plugin, wrapped so the set narrows it to the lines the branch added like the other sets.

The rule applies to `*.test.*` and `*.spec.*` files anywhere in the project, inside or outside
`src/`. It is the only rule this set turns on: the plugin's recommended config would also enable
async and skip checks, which are their own slices, and no other engine diagnoses focus.

`vitest.config()` takes `inspection`, which narrows the rule to the lines the branch added since
the merge-base with its base (`init` writes it); `inspection.mjs` beside this file has the detail.
It also takes `files` and `ignores` for a project that keeps its tests elsewhere, and `rules` to
change the rule's entry.

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

Test helpers in a `__tests__` folder that are not named `*.test.*` or `*.spec.*` are not checked.
Name them that way, or pass `files` to `vitest.config()`, to include them.
