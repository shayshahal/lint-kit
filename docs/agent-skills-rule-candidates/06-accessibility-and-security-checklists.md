# 06 Accessibility And Security Checklists

references/accessibility-checklist and references/security-checklist.

---

# batch-E3 — accessibility and security checklists

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent.

## references/accessibility-checklist.md  (160 lines read)
verdict: 15 candidates. This is the most *directly* lintable file in the whole corpus: nearly every
line is a property of markup with a stated numeric threshold, and axe-core already implements most
of them. The catalog value is the mapping from each stated rule to the axe-core rule id, plus the
handful axe-core does not cover.

### img-has-alt-text
- source: references/accessibility-checklist.md:25 — "All images have `alt` text (or `alt=\"\"` for decorative images)" (anti-pattern table at :154 — "Missing `alt` text | Images invisible to screen readers | Add descriptive `alt`")
- classification: mechanical
- target: eslint:svelte-skills
- detection: an `<img>` (or `next/image`, a framework image component) with no `alt` attribute. axe-core rule `image-alt`; the Svelte surface already exists in `tools/eslint/svelte-skills.mjs`.
- fail: `<img src="/logo.svg">`
- pass: `<img src="/logo.svg" alt="Company logo">` or `alt=""` for a decorative image.
- false positives: an image inside a component whose `alt` is spread from props; needs to see the component's signature.
- effort: S

### form-input-has-an-associated-label
- source: references/accessibility-checklist.md:26 — "All form inputs have associated labels (`<label>` or `aria-label`)" and :41 — "Every input has a visible label" (the worked patterns are at :72-85)
- classification: mechanical
- target: eslint:svelte-skills
- detection: an `<input>`/`<select>`/`<textarea>` with no `<label for>`/wrapping `<label>`, no `aria-label`/`aria-labelledby`, and no `title`. axe-core rules `label` and `form-field-multiple-labels`.
- fail: `<input type="email" />`
- pass: `<label htmlFor="email">Email address</label><input id="email" type="email" />` as at :74-75.
- false positives: a hidden input, a search field with a placeholder-only design (which the checklist forbids at :83-84 but tolerates as `aria-label`), and a submit button (not a labelled field).
- effort: M

### icon-only-controls-have-an-accessible-name
- source: references/accessibility-checklist.md:28 — "Icon-only buttons have `aria-label`" (anti-pattern at :159 — "Empty links/buttons | \"Link\" announced with no description | Add text or `aria-label`")
- classification: mechanical
- target: eslint:svelte-skills
- detection: a `<button>`/`<a>` whose only child is an icon component or an `<svg>` and which has no `aria-label`, no visually-hidden text, and no `title`. axe-core `button-name` / `link-name`.
- fail: `<button><TrashIcon /></button>`
- pass: `<button aria-label="Delete task"><TrashIcon /></button>`
- false positives: an icon wrapped in a component that supplies the label internally; needs the component's props.
- effort: M

### one-h1-and-no-skipped-heading-levels
- source: references/accessibility-checklist.md:29 — "Page has one `<h1>` and headings don't skip levels"
- classification: mechanical
- target: eslint:svelte-skills
- detection: per rendered page, exactly one `<h1>`; and heading levels must not skip (an `<h3>` with no preceding `<h2>`). axe-core `heading-order` covers the skip; the single-`h1` half is a project convention axe-core does not enforce.
- fail: a page with two `<h1>`s, or an `<h4>` following an `<h2>`.
- pass: one `<h1>` then `<h2>` then `<h3>`.
- false positives: a component library shipping an `<h2>` used in a context whose page provides the `<h1>`; the single-`h1` rule must evaluate the composed page, which a per-file lint cannot do. Report the skip as error and the count as a warning.
- effort: L

### dynamic-content-uses-a-live-region
- source: references/accessibility-checklist.md:30 — "Dynamic content changes announced (`aria-live` regions)" (the value table at :144-147)
- classification: heuristic-only
- target: eslint:svelte-skills
- detection: a UI update that changes text visible to the user (a toast, an inline validation message, a save confirmation) with no `aria-live`, `role="status"`, or `role="alert"` on the container. The checklist supplies the exact mapping (`polite` for status, `assertive` for errors) at :144-147.
- fail: a toast rendered with no `role` attribute.
- pass: `<div role="status" aria-live="polite">Task saved</div>` as at :95.
- false positives: a change the user initiated by focusing that element; needs a heuristic.
- effort: L

### table-headers-use-th-with-scope
- source: references/accessibility-checklist.md:31 — "Tables have `<th>` headers with scope"
- classification: mechanical
- target: eslint:svelte-skills
- detection: a `<table>` whose header row uses `<td>` instead of `<th>`, or whose `<th>` has no `scope`. axe-core `th-has-data-cells` / `scope-attr-valid` cover part of it.
- fail: `<tr><td>Name</td><td>Email</td></tr>` as a header row.
- pass: `<tr><th scope="col">Name</th><th scope="col">Email</th></tr>`
- false positives: a layout table (which should not be a `<table>` at all); the rule can flag it as a separate finding.
- effort: S

### text-and-component-contrast-ratios
- source: references/accessibility-checklist.md:34-35 — "Text contrast ≥ 4.5:1 (normal text) or ≥ 3:1 (large text, 18px+)" / "UI components contrast ≥ 3:1 against background"
- classification: mechanical
- target: pre-push script
- detection: three numeric ratios. Checkable on a design-token file (a palette where each foreground/background pair can be computed) or via axe-core's `color-contrast` rule against a rendered page. The `18px+` boundary for "large text" is stated exactly.
- fail: `#999` text on `#fff` at 16px (2.85:1).
- pass: `#595959` on `#fff` (7:1).
- false positives: a token pair never used together; a token file alone cannot know the pairings, so the rendered-page check is the reliable form.
- effort: M

### color-is-not-the-only-signal
- source: references/accessibility-checklist.md:36 — "Color is not the only way to convey information" (anti-pattern at :155 — "Color-only states | Invisible to color-blind users | Add icons, text, or patterns"; form rule at :44 — "Error state visible by more than color (icon, text, border)")
- classification: heuristic-only
- target: eslint:svelte-skills
- detection: an error/invalid state expressed only as a colour class (`text-red-500`, a `border-error` token) with no icon, text, or border-style change. Partially covered by axe-core's `color-contrast` and by lint-kit's own `untranslated-text`/`tailwind-patterns` sets, which already read Tailwind classes.
- fail: `<input class="border-red-500" />` as the whole error state.
- pass: the same plus an icon and an error message element.
- false positives: a state also announced to screen readers by other means; needs to see the sibling nodes.
- effort: L

### no-content-flashes-more-than-three-times-per-second
- source: references/accessibility-checklist.md:38 — "No content that flashes more than 3 times per second"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a CSS animation or JS interval producing a flash/blink with a duration below ~333ms per cycle (an `animation-duration` under `0.333s` on a keyframe that toggles visibility or a background colour, or a `setInterval` under 334ms toggling opacity). The threshold is stated.
- fail: `animation: blink 0.2s infinite;`
- pass: no flashing animation, or one at ≥334ms.
- false positives: a subtle pulse that does not change luminance much; needs a name/pattern heuristic.
- effort: M

### form-error-messages-are-associated-with-their-field
- source: references/accessibility-checklist.md:43 — "Error messages specific and associated with the field" (form rule at :45 — "Form submission errors summarized and focusable")
- classification: mechanical
- target: eslint:svelte-skills
- detection: an error message element rendered next to an input with no `aria-describedby`/`aria-errormessage` pointing at it and no `aria-invalid` on the input.
- fail: `<input id="email" /><span class="error">Invalid email</span>`
- pass: `<input id="email" aria-invalid="true" aria-describedby="email-error" /><span id="email-error">Invalid email</span>`
- false positives: an error rendered inside a `<label>` (implicit association); needs to check ancestors.
- effort: M

### autocomplete-attributes-on-known-fields
- source: references/accessibility-checklist.md:46 — "Known fields use autocomplete (for example `type=\"email\" autocomplete=\"email\"`)"
- classification: mechanical
- target: eslint:svelte-skills
- detection: an input whose `type`/`name`/`id` matches a known autofill field (`email`, `password`, `tel`, `name`, `address`, `cc-number`) with no `autocomplete` attribute, or with `autocomplete="off"` on a login form. WCAG 1.3.5.
- fail: `<input type="email" name="email" />`
- pass: `<input type="email" name="email" autocomplete="email" />`
- false positives: a search field (correctly `autocomplete="off"`); the rule should key on the credential/identity field set only.
- effort: S

### html-lang-and-descriptive-title
- source: references/accessibility-checklist.md:49-50 — "Language declared (`<html lang=\"en\">`)" / "Page has a descriptive `<title>`"
- classification: mechanical
- target: pre-push script
- detection: the app's HTML shell must have `<html lang="...">` with a non-empty value, and a `<title>` that is not the framework default (`SvelteKit`, `Vite + Svelte`, `React App`, `Document`). axe-core `html-has-lang` / `document-title` cover the presence half; the "not the scaffold default" half is the useful delta.
- fail: `<html>` with no `lang`, or `<title>SvelteKit</title>`.
- pass: `<html lang="en">` and `<title>Tasks — Acme</title>`.
- false positives: a multi-language app whose lang is set per route at runtime; needs to accept a dynamic binding.
- effort: S

### touch-target-minimum-size
- source: references/accessibility-checklist.md:52 — "Touch targets ≥ 44x44px on mobile"
- classification: mechanical
- target: eslint:tailwind-patterns
- detection: an interactive element whose Tailwind size classes resolve below 44px (`h-8` = 32px, `size-9` = 36px) with no padding making up the difference, on a control that is icon-only. WCAG 2.5.5/2.5.8.
- fail: `<button class="h-8 w-8"><XIcon /></button>`
- pass: `<button class="size-11">` (44px) or a larger hit area via padding.
- false positives: a desktop-only control, and a control inside a larger clickable row; needs the mobile-scope heuristic.
- effort: M

### use-button-for-actions-and-a-for-navigation
- source: references/accessibility-checklist.md:66 — "<!-- NEVER use div/span as buttons -->" and :67 — "<div onClick={handleDelete}>Delete</div>  <!-- BAD -->" (anti-pattern table at :153)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a `onClick`/`on:click` handler on a `<div>`/`<span>` with no `role="button"`, no `tabIndex`, and no key handler; and separately, an `<a>` with an `onClick` that performs an action but has no `href`. Both shapes are syntactic.
- fail: `<div onClick={handleDelete}>Delete</div>`
- pass: `<button onClick={handleDelete}>Delete Task</button>` as at :61.
- false positives: a wrapper div delegating to a child button (event bubbling); the rule must require the div to be the interactive leaf.
- effort: M

### no-focus-outline-removal-and-no-positive-tabindex
- source: references/accessibility-checklist.md:158 — "Removing focus outlines | Users can't see where they are | Style outlines, don't remove them" and :160 — "`tabindex > 0` | Breaks natural tab order | Use `tabindex=\"0\"` or `-1` only"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: two exact findings — `outline: none`/`outline-none`/`outline: 0` without a compensating `:focus-visible` style, and any `tabIndex` value greater than 0.
- fail: `class="outline-none"` with no focus ring, and `tabIndex={3}`.
- pass: a `focus-visible` ring, and `tabIndex={0}`/`{-1}`.
- false positives: `outline-none` paired with a custom ring in the same rule set; the rule should look for a `focus-visible` sibling declaration.
- effort: M

### accessibility-audit-runs-in-ci
- source: references/accessibility-checklist.md:127 — "npx axe-core          # Programmatic accessibility testing" and skills/shipping-and-launch/SKILL.md:58 — "No accessibility warnings in axe-core or Lighthouse" (the testing-tools section is at :123-138)
- classification: mechanical
- target: pre-push script
- detection: a UI project with no axe-core, pa11y, or Lighthouse accessibility step in CI. The checklist names both tools and the launch skill makes a clean audit a gate, so the absence is the finding.
- fail: a SvelteKit app with tests and no a11y step.
- pass: an `axe` assertion in the Playwright/Vitest suite or a `pa11y` CI step.
- false positives: a backend-only repo; conditional on a UI existing.
- effort: M

## references/security-checklist.md  (248 lines read)
verdict: 18 candidates. Most of this file restates `skills/security-and-hardening/SKILL.md`, so only
the rules it states more precisely are listed here; the duplicates are noted. Its unique value is
the **exact per-manager command table** (:149-154) and the **per-manager install-script policy
table** (:169-180), both of which are verbatim lookup tables a rule can be built from.

### frozen-install-command-per-manager
- source: references/security-checklist.md:151 — "| npm (`package-lock.json` or `npm-shrinkwrap.json`) | `npm ci` | `npm audit` |" and :152 — "| pnpm | `pnpm install --frozen-lockfile` | `pnpm audit` |" (the Yarn rows are :153-154)
- classification: mechanical
- target: pre-push script
- detection: a four-row lookup table mapping lockfile → the frozen install command → the audit command. For each lockfile present, CI must invoke the matching frozen command (not `npm install`, not `pnpm install` without `--frozen-lockfile`) and the matching audit command. Exact string comparison against the table.
- fail: `pnpm-lock.yaml` present and CI runs `pnpm install`.
- pass: `pnpm install --frozen-lockfile` then `pnpm audit`.
- false positives: a repo whose CI installs with a different manager deliberately for a sub-project; scope to the installation boundary (:147).
- effort: S

### lockfile-is-never-rewritten-by-ci
- source: references/security-checklist.md:185 — "Exactly one authoritative lockfile per project/workspace root is committed and CI never rewrites it"
- classification: mechanical
- target: pre-push script
- detection: a CI step that runs an install without the frozen/immutable flag (which rewrites the lockfile), or a workflow that commits a modified lockfile; plus the "exactly one lockfile" half, which duplicates `no-competing-lockfiles` in batch D.
- fail: `- run: npm install` in a workflow on a repo with a committed lockfile.
- pass: `npm ci`.
- false positives: a workflow step that deliberately updates the lockfile (a Renovate/Dependabot job) and commits it; needs a path/actor exemption.
- effort: S

### registry-signatures-verified
- source: references/security-checklist.md:188 — "Registry signatures/provenance are verified where the manager supports it"
- classification: mechanical
- target: pre-push script
- detection: the presence of a signature-verification step in CI (`npm audit signatures`, `pnpm audit signatures`) in a repo whose manager supports it (the security skill names both at its :138).
- fail: a pnpm repo with an audit step and no signatures step.
- pass: `pnpm audit signatures` in CI.
- false positives: an older manager without signature support; the source says "where the manager supports it".
- effort: S

### password-reset-token-ttl-and-single-use
- source: references/security-checklist.md:42 — "Password reset tokens: time-limited (≤1 hour), single-use"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a reset-token generation/verification call whose expiry exceeds 3600s (a `maxAge`/`expiresIn`/`ttl` literal above 1 hour), or a reset flow with no invalidation after a successful use (no delete/`usedAt` write on the same record).
- fail: `jwt.sign({ sub: id }, secret, { expiresIn: '24h' })` for a reset token.
- pass: `{ expiresIn: '1h' }` plus a delete on use.
- false positives: a session token rather than a reset token; the rule must key on the token's purpose (a route matching `/reset|forgot|recover/`).
- effort: M

### jwt-validation-checks-signature-expiry-and-issuer
- source: references/security-checklist.md:52 — "JWT tokens validated (signature, expiration, issuer)"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: `jwt.verify(...)` / `jwt.decode(...)` — `decode` skips verification entirely and is the finding — and a `verify` call with no `issuer`/`audience` option, or with `{ ignoreExpiration: true }`.
- fail: `const payload = jwt.decode(token);`
- pass: `jwt.verify(token, key, { issuer: ISSUER, audience: AUD })`
- false positives: `decode` used to read a non-security claim for display (a token's expiry in the UI); needs a `// display-only` marker.
- effort: S

### urls-validated-before-redirect
- source: references/security-checklist.md:64 — "URLs validated before redirect (prevent open redirect)"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: `res.redirect(req.query.next)`, `window.location = params.get('returnTo')`, or a framework redirect whose argument derives from request input with no allowlist check or relative-path check.
- fail: `res.redirect(req.query.returnTo)`
- pass: a check that the value starts with `/` and is not `//`, or an allowlist membership test.
- false positives: a redirect to a value the server itself generated; needs the taint to be traced to request input.
- effort: M

### security-headers-are-the-stated-set
- source: references/security-checklist.md:110 — "Content-Security-Policy: default-src 'self'; script-src 'self'" and :114 — "X-XSS-Protection: 0  (disabled, rely on CSP)" (the seven headers are :110-116)
- classification: mechanical
- target: pre-push script
- detection: seven headers with exact values. The checkable form is a config or middleware assertion: each header present, and where a value is security-critical, matching — HSTS `max-age` ≥ 31536000 with `includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0` (not `1`), a CSP that does not contain `unsafe-eval` or a bare `*`, and a non-empty `Permissions-Policy`. The `X-XSS-Protection: 0` value is counter-intuitive and worth pinning exactly.
- fail: a middleware setting `X-XSS-Protection: 1; mode=block` and `X-Frame-Options: SAMEORIGIN`.
- pass: the seven values at :110-116.
- false positives: a CDN or platform (Vercel, Cloudflare) that injects the headers outside the repo; the rule needs an explicit "headers set at the edge" marker.
- effort: M

### cors-declares-methods-and-headers
- source: references/security-checklist.md:124 — "origin: ['https://yourdomain.com', 'https://app.yourdomain.com']," and :131 — "cors({ origin: '*' })  // Allows any origin" (the full restrictive form is :123-128)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: three sub-findings — `origin: '*'` in production code, a CORS config with no explicit `methods` list, and one with no explicit `allowedHeaders` list (both widen the surface by default). Extends `cors-no-wildcard-with-credentials` in batch D.
- fail: `cors({ origin: '*' })` as at :131.
- pass: the restrictive form at :123-128.
- false positives: a genuinely public, credential-free API; keep `origin: '*'` at warn and the missing lists at warn.
- effort: S

### error-response-exposes-no-internals
- source: references/security-checklist.md:206-215 — "res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }); … // NEVER in production: res.status(500).json({ error: err.message, stack: err.stack,         // Exposes internals query: err.sql,           // Exposes database details })"
- classification: mechanical
- target: eslint:error-handling
- detection: a response body containing `err.message`, `err.stack`, `err.sql`, or the error object itself. The checklist gives the BAD and GOOD forms verbatim, so the fixture is already written. Same rule as `generic-error-bodies` in batch D, cited here from the checklist.
- fail: `res.status(500).json({ error: err.message, stack: err.stack })`
- pass: `res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })`
- false positives: a development-only branch guarded by `NODE_ENV !== 'production'`.
- effort: M

### security-events-are-logged-without-secrets
- source: references/security-checklist.md:230 — "| 9 | Logging Failures | Log security events, don't log secrets |"
- classification: heuristic-only
- target: eslint:error-handling
- detection: a login/logout/permission-change/reset handler with no log call (a missing security audit trail), combined with the existing `no-secrets-or-pii-in-logs` rule for the second half. The "log security events" half is a presence check on a known set of sensitive handlers.
- fail: a `POST /login` handler that logs nothing.
- pass: `logger.info({ event: 'login_failed', userId }, …)`.
- false positives: a handler that delegates logging to middleware; needs to see the middleware.
- effort: L

### install-script-policy-matches-the-pinned-manager-version
- source: references/security-checklist.md:169-180 — "| Manager version | Native policy |" with rows such as "| npm 12.x (verified on 12.0.1) | Unreviewed dependency scripts are skipped by default; `strict-allow-scripts=true` makes their presence fail the install before execution. |" and "| pnpm 11+ | Use `pnpm approve-builds` and commit `allowBuilds` decisions; `strictDepBuilds` defaults to `true`, so unreviewed builds fail. |"
- classification: mechanical
- target: pre-push script
- detection: an eleven-row lookup table from manager version to the native script-blocking policy. The rule: detect the pinned manager version (from `packageManager`, the lockfile, or `node_modules/.package-lock.json`) and assert the matching policy is configured — `.npmrc` `ignore-scripts`/`strict-allow-scripts`, or `pnpm.allowBuilds`/`strictDepBuilds`, or `.yarnrc.yml` `enableScripts: false` / `dependenciesMeta.<pkg>.built`. Extends `dependency-scripts-blocked-by-default` in batch D with the exact per-version mechanism, which is what makes it implementable.
- fail: `"packageManager": "pnpm@11.3.0"` with no `allowBuilds` and no `strictDepBuilds`.
- pass: the pnpm 11+ row's configuration.
- false positives: a version not in the table, for which the checklist itself says to consult the manager's docs (:156) — the rule must report "unverified manager version" rather than pass silently.
- effort: L

### api-keys-and-tool-permissions-are-scoped
- source: references/security-checklist.md:51 — "API keys scoped to minimum necessary permissions" and :199 — "Tool/agent permissions scoped; destructive or irreversible actions require confirmation"
- classification: heuristic-only
- target: pre-push script
- detection: an API key or token minted with a wildcard scope (`scopes: ['*']`, `permissions: ['admin']` for a read-only integration), and an LLM tool definition that grants a destructive capability (`delete`, `write`, `exec`) without a confirmation gate. Both are config-level.
- fail: `new Stripe(key, { scopes: ['*'] })` for a read-only dashboard.
- pass: the narrowest scope the integration needs.
- false positives: an admin-only service account; needs the caller's role.
- effort: L

### validation-uses-allowlists-and-constrains-length-and-range
- source: references/security-checklist.md:57 — "Validation uses allowlists (not denylists)" and :58 — "String lengths constrained (min/max)" (numeric ranges at :59)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a schema field declared without a length/range bound (`z.string()` with no `.max()`, `pydantic` `str` with no `max_length`, `z.number()` with no `.min()/.max()`), and a validation written as a denylist (`!includes('<script>')`, a regex of forbidden characters). Three sub-findings; the first two are exact.
- fail: `z.object({ title: z.string() })` for a field that lands in the database.
- pass: `z.object({ title: z.string().min(1).max(256) })`
- false positives: an intentionally unbounded free-text field (a comment body) where a large cap still applies; the rule should require *some* cap rather than a specific one.
- effort: M

### pii-encrypted-at-rest-and-backups-encrypted
- source: references/security-checklist.md:138 — "PII encrypted at rest (if required by regulation)" and :140 — "Database backups encrypted"
- classification: mechanical
- target: pre-push script
- detection: infra-as-code (Terraform, a database resource definition, a backup job) where an encrypted-storage flag is absent or false for a database that holds personal data. `encrypted: false`, a missing `storage_encrypted`, or a backup job writing to an unencrypted bucket.
- fail: `aws_db_instance` with no `storage_encrypted = true`.
- pass: the flag set.
- false positives: a managed service that encrypts by default; needs a per-provider allowlist.
- effort: M
