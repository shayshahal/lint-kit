"""`lint-kit-fastapi check-deps [pyproject.toml]`: each runtime dependency is classified (FAP001).

A new library either blocks the event loop somewhere (list those calls) or is safe in async code
(say why), in [tool.lint-kit-fastapi.dependencies]. Libraries lint-kit knows are classified
already. Exits 1 while something is unclassified, or classified but no longer a dependency.
"""

from __future__ import annotations

import pathlib
import sys

from lint_kit_fastapi import unclassified


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if not args or args[0] != "check-deps":
        print("usage: lint-kit-fastapi check-deps [path/to/pyproject.toml]", file=sys.stderr)
        return 2
    pyproject = pathlib.Path(args[1] if len(args) > 1 else "pyproject.toml")
    missing, stale = unclassified(pyproject)
    for name in missing:
        print(
            f"{pyproject}: classify {name} in [tool.lint-kit-fastapi.dependencies]: the calls into "
            'it that block the event loop (["pkg.func", "pkg.Class."]), or why it is safe in async '
            "code (a string)"
        )
    for name in stale:
        print(f"{pyproject}: {name} is classified but no longer a dependency; remove it")
    return 1 if missing or stale else 0


if __name__ == "__main__":
    sys.exit(main())
