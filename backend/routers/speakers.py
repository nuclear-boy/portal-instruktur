from __future__ import annotations

from fastapi import APIRouter, Request

from db import get, set as db_set
from errors import HttpError, parse_model, read_json
from permissions import require_master, require_operational
from schemas import SpeakerBody
from seed import DEFAULT_SPEAKERS
from services.store import K, list_items, new_id, now, remove, save

router = APIRouter(prefix="/speakers", tags=["speakers"])


async def _ensure_default_speakers_once() -> list[dict]:
    speakers = await list_items(K.speaker, K.index_speakers)
    if speakers:
        return speakers
    already_seeded = await get(K.speakers_seeded)
    if already_seeded:
        return speakers
    await db_set(K.speakers_seeded, True)
    existing = await list_items(K.speaker, K.index_speakers)
    existing_names = {str(item.get("name", "")).strip().casefold() for item in existing}
    created: list[dict] = list(existing)
    timestamp = now()
    for name in DEFAULT_SPEAKERS:
        key = name.strip().casefold()
        if key in existing_names:
            continue
        record = {
            "id": new_id("sp"),
            "name": name,
            "expertise": "",
            "phone": "",
            "notes": "",
            "createdAt": timestamp,
        }
        await save(K.speaker, K.index_speakers, record)
        existing_names.add(key)
        created.append(record)
    return created


@router.get("")
async def list_speakers(request: Request):
    await require_operational(request)
    speakers = await _ensure_default_speakers_once()
    speakers.sort(key=lambda item: str(item.get("name", "")).casefold())
    return {"speakers": speakers}


@router.post("", status_code=201)
async def create_speaker(request: Request):
    await require_master(request)
    data = parse_model(SpeakerBody, await read_json(request))
    speaker = {"id": new_id("sp"), **data.model_dump(), "createdAt": now()}
    await save(K.speaker, K.index_speakers, speaker)
    await db_set(K.speakers_seeded, True)
    return {"speaker": speaker}


@router.get("/{speaker_id}")
async def get_speaker(speaker_id: str, request: Request):
    await require_operational(request)
    speaker = await get(K.speaker + speaker_id)
    if not speaker:
        raise HttpError(404, "Pemateri tidak ditemukan")
    return {"speaker": speaker}


@router.patch("/{speaker_id}")
async def update_speaker(speaker_id: str, request: Request):
    await require_master(request)
    existing = await get(K.speaker + speaker_id)
    if not existing:
        raise HttpError(404, "Pemateri tidak ditemukan")
    data = parse_model(SpeakerBody, await read_json(request))
    speaker = {**existing, **data.model_dump(), "updatedAt": now()}
    await db_set(K.speaker + speaker_id, speaker)
    return {"speaker": speaker}


@router.delete("/{speaker_id}")
async def delete_speaker(speaker_id: str, request: Request):
    await require_master(request)
    await remove(K.speaker, K.index_speakers, speaker_id)
    return {"ok": True}
