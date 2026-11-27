from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from services.sosiogram import normalize_reli_score

Role = Literal["admin", "koordinator", "instruktur_lokal", "observer"]
Attendance = Literal["hadir", "terlambat", "izin", "sakit", "alpa"]
SpeakerRole = Literal["pemateri", "inlok", "observer"]
SessionStatus = Literal["scheduled", "in_progress", "completed"]
LocalId = Annotated[int, Field(ge=1)]
ScoreValue = Annotated[int, Field(ge=1, le=5)]
NonNegativeInt = Annotated[int, Field(ge=0)]


def _email(value: str) -> str:
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value):
        raise ValueError("Email tidak valid")
    return value


class Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


class LoginBody(Model):
    email: str = Field(max_length=160)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        return _email(value)


class PasswordChangeBody(Model):
    currentPassword: str = Field(min_length=1, max_length=128)
    newPassword: str = Field(min_length=8, max_length=128)


class UserCreateBody(Model):
    email: str = Field(max_length=160)
    name: str = Field(min_length=1, max_length=120)
    role: Role
    password: str = Field(min_length=8, max_length=128)
    active: bool | None = None
    localId: LocalId | None = None
    position: str = Field(default="", max_length=120)

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        return _email(value)


class UserUpdateBody(Model):
    email: str | None = Field(default=None, max_length=160)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: Role | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    active: bool | None = None
    localId: LocalId | None = None
    position: str | None = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def check_optional_email(cls, value: str | None) -> str | None:
        return _email(value) if value is not None else value


class ParticipantCreateBody(Model):
    name: str = Field(min_length=1, max_length=120)
    gender: str = Field(default="", max_length=32)
    origin: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=40)
    notes: str = Field(default="", max_length=2000)
    localId: LocalId | None = None
    active: bool | None = None


class ParticipantPatchBody(Model):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    gender: str | None = Field(default=None, max_length=32)
    origin: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=2000)
    localId: LocalId | None = None
    active: bool | None = None


class SpeakerBody(Model):
    name: str = Field(min_length=1, max_length=120)
    expertise: str = Field(default="", max_length=500)
    phone: str = Field(default="", max_length=40)
    notes: str = Field(default="", max_length=2000)


class LocalBody(Model):
    id: int = Field(ge=1)
    label: str = Field(min_length=1)
    short: str = Field(min_length=1)


class MetaBody(Model):
    eventName: str = Field(min_length=1)
    startDate: str = ""
    endDate: str = ""
    location: str = ""
    locals: list[LocalBody] = Field(
        default_factory=lambda: [
            LocalBody(id=1, label="Lokal 1", short="L1"),
            LocalBody(id=2, label="Lokal 2", short="L2"),
            LocalBody(id=3, label="Lokal 3", short="L3"),
            LocalBody(id=4, label="Lokal 4", short="L4"),
            LocalBody(id=5, label="Lokal 5", short="L5"),
        ]
    )


class EventMetaBody(Model):
    eventName: str = Field(min_length=1)
    startDate: str = ""
    endDate: str = ""
    location: str = ""


class LocalCreateBody(Model):
    label: str = Field(min_length=1)
    short: str = Field(min_length=1)


class LocalUpdateBody(Model):
    label: str | None = Field(default=None, min_length=1)
    short: str | None = Field(default=None, min_length=1)


class SessionSpeakerBody(Model):
    speakerId: str = Field(min_length=1)
    role: SpeakerRole
    attendance: Attendance = "hadir"
    notes: str = ""


class SessionAttendanceBody(Model):
    participantId: str = Field(min_length=1)
    status: Attendance = "hadir"
    notes: str = ""


class SessionCreateBody(Model):
    date: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    location: str = ""
    no: int | None = Field(default=None, gt=0)
    localId: LocalId
    startTime: str = ""
    endTime: str = ""
    durationMinutes: NonNegativeInt | None = None
    actualStartTime: str = ""
    actualEndTime: str = ""
    actualDurationMinutes: NonNegativeInt | None = None
    status: SessionStatus = "scheduled"


class SessionPatchBody(Model):
    date: str | None = Field(default=None, min_length=1)
    topic: str | None = Field(default=None, min_length=1)
    location: str | None = None
    no: int | None = Field(default=None, gt=0)
    localId: LocalId | None = None
    startTime: str | None = None
    endTime: str | None = None
    durationMinutes: NonNegativeInt | None = None
    actualStartTime: str | None = None
    actualEndTime: str | None = None
    actualDurationMinutes: NonNegativeInt | None = None
    status: SessionStatus | None = None
    speakers: list[SessionSpeakerBody] | None = None
    attendance: list[SessionAttendanceBody] | None = None


class AssessmentCreateBody(Model):
    speakerId: str = Field(min_length=1)
    date: str = Field(min_length=1)
    time: str = ""
    observerName: str | None = None
    scores: dict[str, ScoreValue]
    notes: dict[str, str] = Field(default_factory=dict)
    generalNotes: str = ""
    recommendations: str = ""


class AssessmentPatchBody(Model):
    speakerId: str | None = Field(default=None, min_length=1)
    date: str | None = Field(default=None, min_length=1)
    time: str | None = None
    observerName: str | None = None
    scores: dict[str, ScoreValue] | None = None
    notes: dict[str, str] | None = None
    generalNotes: str | None = None
    recommendations: str | None = None


class SeatBody(Model):
    id: str = Field(min_length=1)
    name: str = ""
    x: float
    y: float
    m: float = 0
    participantId: str | None = None
    note: str = ""


class BoxBody(Model):
    id: str = Field(min_length=1)
    x: float
    y: float
    w: float
    h: float
    label: str = ""


class SosiogramBody(Model):
    seats: list[SeatBody] = Field(default_factory=list)
    boxes: list[BoxBody] = Field(default_factory=list)
    scores: dict[str, list[str]] = Field(default_factory=dict)
    links: dict[str, float] = Field(default_factory=dict)
    cat: str = ""
    participantNotes: dict[str, str] = Field(default_factory=dict)

    @field_validator("scores", mode="before")
    @classmethod
    def clamp_reli_scores(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        return {
            str(seat_id): (
                [normalize_reli_score(item) for item in values]
                if isinstance(values, list)
                else values
            )
            for seat_id, values in value.items()
        }


class SosiogramSaveBody(Model):
    version: NonNegativeInt
    sosiogram: SosiogramBody
