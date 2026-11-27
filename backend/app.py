from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse, Response

from config import ALLOWED_ORIGINS, APP_NAME, IS_PRODUCTION
from db import close_redis
from errors import HttpError
from routers import admin, auth, locals, meta, participants, sessions, speakers, team

logger = logging.getLogger("lbt.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await close_redis()


app = FastAPI(
    title=APP_NAME,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=500)


@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin")
    origin_allowed = bool(origin and ("*" in ALLOWED_ORIGINS or origin in ALLOWED_ORIGINS))
    if request.method == "OPTIONS":
        response: Response = Response(status_code=204)
    else:
        response = await call_next(request)

    if origin_allowed and origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Max-Age"] = "86400"

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.headers.get("authorization") or request.url.path.startswith("/api/auth"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(HttpError)
async def http_error_handler(_: Request, error: HttpError):
    return JSONResponse(status_code=error.status, content={"error": error.message})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, error: RequestValidationError):
    first = error.errors()[0] if error.errors() else {}
    message = first.get("msg", "Data tidak valid")
    return JSONResponse(status_code=400, content={"error": message})


@app.exception_handler(StarletteHTTPException)
async def starlette_error_handler(_: Request, error: StarletteHTTPException):
    if error.status_code == 405:
        message = "Metode tidak diizinkan"
    elif error.status_code == 404:
        message = "Tidak ditemukan"
    else:
        message = str(error.detail)
    return JSONResponse(status_code=error.status_code, content={"error": message})


@app.exception_handler(Exception)
async def unhandled_error_handler(_: Request, error: Exception):
    logger.exception("Unhandled API error: %s", error)
    return JSONResponse(status_code=500, content={"error": "Terjadi kesalahan pada server"})


@app.get("/api/health")
async def health():
    from db import using_redis

    return {"ok": True, "usingRedis": using_redis}


app.include_router(auth.router, prefix="/api")
app.include_router(meta.router, prefix="/api")
app.include_router(locals.router, prefix="/api")
app.include_router(team.router, prefix="/api")
app.include_router(participants.router, prefix="/api")
app.include_router(speakers.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
