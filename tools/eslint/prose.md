# prose

Two things a comment can be wrong about, without an opinion about the code. Both are
opinionated, so `init` never picks this set from a project's dependencies: ask for it by name
(`--sets prose`), and it stays installed on a re-run.

Every message says what to write instead, and `no-jargon` carries the plain word as an editor
suggestion. `prose.config()` also takes `inspection`, which narrows both rules to the lines the
branch added since the merge-base with its base (`init` writes it); `inspection.mjs` beside this
file has the detail.

## no-jargon

Inflated vocabulary in a comment: `utilize`, `leverage`, `facilitate`, `prior to`, `in order to`.
Each entry is one word with the plain one that says the same thing, and every form worth catching
is its own entry, so the suggestion belongs in that sentence (`utilizes` → `uses`, not `use`).

```ts
// We utilize the cache here.        reported: write `use`
// It utilizes the cache.            reported: write `uses`
// Prior to the request, warm it.    reported: write `before`
// Use the cache.                    passes
// Call `utilize` once it is here.   passes: a word in backticks is being named, not used
```

A word inside backticks or double quotes passes. So does a directive comment
(`eslint-disable-next-line`, `@ts-expect-error`): an instruction to a tool is not prose.

Measured on the same monorepo as the other sets (791 `.ts` files under `packages/**/src`): 7
findings, 6 of them in generated SDK files. Two words were taken out of the list because the
measurement said so — `therefore` and `attempt` were 10 findings each, and every one was the right
word for its sentence (`the base is therefore applied at most once`, `attempt token refresh and
retry once`). Formal is not inflated, and a retry has attempts.

Options:

```js
...prose.config({ inspection: 'branch' }),
// and in a rule entry, when the project's own vocabulary is not the default one
'prose/no-jargon': ['error', {
	extra: { idempotent: 'safe to repeat' },  // add a word, with what to write instead
	allow: ['leverage'],                      // or drop one the project uses in its own sense
}],
```

## prefer-jsdoc

A `//` comment directly above an export or a member is documentation an editor cannot show;
`/** */` is the same comment in the form that hover, signature help and documentation tools read.
It is autofixed.

```ts
// The user id.            →  /** The user id. */
export const id = 1;          export const id = 1;

// The user id.            →  /**
// Set once at sign-up.       * The user id.
                              * Set once at sign-up.
                              */
```

It fires on an export (named or default), a class member, an interface or type member, and an
enum member — the surface someone reads from elsewhere. A comment above anything else is left
alone, because it is a note to the next reader of this file and not documentation. A blank line
breaks the association, so a `//` paragraph followed by a gap is not converted. A run of `//`
lines becomes one block, and the declaration's indentation is kept.

Left alone on purpose: a directive (`// eslint-disable-next-line`, `// @ts-expect-error`) and a
marker for work left to do (`TODO`, `FIXME`, `HACK`, `XXX`), neither of which is documentation.

Over the same 791 files it reports 203, and every one is autofixed — a repository that already
writes JSDoc (that one has 1,275 blocks) has stragglers, not a habit to change.
