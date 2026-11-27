from __future__ import annotations

import json
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError
from starlette.requests import Request

T = TypeVar("T", bound=BaseModel)

MAX_BODY_BYTES = 1_048_576

class HttpError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message

async def read_json(request: Request, max_bytes: int = MAX_BODY_BYTES) -> Any:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise HttpError(413, "Ukuran data terlalu besar")
        except ValueError:
            pass
    body = await request.body()
    if len(body) > max_bytes:
        raise HttpError(413, "Ukuran data terlalu besar")
    if not body:
        return {}
    try:
        value = json.loads(body)
    except json.JSONDecodeError as error:
        raise HttpError(400, "Body JSON tidak valid") from error
    return {} if value is None else value

def parse_model(model: type[T], value: Any) -> T:
    try:
        return model.model_validate(value)
    except ValidationError as error:
        first = error.errors()[0]
        context_error = (first.get("ctx") or {}).get("error")
        message = str(context_error) if context_error else first.get("msg", "Data tidak valid")
        if message.startswith("Value error, "):
            message = message.removeprefix("Value error, ")
        raise HttpError(400, message) from error
