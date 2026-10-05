# untranslated-text

## no-untranslated-text

Every word a user reads comes from the app's message catalogue (Paraglide's `m.key()`, or any
i18n call), so each language's UI is in that language. It reports:

- text in Svelte markup (two letters in a row, any script),
- `aria-label` / `placeholder` / `title` / `alt` / `label` written as a literal,
- with `bannedInCode`, a string in script code containing that script (a label built in code shows
  in the source language in every UI).

```svelte
<p>Hello</p>                          <!-- reported -->
<p>{m.greeting()}</p>                 <!-- instead -->
<input placeholder="Search" />        <!-- reported -->
<input placeholder={m.search()} />    <!-- instead -->
```

Not text, so allowed: emails, URLs, paths, social network names, format hints (`03-XXXXXXX`,
`SAVE20`, a file-type list like `JPG, PNG`), AM / PM, and whatever `allow` adds.

Options:

| Option | Effect |
| --- | --- |
| `allow` | regex sources of whole strings that are not text (brand names) |
| `bannedInCode` | regex source of a script no string in code may contain, e.g. `[֐-׿]` |
| `locales` | keys of an inline pair, e.g. `['he', 'en']`: `{ he: '…', en: '…' }` counts as translated |
| `inlineLocales` | `lang === 'en' ? 'X' : 'Y'` passes, for components without a catalogue |
| `messages` | `{ text, code }` replace the report messages (say where the catalogue lives) |
