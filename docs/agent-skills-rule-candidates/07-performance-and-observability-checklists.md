# 07 Performance And Observability Checklists

references/performance-checklist and references/observability-checklist.

---

# batch-E4 — performance and observability checklists

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent.

## references/performance-checklist.md  (236 lines read)
verdict: 17 candidates. Many restate `skills/performance-optimization/SKILL.md`; the ones below are
either stated more precisely here or appear only here.

### core-web-vitals-thresholds
- source: references/performance-checklist.md:19 — "| LCP (Largest Contentful Paint) | ≤ 2.5s | ≤ 4.0s | > 4.0s |" and :20 — "| INP (Interaction to Next Paint) | ≤ 200ms | ≤ 500ms | > 500ms |" (CLS at :21; the same three numbers at skills/performance-optimization/SKILL.md:26-28)
- classification: mechanical
- target: pre-push script
- detection: three exact thresholds, each with a "Good" bound. Checkable as a Lighthouse CI assertion set (`lhci` `assertions` for `largest-contentful-paint`, `cumulative-layout-shift`, and a `web-vitals` budget) with thresholds at or below the stated values. The `Good` column is the gate; `Needs Work` is the warning band.
- fail: an `lhci` config asserting LCP ≤ 4.0s (the "Needs Work" bound).
- pass: assertions at 2.5s / 200ms / 0.1.
- false positives: a non-web project; conditional on a browser target existing.
- effort: M

### fonts-are-limited-and-woff2
- source: references/performance-checklist.md:61 — "Limited to 2–3 font families, 2–3 weights each (every additional weight is another request)" and :62 — "WOFF2 format only (smallest, universal support — skip WOFF/TTF/EOT)"
- classification: mechanical
- target: pre-push script
- detection: count the `@font-face` declarations (or the `fonts` config) per family — more than 3 weights per family or more than 3 families is the finding; and any `src` in `woff`/`ttf`/`eot` format rather than `woff2`. Both are exact counts/formats over a CSS or config file.
- fail: 5 weights of one family, with `.ttf` sources.
- pass: 2 families × 2 weights, `.woff2` only.
- false positives: a variable font declared once (which the checklist endorses at :67) — count `@font-face` blocks, not weights, when a variable font is used.
- effort: M

### font-display-and-preload-for-lcp-fonts
- source: references/performance-checklist.md:64 — "LCP-critical fonts preloaded: `<link rel=\"preload\" as=\"font\" type=\"font/woff2\" crossorigin>`" and :65 — "`font-display: swap` (or `optional` for non-critical) to avoid FOIT blocking render"
- classification: mechanical
- target: eslint:svelte-skills
- detection: every `@font-face` must declare `font-display` (`swap`/`optional`/`fallback`); a missing declaration means `auto` and FOIT. Separately, a font used above the fold with no matching `<link rel="preload" as="font">`.
- fail: an `@font-face` with no `font-display`.
- pass: `font-display: swap` plus the preload link at :64.
- false positives: a font loaded only below the fold, where preload is harmful; the preload half should require the font to be used in the first viewport.
- effort: M

### images-have-modern-formats-and-responsive-sizes
- source: references/performance-checklist.md:34 — "Images use modern formats (WebP, AVIF)" and :36 — "Images and `<source>` elements have explicit `width` and `height` (prevents CLS in art direction)" (responsive sizing at :35)
- classification: mechanical
- target: eslint:svelte-skills
- detection: three sub-findings — an `<img src>` with a `.png`/`.jpg`/`.gif` extension and no `<picture>`/`<source>` alternative; an `<img>` with no `srcset`/`sizes` for a content image; and a missing `width`/`height` on both the `<img>` and each `<source>` (the art-direction case is the one people miss, which the checklist calls out explicitly).
- fail: `<img src="/hero.jpg" srcset="…">` with no `width`/`height`.
- pass: `<picture><source type="image/avif" width="1200" height="600" …><img … width="1200" height="600"></picture>`
- false positives: an SVG icon, a 1×1 tracking pixel, an image inside a component that supplies the attributes.
- effort: M

### lcp-image-is-prioritised-and-not-lazy
- source: references/performance-checklist.md:38 — "Hero/LCP images use `fetchpriority=\"high\"` and no lazy loading" (the same rule at skills/performance-optimization/SKILL.md:135)
- classification: mechanical
- target: eslint:svelte-skills
- detection: the first content image in a route component carrying `loading="lazy"`, or a hero image with no `fetchpriority="high"`. "Above the fold" is the hard part; the mechanical proxy is an image inside the first section/hero element.
- fail: `<img src="/hero.jpg" loading="lazy">`
- pass: `<img src="/hero.jpg" fetchpriority="high" width="…" height="…">`
- false positives: a carousel whose LCP image is not the first one in source order; needs a marker.
- effort: M

### no-render-blocking-javascript-or-css
- source: references/performance-checklist.md:44 — "No blocking JavaScript in `<head>` (use `defer` or `async`)" and :57 — "No render-blocking CSS for non-critical styles" (critical CSS at :56)
- classification: mechanical
- target: pre-push script
- detection: a `<script src>` in `<head>` with neither `defer` nor `async`, and a non-critical `<link rel="stylesheet">` with no `media` query trick or preload. The first is an exact attribute check on the HTML shell.
- fail: `<head><script src="/analytics.js"></script></head>`
- pass: `<script src="/analytics.js" defer></script>`
- false positives: a small inline bootstrap script that must run before render; the rule should apply to `src` scripts only.
- effort: S

### long-tasks-are-broken-up
- source: references/performance-checklist.md:48 — "Long tasks (> 50ms) broken up to keep the main thread available — main lever for INP" (the anti-pattern row at :235 — "Blocking main thread | Poor INP, unresponsive UI | Chunk long tasks with `scheduler.yield()` / `yieldToMain`, offload to Web Workers")
- classification: heuristic-only
- target: pre-push script
- detection: the 50ms threshold is exact but only measurable at runtime. The mechanical proxy is a Lighthouse trace assertion (long-task count) in CI, or an INP budget. In source, the signal is a synchronous loop over a user-sized collection in an event handler with no `scheduler.yield()`/chunking.
- fail: a click handler that sorts 100k rows synchronously.
- pass: the same loop chunked with `scheduler.yield()` as at :50.
- false positives: a loop over a small fixed set; needs the collection to be data-sized.
- effort: L

### third-party-scripts-are-async-or-facaded
- source: references/performance-checklist.md:53 — "Third-party scripts loaded with `async` / `defer`, audited for size, and fronted by a facade when heavy (chat widgets, embeds)"
- classification: mechanical
- target: pre-push script
- detection: a `<script>` whose `src` host is a third-party domain with neither `async` nor `defer`; plus a third-party embed (an iframe to a known chat/support/video host) loaded eagerly rather than behind a click facade. The host list is the only configuration.
- fail: `<script src="https://widget.intercom.io/widget/x.js"></script>`
- pass: the same script `defer`-loaded, or an iframe injected on click.
- false positives: a first-party asset on a CDN; needs the first-party domain list.
- effort: M

### no-css-in-js-runtime-cost-in-production
- source: references/performance-checklist.md:58 — "No CSS-in-JS runtime cost in production (use extraction)"
- classification: mechanical
- target: pre-push script
- detection: a runtime CSS-in-JS dependency (`styled-components`, `emotion`, `@stitches/react` without the build plugin) present in the production dependency graph of a project that also ships a static build. The finding is the dependency plus the absence of the extraction/babel plugin config.
- fail: `styled-components` in `dependencies` with no babel plugin configured.
- pass: the babel/SWC plugin enabled, or Tailwind/CSS modules instead.
- false positives: a project that legitimately needs runtime styling (a theming engine); needs an explicit opt-out.
- effort: M

### animations-use-compositor-friendly-properties
- source: references/performance-checklist.md:81 — "Animations use `transform` and `opacity` (GPU-accelerated)" (anti-pattern row at :232 — "Layout thrashing | Jank, dropped frames | Batch DOM reads, then batch writes")
- classification: mechanical
- target: eslint:tailwind-patterns
- detection: a CSS transition/animation on `width`/`height`/`top`/`left`/`margin`/`padding` (or the Tailwind equivalents `transition-all`, `transition-[width]`) rather than `transform`/`opacity`. `transition-all` is the common offender and is exactly detectable.
- fail: `class="transition-all duration-300"` on a resizing element.
- pass: `class="transition-transform duration-300"`.
- false positives: `transition-all` on a small element where the cost is negligible; keep at warn.
- effort: S

### long-lists-are-virtualized
- source: references/performance-checklist.md:82 — "Long lists use virtualization (e.g., `react-window`)"
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: a `{#each}`/`map()` rendering an unbounded server-provided collection with no virtualization library and no pagination. The "unbounded" part comes from the data source, so the mechanical proxy is a `.map`/`{#each}` over a query result with no `take`/`limit` — which overlaps `list-endpoint-pagination` in batch D.
- fail: `{#each allProducts as p}` where `allProducts` is an unpaginated query result.
- pass: a virtualized list or a paginated source.
- false positives: a list bounded by design (a menu, a nav); needs the collection's size to be unknowable from source.
- effort: L

### bfcache-is-not-blocked
- source: references/performance-checklist.md:85 — "No `unload` event handlers and no `Cache-Control: no-store` on HTML responses — preserves back/forward cache (bfcache) eligibility"
- classification: mechanical
- target: pre-push script
- detection: two exact findings — `window.addEventListener('unload'` (or `onunload =`) anywhere in client code, and a `Cache-Control: no-store` on an HTML response (in server code or a platform config). Both are literal string matches with a stated rationale.
- fail: `window.addEventListener('unload', flushAnalytics)` and `res.set('Cache-Control', 'no-store')` on a page route.
- pass: `visibilitychange`/`pagehide` instead, and no `no-store` on HTML.
- false positives: `no-store` on an API response, which is correct and must be exempt; scope the rule to HTML/page responses.
- effort: S

### no-select-star-and-list-queries-paginate
- source: references/performance-checklist.md:92 — "List endpoints paginated (never `SELECT * FROM table`)" (anti-pattern row at :224 — "Unbounded queries | Memory exhaustion, timeouts | Always paginate, add LIMIT")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: two exact string/AST findings — a query string containing `SELECT *` (or an ORM `findMany()` with no `select`/`take`), and a list query with no `LIMIT`/`take`. The `SELECT *` half is a literal match; the `LIMIT` half overlaps `list-endpoint-pagination` in batch D.
- fail: `db.query('SELECT * FROM users')`
- pass: `db.query('SELECT id, name FROM users LIMIT 50')`
- false positives: `SELECT count(*)` (which the regex must not match), and an introspection query in a migration.
- effort: S

### query-plan-captured-before-and-after
- source: references/performance-checklist.md:97 — "`EXPLAIN ANALYZE` captured **before** the fix, not just after — it is the baseline" and :101 — "Plan re-checked after the change — an index that did not change the plan gets reverted" (anti-pattern row at :226 — "Indexing without reading the plan | Write cost paid, read gain unproven | `EXPLAIN ANALYZE` before and after; revert if the plan is unchanged")
- classification: mechanical
- target: pre-push script
- detection: a migration/schema diff adding an index with no `EXPLAIN`/plan text in the commit message, PR body, or a checked-in `PERF.md`. Same rule as `index-change-justified-by-a-plan` in batch D, stated here with both the before and after requirement.
- fail: a `CREATE INDEX` migration and a one-line commit message.
- pass: a commit body carrying both plans.
- false positives: an index on a table created in the same migration; needs an exemption.
- effort: M

### composite-index-column-order
- source: references/performance-checklist.md:104 — "Composite index column order is equality first, then range/sort" (the same rule at skills/performance-optimization/SKILL.md:129)
- classification: mechanical
- target: pre-push script
- detection: a composite index declaration whose column order puts a range/sort column before an equality column, compared against the query it serves (`WHERE a = ? ORDER BY b` wants `(a, b)`). Detectable when the index and the query are both in the repo: extract the equality columns from the query and compare with the index order.
- fail: `CREATE INDEX ON t (created_at, tenant_id)` for `WHERE tenant_id = ? ORDER BY created_at`.
- pass: `(tenant_id, created_at)`.
- false positives: an index serving several queries with different shapes; needs the query to be unambiguous.
- effort: L

### expression-index-for-function-queries
- source: references/performance-checklist.md:108 — "Expression index used where the query applies a function (`lower(email)`)"
- classification: mechanical
- target: pre-push script
- detection: a query with a function applied to a column in a `WHERE`/`ORDER BY` (`lower(email)`, `date(created_at)`) where the table's indexes cover only the bare column. Comparing the query's functional expressions against the index definitions is decidable from a schema dump.
- fail: `WHERE lower(email) = ?` with only `CREATE INDEX ON users (email)`.
- pass: `CREATE INDEX ON users (lower(email))`.
- false positives: a small table where a sequential scan is fine; the rule should require the table to be large or the index to exist.
- effort: L

### unused-and-duplicate-indexes-are-dropped
- source: references/performance-checklist.md:111 — "Unused and duplicate indexes dropped (they cost writes and buy nothing)" (anti-pattern row at :227 — "Redundant / unused indexes | Every write pays for them | Audit usage stats, drop what nothing reads")
- classification: mechanical
- target: pre-push script
- detection: two findings from the schema plus usage statistics — an index whose column list is a prefix of another index's (a duplicate), and an index with zero scans in `pg_stat_user_indexes` over the observation window. The duplicate half needs no statistics and is purely structural.
- fail: `(tenant_id)` and `(tenant_id, created_at)` both present.
- pass: only the composite.
- false positives: a prefix index retained for a different query shape or a partial-index variant; needs the statistics half to confirm.
- effort: M

### one-connection-pool-per-process
- source: references/performance-checklist.md:114 — "One pool per process, not per request or per module" and :116 — "`connectionTimeoutMillis` set so exhaustion fails fast instead of queueing forever" (the pool-max arithmetic is line 115, and the anti-pattern row is references/performance-checklist.md:228 — "Connection pool per request | Exhausts `max_connections` under load | One pool per process; proxy for serverless")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: three sub-findings — a pool constructed inside a request handler or a module that is imported per request (a `new Pool(...)` not at module scope), a pool with no `connectionTimeoutMillis`/`connectionTimeout`, and a `max` that multiplied by the declared replica count exceeds the database's connection limit. The first and second are syntactic; the third needs the deploy config.
- fail: `app.get('/x', async (req, res) => { const pool = new Pool(); … })`
- pass: one module-scope pool with `connectionTimeoutMillis` set.
- false positives: a serverless function where a per-invocation pool is the platform's model; the checklist says to front those with a proxy instead (:118).
- effort: M

### cache-eviction-and-ceiling-are-set
- source: references/performance-checklist.md:181 — "Eviction policy and memory ceiling set (an unbounded cache is a memory leak)" (anti-pattern row at :230 — "Unbounded cache | Memory leak wearing an optimization's clothing | Set eviction policy and a memory ceiling")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an in-process cache (`new Map()` used as a cache, `node-cache`, `lru-cache`) with no `max`/`maxSize`/`ttl` and no eviction call. The `Map`-as-cache case is the common one and is exactly detectable when the map is only ever `.set` and `.get`.
- fail: `const cache = new Map(); cache.set(key, value);` with no delete and no size bound.
- pass: `new LRUCache({ max: 500, ttl: 60_000 })`.
- false positives: a `Map` used as a genuine index built once and never written after (a lookup table); the rule must require writes at request time.
- effort: M

### negative-results-cached-with-a-shorter-ttl
- source: references/performance-checklist.md:150 — "Store an explicit \"not found\" sentinel with a **shorter** TTL than positive entries" (the section at :146-152, including :152 — "Never let an origin *error* become a negative cache entry, or one failing minute becomes many")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: two findings — a cache write of a null/empty result with the same or no TTL as the positive path, and a `catch` block that writes a cache entry (turning an origin error into a cached negative). The second is a precise and high-value shape: a cache write inside a catch.
- fail: `catch (e) { cache.set(key, null, 300); }`
- pass: a negative sentinel with a shorter TTL, and no cache write on error.
- false positives: a deliberately cached error for circuit-breaking, which is a different mechanism; needs a marker.
- effort: M

## references/observability-checklist.md  (92 lines read)
verdict: 8 candidates. Mostly restates the skill; the ones below add precision or appear only here.

### status-codes-grouped-by-class-in-labels
- source: references/observability-checklist.md:43 — "Status codes grouped by class (`5xx`, not `503`)"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a metric label whose value is a full status code (`res.statusCode`, `response.status`, a `status` label assigned the raw code) rather than a class. The skill's own example shows the correct form at its :120 — `labelNames: ['method', 'route', 'status_class'],  // '2xx', not '200'`.
- fail: `metrics.increment('http', { status: String(res.statusCode) })`
- pass: `{ status_class: \`\${Math.floor(res.statusCode / 100)}xx\` }`
- false positives: a log field (where the full code is correct) — the rule must apply to metric labels only.
- effort: S

### otel-initialized-before-other-imports
- source: references/observability-checklist.md:48 — "OpenTelemetry (or equivalent) initialized at service startup, before other imports" (the worked file at skills/observability-and-instrumentation/SKILL.md:139 — "// tracing.ts — must be imported before anything else")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an `@opentelemetry/sdk-node` `sdk.start()` call in a module that is not the first import of the process entry point. The AST check is import order: the tracing module must precede every other application import.
- fail: `import { app } from './app'; import { sdk } from './tracing'; sdk.start();`
- pass: `import './tracing';` as the first line, with `sdk.start()` inside it.
- false positives: a test entry point or a script that does not need tracing; exempt non-server entries.
- effort: M

### trace-context-propagated-in-w3c-format
- source: references/observability-checklist.md:50 — "Trace context propagated on every outbound call (W3C `traceparent`/`tracestate`) and extracted from every inbound request"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an outbound HTTP call in a traced service whose headers omit `traceparent`, and an inbound handler that never reads the `traceparent` header. The header names are stated, so the check is a literal presence test on the header object — narrower and more implementable than the general propagation rule in batch D2.
- fail: `fetch(url, { headers: { authorization } })` with no `traceparent`.
- pass: `{ ...propagation.inject(context.active(), {}), authorization }`
- false positives: a call to a service outside the trace boundary; needs a marker.
- effort: M

### no-secrets-or-pii-as-span-attributes
- source: references/observability-checklist.md:53 — "No secrets or PII as span attributes" (the log-side rule at :31)
- classification: heuristic-only
- target: eslint:error-handling
- detection: a span attribute whose key or value matches `/pass(word)?|secret|token|apiKey|authorization|email|phone|ssn/i`, or an attribute set to an entire request/response body. Same shape as the log rule, applied to `setAttribute`/`span.setAttributes`.
- fail: `span.setAttribute('user.email', user.email)`
- pass: `span.setAttribute('user.id_hash', hash(user.id))`
- false positives: a hashed identifier; must pass.
- effort: M

### queue-depth-and-processing-duration-tracked
- source: references/observability-checklist.md:44 — "Queue depth and processing duration tracked for every worker/queue"
- classification: mechanical
- target: pre-push script
- detection: a queue/worker consumer (a `worker`, a `bull`/`sqs`/`celery` consumer) in a repo with no depth and duration metric for it. Presence check: a metric named `*_queue_depth`/`*_in_flight` and one matching `*_duration*`/`*_processing_seconds` per queue.
- fail: a Celery app with a task and no queue-depth metric.
- pass: the two metrics emitted per queue.
- false positives: a managed queue whose depth is provided by the platform; needs an exemption.
- effort: M

### dashboards-have-a-sane-default-range
- source: references/observability-checklist.md:71 — "Default time range is sensible (1h–6h, not 30d)"
- classification: mechanical
- target: pre-push script
- detection: a checked-in dashboard definition (Grafana JSON, a Terraform dashboard resource) whose default time range is outside 1h–6h, most commonly `now-30d`.
- fail: `"time": { "from": "now-30d" }`
- pass: `now-6h`.
- false positives: a capacity dashboard where 30d is the right default; needs a per-dashboard exemption.
- effort: S

### log-output-is-spot-checked-for-structured-fields
- source: references/observability-checklist.md:34 — "Actual log output spot-checked: structured fields, not `[object Object]`"
- classification: mechanical
- target: pre-push script
- detection: `[object Object]` appearing in captured test output, or a logger call that interpolates an object into a string (which produces exactly that). The string `[object Object]` in a test snapshot or in a captured log is a literal match.
- fail: a test fixture asserting log output containing `[object Object]`.
- pass: a structured fields object.
- false positives: a test that deliberately asserts the string appears (testing the bug); needs a marker.
- effort: S

### external-calls-logged-with-metadata-only
- source: references/observability-checklist.md:33 — "External service calls logged with metadata only: endpoint, status, latency, attempt count, sanitized identifiers"
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: an outbound call site with no log line, or one that logs the whole response body rather than the five named fields. The allowlist is stated (endpoint, status, latency, attempt count, sanitized identifiers), so a rule can require those fields to be present and the body to be absent.
- fail: `logger.info({ response: res.body }, 'payment call')`
- pass: `logger.info({ endpoint, status: res.status, latencyMs, attempt }, 'payment call')`
- false positives: a call whose body is safe and necessary to debug; needs a marker.
- effort: L
