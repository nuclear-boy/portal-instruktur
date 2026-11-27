from __future__ import annotations

from fastapi import APIRouter, Request

from auth import hash_password, public_user, require_auth, sign_token, verify_password
from db import delete, get, incr, set as db_set
from errors import HttpError, parse_model, read_json
from schemas import LoginBody, PasswordChangeBody
from services.store import K, make_admin_permanent, normalize_email, now

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or ""
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    if request.client and request.client.host:
        return request.client.host
    return "local"


@router.post("/login")
async def login(request: Request):
    data = parse_model(LoginBody, await read_json(request))
    normalized = normalize_email(data.email)
    ip = _client_ip(request)
    ip_limit_key = f"lbt:ratelimit:login-ip:{ip}"
    limit_key = f"lbt:ratelimit:login:{ip}:{normalized}"

    ip_attempts = await incr(ip_limit_key, 900)
    if ip_attempts > 25:
        raise HttpError(429, "Terlalu banyak percobaan login dari jaringan ini. Coba lagi nanti.")

    attempts = await incr(limit_key, 900)
    if attempts > 5:
        raise HttpError(429, "Terlalu banyak percobaan login. Coba lagi dalam 15 menit.")

    user_id = await get(K.email + normalized)
    if not user_id:
        raise HttpError(401, "Email atau password salah")

    user = await get(K.user + str(user_id))
    if not user or not user.get("active"):
        raise HttpError(401, "Email atau password salah")

    if not verify_password(data.password, user.get("passwordHash", "")):
        raise HttpError(401, "Email atau password salah")

    user["lastLoginAt"] = now()
    await db_set(K.user + user["id"], user)
    await make_admin_permanent(user)
    await delete(limit_key)
    return {"token": sign_token(user), "user": public_user(user)}


@router.get("/me")
async def me(request: Request):
    user = await require_auth(request)
    return {"user": public_user(user)}


@router.post("/password")
async def change_password(request: Request):
    auth = await require_auth(request)
    pw_limit_key = f"lbt:ratelimit:pw:{auth['id']}"
    if await incr(pw_limit_key, 900) > 10:
        raise HttpError(429, "Terlalu banyak percobaan ganti password. Coba lagi nanti.")

    data = parse_model(PasswordChangeBody, await read_json(request))

    user = await get(K.user + auth["id"])
    if not user:
        raise HttpError(404, "Akun tidak ditemukan")

    if not verify_password(data.currentPassword, user.get("passwordHash", "")):
        raise HttpError(400, "Password lama tidak sesuai")

    user["passwordHash"] = hash_password(data.newPassword)
    user["tokenVersion"] = int(user.get("tokenVersion", 0)) + 1
    user["updatedAt"] = now()
    await db_set(K.user + user["id"], user)
    await make_admin_permanent(user)
    await delete(pw_limit_key)
    return {"ok": True, "token": sign_token(user)}
