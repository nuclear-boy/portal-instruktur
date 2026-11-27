from __future__ import annotations

from copy import deepcopy

from db import get, set as db_set
from services.store import K, now

DEFAULT_LOCALS = [
    {"id": 1, "label": "Lokal 1", "short": "L1"},
    {"id": 2, "label": "Lokal 2", "short": "L2"},
    {"id": 3, "label": "Lokal 3", "short": "L3"},
    {"id": 4, "label": "Lokal 4", "short": "L4"},
    {"id": 5, "label": "Lokal 5", "short": "L5"},
]

DEFAULT_META = {
    "eventName": "Leadership Basic Training Pelajar Islam Indonesia",
    "startDate": "",
    "endDate": "",
    "location": "",
    "locals": DEFAULT_LOCALS,
}


async def load_meta() -> dict:
    meta = await get(K.meta)
    if meta is None:
        return deepcopy(DEFAULT_META)
    if not meta.get("locals"):
        meta["locals"] = deepcopy(DEFAULT_LOCALS)
    return meta


async def save_meta(meta: dict) -> dict:
    meta["updatedAt"] = now()
    await db_set(K.meta, meta)
    return meta


async def local_exists(local_id: int) -> bool:
    meta = await load_meta()
    return any(int(item.get("id", 0)) == int(local_id) for item in meta.get("locals", []))
