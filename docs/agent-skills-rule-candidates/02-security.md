# 02 Security

skills/security-and-hardening and its hardening-patterns reference. The densest lint source in the corpus.

---

# batch-D — security, performance, observability, planning, shipping

Extracted by the lead agent (the five parallel extractors produced no output; this batch was done
directly). Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`.

## skills/security-and-hardening/SKILL.md  (216 lines read)
verdict: 22 candidates. The densest lint source in the corpus: nearly every line is an
"Always/Never" rule stated as a code property.

### no-sql-string-concatenation
- source: skills/security-and-hardening/SKILL.md:47 — "**Parameterize all database queries** — never concatenate user input into SQL"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a template literal, `+`, or `.concat`/`.join` used as the argument to a query call whose text contains SQL keywords (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `WHERE`). Also `cursor.execute(f"…{x}…")` / `%`-formatting in Python (flake8 side). The rule keys on "the query string is built by concatenation", not on the driver.
- fail: `db.query(\`SELECT * FROM users WHERE id = ${req.params.id}\`)`
- pass: `db.query('SELECT * FROM users WHERE id = $1', [req.params.id])`
- false positives: building a query from a fixed, code-owned allowlist of column names; a test asserting the SQL text itself. Exempt `**/*.test.*` and require the interpolated expression to be non-literal.
- effort: M

### no-raw-html-with-untrusted-data
- source: skills/security-and-hardening/SKILL.md:71 — "**Never use `eval()` or `innerHTML`** with user-provided data"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: assignment to `.innerHTML` / `.outerHTML`, `dangerouslySetInnerHTML`, `document.write`, or `insertAdjacentHTML` where the value is not a literal and is not wrapped in a recognised sanitizer call (`DOMPurify.sanitize`, `sanitizeHtml`, `xss`). Pairs with `eslint:tailwind-patterns`' existing Svelte surface.
- fail: `el.innerHTML = comment.body;`
- pass: `el.innerHTML = DOMPurify.sanitize(comment.body);`
- false positives: a literal template with no interpolation; a value already sanitized two lines earlier. Exempt a `// sanitized-at: <fn>` marker.
- effort: M

### no-eval-on-untrusted-input
- source: skills/security-and-hardening/SKILL.md:195 — "LLM/model output passed into a query, the DOM, a shell, or `eval`"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: `eval(`, `new Function(`, `setTimeout(<string>, …)`, or `child_process.exec(` whose argument is not a literal. `eval` with a literal is dead but harmless; the rule's value is on the non-literal form.
- fail: `eval(modelOutput)`
- pass: `JSON.parse(modelOutput)`
- false positives: a dynamic-import shim or a bundler-injected `new Function`; exempt `**/vendor/**` and `**/dist/**`.
- effort: S

### https-for-external-communication
- source: skills/security-and-hardening/SKILL.md:49 — "**Use HTTPS** for all external communication"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an `http://` literal in a fetch/axios/request call or in a URL constant outside of localhost and a test file.
- fail: `fetch('http://api.example.com/users')`
- pass: `fetch('https://api.example.com/users')`
- false positives: `http://localhost`, `http://127.0.0.1`, `http://[::1]`, and XML namespace URLs (`http://www.w3.org/…`). All four must be exempted or the rule is unusable.
- effort: S

### password-hashing-cost-floor
- source: skills/security-and-hardening/SKILL.md:89 — "Hash passwords with bcrypt (≥12 rounds), scrypt, or argon2."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a `bcrypt.hash`/`genSalt`/`hashSync` call whose cost argument is a literal below 12, or any password stored through `md5`/`sha1`/`sha256`/`crypto.createHash`. The floor is stated numerically, so the rule is exact.
- fail: `bcrypt.hash(password, 8)`
- pass: `bcrypt.hash(password, 12)`
- false positives: a `sha256` used for a non-password digest (etag, cache key) — the rule needs to fire only when the argument name or the variable being assigned matches `/pass(word)?|secret|credential/i`.
- effort: S

### session-cookie-flags
- source: skills/security-and-hardening/SKILL.md:90 — "Session cookies are `httpOnly`, `secure`, and `sameSite: 'lax'` or `'strict'` (the CSRF defense; `'none'` sends the cookie on cross-site requests), with a bounded `maxAge`."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an options object passed to `cookie`/`setCookie`/`session({...})`/`res.cookie(...)` that omits `httpOnly: true`, omits `secure: true`, sets `sameSite: 'none'`, or omits `maxAge`/`expires`. Four sub-checks, each reportable separately.
- fail: `res.cookie('sid', token, { sameSite: 'none' })`
- pass: `res.cookie('sid', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 3600_000 })`
- false positives: a non-session cookie (theme preference) legitimately readable by JS; the rule must key on the cookie name matching `/session|sid|auth|token|jwt/i` or the call site being a session middleware.
- effort: M

### security-headers-on-every-response
- source: skills/security-and-hardening/SKILL.md:51 — "**Set security headers** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)"
- classification: mechanical
- target: pre-push script
- detection: the app entry point must register a header middleware (`helmet`, `fastify-helmet`, a framework equivalent, or a hand-written `setHeader` for all four). Report which of the four is absent from the source. Verified today by hand (`[ ] Security headers present in response` at line 210), which is exactly what a static check can do.
- fail: an Express app with `cors()` and no `helmet()` or `setHeader`.
- pass: `app.use(helmet())`.
- false positives: a static site with no server; a framework that sets them by default (`svelte-kit`'s adapter). Needs a per-framework allowlist.
- effort: M

### no-secrets-in-source-or-history
- source: skills/security-and-hardening/SKILL.md:67 — "**Never commit secrets** to version control (API keys, passwords, tokens)"
- classification: mechanical
- target: pre-commit hook
- detection: gitleaks/trufflehog rule set over the staged diff, plus key-prefix denylist (`AKIA`, `sk-`, `ghp_`, `xox[baprs]-`, `-----BEGIN … PRIVATE KEY-----`) and a high-entropy assignment (`(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9/+_-]{20,}['"]`). The history half is `gitleaks detect` on the branch's new commits.
- fail: `const STRIPE_KEY = 'sk_live_51H8…';`
- pass: `const STRIPE_KEY = process.env.STRIPE_KEY;`
- false positives: fixtures and test constants — lint-kit's existing sets already carry valid-fixture conventions for this; exempt `**/fixtures/**`, `**/*.test.*`, `**/*.example.*`.
- effort: M

### no-sensitive-data-in-logs
- source: skills/security-and-hardening/SKILL.md:68 — "**Never log sensitive data** (passwords, tokens, full credit card numbers)"
- classification: heuristic-only
- target: eslint:error-handling
- detection: a log call (`console.*`, `logger.*`, `print`, `logging.*`) whose argument references an identifier matching `/pass(word)?|secret|token|apiKey|authorization|cvv|card(number)?|ssn/i`. Shares the logger-detection helper already in `tools/eslint/error-handling.mjs` (`isLogger`, lines 46-55).
- fail: `logger.info('login', { password: req.body.password })`
- pass: `logger.info('login', { userId: user.id })`
- false positives: logging `tokenCount`, `hasPassword: true`, or a redacted value; require the identifier to be a whole word and not already wrapped in a redactor.
- effort: M

### no-auth-tokens-in-client-storage
- source: skills/security-and-hardening/SKILL.md:72 — "**Never store sessions in client-accessible storage** (localStorage for auth tokens)"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: `localStorage.setItem` / `sessionStorage.setItem` / `document.cookie =` whose key or value identifier matches `/token|jwt|session|auth|bearer|refresh/i`.
- fail: `localStorage.setItem('access_token', res.token)`
- pass: `localStorage.setItem('theme', 'dark')`
- false positives: a non-auth "session" id used for analytics correlation; the regex must require one of the auth-specific words, and `session` alone should warn rather than error.
- effort: S

### generic-error-bodies
- source: skills/security-and-hardening/SKILL.md:73 — "**Never expose stack traces** or internal error details to users"
- classification: mechanical
- target: eslint:error-handling
- detection: a response body that includes `err.stack`, `err.message`, `error.toString()`, or the error object itself; or an error handler that sends `{ error: err }`/`{ message: e.message }` without a status-code mapping. Also `app.use((err, req, res, next) => res.json(err))`.
- fail: `res.status(500).json({ error: err.stack })`
- pass: `res.status(500).json({ error: 'internal_error', requestId })`
- false positives: a development-only branch guarded by `process.env.NODE_ENV !== 'production'`, which must be exempt; a CLI that legitimately prints the message to stderr.
- effort: M

### authorization-checked-per-request
- source: skills/security-and-hardening/SKILL.md:83 — "Check **authorization** on every request, not just authentication: the authenticated user must own, or be permitted on, the specific resource (A01, IDOR)."
- classification: heuristic-only
- target: eslint:error-handling
- detection: a route handler that reads a resource by an id from `req.params`/`req.query` and returns it without a predicate tying the resource's owner to the authenticated principal (`resource.userId === req.user.id`, an ownership policy call, or a scoped query such as `where({ id, userId })`). The scoped-query form is the clean pass.
- fail: `db.users.findOne({ id: req.params.id })` returned directly.
- pass: `db.users.findOne({ id: req.params.id, userId: req.user.id })`
- false positives: admin routes, public resources, and resources with no owner. Needs a per-route `// public-resource` or `// admin-only` marker.
- effort: L

### cors-no-wildcard-with-credentials
- source: skills/security-and-hardening/SKILL.md:97 — "CORS restricted to an explicit origin list from configuration. Never `*` with credentials."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: `cors({ origin: '*' })` or `origin: true` together with `credentials: true`; and `Access-Control-Allow-Origin: *` written by hand. The bare `origin: '*'` without credentials is a warn, not an error.
- fail: `cors({ origin: '*', credentials: true })`
- pass: `cors({ origin: config.allowedOrigins, credentials: true })`
- false positives: a genuinely public, credential-free API using `origin: '*'` — hence the split severity.
- effort: S

### strip-sensitive-fields-before-response
- source: skills/security-and-hardening/SKILL.md:98 — "Strip sensitive fields (`passwordHash`, reset tokens) before any response."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a response call (`res.json`, `return user`, a serialiser) that passes an object read directly from the user/account store without a projection (`select`, `omit`, `toJSON`, a DTO mapper). A `passwordHash`/`password`/`resetToken` field name appearing in the response path is the signal.
- fail: `res.json(await User.findByPk(id))`
- pass: `res.json(toPublicUser(await User.findByPk(id)))`
- false positives: a model whose `toJSON` already strips (the rule should treat a class-level `toJSON` as satisfying it).
- effort: L

### validate-input-at-boundary
- source: skills/security-and-hardening/SKILL.md:104 — "Validate at the boundary with a schema: allowlisted shape, lengths, enums, formats. Reject with 422 and structured details; downstream code uses only the parsed, typed value."
- classification: heuristic-only
- target: eslint:error-handling
- detection: a handler that reads `req.body`/`req.query`/`req.params` and uses a field without a preceding schema parse (`zod`, `valibot`, `joi`, `yup`, `pydantic`) whose result is the value used. The "parsed, typed value" half is the key: reading `req.body.x` after parsing `req.body` still fails.
- fail: `const schema = z.object({...}); schema.parse(req.body); db.insert(req.body)`
- pass: `const body = schema.parse(req.body); db.insert(body)`
- false positives: middleware-validated routes; needs a `// validated-at: <middleware>` marker.
- effort: L

### upload-allowlist-and-size-cap
- source: skills/security-and-hardening/SKILL.md:105 — "Uploads: allowlist MIME types, cap size, verify content (magic bytes) when it matters. The extension proves nothing."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a multer/busboy/formidable/file-upload configuration object with no `limits.fileSize`, or a MIME check that reads `file.originalname`/extension instead of `file.mimetype`. Two separate findings.
- fail: `multer({ dest: 'uploads/' })` with a `.endsWith('.png')` check.
- pass: `multer({ dest: 'uploads/', limits: { fileSize: 5e6 }, fileFilter: (_, f, cb) => cb(null, ALLOWED.has(f.mimetype)) })`
- false positives: an upload path behind an authenticated admin surface; still worth reporting, as warn.
- effort: M

### ssrf-allowlist-on-user-supplied-urls
- source: skills/security-and-hardening/SKILL.md:111 — "Any URL the user influences — webhooks, import-from-URL, image proxies, link previews — can be aimed at internal services. Allowlist scheme and host, resolve **all** DNS records and reject any private or reserved address (loopback, link-local `169.254.169.254`, private, unique-local, for IPv4 and IPv6), and forbid redirects."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a fetch/axios/http.get call whose URL argument derives from request input (`req.body.url`, `req.query.url`, a webhook payload field) with no preceding allowlist check. The strongest signal is a missing `redirect: 'manual'` plus a missing host check. The private-address denylist is stated precisely enough to implement: `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`.
- fail: `const res = await fetch(req.body.callbackUrl)`
- pass: a fetch preceded by `assertAllowedHost(url)` and `{ redirect: 'manual' }`.
- false positives: an internal service mesh where every URL is trusted by construction; needs a per-file marker.
- effort: L

### destructive-path-guard
- source: skills/security-and-hardening/SKILL.md:117 — "Before the call, require all three: the resolved target (symlinks resolved) sits under an **allowlisted root**; it is at least one level **below** that root; and it carries **ownership evidence read before the operation**."
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: `fs.rm`/`unlink`/`rmdir`/`rename`/`writeFile` with `{ force: true }` (or `shutil.rmtree`, `os.remove`) whose path argument derives from a request/payload/env value, with no preceding `fs.realpath` + root-prefix assertion. The three-part contract at line 117 is the checklist; a rule can require the `realpath` call to be present in the enclosing function.
- fail: `fs.rm(path.join(UPLOADS, req.body.name), { recursive: true })`
- pass: `const target = await fs.realpath(candidate); assertUnderRoot(target, ROOT, { minDepth: 1 }); await fs.rm(target, { recursive: true })`
- false positives: a path that is a compile-time constant; a CLI whose argument is the user's own file (the trust boundary differs). Must fire only when the path is traced to request/env input.
- effort: L

### rate-limit-auth-endpoints
- source: skills/security-and-hardening/SKILL.md:123 — "Limit the API generally and auth endpoints strictly (about 10 attempts per 15 minutes). Once more than one process serves traffic, in-memory counters silently become `max × instances`, or never fire on serverless: back the limiter with a shared store."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: two findings — (a) a route path matching `/login|signin|register|reset|otp|verify|token/i` with no rate-limit middleware in its chain; (b) a rate limiter constructed with an in-memory store (`express-rate-limit` default, `new Map()`) in a project whose deploy config declares more than one instance or a serverless runtime. (b) needs the deploy config, so it belongs in a pre-push/CI check rather than an AST rule.
- fail: `app.post('/login', handler)` with no limiter.
- pass: `app.post('/login', authLimiter, handler)` where `authLimiter` uses `rate-limit-redis`.
- false positives: an app with a single instance and an in-memory limiter is correct for (b); (a) has no false positives worth worrying about.
- effort: M

### env-example-and-gitignore-for-secrets
- source: skills/security-and-hardening/SKILL.md:129 — "Secrets come from the environment. `.env.example` is committed with placeholders; real `.env*` files and key material are gitignored"
- classification: mechanical
- target: pre-push script
- detection: if the repo reads `process.env.X`, then `.env.example` must exist and list `X`; `.gitignore` must cover `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`; and no tracked `.env` file may exist. Four assertions, all file-presence.
- fail: a tracked `.env` with real values; or `process.env.STRIPE_KEY` absent from `.env.example`.
- pass: `.env.example` with `STRIPE_KEY=`, `.gitignore` covering `.env*` with a `!.env.example` negation.
- false positives: a repo that uses a secret manager and never reads `process.env`; the rule should be conditional on the first assertion.
- effort: M

### no-forced-dependency-remediation
- source: skills/security-and-hardening/SKILL.md:137 — "Never apply forced remediation (`npm audit fix --force` or equivalent) automatically, since forced fixes may cross declared dependency ranges"
- classification: mechanical
- target: pre-push script
- detection: a CI workflow, script, or hook that invokes `npm audit fix --force`, `yarn upgrade --latest` on an audit finding, or `pnpm audit --fix` without a preceding `--dry-run`. A grep over workflow files and `package.json` scripts.
- fail: `- run: npm audit fix --force`
- pass: `- run: npm audit --audit-level=high` with a manual triage step.
- false positives: none identified.
- effort: S

### dependency-scripts-blocked-by-default
- source: skills/security-and-hardening/SKILL.md:136 — "Block dependency scripts before first execution. Bootstrap with scripts disabled or a documented fail-closed policy, inspect the pending script source, approve only the minimum, commit the policy, then verify with a clean frozen/immutable install. Never blanket-approve."
- classification: mechanical
- target: pre-push script
- detection: the presence and content of the install-script policy: `.npmrc` with `ignore-scripts=true`, `pnpm.onlyBuiltDependencies` in `package.json`, or a `trustedDependencies` list. Report when a lockfile exists and none of the three is configured, or when the allowlist is a wildcard/empty-means-all.
- fail: no policy configured while `package-lock.json` exists.
- pass: `"pnpm": { "onlyBuiltDependencies": ["esbuild", "sharp"] }`
- false positives: a repo with no dependencies that run scripts; the rule should report only when the lockfile contains a package known to have install scripts, or downgrade to warn.
- effort: M

### no-competing-lockfiles
- source: skills/security-and-hardening/SKILL.md:135 — "Corroborate `packageManager` (when present), the lockfile, and CI; stop on disagreement or competing lockfiles."
- classification: mechanical
- target: pre-push script
- detection: more than one of `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb` present at one installation boundary; or `package.json#packageManager` disagreeing with the lockfile that exists; or the CI workflow installing with a different manager than the lockfile implies.
- fail: both `package-lock.json` and `pnpm-lock.yaml` at the root.
- pass: `pnpm-lock.yaml` plus `"packageManager": "pnpm@11.3.0"`.
- false positives: a monorepo with genuinely independent nested projects outside the workspace root — the rule must scope to one boundary, exactly as the skill says.
- effort: S

### llm-output-is-untrusted-input
- source: skills/security-and-hardening/SKILL.md:158 — "**Model output is untrusted input** (LLM05). Never into `eval`, SQL, a shell, `innerHTML`, or a file path; parse defensively, validate against a schema, then encode."
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: a value bound from an LLM response (`.choices[0].message.content`, `.content[0].text`, `completion.text`, a `generateText`/`chat` result) used as the argument to a sink (`eval`, a query, `exec`, `innerHTML`, `path.join`) without an intervening `JSON.parse` + schema parse. The "intervening" part makes it a dataflow rule rather than a pattern match, so it is heuristic.
- fail: `await exec(llm.choices[0].message.content)`
- pass: `const cmd = CommandSchema.parse(JSON.parse(llm.content)); await exec(ALLOWED[cmd.name])`
- false positives: a value already validated in a helper the rule cannot see; needs taint tracking or a marker.
- effort: L

### no-secrets-or-pii-in-llm-context
- source: skills/security-and-hardening/SKILL.md:160 — "**Keep secrets, other tenants' data, and the full system prompt out of the context window** (LLM02, LLM07)"
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: a prompt/message construction that interpolates `process.env.*`, an API key constant, another tenant's record (a query result not filtered by the current tenant), or the system-prompt constant itself into the model call.
- fail: `messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(await db.orders.findMany()) }]`
- pass: a tenant-scoped query result, with no env or system-prompt interpolation.
- false positives: a prompt that includes a redacted or synthetic example; needs a marker.
- effort: L

### pii-out-of-telemetry
- source: skills/security-and-hardening/SKILL.md:147 — "Keep PII out of telemetry (the `observability-and-instrumentation` skill makes the same point from the ops side)."
- classification: heuristic-only
- target: eslint:error-handling
- detection: a telemetry/metric/trace call whose attributes include an identifier matching `/email|phone|name|address|ssn|dob|ip|userId/i` or an entire request body.
- fail: `metrics.increment('signup', { email: user.email })`
- pass: `metrics.increment('signup', { plan: user.plan })`
- false positives: a hashed user id used for correlation, which is the recommended pattern and must pass; `userId` alone should warn, not error.
- effort: M

### personal-data-retention-and-deletion-path
- source: skills/security-and-hardening/SKILL.md:148 — "**Set retention up front, then actually delete.** Every personal-data store needs a TTL and a working deletion path, including backups, caches, search indexes, and analytics copies."
- classification: heuristic-only
- target: pre-push script
- detection: a schema/model that declares personal-data fields (from the classification at line 146) with no `expiresAt`/TTL index, no `deletedAt` (soft-delete), and no delete handler reachable from a route matching `/delete|erase|forget|gdpr|ccpa/i`. Detecting "including backups, caches, search indexes" needs the infra config, so the checkable half is the schema + route pair.
- fail: a `User` model with `email`, `phone` and no TTL field and no delete route.
- pass: a model with a retention TTL plus a `DELETE /me` handler.
- false positives: a store with a documented manual erasure process; needs an explicit `// retention: manual, <ref>` marker.
- effort: L

## skills/security-and-hardening/references/hardening-patterns.md  (324 lines read)
verdict: see the per-section candidates below; the file is the worked implementation of the rules
above, so its own value for the catalog is as evidence that each rule has a concrete pattern to
match against, plus the handful of extra rules listed here.

### magic-bytes-verification-for-uploads
- source: skills/security-and-hardening/references/hardening-patterns.md:200 — "// Don't trust the file extension — check magic bytes if critical" (the pattern sits in the section headed at :186 — "### File Upload Safety")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an upload handler that validates `file.mimetype` or the file extension but never inspects the leading bytes, for a MIME type with a known magic number (PNG `89 50 4E 47`, JPEG `FF D8 FF`, PDF `%PDF`, ZIP `PK\x03\x04`). The reference states the rule and points at where the check belongs, so the rule is a check for "extension-only validation where magic bytes are cheap".
- fail: a PNG upload accepted on `file.originalname.endsWith('.png')` alone.
- pass: a leading-bytes comparison after the MIME check.
- false positives: text formats with no magic number (`text/plain`, CSV), which the rule must skip.
- effort: M

### timing-safe-comparison-for-secrets
- source: skills/security-and-hardening/SKILL.md:129 and references/hardening-patterns.md (secrets-management section) — "grep the staged diff before committing"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: `===`/`==`/`.localeCompare`/`String.prototype.includes` comparing a value against a secret-looking identifier (`/secret|token|signature|hmac|apiKey|webhookSecret/i`) where a `crypto.timingSafeEqual`/`hmac.compare_digest` is the correct form. Webhook signature verification is the canonical site.
- fail: `if (req.headers['x-signature'] === expectedSignature)`
- pass: `if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))`
- false positives: a comparison against a non-secret (a public config flag) whose name happens to match; require the identifier to be assigned from `process.env` or a signature computation.
- effort: M

## skills/performance-optimization/SKILL.md  (267 lines read)
verdict: 12 candidates. Notable for the catalog: this skill states **numeric budgets** (lines
194-201), which are the most directly implementable rules in the whole corpus.

### no-n-plus-one-query
- source: skills/performance-optimization/SKILL.md:127 — "**N+1 queries.** One query per row is the most common backend bottleneck. Fetch the relation in the same query (join/include) instead of in the loop."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a `for`/`forEach`/`map`/`await` loop whose body contains a query call (`findOne`, `findUnique`, `query`, `get`, `select`) on the same model or client, where the loop is over a result set. The AST shape is unambiguous: an iteration whose body awaits a DB call. Detection of the *fix* is not required to report.
- fail: `for (const post of posts) post.author = await db.user.findUnique({ where: { id: post.authorId } });`
- pass: `db.post.findMany({ include: { author: true } })`
- false positives: a loop over a small, code-owned constant list; a loop that batches with a `Promise.all` of a single grouped query. Exempt a body whose query is guarded by an explicit `// n+1-ok: <reason>` marker.
- effort: M

### list-endpoint-pagination
- source: skills/performance-optimization/SKILL.md:128 — "**Unbounded data fetching.** Every list endpoint paginates with a limit and a stable order."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a route handler whose path or handler name matches `/list|index|all|search/i` and that calls `findMany`/`find()`/`select()`/`SELECT` with no `take`/`limit`/`LIMIT`/`first` argument and no `.paginate`. Two required properties: a limit and a stable `orderBy`.
- fail: `db.post.findMany({ where: { tenantId } })`
- pass: `db.post.findMany({ where: { tenantId }, orderBy: { id: 'asc' }, take: 50 })`
- false positives: a genuinely bounded query (`where: { id }`), a count query, a lookup table read. The rule must require the result to be returned as a collection.
- effort: M

### index-change-justified-by-a-plan
- source: skills/performance-optimization/SKILL.md:129 — "\"Add an index\" is the guess; `EXPLAIN ANALYZE` is the measurement. … Re-run the plan afterwards; an index that did not change it is a revert." (red flag at :237 — "An index added without a query plan before and after to justify it")
- classification: heuristic-only
- target: pre-push script
- detection: a migration/schema diff that adds an index (`CREATE INDEX`, `@@index`, `addIndex`) with no `EXPLAIN`/plan output in the commit message or PR body. The plan cannot be executed by a linter in general, so the checkable half is "the evidence is present or it is not" — the same shape as the ledger rule below.
- fail: a migration adding `CREATE INDEX` and a one-line commit message.
- pass: a commit whose body carries the before/after plan lines and the write-cost note.
- false positives: an index on a new table created in the same migration (nothing to plan against); needs an exemption for a table introduced in the same change.
- effort: M

### cache-key-covers-every-input
- source: skills/performance-optimization/SKILL.md:131 — "Every input that changes the response belongs in the key (tenant, locale, permissions, feature flags): a key that omits the viewer is how one user's data gets served to another."
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: a cache read/write whose key is built only from a resource id while the cached value is produced from a request-scoped input (a query that reads `tenantId`/`userId`/`locale`/`req.user`). The dataflow requirement makes it heuristic: the rule can flag "the key is a bare id and the loader closes over a request-scoped variable".
- fail: `cache.set(\`user:\${id}\`, await loadUserWithPermissions(id, req.user))`
- pass: `cache.set(\`user:\${req.user.tenantId}:\${id}:\${req.user.locale}\`, …)`
- false positives: a loader that is genuinely request-independent; requires tracing the loader body.
- effort: L

### cache-declares-staleness-and-invalidation
- source: skills/performance-optimization/SKILL.md:131 — "Choose one invalidation strategy (TTL, event or tag based, versioned keys) and state the acceptable staleness window explicitly." (red flag at :239 — "A cache with no stated staleness window and no invalidation strategy")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a cache write (`cache.set`, `redis.set`, `Map.set` behind a cache facade) with no TTL argument (`ex`, `ttl`, `expires`, `{ ttl }`) and no adjacent invalidation call (`del`, `invalidate`, `revalidateTag`) for the same key. Both halves are syntactic.
- fail: `redis.set(key, JSON.stringify(value))`
- pass: `redis.set(key, JSON.stringify(value), { EX: 300 })`
- false positives: a deliberately unbounded cache of immutable content (a content-addressed asset); exempt a key that is a content hash or a `// cache: immutable` marker.
- effort: M

### connection-pool-sized-not-raised
- source: skills/performance-optimization/SKILL.md:130 — "One pool per process, sized so `instances × max` stays under the database's connection ceiling. Bigger is not faster; it relocates the queue to the database where it is harder to see."
- classification: heuristic-only
- target: pre-push script
- detection: a raised pool `max`/`connectionLimit`/`pool_size` in the diff with no corresponding change to the instance count or a proxy introduction. Needs the deploy config to compute `instances × max`, so it is a pre-push/CI check rather than an AST rule.
- fail: `pool: { max: 100 }` with `replicas: 5` and no proxy.
- pass: `pool: { max: 10 }` with 5 replicas under a 50-connection ceiling, or a pgbouncer URL.
- false positives: a single-instance deployment, where raising `max` is legitimate.
- effort: M

### images-declare-dimensions-and-priority
- source: skills/performance-optimization/SKILL.md:135 — "Every image declares `width` and `height` (CLS). The LCP image gets `fetchpriority=\"high\"`, modern formats (AVIF, WebP) through `<picture>`, and `srcset`/`sizes` for resolution switching; below-the-fold images get `loading=\"lazy\"` and `decoding=\"async\"`."
- classification: mechanical
- target: eslint:svelte-skills
- detection: an `<img>` (JSX, Svelte, HTML) missing `width`+`height` (CLS), or missing `srcset`/`sizes` for a content image, or an above-the-fold image with `loading="lazy"`. Four sub-checks. The Svelte surface already exists in `tools/eslint/svelte-skills.mjs`, and the rule has an exact analogue in Next.js's `next/image` lint.
- fail: `<img src="/hero.jpg">`
- pass: `<img src="/hero.jpg" width="1200" height="600" srcset="…" sizes="…" fetchpriority="high">`
- false positives: an SVG icon rendered through a component, a tracking pixel (1×1), an image inside a `<picture>` whose `<source>` carries the attributes. Needs an exemption for 1×1 and for a wrapped component.
- effort: M

### no-blanket-react-memo
- source: skills/performance-optimization/SKILL.md:245 — "`React.memo` and `useMemo` everywhere (overusing is as bad as underusing)" (rationale at :136 — "reserve `React.memo` and `useMemo` for work the profile shows is expensive, since overuse is its own cost")
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: `useMemo`/`useCallback`/`React.memo` whose callback body is a single literal, a single property access, or an arithmetic expression — i.e. memoization of work that cannot be expensive. A count-per-file threshold is the blunt alternative.
- fail: `const total = useMemo(() => a + b, [a, b]);`
- pass: `const sorted = useMemo(() => rows.slice().sort(cmp), [rows]);`
- false positives: memoization that exists for referential stability rather than cost (a dependency of an effect), which is a legitimate use the profile cannot distinguish; hence heuristic.
- effort: M

