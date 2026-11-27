from __future__ import annotations

from fastapi import APIRouter, Request

from db import delete, srem
from errors import HttpError, parse_model, read_json
from permissions import LOCAL_SCOPED, require_master
from schemas import LocalCreateBody, LocalUpdateBody
from services.locals import load_meta, save_meta
from services.store import K, list_items, normalize_email, remove

router = APIRouter(prefix="/locals", tags=["locals"])


@router.post("", status_code=201)
async def create_local(request: Request):
    await require_master(request)
    data = parse_model(LocalCreateBody, await read_json(request))
    meta = await load_meta()
    next_id = max([0] + [int(item.get("id", 0)) for item in meta.get("locals", [])]) + 1
    local = {"id": next_id, "label": data.label, "short": data.short}
    meta.setdefault("locals", []).append(local)
    await save_meta(meta)
    return {"meta": meta, "local": local}


@router.patch("/{local_id}")
async def update_local(local_id: int, request: Request):
    await require_master(request)
    data = parse_model(LocalUpdateBody, await read_json(request))
    meta = await load_meta()
    local = next(
        (item for item in meta.get("locals", []) if int(item.get("id", 0)) == local_id),
        None,
    )
    if local is None:
        raise HttpError(404, "Lokal tidak ditemukan")
    if data.label is not None:
        local["label"] = data.label
    if data.short is not None:
        local["short"] = data.short
    await save_meta(meta)
    return {"meta": meta, "local": local}


@router.delete("/{local_id}")
async def delete_local(local_id: int, request: Request):
    await require_master(request)
    meta = await load_meta()
    locals_list = meta.get("locals", [])
    if not any(int(item.get("id", 0)) == local_id for item in locals_list):
        raise HttpError(404, "Lokal tidak ditemukan")
    if len(locals_list) <= 1:
        raise HttpError(400, "Minimal harus ada satu lokal")

    participants = await list_items(K.participant, K.index_participants)
    sessions = await list_items(K.session, K.index_sessions)
    users = await list_items(K.user, K.index_users)

    removed_participants = [item for item in participants if item.get("localId") == local_id]
    removed_sessions = [item for item in sessions if item.get("localId") == local_id]
    removed_users = [
        item
        for item in users
        if item.get("role") in LOCAL_SCOPED and item.get("localId") == local_id
    ]

    for participant in removed_participants:
        await remove(K.participant, K.index_participants, participant["id"])
    for session in removed_sessions:
        await remove(K.session, K.index_sessions, session["id"])
    for user in removed_users:
        await delete(
            K.user + user["id"],
            K.email + normalize_email(user.get("email", "")),
        )
        await srem(K.index_users, user["id"])

    meta["locals"] = [
        item for item in locals_list if int(item.get("id", 0)) != local_id
    ]
    await save_meta(meta)
    return {
        "ok": True,
        "deleted": {
            "participants": len(removed_participants),
            "sessions": len(removed_sessions),
            "users": len(removed_users),
        },
        "meta": meta,
    }
