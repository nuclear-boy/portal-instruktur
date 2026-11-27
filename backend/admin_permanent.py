from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import db
from auth import hash_password
from config import ADMIN_PERSIST_EMAIL
from db import get
from services.store import K, make_admin_permanent, normalize_email, now


async def main() -> None:
    email = normalize_email(ADMIN_PERSIST_EMAIL)
    if not email:
        raise SystemExit("BOOTSTRAP_ADMIN_EMAIL wajib diisi di .env.local")
    if not db.using_redis:
        raise SystemExit(
            "UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN wajib diisi di .env.local"
        )

    user_id = await get(K.email + email)
    if not user_id:
        raise SystemExit(f"Admin dengan email {email} tidak ditemukan")
    user = await get(K.user + str(user_id))
    if not user or user.get("role") != "admin":
        raise SystemExit(f"Pengguna {email} bukan admin")

    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD") or ""
    if password:
        if len(password) < 8:
            raise SystemExit("BOOTSTRAP_ADMIN_PASSWORD minimal 8 karakter")
        user["passwordHash"] = hash_password(password)
        user["updatedAt"] = now()
        await db.set(K.user + str(user["id"]), user, ttl=None)
    else:
        await db.persist(K.user + str(user["id"]))
    await make_admin_permanent(user)
    print(f"Admin permanen: {email}")


if __name__ == "__main__":
    asyncio.run(main())
