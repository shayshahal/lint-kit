# 15 Frontend Ui And Increments

skills/frontend-ui-engineering and skills/incremental-implementation.

---

# batch-C2 — frontend-ui-engineering and incremental-implementation

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent (rule-bearing
sections read in full: frontend-ui 20-340, incremental 89-245).

## skills/frontend-ui-engineering/SKILL.md  (340 lines; sections 20-340 read in full)
verdict: 13 candidates. Two of its rules are numeric (a 200-line component ceiling and four named
breakpoints) and several map directly onto lint-kit's existing `svelte-skills` and
`tailwind-patterns` sets.

### component-line-ceiling
- source: skills/frontend-ui-engineering/SKILL.md:322 — "Components with more than 200 lines (split them)"
- classification: mechanical
- target: eslint:svelte-skills
- detection: a component file (`.svelte`, `.tsx`, `.jsx`, `.vue`) whose line count exceeds 200. The threshold is stated. Distinct from `structure_check.py`'s function complexity and from the ~1000-line file boundary in `code-review-and-quality` — this is a component-specific ceiling an order of magnitude lower.
- fail: a 460-line `TaskList.svelte`.
- pass: a 180-line component.
- false positives: a component with a large static template or a big style block; the rule should count script+markup and allow a documented exemption.
- effort: S

### no-inline-styles-or-arbitrary-values
- source: skills/frontend-ui-engineering/SKILL.md:323 — "Inline styles or arbitrary pixel values" (the worked pair at :150-153 — "/* Good */  padding: 1rem;      /* 16px */ … /* Bad */   padding: 13px;      /* Not on any scale */ /* Bad */   margin-top: 2.3rem; /* Not on any scale */")
- classification: mechanical
- target: eslint:tailwind-patterns
- detection: two shapes — a `style={{ … }}` prop (or an inline `style="…"`) on a component that has a class-based design system, and a spacing value not on the project's scale (`13px`, `2.3rem`, or the Tailwind arbitrary form `p-[13px]`). The two BAD examples are given verbatim.
- fail: `className="p-[13px]"` or `style={{ marginTop: '2.3rem' }}`
- pass: `className="p-4"` / `gap-3` as at :150-151.
- false positives: a dynamic value that genuinely cannot be a class (a computed transform); needs a marker.
- effort: M

### color-tokens-not-raw-hex
- source: skills/frontend-ui-engineering/SKILL.md:172 — "Use semantic color tokens: `text-primary`, `bg-surface`, `border-default` — not raw hex values"
- classification: mechanical
- target: eslint:tailwind-patterns
- detection: a raw hex or `rgb()` colour in a class, style, or CSS declaration where the project declares design tokens. The three token names are given as the expected form.
- fail: `className="text-[#5b21b6]"`
- pass: `className="text-primary"`
- false positives: a token definition file itself, and a third-party brand colour with no token; both need an exemption.
- effort: M

### avoid-the-ai-aesthetic-defaults
- source: skills/frontend-ui-engineering/SKILL.md:135 — "Purple/indigo everything" and :137 — "Rounded everything (rounded-2xl)" (the eight-row table is lines 133-142; red flag at :327)
- classification: mechanical
- target: eslint:tailwind-patterns
- detection: an eight-row table of named defaults, of which four are literal class patterns: `indigo-*`/`purple-*`/`violet-*` as the dominant palette, `bg-gradient-to-*` with more than a subtle ramp, `rounded-2xl`/`rounded-3xl` applied uniformly to every container, and `shadow-2xl`/layered shadows. Each is a string match; the finding is the *dominance* (a count across the diff) rather than a single occurrence.
- fail: a new page where every container is `rounded-2xl shadow-xl bg-gradient-to-r from-indigo-500`.
- pass: tokens from the project's palette with a consistent radius.
- false positives: a project whose actual brand *is* indigo; the rule must compare against the design tokens rather than hardcode a colour as wrong.
- effort: M

### empty-error-and-loading-states-are-handled
- source: skills/frontend-ui-engineering/SKILL.md:324 — "Missing error states, loading states, or empty states" and :337 — "Loading, empty, error, success, and permission states handled when applicable" (the worked empty state is lines 235-250)
- classification: mechanical
- target: eslint:svelte-skills
- detection: a component that renders a collection (`tasks.map(...)`, `{#each}`) with no branch for the empty case, and a data-fetching container with no loading and no error branch. The source's own container at :81-89 shows the three branches; their absence is the finding. The empty-state example carries `role="status"` at :240, which links this to the a11y rules.
- fail: `{#each tasks as task}<TaskItem … />{/each}` with no `{#if tasks.length === 0}`.
- pass: the container at :81-89.
- false positives: a component that always receives a non-empty list by construction; needs the caller to be checked.
- effort: M

### dialog-manages-focus
- source: skills/frontend-ui-engineering/SKILL.md:214-230 — "// Move focus when content changes … useEffect(() => { if (isOpen) closeRef.current?.focus(); }, [isOpen]); // Trap focus inside dialog when open" (the same requirement in the accessibility checklist at references/accessibility-checklist.md:22 — "Modals trap focus while open, return focus on close")
- classification: mechanical
- target: eslint:svelte-skills
- detection: a dialog/modal component with no focus call on open and no focus return on close, or one using a `<div role="dialog">` rather than the native `<dialog>` element (the source's own example uses `<dialog open={isOpen}>` at :225). Two findings.
- fail: a `<div role="dialog">` with no `useEffect` focusing anything.
- pass: the component at :216-230.
- false positives: a component that delegates focus to a library primitive; needs to see the import.
- effort: M

### loading-uses-skeletons-with-aria-busy
- source: skills/frontend-ui-engineering/SKILL.md:272 — "// Skeleton loading (not spinners for content)" (the skeleton at :273-280, which carries `aria-busy="true" aria-label="Loading tasks"` at :275)
- classification: mechanical
- target: eslint:svelte-skills
- detection: a content-loading branch that renders a spinner where a skeleton is available, and a loading container with no `aria-busy`. The source gives the correct form with both attributes.
- fail: `<Spinner />` for a list load.
- pass: the skeleton at :273-280.
- false positives: a short action (a button submit) where a spinner is right; scope to content regions.
- effort: M

### optimistic-update-rolls-back-on-error
- source: skills/frontend-ui-engineering/SKILL.md:283 — "// Optimistic updates for perceived speed" — "// Optimistic updates for perceived speed … onMutate: async (taskId) => { … return { previous }; } … onError: (_err, _taskId, context) => { queryClient.setQueryData(['tasks'], context?.previous); }"
- classification: mechanical
- target: eslint:svelte-skills
- detection: a mutation with an `onMutate` that writes optimistic state but no `onError` that restores it (or one that snapshots without returning the snapshot). The source's example returns `{ previous }` and restores it in `onError` — the two halves are the rule.
- fail: an `onMutate` that sets the new value with no `onError` handler.
- pass: the pair at :289-301.
- false positives: a mutation whose failure cannot occur locally; needs a marker.
- effort: M

### responsive-breakpoints-are-tested
- source: skills/frontend-ui-engineering/SKILL.md:267 — "Test at these breakpoints: 320px, 768px, 1024px, 1440px." (exit criterion at :336 — "Responsive: works at 320px, 768px, 1024px, 1440px")
- classification: mechanical
- target: pre-push script
- detection: four named viewport widths. The checkable form is a visual-regression or E2E configuration whose viewport matrix covers all four; a project testing only at desktop widths is the finding. The numbers are stated.
- fail: a Playwright config with a single 1280px viewport.
- pass: a matrix over the four widths.
- false positives: a desktop-only internal tool; needs an exemption.
- effort: M

### component-files-are-colocated
- source: skills/frontend-ui-engineering/SKILL.md:24 — "Colocate everything related to a component:" (the layout at :26-34)
- classification: mechanical
- target: pre-push script
- detection: a component's test, styles, hook, and types placed outside its own directory when the repo's dominant convention is colocation. Computable from the repo's own distribution of component paths, the same shape as `test-file-location-follows-convention` in batch E.
- fail: `src/components/TaskList.tsx` with its test in a top-level `tests/` directory while every other component colocated.
- pass: the layout at :26-34.
- false positives: a repo with a deliberate central test tree; the rule must derive the convention from the majority.
- effort: M

### composition-over-configuration
- source: skills/frontend-ui-engineering/SKILL.md:38 — "**Prefer composition over configuration:**" (the Avoid example at :52-57 — "<Card title=\"Tasks\" headerVariant=\"large\" bodyPadding=\"md\" content={<TaskList tasks={tasks} />} />")
- classification: heuristic-only
- target: eslint:svelte-skills
- detection: a component whose props are all rendering configuration (`variant`, `padding`, `headerVariant`) and whose content is passed through a `content`/`children` prop, where sibling components in the repo use composition. The heuristic is the ratio of presentational props to data props.
- fail: the call site at :52-57.
- pass: the composable form at :42-49.
- false positives: a design-system primitive that is intentionally configurable; needs to be scoped to application components.
- effort: L

### data-fetching-separated-from-presentation
- source: skills/frontend-ui-engineering/SKILL.md:77 — "**Separate data fetching from presentation:**" (the container/presentation pair at :79-98)
- classification: heuristic-only
- target: eslint:svelte-skills
- detection: a component that both fetches (`useQuery`, a `fetch`, a store subscription) and renders a list, where the repo separates the two. Detectable as a component whose imports include both a data hook and a presentational child.
- fail: a `TaskList` that calls `useTasks()` and maps the result.
- pass: the split at :81-98.
- false positives: a small app where the split is overhead; the source states the pattern without a size condition, so this should be a flag rather than an error.
- effort: L

## skills/incremental-implementation/SKILL.md  (249 lines; sections 89-245 read in full)
verdict: 11 candidates. The file is a rule list with an explicit numeric threshold (:226) and a
checklist whose commands are named per stack (:203-209).

### no-large-change-without-a-test-run
- source: skills/incremental-implementation/SKILL.md:226 — "More than 100 lines of code written without running tests"
- classification: mechanical
- target: pre-push script (transcript or commit boundary)
- detection: a commit or agent turn that adds more than 100 lines of non-test source with no recorded test invocation since the previous commit. The threshold is stated; the recorded-command half is available in a transcript, and the commit-boundary approximation is "a commit over 100 added lines whose branch has not run the suite".
- fail: a 340-line commit with no test run in the transcript.
- pass: increments under 100 lines, or a test run before the commit.
- false positives: a generated file or a migration; needs a path allowlist.
- effort: M

### every-commit-leaves-the-tree-green
- source: skills/incremental-implementation/SKILL.md:145 — "After each increment, the project must build and existing tests must pass. Don't leave the codebase in a broken state between slices." (red flag at :230 — "Build or tests broken between increments")
- classification: mechanical
- target: pre-push script
- detection: a bisectability check — every commit on the branch must pass the build and test commands. The mechanical form is running the suite at each commit on the branch (a `git bisect run`-style pass) or, cheaply, asserting that no commit touches source without the suite having been run before the next commit.
- fail: commit 4 of 7 fails `pnpm build`.
- pass: every commit green.
- false positives: an intentionally broken intermediate commit in a stacked series; needs a marker.
- effort: L

### incomplete-features-ship-behind-a-flag
- source: skills/incremental-implementation/SKILL.md:149 — "If a feature isn't ready for users but you need to merge increments:" and :220 — "If the feature isn't complete, it shouldn't be user-visible. Add the flag now." (the flag pattern is lines 151-158)
- classification: heuristic-only
- target: pre-push script
- detection: a merged increment that adds a user-reachable path (a route, a rendered component) which no task marks complete in `tasks/plan.md`, with no feature-flag guard. The flag usage itself is mechanical (`process.env.FEATURE_*`, a flag call); deciding the feature is incomplete needs the plan.
- fail: a half-built `/sharing` route merged with no flag.
- pass: the guarded form at :151-158.
- false positives: a complete increment; needs the plan's task state.
- effort: L

### safe-defaults-are-opt-in
- source: skills/incremental-implementation/SKILL.md:164 — "New code should default to safe, conservative behavior:" (the example at :166-171 — "export function createTask(data: TaskInput, options?: { notify?: boolean }) { const shouldNotify = options?.notify ?? false;")
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a new boolean option or config key whose default enables the riskier behaviour — `options?.notify ?? true`, `enabled = true` on a new feature, a new env var read with a truthy fallback. The source's example shows the correct direction (`?? false`).
- fail: `const shouldNotify = options?.notify ?? true;`
- pass: the example at :168-169.
- false positives: a default that is safe because the operation is idempotent; needs a per-option judgement.
- effort: M

### migrations-have-a-rollback
- source: skills/incremental-implementation/SKILL.md:180 — "Database migrations should have corresponding rollback migrations" (the rollback-friendly rules at :178-181)
- classification: mechanical
- target: pre-push script
- detection: a migration file with no corresponding `down`/`rollback` (a Rails-style `down`, an alembic `downgrade()`, a Prisma/raw `DROP` companion). Presence check on the migration pair, which most frameworks' file conventions make decidable.
- fail: an alembic revision with `pass` in `downgrade()`.
- pass: a real `downgrade()`.
- false positives: an additive-only migration where the rollback is trivially a drop; needs to accept a documented no-op.
- effort: M

### no-delete-and-replace-in-one-commit
- source: skills/incremental-implementation/SKILL.md:181 — "Avoid deleting something in one commit and replacing it in the same commit — separate them"
- classification: mechanical
- target: pre-push script
- detection: a single commit that removes a declaration and adds its replacement. The AST/diff shape is exact: a deletion and an addition of a similarly-named symbol in the same commit.
- fail: `refactor: rename parse() to parseInput()` in one commit.
- pass: the addition first, then the removal after callers migrate.
- false positives: a rename where the old name is referenced nowhere else, so the two-step adds no safety; needs the "any remaining reference" check to decide.
- effort: M

### no-abstraction-before-the-third-use
- source: skills/incremental-implementation/SKILL.md:232 — "Building abstractions before the third use case demands it" (the rule at :113 — "Three similar lines of code is better than a premature abstraction."; the worked pairs at :103-110)
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a new abstraction (a generic helper, a config-driven builder, a factory) with fewer than three call sites. This is the *single-use function* measure the source repo's own `slop-patterns` plugin tried and **dropped** — its README records that a single-use function is mostly a framework route handler or lifecycle hook. The three-use threshold is the delta that would have made it work, and the worked counter-examples at :103-110 are the fixtures.
- fail: a `Generic EventBus with middleware pipeline for one notification` as at :103.
- pass: the simple function call at :104.
- false positives: a framework-required single-use function; the plugin's existing path exclusions (`src/params/`, test files) are the precedent.
- effort: L

### no-one-time-utility-file
- source: skills/incremental-implementation/SKILL.md:234 — "Creating new utility files for one-time operations"
- classification: mechanical
- target: oxlint:slop-patterns
- detection: a new file under a `utils/`/`lib/`/`helpers/` directory exporting exactly one function that has exactly one caller. A file-level version of the rule above, and narrower — it fires only when the new file is in a shared-utility location.
- fail: `src/utils/formatCsvRow.ts` with one caller.
- pass: the function inline at its call site, or a second caller.
- false positives: a util deliberately split out for testing; needs a test-reference exemption.
- effort: M

### noticed-but-not-touching-is-recorded
- source: skills/incremental-implementation/SKILL.md:126 — "If you notice something worth improving outside your task scope, note it — don't fix it:" and :129 — "NOTICED BUT NOT TOUCHING:" (the block is lines 129-133)
- classification: mechanical
- target: pre-push script
- detection: a diff that touches files outside the task's declared set *and* whose PR body contains no `NOTICED BUT NOT TOUCHING` block. The marker is literal; the pairing with the out-of-scope diff is what makes it a rule rather than a style note.
- fail: an out-of-scope edit with no block.
- pass: the block at :129-133 with the change left alone.
- false positives: a legitimate out-of-scope change the user asked for; needs the user instruction recorded.
- effort: M

### increment-checklist-commands-are-run
- source: skills/incremental-implementation/SKILL.md:203 — "- [ ] The change does one thing and does it completely" — "- [ ] The change does one thing and does it completely / - [ ] All existing tests still pass (the repository's test command: `npm test`, `./gradlew test`, `pytest`, ...) / - [ ] The build succeeds (the repository's build command) / - [ ] Type checking passes, where the stack has one (`npx tsc --noEmit`, `mypy`, ...) / - [ ] Linting passes (the repository's lint command)"
- classification: mechanical
- target: pre-push script
- detection: four commands that must have run against the increment — test, build, type check, lint — with the stack-specific forms named. This is the same gate set as `every-pr-passes-lint-typecheck-tests-build` in batch-GOV and `all-eight-quality-gates-present` in batch A2, applied per increment rather than per PR.
- fail: an increment committed after only `pnpm test`.
- pass: all four run.
- false positives: a language with no type checker (:206 says "where the stack has one"); needs the per-stack reduction.
- effort: M

### no-scope-expansion-mid-increment
- source: skills/incremental-implementation/SKILL.md:228 — "\"Let me just quickly add this too\" scope expansion" (red flag at :233 — "Touching files outside the task scope \"while I'm here\"")
- classification: heuristic-only
- target: pre-push script
- detection: a diff whose touched files exceed the task's declared `Files likely touched` list, where the extra files are not required by the change. Same shape as `changes-scoped-to-the-task` in batch E2 and `no-unscoped-refactor-in-a-feature-commit` in batch A1; recorded here from the increment side.
- fail: a rate-limiting increment that also fixes a typo in the README and reorders imports.
- pass: the declared file set.
- false positives: a file the task genuinely needed but the plan missed; needs a "discovered" allowance.
- effort: L
