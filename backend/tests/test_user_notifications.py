from typing import Any
from uuid import UUID, uuid7

import pytest
from app.core.security import hash_password
from app.db.models import EmailNotification, UserNotification, WorkspaceMembership
from app.db.session import session_scope
from app.services.email import EmailDeliveryResult
from app.services.local_bootstrap import bootstrap_local_foundation
from app.services.user_notifications import NotificationPayload, UserNotificationService
from fastapi.testclient import TestClient
from sqlalchemy import func, select

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "user-notifications-owner-password-not-a-secret"


def _bootstrap_and_login(client: TestClient) -> tuple[dict[str, str], dict[str, Any]]:
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
    login = client.post(
        "/api/v1/auth/login",
        json={"email": _OWNER_EMAIL, "password": _OWNER_PASSWORD},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    return headers, me.json()


@pytest.fixture
def notification_session(client: TestClient) -> tuple[dict[str, str], dict[str, Any]]:
    return _bootstrap_and_login(client)


def test_notifications_api_requires_auth(client: TestClient) -> None:
    denied = client.get("/api/v1/notifications")
    assert denied.status_code == 401


@pytest.mark.integration
def test_notifications_fanout_mark_read_and_cap(
    client: TestClient,
    notification_session: tuple[dict[str, str], dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, me = notification_session
    workspace_id = UUID(me["workspaceId"])
    membership_id = UUID(me["membershipId"])

    def fake_send(**_kwargs: object) -> EmailDeliveryResult:
        return EmailDeliveryResult(provider_id="msg_test")

    monkeypatch.setattr("app.services.email_notifications.send_email", fake_send)

    with session_scope() as session:
        service = UserNotificationService(session)
        for index in range(55):
            service.fanout(
                workspace_id=workspace_id,
                payloads=(
                    NotificationPayload(
                        membership_id=membership_id,
                        event_type="test.event",
                        event_key=f"test.event/{index}",
                        title=f"Notificación {index}",
                        body=f"Cuerpo {index}",
                        priority="alta" if index == 0 else "normal",
                        link={"path": "/incidencias"},
                        send_email=index == 0,
                    ),
                ),
            )
        session.commit()
        service.deliver_pending_emails()

    with session_scope() as session:
        count = session.scalar(
            select(func.count()).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.membership_id == membership_id,
            )
        )
        assert count == 50
        email_count = session.scalar(
            select(func.count()).where(
                EmailNotification.workspace_id == workspace_id,
                EmailNotification.event_key == "staff.inapp/test.event/0",
            )
        )
        assert email_count == 1

    listed = client.get("/api/v1/notifications?page=1&pageSize=10", headers=headers)
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["total"] == 50
    assert body["unreadCount"] == 50
    assert len(body["items"]) == 10

    first_id = body["items"][0]["id"]
    read_one = client.post(f"/api/v1/notifications/{first_id}/read", headers=headers)
    assert read_one.status_code == 200

    read_all = client.post("/api/v1/notifications/read-all", headers=headers)
    assert read_all.status_code == 200
    assert read_all.json()["updated"] >= 1

    listed_after = client.get("/api/v1/notifications", headers=headers)
    assert listed_after.json()["unreadCount"] == 0


@pytest.mark.integration
def test_incident_intervener_skips_actor(
    client: TestClient,
    notification_session: tuple[dict[str, str], dict[str, Any]],
) -> None:
    headers, me = notification_session
    workspace_id = UUID(me["workspaceId"])
    actor_id = UUID(me["membershipId"])
    incident_id = uuid7()

    with session_scope() as session:
        others = session.scalars(
            select(WorkspaceMembership.id).where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.id != actor_id,
                WorkspaceMembership.status == "active",
            )
        ).all()
        if not others:
            pytest.skip("Bootstrap has a single membership")
        target_id = others[0]
        service = UserNotificationService(session)
        service.notify_incident_interveners(
            workspace_id=workspace_id,
            incident_id=incident_id,
            incident_code="INC-9999",
            title="Prueba",
            priority="media",
            participant_ids={actor_id, target_id},
            actor_membership_id=actor_id,
            reporter_name="Reporter",
        )
        actor_count = session.scalar(
            select(func.count()).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.membership_id == actor_id,
                UserNotification.event_key.like(f"incident.intervener/{incident_id}/%"),
            )
        )
        target_count = session.scalar(
            select(func.count()).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.membership_id == target_id,
                UserNotification.event_key.like(f"incident.intervener/{incident_id}/%"),
            )
        )
        assert actor_count == 0
        assert target_count == 1

    missing = client.post(f"/api/v1/notifications/{uuid7()}/read", headers=headers)
    assert missing.status_code == 404
