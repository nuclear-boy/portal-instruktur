from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import db
from auth import hash_password
from config import UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL
from db import get, sadd, set as db_set, set_raw
from services.store import K, list_items, make_admin_permanent, new_id, normalize_email, now, save

DEFAULT_META = {
    "eventName": "Leadership Basic Training Pelajar Islam Indonesia",
    "startDate": "",
    "endDate": "",
    "location": "",
    "updatedAt": "",
}

LOCALS = [
    {"id": 1, "label": "Lokal 1", "short": "L1"},
    {"id": 2, "label": "Lokal 2", "short": "L2"},
    {"id": 3, "label": "Lokal 3", "short": "L3"},
    {"id": 4, "label": "Lokal 4", "short": "L4"},
    {"id": 5, "label": "Lokal 5", "short": "L5"},
]


def require_redis() -> None:
    if not UPSTASH_REDIS_REST_URL or not UPSTASH_REDIS_REST_TOKEN:
        raise SystemExit("UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN wajib diisi di .env.local")
    if not db.using_redis:
        raise SystemExit("Koneksi Upstash tidak tersedia")


async def create_user(email: str, password: str, name: str, role: str, position: str) -> None:
    require_redis()
    normalized = normalize_email(email)
    existing = await get(K.email + normalized)
    if existing:
        existing_user = await get(K.user + str(existing))
        await make_admin_permanent(existing_user)
        print(f"Pengguna dengan email {normalized} sudah ada. Tidak ada perubahan.")
        return

    user = {
        "id": new_id("u"),
        "email": normalized,
        "name": name,
        "role": role,
        "position": position,
        "active": True,
        "passwordHash": hash_password(password),
        "createdAt": now(),
    }
    await db_set(K.user + user["id"], user)
    await set_raw(K.email + normalized, user["id"])
    await sadd(K.index_users, user["id"], ttl=None)
    await make_admin_permanent(user)
    print(f"{role.capitalize()} berhasil dibuat: {normalized}")


async def seed_admin() -> None:
    import os

    email = (os.getenv("BOOTSTRAP_ADMIN_EMAIL") or "").strip().lower()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD") or ""
    name = os.getenv("BOOTSTRAP_ADMIN_NAME") or "Admin LBT"
    if not email or not password:
        raise SystemExit("BOOTSTRAP_ADMIN_EMAIL dan BOOTSTRAP_ADMIN_PASSWORD wajib diisi di .env.local")
    if len(password) < 8:
        raise SystemExit("BOOTSTRAP_ADMIN_PASSWORD minimal 8 karakter")

    await create_user(email, password, name, "admin", "")
    meta = await get(K.meta)
    if meta is None:
        await db_set(K.meta, {**DEFAULT_META, "locals": LOCALS, "updatedAt": now()})


async def seed_koordinator() -> None:
    import os

    email = (os.getenv("BOOTSTRAP_COORDINATOR_EMAIL") or "").strip().lower()
    password = os.getenv("BOOTSTRAP_COORDINATOR_PASSWORD") or ""
    name = os.getenv("BOOTSTRAP_COORDINATOR_NAME") or "Koordinator Tim"
    if not email or not password:
        raise SystemExit(
            "BOOTSTRAP_COORDINATOR_EMAIL dan BOOTSTRAP_COORDINATOR_PASSWORD wajib diisi di .env.local"
        )
    if len(password) < 8:
        raise SystemExit("BOOTSTRAP_COORDINATOR_PASSWORD minimal 8 karakter")

    await create_user(email, password, name, "koordinator", "Koordinator Tim")


DEFAULT_SPEAKERS: list[str] = [
    "Nur’Atira",
    "Muhammad Ardiansyah",
    "Junaiya",
    "Rini Kumala Sari",
    "Dita",
    "Mutia Khumairah",
    "Maulidya",
    "Putri Aulia",
    "Fiqkri Putra Riswanda",
    "Irfan",
    "Elfariana",
    "Ahmad Ghazali",
    "Reski Legianto",
    "Putri Wulandari",
    "Syahrun",
    "Babul Yatama",
    "Zulhan",
]


async def seed_speakers(require_live_redis: bool = True) -> dict[str, int]:
    if require_live_redis:
        require_redis()
    existing = await list_items(K.speaker, K.index_speakers)
    existing_names = {str(item.get("name", "")).strip().casefold() for item in existing}
    created = 0
    skipped = 0
    for name in DEFAULT_SPEAKERS:
        key = name.strip().casefold()
        if key in existing_names:
            skipped += 1
            continue
        record = {
            "id": new_id("sp"),
            "name": name,
            "expertise": "",
            "phone": "",
            "notes": "",
            "createdAt": now(),
        }
        await save(K.speaker, K.index_speakers, record)
        existing_names.add(key)
        created += 1
    await db_set(K.speakers_seeded, True)
    print(f"Seed pemateri selesai: {created} ditambahkan, {skipped} sudah ada.")
    return {"created": created, "skipped": skipped}


def main() -> None:
    target = sys.argv[1] if len(sys.argv) > 1 else ""
    if target == "admin":
        asyncio.run(seed_admin())
    elif target == "koordinator":
        asyncio.run(seed_koordinator())
    elif target == "speakers":
        asyncio.run(seed_speakers())
    else:
        raise SystemExit("Usage: python backend/seed.py admin|koordinator|speakers")


if __name__ == "__main__":
    main()
