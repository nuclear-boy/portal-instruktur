from __future__ import annotations

from fastapi import Request

from auth import require_auth
from errors import HttpError

ADMIN = "admin"
KOORDINATOR = "koordinator"
INSTRUKTUR = "instruktur_lokal"
OBSERVER = "observer"

LOCAL_SCOPED = (INSTRUKTUR, OBSERVER)
MASTER_ROLES = (KOORDINATOR,)
REPORT_ROLES = (OBSERVER,)
ACCOUNT_ROLES = (KOORDINATOR, INSTRUKTUR, OBSERVER)


async def require_operational(request: Request) -> dict:
    auth = await require_auth(request)
    if auth.get("role") == ADMIN:
        raise HttpError(403, "Admin tidak memiliki akses ke data operasional")
    return auth


async def require_master(request: Request) -> dict:
    return await require_auth(request, list(MASTER_ROLES))


async def require_report_writer(request: Request) -> dict:
    return await require_auth(request, list(REPORT_ROLES))
