# structure

A dampener, not a threshold. Before each push it compares the branch with the code at its base and
fails only on what the branch made worse: a new over-complex function, a function that got more
complex, new duplication, new dead code. What the base already had never fails a push, however
bad it is.

Why it works this way: agent-written code gets a little worse with each change while the tests
stay green ([SlopCodeBench](https://arxiv.org/abs/2603.24755),
[CodeThread](https://arxiv.org/abs/2606.21804)). A fixed limit over the whole repository doesn't
help: the complexity numbers alone didn't predict later failures, and agents learn to game them.
Comparing with the base and gating only the difference is HumanLayer's "dampener"
(design-control-loop): each change has to leave the structure no worse than it found it.

`lint-kit init` adds two lefthook pre-push steps, one per language, and both compare with the same
base.

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
lint-kit-fallow:
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

## Python: lint-kit-structure

```yaml
lint-kit-python-structure:
  glob: 'backend/*.py'
  root: 'backend/'
  run: uv run lint-kit-structure --base origin/dev app
```

```
app/services/order_service.py:3583 trial_grade: complexity 15, new (max 10)
app/services/order_service.py:3564-3580 duplicates app/services/order_service.py:100-116 (17 lines), new
lint-kit-structure: 2 structure regression(s) since origin/dev (b170a4fca). Split the function or extract the shared code; what was already there does not count.
```

It checks the given folders (the FastAPI app package when `init` finds one) and does nothing when
the branch changed no `.py` file in them.

- **Complexity** of each function in the `.py` files the branch changed, at base and now, with
  mccabe (the measure ruff's C901 copies). It fails on a new function over the limit, a function
  that crossed it, and a function already over it that grew. A function already over the limit
  that stayed the same or got simpler passes. The limit is `max-complexity` in
  `[tool.lint-kit-structure]` (default 10). It only applies to functions the branch changed, so
  don't add C901 with a global `max-complexity` instead: that fails on everything already there.
- **Duplication** with [jscpd](https://github.com/kucherenko/jscpd), over the folders as they are
  and as they were at base. A clone fails when it wasn't at base **and** most of one of its copies
  is code the branch added. Moving duplicated code to another file passes. So does an
  edit made to both copies of an existing clone, or an old clone that grew by a token at its edge
  (appending a function after it does that). A third copy of an existing clone fails.

jscpd and not pylint's duplicate-code: pylint only compares one file with another, so it misses a
function copied within the same file. That's the most common kind: on JewelryX's backend, 69 of
the 87 clones jscpd found were within one file. `init` adds jscpd as a dev dependency;
lint-kit-structure looks for it in `node_modules/.bin` from the Python folder up to the
repository root, then on PATH.

```toml
[tool.lint-kit-structure]
max-complexity = 10
```

## Time

Measured on a JewelryX branch (22 commits, 116 changed files, 249 backend files):
- **lint-kit-structure:** about 0.9s.
- **fallow audit:** about 2.5s once warm. The first runs in a worktree took 8–12s, while fallow
  built its caches and the base worktree.
- **fallow review --brief:** about 9s; it isn't a pre-push step.
