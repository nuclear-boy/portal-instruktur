from __future__ import annotations

import json
import time
from typing import Any

import httpx

from config import (
    DATA_TTL_SECONDS,
    UPSTASH_REDIS_REST_TOKEN,
    UPSTASH_REDIS_REST_URL,
)

TTL = DATA_TTL_SECONDS


class UpstashRedis:
    def __init__(self, url: str, token: str) -> None:
        self._base_url = url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}"}
        self.client = self._create_client()

    def _create_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._base_url,
            headers=self._headers,
            timeout=15.0,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )

    async def command(self, *parts: Any) -> Any:
        if self.client.is_closed:
            self.client = self._create_client()
        response = await self.client.post("/", json=list(parts))
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, dict) and payload.get("error"):
            raise RuntimeError(f"Upstash error: {payload['error']}")
        if isinstance(payload, dict):
            return payload.get("result")
        return payload

    async def aclose(self) -> None:
        if not self.client.is_closed:
            await self.client.aclose()


redis = (
    UpstashRedis(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)
    if UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
    else None
)


async def close_redis() -> None:
    if redis is not None:
        await redis.aclose()

_memory: dict[str, tuple[Any, float]] = {}
using_redis = redis is not None


def reset_memory() -> None:
    _memory.clear()


def _alive(key: str) -> tuple[Any, float] | None:
    entry = _memory.get(key)
    if entry is None:
        return None
    _, expires_at = entry
    if expires_at and expires_at < time.time() * 1000:
        _memory.pop(key, None)
        return None
    return entry


def _put(key: str, value: Any, ttl: int | None = TTL) -> None:
    expires_at = 0 if ttl is None else time.time() * 1000 + ttl * 1000
    _memory[key] = (value, expires_at)


async def get(key: str) -> Any:
    if redis:
        raw = await redis.command("GET", key)
        if raw is None:
            return None
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return raw
        return raw
    entry = _alive(key)
    return entry[0] if entry else None


async def mget(keys: list[str]) -> list[Any]:
    if not keys:
        return []
    if redis:
        raw_values = await redis.command("MGET", *keys)
        results: list[Any] = []
        for raw in raw_values or []:
            if raw is None:
                results.append(None)
            elif isinstance(raw, str):
                try:
                    results.append(json.loads(raw))
                except json.JSONDecodeError:
                    results.append(raw)
            else:
                results.append(raw)
        return results
    results = []
    for key in keys:
        entry = _alive(key)
        results.append(entry[0] if entry else None)
    return results


async def set(key: str, value: Any, ttl: int | None = TTL) -> None:
    if redis:
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        if ttl is None:
            await redis.command("SET", key, payload)
        else:
            await redis.command("SET", key, payload, "EX", int(ttl))
        return
    _put(key, value, ttl)


async def set_raw(key: str, value: str, ttl: int | None = TTL) -> None:
    if redis:
        if ttl is None:
            await redis.command("SET", key, value)
        else:
            await redis.command("SET", key, value, "EX", int(ttl))
        return
    _put(key, value, ttl)


async def persist(key: str) -> None:
    if redis:
        await redis.command("PERSIST", key)
        return
    entry = _alive(key)
    if entry:
        _memory[key] = (entry[0], 0)


async def delete(*keys: str) -> None:
    if redis:
        if keys:
            await redis.command("DEL", *keys)
        return
    for key in keys:
        _memory.pop(key, None)


async def sadd(key: str, *members: str, ttl: int | None = TTL) -> None:
    if redis:
        if members:
            await redis.command("SADD", key, *members)
        if ttl is not None:
            await redis.command("EXPIRE", key, int(ttl))
        return
    entry = _alive(key)
    values = list(entry[0]) if entry and isinstance(entry[0], list) else []
    for member in members:
        if member not in values:
            values.append(member)
    _put(key, values, ttl)


async def srem(key: str, *members: str) -> None:
    if redis:
        if members:
            await redis.command("SREM", key, *members)
        return
    entry = _alive(key)
    if not entry or not isinstance(entry[0], list):
        return
    _memory[key] = (
        [value for value in entry[0] if value not in members],
        entry[1],
    )


async def smembers(key: str) -> list[str]:
    if redis:
        result = await redis.command("SMEMBERS", key)
        return list(result or [])
    entry = _alive(key)
    return list(entry[0]) if entry and isinstance(entry[0], list) else []


async def incr(key: str, ttl: int = 900) -> int:
    if redis:
        value = int(await redis.command("INCR", key))
        if value == 1:
            await redis.command("EXPIRE", key, int(ttl))
        return value
    entry = _alive(key)
    value = int(entry[0]) + 1 if entry and isinstance(entry[0], int) else 1
    _put(key, value, ttl)
    return value


async def expire(key: str, ttl: int = TTL) -> None:
    if redis:
        await redis.command("EXPIRE", key, int(ttl))
        return
    entry = _alive(key)
    if entry:
        _put(key, entry[0], ttl)


async def scan_keys(prefix: str) -> list[str]:
    if redis:
        cursor = "0"
        keys: list[str] = []
        while True:
            result = await redis.command(
                "SCAN", cursor, "MATCH", f"{prefix}*", "COUNT", 200
            )
            cursor = str(result[0])
            keys.extend(result[1] or [])
            if cursor == "0":
                break
        return keys
    return [key for key in _memory if key.startswith(prefix)]
