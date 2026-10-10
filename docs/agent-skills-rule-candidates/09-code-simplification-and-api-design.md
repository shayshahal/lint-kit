# 09 Code Simplification And Api Design

skills/code-simplification and skills/api-and-interface-design.

---

# batch-A1 — code-simplification and api-and-interface-design

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent.

## skills/code-simplification/SKILL.md  (331 lines read)
verdict: 15 candidates. Unusually well suited to the corpus: the file supplies a **Before/After pair
for each rule** (:192-235 TypeScript, :241-270 Python, :276-290 JSX), so every candidate below
already has its fixture written inside the source.

### no-verbose-conditional-assignment
- source: skills/code-simplification/SKILL.md:202 — "// SIMPLIFY: Verbose conditional assignment" — "// SIMPLIFY: Verbose conditional assignment / // Before / let displayName: string; / if (user.nickname) { / displayName = user.nickname; / } else { / displayName = user.fullName; / } / // After / const displayName = user.nickname || user.fullName;"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a `let` declaration followed by an `if`/`else` whose two branches each assign the same variable. The source's replacement (`||`) is only correct when the falsy branch is acceptable, so the rule should prefer a ternary and report the assignment shape, not prescribe `||`.
- fail: the Before block at :204-209.
- pass: `const displayName = user.nickname || user.fullName;` as at :211.
- false positives: a branch with side effects before the assignment; the rule must require each branch to be exactly one assignment.
- effort: M

### no-manual-array-building
- source: skills/code-simplification/SKILL.md:213 — "// SIMPLIFY: Manual array building" — "// SIMPLIFY: Manual array building / // Before / const activeUsers: User[] = []; / for (const user of users) { / if (user.isActive) { / activeUsers.push(user); / } / } / // After / const activeUsers = users.filter((user) => user.isActive);"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an empty array literal followed by a `for…of` whose body is a single guarded `push` of the loop variable. The AST shape is exact, and the Before/After pair at :215-222 is the fixture.
- fail: the Before block at :215-220.
- pass: `users.filter((user) => user.isActive)` at :222.
- false positives: a loop that pushes a *transformed* value (a `map`) or that mutates as well; the rule must require the pushed expression to be the loop variable unchanged.
- effort: S

### no-redundant-boolean-return
- source: skills/code-simplification/SKILL.md:224 — "// SIMPLIFY: Redundant boolean return" — "// SIMPLIFY: Redundant boolean return / // Before / function isValid(input: string): boolean { / if (input.length > 0 && input.length < 100) { / return true; / } / return false; / } / // After / function isValid(input: string): boolean { / return input.length > 0 && input.length < 100; / }"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an `if` whose then-branch is `return true` and which is followed by `return false` (or the `else` form). Exact AST shape; the fixture is at :226-234.
- fail: the Before block at :226-231.
- pass: `return input.length > 0 && input.length < 100;` at :234.
- false positives: an `if` with a side effect in the condition; none, since the shape requires literal booleans.
- effort: S

### no-loop-built-dict-comprehension
- source: skills/code-simplification/SKILL.md:241 — "# SIMPLIFY: Verbose dictionary building" — "# SIMPLIFY: Verbose dictionary building / # Before / result = {} / for item in items: / result[item.id] = item.name / # After / result = {item.id: item.name for item in items}"
- classification: mechanical
- target: flake8 (tools/python)
- detection: an empty dict literal followed by a `for` loop whose only statement is a subscript assignment — the Python analogue of `no-manual-array-building`. The Before/After pair is the fixture.
- fail: the Before block at :243-245.
- pass: the dict comprehension at :247.
- false positives: a loop with a guard or a second statement; the rule requires the single assignment.
- effort: S

### python-guard-clauses-over-nesting
- source: skills/code-simplification/SKILL.md:249 — "# SIMPLIFY: Nested conditionals with early return" — "# SIMPLIFY: Nested conditionals with early return / # Before … if data is not None: / if data.is_valid(): / if data.has_permission(): … # After … if data is None: / raise TypeError(\"Data is None\") / if not data.is_valid(): / raise ValueError(\"Invalid data\")"
- classification: mechanical
- target: flake8 (tools/python)
- detection: three or more levels of nested `if` inside a function where each level only guards the next. The `tools/python/structure_check.py` complexity measure already fires on nesting depth; this rule names the *fix* (invert and return early), which the measure does not.
- fail: the Before block at :251-261.
- pass: the guard-clause form at :263-270.
- false positives: nesting that carries distinct side effects at each level; the rule should require each level to be a pure guard.
- effort: M

### no-verbose-conditional-rendering
- source: skills/code-simplification/SKILL.md:276 — "// SIMPLIFY: Verbose conditional rendering" — "// SIMPLIFY: Verbose conditional rendering / // Before / function UserBadge({ user }: Props) { / if (user.isAdmin) { / return <Badge variant=\"admin\">Admin</Badge>; / } else { / return <Badge variant=\"default\">User</Badge>; / } / } / // After … const variant = user.isAdmin ? 'admin' : 'default';"
- classification: heuristic-only
- target: eslint:svelte-skills
- detection: a component whose whole body is an `if`/`else` returning two instances of the same component differing only in props. The mechanical half is "both branches return the same element type"; the extraction into variables is the judgement part.
- fail: the Before block at :278-284.
- pass: the After form at :286-290.
- false positives: two branches rendering genuinely different component types; the rule requires the same tag with different props.
- effort: M

### prop-drilling-is-flagged-not-refactored
- source: skills/code-simplification/SKILL.md:292 — "// SIMPLIFY: Prop drilling through intermediate components" — "// SIMPLIFY: Prop drilling through intermediate components / // Before — consider whether context or composition solves this better. / // This is a judgment call — flag it, don't auto-refactor."
- classification: heuristic-only
- target: eslint:svelte-skills
- detection: a prop passed through two or more intermediate components without being used by them. Report as a flag only — the source explicitly says "flag it, don't auto-refactor", which is a direct instruction about the rule's severity and fixability.
- fail: `A → B → C` where B forwards `theme` untouched.
- pass: the prop consumed where it is declared, or supplied by context.
- false positives: a deliberate pass-through for an API-shape reason; hence warn with no autofix.
- effort: L

### rule-of-500-on-a-refactor
- source: skills/code-simplification/SKILL.md:171 — "**The Rule of 500:** If a refactoring would touch more than 500 lines, invest in automation (codemods, sed scripts, AST transforms) rather than making the changes by hand. Manual edits at that scale are error-prone and exhausting to review."
- classification: mechanical
- target: pre-push script
- detection: a refactor-labelled commit (`refactor:`, `simplify:`, or a diff that is purely structural) whose changed-line count exceeds 500. The threshold is stated, and the branch-vs-base line count is exactly what the merge-base comparison already computes.
- fail: a `refactor: rename Task to WorkItem` commit with 2,400 changed lines.
- pass: the same rename driven by a codemod, or split under 500 lines per commit.
- false positives: a mechanical rename produced by a codemod, where the diff is large but trustworthy — the rule's own recommendation, so it should pass when a codemod/tool is named in the commit body.
- effort: S

### simplification-must-not-modify-tests
- source: skills/code-simplification/SKILL.md:311 — "Simplification that requires modifying tests to pass (you likely changed behavior)" (exit criterion at :323 — "All existing tests pass without modification")
- classification: mechanical
- target: pre-push script
- detection: a commit labelled `refactor:`/`simplify:` whose diff also modifies an existing test file's assertions (as opposed to adding a test). The source states the inference explicitly: a modified assertion means behaviour changed, which is out of scope for a refactor.
- fail: `refactor: simplify the parser` plus an edited expectation in `parser.test.ts`.
- pass: the same refactor with tests untouched, or a new test added.
- false positives: a test that asserted an implementation detail the refactor legitimately removed — which is exactly the case the TDD skill's `no-interaction-based-tests` rule is meant to prevent; needs a marker.
- effort: M

### no-error-handling-removed-by-a-simplification
- source: skills/code-simplification/SKILL.md:314 — "Removing error handling because \"it makes the code cleaner\"" (exit criterion at :329 — "No error handling was removed or weakened")
- classification: mechanical
- target: pre-push script
- detection: a refactor-labelled diff that deletes a `try`/`catch`, removes a validation call, or narrows a catch clause. Three syntactic shapes on a refactor diff.
- fail: `refactor: flatten the upload path` deleting the `catch` that logged the failure.
- pass: the error handling preserved.
- false positives: a catch that was genuinely dead (unreachable); needs the removed code to have had a body.
- effort: M

### no-speculative-abstraction
- source: skills/code-simplification/SKILL.md:305 — "\"This abstraction might be useful later\" | Don't preserve speculative abstractions. If it's not used now, it's complexity without value. Remove it and re-add when needed."
- classification: mechanical
- target: structure_check.py / jscpd
- detection: an exported function, class, or type with no call site in the repo and no test — fallow's `unused-exports` rule already covers this in JS/TS (`docs/enforcement.md` lists it at warn). Recorded because the source states the *policy* (remove, don't preserve), which argues for error rather than warn on the branch's own additions.
- fail: a new `formatDateISO()` export with zero callers.
- pass: the helper used at least once, or tested directly.
- false positives: a package's public API, where exports are the product; needs a library-mode exemption.
- effort: S

### no-unscoped-refactor-in-a-feature-commit
- source: skills/code-simplification/SKILL.md:307 — "\"I'll refactor while adding this feature\" | Separate refactoring from feature work. Mixed changes are harder to review, revert, and understand in history." (red flag at :317 — "Refactoring code outside the scope of the current task without being asked"; exit criterion at :327 — "The diff is clean — no unrelated changes mixed in")
- classification: mechanical
- target: pre-push script
- detection: a commit labelled `feat:`/`fix:` whose diff touches files that no task names and whose changes there are structural (a rename, a reordering, a signature change with call-site updates) rather than required. Overlaps `never-mix-formatting-with-behavior` (batch-GOV) but is broader: any refactor, not only formatting.
- fail: `feat: add CSV export` also reordering imports across eight files.
- pass: the feature commit, then a separate `refactor:` commit.
- false positives: a rename required by the feature (a type the feature introduces); needs the touched files to be unrelated to the task.
- effort: L

### no-batched-simplifications-in-one-commit
- source: skills/code-simplification/SKILL.md:316 — "Batching many simplifications into one large, hard-to-review commit" (exit criterion at :326 — "Each simplification is a reviewable, incremental change")
- classification: mechanical
- target: pre-push script
- detection: a refactor commit whose diff contains more than N independent structural changes — approximated by the number of distinct functions whose bodies changed, or by the changed-line count with a lower threshold than the Rule of 500.
- fail: one commit simplifying 14 functions.
- pass: one commit per simplification, or a codemod that names itself.
- false positives: a mechanical codemod; exempt when the commit body names the tool.
- effort: M

### no-dead-code-left-behind-by-a-refactor
- source: skills/code-simplification/SKILL.md:330 — "No dead code was left behind (unused imports, unreachable branches)"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: after a refactor diff, an import or local binding the branch itself orphaned (the declaration is untouched but its last consumer was removed by this branch). `no-unused-vars` catches the resulting state; the branch-scoped version is what makes it fair to fail on.
- fail: a refactor removing the last call to `legacyParse` but leaving the import.
- pass: the import removed in the same commit.
- false positives: a binding used only in a type position, which some configs miss; needs the type-aware variant.
- effort: S

## skills/api-and-interface-design/SKILL.md  (367 lines read)
verdict: 14 candidates. The idempotency-key section (:156-215) is the most precisely specified block in
the corpus — it names four wrong key derivations, a TOCTOU race, a payload guard, and a retention
rule, each with a code pair.

### single-error-response-shape
- source: skills/api-and-interface-design/SKILL.md:68 — "interface APIError {" and :70 — "code: string;        // Machine-readable: \"VALIDATION_ERROR\"" (the shape is lines 66-74; red flag at :341; exit criterion at :357)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: every error response body must be `{ error: { code, message } }`. Flag `res.json({ message })`, `res.json({ error: 'string' })`, and a handler that returns a bare string. The shape is given verbatim, so this is a structural check over response calls.
- fail: `res.status(400).json({ message: 'bad input' })`
- pass: `res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid task data' } })` as at :97-103.
- false positives: a non-REST surface (GraphQL errors, a tRPC shape) where the framework dictates the envelope; the rule needs a per-transport exemption.
- effort: M

### status-codes-follow-the-stated-mapping
- source: skills/api-and-interface-design/SKILL.md:77 — "// 400 → Client sent invalid data" — "// 400 → Client sent invalid data / // 401 → Not authenticated / // 403 → Authenticated but not authorized / // 404 → Resource not found / // 409 → Conflict (duplicate, version mismatch) / // 422 → Validation failed (semantically invalid) / // 500 → Server error (never expose internal details)"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a seven-row mapping. The checkable findings: a schema-validation failure returning 400 instead of 422 (the skill's own example at :97 uses 422), an authorization failure returning 401 instead of 403, and a 500 whose body carries internals. The first two are decidable from the code path that produces the response.
- fail: `if (!result.success) return res.status(400).json(...)` for a schema parse failure.
- pass: `422` as at :97.
- false positives: a framework that maps errors centrally; needs to see the error middleware.
- effort: M

### validation-only-at-boundaries
- source: skills/api-and-interface-design/SKILL.md:113 — "API route handlers (user input)" and :121 — "Between internal functions that share type contracts" (the two lists are lines 112-123; red flag at :342; exit criterion at :358)
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: a schema parse or a manual guard inside a function that receives already-typed parameters from an internal caller — i.e. validation in a service/util that is not a route handler, form handler, external-response parser, or env loader (the four allowed sites at :113-116). Requires the import graph to know whether a caller is a boundary.
- fail: `createTask()` re-validating `input.title` after the route already parsed `CreateTaskSchema`.
- pass: validation at the route, with internal code trusting the types (:106 — "After validation, internal code trusts the types").
- false positives: a public library function that must validate its own inputs, which is a boundary in its own right; needs a library-mode exemption.
- effort: L

### public-interface-changes-are-additive-and-optional
- source: skills/api-and-interface-design/SKILL.md:134 — "priority?: 'low' | 'medium' | 'high';  // Added later, optional" and :142 — "priority: number;         // Changed from string — breaks existing consumers" (the Good/Bad pair is lines 130-143; red flag at :343; exit criterion at :360)
- classification: mechanical
- target: pre-push script
- detection: a diff that removes a field from a public interface, tightens its type (widening an optional to required, narrowing a union), or changes its type. Compared against the base branch, this is exactly the "no-worse than base" shape `structure_check.py` already uses — here the metric is the public contract's field set rather than complexity.
- fail: `priority: 'low'|'medium'|'high'` changed to `priority: number` as at :142.
- pass: a new optional field added as at :134-135.
- false positives: a pre-1.0 interface with no consumers; needs an exemption for internal-only types.
- effort: L

### rest-paths-use-plural-nouns-with-no-verbs
- source: skills/api-and-interface-design/SKILL.md:148-154 — "| REST endpoints | Plural nouns, no verbs | `GET /api/tasks`, `POST /api/tasks` |" (red flag at :345 — "Verbs in REST URLs (`/api/createTask`, `/api/getUsers`)"); the worked resource table is at :221-230
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a route path containing a verb segment (`create`, `get`, `update`, `delete`, `fetch`, `list`, `add`, `remove`) or a singular resource noun where the convention is plural. The two counter-examples are given verbatim at :345.
- fail: `app.post('/api/createTask', …)`
- pass: `app.post('/api/tasks', …)` as at :223.
- false positives: a non-CRUD action that has no noun form (`/api/search`, `/api/login`), which REST convention allows as a controller-ish endpoint; the rule needs a verb allowlist for genuine actions.
- effort: M

### query-params-and-response-fields-are-camel-case
- source: skills/api-and-interface-design/SKILL.md:151 — "| Query params | camelCase | `?sortBy=createdAt&pageSize=20` |" — "| Query params | camelCase | `?sortBy=createdAt&pageSize=20` | / | Response fields | camelCase | `{ createdAt, updatedAt, taskId }` |"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a query parameter read with a snake_case name (`req.query.page_size`), or a response field key written in snake_case. The convention is stated with examples; the mechanical check is the key's casing against the repo's dominant style.
- fail: `req.query.page_size`
- pass: `req.query.pageSize` as at :151.
- false positives: a repo whose database columns are snake_case and which serialises them directly — that is the finding, not a false positive, but it needs a migration path; start at warn.
- effort: S

### boolean-fields-use-is-has-can-prefix
- source: skills/api-and-interface-design/SKILL.md:153 — "| Boolean fields | is/has/can prefix | `isComplete`, `hasAttachments` |"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a boolean-typed field or prop whose name does not start with `is`/`has`/`can`/`should` (`complete: boolean`, `attachments: boolean`). Decidable from the type annotation or the schema declaration.
- fail: `complete: boolean`
- pass: `isComplete: boolean` as at :153.
- false positives: a boolean whose natural name is a noun (`enabled`, `active`); the rule should accept a small allowlist rather than fail on `enabled`.
- effort: S

### enum-values-are-upper-snake
- source: skills/api-and-interface-design/SKILL.md:154 — "| Enum values | UPPER_SNAKE | `\"IN_PROGRESS\"`, `\"COMPLETED\"` |" (the same values appear in the filtering example at :257 — "GET /api/tasks?status=in_progress&assignee=user123")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a string-literal union or enum whose members are not UPPER_SNAKE (`'in_progress'` vs `'IN_PROGRESS'`). Note the internal inconsistency this rule exposes: the naming table at :154 says `"IN_PROGRESS"` while the query example at :257 uses `status=in_progress` and the discriminated-union example at :277 uses `type: 'in_progress'` — so the rule cannot be applied repo-wide without first resolving which surface it governs (wire values vs internal tags).
- fail: `type TaskStatus = 'in progress'`
- pass: `'IN_PROGRESS'` on the wire.
- false positives: internal discriminated-union tags, which are a different surface from the wire enum; the rule must scope to serialised values only.
- effort: M (and needs the inconsistency resolved first)

### idempotency-key-not-derived-from-an-attempt
- source: skills/api-and-interface-design/SKILL.md:163 — "crypto.randomUUID()                    // ✗ new key per attempt — every retry is a new charge" and :167 — "req.headers['idempotency-key']         // ✓ client generates once, reuses on retry" (the four examples are lines 163-168; red flag at :348)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an idempotency key expression containing `randomUUID()`, `uuid()`, `Date.now()`, `new Date()`, or `Math.random()` — three wrong derivations named verbatim with their consequences. Also flags a key built from a mutable value (`userId:amount`) where the intent is repeatable.
- fail: `const key = crypto.randomUUID();` on a payment path.
- pass: `req.headers['idempotency-key']` or `\`charge:v1:${orderId}\`` as at :167-168.
- false positives: a key for a genuinely one-shot operation; the rule should scope to a call site that charges/mutates (a payment or order call).
- effort: S

### idempotency-key-claimed-atomically
- source: skills/api-and-interface-design/SKILL.md:176 — "// ✗ TOCTOU: two concurrent retries both read \"not seen\", both charge" (the wrong form is lines 177-180, the correct form lines 182-190; red flag at :347; exit criterion at :364)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: an existence check on an idempotency key followed by an insert and an effect, in that order, inside one function. The AST shape is exact and the BAD/GOOD pair at :176-191 is the fixture. The GOOD form inverts it: insert first, catch the unique violation.
- fail: `if (!(await db.exists(key))) { await chargeCard(amount); await db.insert(key); }`
- pass: `try { await db.insert({ key, state: 'in_progress', requestHash }) } catch (e) { if (isUniqueViolation(e)) return replayOrReject(key); throw e; }`
- false positives: a `SELECT … FOR UPDATE` that genuinely serialises, which the rule should accept as atomic; needs to recognise the locking read.
- effort: M

### idempotency-key-payload-guard
- source: skills/api-and-interface-design/SKILL.md:198 — "if (existing.requestHash !== hash(req.body)) {" (the guard is lines 198-200; red flag at :349; exit criterion at :365)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a handler that stores and replays an idempotency key without ever comparing a stored request hash to the incoming body. The absence of a `requestHash`-style comparison in a replay path is the finding; the source supplies the exact guard and the 422 response.
- fail: a replay path that returns the stored response for any body with the same key.
- pass: the comparison at :198-200.
- false positives: an endpoint whose payload is not part of the intent (a heartbeat); needs a marker.
- effort: M

### idempotency-key-retention-outlives-the-retry-path
- source: skills/api-and-interface-design/SKILL.md:215 — "**Set retention from the longest retry chain**, not from disk cost. Keys must outlive every path that can re-deliver the same intent, including a dead-letter queue replayed a week later and any provider dispute window. A 24-hour key TTL behind a 7-day DLQ is a duplicate waiting to happen." (red flag at :350; exit criterion at :367)
- classification: mechanical
- target: pre-push script
- detection: a numeric comparison between the idempotency key TTL and the longest re-delivery window the repo declares (a DLQ retention, a provider dispute window). The source gives the exact failing example — 24h TTL vs 7d DLQ. Both values are configuration, so the check is a two-config comparison.
- fail: `idempotencyTtl: '24h'` with `dlqRetention: '7d'`.
- pass: the TTL at or above the DLQ retention.
- false positives: a repo with no DLQ and no dispute window, where the TTL is bounded by something else; the rule should require at least one declared re-delivery window before firing.
- effort: M

### third-party-responses-are-validated-before-use
- source: skills/api-and-interface-design/SKILL.md:115 — "External service response parsing (third-party data -- **always treat as untrusted**)" and :118 — "**Third-party API responses are untrusted data.** Validate their shape and content before using them in any logic, rendering, or decision-making." (red flag at :346)
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: a response from an outbound HTTP call used directly (a property read, a render, a branch) with no intervening schema parse. Same dataflow shape as `llm-output-is-untrusted-input` (batch D), applied to any external service rather than an LLM.
- fail: `const user = await fetch(idp).then(r => r.json()); return user.email;`
- pass: `const user = ExternalUserSchema.parse(await res.json());`
- false positives: a typed client generated from an OpenAPI schema, which validates structurally; needs to recognise generated clients.
- effort: L
