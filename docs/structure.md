# structure

A dampener, not a threshold. Before each push it compares the branch with the code at its base and
fails only on what the branch made worse: a new over-complex function, a function that got more
complex, new duplication, a new import cycle, new dead code. What the base already had never
fails a push, however bad it is.

Why it works this way: agent-written code gets a little worse with each change while the tests
stay green ([SlopCodeBench](https://arxiv.org/abs/2603.24755),
[CodeThread](https://arxiv.org/abs/2606.21804)). A fixed limit over the whole repository doesn't
help: the complexity numbers alone didn't predict later failures, and agents learn to game them.
Comparing with the base and gating only the difference is HumanLayer's "dampener"
(design-control-loop): each change has to leave the structure no worse than it found it.

`init` adds lefthook pre-push steps, fallow for JS / TS and `tools/python/structure_check.py` for
Python, and they all compare with the same base.

## The base

The branch this project's branches merge into. `init` takes it from, in order:

1. `--base <branch>` (`--base dev` means `origin/dev`);
2. the `--base` a structure step already has (a re-run keeps it);
3. the `origin/<branch>...HEAD` that lefthook's `pre-push.files` diffs against;
4. `origin/HEAD`;
5. `origin/main`.

It is written into the steps and into the `structure:brief` script, where it can be changed. Both
tools compare with the merge-base of HEAD and that branch, so new commits on the base branch are
never counted as the branch's own. Don't leave it to fallow's default: once a branch is pushed,
fallow compares it with its own upstream and finds almost nothing.

## JS / TS: fallow audit

```yaml
fallow:
  glob: ['*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,svelte,vue}', package.json, .fallowrc.json]
  env: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: worktree.useRelativePaths, GIT_CONFIG_VALUE_0: 'false' }
  run: pnpm exec fallow audit --base origin/dev
```

[fallow](https://docs.fallow.tools) checks dead code, complexity and duplication in the changed
files. A finding the branch introduced fails the push if its rule is `"error"`. A `"warn"`
finding is reported, and an inherited one is reported as inherited. When a project has no fallow
config, `init` writes a `.fallowrc.json`:
- the rule levels JewelryX gates every push with;
- cognitive complexity 25;
- CRAP off: without a coverage file, fallow estimates coverage and flags almost any untested
  function with more than six branches;
- the Python folder, Paraglide's output and `.svelte-check` ignored.

The file is the project's from then on, and `init` never rewrites it.

The `env` lines matter in a bare repository with its worktrees beside it, where
`worktree.useRelativePaths` is on. To check a branch, `audit` checks the base out in a temporary
worktree, and fallow 3.31 cannot create one with relative paths ("could not create a temporary
worktree for base ref"). In an ordinary clone they do nothing.

`pnpm structure:brief` (`fallow review --brief --base origin/dev`) runs the same analysis and
prints it as a "where to look" brief for a reviewer: risky files, contracts used outside the
diff, suppressions the branch added. It always exits 0.

## Python: structure_check.py

```yaml
python-structure:
  glob: 'backend/*.py'
  root: 'backend/'
  run: uv run python ../tools/python/structure_check.py --base origin/dev app
```

```
app/services/order_service.py:3583 trial_grade: complexity 15, new (max 10)
app/services/order_service.py:3564-3580 duplicates app/services/order_service.py:100-116 (17 lines), new
structure-check: 2 structure regression(s) since origin/dev (b170a4fca). Split the function or extract the shared code; what was already there does not count.
```

It checks the given folders (the FastAPI app package when `init` finds one) and does nothing when
the branch changed no `.py` file in them.

- **Complexity** of each function in the `.py` files the branch changed, at base and now, with
  mccabe (the measure ruff's C901 copies). It fails on a new function over the limit, a function
  that crossed it, and a function already over it that grew. A function already over the limit
  that stayed the same or got simpler passes. The limit is `max-complexity` in
  `[tool.structure-check]` (default 10). It only applies to functions the branch changed, so
  don't add C901 with a global `max-complexity` instead: that fails on everything already there.
- **Duplication** with [jscpd](https://github.com/kucherenko/jscpd), over the folders as they are
  and as they were at base. A clone fails when it wasn't at base **and** most of one of its copies
  is code the branch added. Moving duplicated code to another file passes. So does an
  edit made to both copies of an existing clone, or an old clone that grew by a token at its edge
  (appending a function after it does that). A third copy of an existing clone fails.
- **Import cycles**, over the modules the folders hold, at base and now. A cycle fails when no
  cycle at base contains all of its members, so one the branch grew counts and one it inherited,
  or left alone, does not. It is reported at the import that closed it, the way a clone is
  reported at the branch's own copy.

  Only the imports that run when a module is imported are edges. An import inside a function runs
  when that function is called, and one under `if TYPE_CHECKING:` never runs, so neither closes a
  cycle — both are how a cycle is deliberately broken, and counting them would be advice to undo
  the fix. On JewelryX's 251-module backend that is the difference between 3 cycles and 0.

  This is the Python half of what fallow reports as `circular-dependencies` for JS, which
  `init`'s `.fallowrc.json` gates by default. Worth knowing: the base pass is skipped when the
  branch's own tree has no cycle, so the usual cost is about 0.4s for 251 modules.

### The scores, reported and never gated

```
structure-check: scb-check scb-check==0.2.0 (report only, never fails a push)
app: verbosity 0.0140, erosion 0.6916, cognitive erosion 0.8647
  verbosity: 17 of 1215 SLOC flagged (clone 14, ast-grep 3, structural 0)
  erosion:   1914 of 2767 mass in 13 of 67 functions over complexity 10 (mass = cc x sqrt(sloc))
  cognitive: 3677 of 4252 mass in 19 of 67 functions
    heaviest over complexity 10 by mass, mccabe (a nested function counts into its parent):
    app/services/order_service.py:3581 trial_grade  complexity 37, 112 sloc
    app/services/checkout_service.py:886 _call  complexity 16, 74 sloc
```

`python tools/python/structure_check.py --score app` runs
[scb-check](https://github.com/gabeorlanski/scb-check) and prints the composites SlopCodeBench
records its own results with, so they are comparable with a published run. It pins the version
because the tool's rule set changes between releases, and an unpinned run makes verbosity
incomparable across runs. (scb-check's own source says exactly that.)

- **verbosity** is flagged SLOC over total SLOC, where a line is flagged if clone detection,
  an ast-grep slop rule, or a structural rule hit it. All 197 bundled ast-grep rules are
  `language: python`, and scb-check's README says non-Python languages contribute clone lines
  only, so on a JS/TS project this number is duplication and nothing else.
- **erosion** is the share of function mass (`cc × √sloc`) sitting in functions over complexity
  10; **cognitive erosion** is the same on cognitive complexity. Note that the ordinary
  `--base` check already fails a *new* function over complexity 10 — erosion is the same
  measurement as a repo-wide ratio rather than a per-function gate.

`--score` never fails. It is not a pre-push step either: the first `uvx` run downloads
scb-check's dependencies. It is the Python counterpart of `pnpm structure:brief`, and for the
same reason — a repo-wide ratio moves for things a diff cannot see, so it is something to
compare two runs with, not something to fail one on.

The list underneath the numbers is the part that earns its place. The `--base` check only ever
walks the files a branch changed, so it can never name a function that was already heavy — the
inherited complexity is permanently outside what a dampener may say anything about. This is the
only place in the set that names it, and it is the same measure the gate uses, so the two agree.

Two things to know about reconciling the list with the line above it:

- The counts differ by design. scb-check parses with tree-sitter and sees a nested function as
  its own symbol; mccabe folds a nested function's decisions into the one that encloses it, the
  way it treats a closure, so one entry in the list can stand for several of scb-check's
  symbols. The list's partition is the unit you would actually split.
- The thresholds can differ. The gate's limit is `max-complexity` from `[tool.structure-check]`
  (default 10, and the list uses it too), while scb-check hardcodes 10. Set `max-complexity` to
  15 and the line above still counts functions over 10.

jscpd and not pylint's duplicate-code: pylint only compares one file with another, so it misses a
function copied within the same file. That's the most common kind: on JewelryX's backend, 69 of
the 87 clones jscpd found were within one file. `init` adds jscpd as a dev dependency;
structure_check.py looks for it in `node_modules/.bin` from the Python folder up to the
repository root, then on PATH.

```toml
[tool.structure-check]
max-complexity = 10
```

## Time

Measured on a JewelryX branch (22 commits, 116 changed files, 249 backend files):
- **structure_check.py:** about 0.9s, about 1.3s with the import-cycle pass.
- **fallow audit:** about 2.5s once warm. The first runs in a worktree took 8–12s, while fallow
  built its caches and the base worktree.
- **fallow review --brief:** about 9s; it isn't a pre-push step.
