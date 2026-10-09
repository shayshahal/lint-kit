# tailwind-patterns

Tailwind / shadcn conventions. Most are `no-restricted-syntax` / `no-restricted-imports` entries,
which ESLint cannot link here; this page explains each one. Class patterns match markup
(`class="…"`), script strings (`cn()`, `tv()`, arrays) and template literals.

`tailwindPatterns.config()` takes `inspection`, which narrows `viewport-vh` to the lines the
branch added since the merge-base with its base (`init` writes it); `inspection.mjs` beside this
file has the detail. The `no-restricted-syntax` and `no-restricted-imports` entries above are
ESLint's own rules and always see the whole file.

## viewport-vh

**fix.** `h-screen` / `min-h-screen` / `max-h-screen` and arbitrary values in `vh` (`[90vh]`,
`[calc(100vh-2rem)]`). `vh` is the viewport with the mobile browser bar hidden, so content runs
under the bar; `dvh` follows it. `eslint --fix` writes `h-dvh` / `[90dvh]`. `svh` / `lvh` pass.

This one is a rule of its own, `tailwind-patterns/viewport-vh`.

## transition-all

`transition-all` animates every property that changes, layout included, which is what janks. List
what changes: `transition` (colour, opacity, shadow, transform), `transition-colors`,
`transition-opacity`, or a named utility for size.

## dark-override

A `dark:` colour override (`dark:bg-zinc-900`) outside the `ui/` folder. The token under it
should carry dark mode: use one that does, or fix its `.dark` value. Sizes and styles after
`dark:` (`dark:text-sm`, `dark:border-2`) are not colours and pass.

## light-only

With `darkMode: true`: `bg-white` / `text-black`, which stay light in dark mode. Use a token:
`bg-card`, `bg-popover`, `bg-background`, `text-foreground`.

## untitled-overlay

A `Dialog` / `AlertDialog` / `Modal` / `Sheet` / `Drawer` `.Content` without a `.Title` inside it.
The title is the dialog's accessible name; give it `class="sr-only"` if it should not show. The
wrappers in `ui/` are exempt.

## lucide-barrel

Icons imported from the `@lucide/svelte` root, which loads every icon in dev. Import each from its
own path: `import XIcon from '@lucide/svelte/icons/x'`.
