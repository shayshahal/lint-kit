# 03 Performance And Observability

skills/performance-optimization, skills/observability-and-instrumentation, skills/planning-and-task-breakdown, skills/shipping-and-launch.

---

# batch-D2 — performance (continued), observability, planning, shipping

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent, who read
every file in full before writing a candidate. The five parallel extractors produced no output and
were abandoned; this batch replaces them.

## skills/performance-optimization/SKILL.md  (continued from mine-D.md)

### bundle-size-budget-enforced-in-ci
- source: skills/performance-optimization/SKILL.md:194 — "JavaScript bundle: < 200KB gzipped (initial load)" and :206 — "npx bundlesize --config bundlesize.config.json" (the other six budgets are lines 195-201: CSS, images, fonts, API p95, TTI, Lighthouse score)
- classification: mechanical
- target: pre-push script
- detection: seven numeric budgets stated exactly. Checkable form: a budget config exists (`bundlesize.config.json`, `size-limit` in `package.json`, `lhci` assertions) with a threshold at or below the stated value, and CI runs it. A project with a browser bundle and none of the seven enforced is the finding.
- fail: a frontend with no `size-limit` entry and no `lhci` assertions.
- pass: `"size-limit": [{ "path": "dist/*.js", "limit": "200 kB" }]` plus an `lhci` assertion for LCP/CLS/INP.
- false positives: a library with no initial-load bundle; a backend-only repo. The rule must be conditional on a frontend build existing.
- effort: M

### reverted-optimizations-are-recorded
- source: skills/performance-optimization/SKILL.md:164 — "Reverted work leaves no trace in git history, which is exactly why the same dead idea gets tried again next quarter. Keep a short ledger so a discarded idea stays discarded" (red flag at :249 — "The same failed optimization attempted more than once because nobody recorded the first attempt")
- classification: mechanical
- target: md-lint
- detection: a `PERF.md` ledger or a PR-description section whose table has the four stated columns (`Idea | Baseline → Result | Verdict | Why`) and whose `Verdict` cells are one of `kept`/`reverted`. A performance-labelled commit with no ledger entry is the finding. Same shape as the source repo's own rejection ledger in `evals/skill-impact.md`.
- fail: a `perf:` commit with no `PERF.md` row.
- pass: `| Virtualize the list | INP 240ms → 90ms | kept | Long tasks gone from the trace. |`
- false positives: a performance-adjacent refactor that is not an experiment; the commit-prefix trigger keeps this narrow.
- effort: M

### optimization-must-be-attributable
- source: skills/performance-optimization/SKILL.md:145 — "**Change one thing at a time.** Three optimizations landed together produce one number, and you cannot attribute it." (red flag at :247 — "Several optimizations bundled into one measurement, so no single change can be attributed")
- classification: heuristic-only
- target: pre-push script
- detection: one commit or PR that both changes performance-sensitive code and carries a before/after number covering more than one independent change. The mechanical approximation is "a `perf:` commit touching more than one independent hot path with a single number in the message".
- fail: a commit memoizing a component, adding an index, and adding a preconnect, with one LCP number.
- pass: three commits, each with its own before/after.
- false positives: a single change that spans several files, which is normal.
- effort: L

### perf-win-must-not-weaken-tests
- source: skills/performance-optimization/SKILL.md:160 — "An \"optimization\" that wins by dropping work the product needed (skipping a validation, caching something that must be fresh, removing an `await` that was load-bearing) is a regression, not a win." (red flag at :248 — "A \"win\" that required a test to be changed, skipped, or deleted")
- classification: mechanical
- target: pre-push script
- detection: a commit labelled `perf:`/`performance:` whose diff also deletes or skips a test, removes a validation call, or removes an `await` on a call whose result is used. The four shapes are syntactic, and the commit-label trigger keeps false positives low.
- fail: `perf: skip validation on the hot path` with `validation.test.ts` deleted.
- pass: a perf commit with the suite untouched.
- false positives: a perf commit that legitimately relocates a validation to the boundary; needs the test to survive elsewhere.
- effort: M

## skills/observability-and-instrumentation/SKILL.md  (238 lines read)
verdict: 11 candidates. Every rule here is about the *shape of a telemetry call*, which is the
easiest class of rule to implement on an AST — and the skill supplies a worked BAD/GOOD pair for
each one.

### no-string-interpolated-log-lines
- source: skills/observability-and-instrumentation/SKILL.md:54 — "Log events, not prose. Every log line is a JSON object with a stable event name and machine-readable fields" and :57 — "// BAD: string interpolation — unqueryable, inconsistent"
- classification: mechanical
- target: eslint:error-handling
- detection: a logger call whose first argument is a template literal containing an interpolation, rather than a stable event name plus a fields object. The skill supplies the exact BAD and GOOD forms, so the fixture is already written in the source.
- fail: `logger.info(\`Payment ${id} failed for user ${userId}\`)`
- pass: `logger.warn({ event: 'payment_failed', paymentId: id, attempt: n }, 'payment failed')`
- false positives: a printf-style logger API (`logger.info('x %s', v)`) whose first argument is a plain string — the rule only fires on a template literal with `${}`.
- effort: S

### no-unstructured-console-log
- source: skills/observability-and-instrumentation/SKILL.md:205 — "\"console.log is fine for now\" | Unstructured output can't be filtered, correlated, or alerted on. The structured logger costs five extra minutes once."
- classification: mechanical
- target: eslint:error-handling
- detection: `console.log`/`console.error`/`print` in non-test source when a structured logger is reachable in the project (a `logger`/`pino`/`winston`/`structlog` import anywhere in the repo). The "a logger exists" precondition is what removes the false positive on a CLI that legitimately prints.
- fail: `console.log('user created', userId)`
- pass: `logger.info({ event: 'user_created', userId }, 'user created')`
- false positives: CLI output, a script's status line, a test. Exempt `scripts/**`, `bin/**`, `**/*.test.*`, and any repo with no logger dependency.
- effort: M

### correlation-id-on-every-log-line
- source: skills/observability-and-instrumentation/SKILL.md:79 — "**Correlation IDs are mandatory.** Generate (or accept) a request ID at the system boundary and attach it to every log line, span, and outbound call."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a request handler that logs through a logger not bound to a request-scoped id — i.e. the module-level logger is used inside a handler where a `req.log`/`ctx.logger` child exists, or no request-id middleware is registered at all. The middleware form in the skill (lines 83-88) is the pass shape.
- fail: a route handler calling `logger.info(...)` while `req.log` is available.
- pass: `req.log.info({ event: 'payment_failed' })` with the middleware from :83-88 registered.
- false positives: a startup/shutdown log outside any request; the rule must scope to a handler body.
- effort: M

### entry-point-field-when-several-writers
- source: skills/observability-and-instrumentation/SKILL.md:91 — "**When several entry points write to one log, name the entry point.** A correlation ID identifies a run; it does not say which code path started it."
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: a repo with more than one entry point (a scheduler/cron, an HTTP replay route, a CLI) writing to the same logger, where the log lines carry no `entryPoint` field. The skill gives the exact field name to look for (:96) and the reason `source` is wrong (:95 — "ECS reserves `source.*` for network fields").
- fail: a scheduler tick and a CLI both calling `logger.info(...)` with only `requestId`.
- pass: `runLog('scheduler', id)` / `runLog('cli', id)` as at :96-101.
- false positives: a single-entry-point service; the rule needs the multi-entry-point precondition.
- effort: L

### no-secrets-or-pii-in-logs
- source: skills/observability-and-instrumentation/SKILL.md:106 — "**Never log secrets, tokens, passwords, or full PII.** This is a hard rule from the `security-and-hardening` skill — telemetry pipelines are a classic data-leak path. Allowlist fields; don't log whole request bodies."
- classification: heuristic-only
- target: eslint:error-handling
- detection: a log/metric/trace call whose arguments include an identifier matching `/pass(word)?|secret|token|apiKey|authorization|cvv|card(number)?|ssn|email|phone/i`, or the whole request body (`req.body`, `request.data`). The skill states the hard rule and the "allowlist fields; don't log whole request bodies" remedy.
- fail: `logger.info({ body: req.body }, 'request received')`
- pass: `logger.info({ event: 'request_received', route: req.route.path }, ...)`
- false positives: a hashed or already-redacted value; require the identifier to be a whole word and not wrapped in a redactor.
- effort: M

### metric-labels-are-bounded
- source: skills/observability-and-instrumentation/SKILL.md:125 — "**Cardinality is the failure mode.** Every unique label combination is a separate time series. Labels must come from small, fixed sets (route template, status class, provider name). Never use user IDs, raw URLs, error messages, or other unbounded values as labels" (the OK/NEVER list is spelled out at :128-129)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a metric label value derived from an unbounded input — `req.url`, `req.params.*`, a user id, `err.message`, an email. The skill gives the exact denylist at :129: "user_id, email, request_id, full URL, error message text". This is a syntactic check on the label-value expression.
- fail: `httpDuration.observe({ path: req.url, user_id: user.id }, ms)`
- pass: `httpDuration.observe({ route: req.route.path, status_class: '5xx' }, ms)`
- false positives: a label whose variable is named `id` but is bounded (a tenant count in the tens); hence keep at warn.
- effort: M

### latency-is-a-histogram-not-an-average
- source: skills/observability-and-instrumentation/SKILL.md:132 — "Track averages never, percentiles always: an average hides the 1% of users having a terrible time. Use histograms and read p50/p95/p99." (red flag at :218 — "Latency tracked as an average with no percentiles")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a latency/duration metric constructed as a `Gauge`/`Summary`-with-mean/`Counter` accumulation rather than a `Histogram`, or a metric named `*_avg`/`*_mean`/`average_*` for a duration. The skill's own example at :117-122 is the pass shape (`new Histogram({ … buckets: [...] })`).
- fail: `new Gauge({ name: 'http_request_duration_seconds_avg' })`
- pass: `new Histogram({ name: 'http_request_duration_seconds', buckets: [...] })`
- false positives: a genuinely gauge-shaped value (queue depth, pool usage); scope the rule to names matching `/duration|latency|time/i`.
- effort: S

### otel-context-propagated-across-async-boundaries
- source: skills/observability-and-instrumentation/SKILL.md:150 — "Propagate context across every async boundary — HTTP headers, queue message metadata — or the trace dies at the gap."
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: an outbound HTTP call or queue publish inside a traced handler whose options carry no trace-context propagation (`traceparent`, an OTel propagator call, or a wrapper that injects it). Needs a positive signal that tracing is configured (an OTel SDK import), so the rule is silent in an untraced repo.
- fail: `fetch(upstream, { headers: { authorization } })` in a repo with `@opentelemetry/sdk-node`.
- pass: a fetch through an instrumented client or with `propagation.inject(context.active(), headers)`.
- false positives: a call deliberately outside the trace (a health ping); needs a marker.
- effort: L

### alerts-are-symptom-based
- source: skills/observability-and-instrumentation/SKILL.md:154 — "Alert on **symptoms users feel**, not on causes" and :220 — "Alerts on causes (CPU, memory) paging humans while user-facing error rate is unmonitored" (the symptom/cause split is tabulated at :157-160)
- classification: heuristic-only
- target: pre-push script
- detection: an alert-rule definition (Prometheus/Grafana/Datadog YAML or Terraform) whose expression is a resource metric (`cpu`, `memory`, `disk`, `restarts`) with `severity: page`, and no user-facing alert (error rate, latency, queue age) at page severity. Needs the alert config, so it is a repo-level check rather than an AST rule.
- fail: a page-severity alert on `node_cpu_seconds_total` with no error-rate page.
- pass: page on `error_rate > 1% for 5m`; CPU is a dashboard.
- false positives: a resource alert that is genuinely page-worthy (disk full on a single-node DB); keep at warn.
- effort: L

### alert-has-threshold-duration-runbook-and-two-severities
- source: skills/observability-and-instrumentation/SKILL.md:167 — "**It must be actionable.**" and :170 — "Use two severities only: **page** (user-facing, act now) and **ticket** (degradation, act this week)"
- classification: mechanical
- target: pre-push script
- detection: four required properties on every alert definition: a `for:`/duration, a threshold, a runbook link, and a severity drawn from a two-value set. An alert missing any of the four is a finding; a third severity value is its own finding. All four are config-file properties.
- fail: an alert with no `for:` and no runbook annotation.
- pass: an alert with `for: 5m`, a threshold, `runbook_url:`, and `severity: page`.
- false positives: an alert defined in a managed service's UI rather than in the repo; the rule applies only to checked-in config.
- effort: M

### runbook-exists-for-every-alert
- source: skills/observability-and-instrumentation/SKILL.md:174 — "Rule 2 above requires every alert to link to a runbook. … Store in `docs/runbooks/` named after the alert." and :188 — "Update the runbook as part of closing every incident it was used in" (the three-line minimum is at :176-184)
- classification: mechanical
- target: pre-push script
- detection: for every alert definition, a file must exist at `docs/runbooks/<alert-name>.md` containing the three required fields the skill names: `**Means:**`, `**First check:**`, `**Escalate to:**`. Two assertions — presence and the three fields — both file-level.
- fail: an alert whose runbook file does not exist.
- pass: `docs/runbooks/high-error-rate-api-tasks.md` with the three fields at :180-183.
- false positives: an alert linked to an external wiki; accept any URL as satisfying presence, but then the field check cannot run.
- effort: M

## skills/planning-and-task-breakdown/SKILL.md  (257 lines read)
verdict: 9 candidates. Document-structure rules — a new surface for lint-kit (md-lint), and the most
self-contained set in the corpus because the skill ships the exact template to check against.

### plan-task-has-acceptance-criteria-and-verification
- source: skills/planning-and-task-breakdown/SKILL.md:88 — "**Acceptance criteria:**" and :92 — "**Verification:**" (the exit criteria are listed at :246 — "Every task has acceptance criteria" and :247 — "Every task has a verification step")
- classification: mechanical
- target: md-lint
- detection: every task block in `tasks/plan.md` must carry both an `**Acceptance criteria:**` list with at least one checkbox and a `**Verification:**` list with at least one checkbox. The skill's own template at :83-104 is the schema.
- fail: `## Task 3: Add rate limiting` with a description and nothing else.
- pass: the :83-104 template with both lists populated.
- false positives: a plan using an external tracker, where the fields live in the tracker item instead (:162); the rule must skip a plan whose Task List is an index of tracker ids.
- effort: M

### plan-task-declares-dependencies
- source: skills/planning-and-task-breakdown/SKILL.md:97 — "**Dependencies:** [Task numbers this depends on, or \"None\"]" (red flag at :240 — "Dependency order isn't considered")
- classification: mechanical
- target: md-lint
- detection: every task block carries a `**Dependencies:**` line, and each task number it names exists in the same plan. The second half catches a real hazard: `.claude/commands/build.md:35` executes "in the order the plan lists them" when dependencies are absent, so a dangling id is a silent ordering bug.
- fail: `**Dependencies:** Task 9` in a five-task plan.
- pass: `**Dependencies:** Task 1, Task 2` or `**Dependencies:** None`.
- false positives: a single-task plan; nothing to depend on.
- effort: S

### plan-task-size-ceiling
- source: skills/planning-and-task-breakdown/SKILL.md:251 — "No task touches more than ~5 files" (the sizing table at :127-133 defines XL as "**Too large — break it down further**", and :135 — "If a task is L or larger, it should be broken into smaller tasks")
- classification: mechanical
- target: md-lint
- detection: a task whose `**Files likely touched:**` list (:99-101) names more than 5 files, or whose `**Estimated scope:**` (:103) is `Large`/`XL`. Two independent findings.
- fail: a task listing 9 files with `**Estimated scope:** Large`.
- pass: 3 files with `**Estimated scope:** Medium`.
- false positives: a task with an approximate file list; the field is explicitly "likely touched", so the rule should warn rather than error.
- effort: S

### plan-task-title-has-no-and
- source: skills/planning-and-task-breakdown/SKILL.md:141 — "You find yourself writing \"and\" in the task title (a sign it is two tasks)"
- classification: mechanical
- target: md-lint
- detection: a task title matching `\band\b` outside a compound noun. The source states it as a heuristic, so warn. The sibling trigger at :140 ("It touches two or more independent subsystems") is the same signal stated less mechanically.
- fail: `## Task 4: Add validation and wire up the API client`
- pass: `## Task 4: Add validation`
- false positives: "search and replace", "roles and permissions" as a single named concept; hence warn.
- effort: S

### plan-task-acceptance-criteria-count
- source: skills/planning-and-task-breakdown/SKILL.md:139 — "You cannot describe the acceptance criteria in 3 or fewer bullet points"
- classification: mechanical
- target: md-lint
- detection: a task whose acceptance-criteria list has more than 3 checkboxes. Stated numerically, so the rule is exact — and it is the break-down trigger, not a style preference.
- fail: a task with 6 acceptance-criteria checkboxes.
- pass: 3 or fewer.
- false positives: a task legitimately split by the rule author into 4 fine-grained criteria; the fix is to split the task, which is what the source intends.
- effort: S

### plan-checkpoints-between-phases
- source: skills/planning-and-task-breakdown/SKILL.md:112 — "Verification checkpoints occur after every 2-3 tasks" and :239 — "No checkpoints between tasks" (the checkpoint template is at :117-123)
- classification: mechanical
- target: md-lint
- detection: a plan with more than 3 tasks and no `## Checkpoint` heading, or more than 3 consecutive tasks between two checkpoints. The template at :117-123 gives the heading form and the four required items.
- fail: 9 tasks and no checkpoint heading.
- pass: `### Checkpoint: Foundation` after tasks 1-3.
- false positives: a plan that uses `Phase` headings with their own gates; accept either marker.
- effort: S

### plan-does-not-overwrite-an-incomplete-plan
- source: skills/planning-and-task-breakdown/SKILL.md:150 — "**Never overwrite an incomplete plan.** Before writing `tasks/plan.md` or `tasks/todo.md`, check whether they already exist and still contain unchecked tasks" (red flag at :234)
- classification: mechanical
- target: pre-commit hook
- detection: when the staged diff rewrites `tasks/plan.md`/`tasks/todo.md`, fail if an unchecked `- [ ]` item present in HEAD is absent from the new version (neither checked off nor retained). A pre-commit hook can read both the index and HEAD. This is the same rule as `never-overwrite-an-incomplete-plan` in batch-GOV, cited there from `.claude/commands/plan.md:18`; the skill states the same-work/different-work split at :152-153.
- fail: `- [ ] Add rate limiting` disappears from `tasks/todo.md` without being checked.
- pass: it becomes `- [x] Add rate limiting`.
- false positives: a deliberate re-plan after the user asked for it (:152 — "update the existing files in place"); needs a commit-message or explicit-override marker.
- effort: M

### task-list-target-is-not-duplicated
- source: skills/planning-and-task-breakdown/SKILL.md:235 — "Writing `tasks/todo.md` when the project has designated an external tracker (or scattering tasks across both)"
- classification: mechanical
- target: pre-push script
- detection: the project's agent rules designate an external tracker (a `CLAUDE.md`/`AGENTS.md` line naming Linear/Jira/GitHub Issues/`bd`) and `tasks/todo.md` also exists with unchecked tasks. The skill states the requirement at :162-164 and this red flag names the failure.
- fail: `AGENTS.md` says "tasks tracked in Linear" and `tasks/todo.md` holds 12 unchecked items.
- pass: only the tracker items, with `tasks/plan.md` holding an ordered index (:164).
- false positives: a project that designated a tracker but is mid-migration; needs a marker.
- effort: M

### plan-records-risks-and-open-questions
- source: skills/planning-and-task-breakdown/SKILL.md:202 — "## Risks and Mitigations" and :207 — "## Open Questions"
- classification: mechanical
- target: md-lint
- detection: a `tasks/plan.md` with no `## Risks and Mitigations` section, or with the section present but the table empty, or with no `## Open Questions` section. Presence-only; content quality is not checkable.
- fail: a plan with Task List and nothing else.
- pass: the :168-209 template.
- false positives: a plan whose risks genuinely are nil — the source's own template still requires the heading, so an empty-but-present section passes.
- effort: S

## skills/shipping-and-launch/SKILL.md  (330 lines read)
verdict: 12 candidates. Unusually valuable for the catalog: it states **numeric rollout thresholds**
(:146-151), a **numeric flag-cleanup window** (:106), and a **numeric error-budget gate** (:242-247).
Most of its rules are "an artifact must contain this", i.e. a file-presence surface.

### no-todo-comments-at-launch
- source: skills/shipping-and-launch/SKILL.md:28 — "No TODO comments that should be resolved before launch"
- classification: mechanical
- target: pre-push script
- detection: on a release-tagged commit (or a `/ship` run), a diff whose changed files still contain `TODO`/`FIXME`/`XXX`/`HACK` comments added by the branch. The rule is a narrowed form of the repo-wide TODO check: only the lines the branch added, which is the same "branch introduced it" shape `structure_check.py` already uses.
- fail: a release commit adding `// TODO: remove before launch`.
- pass: no newly added TODO on the release diff.
- false positives: a TODO with a linked issue (`// TODO(#412):`) which the project has accepted; exempt a `TODO(<ref>)` form.
- effort: M

### no-console-log-debugging-in-production
- source: skills/shipping-and-launch/SKILL.md:29 — "No `console.log` debugging statements in production code"
- classification: mechanical
- target: pre-push script
- detection: a `console.log`/`console.debug`/`print(` statement added by the release branch in non-test, non-script source. Distinct from the observability rule (`no-unstructured-console-log`), which fires on any branch when a logger exists; this one is a release-gate check with no logger precondition.
- fail: a release diff adding `console.log('here')`.
- pass: `logger.debug({ event: 'checkout_started' })`.
- false positives: a deliberate CLI progress line; exempt `scripts/**`, `bin/**`, and `**/*.test.*`.
- effort: S

### wcag-contrast-threshold
- source: skills/shipping-and-launch/SKILL.md:55 — "Color contrast meets WCAG 2.1 AA (4.5:1 for text)" (the machine-checkable half at :58 — "No accessibility warnings in axe-core or Lighthouse")
- classification: mechanical
- target: pre-push script
- detection: a contrast value stated as 4.5:1, with the skill naming the tool that checks it (axe-core, Lighthouse). The rule is "an a11y CI step exists and runs axe-core or Lighthouse", plus a design-token contrast check if the project has a token file.
- fail: a frontend with no axe-core or Lighthouse CI step.
- pass: an `axe`/`lhci` accessibility assertion in CI.
- false positives: a backend-only repo; conditional on a UI existing.
- effort: M

### health-check-endpoint-exists
- source: skills/shipping-and-launch/SKILL.md:67 — "Health check endpoint exists and responds" (the post-deploy check at :230 — "Check health endpoint returns 200")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a server that registers routes but has no path matching `/health|healthz|livez|readyz|_status`. Presence check on the route table.
- fail: an Express app with `/api/*` routes and no `/health`.
- pass: `app.get('/healthz', …)`.
- false positives: a static site or a library; conditional on a server existing.
- effort: S

### feature-flag-has-owner-and-expiry
- source: skills/shipping-and-launch/SKILL.md:105 — "Every feature flag has an owner and an expiration date" (the cleanup window at :106 — "Clean up flags within 2 weeks of full rollout"; red flag at :303 — "Feature flags with no expiration or owner")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a flag declaration or registry entry with no `owner` and no expiry date. The two-week window at :106 is a separate finding: a flag whose `fullRolloutAt` is more than 14 days in the past and which is still referenced in code.
- fail: `const ENABLE_NEW_CHECKOUT = true;` with no owner or date.
- pass: `flag('new-checkout', { owner: 'payments', expiresAt: '2026-03-01' })`.
- false positives: a permanent kill switch, which is a different concept and should be declared as such; needs a `kill-switch` marker to pass.
- effort: M

### no-nested-feature-flags
- source: skills/shipping-and-launch/SKILL.md:107 — "Don't nest feature flags (creates exponential combinations)"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an `if` on a flag inside another `if` on a flag. Syntactic and exact — the AST shape is two nested conditionals whose tests are flag reads.
- fail: `if (flags.a) { if (flags.b) { … } }`
- pass: two independent early returns, or a single combined flag.
- false positives: a flag inside a feature check that is not itself a flag; the rule must require both tests to read from the flag API.
- effort: M

### both-feature-flag-states-tested
- source: skills/shipping-and-launch/SKILL.md:108 — "Test both flag states (on and off) in CI"
- classification: mechanical
- target: pre-push script
- detection: for each flag declared, at least one test that exercises the `true` branch and one the `false` branch — detectable as two tests naming the flag, one with the flag stub set on and one off; or a CI matrix dimension over the flag.
- fail: a flag with tests that only cover the enabled path.
- pass: a `describe.each([true, false])` over the flag, or a CI matrix entry.
- false positives: a flag whose disabled path is trivially `return null`; the source still requires the test, so keep it.
- effort: L

### staged-rollout-has-numeric-thresholds
- source: skills/shipping-and-launch/SKILL.md:148 — "| Error rate | Within 10% of baseline | 10-100% above baseline | >2x baseline |" and :149 — "| P95 latency | Within 20% of baseline | 20-50% above baseline | >50% above baseline |" (two further rows at :150-151)
- classification: mechanical
- target: md-lint
- detection: a rollout plan artifact that names rollout percentages (:99 — "5% → 25% → 50% → 100%") but carries no advance/hold/rollback thresholds. The skill's four-row table is the schema to check for, and the numbers are given exactly.
- fail: "Roll out 5% → 25% → 100%" with no threshold table.
- pass: the four-row table with the stated percentages.
- false positives: a change with no measurable signal; the plan should say so explicitly rather than omit the section.
- effort: M

### rollback-plan-present-and-complete
- source: skills/shipping-and-launch/SKILL.md:253 — "Every deployment needs a rollback plan before it happens" vs .claude/commands/ship.md:70 — "3. The rollback plan is mandatory before any GO decision." (the template is at :255-278; the red flag at :300)
- classification: mechanical
- target: pre-push script
- detection: a release/launch artifact with no rollback section, or one missing any of the four parts the template names: `Trigger Conditions`, `Rollback Steps`, `Database Considerations`, `Time to Rollback`. Four sub-findings; the command's "mandatory" wording makes the section-presence check an error.
- fail: a launch doc with Deploy and Verify sections and no Rollback.
- pass: the :255-278 template.
- false positives: a docs-only release; needs a no-runtime-change exemption.
- effort: M

### error-budget-gate
- source: skills/shipping-and-launch/SKILL.md:243 — "Budget remaining > 20%  →  Ship normally; monitor closely" and :245 — "Budget exhausted        →  Freeze feature work; focus entirely on reliability" (the red flag is at :307; the policy requirement at :330)
- classification: mechanical
- target: pre-push script
- detection: three numeric bands and a required policy document (:330 — "Error budget policy in place: know what action to take when budget drops below 20% and when it's exhausted"). Checkable form: an error-budget/SLO policy exists, names the 20% and exhausted thresholds, and CI reads the current budget to gate a high-risk change. The burn-rate refinement is at :249.
- fail: an SLO defined with no policy naming the two thresholds.
- pass: a policy document with the three bands and a CI gate.
- false positives: a repo with no SLO; the rule should require an SLO before demanding a policy.
- effort: L

### post-launch-verification-steps
- source: skills/shipping-and-launch/SKILL.md:227 — "In the first hour after launch:" and :235 — "6. Confirm rollback mechanism works (dry run if possible)" (six steps, lines 229-236)
- classification: mechanical
- target: md-lint
- detection: a launch artifact with no post-deploy verification section, or one missing the rollback dry-run step (:235). Six named steps, each a checklist item.
- fail: a plan ending at "deploy".
- pass: the six-step list.
- false positives: a docs-only release.
- effort: S

### deploy-env-vars-declared
- source: skills/shipping-and-launch/SKILL.md:62 — "Environment variables set in production" and :305 — "Production environment configuration done by memory, not code" (the same concern is the subject of skills/ci-cd-and-automation/SKILL.md:271)
- classification: mechanical
- target: pre-push script
- detection: an env var read in code (`process.env.X`, `os.environ["X"]`) that is absent from the deploy config / `.env.example` / CI secret list. "Done by memory, not code" is exactly what a diff between the two sets detects.
- fail: `process.env.STRIPE_WEBHOOK_SECRET` read but absent from `.env.example`.
- pass: the var present in `.env.example` and the deploy manifest.
- false positives: an optional var with a documented default; exempt a `??`/`getenv(..., default)` read.
- effort: M
