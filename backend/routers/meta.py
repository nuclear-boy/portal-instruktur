from __future__ import annotations

from fastapi import APIRouter, Request

from errors import parse_model, read_json
from permissions import require_master
from schemas import EventMetaBody
from services.locals import load_meta, save_meta

router = APIRouter(tags=["meta"])


@router.get("/meta")
async def get_meta():
    return {"meta": await load_meta()}


@router.post("/meta")
async def update_meta(request: Request):
    await require_master(request)
    data = parse_model(EventMetaBody, await read_json(request))
    meta = await load_meta()
    meta.update(data.model_dump())
    await save_meta(meta)
    return {"meta": meta}
