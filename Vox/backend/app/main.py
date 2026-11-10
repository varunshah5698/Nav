from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.router import api_router
from .core.config import get_settings
from .core.paths import ensure_paths  # noqa: F401  (import side effect: sys.path)
from .db.base import session_scope
from .db.init import bootstrap_user, initialize
from .workers.processor import AnalysisWorker

logging.basicConfig(
    level=os.environ.get("VOXSAFE_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("voxsafe.api")

settings = get_settings()
worker: AnalysisWorker | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global worker
    initialize(create_tables=not settings.is_production)

    if settings.bootstrap_email and settings.bootstrap_password:
        with session_scope() as session:
            bootstrap_user(
                session,
                email=settings.bootstrap_email,
                password=settings.bootstrap_password,
                name=settings.bootstrap_name,
            )

    worker = AnalysisWorker()
    worker.start()
    log.info(
        "VoxSafe API ready (env=%s, worker=%s)", settings.app_env, worker.name
    )
    try:
        yield
    finally:
        if worker is not None:
            worker.stop()
            worker.join(timeout=5)


app = FastAPI(
    title="VoxSafe API",
    version="1.0.0",
    description=(
        "Acoustic borrower-state estimation with deterministic, escalate-only "
        "policy enforcement and mandatory human handoff. Version 1 scope: "
        "recorded-call intake, risky-moment flagging, audit chain."
    ),
    lifespan=lifespan,
    docs_url="/v1/docs",
    openapi_url="/v1/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Range", "Accept-Ranges"],
)

app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {"service": "VoxSafe API", "version": "1.0.0", "docs": "/v1/docs"}
