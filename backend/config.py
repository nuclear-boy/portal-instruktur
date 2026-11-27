from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env.local")
load_dotenv(ROOT_DIR / ".env")


def _is_production() -> bool:
    vercel_env = (os.getenv("VERCEL_ENV") or "").strip().lower()
    if vercel_env in ("production", "preview"):
        return True
    return any(
        (os.getenv(name) or "").strip().lower() == "production"
        for name in ("APP_ENV", "ENVIRONMENT", "ENV", "NODE_ENV")
    )


def _positive_int(name: str, default: str) -> int:
    raw = os.getenv(name) or default
    try:
        value = int(raw)
    except ValueError as error:
        raise RuntimeError(f"{name} harus berupa angka positif") from error
    if value <= 0:
        raise RuntimeError(f"{name} harus berupa angka positif")
    return value


IS_PRODUCTION = _is_production()
DATA_TTL_SECONDS = _positive_int("DATA_TTL_SECONDS", "2592000")
ADMIN_PERSIST_EMAIL = (os.getenv("BOOTSTRAP_ADMIN_EMAIL") or "").strip().lower()
UPSTASH_REDIS_REST_URL = (os.getenv("UPSTASH_REDIS_REST_URL") or "").strip()
UPSTASH_REDIS_REST_TOKEN = (os.getenv("UPSTASH_REDIS_REST_TOKEN") or "").strip()
JWT_SECRET = (os.getenv("JWT_SECRET") or "").strip()

if IS_PRODUCTION and len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET wajib diisi minimal 32 karakter di lingkungan produksi")

if IS_PRODUCTION and (not UPSTASH_REDIS_REST_URL or not UPSTASH_REDIS_REST_TOKEN):
    raise RuntimeError("UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN wajib diisi di produksi")

SECRET_KEY = JWT_SECRET or "dev-secret-change-me-at-least-32-chars"
JWT_EXPIRES_HOURS = 12
APP_NAME = "Portal Instruktur LBT API"

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in (
        os.getenv("ALLOWED_ORIGINS")
        or "http://localhost:5173"
    ).split(",")
    if origin.strip()
]
