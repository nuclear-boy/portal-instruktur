from __future__ import annotations

from fastapi import APIRouter, Request

from permissions import ADMIN, LOCAL_SCOPED, require_operational
from services.store import K, list_items

router = APIRouter(tags=["team"])


@router.get("/team")
async def get_team(request: Request):
    auth = await require_operational(request)
    users = await list_items(K.user, K.index_users)
    members = []
    for user in users:
        if not user.get("active") or user.get("role") == ADMIN:
            continue
        if auth.get("role") in LOCAL_SCOPED and user.get("localId") != auth.get("localId"):
            continue
        member = {
            "id": user.get("id"),
            "name": user.get("name"),
            "role": user.get("role"),
            "localId": user.get("localId"),
            "position": user.get("position"),
        }
        members.append({key: value for key, value in member.items() if value is not None})
    members.sort(key=lambda item: str(item.get("name", "")).casefold())
    return {"members": members}
