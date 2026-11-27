from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from starlette.requests import Request

from config import JWT_EXPIRES_HOURS, SECRET_KEY
from db import get
from errors import HttpError
from services.store import K


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def sign_token(user: dict) -> str:
    issued_at = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "role": user.get("role"),
        "email": user.get("email"),
        "name": user.get("name"),
        "tv": int(user.get("tokenVersion", 0)),
        "iat": int(issued_at.timestamp()),
        "exp": int((issued_at + timedelta(hours=JWT_EXPIRES_HOURS)).timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


async def get_auth(request: Request) -> dict | None:
    header = request.headers.get("authorization") or ""
    if not header.startswith("Bearer "):
        return None
    try:
        payload = jwt.decode(header[7:], SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = await get(K.user + str(user_id))
    if not user or not user.get("active"):
        return None
    if int(payload.get("tv", 0)) != int(user.get("tokenVersion", 0)):
        return None
    return user


async def require_auth(request: Request, roles: list[str] | None = None) -> dict:
    user = await get_auth(request)
    if not user:
        raise HttpError(401, "Silakan login terlebih dahulu")
    if roles and user.get("role") not in roles:
        raise HttpError(403, "Anda tidak memiliki akses untuk tindakan ini")
    return user


def public_user(user: dict) -> dict:
    return {
        key: value
        for key, value in user.items()
        if key not in ("passwordHash", "tokenVersion")
    }
