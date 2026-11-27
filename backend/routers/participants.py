from __future__ import annotations

from fastapi import APIRouter, Request

from db import get, set as db_set
from errors import HttpError, parse_model, read_json
from permissions import LOCAL_SCOPED, require_master, require_operational
from schemas import ParticipantCreateBody, ParticipantPatchBody
from services.store import K, list_items, new_id, now, remove, save

router = APIRouter(prefix="/participants", tags=["participants"])


@router.get("")
async def list_participants(request: Request):
    auth = await require_operational(request)
    participants = await list_items(K.participant, K.index_participants)
    if auth.get("role") in LOCAL_SCOPED:
        participants = [item for item in participants if item.get("localId") == auth.get("localId")]
    participants.sort(key=lambda item: str(item.get("name", "")).casefold())
    return {"participants": participants}


@router.post("", status_code=201)
async def create_participant(request: Request):
    await require_master(request)
    data = parse_model(ParticipantCreateBody, await read_json(request))
    participant = {
        "id": new_id("p"),
        **data.model_dump(),
        "active": data.active if data.active is not None else True,
        "createdAt": now(),
    }
    await save(K.participant, K.index_participants, participant)
    return {"participant": participant}


@router.get("/{participant_id}")
async def get_participant(participant_id: str, request: Request):
    auth = await require_operational(request)
    participant = await get(K.participant + participant_id)
    if not participant:
        raise HttpError(404, "Peserta tidak ditemukan")
    if auth.get("role") in LOCAL_SCOPED and participant.get("localId") != auth.get("localId"):
        raise HttpError(403, "Peserta ini bukan bagian dari lokal Anda")
    return {"participant": participant}


@router.patch("/{participant_id}")
async def update_participant(participant_id: str, request: Request):
    await require_master(request)
    existing = await get(K.participant + participant_id)
    if not existing:
        raise HttpError(404, "Peserta tidak ditemukan")

    data = parse_model(ParticipantPatchBody, await read_json(request))
    participant = {
        **existing,
        **data.model_dump(exclude_unset=True),
        "active": data.active if data.active is not None else existing.get("active"),
        "updatedAt": now(),
    }
    await db_set(K.participant + participant_id, participant)
    return {"participant": participant}


@router.delete("/{participant_id}")
async def delete_participant(participant_id: str, request: Request):
    await require_master(request)
    await remove(K.participant, K.index_participants, participant_id)
    return {"ok": True}
