"""`lint-kit-structure --base origin/dev [path ...]`: fail when a branch makes its Python worse.

Compares the working tree with the merge-base of HEAD and --base, and fails only on what the
branch introduced, never on what was already there:

- complexity (mccabe, the measure ruff's C901 copies), in the .py files the branch changed: a
  new function over the limit, one that crossed it, or one already over it that grew;
- duplication (jscpd, on the paths as they are and as they were at base): a clone that is not
  at base, and most of one of its copies is code the branch added. jscpd's own "new" alone
  would also count an old clone that grew by a token at its edge, as appending a function
  after it does. (jscpd's --baseline-from-ref does the base scan itself, but reads the whole
  repository: 65s on JewelryX, against under a second for the paths alone.)

The paths (default: the current folder) limit both. The limit is `max-complexity` in
[tool.lint-kit-structure] of ./pyproject.toml, 10 without one. Exits 0 when nothing new is
worse (and when no .py file changed), 1 when something is, 2 when it cannot run.
"""

from __future__ import annotations

import argparse
import ast
import io
import json
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
WINDOWS_LONG_PATH = "\\\\?\\"


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


def complexities(source: str) -> dict[str, tuple[int, int]]:
    """Function (Class.method) -> (line, complexity). Unparseable source has none."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {}
    visitor = mccabe.PathGraphingAstVisitor()
    visitor.preorder(tree, visitor)
    return {g.entity: (g.lineno, g.complexity()) for g in visitor.graphs.values()}


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


def max_complexity() -> int:
    pyproject = pathlib.Path("pyproject.toml")
    if not pyproject.exists():
        return DEFAULT_MAX_COMPLEXITY
    table = tomllib.loads(pyproject.read_text(encoding="utf-8")).get("tool", {})
    return table.get("lint-kit-structure", {}).get("max-complexity", DEFAULT_MAX_COMPLEXITY)


def check(base: str, paths: list[str]) -> int:
    merge_base = git("merge-base", "HEAD", base).strip()
    files = changed_python(merge_base, paths)
    if not files:
        print(f"lint-kit-structure: no Python changes since {base}, skipped")
        return 0
    found = complexity_regressions(merge_base, files, max_complexity())
    found += duplication_regressions(merge_base, paths)
    for regression in found:
        print(regression)
    if found:
        print(
            f"lint-kit-structure: {len(found)} structure regression(s) since {base} "
            f"({merge_base[:9]}). Split the function or extract the shared code; "
            "what was already there does not count."
        )
        return 1
    print(f"lint-kit-structure: {len(files)} changed .py file(s), no new complexity or duplication")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="lint-kit-structure", description=__doc__.split("\n")[0])
    parser.add_argument("--base", default="origin/HEAD", help="the branch this one merges into")
    parser.add_argument("paths", nargs="*", default=["."], help="folders to check")
    args = parser.parse_args(argv)
    try:
        return check(args.base, args.paths)
    except StructureError as error:
        print(f"lint-kit-structure: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
