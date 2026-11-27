from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db
from app import app
from auth import hash_password
from services import store
from services.assessment import ASSESSMENT_ITEMS
from services.store import K, make_admin_permanent, now

PASSWORD = "password123"
PASSWORD_HASH = hash_password(PASSWORD)
USERS = [
    ("u-admin", "admin@test.local", "Admin Test", "admin", None),
    ("u-koord", "koordinator@test.local", "Koordinator Test", "koordinator", None),
    ("u-obs1", "observer1@test.local", "Observer Satu", "observer", 1),
    ("u-obs2", "observer2@test.local", "Observer Dua", "observer", 2),
    ("u-inlok", "inlok@test.local", "Instruktur Lokal", "instruktur_lokal", 1),
]

async def seed_users() -> None:
    for user_id, email, name, role, local_id in USERS:
        user = {
            "id": user_id,
            "email": email,
            "name": name,
            "role": role,
            "localId": local_id,
            "position": "",
            "active": True,
            "passwordHash": PASSWORD_HASH,
            "createdAt": now(),
        }
        await db.set(K.user + user_id, user)
        await db.set_raw(K.email + email, user_id)
        await db.sadd(K.index_users, user_id, ttl=None)
        await make_admin_permanent(user)

@pytest.fixture(autouse=True)
def reset_store(monkeypatch):
    db.redis = None
    db.using_redis = False
    db.reset_memory()
    monkeypatch.setattr(store, "ADMIN_PERSIST_EMAIL", "admin@test.local")
    asyncio.run(seed_users())
    yield
    db.reset_memory()

@pytest.fixture
def client():
    return TestClient(app)

def headers(client: TestClient, email: str) -> dict:
    response = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}

def create_participant(client: TestClient, auth: dict, name: str, local_id: int) -> dict:
    response = client.post(
        "/api/participants",
        json={"name": name, "localId": local_id},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return response.json()["participant"]

def create_session(client: TestClient, auth: dict, local_id: int, topic: str = "Materi Uji") -> dict:
    response = client.post(
        "/api/sessions",
        json={"date": "2026-11-20", "topic": topic, "localId": local_id},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return response.json()["session"]

def create_user(client: TestClient, auth: dict, role: str, email: str, local_id: int | None = None):
    payload = {
        "email": email,
        "name": f"Akun {role}",
        "role": role,
        "password": PASSWORD,
    }
    if local_id is not None:
        payload["localId"] = local_id
    return client.post("/api/admin/users", json=payload, headers=auth)

def test_meta_is_public_and_cors_preflight(client: TestClient):
    root_res = client.get("/")
    assert root_res.status_code == 200
    assert root_res.json()["ok"] is True

    response = client.get("/api/meta")
    assert response.status_code == 200
    assert response.json()["meta"]["eventName"]

    preflight = client.options(
        "/api/meta",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert preflight.status_code == 204
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:5173"

def test_login_sets_last_login_and_me(client: TestClient):
    koord = headers(client, "koordinator@test.local")
    response = client.get("/api/auth/me", headers=koord)
    assert response.status_code == 200
    user = response.json()["user"]
    assert user["email"] == "koordinator@test.local"
    assert user["lastLoginAt"]
    assert "passwordHash" not in user

def test_admin_keys_are_permanent_and_other_accounts_keep_ttl(client: TestClient):
    headers(client, "admin@test.local")
    assert db._memory[K.user + "u-admin"][1] == 0
    assert db._memory[K.email + "admin@test.local"][1] == 0
    assert db._memory[K.index_users][1] == 0
    assert db._memory[K.user + "u-koord"][1] > 0
    assert db._memory[K.email + "koordinator@test.local"][1] > 0

def test_persistent_user_index_survives_removal(client: TestClient):
    admin = headers(client, "admin@test.local")
    created = create_user(client, admin, "koordinator", "koord2@test.local")
    assert created.status_code == 201, created.text
    assert db._memory[K.index_users][1] == 0

    removed = client.delete(f"/api/admin/users/{created.json()['user']['id']}", headers=admin)
    assert removed.status_code == 200
    assert db._memory[K.index_users][1] == 0

def test_meta_keeps_ttl(client: TestClient):
    asyncio.run(db.set(K.meta, {"eventName": "Uji TTL"}))
    assert db._memory[K.meta][1] > 0

def test_all_roles_can_change_own_password(client: TestClient):
    for email in (
        "admin@test.local",
        "koordinator@test.local",
        "observer1@test.local",
        "inlok@test.local",
    ):
        auth = headers(client, email)
        response = client.post(
            "/api/auth/password",
            json={"currentPassword": PASSWORD, "newPassword": "newpassword123"},
            headers=auth,
        )
        assert response.status_code == 200, response.text
        assert (
            client.post(
                "/api/auth/login",
                json={"email": email, "password": "newpassword123"},
            ).status_code
            == 200
        )

def test_admin_cannot_read_operational_data(client: TestClient):
    admin = headers(client, "admin@test.local")
    assert client.get("/api/participants", headers=admin).status_code == 403
    assert client.get("/api/sessions", headers=admin).status_code == 403
    assert client.get("/api/speakers", headers=admin).status_code == 403

def test_participant_roles_and_local_scope(client: TestClient):
    koord = headers(client, "koordinator@test.local")
    obs1 = headers(client, "observer1@test.local")
    obs2 = headers(client, "observer2@test.local")
    inlok = headers(client, "inlok@test.local")

    first = create_participant(client, koord, "Peserta Lokal 1", 1)
    second = create_participant(client, koord, "Peserta Lokal 2", 2)

    for auth in (obs1, inlok):
        forbidden = client.post(
            "/api/participants",
            json={"name": "Tidak Boleh", "localId": 1},
            headers=auth,
        )
        assert forbidden.status_code == 403

    list1 = client.get("/api/participants", headers=obs1).json()["participants"]
    list2 = client.get("/api/participants", headers=obs2).json()["participants"]
    assert [item["id"] for item in list1] == [first["id"]]
    assert [item["id"] for item in list2] == [second["id"]]

    detail = client.get(f"/api/participants/{second['id']}", headers=obs1)
    assert detail.status_code == 403

def test_session_creation_and_sosiogram_conflict(client: TestClient):
    koord = headers(client, "koordinator@test.local")
    obs1 = headers(client, "observer1@test.local")
    inlok = headers(client, "inlok@test.local")
    participant = create_participant(client, koord, "Peserta Sosiogram", 1)
    session = create_session(client, koord, 1)

    assert session["version"] == 0
    assert len(session["attendance"]) == 1
    assert session["attendance"][0]["participantId"] == participant["id"]

    sosiogram = session["sosiogram"]
    seat = next(item for item in sosiogram["seats"] if item.get("participantId") == participant["id"])
    sosiogram["scores"] = {seat["id"]: ["5", "4", "3", "2"]}

    saved = client.put(
        f"/api/sessions/{session['id']}/sosiogram",
        json={"version": 0, "sosiogram": sosiogram},
        headers=obs1,
    )
    assert saved.status_code == 200, saved.text
    updated = saved.json()["session"]
    assert updated["version"] == 1
    assert updated["scores"][participant["id"]] == {"r": 5, "e": 4, "l": 3, "i": 2}

    sosiogram["scores"] = {seat["id"]: ["-3", "15", "12.5", ""]}
    clamped = client.put(
        f"/api/sessions/{session['id']}/sosiogram",
        json={"version": 1, "sosiogram": sosiogram},
        headers=obs1,
    )
    assert clamped.status_code == 200, clamped.text
    clamped_session = clamped.json()["session"]
    assert clamped_session["version"] == 2
    assert clamped_session["sosiogram"]["scores"][seat["id"]] == ["0", "10", "10", ""]
    assert clamped_session["scores"][participant["id"]] == {
        "r": 0,
        "e": 10,
        "l": 10,
        "i": 0,
    }

    stale = client.put(
        f"/api/sessions/{session['id']}/sosiogram",
        json={"version": 0, "sosiogram": sosiogram},
        headers=obs1,
    )
    assert stale.status_code == 409

    forbidden = client.put(
        f"/api/sessions/{session['id']}/sosiogram",
        json={"version": 2, "sosiogram": sosiogram},
        headers=inlok,
    )
    assert forbidden.status_code == 403

def test_session_patch_privileges(client: TestClient):
    koord = headers(client, "koordinator@test.local")
    obs1 = headers(client, "observer1@test.local")
    inlok = headers(client, "inlok@test.local")
    create_participant(client, koord, "Peserta Patch", 1)
    session = create_session(client, koord, 1)

    forbidden = client.patch(
        f"/api/sessions/{session['id']}",
        json={"topic": "Materi Baru"},
        headers=obs1,
    )
    assert forbidden.status_code == 403

    allowed = client.patch(
        f"/api/sessions/{session['id']}",
        json={"status": "completed", "attendance": [{"participantId": "p-x", "status": "hadir"}]},
        headers=obs1,
    )
    assert allowed.status_code == 200

    forbidden_inlok = client.patch(
        f"/api/sessions/{session['id']}",
        json={"status": "scheduled"},
        headers=inlok,
    )
    assert forbidden_inlok.status_code == 403

    updated = client.patch(
        f"/api/sessions/{session['id']}",
        json={"topic": "Materi Baru"},
        headers=koord,
    )
    assert updated.status_code == 200
    assert updated.json()["session"]["topic"] == "Materi Baru"

def test_assessment_observer_only_and_own_delete(client: TestClient):
    koord = headers(client, "koordinator@test.local")
    obs1 = headers(client, "observer1@test.local")
    inlok = headers(client, "inlok@test.local")
    create_participant(client, koord, "Peserta Penilaian", 1)
    session = create_session(client, koord, 1)

    speaker_response = client.post(
        "/api/speakers",
        json={"name": "Pemateri Uji"},
        headers=koord,
    )
    assert speaker_response.status_code == 201
    speaker = speaker_response.json()["speaker"]

    assert (
        client.post(
            "/api/speakers",
            json={"name": "Pemateri Ilegal"},
            headers=obs1,
        ).status_code
        == 403
    )

    assessment_response = client.post(
        f"/api/sessions/{session['id']}/assessments",
        json={
            "speakerId": speaker["id"],
            "date": "2026-11-20",
            "scores": {item["key"]: 4 for item in ASSESSMENT_ITEMS},
        },
        headers=obs1,
    )
    assert assessment_response.status_code == 201, assessment_response.text
    assessment = assessment_response.json()["assessment"]
    assert assessment["observerId"] == "u-obs1"

    assert (
        client.post(
            f"/api/sessions/{session['id']}/assessments",
            json={
                "speakerId": speaker["id"],
                "date": "2026-11-20",
                "scores": {item["key"]: 4 for item in ASSESSMENT_ITEMS},
            },
            headers=inlok,
        ).status_code
        == 403
    )

    forbidden_delete = client.delete(
        f"/api/sessions/{session['id']}/assessments?assessmentId={assessment['id']}",
        headers=koord,
    )
    assert forbidden_delete.status_code == 403

    deleted = client.delete(
        f"/api/sessions/{session['id']}/assessments?assessmentId={assessment['id']}",
        headers=obs1,
    )
    assert deleted.status_code == 200

def test_admin_and_koordinator_account_guards(client: TestClient):
    admin = headers(client, "admin@test.local")
    koord = headers(client, "koordinator@test.local")

    created_koord = create_user(client, admin, "koordinator", "koord2@test.local")
    assert created_koord.status_code == 201, created_koord.text
    created_obs = create_user(client, koord, "observer", "observer3@test.local", 3)
    assert created_obs.status_code == 201, created_obs.text

    assert create_user(client, admin, "observer", "observer4@test.local", 1).status_code == 403
    assert create_user(client, koord, "koordinator", "koord3@test.local").status_code == 403
    assert create_user(client, koord, "admin", "admin2@test.local").status_code == 403

    observer_id = created_obs.json()["user"]["id"]
    assert client.patch(f"/api/admin/users/{observer_id}", json={"name": "Ubah"}, headers=admin).status_code == 403
    assert client.delete(f"/api/admin/users/{observer_id}", headers=admin).status_code == 403
    assert client.delete(f"/api/admin/users/{created_koord.json()['user']['id']}", headers=admin).status_code == 200

    deactivate_last = client.patch(
        "/api/admin/users/u-koord",
        json={"active": False},
        headers=admin,
    )
    assert deactivate_last.status_code == 400, deactivate_last.text

    admin_users = client.get("/api/admin/users", headers=admin).json()["users"]
    assert any(item["role"] == "observer" for item in admin_users)
    assert any(item.get("lastLoginAt") for item in admin_users)

    koord_users = client.get("/api/admin/users", headers=koord).json()["users"]
    assert all(item["role"] in ("instruktur_lokal", "observer") for item in koord_users)

    assert client.post("/api/admin/purge", headers=admin).status_code in (404, 405)

def test_delete_local_cascades(client: TestClient):
    koord = headers(client, "koordinator@test.local")
    local_response = client.post(
        "/api/locals",
        json={"label": "Lokal Uji", "short": "LU"},
        headers=koord,
    )
    assert local_response.status_code == 201, local_response.text
    local_id = local_response.json()["local"]["id"]

    participant = create_participant(client, koord, "Peserta Lokal Uji", local_id)
    session = create_session(client, koord, local_id)
    user_response = create_user(client, koord, "observer", "obs.local@test.local", local_id)
    assert user_response.status_code == 201, user_response.text

    deleted = client.delete(f"/api/locals/{local_id}", headers=koord)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["deleted"] == {"participants": 1, "sessions": 1, "users": 1}

    assert client.get(f"/api/participants/{participant['id']}", headers=koord).status_code == 404
    assert client.get(f"/api/sessions/{session['id']}", headers=koord).status_code == 404
    assert client.get("/api/admin/users", headers=koord).status_code == 200
    assert all(
        item["id"] != user_response.json()["user"]["id"]
        for item in client.get("/api/admin/users", headers=koord).json()["users"]
    )
    meta = client.get("/api/meta").json()["meta"]
    assert all(int(item["id"]) != local_id for item in meta["locals"])

def test_session_list_sorts_numerically_by_no(client: TestClient):
    koord = headers(client, "koordinator@test.local")
    for no, topic in ((10, "Sesi Sepuluh"), (2, "Sesi Dua"), (1, "Sesi Satu")):
        res = client.post(
            "/api/sessions",
            json={"date": "2026-11-20", "topic": topic, "localId": 1, "no": no},
            headers=koord,
        )
        assert res.status_code == 201, res.text

    listed = client.get("/api/sessions", headers=koord).json()["sessions"]
    assert [item["no"] for item in listed] == [1, 2, 10]

def test_security_headers_and_authenticated_no_store(client: TestClient):
    public_res = client.get("/api/meta")
    assert public_res.headers.get("x-content-type-options") == "nosniff"
    assert public_res.headers.get("x-frame-options") == "DENY"
    assert public_res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"

    koord = headers(client, "koordinator@test.local")
    auth_res = client.get("/api/auth/me", headers=koord)
    assert auth_res.status_code == 200
    assert auth_res.headers.get("cache-control") == "no-store"

def test_seed_speakers_is_idempotent(client: TestClient):
    import seed

    first = asyncio.run(seed.seed_speakers(require_live_redis=False))
    assert first == {"created": 17, "skipped": 0}
    second = asyncio.run(seed.seed_speakers(require_live_redis=False))
    assert second == {"created": 0, "skipped": 17}

    koord = headers(client, "koordinator@test.local")
    listed = client.get("/api/speakers", headers=koord).json()["speakers"]
    assert len(listed) == 17
    assert all(item["notes"] == "" and item["expertise"] == "" for item in listed)

def test_observer_gets_default_speakers_automatically(client: TestClient):
    obs1 = headers(client, "observer1@test.local")
    res = client.get("/api/speakers", headers=obs1)
    assert res.status_code == 200
    speakers = res.json()["speakers"]
    assert len(speakers) == 17
    assert all(item["name"] and item["notes"] == "" and item["expertise"] == "" for item in speakers)

def test_password_change_revokes_old_token_and_returns_fresh_token(client: TestClient):
    old_headers = headers(client, "observer1@test.local")
    res = client.post(
        "/api/auth/password",
        json={"currentPassword": PASSWORD, "newPassword": "newpassword123"},
        headers=old_headers,
    )
    assert res.status_code == 200, res.text
    fresh_token = res.json().get("token")
    assert fresh_token

    assert client.get("/api/auth/me", headers=old_headers).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {fresh_token}"}).status_code == 200

def test_payload_size_limit_rejects_oversized_body(client: TestClient):
    koord = headers(client, "koordinator@test.local")
    huge_payload = '{"name":"' + ("a" * 1_100_000) + '"}'
    res = client.post(
        "/api/speakers",
        content=huge_payload,
        headers={**koord, "Content-Type": "application/json"},
    )
    assert res.status_code == 413

def test_upstash_redis_recreates_client_after_close():
    client = db.UpstashRedis("https://example.upstash.io", "test-token")
    first_http = client.client
    asyncio.run(client.aclose())
    assert first_http.is_closed
    assert client.client.is_closed
    if client.client.is_closed:
        client.client = client._create_client()
    assert not client.client.is_closed
    assert client.client is not first_http
    asyncio.run(client.aclose())
