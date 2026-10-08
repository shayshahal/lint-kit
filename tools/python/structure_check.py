"""Fail when a branch makes its Python worse than it was at its base.

    python structure_check.py --base origin/dev [path ...]
    python structure_check.py --score [path ...]

Compares the working tree with the merge-base of HEAD and --base, and fails only on what the
branch introduced, never on what was already there:

- complexity (mccabe, the measure ruff's C901 copies), in the .py files the branch changed: a
  new function over the limit, one that crossed it, or one already over it that grew. A nested
  function is named on its own (`outer.inner`), the way C901 names it, and its decisions also
  count towards the function enclosing it;
- duplication (jscpd, on the paths as they are and as they were at base): a clone that is not
  at base, and most of one of its copies is code the branch added. jscpd's own "new" alone
  would also count an old clone that grew by a token at its edge, as appending a function
  after it does. (jscpd's --baseline-from-ref does the base scan itself, but reads the whole
  repository: 65s on JewelryX, against under a second for the paths alone.)
- import cycles, over the modules the paths hold: a cycle none of the base's cycles contains.
  Only the imports that run when a module is imported count, so an import inside a function
  and one under `if TYPE_CHECKING:` are not edges — both are how a cycle is deliberately
  broken, and reporting them would be advice to undo the fix.

--score is the other mode, and it never fails: it runs scb-check (uvx scb-check==0.2.0) and
prints the two composites SlopCodeBench measures, verbosity and erosion, with what each is
made of. A repo-wide score is not something one change should fail on, and it moves for
reasons a diff cannot see, so it is there to compare two runs, not to gate one. It is not a
pre-push step: the first uvx run downloads scb-check's dependencies.

The paths (default: the current folder) limit all of them. The limit is `max-complexity` in
[tool.structure-check] of ./pyproject.toml, 10 without one. Exits 0 when nothing new is
worse (and when no .py file changed), 1 when something is, 2 when it cannot run.
"""

from __future__ import annotations

import argparse
import ast
import io
import json
import math
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import tomllib
from dataclasses import dataclass

import mccabe

DEFAULT_MAX_COMPLEXITY = 10
SKIP_FOLDERS = frozenset({"__pycache__", "node_modules", "venv", ".venv"})
WINDOWS_LONG_PATH = "\\\\?\\"
# scb-check owns the composite scores, and its rule set changes between releases, so an
# unpinned run makes verbosity incomparable across runs (its own source says so).
SCB_CHECK = "scb-check==0.2.0"
# How many mass carriers `--score` names before it stops and counts the rest.
HEAVY_SHOWN = 5


class StructureError(Exception):
    """The check cannot run: no git, an unknown base, no jscpd."""


@dataclass(frozen=True)
class Regression:
    where: str
    message: str

    def __str__(self) -> str:
        return f"{self.where} {self.message}"


def git(*args: str) -> str:
    done = subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8")
    if done.returncode != 0:
        raise StructureError(f"git {' '.join(args)}: {done.stderr.strip()}")
    return done.stdout


def changed_python(merge_base: str, paths: list[str]) -> list[tuple[str | None, str]]:
    """(path at base or None, path now) for each .py file added, changed or renamed since base."""
    out = git("diff", "--name-status", "-M", "--relative", merge_base, "--", *paths)
    files = []
    for line in out.splitlines():
        status, *names = line.split("\t")
        if not names[-1].endswith(".py") or status[0] not in "AMR":
            continue
        files.append((None if status[0] == "A" else names[0], names[-1]))
    return files


def added_lines(merge_base: str, paths: list[str]) -> dict[str, set[int]]:
    """Path -> the line numbers the branch added or changed in it."""
    out = git("diff", "-U0", "--relative", merge_base, "--", *paths)
    added: dict[str, set[int]] = {}
    lines: set[int] = set()
    for line in out.splitlines():
        if line.startswith("+++ "):
            lines = added.setdefault(line[6:] if line.startswith("+++ b/") else line[4:], set())
        elif line.startswith("@@"):
            start, _, count = line.split(" ")[2][1:].partition(",")
            lines.update(range(int(start), int(start) + int(count or 1)))
    return added


def complexity_of(node: ast.AST) -> int:
    """One function's complexity, graphing it on its own. A function nested inside it still
    counts towards it, which is what ruff's C901 does too."""
    visitor = mccabe.PathGraphingAstVisitor()
    visitor.preorder(ast.Module(body=[node], type_ignores=[]), visitor)
    return max((g.complexity() for g in visitor.graphs.values()), default=0)


def complexities(source: str) -> dict[str, tuple[int, int]]:
    """Function (Class.method, outer.inner) -> (line, complexity), for every function in the
    source, a nested one included. Unparseable source has none.

    mccabe graphs a module, and folds a nested function's decisions into the function that
    encloses it the way it treats a closure, so a nested function is never a key of its own and
    the enclosing one is reported carrying both. Each function is graphed on its own here
    instead, which reports the set ruff's C901 reports: the enclosing function still counts what
    is nested in it, and the nested one is named as well. That matters for the message rather
    than for the detection, since folding is additive and a nested function over the limit
    always puts its enclosing function over the limit too.
    """
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError):
        return {}
    found: dict[str, tuple[int, int]] = {}

    def walk(node: ast.AST, prefix: str) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                name = f"{prefix}{child.name}"
                found[name] = (child.lineno, complexity_of(child))
                walk(child, f"{name}.")
            elif isinstance(child, ast.ClassDef):
                walk(child, f"{prefix}{child.name}.")
            else:
                walk(child, prefix)

    walk(tree, "")
    return found


def complexity_regressions(
    merge_base: str, files: list[tuple[str | None, str]], limit: int
) -> list[Regression]:
    found = []
    for old_path, path in files:
        before = complexities(git("show", f"{merge_base}:./{old_path}")) if old_path else {}
        after = complexities(pathlib.Path(path).read_text(encoding="utf-8"))
        for name, (line, now) in after.items():
            was = before.get(name, (0, None))[1]
            where = f"{path}:{line} {name}:"
            if now <= limit:
                continue
            if was is None:
                found.append(Regression(where, f"complexity {now}, new (max {limit})"))
            elif was <= limit:
                message = f"complexity {was} → {now}, over the max of {limit}"
                found.append(Regression(where, message))
            elif now > was:
                found.append(
                    Regression(where, f"complexity {was} → {now}, already over {limit} and grew")
                )
    return found


def find_jscpd() -> list[str]:
    """jscpd from the nearest node_modules/.bin up to the repository root, else from PATH."""
    root = pathlib.Path(git("rev-parse", "--show-toplevel").strip()).resolve()
    here = pathlib.Path.cwd().resolve()
    for folder in [here, *here.parents]:
        for name in ("jscpd.cmd", "jscpd") if sys.platform == "win32" else ("jscpd",):
            if (folder / "node_modules" / ".bin" / name).is_file():
                return [str(folder / "node_modules" / ".bin" / name)]
        if folder == root:
            break
    if found := shutil.which("jscpd"):
        return [found]
    raise StructureError("jscpd not found: add it as a dev dependency (pnpm add -D jscpd)")


def relative(path: str) -> str:
    """A path jscpd reported (absolute, see --absolute) as git names it: relative, with slashes.
    On Windows jscpd writes it with the long-path prefix."""
    absolute = pathlib.Path(path.removeprefix(WINDOWS_LONG_PATH)).resolve()
    return absolute.relative_to(pathlib.Path.cwd().resolve()).as_posix()


def checkout_base(merge_base: str, paths: list[str], into: pathlib.Path) -> None:
    """The paths as they were at base, under `into`; one that did not exist is an empty folder."""
    for path in paths:
        (into / path).mkdir(parents=True, exist_ok=True)
    present = [p for p in paths if git("ls-tree", merge_base, "--", p).strip()]
    if not present:
        return
    archive = subprocess.run(
        ["git", "archive", "--format=tar", merge_base, "--", *present], capture_output=True
    )
    if archive.returncode != 0:
        raise StructureError(f"git archive: {archive.stderr.decode(errors='replace').strip()}")
    with tarfile.open(fileobj=io.BytesIO(archive.stdout)) as tar:
        tar.extractall(into, filter="data")


def jscpd(paths: list[str], cwd: pathlib.Path | None, *options: str) -> None:
    command = [*find_jscpd(), *paths, "--format", "python", "--silent", *options]
    done = subprocess.run(command, cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    if done.returncode != 0:
        raise StructureError(f"jscpd failed: {(done.stderr or done.stdout).strip()}")


def duplication_regressions(merge_base: str, paths: list[str]) -> list[Regression]:
    with tempfile.TemporaryDirectory() as tmp:
        base, baseline = pathlib.Path(tmp, "base"), str(pathlib.Path(tmp, "baseline.json"))
        checkout_base(merge_base, paths, base)
        jscpd(paths, base, "--baseline", baseline, "--update-baseline", "--reporters", "silent")
        jscpd(
            paths,
            None,
            "--baseline",
            baseline,
            "--absolute",
            "--reporters",
            "json",
            "--output",
            tmp,
        )
        report = pathlib.Path(tmp, "jscpd-report.json")
        clones = json.loads(report.read_text(encoding="utf-8"))["duplicates"]
    added = added_lines(merge_base, paths)

    def mostly_added(copy: dict) -> bool:
        new = added.get(relative(copy["name"]), set())
        span = range(copy["start"], copy["end"] + 1)
        return 2 * sum(line in new for line in span) > len(span)

    found = []
    for clone in clones:
        first, second = clone["firstFile"], clone["secondFile"]
        if not clone.get("isNew") or not (mostly_added(first) or mostly_added(second)):
            continue
        if not mostly_added(first):  # name the branch's copy first: that is the one to fix
            first, second = second, first
        where = f"{relative(first['name'])}:{first['start']}-{first['end']}"
        other = f"{relative(second['name'])}:{second['start']}-{second['end']}"
        found.append(Regression(where, f"duplicates {other} ({clone['lines']} lines), new"))
    return found


def module_of(rel: str) -> str:
    """`app/services/order.py` -> `app.services.order`; a package's `__init__.py` -> the package."""
    parts = rel[: -len(".py")].split("/")
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def imports_of(source: str) -> list[tuple[int, int, str, list[str]]]:
    """(line, level, module, names) for the imports that run when this source is imported.

    An import inside a function runs when that function is called, not when the module loads,
    so it does not close a cycle at import time — it is the usual way to break one. The same
    goes for `if TYPE_CHECKING:`.
    """
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError):
        return []
    found: list[tuple[int, int, str, list[str]]] = []

    def type_only(test: ast.expr) -> bool:
        return (isinstance(test, ast.Name) and test.id == "TYPE_CHECKING") or (
            isinstance(test, ast.Attribute) and test.attr == "TYPE_CHECKING"
        )

    def visit(node: ast.AST) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
                continue
            if isinstance(child, ast.If) and type_only(child.test):
                continue
            if isinstance(child, ast.Import):
                found.extend((child.lineno, 0, alias.name, []) for alias in child.names)
            elif isinstance(child, ast.ImportFrom):
                found.append(
                    (
                        child.lineno,
                        child.level or 0,
                        child.module or "",
                        [a.name for a in child.names],
                    )
                )
            else:
                visit(child)

    visit(tree)
    return found


def python_files(root: pathlib.Path, paths: list[str]) -> dict[str, str]:
    """module -> its path relative to `root`, for every .py under the paths that is the
    project's own code. A virtualenv or a cache inside one of them is not part of the graph,
    and its thousands of files would be parsed for nothing."""
    found: dict[str, str] = {}
    for path in paths:
        for file in sorted((root / path).rglob("*.py")):
            rel = file.relative_to(root).as_posix()
            folders = rel.split("/")[:-1]
            if any(folder.startswith(".") or folder in SKIP_FOLDERS for folder in folders):
                continue
            found[module_of(rel)] = rel
    return found


def module_graph(files: dict[str, str], root: pathlib.Path) -> dict[str, dict[str, int]]:
    """module -> the modules it imports when it is imported, and the line it imports each on."""
    known = set(files)
    edges: dict[str, dict[str, int]] = {}
    for module, rel in files.items():
        package = module if rel.endswith("/__init__.py") else module.rpartition(".")[0]
        out: dict[str, int] = {}
        for line, level, name, names in imports_of((root / rel).read_text(encoding="utf-8")):
            if level:
                parts = package.split(".") if package else []
                if level > 1:
                    parts = parts[: len(parts) - (level - 1)]
                target = ".".join([*parts, *([name] if name else [])])
            else:
                target = name
            if not target:
                continue
            # `from a.b import c, d` depends on a.b, and on a.b.c / a.b.d where those are modules.
            for candidate in {target, *(f"{target}.{n}" for n in names)}:
                if candidate in known and candidate != module:
                    out.setdefault(candidate, line)
        edges[module] = out
    return edges


def cycles_of(edges: dict[str, dict[str, int]]) -> list[frozenset[str]]:
    """Tarjan's strongly connected components that are cycles: more than one module, or a
    module importing itself. The recursion depth is the graph's depth, not its size."""
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    found: list[frozenset[str]] = []

    def strong(node: str) -> None:
        index[node] = low[node] = len(index)
        stack.append(node)
        on_stack.add(node)
        for other in edges.get(node, ()):
            if other not in index:
                strong(other)
                low[node] = min(low[node], low[other])
            elif other in on_stack:
                low[node] = min(low[node], index[other])
        if low[node] != index[node]:
            return
        group: set[str] = set()
        while (popped := stack.pop()) != node:
            on_stack.discard(popped)
            group.add(popped)
        on_stack.discard(node)
        group.add(node)
        if len(group) > 1 or node in edges.get(node, ()):
            found.append(frozenset(group))

    for node in edges:
        if node not in index:
            strong(node)
    return found


def cycle_regressions(merge_base: str, paths: list[str]) -> list[Regression]:
    """A cycle fails when no cycle at base contains all of its members, so a cycle the branch
    grew counts but one it inherited, or left alone, does not. Like a clone, the regression is
    reported at the branch's own import — the one that closes the loop."""
    root = pathlib.Path.cwd()
    files = python_files(root, paths)
    edges = module_graph(files, root)
    now = cycles_of(edges)
    if not now:
        return []
    with tempfile.TemporaryDirectory() as tmp:
        base = pathlib.Path(tmp)
        checkout_base(merge_base, paths, base)
        before_edges = module_graph(python_files(base, paths), base)
        before = cycles_of(before_edges)
    found = []
    for group in now:
        if any(group <= known for known in before):
            continue
        # The imports inside the loop that the branch added: the one to move into a function.
        fresh = sorted(
            (src, dst, edges[src][dst])
            for src in group
            for dst in edges[src]
            if dst in group and dst not in before_edges.get(src, ())
        )
        closes = ", ".join(f"{src} -> {dst}" for src, dst, _ in fresh[:3])
        if len(fresh) > 3:
            closes += f" and {len(fresh) - 3} more"
        # There is always a new import: without one the cycle was already at base.
        source = fresh[0][0] if fresh else sorted(group)[0]
        at = f":{fresh[0][2]}" if fresh else ""
        found.append(
            Regression(
                f"{files[source]}{at} import cycle",
                f"{closes or ' -> '.join(sorted(group))} ({len(group)} modules), new",
            )
        )
    return found


@dataclass(frozen=True)
class Heavy:
    """A function over the complexity limit, and how much of the score's mass it carries."""

    path: str
    line: int
    name: str
    complexity: int
    sloc: int

    @property
    def mass(self) -> float:
        return self.complexity * math.sqrt(self.sloc)


def function_sloc(lines: list[str], start: int, end: int) -> int:
    """Non-blank, non-comment lines in a function's span. An approximation of scb-check's sloc,
    which counts logical lines from a tree-sitter parse."""
    return sum(
        1 for line in lines[start - 1 : end] if line.strip() and not line.lstrip().startswith("#")
    )


def heavy_functions(paths: list[str], limit: int) -> list[Heavy]:
    """The functions over `limit`, heaviest first, by `complexity * sqrt(sloc)` — the weighting
    scb-check's erosion uses to decide which functions carry the codebase's mass.

    Measured with mccabe, the same measure the --base check gates on, so the two agree, and
    naming every function the way that check does. The numbers are not scb-check's own: it
    counts boolean operators and `assert` statements as branches and mccabe counts neither, so
    its own list of what exceeds the threshold is the longer one. What is listed here is the
    set the gate compares against.
    """
    root = pathlib.Path.cwd()
    found: list[Heavy] = []
    for rel in python_files(root, paths).values():
        source = (root / rel).read_text(encoding="utf-8")
        try:
            spans = {
                node.lineno: (node.name, node.end_lineno or node.lineno)
                for node in ast.walk(ast.parse(source))
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            }
        except (SyntaxError, ValueError):
            continue
        lines = source.splitlines()
        for line, complexity in complexities(source).values():
            if complexity <= limit or line not in spans:
                continue
            name, end = spans[line]
            found.append(Heavy(rel, line, name, complexity, function_sloc(lines, line, end)))
    found.sort(key=lambda heavy: (-heavy.mass, heavy.path, heavy.line))
    return found


def scb_check_report(path: str) -> dict:
    """scb-check's JSON report for `path`.

    It exits 1 when it found anything, so the exit status is not read: the report is on stdout
    either way. `--report` and not the default human render: that one draws boxes a non-UTF-8
    console encoding cannot print, and it crashes there.

    PYTHONUTF8: scb-check decodes ast-grep's JSON with the locale encoding, because it runs that
    subprocess with `text=True` and no `encoding`. On a Windows machine whose ANSI codepage
    cannot decode the source (cp1255 and Hebrew, say) the reader thread raises, `stdout` comes
    back None, and scb-check dies on it. UTF-8 mode makes that decode correct.
    """
    uvx = shutil.which("uvx")
    if uvx is None:
        raise StructureError("uvx not found: install uv (https://docs.astral.sh/uv/)")
    done = subprocess.run(
        [uvx, SCB_CHECK, "check", path, "--report"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONUTF8": "1"},
    )
    try:
        return json.loads(done.stdout)
    except ValueError:
        said = (done.stderr or done.stdout or "").strip().splitlines()
        raise StructureError(
            f"scb-check gave no report: {said[-1].strip() if said else 'no output'}"
        ) from None


def score_lines(path: str, report: dict) -> list[str]:
    """The report as a brief: what the two SlopCodeBench composites measure, and what they are
    made of, in ASCII, so an old console encoding can print it."""

    def of_total(value: float, total: float) -> str:
        return f"{round(value)} of {round(total)}" if total else "0 of 0"

    functions = report.get("total_functions", 0)
    flagged = report.get("verbosity_flagged_loc", 0)
    parts = (
        f"clone {report.get('clone_loc', 0)}, "
        f"ast-grep {report.get('ast_grep_flagged_loc', 0)}, "
        f"structural {report.get('structural_rule_loc', 0)}"
    )
    erosion = of_total(report.get("high_cc_mass", 0), report.get("total_mass", 0))
    cognitive = of_total(report.get("high_cog_mass", 0), report.get("total_cog_mass", 0))
    return [
        f"{path}: verbosity {report.get('verbosity', 0):.4f}, "
        f"erosion {report.get('erosion', 0):.4f}, "
        f"cognitive erosion {report.get('cog_erosion', 0):.4f}",
        f"  verbosity: {flagged} of {report.get('total_loc', 0)} SLOC flagged ({parts})",
        f"  erosion:   {erosion} mass in {report.get('high_cc_functions', 0)} of "
        f"{functions} functions over complexity 10 (mass = cc x sqrt(sloc))",
        f"  cognitive: {cognitive} mass in "
        f"{report.get('high_cog_functions', 0)} of {functions} functions",
    ]


def score(paths: list[str]) -> int:
    """Print scb-check's composites for each path, and the functions carrying the erosion mass.
    Never a gate: a repo-wide score is not something a single change should fail on, and the
    numbers move for reasons a diff cannot see. Reported so two runs can be compared."""
    print(f"structure-check: scb-check {SCB_CHECK} (report only, never fails a push)")
    limit = max_complexity()
    for path in paths:
        for line in score_lines(path, scb_check_report(path)):
            print(line)
        # The dampener only ever looks at the files a branch changed, so it can never name a
        # function that was already heavy. This is the only place that can.
        heavy = heavy_functions([path], limit)
        if heavy:
            print(
                f"    heaviest over complexity {limit} by mass, mccabe (nested functions named "
                "as their own):"
            )
        for function in heavy[:HEAVY_SHOWN]:
            print(
                f"    {function.path}:{function.line} {function.name}"
                f"  complexity {function.complexity}, {function.sloc} sloc"
            )
        if len(heavy) > HEAVY_SHOWN:
            print(f"    ... and {len(heavy) - HEAVY_SHOWN} more over {limit}")
    return 0


def max_complexity() -> int:
    pyproject = pathlib.Path("pyproject.toml")
    if not pyproject.exists():
        return DEFAULT_MAX_COMPLEXITY
    table = tomllib.loads(pyproject.read_text(encoding="utf-8")).get("tool", {})
    return table.get("structure-check", {}).get("max-complexity", DEFAULT_MAX_COMPLEXITY)


def check(base: str, paths: list[str]) -> int:
    merge_base = git("merge-base", "HEAD", base).strip()
    files = changed_python(merge_base, paths)
    if not files:
        print(f"structure-check: no Python changes since {base}, skipped")
        return 0
    found = complexity_regressions(merge_base, files, max_complexity())
    found += duplication_regressions(merge_base, paths)
    found += cycle_regressions(merge_base, paths)
    for regression in found:
        print(regression)
    if found:
        print(
            f"structure-check: {len(found)} structure regression(s) since {base} "
            f"({merge_base[:9]}). Split the function, extract the shared code, or move the "
            "import into the function that needs it; what was already there does not count."
        )
        return 1
    print(
        f"structure-check: {len(files)} changed .py file(s), "
        "no new complexity, duplication or import cycles"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="structure_check.py", description=__doc__.split("\n")[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--base", default="origin/HEAD", help="the branch this one merges into")
    mode.add_argument(
        "--score",
        action="store_true",
        help="report scb-check's verbosity and erosion for the paths, and exit 0",
    )
    parser.add_argument("paths", nargs="*", default=["."], help="folders to check")
    args = parser.parse_args(argv)
    try:
        if args.score:
            return score(args.paths)
        return check(args.base, args.paths)
    except StructureError as error:
        print(f"structure-check: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
