# no-trivial-wrapper fixtures

6 invalid + 1 file of valid cases for the `slop-patterns/no-trivial-wrapper` rule.

Run them from a repository that has `oxlint` and `@oxlint/plugins` (the plugin is
TypeScript, so the specifier has to resolve `@oxlint/plugins` from that repository):

```bash
rm -rf wf-slop-fixtures && mkdir -p wf-slop-fixtures/cases wf-slop-fixtures/plugin \
  && cp -r tools/oxlint/slop-patterns/* wf-slop-fixtures/plugin/ \
  && cp tools/oxlint/slop-patterns/fixtures/no-trivial-wrapper/*.ts wf-slop-fixtures/cases/ \
  && printf '{"type":"module"}' > wf-slop-fixtures/plugin/package.json \
  && cat > wf-slop-fixtures/oxlintrc.json <<'JSON'
{
  "ignorePatterns": ["plugin/**", "**/node_modules/**"],
  "jsPlugins": [{ "name": "slop-patterns", "specifier": "./plugin/index.ts" }],
  "rules": { "slop-patterns/no-trivial-wrapper": "error" }
}
JSON
  pnpm exec oxlint --config wf-slop-fixtures/oxlintrc.json wf-slop-fixtures/cases/ \
  ; rm -rf wf-slop-fixtures
```

Expected: exactly 6 `slop-patterns(no-trivial-wrapper)` errors, all in
`invalid-forwards-arguments.ts`, and none in `valid-not-a-wrapper.ts`
(`formatCurrency`, `matchCategory`, `setValue`, `loadUser`, `createAuctionWS`, `logIt`).

`valid-not-a-wrapper.ts` holds the cases that must stay quiet: a callee that computes its
own receiver (`new Intl.NumberFormat(...).format`, the shape `Header.svelte` had), a
transformed or reordered argument, an extra argument, a default value, an anonymous
callback, a body with more than one statement, and reading state the function was not
handed.

`src/params/<name>.ts` is not covered here because the exclusion is by path: SvelteKit names the
matchers there and calls them from the router. To check it, put a
`export const match = (param) => SET.has(param)` in `src/params/category.ts` of the scratch
repository and confirm no finding. A file beside the folder (`src/params.ts`) is not a matcher
and is still reported.

The same goes for test files (`*.test.ts`, `*.spec.ts`, `src/tests/**`), where a test double's
`get`, `set` and `delete` must forward to mirror the real signature. `test/slop-patterns.test.js`
covers both exclusions.
