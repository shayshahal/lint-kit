"""structure_check fails on what a branch made worse, never on what its base already had."""

from __future__ import annotations

import ast
import math
import os
import pathlib
import shutil
import subprocess

import pytest
from structure_check import (
    cognitive_of,
    complexities,
    function_sloc,
    heavy_functions,
    imports_of,
    main,
    scb_check_report,
    score_lines,
    sloc_lines,
    unquote_git_path,
)

BIN = pathlib.Path(__file__).resolve().parents[2] / "node_modules" / ".bin"


def branchy(name: str, branches: int) -> str:
    """A function of complexity branches + 1."""
    ifs = "".join(f"    if x == {i}:\n        return {i}\n" for i in range(branches))
    return f"def {name}(x):\n{ifs}    return -1\n\n\n"


def summed(name: str) -> str:
    """A block jscpd reports when it appears twice."""
    steps = "".join(f"    v{i} = compute(a, b, {i})\n    total += v{i} * {i}\n" for i in range(5))
    return f"def {name}(a, b):\n    total = 0\n{steps}    return total\n\n\n"


def nested(name: str, depth: int) -> str:
    """A function of `depth` ifs one inside the next: complexity 1 + depth, but cognitive
    1 + 2 + ... + depth, because each level charges for how deep it sits."""
    body = "".join(f"{'    ' * (i + 1)}if x == {i}:\n" for i in range(depth))
    return f"def {name}(x):\n{body}{'    ' * (depth + 1)}return -1\n\n\n"


@pytest.fixture
def repo(tmp_path, monkeypatch):
    """A git repository whose main branch holds `base`; the test edits files on a branch."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("PATH", f"{BIN}{os.pathsep}{os.environ['PATH']}")

    def git(*args: str) -> None:
        subprocess.run(["git", *args], check=True, capture_output=True)

    git("init", "-q", "-b", "main")
    git("config", "user.email", "t@example.test")
    git("config", "user.name", "t")
    git("config", "core.autocrlf", "false")

    def setup(base: dict[str, str]) -> None:
        for rel, text in base.items():
            (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
            (tmp_path / rel).write_text(text)
        git("add", ".")
        git("commit", "-qm", "base")
        git("checkout", "-qb", "feature")

    def commit(files: dict[str, str]) -> None:
        for rel, text in files.items():
            (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
            (tmp_path / rel).write_text(text)
        git("add", ".")
        git("commit", "-qm", "change")

    return setup, commit


def run(capsys, *paths: str) -> tuple[int, str]:
    code = main(["--base", "main", *paths])
    return code, capsys.readouterr().out


def test_a_branch_that_adds_a_complex_function_fails(repo, capsys):
    setup, commit = repo
    setup({"app/orders.py": branchy("simple", 2)})
    commit({"app/orders.py": branchy("simple", 2) + branchy("price", 12)})
    code, out = run(capsys)
    assert code == 1
    assert "app/orders.py:9 price: complexity 13, new (max 10)" in out


def test_touching_a_file_whose_functions_were_already_complex_passes(repo, capsys):
    setup, commit = repo
    legacy = branchy("legacy", 15) + summed("left") + summed("right")
    setup({"app/legacy.py": legacy})
    commit({"app/legacy.py": legacy + "def helper():\n    return 1\n"})
    assert run(capsys) == (
        0,
        "structure-check: 1 changed .py file(s), no new complexity, duplication or import cycles\n",
    )


def test_a_function_that_crosses_the_limit_or_grows_past_it_fails(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": branchy("near", 8) + branchy("over", 12)})
    commit({"app/a.py": branchy("near", 10) + branchy("over", 13)})
    code, out = run(capsys)
    assert code == 1
    assert "near: complexity 9 → 11, over the max of 10" in out
    assert "over: complexity 13 → 14, already over 10 and grew" in out


def test_the_limit_comes_from_pyproject(repo, capsys):
    setup, commit = repo
    setup({"pyproject.toml": "[tool.structure-check]\nmax-complexity = 20\n", "app/a.py": ""})
    commit({"app/a.py": branchy("price", 12)})
    assert run(capsys)[0] == 0


def test_nesting_that_stays_under_the_complexity_limit_still_fails(repo, capsys):
    """The case the cyclomatic check cannot see. Five ifs one inside the next is complexity 6,
    under the limit, and cognitive 15, over it: nesting is what cognitive charges for."""
    setup, commit = repo
    setup({"app/a.py": ""})
    commit({"app/a.py": nested("buried", 5)})
    code, out = run(capsys)
    assert code == 1
    assert "buried: complexity 6, new (max 10)" not in out
    assert "buried: cognitive complexity 15, new (max 10)" in out


def test_nesting_that_was_already_deep_passes(repo, capsys):
    setup, commit = repo
    legacy = nested("buried", 5)
    setup({"app/a.py": legacy})
    commit({"app/a.py": legacy + "def helper():\n    return 1\n"})
    assert run(capsys) == (
        0,
        "structure-check: 1 changed .py file(s), no new complexity, duplication or import cycles\n",
    )


def test_a_function_that_deepens_its_nesting_fails(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": nested("buried", 4)})
    commit({"app/a.py": nested("buried", 5)})
    code, out = run(capsys)
    assert code == 1
    assert "buried: cognitive complexity 10 → 15, over the max of 10" in out


def test_cognitive_and_cyclomatic_are_reported_apart(repo, capsys):
    """A function can be over both, and the two are different numbers, so it gets two lines."""
    setup, commit = repo
    setup({"app/a.py": ""})
    commit({"app/a.py": branchy("flat", 12) + nested("buried", 5)})
    _code, out = run(capsys)
    assert "flat: complexity 13, new (max 10)" in out
    assert "buried: cognitive complexity 15, new (max 10)" in out


def test_deepening_nesting_that_was_already_over_the_cognitive_limit_passes(repo, capsys):
    """Cognitive is gated on new and crossing functions only. 127 functions in JewelryX's backend
    are already over 10 cognitive, so holding all of them still would fail most merges."""
    setup, commit = repo
    setup({"app/a.py": nested("buried", 5)})
    commit({"app/a.py": nested("buried", 6)})
    assert run(capsys) == (
        0,
        "structure-check: 1 changed .py file(s), no new complexity, duplication or import cycles\n",
    )


def test_a_new_loop_else_function_at_the_cognitive_limit_passes(repo, capsys):
    """#25: the loop else body was counted twice alongside the generic child sweep, so this
    function scored 15 and failed a push scb-check scores at 10."""
    setup, commit = repo
    setup({"app/a.py": ""})
    commit({"app/a.py": FOR_ELSE_AT_LIMIT})
    assert run(capsys) == (
        0,
        "structure-check: 1 changed .py file(s), no new complexity, duplication or import cycles\n",
    )


def test_a_new_loop_else_function_over_the_cognitive_limit_still_fails(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": ""})
    commit({"app/a.py": FOR_ELSE_OVER_LIMIT})
    code, out = run(capsys)
    assert code == 1
    assert "f: cognitive complexity 15, new (max 10)" in out


def test_growing_a_function_already_over_the_complexity_limit_still_fails(repo, capsys):
    """The asymmetry is deliberate: cyclomatic keeps the case, because far fewer functions are
    over it to begin with."""
    setup, commit = repo
    setup({"app/a.py": branchy("legacy", 15)})
    commit({"app/a.py": branchy("legacy", 16)})
    code, out = run(capsys)
    assert code == 1
    assert "legacy: complexity 16 → 17, already over 10 and grew" in out


def test_new_duplication_fails(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": summed("total"), "app/b.py": "x = 1\n"})
    commit({"app/b.py": "x = 1\n\n\n" + summed("again")})
    code, out = run(capsys)
    assert code == 1
    assert "duplicates" in out and "new" in out


def test_a_third_copy_of_an_existing_clone_fails(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": summed("left") + summed("right")})
    commit({"app/b.py": summed("third")})
    code, out = run(capsys)
    assert code == 1
    assert "app/b.py" in out


def test_editing_both_copies_of_an_existing_clone_passes(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": summed("left") + summed("right")})
    edited = (summed("left") + summed("right")).replace("total = 0", "total = 1")
    commit({"app/a.py": edited})
    assert run(capsys)[0] == 0


def test_moving_duplicated_code_passes(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": summed("left") + summed("right")})
    commit({"app/a.py": "", "app/b.py": summed("left") + summed("right")})
    assert run(capsys)[0] == 0


def test_a_branch_with_no_python_changes_is_skipped(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": branchy("legacy", 15), "README.md": "x\n"})
    commit({"README.md": "y\n"})
    assert run(capsys) == (0, "structure-check: no Python changes since main, skipped\n")


def test_an_unknown_base_cannot_run(repo, capsys):
    setup, _ = repo
    setup({"app/a.py": ""})
    assert main(["--base", "origin/nowhere"]) == 2


def test_a_folder_that_is_new_on_the_branch_is_checked(repo, capsys):
    setup, commit = repo
    setup({"README.md": "x\n"})
    commit({"api/a.py": summed("left") + summed("right")})
    code, out = run(capsys, "api")
    assert code == 1
    assert "api/a.py" in out


UNICODE_PATH = "app/caf\u00e9.py"


def test_a_unicode_filename_with_a_complex_function_fails(repo, capsys):
    """#22: with the default core.quotePath git writes a non-ASCII pathname as
    `"caf\\303\\251.py"`, which does not end in `.py`, so the file was skipped whole."""
    setup, commit = repo
    setup({"app/keep.py": ""})
    commit({UNICODE_PATH: branchy("price", 12)})
    code, out = run(capsys)
    assert code == 1
    assert f"{UNICODE_PATH}:1 price: complexity 13, new (max 10)" in out


def test_a_unicode_filename_is_checked_with_quoting_disabled(repo, capsys):
    setup, commit = repo
    setup({"app/keep.py": ""})
    subprocess.run(["git", "config", "core.quotePath", "false"], check=True, capture_output=True)
    commit({UNICODE_PATH: branchy("price", 12)})
    assert run(capsys)[0] == 1


def test_a_clone_in_a_unicode_filename_is_attributed(repo, capsys):
    """The `+++` header of a patch is quoted the same way, so the added lines that decide
    whether a clone is new must be keyed by the unquoted name or nothing is attributed."""
    setup, commit = repo
    setup({"app/original.py": summed("left"), "app/keep.py": "x = 1\n"})
    commit({UNICODE_PATH: summed("again")})
    code, out = run(capsys)
    assert code == 1
    assert UNICODE_PATH in out


def test_unquote_git_path_returns_the_name_the_bytes_spell():
    assert unquote_git_path('"app/caf\\303\\251.py"') == UNICODE_PATH
    assert unquote_git_path('"a\\tb.py"') == "a\tb.py"
    assert unquote_git_path('"a\\\\b.py"') == "a\\b.py"
    assert unquote_git_path('"plain.py"') == "plain.py"
    assert unquote_git_path("plain.py") == "plain.py"


def test_a_new_import_cycle_fails(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": "from app.b import thing\n", "app/b.py": "thing = 1\n"})
    commit({"app/b.py": "from app.a import x\nthing = 1\n"})
    code, out = run(capsys)
    assert code == 1
    assert "app/b.py:1 import cycle app.b -> app.a (2 modules), new" in out


def test_a_cycle_the_base_already_had_passes(repo, capsys):
    setup, commit = repo
    cycled = {
        "app/a.py": "from app.b import thing\n",
        "app/b.py": "from app.a import x\nthing = 1\n",
    }
    setup(cycled)
    commit({**cycled, "app/c.py": "value = 1\n"})
    assert run(capsys)[0] == 0


def test_a_cycle_that_took_in_a_new_module_fails(repo, capsys):
    setup, commit = repo
    setup(
        {
            "app/a.py": "from app.b import thing\n",
            "app/b.py": "from app.a import x\nthing = 1\n",
        }
    )
    commit({"app/a.py": "from app.c import c\n", "app/c.py": "from app.b import thing\nc = 1\n"})
    code, out = run(capsys)
    assert code == 1
    assert "import cycle" in out and "(3 modules), new" in out


def test_an_import_inside_a_function_does_not_close_a_cycle(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": "from app.b import thing\n", "app/b.py": "thing = 1\n"})
    commit({"app/b.py": "thing = 1\n\n\ndef late():\n    from app.a import x\n\n    return x\n"})
    assert run(capsys)[0] == 0


def test_a_type_checking_import_does_not_close_a_cycle(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": "from app.b import thing\n", "app/b.py": "thing = 1\n"})
    commit(
        {
            "app/b.py": "from typing import TYPE_CHECKING\n\nif TYPE_CHECKING:\n"
            "    from app.a import x\n\nthing = 1\n"
        }
    )
    assert run(capsys)[0] == 0


def test_a_runtime_else_of_a_type_checking_branch_closes_a_cycle(repo, capsys):
    """#23: `if TYPE_CHECKING:` was skipped whole, else branch included, so the runtime import
    in the else never became an edge and the cycle the branch closed went unseen."""
    setup, commit = repo
    setup({"app/a.py": TYPE_CHECKING_ELSE, "app/b.py": "thing = 1\n"})
    commit({"app/b.py": "import app.a\n\nthing = 1\n"})
    code, out = run(capsys)
    assert code == 1
    assert "import cycle" in out


def test_typing_TYPE_CHECKING_else_import_closes_a_cycle(repo, capsys):
    setup, commit = repo
    setup({"app/a.py": TYPING_TYPE_CHECKING_ELSE, "app/b.py": "thing = 1\n"})
    commit({"app/b.py": "import app.a\n\nthing = 1\n"})
    assert run(capsys)[0] == 1


def test_a_runtime_else_cycle_the_base_already_had_passes(repo, capsys):
    setup, commit = repo
    cycled = {
        "app/a.py": TYPE_CHECKING_ELSE,
        "app/b.py": "import app.a\n\nthing = 1\n",
    }
    setup(cycled)
    commit({**cycled, "app/c.py": "value = 1\n"})
    assert run(capsys)[0] == 0


def test_imports_of_skips_the_type_checking_body_but_keeps_its_else():
    source = (
        "from typing import TYPE_CHECKING\n"
        "if TYPE_CHECKING:\n"
        "    import app.types\n"
        "else:\n"
        "    import app.runtime\n"
    )
    assert imports_of(source) == [(1, 0, "typing", ["TYPE_CHECKING"]), (5, 0, "app.runtime", [])]


SCB_REPORT = {
    "verbosity": 0.015315315315315315,
    "erosion": 0.7215938484133675,
    "cog_erosion": 0.8781633611092327,
    "total_loc": 1110,
    "verbosity_flagged_loc": 17,
    "clone_loc": 14,
    "ast_grep_flagged_loc": 3,
    "structural_rule_loc": 0,
    "high_cc_mass": 1913.5479897160726,
    "total_mass": 2651.8352310285914,
    "total_functions": 61,
    "high_cc_functions": 13,
    "high_cog_mass": 3622.231842279953,
    "total_cog_mass": 4124.781336475495,
    "high_cog_functions": 18,
}


def test_score_lines_reads_a_report():
    assert score_lines("app", SCB_REPORT) == [
        "app: verbosity 0.0153, erosion 0.7216, cognitive erosion 0.8782",
        "  verbosity: 17 of 1110 SLOC flagged (clone 14, ast-grep 3, structural 0)",
        "  erosion:   1914 of 2652 mass in 13 of 61 functions over complexity 10"
        " (mass = cc x sqrt(sloc))",
        "  cognitive: 3622 of 4125 mass in 18 of 61 functions",
    ]


def test_score_lines_survives_a_report_with_no_loc():
    lines = score_lines("app", {})
    assert "0 of 0 SLOC flagged" in lines[1]
    assert "0 of 0 mass" in lines[2]


def test_sloc_lines_drops_a_docstring_but_keeps_a_string_that_is_a_value():
    """scb-check does not count a standalone string statement as code, and a docstring is one.
    `b` and `f` strings are values rather than prose and stay in. Three lines, and scb-check's
    own total_loc for this source is 3."""
    source = (
        "def f():\n"
        '    """Prose about the function, which scb-check does not count as code."""\n'
        '    note = f"""a long f-string is a value"""\n'
        "    return note\n"
    )
    assert sloc_lines(source) == frozenset({1, 3, 4})


def test_sloc_lines_keeps_a_string_statement_that_does_not_own_its_line():
    """A comment after it means it is not a statement of its own, so the line stays code."""
    source = 'def f():\n    """Kept, because a comment follows it."""  # why\n    return 1\n'
    assert sloc_lines(source) == frozenset({1, 2, 3})


def test_sloc_lines_keeps_a_bytes_literal():
    source = 'def f():\n    b"""Kept: bytes, not prose."""\n    return 1\n'
    assert sloc_lines(source) == frozenset({1, 2, 3})


def test_function_sloc_counts_the_code_lines_in_the_span():
    code = frozenset({1, 3, 6})
    assert function_sloc(code, 1, 3) == 2
    assert function_sloc(code, 4, 6) == 1
    assert function_sloc(code, 4, 5) == 0


NESTED = """def outer(x):
    if x == 1:
        return 1

    def inner(y):
        if y == 1:
            return 1
        if y == 2:
            return 2
        return 0

    return inner(x)


class Holder:
    def method(self, x):
        def inside(y):
            if y:
                return 1
            return 0

        return inside(x)
"""


def test_a_nested_function_is_named_on_its_own():
    """mccabe folds `inner` into `outer`; ruff's C901 reports both, and so does this. The
    numbers are C901's: `outer` 5, `inner` 3, `method` 3, `inside` 2. The third value is the
    cognitive complexity, and a nested function's branches count into the one enclosing it."""
    found = complexities(NESTED)
    assert found["outer"] == (1, 5, 3)  # its own `if`, plus inner's two
    assert found["outer.inner"] == (5, 3, 2)
    assert found["Holder.method"] == (16, 3, 1)  # no `if` of its own, only inside's
    assert found["Holder.method.inside"] == (17, 2, 1)


def nested_ifs(depth: int) -> str:
    """`depth` ifs one inside the next."""
    body = "".join(f"{'    ' * (i + 1)}if x == {i}:\n" for i in range(depth))
    return f"def f(x):\n{body}{'    ' * (depth + 1)}return -1\n"


def and_chain(count: int) -> str:
    """One expression of `count` names joined by `and`."""
    names = [f"a{i}" for i in range(count)]
    return f"def f({', '.join(names)}):\n    return {' and '.join(names)}\n"


IF_ELIF_ELSE = (
    "def f(a, b):\n"
    "    if a:\n"
    "        return 1\n"
    "    elif b:\n"
    "        return 2\n"
    "    else:\n"
    "        return 3\n"
)
IF_ELIF = "def f(a, b):\n    if a:\n        return 1\n    elif b:\n        return 2\n"
IF_ELSE_IF = (
    "def f(a, b):\n    if a:\n        return 1\n    else:\n        if b:\n            return 2\n"
)
FOR_WHILE_BREAK = "def f(xs):\n    for x in xs:\n        while x:\n            break\n"
# A loop's `else` is a clause of the loop, not a second body: it costs one plus the depth
# outside the loop, and its statements sit one deeper than that. It used to be walked twice.
FOR_ELSE_PASS = "def f(xs):\n    for x in xs:\n        pass\n    else:\n        pass\n"
WHILE_ELSE_PASS = "def f(xs):\n    while xs:\n        pass\n    else:\n        pass\n"
ASYNC_FOR_ELSE_PASS = (
    "async def f(xs):\n    async for x in xs:\n        pass\n    else:\n        pass\n"
)
FOR_ELSE_AT_LIMIT = (
    "def f(xs):\n"
    "    for x in xs:\n"
    "        pass\n"
    "    else:\n"
    "        if xs:\n"
    "            if len(xs):\n"
    "                return 1\n"
)
FOR_ELSE_OVER_LIMIT = (
    "def f(xs):\n"
    "    for x in xs:\n"
    "        pass\n"
    "    else:\n"
    "        if xs:\n"
    "            if len(xs):\n"
    "                if xs:\n"
    "                    return 1\n"
)
NESTED_FOR_ELSE = (
    "def f(xs):\n"
    "    for x in xs:\n"
    "        for y in xs:\n"
    "            pass\n"
    "        else:\n"
    "            return 1\n"
)
WHILE_BOOL = "def f(a, b):\n    while a and b:\n        pass\n"
# The remaining constructs the differential fixtures cover (#29): exception handling and a
# function nested inside another.
TRY_EXCEPT = (
    "def f(x):\n"
    "    try:\n"
    "        if x:\n"
    "            return 1\n"
    "    except ValueError:\n"
    "        if x:\n"
    "            return 2\n"
    "    return 0\n"
)
NESTED_FUNCTION = (
    "def outer(x):\n"
    "    if x:\n"
    "        def inner(y):\n"
    "            if y:\n"
    "                return 1\n"
    "            if y == 2:\n"
    "                return 2\n"
    "            return 0\n"
    "        return inner(x)\n"
    "    return 0\n"
)
# `if TYPE_CHECKING:` body is type-only; its `else` runs at runtime, so an import there is an
# edge. Neither the cycle tests' fixtures nor the docstrings should need the reader to guess that.
TYPE_CHECKING_ELSE = """\
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass
else:
    import app.b
"""
TYPING_TYPE_CHECKING_ELSE = """\
import typing

if typing.TYPE_CHECKING:
    pass
else:
    import app.b
"""

COGNITIVE = [
    # a boolean operator is one each, not one per run: eleven `and`s is eleven
    (and_chain(12), 11),
    # three branches at the same level: 1 + 0, three times
    (branchy("f", 3), 3),
    # the nesting penalty: 1, then 1 + 1, then 1 + 2
    (nested_ifs(3), 6),
    (nested_ifs(5), 15),
    # `elif` and `else` are clauses of the one `if`, so each costs 1 + the depth inside it
    (IF_ELIF_ELSE, 5),
    # ... which is why `else:` opening with an `if` costs more than the `elif` that looks the same
    (IF_ELIF, 3),
    (IF_ELSE_IF, 6),
    # a loop, a nested loop, and a `break` inside it
    (FOR_WHILE_BREAK, 4),
    # a loop else is a clause too, and is walked once: 1 + (1 + 0).
    (FOR_ELSE_PASS, 3),
    (WHILE_ELSE_PASS, 3),
    (ASYNC_FOR_ELSE_PASS, 3),
    # a boolean operator in the loop condition still costs one
    (WHILE_BOOL, 2),
    # nesting through a loop else: the outer loop 1, then the inner loop 1 + 1, then the inner
    # else 1 + (1 + 1)
    (NESTED_FOR_ELSE, 6),
    # the #25 reproducer: 1 + 2 + 3 + 4, which is scb-check's 10 and not the double-counted 15
    (FOR_ELSE_AT_LIMIT, 10),
]


def test_cognitive_is_scb_checks_measure():
    """Every number here was read off `scb-check check -v`, which prints the functions over its
    threshold, so the gate and the published score cannot drift apart."""
    for source, expected in COGNITIVE:
        (_line, _complexity, cognitive) = complexities(source)["f"]
        assert cognitive == expected, f"{source!r} should be {expected}, got {cognitive}"


def test_an_elif_costs_less_than_an_else_that_opens_with_an_if():
    """The same tree to Python's ast, two different trees to the grammar, so the walk has to
    tell them apart by where the inner `if` starts."""
    assert complexities(IF_ELIF)["f"][2] == 3
    assert complexities(IF_ELSE_IF)["f"][2] == 6


def test_heavy_functions_keeps_only_what_is_over_the_limit(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "a.py").write_text(branchy("calm", 3) + branchy("heavy", 12))
    assert [(h.name, h.complexity, h.sloc) for h in heavy_functions(["app"], 10)] == [
        ("heavy", 13, 26)
    ]


def test_heavy_functions_ranks_the_bigger_one_first(tmp_path, monkeypatch):
    """Same complexity, more lines: mass is `complexity * sqrt(sloc)`, so the longer one leads."""
    monkeypatch.chdir(tmp_path)
    (tmp_path / "app").mkdir()
    fat = (
        "def fat(x):\n"
        + "".join(f"    if x == {i}:\n        y = {i}\n        return y\n" for i in range(12))
        + "    return -1\n"
    )
    (tmp_path / "app" / "a.py").write_text(branchy("thin", 12) + "\n\n" + fat)
    assert [h.name for h in heavy_functions(["app"], 10)] == ["fat", "thin"]


def test_scb_check_is_run_in_utf8_mode(monkeypatch):
    """scb-check decodes ast-grep's JSON with the locale codepage, so on a Windows box whose ANSI
    codepage cannot decode the source it dies on a None stdout. UTF-8 mode makes it work."""
    seen = {}

    def fake_run(command, **kwargs):
        seen.update(kwargs)
        return subprocess.CompletedProcess(command, 0, stdout='{"verbosity": 0.5}', stderr="")

    monkeypatch.setattr(shutil, "which", lambda name: "uvx")
    monkeypatch.setattr(subprocess, "run", fake_run)
    assert scb_check_report("app") == {"verbosity": 0.5}
    assert seen["env"]["PYTHONUTF8"] == "1"
    assert seen["encoding"] == "utf-8"
    # the environment is merged, not replaced: uvx needs PATH to be found at all
    assert set(os.environ) <= set(seen["env"])


@pytest.mark.skipif(shutil.which("uvx") is None, reason="uvx is not installed")
def test_score_reports_scb_check_and_never_fails(tmp_path, monkeypatch, capsys):
    """scb-check exits 1 when it found anything, so `--score` must read stdout, not the status."""
    monkeypatch.chdir(tmp_path)
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "a.py").write_text("def f(x):\n    if x:\n        return 1\n    return 0\n")
    assert main(["--score", "app"]) == 0
    out = capsys.readouterr().out
    assert "scb-check==0.2.0" in out
    assert "app: verbosity" in out and "erosion" in out


def _scb_check_symbols(tree: ast.AST) -> list[ast.FunctionDef | ast.AsyncFunctionDef]:
    """The functions scb-check reports: methods and module/class-level functions, but not a
    function nested inside another — it folds that one's decisions into the enclosing symbol."""
    found: list[ast.FunctionDef | ast.AsyncFunctionDef] = []

    def walk(node: ast.AST, in_function: bool) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if not in_function:
                    found.append(child)
                walk(child, True)
            else:
                walk(child, in_function)

    walk(tree, False)
    return found


def _local_cognitive_mass(source: str) -> float:
    """The mass scb-check's `total_cog_mass` sums for the source: `cog x sqrt(sloc)` per
    symbol. `sloc` is the same measure `--score` reports heavy functions with."""
    tree = ast.parse(source)
    code = sloc_lines(source)
    return sum(
        cognitive_of(node)
        * math.sqrt(function_sloc(code, node.lineno, node.end_lineno or node.lineno))
        for node in _scb_check_symbols(tree)
    )


DIFFERENTIAL = [
    ("a loop else at the limit (#25)", FOR_ELSE_AT_LIMIT),
    ("five nested ifs", nested_ifs(5)),
    ("a boolean chain over the limit", and_chain(12)),
    ("a boolean chain under the limit", and_chain(10)),
    ("exception handling", TRY_EXCEPT),
    ("a function nested in another", NESTED_FUNCTION),
]


@pytest.mark.skipif(shutil.which("uvx") is None, reason="uvx is not installed")
@pytest.mark.parametrize("_label,source", DIFFERENTIAL, ids=[label for label, _ in DIFFERENTIAL])
def test_cognitive_matches_the_pinned_scb_check(_label, source, tmp_path, monkeypatch):
    """The measure is scb-check's, so the local walk and the pinned scorer must agree on the mass
    of the same source. A drift in any construct below moves a number and fails here. CI installs
    uvx, so this is a gate there, not an optional manual check (#29)."""
    monkeypatch.chdir(tmp_path)
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "f.py").write_text(source)
    report = scb_check_report("app")
    assert report["total_functions"] == len(_scb_check_symbols(ast.parse(source)))
    assert report["total_cog_mass"] == pytest.approx(_local_cognitive_mass(source))
