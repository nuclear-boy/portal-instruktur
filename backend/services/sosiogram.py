from __future__ import annotations

import math
import uuid

CANVAS_W = 980
SEAT_W = 210
SEAT_H = 112
SEAT_GAP = 8
RELI_SCORE_MIN = 0.0
RELI_SCORE_MAX = 10.0


def parse_reli_score(value: object) -> float:
    try:
        numeric = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return RELI_SCORE_MIN
    if not math.isfinite(numeric):
        return RELI_SCORE_MIN
    return min(RELI_SCORE_MAX, max(RELI_SCORE_MIN, numeric))


def normalize_reli_score(value: object) -> str:
    text = str(value).strip() if value is not None else ""
    if not text:
        return ""
    score = parse_reli_score(text)
    return str(int(score)) if score.is_integer() else str(score)


def make_id(prefix: str = "s") -> str:
    return prefix + uuid.uuid4().hex[:10]


def _js_round(value: float) -> int:
    return int(math.floor(value + 0.5))


def empty_sosiogram() -> dict:
    return {
        "seats": [],
        "boxes": [{"id": "b0", "x": 420, "y": 40, "w": 170, "h": 64, "label": "Pemateri"}],
        "scores": {},
        "links": {},
        "cat": "",
        "participantNotes": {},
    }


def layout_seats(data: dict, kind: str, n: int, cols: int = 4) -> dict:
    while len(data["seats"]) < n:
        data["seats"].append({"id": make_id("s"), "name": "", "x": 0, "y": 0, "m": 0})

    total = len(data["seats"])
    half = math.ceil(total / 2)
    bottom = min(total, max(3, math.ceil(total / 3)))
    side = math.ceil((total - bottom) / 2)
    gap = SEAT_W + SEAT_GAP

    if kind == "u":
        podium = next((box for box in data["boxes"] if box["id"] == "b0"), None)
        if podium:
            podium["x"] = max(
                20,
                _js_round(20 + ((bottom - 1) * gap + SEAT_W - podium["w"]) / 2),
            )
            podium["y"] = 40

    for index, seat in enumerate(data["seats"]):
        if kind == "u":
            if index < side:
                seat["m"] = 0
                seat["x"] = 20
                seat["y"] = 20 + index * SEAT_H
            elif index < side + bottom:
                seat["m"] = 0
                seat["x"] = 20 + (index - side) * gap
                seat["y"] = 20 + side * SEAT_H + 10
            else:
                seat["m"] = 1
                seat["x"] = 20 + (bottom - 1) * gap
                seat["y"] = 20 + (total - 1 - index) * SEAT_H
        elif kind == "dua":
            right = index >= half
            seat["m"] = 1 if right else 0
            seat["x"] = CANVAS_W - SEAT_W - 20 if right else 20
            seat["y"] = 20 + (index - half if right else index) * SEAT_H
        else:
            seat["m"] = 0
            seat["x"] = 20 + (index % cols) * (SEAT_W + 14)
            seat["y"] = 20 + (index // cols) * (SEAT_H + SEAT_GAP)

    return data


def with_default_seats(n: int = 24) -> dict:
    return layout_seats(empty_sosiogram(), "u", n, 4)
