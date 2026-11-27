from __future__ import annotations

import uuid
from datetime import datetime, timezone

from config import ADMIN_PERSIST_EMAIL
from db import (
    delete,
    get as db_get,
    mget as db_mget,
    persist as db_persist,
    sadd,
    set as db_set,
    smembers,
    srem,
)


class K:
    user = "lbt:user:"
    email = "lbt:user:email:"
    participant = "lbt:participant:"
    speaker = "lbt:speaker:"
    session = "lbt:session:"
    meta = "lbt:meta"
    index_users = "lbt:index:users"
    index_participants = "lbt:index:participants"
    index_speakers = "lbt:index:speakers"
    index_sessions = "lbt:index:sessions"
    speakers_seeded = "lbt:flag:speakers_seeded"


async def make_admin_permanent(user: dict | None) -> None:
    if not user:
        return
    email = str(user.get("email", "")).strip().lower()
    user_id = str(user.get("id", ""))
    if not user_id or not email or email != ADMIN_PERSIST_EMAIL:
        return
    await db_persist(K.user + user_id)
    await db_persist(K.email + email)
    await db_persist(K.index_users)


def now() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def new_id(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:10]


async def list_items(prefix: str, index: str) -> list[dict]:
    ids = await smembers(index)
    if not ids:
        return []
    items = await db_mget([prefix + item_id for item_id in ids])
    return [item for item in items if item is not None]


async def save(prefix: str, index: str, record: dict) -> None:
    await db_set(prefix + record["id"], record)
    await sadd(index, record["id"])


async def remove(prefix: str, index: str, item_id: str) -> None:
    await delete(prefix + item_id)
    await srem(index, item_id)


async def get(prefix: str, item_id: str) -> dict | None:
    return await db_get(prefix + item_id)


def normalize_email(email: str) -> str:
    return email.strip().lower()
