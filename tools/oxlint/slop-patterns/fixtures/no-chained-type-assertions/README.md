# no-chained-type-assertions fixtures

4 invalid + 1 file of valid cases for the `slop-patterns/no-chained-type-assertions` rule.

Run them from a repository that has `oxlint` and `@oxlint/plugins` (the plugin is
TypeScript, so the specifier has to resolve `@oxlint/plugins` from that repository):

```bash
rm -rf wf-slop-fixtures && mkdir -p wf-slop-fixtures/cases wf-slop-fixtures/plugin \
  && cp -r tools/oxlint/slop-patterns/* wf-slop-fixtures/plugin/ \
  && cp tools/oxlint/slop-patterns/fixtures/no-chained-type-assertions/*.ts wf-slop-fixtures/cases/ \
  && printf '{"type":"module"}' > wf-slop-fixtures/plugin/package.json \
  && cat > wf-slop-fixtures/oxlintrc.json <<'JSON'
{
  "ignorePatterns": ["plugin/**", "**/node_modules/**"],
  "jsPlugins": [{ "name": "slop-patterns", "specifier": "./plugin/index.ts" }],
  "rules": { "slop-patterns/no-chained-type-assertions": "error" }
}
JSON
  pnpm exec oxlint --config wf-slop-fixtures/oxlintrc.json wf-slop-fixtures/cases/ \
  ; rm -rf wf-slop-fixtures
```

Expected: exactly 4 `slop-patterns(no-chained-type-assertions)` errors, all in
`invalid-chained-assertions.ts`, and none in `valid-not-chained.ts`.

`valid-not-chained.ts` holds the cases that must stay quiet: a single assertion, a chain of
nothing but `as const`, a narrowed value with one assertion after the check, and the
non-assertions that look similar (`satisfies`, `!`).
