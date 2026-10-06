"""Each FAP rule fires on the shape it names and stays quiet on the fix it asks for."""

from __future__ import annotations

import ast
import pathlib
import textwrap

from fastapi_rules import Plugin


def codes(
    tmp_path: pathlib.Path, files: dict[str, str], target: str = "app/m.py", pyproject: str = ""
) -> list[str]:
    """Lint `target` inside a throwaway project made of `files` (paths under tmp_path)."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    (tmp_path / "pyproject.toml").write_text(pyproject)
    for rel, src in files.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(src))
    path = tmp_path / target
    tree = ast.parse(path.read_text())
    return [msg.split()[0] for _, _, msg, _ in Plugin(tree, str(path)).run()]


def one(tmp_path: pathlib.Path, src: str) -> list[str]:
    return codes(tmp_path, {"app/m.py": src})


# FAP001 ─ blocking work reached from async def


def test_blocking_call_through_a_helper_in_another_module(tmp_path):
    files = {
        "app/security.py": """
            import bcrypt
            def verify(p, h):
                return bcrypt.checkpw(p, h)
        """,
        "app/m.py": """
            from app.security import verify
            async def login(p, h):
                return verify(p, h)
        """,
    }
    assert codes(tmp_path, files) == ["FAP001"]


def test_blocking_call_offloaded_with_asyncify_is_fine(tmp_path):
    files = {
        "app/security.py": "import bcrypt\ndef verify(p, h):\n    return bcrypt.checkpw(p, h)\n",
        "app/m.py": """
            from asyncer import asyncify
            from app.security import verify
            async def login(p, h):
                return await asyncify(verify)(p, h)
            def sync_login(p, h):
                return verify(p, h)
        """,
    }
    assert codes(tmp_path, files) == []


def test_blocking_method_reached_through_self(tmp_path):
    src = """
        from openpyxl import Workbook
        class Export:
            def _build(self):
                return Workbook()
            async def run(self):
                return self._build()
    """
    assert one(tmp_path, src) == ["FAP001"]


# FAP002 / FAP003 ─ Pydantic v2


def test_class_config_is_flagged_model_config_is_not(tmp_path):
    src = """
        from pydantic import BaseModel, ConfigDict
        class A(BaseModel):
            class Config:
                from_attributes = True
        class B(BaseModel):
            model_config = ConfigDict(from_attributes=True)
    """
    assert one(tmp_path, src) == ["FAP002"]


def test_ellipsis_defaults(tmp_path):
    src = """
        from pydantic import BaseModel, Field
        from fastapi import Query
        class A(BaseModel):
            a: int = ...
            b: int = Field(..., gt=0)
            c: int = Field(default=..., gt=0)
            d: int = Field(gt=0)
            e: int
        def f(q: Annotated[int, Query(...)]): ...
    """
    assert one(tmp_path, src) == ["FAP003", "FAP003", "FAP003", "FAP003"]


# FAP004 ─ Annotated in dependencies, not only in routes


def test_default_value_dependency_outside_a_route(tmp_path):
    src = """
        from fastapi import Depends
        async def get_admin(user: User = Depends(get_user)): ...
        async def get_admin2(user: Annotated[User, Depends(get_user)]): ...
    """
    assert one(tmp_path, src) == ["FAP004"]


# FAP005 / FAP006 / FAP008


def test_class_dependency(tmp_path):
    src = """
        from fastapi import Depends
        Dep = Annotated[Paginator, Depends()]
        Dep2 = Annotated[Paginator, Depends(get_paginator)]
    """
    assert one(tmp_path, src) == ["FAP005"]


def test_include_router_parameters(tmp_path):
    src = """
        app.include_router(router, prefix="/admin", tags=["Admin"])
        app.include_router(router)
    """
    assert one(tmp_path, src) == ["FAP006", "FAP006"]


def test_one_operation_per_function(tmp_path):
    src = """
        @router.api_route("/x", methods=["GET", "POST"])
        async def x() -> int: ...
        @router.get("/y")
        @router.post("/y")
        async def y() -> int: ...
        @router.api_route("/z", methods=["GET"])
        async def z() -> int: ...
    """
    assert one(tmp_path, src) == ["FAP008", "FAP008"]


# FAP007 ─ response type


def test_route_without_response_type(tmp_path):
    src = """
        @router.get("/a")
        async def a(): ...
        @router.get("/b")
        async def b() -> Item: ...
        @router.get("/c", response_model=Item)
        async def c(): ...
    """
    assert one(tmp_path, src) == ["FAP007"]


# FAP009 ─ deprecated keywords and on_event


def test_deprecated_keywords(tmp_path):
    src = """
        from fastapi import FastAPI, Query
        from pydantic import Field
        def f(q: Annotated[str, Query(regex="^a")], r: Annotated[str, Query(pattern="^a")]): ...
        x: list[int] = Field(min_items=1, example=[1])
        app = FastAPI(openapi_prefix="/api")
        @app.on_event("startup")
        async def start(): ...
        re.compile("a", regex=1)
    """
    assert sorted(one(tmp_path, src)) == ["FAP009"] * 5


# FAP010 ─ dependencies with yield


def test_yield_dependency_must_reraise_and_yield_once(tmp_path):
    src = """
        from fastapi import Depends
        def get_db():
            db = open_db()
            try:
                yield db
            except ValueError:
                pass
            finally:
                db.close()
        def get_db2():
            try:
                yield 1
            except ValueError:
                raise
        def get_twice():
            yield 1
            yield 2
        def not_a_dependency():
            try:
                yield 1
            except ValueError:
                pass
        DB = Annotated[Db, Depends(get_db)]
        DB2 = Annotated[Db, Depends(get_db2)]
        T = Annotated[int, Depends(get_twice)]
    """
    assert one(tmp_path, src) == ["FAP010", "FAP010"]


# FAP011 / FAP012 / FAP013 / FAP014


def test_http_exception_in_websocket(tmp_path):
    src = """
        @router.websocket("/ws")
        async def ws(websocket: WebSocket):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        @router.get("/h")
        async def h() -> int:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    """
    assert one(tmp_path, src) == ["FAP011"]


def test_form_with_json_body(tmp_path):
    src = """
        @router.post("/a")
        async def a(f: UploadFile, meta: Annotated[Meta, Body()]) -> int: ...
        @router.post("/b")
        async def b(f: UploadFile, name: Annotated[str, Form()]) -> int: ...
    """
    assert one(tmp_path, src) == ["FAP012"]


def test_response_model_include(tmp_path):
    src = """
        @router.get("/a", response_model=Item, response_model_exclude={"secret"})
        async def a() -> Any: ...
    """
    assert one(tmp_path, src) == ["FAP013"]


def test_streaming_response_built(tmp_path):
    src = """
        def export(content):
            return StreamingResponse(iter([content]), media_type="text/csv")
        @router.get("/s", response_class=StreamingResponse)
        async def s() -> AsyncIterable[bytes]:
            yield b"x"
    """
    assert one(tmp_path, src) == ["FAP014"]


# FAP016 ─ one alias per dependency


def test_inline_dependency_used_twice_or_with_an_existing_alias(tmp_path):
    files = {
        "app/deps.py": "CurrentUser = Annotated[User, Depends(get_current_user)]\n",
        "app/m.py": """
            async def a(s: Annotated[Svc, Depends(get_svc)]): ...
            async def b(s: Annotated[Svc, Depends(get_svc)]): ...
            async def c(u: Annotated[User, Depends(get_current_user)]): ...
            async def d(o: Annotated[Other, Depends(get_other)]): ...
            async def e(u: CurrentUser): ...
        """,
    }
    assert codes(tmp_path, files) == ["FAP016", "FAP016", "FAP016"]


# FAP017 ─ status constants


def test_status_literals_and_deprecated_names(tmp_path):
    src = """
        raise HTTPException(404, "x")
        raise HTTPException(status_code=422, detail="x")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        x = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        @router.post("/a", status_code=201)
        async def a() -> int: ...
        r = httpx_response.status_code == 200
    """
    out = one(tmp_path, src)
    assert out == ["FAP017"] * 4


# FAP015 ─ a guard every route of a router declares belongs on the router


ROUTER_DEPS = """
    from fastapi import Depends
    def get_current_user(): ...
    get_current_admin_user = get_current_user
    def get_service(): ...
    CurrentUser = Annotated[User, Depends(get_current_user)]
    ServiceDep = Annotated[Service, Depends(get_service)]
"""


def test_guard_on_every_route_through_param_alias_and_synonym(tmp_path):
    files = {
        "app/deps.py": ROUTER_DEPS,
        "app/m.py": """
            from app.deps import CurrentUser, ServiceDep, get_current_admin_user
            router = APIRouter(prefix="/x")
            @router.get("/a", dependencies=[Depends(get_current_admin_user)])
            async def a(s: ServiceDep) -> int: ...
            @router.get("/b")
            async def b(u: CurrentUser, s: ServiceDep) -> int: ...
        """,
    }
    # the guard is flagged; the service every route reads is not
    assert codes(tmp_path, files) == ["FAP015"]


def test_guard_declared_on_the_router_and_repeated_on_a_route(tmp_path):
    files = {
        "app/deps.py": ROUTER_DEPS,
        "app/m.py": """
            from app.deps import CurrentUser, get_current_user
            router = APIRouter(dependencies=[Depends(get_current_user)])
            @router.get("/a", dependencies=[Depends(get_current_user)])
            async def a() -> int: ...
            @router.get("/b")
            async def b(u: CurrentUser) -> int: ...
        """,
    }
    assert codes(tmp_path, files) == ["FAP015"]


def test_guard_missing_on_one_route_is_not_shared(tmp_path):
    files = {
        "app/deps.py": ROUTER_DEPS,
        "app/m.py": """
            from app.deps import get_current_user
            router = APIRouter()
            @router.get("/a", dependencies=[Depends(get_current_user)])
            async def a() -> int: ...
            @router.get("/public")
            async def b() -> int: ...
        """,
    }
    assert codes(tmp_path, files) == []


def test_boto3_client_calls_block_unless_offloaded_or_local(tmp_path):
    src = """
        import boto3
        from asyncer import asyncify
        class Media:
            def __init__(self):
                self._client = None
            @property
            def client(self):
                if self._client is None:
                    self._client = boto3.client("s3")
                return self._client
            def _delete(self, key):
                self.client.delete_object(Key=key)
            async def upload(self, body):
                self.client.put_object(Body=body)
            async def upload_offloaded(self, body):
                await asyncify(self.client.put_object)(Body=body)
            async def sign(self, key):
                return self.client.generate_presigned_url("get_object", Params={"Key": key})
            async def delete(self, key):
                self._delete(key)
    """
    # put_object directly, and delete_object through the sync helper
    assert one(tmp_path, src) == ["FAP001", "FAP001"]
