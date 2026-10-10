# 17 Remaining Files

The last files the coverage reconciliation found unread: the optimization-patterns reference, idea-refine's supporting docs, a host guide, and the repo-root dotfiles.

---

# batch-F — the remaining files (optimization-patterns, idea-refine supporting docs, host guide, repo root files)

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent. This batch
closes the last gaps the coverage reconciliation found.

## skills/performance-optimization/references/optimization-patterns.md  (250 lines; the seven worked patterns read in full)
verdict: 4 candidates. Mostly restates the parent skill; the deltas are below.

### unbounded-fetch-is-the-named-bad-form
- source: skills/performance-optimization/references/optimization-patterns.md:26 — "const allTasks = await db.tasks.findMany();" and :29 — "const tasks = await db.tasks.findMany({" (the BAD/GOOD pair is lines 25-33)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: the same rule as `list-endpoint-pagination` in batch D and `no-select-star-and-list-queries-paginate` in batch E4, but this file supplies the exact BAD/GOOD pair as a fixture. The GOOD form also requires `orderBy`, which is the stable-order half.
- fail: `const allTasks = await db.tasks.findMany();`
- pass: the block at :29-33.
- false positives: a bounded lookup by id; the rule requires the result to be a collection.
- effort: M

### cache-layer-chosen-deliberately
- source: skills/performance-optimization/references/optimization-patterns.md:209 — "| In-process (`Map`, LRU) | One instance | Small, hot, per-instance staleness is acceptable | Each instance drifts independently; invalidation reaches only one |" (the three-row table is lines 207-211)
- classification: heuristic-only
- target: oxlint:slop-patterns
- detection: a shared cache (`redis.set`) in a single-instance service, or an in-process cache in a service that runs more than one instance while the value must be consistent — the two mismatches the table names. Detecting the instance count needs the deploy config, so this is a pre-push check rather than an AST rule.
- fail: an in-process `Map` cache for a permission set in a five-replica service.
- pass: the layer matching the table's "use when" column.
- false positives: a value where per-instance drift is genuinely fine (the table's own condition for in-process); needs the value's class.
- effort: L

### cache-invalidation-strategy-is-singular
- source: skills/performance-optimization/references/optimization-patterns.md:240 — "**Choose one invalidation strategy, not three:**" (the three-row table at :242-246)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a cache that mixes strategies — a TTL *and* a versioned key *and* an event invalidation on the same key space. The source's "not three" phrasing makes the count the rule. The three strategies are named with their trade-offs.
- fail: a key that is versioned, TTL'd, and explicitly invalidated on write.
- pass: one of the three, as at :244-246.
- false positives: a TTL as a backstop behind an event invalidation, which is a common defensive pattern; the rule should allow one primary plus one backstop.
- effort: M

### nothing-cached-whose-staleness-is-a-correctness-bug
- source: skills/performance-optimization/references/optimization-patterns.md:250 — "**Do not cache:** anything whose staleness is a correctness bug (balances, permissions, inventory at checkout), or per-user data under a key that does not identify the user."
- classification: mechanical
- target: oxlint:slop-patterns
- detection: two findings — a cache read/write whose loader touches a named correctness-critical concept (`balance`, `permission`, `inventory`, `stock`, `quota`), and a per-user value cached under a key with no user/tenant component. The first is a name match; the second is the key-composition rule from batch D2 with a sharper trigger.
- fail: `cache.set('inventory', await countStock(sku))`
- pass: the value read from the source each time, or cached under a tenant-scoped key.
- false positives: a short-TTL cache of a balance used only for display; needs the read path to be checked.
- effort: M

## skills/idea-refine/examples.md  (238 lines; the "What to Notice" section read in full, the three worked sessions scanned)
verdict: 2 candidates. The file is three worked transcripts; its normative content is the eight
observations at the end, two of which are checkable properties of the output.

### variations-state-the-lens-that-generated-them
- source: skills/idea-refine/examples.md:228 — "**Variations have reasons.** Each one explains *why* it exists (what lens generated it), not just *what* it is. The label (Inversion, Simplification, etc.) teaches the user to think this way themselves."
- classification: mechanical
- target: md-lint
- detection: every variation in the one-pager must carry a reason and, where the framework was used, a named lens. The lens names come from `frameworks.md` (SCAMPER, HMW, First Principles, JTBD, Constraint-Based, Pre-mortem, Analogous Inspiration — its :5-88), so the set is closed.
- fail: a bare bullet list of six ideas.
- pass: each variation with its lens and rationale, as in the worked sessions.
- false positives: a variation generated outside a framework; the reason is still required, the lens label is not.
- effort: M

### not-doing-items-are-specific-and-reasoned
- source: skills/idea-refine/examples.md:236 — "**The \"Not Doing\" list does real work.** It's specific and reasoned. Each item is something you might *want* to do but shouldn't yet."
- classification: heuristic-only
- target: md-lint
- detection: a `Not Doing` list whose items are generic (a placeholder like "other features") rather than specific deferred capabilities. The mechanical half is a length and specificity heuristic; the source's phrase "something you might want to do but shouldn't yet" is the test.
- fail: `- Other features`
- pass: a specific deferred item with a reason, as at :115-121.
- false positives: a short list where the exclusions genuinely are few; the rule should check specificity, not count.
- effort: M

## skills/idea-refine/frameworks.md  (99 lines read)
verdict: 1 candidate. Seven named ideation frameworks with their prompts.

### variations-span-more-than-one-framework
- source: skills/idea-refine/frameworks.md:5 — "## SCAMPER" and :19 — "## How Might We (HMW)" (the seven frameworks are at lines 5-88)
- classification: heuristic-only
- target: md-lint
- detection: a set of variations all generated by one lens — the source's own examples use several per session and label each. The seven framework names are a closed set, so the count of distinct lenses used is computable from the labels.
- fail: six variations all from SCAMPER.
- pass: variations drawn from two or more frameworks, as the examples show.
- false positives: a session where the user asked for one lens; needs the explicit request.
- effort: M

## docs/copilot-cli-setup.md  (64 lines; sections 5-57 scanned)
verdict: no mechanizable candidates. It is an install guide (Install, Verify, Usage,
Troubleshooting) whose only normative content is the per-host install command, which the
`other-hosts` and host-guide rules in batch-GOV already cover.

## .gitignore  (10 lines read)
verdict: no new candidates — it is the *object* of the `gitignore-covers-standard-exclusions` rule in
batch C1, and it already covers `node_modules/`, `.env`, `.env.*` (the `.env.local` pattern), and the
two hook caches. Note that it does **not** cover `dist/` or `*.pem`, which batch C1's rule would
report if the repo built to `dist/` or held key material — the repo does neither, so the rule passes
here. That is a useful confirmation that the rule's required set must be derived from the repo's own
artifacts rather than applied as a fixed five-item list.

## .gitattributes  (1 line read)
verdict: 1 candidate.

### line-endings-are-pinned
- source: .gitattributes:1 — "* text=auto eol=lf"
- classification: mechanical
- target: pre-push script
- detection: a repository with no `.gitattributes` line-ending policy, or one whose policy disagrees with the files on disk (CRLF committed). The single line `* text=auto eol=lf` is the whole rule, and the source repo ships it — which is itself the evidence that a Windows/macOS contributor mix motivated it. Detecting a committed CRLF byte in a text file is exact.
- fail: a `.ts` file with CRLF line endings in a repo with no `.gitattributes`.
- pass: `* text=auto eol=lf` plus LF on disk.
- false positives: a fixture that must keep CRLF (a test for a CRLF parser); needs a path-scoped negation.
- effort: S

## LICENSE  (read)
verdict: no mechanizable candidates — MIT text; the only checkable property (presence) is covered by
the manifest's `license` field and the source repo's own `validate-versions.js`-style manifest
consistency check.
