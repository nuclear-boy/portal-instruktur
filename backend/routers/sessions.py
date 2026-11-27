from __future__ import annotations

import uuid

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse

from errors import HttpError, parse_model, read_json
from permissions import require_master, require_operational, require_report_writer
from schemas import (
    AssessmentCreateBody,
    AssessmentPatchBody,
    SessionCreateBody,
    SessionPatchBody,
    SosiogramSaveBody,
)
from services.assessment import ASSESSMENT_ITEMS
from services.sosiogram import parse_reli_score, with_default_seats
from services.store import K, list_items, new_id, now, remove, save
from db import get, set as db_set

router = APIRouter(prefix="/sessions", tags=["sessions"])

SCHEDULE_FIELDS = (
    "date",
    "topic",
    "location",
    "no",
    "localId",
    "startTime",
    "endTime",
    "durationMinutes",
)
SPEAKER_FIELDS = ("speakers",)
REPORT_FIELDS = (
    "actualStartTime",
    "actualEndTime",
    "actualDurationMinutes",
    "status",
    "attendance",
)


def assert_session_access(auth: dict, session: dict) -> None:
    if auth.get("role") in ("instruktur_lokal", "observer") and session.get(
        "localId"
    ) != auth.get("localId"):
        raise HttpError(403, "Pertemuan ini bukan bagian dari lokal Anda")


def assert_can_edit(auth: dict, assessment: dict | None = None) -> None:
    if auth.get("role") != "observer":
        raise HttpError(403, "Hanya observer yang dapat menilai pemateri")
    if assessment and assessment.get("observerId") != auth.get("id"):
        raise HttpError(403, "Anda hanya dapat mengubah penilaian milik sendiri")


def normalized_scores(values: dict[str, int], partial: bool = False) -> dict[str, int]:
    scores: dict[str, int] = {}
    for item in ASSESSMENT_ITEMS:
        raw = values.get(item["key"])
        if partial and raw is None:
            continue
        value = int(raw) if raw is not None else 0
        if value < 1 or value > 5:
            raise HttpError(400, f"Skor {item['label']} harus 1–5")
        scores[item["key"]] = value
    return scores


def compute_scores(session: dict) -> dict:
    scores: dict[str, dict] = {}
    sosiogram = session.get("sosiogram") or {}
    seat_scores = sosiogram.get("scores") or {}
    for seat in sosiogram.get("seats") or []:
        participant_id = seat.get("participantId")
        if not participant_id:
            continue
        values = seat_scores.get(seat.get("id"), [])
        totals = [0.0, 0.0, 0.0, 0.0]
        for index, value in enumerate(values):
            totals[index % 4] += parse_reli_score(value)
        existing = scores.get(participant_id, {"r": 0, "e": 0, "l": 0, "i": 0})
        scores[participant_id] = {
            "r": existing["r"] + totals[0],
            "e": existing["e"] + totals[1],
            "l": existing["l"] + totals[2],
            "i": existing["i"] + totals[3],
        }
    return scores


@router.get("")
async def list_sessions(request: Request):
    auth = await require_operational(request)
    sessions = await list_items(K.session, K.index_sessions)
    if auth.get("role") in ("instruktur_lokal", "observer"):
        sessions = [item for item in sessions if item.get("localId") == auth.get("localId")]
    sessions.sort(
        key=lambda item: (
            int(item.get("localId") or 0),
            str(item.get("date") or ""),
            int(item.get("no") or 0),
        )
    )
    return {"sessions": sessions}


@router.post("", status_code=201)
async def create_session(request: Request):
    auth = await require_master(request)
    data = parse_model(SessionCreateBody, await read_json(request))

    existing = await list_items(K.session, K.index_sessions)
    same_local = [item for item in existing if item.get("localId") == data.localId]
    next_no = data.no or max([0] + [item.get("no") or 0 for item in same_local]) + 1
    timestamp = now()

    participants = await list_items(K.participant, K.index_participants)
    local_participants = [
        item
        for item in participants
        if item.get("localId") == data.localId and item.get("active") is not False
    ]
    local_participants.sort(key=lambda item: str(item.get("name", "")).casefold())

    sosiogram = with_default_seats(max(12, len(local_participants)))
    for index, seat in enumerate(sosiogram["seats"]):
        if index < len(local_participants):
            participant = local_participants[index]
            seat["name"] = participant.get("name", "")
            seat["participantId"] = participant.get("id")

    session = {
        "id": new_id("sess"),
        "no": next_no,
        "date": data.date,
        "topic": data.topic,
        "location": data.location or "",
        "localId": data.localId,
        "startTime": data.startTime or "",
        "endTime": data.endTime or "",
        "actualStartTime": data.actualStartTime or "",
        "actualEndTime": data.actualEndTime or "",
        "status": data.status or "scheduled",
        "sosiogram": sosiogram,
        "speakers": [],
        "attendance": [
            {"participantId": participant.get("id"), "status": "hadir"}
            for participant in local_participants
        ],
        "scores": {},
        "assessments": [],
        "version": 0,
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "updatedBy": auth.get("id"),
    }
    if data.durationMinutes is not None:
        session["durationMinutes"] = data.durationMinutes
    if data.actualDurationMinutes is not None:
        session["actualDurationMinutes"] = data.actualDurationMinutes

    await save(K.session, K.index_sessions, session)
    return {"session": session}


@router.get("/{session_id}")
async def get_session(session_id: str, request: Request):
    auth = await require_operational(request)
    session = await get(K.session + session_id)
    if not session:
        raise HttpError(404, "Pertemuan tidak ditemukan")
    assert_session_access(auth, session)
    return {"session": session}


@router.patch("/{session_id}")
async def update_session(session_id: str, request: Request):
    auth = await require_operational(request)
    session = await get(K.session + session_id)
    if not session:
        raise HttpError(404, "Pertemuan tidak ditemukan")
    assert_session_access(auth, session)

    raw = await read_json(request)
    touches_schedule = any(key in raw for key in SCHEDULE_FIELDS)
    touches_speakers = any(key in raw for key in SPEAKER_FIELDS)
    touches_report = any(key in raw for key in REPORT_FIELDS)

    if (touches_schedule or touches_speakers) and auth.get("role") != "koordinator":
        raise HttpError(
            403,
            "Jadwal, materi, dan pemateri hanya dapat diubah oleh Koordinator Tim",
        )
    if touches_report and auth.get("role") not in ("observer", "koordinator"):
        raise HttpError(
            403,
            "Absensi, waktu aktual, dan status hanya dapat diubah oleh Observer atau Koordinator Tim",
        )
    if not (touches_schedule or touches_speakers or touches_report):
        raise HttpError(400, "Tidak ada perubahan yang diizinkan")

    data = parse_model(SessionPatchBody, raw)
    session.update(data.model_dump(exclude_unset=True))
    session["updatedAt"] = now()
    session["updatedBy"] = auth.get("id")
    await db_set(K.session + session_id, session)
    return {"session": session}


@router.delete("/{session_id}")
async def delete_session(session_id: str, request: Request):
    await require_master(request)
    session = await get(K.session + session_id)
    if not session:
        raise HttpError(404, "Pertemuan tidak ditemukan")
    await remove(K.session, K.index_sessions, session_id)
    return {"ok": True}


@router.post("/{session_id}/assessments", status_code=201)
async def create_assessment(session_id: str, request: Request):
    auth = await require_report_writer(request)
    session = await get(K.session + session_id)
    if not session:
        raise HttpError(404, "Pertemuan tidak ditemukan")
    assert_session_access(auth, session)
    session.setdefault("assessments", [])
    assert_can_edit(auth)

    data = parse_model(AssessmentCreateBody, await read_json(request))
    speakers = session.setdefault("speakers", [])
    if not any(item.get("speakerId") == data.speakerId for item in speakers):
        speakers.append(
            {"speakerId": data.speakerId, "role": "pemateri", "attendance": "hadir", "notes": ""}
        )

    timestamp = now()
    assessment = {
        "id": "as" + uuid.uuid4().hex[:10],
        "sessionId": session.get("id"),
        "speakerId": data.speakerId,
        "observerId": auth.get("id"),
        "observerName": data.observerName.strip() if data.observerName else auth.get("name", ""),
        "localId": session.get("localId"),
        "date": data.date,
        "time": data.time or "",
        "scores": normalized_scores(data.scores),
        "notes": data.notes or {},
        "generalNotes": data.generalNotes or "",
        "recommendations": data.recommendations or "",
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }
    session["assessments"].append(assessment)
    await db_set(K.session + session_id, session)
    return {"session": session, "assessment": assessment}


@router.patch("/{session_id}/assessments")
async def update_assessment(session_id: str, request: Request, assessmentId: str = ""):
    auth = await require_report_writer(request)
    session = await get(K.session + session_id)
    if not session:
        raise HttpError(404, "Pertemuan tidak ditemukan")
    assert_session_access(auth, session)
    session.setdefault("assessments", [])
    if not assessmentId:
        raise HttpError(400, "ID penilaian tidak valid")

    index = next(
        (i for i, item in enumerate(session["assessments"]) if item.get("id") == assessmentId),
        -1,
    )
    if index < 0:
        raise HttpError(404, "Penilaian tidak ditemukan")
    existing = session["assessments"][index]
    assert_can_edit(auth, existing)

    data = parse_model(AssessmentPatchBody, await read_json(request))
    speakers = session.setdefault("speakers", [])
    if data.speakerId and not any(item.get("speakerId") == data.speakerId for item in speakers):
        speakers.append(
            {"speakerId": data.speakerId, "role": "pemateri", "attendance": "hadir", "notes": ""}
        )

    updated = {**existing}
    if data.speakerId is not None:
        updated["speakerId"] = data.speakerId
    if data.date is not None:
        updated["date"] = data.date
    if data.time is not None:
        updated["time"] = data.time
    if data.observerName is not None:
        updated["observerName"] = data.observerName.strip() or existing.get("observerName", "")
    if data.scores is not None:
        updated["scores"] = {
            **existing.get("scores", {}),
            **normalized_scores(data.scores, partial=True),
        }
    if data.notes is not None:
        updated["notes"] = data.notes or existing.get("notes", {})
    if data.generalNotes is not None:
        updated["generalNotes"] = data.generalNotes
    if data.recommendations is not None:
        updated["recommendations"] = data.recommendations
    updated["localId"] = session.get("localId")
    updated["updatedAt"] = now()

    session["assessments"][index] = updated
    await db_set(K.session + session_id, session)
    return {"session": session, "assessment": updated}


@router.delete("/{session_id}/assessments")
async def delete_assessment(session_id: str, request: Request, assessmentId: str = ""):
    auth = await require_report_writer(request)
    session = await get(K.session + session_id)
    if not session:
        raise HttpError(404, "Pertemuan tidak ditemukan")
    assert_session_access(auth, session)
    session.setdefault("assessments", [])
    if not assessmentId:
        raise HttpError(400, "ID penilaian tidak valid")

    index = next(
        (i for i, item in enumerate(session["assessments"]) if item.get("id") == assessmentId),
        -1,
    )
    if index < 0:
        raise HttpError(404, "Penilaian tidak ditemukan")
    existing = session["assessments"][index]
    if existing.get("observerId") != auth.get("id"):
        raise HttpError(403, "Anda hanya dapat menghapus penilaian milik sendiri")

    session["assessments"].pop(index)
    await db_set(K.session + session_id, session)
    return {"ok": True}


@router.put("/{session_id}/sosiogram")
async def save_sosiogram(session_id: str, request: Request):
    auth = await require_report_writer(request)
    data = parse_model(SosiogramSaveBody, await read_json(request))
    session = await get(K.session + session_id)
    if not session:
        raise HttpError(404, "Pertemuan tidak ditemukan")
    assert_session_access(auth, session)

    if data.version != session.get("version", 0):
        return JSONResponse(
            status_code=409,
            content={
                "error": "Sosiogram telah diperbarui pengguna lain. Muat ulang lalu ulangi perubahan Anda.",
                "version": session.get("version", 0),
            },
        )

    session["sosiogram"] = data.sosiogram.model_dump()
    session["scores"] = compute_scores(session)
    session["version"] = int(session.get("version", 0)) + 1
    session["updatedAt"] = now()
    session["updatedBy"] = auth.get("id")
    await db_set(K.session + session_id, session)
    return {"session": session}
