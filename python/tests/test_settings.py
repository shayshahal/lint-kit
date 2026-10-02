"""[tool.lint-kit-fastapi]: the app package's location, and the dependency classification."""

from __future__ import annotations

import pathlib
import textwrap

from test_rules import codes

from lint_kit_fastapi import load_settings, unclassified
from lint_kit_fastapi.cli import main

BLOCKING_HELPER = {
    "src/shop/helpers.py": """
        import bcrypt
        def hash_it(p):
            return bcrypt.hashpw(p, bcrypt.gensalt())
    """,
    "src/shop/routes.py": """
        from shop.helpers import hash_it
        async def register(p):
            return hash_it(p)
    """,
}


def test_app_package_elsewhere_resolves_imports_across_modules(tmp_path):
    pyproject = '[tool.lint-kit-fastapi]\napp = "src/shop"\n'
    assert codes(tmp_path, BLOCKING_HELPER, "src/shop/routes.py", pyproject) == ["FAP001"]


def test_without_the_setting_the_project_index_is_not_found(tmp_path):
    # app/ does not exist, so no cross-module index: the helper's blocking call is unseen
    assert codes(tmp_path, BLOCKING_HELPER, "src/shop/routes.py") == []


def test_a_project_classifies_its_own_blocking_library(tmp_path):
    src = {
        "app/m.py": """
            import mylib
            async def render():
                return mylib.render_pdf()
        """
    }
    # settings are read once per project directory per process, so two projects
    assert codes(tmp_path / "plain", src) == []
    pyproject = '[tool.lint-kit-fastapi.dependencies]\nmylib = ["mylib.render_"]\n'
    assert codes(tmp_path / "classified", src, pyproject=pyproject) == ["FAP001"]


def _pyproject(tmp_path: pathlib.Path, text: str) -> pathlib.Path:
    path = tmp_path / "pyproject.toml"
    path.write_text(textwrap.dedent(text))
    return path


def test_check_deps_names_unclassified_and_stale(tmp_path):
    path = _pyproject(
        tmp_path,
        """
        [project]
        dependencies = [
            "fastapi[standard]>=0.115",
            "Email_Validator==2.2",
            "weasyprint>=60",
            "inhouse @ git+https://example.com/inhouse.git",
        ]
        [tool.lint-kit-fastapi.dependencies]
        inhouse = "async only"
        gone = ["gone.call"]
        """,
    )
    assert unclassified(path) == (["weasyprint"], ["gone"])
    assert main(["check-deps", str(path)]) == 1


def test_check_deps_passes_when_everything_is_classified(tmp_path, capsys):
    path = _pyproject(
        tmp_path,
        """
        [project]
        dependencies = ["fastapi", "bcrypt", "httpx"]
        """,
    )
    assert main(["check-deps", str(path)]) == 0
    assert capsys.readouterr().out == ""


def test_settings_default_and_override(tmp_path):
    assert load_settings(tmp_path / "missing.toml").app == "app"
    path = _pyproject(
        tmp_path,
        """
        [tool.lint-kit-fastapi]
        app = "backend"
        [tool.lint-kit-fastapi.dependencies]
        Pillow = "only used offline"
        """,
    )
    settings = load_settings(path)
    assert settings.app == "backend"
    # a project entry overrides the built-in one: PIL.Image.open is no longer blocking
    assert "PIL.Image.open" not in settings.blocking_calls
    assert "time.sleep" in settings.blocking_calls


def test_cli_usage():
    assert main([]) == 2
