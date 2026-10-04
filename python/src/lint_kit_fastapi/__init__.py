"""FastAPI rules ruff does not have, as a flake8 plugin (codes FAP0xx).

Sources: the FastAPI 0.135.1 docs and the skill FastAPI ships in the package
(`fastapi/.agents/skills/fastapi`). Rules ruff already has stay in ruff: `lint-kit init` adds
FAST and ASYNC to the ruff config's extend-select. This file holds only what ruff cannot express.

Run: `flake8 <app>` (select FAP in .flake8). Settings, in pyproject.toml:

    [tool.lint-kit-fastapi]
    app = "app"          # the application package, relative to pyproject.toml

    [tool.lint-kit-fastapi.dependencies]   # FAP001's classification of your dependencies
    mylib = ["mylib.render", "mylib.Client."]   # calls into it that block the event loop
    otherlib = "async client only"              # or why it is safe in async code

Common libraries come classified (KNOWN_DEPENDENCIES); `lint-kit-fastapi check-deps` fails
while a [project.dependencies] entry is classified nowhere.
Suppress one line with `# noqa: FAP0xx — <reason>`; the reason is the review record.

  FAP001  blocking work (bcrypt, openpyxl, reportlab, pandas reads, boto3, sleep, subprocess…)
          reached from async def, directly or through sync helpers; offload with asyncer's
          asyncify
  FAP002  Pydantic v1 `class Config:` -> model_config = ConfigDict(...)
  FAP003  `...` as a default (Field(...), Query(...), `x: T = ...`)
  FAP004  `x: T = Depends(...)` outside routes (ruff FAST002 covers routes) -> Annotated
  FAP005  a class as its own dependency, `Depends()`
  FAP006  prefix/tags/dependencies/responses on include_router() instead of APIRouter()
  FAP007  a route without a return annotation or response_model
  FAP008  more than one HTTP method per function
  FAP009  deprecated regex=, example=, min_items=, max_items=, openapi_prefix=, on_event
  FAP010  a yield dependency that swallows an exception or yields more than once
  FAP011  HTTPException raised in a WebSocket handler
  FAP012  File/Form together with a JSON Body() in one route
  FAP013  response_model_include / response_model_exclude
  FAP014  building a StreamingResponse
  FAP015  a guard (a dependency some dependencies=[...] lists) that every route of a router
          declares, instead of the router declaring it once
  FAP016  an inline Annotated[T, Depends(f)] that has, or needs, a type alias
  FAP017  bare status numbers, and fastapi.status's deprecated names

Three rules need the whole project, not one file: FAP001 (blocking work reached through
sync helpers in other modules), FAP010 (which generators are dependencies) and FAP016
(how often a dependency is spelled inline). The plugin indexes the app package once per
process.
"""

from __future__ import annotations

import ast
import pathlib
import re
import tomllib
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass, field
from functools import cache

from fastapi import status

ROUTE_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "options", "trace"})
PARAM_FUNCTIONS = frozenset(
    {"Query", "Path", "Body", "Header", "Cookie", "Form", "File", "Depends", "Security"}
)
PYDANTIC_OR_PARAM = PARAM_FUNCTIONS | {"Field"}

# Libraries classified for FAP001, by distribution name: either the calls into it that block the
# event loop (prefixes of the fully qualified name a call resolves to), or why it is safe to call
# from async code. A project adds or overrides entries in [tool.lint-kit-fastapi.dependencies].
KNOWN_DEPENDENCIES: dict[str, tuple[str, ...] | str] = {
    "bcrypt": ("bcrypt.hashpw", "bcrypt.checkpw", "bcrypt.kdf"),  # ~160 ms of CPU per hash
    "passlib": ("passlib.",),  # password hashing: CPU-bound by design
    "boto3": ("boto3.client.",),  # every AWS client method is a network call (_boto3_clients)
    "openpyxl": ("openpyxl.Workbook", "openpyxl.load_workbook"),  # CPU-bound build and .save()
    "pandas": ("pandas.read_", "pandas.ExcelFile"),  # parses whole files
    "reportlab": (
        "reportlab.platypus.SimpleDocTemplate",  # .build() renders the PDF
        "reportlab.pdfbase.ttfonts.TTFont",  # reads and parses a font file
    ),
    "pillow": ("PIL.Image.open",),  # decoding; resize / save then run on the returned image
    "redis": ("redis.Redis", "redis.StrictRedis", "redis.from_url"),  # redis.asyncio is safe
    "requests": ("requests.",),  # synchronous HTTP
    "psycopg2": ("psycopg2.connect",),
    "psycopg2-binary": ("psycopg2.connect",),
    "pymongo": ("pymongo.MongoClient",),  # pymongo's AsyncMongoClient is safe
    "email-validator": ("email_validator.validate_email",),  # DNS lookup unless told not to
    "apscheduler": "AsyncIOScheduler runs on the loop; sync jobs go to its thread pool",
    "asyncer": "the offloading tool itself",
    "aiofiles": "async file I/O",
    "anyio": "async primitives",
    "beanie": "async ODM over pymongo's async client",
    "motor": "async MongoDB driver",
    "asyncpg": "async PostgreSQL driver",
    "fastapi": "the framework",
    "starlette": "the framework under FastAPI",
    "httpx": "the async client; ruff ASYNC210/212 flag the sync API in async code",
    "pydantic": "in-memory validation",
    "pydantic-settings": "read once at startup",
    "python-dotenv": "read once at startup",
    "python-bidi": "reorders short strings",
    "python-dateutil": "date arithmetic",
    "python-jose": "JWT signing, microseconds for HS256",
    "pyjwt": "JWT signing, microseconds for HS256",
    "python-multipart": "used by FastAPI to parse forms",
    "scalar-fastapi": "serves the API docs page",
    "orjson": "in-memory serialisation",
    "uvicorn": "the server",
    "gunicorn": "the server",
}

# The standard library's blocking calls, always on.
STDLIB_BLOCKING = ("time.sleep", "subprocess.", "os.system")


@dataclass(frozen=True)
class Settings:
    app: str = "app"
    dependencies: tuple[tuple[str, tuple[str, ...] | str], ...] = ()

    @property
    def classified(self) -> dict[str, tuple[str, ...] | str]:
        return {**KNOWN_DEPENDENCIES, **dict(self.dependencies)}

    @property
    def blocking_calls(self) -> tuple[str, ...]:
        calls = (c for v in self.classified.values() if isinstance(v, tuple) for c in v)
        return (*calls, *STDLIB_BLOCKING)


def _normalise(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def load_settings(pyproject: pathlib.Path) -> Settings:
    """[tool.lint-kit-fastapi] from a pyproject.toml; defaults when it is absent."""
    data = tomllib.loads(pyproject.read_text(encoding="utf-8")) if pyproject.is_file() else {}
    table = data.get("tool", {}).get("lint-kit-fastapi", {})
    deps = tuple(
        (_normalise(k), tuple(v) if isinstance(v, list) else str(v))
        for k, v in table.get("dependencies", {}).items()
    )
    return Settings(app=table.get("app", "app"), dependencies=deps)


def unclassified(pyproject: pathlib.Path) -> tuple[list[str], list[str]]:
    """([project.dependencies] classified nowhere, [tool.lint-kit-fastapi.dependencies] entries
    that are no longer a dependency)."""
    data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
    declared = {
        _normalise(re.split(r"[\[<>=!~ ;@]", dep, maxsplit=1)[0])
        for dep in data.get("project", {}).get("dependencies", [])
    }
    settings = load_settings(pyproject)
    known = {_normalise(k) for k in settings.classified}
    stale = [k for k, _ in settings.dependencies if k not in declared]
    return sorted(declared - known), sorted(stale)


# boto3 client methods that do not touch the network: they sign a URL locally.
BOTO3_LOCAL_METHODS = frozenset({"generate_presigned_url", "generate_presigned_post"})

# fastapi.status is starlette.status, which keeps renamed constants as deprecated aliases.
DEPRECATED_STATUS = {
    old: next(
        n
        for n in dir(status)
        if n.startswith("HTTP_") and n not in status.__deprecated__ and getattr(status, n) == code
    )
    for old, code in status.__deprecated__.items()
}
STATUS_NAMES = {
    getattr(status, n): n
    for n in dir(status)
    if n.startswith("HTTP_") and n not in status.__deprecated__
}

# Keyword arguments FastAPI or Pydantic deprecated, per callee.
DEPRECATED_KWARGS = {
    "regex": ("pattern", "deprecated since FastAPI 0.100 / Pydantic v2", PARAM_FUNCTIONS),
    "example": ("examples=[...]", "deprecated by OpenAPI 3.1 and FastAPI", PYDANTIC_OR_PARAM),
    "min_items": ("min_length", "deprecated in Pydantic v2", PYDANTIC_OR_PARAM),
    "max_items": ("max_length", "deprecated in Pydantic v2", PYDANTIC_OR_PARAM),
    "openapi_prefix": ("root_path", "deprecated in FastAPI", frozenset({"FastAPI"})),
}


def _name(node: ast.AST) -> str | None:
    """The last dotted segment of a callee: `Depends`, `fastapi.Depends` -> "Depends"."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _route_decorator(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> ast.Call | None:
    for dec in fn.decorator_list:
        if (
            isinstance(dec, ast.Call)
            and isinstance(dec.func, ast.Attribute)
            and dec.func.attr in ROUTE_METHODS
        ):
            return dec
    return None


def _is_websocket(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    return any(isinstance(d, ast.Call) and _name(d.func) == "websocket" for d in fn.decorator_list)


def _own_nodes(fn: ast.AST) -> Iterator[ast.AST]:
    """Nodes that run as part of `fn` itself: not inside nested defs, lambdas or classes."""
    stack = list(ast.iter_child_nodes(fn))
    while stack:
        node = stack.pop()
        yield node
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda | ast.ClassDef):
            continue
        stack.extend(ast.iter_child_nodes(node))


def _annotated_metadata(ann: ast.AST | None) -> list[ast.AST]:
    if isinstance(ann, ast.Subscript) and _name(ann.value) == "Annotated":
        elts = ann.slice.elts if isinstance(ann.slice, ast.Tuple) else [ann.slice]
        return list(elts[1:])
    return []


def _inline_depends_key(ann: ast.AST | None) -> str | None:
    """`Annotated[T, Depends(f)]` spelled in a signature -> its source, the key for FAP016."""
    if any(
        isinstance(m, ast.Call) and _name(m.func) == "Depends" for m in _annotated_metadata(ann)
    ):
        return ast.unparse(ann)
    return None


def _dependencies_kw(call: ast.Call) -> list[ast.Call]:
    """The Depends(...) calls in a call's `dependencies=[...]`."""
    for kw in call.keywords:
        if kw.arg == "dependencies" and isinstance(kw.value, ast.List | ast.Tuple):
            return [
                e for e in kw.value.elts if isinstance(e, ast.Call) and _name(e.func) == "Depends"
            ]
    return []


def _all_args(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> list[tuple[ast.arg, ast.AST | None]]:
    """(parameter, default) pairs, positional and keyword-only."""
    a = fn.args
    positional = a.posonlyargs + a.args
    defaults: list[ast.AST | None] = [None] * (len(positional) - len(a.defaults)) + list(a.defaults)
    return list(zip(positional, defaults, strict=True)) + list(
        zip(a.kwonlyargs, a.kw_defaults, strict=True)
    )


# ── Project index ────────────────────────────────────────────────────────────────


@dataclass
class _Function:
    module: str
    qualname: str
    is_async: bool
    node: ast.FunctionDef | ast.AsyncFunctionDef
    calls: list[tuple[ast.Call, str]] = field(default_factory=list)  # (call, resolved target)


@dataclass
class _Module:
    name: str
    imports: dict[str, str]  # local name -> fully qualified ("bcrypt", "app.core.security.x")
    functions: dict[str, _Function]  # qualname -> function
    # class name ("" for module level) -> attributes holding a boto3 client or resource
    clients: dict[str, set[str]] = field(default_factory=dict)


@dataclass
class _Project:
    modules: dict[str, _Module]
    blocking: dict[str, str]  # "module:qualname" of a sync function -> the root call it reaches
    dependency_generators: set[str]  # "module:qualname" of generators passed to Depends()
    inline_depends: Counter[str]  # Annotated[...] source -> signatures spelling it inline
    aliases: dict[str, str]  # Annotated[...] source -> "module.Alias" declared for it
    synonyms: dict[str, str]  # "module.name" -> "module.other" for a module-level `name = other`
    alias_depends: dict[str, ast.expr]  # "module.Alias" -> the Depends(...) inside its Annotated
    guards: set[str] = field(default_factory=set)  # canonical deps some dependencies=[...] lists
    blocking_calls: tuple[str, ...] = ()  # prefixes of external calls that block

    def canonical(self, mod: _Module, node: ast.expr) -> str:
        """A dependency callable as a module-independent key: `CurrentAdmin`'s Depends,
        `get_current_admin_user` (a synonym) and `get_current_admin` all compare equal."""
        if isinstance(node, ast.Call):
            args = ", ".join(ast.unparse(a) for a in [*node.args, *node.keywords])
            return f"{self.canonical(mod, node.func)}({args})"
        text = ast.unparse(node)
        head = text.split(".")[0]
        if head in mod.imports:
            fq = mod.imports[head] + text[len(head) :]
        elif head in mod.functions or f"{mod.name}.{head}" in self.synonyms:
            fq = f"{mod.name}.{text}"
        else:
            return text
        seen = set()
        while fq in self.synonyms and fq not in seen:
            seen.add(fq)
            fq = self.synonyms[fq]
        return fq

    def depends_key(self, mod: _Module, ann: ast.expr | None) -> str | None:
        """The canonical dependency a parameter annotation carries, inline or through an
        alias; an alias's Depends(...) is resolved in the module that declares the alias."""
        for meta in _annotated_metadata(ann):
            if isinstance(meta, ast.Call) and _name(meta.func) == "Depends" and meta.args:
                return self.canonical(mod, meta.args[0])
        if isinstance(ann, ast.Name):
            fq = mod.imports.get(ann.id, f"{mod.name}.{ann.id}")
            dep = self.alias_depends.get(fq)
            home = self.modules.get(fq.rsplit(".", 1)[0])
            if isinstance(dep, ast.Call) and dep.args and home:
                return self.canonical(home, dep.args[0])
        return None


def _module_name(root: pathlib.Path, path: pathlib.Path) -> str:
    return ".".join(path.relative_to(root).with_suffix("").parts)


def _imports(tree: ast.Module, module: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                out[a.asname or a.name.split(".")[0]] = a.name if a.asname else a.name.split(".")[0]
        elif isinstance(node, ast.ImportFrom) and node.module:
            base = node.module
            if node.level:
                base = ".".join(module.split(".")[: -node.level] + [node.module])
            for a in node.names:
                out[a.asname or a.name] = f"{base}.{a.name}"
    return out


def _is_boto3_client(node: ast.expr, mod: _Module, cls: str | None) -> bool:
    """`self.client` / `self._client` / a module-level `s3` that holds a boto3 client."""
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        return node.value.id == "self" and node.attr in mod.clients.get(cls or "", set())
    return isinstance(node, ast.Name) and node.id in mod.clients.get("", set())


def _boto3_clients(tree: ast.Module, imports: dict[str, str]) -> dict[str, set[str]]:
    """Per class, the attributes assigned `boto3.client(...)` / `boto3.resource(...)`, plus the
    properties returning one of them; at module level, the names assigned one."""

    def makes_client(value: ast.expr | None) -> bool:
        if not isinstance(value, ast.Call):
            return False
        text = ast.unparse(value.func)
        head = text.split(".")[0]
        fq = imports.get(head, head) + text[len(head) :]
        return fq in ("boto3.client", "boto3.resource")

    out: dict[str, set[str]] = {"": set()}
    for node in tree.body:
        if isinstance(node, ast.Assign) and makes_client(node.value):
            out[""] |= {t.id for t in node.targets if isinstance(t, ast.Name)}
        if not isinstance(node, ast.ClassDef):
            continue
        attrs: set[str] = set()
        for sub in ast.walk(node):
            if isinstance(sub, ast.Assign | ast.AnnAssign) and makes_client(sub.value):
                targets = sub.targets if isinstance(sub, ast.Assign) else [sub.target]
                attrs |= {
                    t.attr
                    for t in targets
                    if isinstance(t, ast.Attribute) and ast.unparse(t.value) == "self"
                }
        methods = [f for f in node.body if isinstance(f, ast.FunctionDef)]
        changed = True
        while changed:
            changed = False
            for f in methods:
                is_property = any(ast.unparse(d) == "property" for d in f.decorator_list)
                returns = [
                    r.value
                    for r in ast.walk(f)
                    if isinstance(r, ast.Return)
                    and isinstance(r.value, ast.Attribute)
                    and ast.unparse(r.value.value) == "self"
                ]
                if is_property and f.name not in attrs and any(r.attr in attrs for r in returns):
                    attrs.add(f.name)
                    changed = True
        out[node.name] = attrs
    return out


def _resolve(call: ast.Call, mod: _Module, cls: str | None) -> str | None:
    """A call's target as "module:qualname" (project) or a dotted external name."""
    func = call.func
    if isinstance(func, ast.Name):
        if func.id in mod.functions:
            return f"{mod.name}:{func.id}"
        return mod.imports.get(func.id)
    if isinstance(func, ast.Attribute) and _is_boto3_client(func.value, mod, cls):
        if func.attr in BOTO3_LOCAL_METHODS:
            return None
        return f"boto3.client.{func.attr}"
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        head = func.value.id
        if head in ("self", "cls") and cls:
            return f"{mod.name}:{cls}.{func.attr}"
        if head in mod.functions or any(q.startswith(f"{head}.") for q in mod.functions):
            return f"{mod.name}:{head}.{func.attr}"
        if head in mod.imports:
            return f"{mod.imports[head]}.{func.attr}"
    return None


def _project_target(target: str, project: dict[str, _Module]) -> str | None:
    """Map `app.core.security.verify_password` to "app.core.security:verify_password"."""
    if ":" in target:
        return target
    parts = target.split(".")
    for i in range(len(parts) - 1, 0, -1):
        mod = ".".join(parts[:i])
        if mod in project:
            return f"{mod}:{'.'.join(parts[i:])}"
    return None


@cache
def _project(root: pathlib.Path, settings: Settings) -> _Project:
    blocking_calls = settings.blocking_calls
    app = root / settings.app
    modules: dict[str, _Module] = {}
    trees: dict[str, ast.Module] = {}
    for path in sorted(app.rglob("*.py")):
        name = _module_name(app.parent, path)
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        trees[name] = tree
        imports = _imports(tree, name)
        mod = _Module(name, imports, {}, _boto3_clients(tree, imports))
        for node in tree.body:
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                mod.functions[node.name] = _Function(
                    name, node.name, isinstance(node, ast.AsyncFunctionDef), node
                )
            elif isinstance(node, ast.ClassDef):
                for sub in node.body:
                    if isinstance(sub, ast.FunctionDef | ast.AsyncFunctionDef):
                        q = f"{node.name}.{sub.name}"
                        mod.functions[q] = _Function(
                            name, q, isinstance(sub, ast.AsyncFunctionDef), sub
                        )
        modules[name] = mod

    for mod in modules.values():
        for fn in mod.functions.values():
            cls = fn.qualname.split(".")[0] if "." in fn.qualname else None
            for node in _own_nodes(fn.node):
                if isinstance(node, ast.Call):
                    target = _resolve(node, mod, cls)
                    if target:
                        fn.calls.append((node, target))

    # A sync function blocks when it calls a blocking API or another blocking sync function.
    blocking: dict[str, str] = {}
    changed = True
    while changed:
        changed = False
        for mod in modules.values():
            for fn in mod.functions.values():
                key = f"{mod.name}:{fn.qualname}"
                if fn.is_async or key in blocking:
                    continue
                for _, target in fn.calls:
                    root_call = _blocking_root(target, modules, blocking, blocking_calls)
                    if root_call:
                        blocking[key] = root_call
                        changed = True
                        break

    dependency_generators: set[str] = set()
    inline: Counter[str] = Counter()
    aliases: dict[str, str] = {}
    synonyms: dict[str, str] = {}
    alias_depends: dict[str, ast.expr] = {}
    for name, tree in trees.items():
        mod = modules[name]
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and _name(node.func) == "Depends" and node.args:
                arg = node.args[0]
                if isinstance(arg, ast.Name | ast.Attribute):
                    target = _resolve(ast.Call(func=arg, args=[], keywords=[]), mod, None)
                    target = target and _project_target(target, modules)
                    if target:
                        dependency_generators.add(target)
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                for arg, _ in _all_args(node):
                    key = _inline_depends_key(arg.annotation)
                    if key:
                        inline[key] += 1
        for node in tree.body:
            if (
                isinstance(node, ast.Assign)
                and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name)
            ):
                target_name = node.targets[0].id
                key = _inline_depends_key(node.value)
                if key:
                    aliases.setdefault(key, f"{name}.{target_name}")
                    alias_depends[f"{name}.{target_name}"] = next(
                        m
                        for m in _annotated_metadata(node.value)
                        if isinstance(m, ast.Call) and _name(m.func) == "Depends"
                    )
                if isinstance(node.value, ast.Name):
                    other = node.value.id
                    fq = mod.imports.get(other, f"{name}.{other}")
                    synonyms[f"{name}.{target_name}"] = fq
    generators = {
        f"{m.name}:{f.qualname}"
        for m in modules.values()
        for f in m.functions.values()
        if any(isinstance(n, ast.Yield | ast.YieldFrom) for n in _own_nodes(f.node))
    }
    project = _Project(
        modules,
        blocking,
        dependency_generators & generators,
        inline,
        aliases,
        synonyms,
        alias_depends,
        blocking_calls=blocking_calls,
    )
    # A dependency listed in some dependencies=[...] is run for its effect (a guard). Only those
    # belong on a router: a service every route needs is still read through each parameter.
    for name, tree in trees.items():
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                for d in _dependencies_kw(node):
                    if d.args:
                        project.guards.add(project.canonical(modules[name], d.args[0]))
    return project


def _blocking_root(
    target: str, modules: dict[str, _Module], blocking: dict[str, str], calls: tuple[str, ...]
) -> str | None:
    if target.startswith(calls):
        return target
    local = _project_target(target, modules)
    if local is None:
        return None
    if local in blocking:
        return blocking[local]
    # A class call runs __init__.
    mod, _, qual = local.partition(":")
    init = f"{mod}:{qual}.__init__"
    return blocking.get(init)


@cache
def _find_root(directory: pathlib.Path) -> tuple[pathlib.Path, Settings] | None:
    """The nearest pyproject.toml above a file whose app package holds the file."""
    for parent in (directory, *directory.parents):
        pyproject = parent / "pyproject.toml"
        if pyproject.is_file():
            settings = load_settings(pyproject)
            app = (parent / settings.app).resolve()
            if app.is_dir() and (directory == app or app in directory.parents):
                return parent, settings
    return None


# ── The checker ──────────────────────────────────────────────────────────────────


class Plugin:
    name = "lint-kit-fastapi"
    version = "0.2.0"

    def __init__(self, tree: ast.Module, filename: str) -> None:
        self.tree = tree
        self.filename = filename

    def run(self) -> Iterator[tuple[int, int, str, type]]:
        path = pathlib.Path(self.filename).resolve()
        found = _find_root(path.parent)
        project = _project(*found) if found else None
        app = (found[0] / found[1].app).resolve() if found else None
        module = _module_name(app.parent, path) if app else ""
        for line, col, msg in self._check(project, module):
            yield line, col, msg, type(self)

    def _check(self, project: _Project | None, module: str) -> Iterator[tuple[int, int, str]]:
        tree = self.tree
        mod = project.modules.get(module) if project else None
        if project and mod:
            yield from self._router_dependencies(project, mod)
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                yield from self._class(node)
            elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                yield from self._function(node, project, mod)
            elif isinstance(node, ast.Call):
                yield from self._call(node)
            elif isinstance(node, ast.Attribute) and node.attr in DEPRECATED_STATUS:
                yield (
                    node.lineno,
                    node.col_offset,
                    f"FAP017 status.{node.attr} is a deprecated alias; use "
                    f"status.{DEPRECATED_STATUS[node.attr]}",
                )

    # FAP015
    def _router_dependencies(
        self, project: _Project, mod: _Module
    ) -> Iterator[tuple[int, int, str]]:
        """A guard every route of a router declares belongs on the router (FastAPI skill:
        "Apply shared dependencies at the router level via dependencies=[Depends(...)]").
        Routes that read its value keep their parameter; FastAPI runs it once per request."""
        routers: dict[str, ast.Call] = {}
        for node in self.tree.body:
            if (
                isinstance(node, ast.Assign)
                and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name)
                and isinstance(node.value, ast.Call)
                and _name(node.value.func) == "APIRouter"
            ):
                routers[node.targets[0].id] = node.value
        routes: dict[str, list[tuple[ast.Call, set[str]]]] = {r: [] for r in routers}
        for fn in ast.walk(self.tree):
            if not isinstance(fn, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            for dec in fn.decorator_list:
                if not (
                    isinstance(dec, ast.Call)
                    and isinstance(dec.func, ast.Attribute)
                    and isinstance(dec.func.value, ast.Name)
                    and dec.func.value.id in routers
                    and dec.func.attr in ROUTE_METHODS | {"websocket", "api_route"}
                ):
                    continue
                keys = {project.canonical(mod, d.args[0]) for d in _dependencies_kw(dec) if d.args}
                for arg, _ in _all_args(fn):
                    key = project.depends_key(mod, arg.annotation)
                    if key:
                        keys.add(key)
                routes[dec.func.value.id].append((dec, keys))
        for name, router in routers.items():
            own = {project.canonical(mod, d.args[0]) for d in _dependencies_kw(router) if d.args}
            entries = routes[name]
            if len(entries) > 1:
                shared = set.intersection(*(k for _, k in entries)) & project.guards
                for key in sorted(shared - own):
                    yield (
                        router.lineno,
                        router.col_offset,
                        f"FAP015 all {len(entries)} routes of `{name}` depend on "
                        f"{key.rsplit('.', 1)[-1]}; declare it once on "
                        f"APIRouter(dependencies=[Depends(...)]) (FastAPI skill)",
                    )
            for dec, _ in entries:
                for d in _dependencies_kw(dec):
                    if d.args and project.canonical(mod, d.args[0]) in own:
                        yield (
                            d.lineno,
                            d.col_offset,
                            f"FAP015 `{name}` already declares this dependency; drop it here",
                        )

    # FAP002, FAP003 (class bodies)
    def _class(self, cls: ast.ClassDef) -> Iterator[tuple[int, int, str]]:
        for stmt in cls.body:
            if isinstance(stmt, ast.ClassDef) and stmt.name == "Config":
                yield (
                    stmt.lineno,
                    stmt.col_offset,
                    "FAP002 `class Config:` is Pydantic v1 configuration, deprecated in v2; "
                    "use `model_config = ConfigDict(...)`",
                )
            if (
                isinstance(stmt, ast.AnnAssign)
                and isinstance(stmt.value, ast.Constant)
                and stmt.value.value is Ellipsis
            ):
                yield (
                    stmt.value.lineno,
                    stmt.value.col_offset,
                    "FAP003 a field without a default is already required; drop `= ...` "
                    "(FastAPI skill)",
                )

    def _function(
        self,
        fn: ast.FunctionDef | ast.AsyncFunctionDef,
        project: _Project | None,
        mod: _Module | None,
    ) -> Iterator[tuple[int, int, str]]:
        route = _route_decorator(fn)
        args = _all_args(fn)

        # FAP004: Annotated in every signature FastAPI reads, not only routes (ruff FAST002).
        if route is None:
            for arg, default in args:
                if isinstance(default, ast.Call) and _name(default.func) in PARAM_FUNCTIONS:
                    yield (
                        default.lineno,
                        default.col_offset,
                        f"FAP004 declare `{arg.arg}` as "
                        f"`Annotated[T, {_name(default.func)}(...)]`, not as a default value "
                        "(FastAPI skill: the same rules apply to dependencies)",
                    )

        # FAP016: one type alias per dependency spelled in more than one signature.
        if project:
            for arg, _ in args:
                key = _inline_depends_key(arg.annotation)
                if not key:
                    continue
                alias = project.aliases.get(key)
                if alias:
                    yield (
                        arg.annotation.lineno,
                        arg.annotation.col_offset,
                        f"FAP016 use the alias `{alias.rsplit('.', 1)[1]}` "
                        f"({alias.rsplit('.', 1)[0]}) instead of spelling `{key}` inline",
                    )
                elif project.inline_depends[key] > 1:
                    yield (
                        arg.annotation.lineno,
                        arg.annotation.col_offset,
                        f"FAP016 `{key}` is spelled in {project.inline_depends[key]} signatures; "
                        "declare it once as a type alias and use that (FastAPI skill)",
                    )

        if route is not None:
            yield from self._route(fn, route, args)

        if isinstance(fn, ast.AsyncFunctionDef) and project and mod:
            yield from self._blocking(fn, project, mod)

        if project and mod:
            cls = self._enclosing_class(fn)
            key = f"{mod.name}:{cls + '.' if cls else ''}{fn.name}"
            if key in project.dependency_generators:
                yield from self._yield_dependency(fn)

        if _is_websocket(fn):
            for node in _own_nodes(fn):
                if (
                    isinstance(node, ast.Raise)
                    and node.exc is not None
                    and _name(node.exc.func if isinstance(node.exc, ast.Call) else node.exc)
                    == "HTTPException"
                ):
                    yield (
                        node.lineno,
                        node.col_offset,
                        "FAP011 a WebSocket has no HTTP response to send; raise "
                        "WebSocketException(code=status.WS_...) instead",
                    )

    def _enclosing_class(self, fn: ast.AST) -> str | None:
        for node in ast.walk(self.tree):
            if isinstance(node, ast.ClassDef) and fn in node.body:
                return node.name
        return None

    # FAP007, FAP008, FAP012, FAP013
    def _route(
        self,
        fn: ast.FunctionDef | ast.AsyncFunctionDef,
        route: ast.Call,
        args: list[tuple[ast.arg, ast.AST | None]],
    ) -> Iterator[tuple[int, int, str]]:
        keywords = {k.arg: k for k in route.keywords}
        if fn.returns is None and "response_model" not in keywords:
            yield (
                fn.lineno,
                fn.col_offset,
                "FAP007 declare the response type as a return annotation (or response_model= "
                "when it differs); it validates, filters and documents the response",
            )
        methods = [
            d
            for d in fn.decorator_list
            if isinstance(d, ast.Call) and _name(d.func) in ROUTE_METHODS
        ]
        if len(methods) > 1:
            yield (
                fn.lineno,
                fn.col_offset,
                "FAP008 one HTTP operation per function; split this into one function per "
                "method (FastAPI skill)",
            )
        for name in ("response_model_include", "response_model_exclude"):
            if name in keywords:
                yield (
                    keywords[name].value.lineno,
                    keywords[name].value.col_offset,
                    f"FAP013 {name}= still documents the full model in OpenAPI; declare a "
                    "response model with only the fields to send",
                )
        markers = set()
        for arg, default in args:
            for meta in [*_annotated_metadata(arg.annotation), default]:
                if isinstance(meta, ast.Call):
                    markers.add(_name(meta.func))
            if isinstance(arg.annotation, ast.Name) and arg.annotation.id == "UploadFile":
                markers.add("File")
        if markers & {"File", "Form"} and "Body" in markers:
            yield (
                fn.lineno,
                fn.col_offset,
                "FAP012 File/Form make the request multipart, so a JSON Body() field cannot "
                "arrive with them; send it as a Form field or use a second endpoint",
            )

    # FAP001
    def _blocking(
        self, fn: ast.AsyncFunctionDef, project: _Project, mod: _Module
    ) -> Iterator[tuple[int, int, str]]:
        cls = self._enclosing_class(fn)
        for node in _own_nodes(fn):
            if not isinstance(node, ast.Call):
                continue
            target = _resolve(node, mod, cls)
            if not target:
                continue
            root_call = _blocking_root(
                target, project.modules, project.blocking, project.blocking_calls
            )
            if root_call:
                shown = ast.unparse(node.func)
                via = "" if root_call == target else f" (it reaches {root_call})"
                yield (
                    node.lineno,
                    node.col_offset,
                    f"FAP001 `{shown}()` blocks the event loop{via}; call it as "
                    f"`await asyncify({shown})(...)`, or make this function a plain def",
                )

    # FAP010
    def _yield_dependency(
        self, fn: ast.FunctionDef | ast.AsyncFunctionDef
    ) -> Iterator[tuple[int, int, str]]:
        yields = [n for n in _own_nodes(fn) if isinstance(n, ast.Yield | ast.YieldFrom)]
        if len(yields) > 1:
            yield (
                yields[1].lineno,
                yields[1].col_offset,
                "FAP010 a dependency with yield must yield exactly once",
            )
        for node in _own_nodes(fn):
            if isinstance(node, ast.Try) and any(
                isinstance(n, ast.Yield | ast.YieldFrom)
                for n in ast.walk(ast.Module(node.body, []))
            ):
                for handler in node.handlers:
                    if not any(isinstance(n, ast.Raise) for n in ast.walk(handler)):
                        yield (
                            handler.lineno,
                            handler.col_offset,
                            "FAP010 an except around a dependency's yield must re-raise (or raise "
                            "HTTPException); otherwise the error is swallowed and never logged",
                        )

    def _call(self, call: ast.Call) -> Iterator[tuple[int, int, str]]:
        callee = _name(call.func)
        keywords = {k.arg: k for k in call.keywords if k.arg}

        # FAP003: `...` as a default in Field/Query/... — the skill's "no Ellipsis".
        if callee in PYDANTIC_OR_PARAM:
            first = (
                call.args[0] if call.args else keywords.get("default") and keywords["default"].value
            )
            if isinstance(first, ast.Constant) and first.value is Ellipsis:
                yield (
                    first.lineno,
                    first.col_offset,
                    f"FAP003 `{callee}(...)`: required is the default; drop the `...` "
                    "(FastAPI skill)",
                )

        # FAP014: the skill streams by yielding from the route; a built StreamingResponse is
        # either fake streaming (content already in memory) or the pattern it replaces.
        if callee == "StreamingResponse":
            yield (
                call.lineno,
                call.col_offset,
                "FAP014 don't build a StreamingResponse: for content already in memory return "
                "Response(content, media_type=...); to stream, yield from the route with "
                "response_class= (FastAPI skill)",
            )

        # FAP005: a class as its own dependency.
        if callee == "Depends" and not call.args and "dependency" not in keywords:
            yield (
                call.lineno,
                call.col_offset,
                "FAP005 don't use a class as a dependency (`Depends()`); write a function "
                "that returns the instance and depend on it (FastAPI skill)",
            )

        # FAP006: router parameters belong on the APIRouter.
        if callee == "include_router":
            for name in ("prefix", "tags", "dependencies", "responses"):
                if name in keywords:
                    yield (
                        keywords[name].value.lineno,
                        keywords[name].value.col_offset,
                        f"FAP006 set {name}= on the APIRouter(...) itself, not in "
                        "include_router() (FastAPI skill)",
                    )

        # FAP008: api_route / add_api_route with several methods.
        if callee in ("api_route", "add_api_route") and "methods" in keywords:
            methods = keywords["methods"].value
            if isinstance(methods, ast.List | ast.Tuple | ast.Set) and len(methods.elts) > 1:
                yield (
                    call.lineno,
                    call.col_offset,
                    "FAP008 one HTTP operation per function; declare one route per method "
                    "(FastAPI skill)",
                )

        # FAP009: deprecated keyword arguments and on_event.
        for kw, (instead, why, callees) in DEPRECATED_KWARGS.items():
            if kw in keywords and callee in callees:
                yield (
                    keywords[kw].lineno,
                    keywords[kw].col_offset,
                    f"FAP009 {kw}= is {why}; use {instead}",
                )
        if callee == "on_event" and isinstance(call.func, ast.Attribute):
            yield (
                call.lineno,
                call.col_offset,
                "FAP009 on_event is deprecated; use a lifespan context manager "
                "(FastAPI(lifespan=...))",
            )

        # FAP017: status constants instead of bare numbers.
        literal = keywords.get("status_code")
        value = literal.value if literal else None
        if value is None and callee == "HTTPException" and call.args:
            value = call.args[0]
        if isinstance(value, ast.Constant) and type(value.value) is int:
            name = STATUS_NAMES.get(value.value)
            if name:
                yield (
                    value.lineno,
                    value.col_offset,
                    f"FAP017 use status.{name} (from fastapi import status) instead of "
                    f"{value.value}",
                )
