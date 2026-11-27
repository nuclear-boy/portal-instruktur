from __future__ import annotations

from fastapi import APIRouter, Request

from auth import hash_password, public_user, require_auth
from db import delete, get, set as db_set, set_raw, sadd, srem
from errors import HttpError, parse_model, read_json
from permissions import ADMIN, KOORDINATOR, LOCAL_SCOPED
from schemas import UserCreateBody, UserUpdateBody
from services.locals import local_exists
from services.store import (
    K,
    list_items,
    make_admin_permanent,
    new_id,
    normalize_email,
    now,
)

router = APIRouter(prefix="/admin", tags=["admin"])


async def active_koordinators() -> list[dict]:
    users = await list_items(K.user, K.index_users)
    return [
        user
        for user in users
        if user.get("role") == KOORDINATOR and user.get("active")
    ]


async def ensure_local(local_id: int | None) -> int:
    if local_id is None:
        raise HttpError(400, "Lokal wajib dipilih untuk Instruktur Lokal atau Observer")
    if not await local_exists(local_id):
        raise HttpError(400, "Lokal tidak ditemukan")
    return local_id


@router.get("/users")
async def list_users(request: Request):
    auth = await require_auth(request, [ADMIN, KOORDINATOR])
    users = await list_items(K.user, K.index_users)
    if auth.get("role") == KOORDINATOR:
        users = [user for user in users if user.get("role") in LOCAL_SCOPED]
    users.sort(key=lambda item: str(item.get("name", "")).casefold())
    return {"users": [public_user(user) for user in users]}


@router.post("/users", status_code=201)
async def create_user(request: Request):
    auth = await require_auth(request, [ADMIN, KOORDINATOR])
    data = parse_model(UserCreateBody, await read_json(request))

    if auth.get("role") == ADMIN:
        if data.role != KOORDINATOR:
            raise HttpError(403, "Admin hanya dapat membuat akun Koordinator Tim")
        local_id = None
    else:
        if data.role not in LOCAL_SCOPED:
            raise HttpError(
                403,
                "Koordinator Tim hanya dapat membuat akun Instruktur Lokal atau Observer",
            )
        local_id = await ensure_local(data.localId)

    email = normalize_email(data.email)
    if await get(K.email + email):
        raise HttpError(409, "Email sudah terdaftar")

    user = {
        "id": new_id("u"),
        "email": email,
        "name": data.name,
        "role": data.role,
        "active": data.active if data.active is not None else True,
        "localId": local_id,
        "position": data.position or "",
        "passwordHash": hash_password(data.password),
        "createdAt": now(),
    }

    await db_set(K.user + user["id"], user)
    await set_raw(K.email + email, user["id"])
    await sadd(K.index_users, user["id"], ttl=None)
    await make_admin_permanent(user)
    return {"user": public_user(user)}


@router.patch("/users/{user_id}")
async def update_user(user_id: str, request: Request):
    auth = await require_auth(request, [ADMIN, KOORDINATOR])
    target = await get(K.user + user_id)
    if not target:
        raise HttpError(404, "Pengguna tidak ditemukan")
    if target.get("role") == ADMIN:
        raise HttpError(403, "Akun admin tidak dapat diubah dari halaman ini")

    data = parse_model(UserUpdateBody, await read_json(request))
    patch = data.model_dump(exclude_unset=True)

    if auth.get("role") == ADMIN:
        if target.get("role") != KOORDINATOR:
            raise HttpError(403, "Admin hanya dapat mengelola akun Koordinator Tim")
        if data.role is not None and data.role != KOORDINATOR:
            raise HttpError(403, "Admin tidak dapat mengubah peran Koordinator Tim")
        next_role = KOORDINATOR
        next_local = None
    else:
        if target.get("role") not in LOCAL_SCOPED:
            raise HttpError(
                403,
                "Koordinator Tim hanya dapat mengelola akun Instruktur Lokal atau Observer",
            )
        if data.role is not None and data.role not in LOCAL_SCOPED:
            raise HttpError(
                403,
                "Koordinator Tim tidak dapat mengubah peran menjadi Koordinator atau Admin",
            )
        next_role = data.role if data.role is not None else target.get("role")
        next_local = data.localId if "localId" in patch else target.get("localId")
        next_local = await ensure_local(next_local)

    if (
        target.get("role") == KOORDINATOR
        and target.get("active")
        and data.active is False
        and len(await active_koordinators()) <= 1
    ):
        raise HttpError(400, "Minimal harus ada satu Koordinator Tim aktif")

    if data.email is not None:
        email = normalize_email(data.email)
        if email != normalize_email(target.get("email", "")):
            existing = await get(K.email + email)
            if existing and str(existing) != user_id:
                raise HttpError(409, "Email sudah terdaftar")
            await delete(K.email + normalize_email(target.get("email", "")))
            await set_raw(K.email + email, user_id)
            target["email"] = email

    previous_role = target.get("role")
    for field in ("name", "active", "position"):
        if field in patch and patch[field] is not None:
            target[field] = patch[field]
    target["role"] = next_role
    target["localId"] = next_local
    should_revoke = False
    if data.password:
        target["passwordHash"] = hash_password(data.password)
        should_revoke = True
    if data.active is False or next_role != previous_role:
        should_revoke = True
    if should_revoke:
        target["tokenVersion"] = int(target.get("tokenVersion", 0)) + 1
    target["updatedAt"] = now()

    await db_set(K.user + user_id, target)
    await make_admin_permanent(target)
    return {"user": public_user(target)}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    auth = await require_auth(request, [ADMIN, KOORDINATOR])
    target = await get(K.user + user_id)
    if not target:
        raise HttpError(404, "Pengguna tidak ditemukan")
    if target.get("role") == ADMIN:
        raise HttpError(403, "Akun admin tidak dapat dihapus")
    if auth.get("role") == ADMIN and target.get("role") != KOORDINATOR:
        raise HttpError(403, "Admin hanya dapat menghapus akun Koordinator Tim")
    if auth.get("role") == KOORDINATOR and target.get("role") not in LOCAL_SCOPED:
        raise HttpError(
            403,
            "Koordinator Tim hanya dapat menghapus akun Instruktur Lokal atau Observer",
        )
    if target.get("id") == auth.get("id"):
        raise HttpError(400, "Tidak dapat menghapus akun sendiri")
    if target.get("role") == KOORDINATOR and target.get("active"):
        if len(await active_koordinators()) <= 1:
            raise HttpError(400, "Minimal harus ada satu Koordinator Tim aktif")

    await delete(K.user + user_id, K.email + normalize_email(target.get("email", "")))
    await srem(K.index_users, user_id)
    return {"ok": True}
