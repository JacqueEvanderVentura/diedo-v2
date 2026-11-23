from datetime import UTC, datetime, timedelta
from uuid import uuid7

import pytest
from app.config import settings
from app.db.models import UserNotification
from app.db.models.agenda import AppointmentSlotHold
from app.db.models.email_notifications import EmailNotification
from app.db.session import get_session_factory, session_scope
from app.services.email import EmailDeliveryResult
from app.services.slot_hold_expiry import purge_expired_slot_holds
from sqlalchemy import func, select

from tests.test_public_booking_flow import _slot_params, payload_for

pytest_plugins = ("tests.test_public_booking_flow",)


def _hold_headers(token: str) -> dict[str, str]:
    return {"X-Slot-Hold-Token": token}


def _expire_hold(hold_id) -> None:
    with session_scope() as session:
        hold = session.get(AppointmentSlotHold, hold_id)
        assert hold is not None
        hold.expires_at = datetime.now(UTC) - timedelta(minutes=1)


def _purge_holds(*, now: datetime | None = None) -> int:
    """Match worker usage: plain session commits after purge (not session_scope)."""
    moment = now or datetime.now(UTC)
    with get_session_factory()() as session:
        count = purge_expired_slot_holds(session, now=moment)
        session.commit()
        return count


def _claim_with_customer(client, booking_setup):
    _, _, branch, employee, service = booking_setup
    body = payload_for(employee, service)
    base = f"/api/v1/public/booking/branches/{branch}"
    token = f"hold-token-{uuid7().hex[:12]}"
    slots = client.get(
        f"{base}/slots",
        params=_slot_params(body, employee, service),
    ).json()["slots"]
    pick = slots[0]
    claim = client.post(
        f"{base}/slot-holds",
        headers=_hold_headers(token),
        json={
            "serviceId": service,
            "employeeId": employee,
            "date": body["date"],
            "time": pick,
            "documentType": body["documentType"],
            "documentId": body["documentId"],
            "customerName": body["displayName"],
            "customerPhone": body["phone"],
            "customerEmail": body["email"],
        },
    )
    assert claim.status_code == 201, claim.text
    hold_id = session_hold_id(token)
    return branch, employee, service, body, token, hold_id, pick


def session_hold_id(token: str):
    with session_scope() as session:
        hold = session.scalar(
            select(AppointmentSlotHold).where(AppointmentSlotHold.holder_token == token)
        )
        assert hold is not None
        return hold.id


@pytest.mark.integration
def test_expired_hold_without_booking_notifies_staff_and_customer(
    client, booking_setup, monkeypatch
):
    headers, me, *_rest = booking_setup
    branch, employee, service, body, token, hold_id, _pick = _claim_with_customer(
        client, booking_setup
    )

    def fake_send(**_kwargs: object) -> EmailDeliveryResult:
        return EmailDeliveryResult(provider_id="msg_abandoned")

    monkeypatch.setattr("app.services.email_notifications.send_email", fake_send)
    monkeypatch.setattr(settings, "email_enabled", True)

    _expire_hold(hold_id)

    assert _purge_holds() == 1

    workspace_id = me["workspace"]["id"]
    with session_scope() as session:
        bell_count = session.scalar(
            select(func.count()).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.event_key.like(f"slot_hold.abandoned/{hold_id}/%"),
            )
        )
        assert bell_count and bell_count >= 1
        customer_mail = session.scalar(
            select(EmailNotification).where(
                EmailNotification.workspace_id == workspace_id,
                EmailNotification.event_key == f"slot_hold.abandoned.customer/{hold_id}",
            )
        )
        assert customer_mail is not None
        assert customer_mail.recipient == body["email"]
        assert customer_mail.status == "sent"

    listed = client.get("/api/v1/notifications?page=1&pageSize=5", headers=headers)
    assert listed.status_code == 200, listed.text
    assert any(item["eventType"] == "slot_hold.abandoned" for item in listed.json()["items"])

    client.get(
        f"/api/v1/public/booking/branches/{branch}/slots",
        params=_slot_params(body, employee, service),
    )
    with session_scope() as session:
        hold = session.get(AppointmentSlotHold, hold_id)
        assert hold is None


@pytest.mark.integration
def test_expired_hold_skipped_when_customer_booked_after_hold(client, booking_setup):
    _, me, branch, employee, service = booking_setup
    branch, employee, service, body, token, hold_id, pick = _claim_with_customer(
        client, booking_setup
    )
    base = f"/api/v1/public/booking/branches/{branch}"
    # List slots while the hold is still active (expired holds are purged on public slot/day calls).
    other_slots = client.get(f"{base}/slots", params=_slot_params(body, employee, service)).json()[
        "slots"
    ]
    other = next(slot for slot in other_slots if slot != pick)
    book = client.post(
        f"{base}/appointments",
        headers={"Idempotency-Key": f"abandon-book-{uuid7().hex[:16]}"},
        json={**body, "time": other},
    )
    assert book.status_code == 201, book.text

    _expire_hold(hold_id)

    workspace_id = me["workspace"]["id"]
    _purge_holds()

    with session_scope() as session:
        bell_count = session.scalar(
            select(func.count()).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.event_key.like(f"slot_hold.abandoned/{hold_id}/%"),
            )
        )
        assert bell_count == 0


@pytest.mark.integration
def test_expired_hold_without_email_skips_customer_mail(client, booking_setup, monkeypatch):
    _, me, branch, employee, service = booking_setup
    body = payload_for(employee, service)
    base = f"/api/v1/public/booking/branches/{branch}"
    token = f"hold-token-{uuid7().hex[:12]}"
    slots = client.get(
        f"{base}/slots",
        params=_slot_params(body, employee, service),
    ).json()["slots"]
    pick = slots[0]
    claim = client.post(
        f"{base}/slot-holds",
        headers=_hold_headers(token),
        json={
            "serviceId": service,
            "employeeId": employee,
            "date": body["date"],
            "time": pick,
        },
    )
    assert claim.status_code == 201, claim.text
    hold_id = session_hold_id(token)

    def fake_send(**_kwargs: object) -> EmailDeliveryResult:
        return EmailDeliveryResult(provider_id="msg_abandoned")

    monkeypatch.setattr("app.services.email_notifications.send_email", fake_send)
    _expire_hold(hold_id)

    workspace_id = me["workspace"]["id"]
    _purge_holds()

    with session_scope() as session:
        customer_mail = session.scalar(
            select(EmailNotification).where(
                EmailNotification.workspace_id == workspace_id,
                EmailNotification.event_key == f"slot_hold.abandoned.customer/{hold_id}",
            )
        )
        assert customer_mail is None
        bell_count = session.scalar(
            select(func.count()).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.event_key.like(f"slot_hold.abandoned/{hold_id}/%"),
            )
        )
        assert bell_count and bell_count >= 1


@pytest.mark.integration
def test_purge_is_idempotent_for_abandoned_notifications(client, booking_setup, monkeypatch):
    def fake_send(**_kwargs: object) -> EmailDeliveryResult:
        return EmailDeliveryResult(provider_id="msg_abandoned")

    monkeypatch.setattr("app.services.email_notifications.send_email", fake_send)
    _, me, *_ = booking_setup
    *_, hold_id, _pick = _claim_with_customer(client, booking_setup)
    _expire_hold(hold_id)

    workspace_id = me["workspace"]["id"]
    _purge_holds()

    with session_scope() as session:
        first_count = session.scalar(
            select(func.count()).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.event_key.like(f"slot_hold.abandoned/{hold_id}/%"),
            )
        )
    assert _purge_holds() == 0
    assert first_count and first_count >= 1
    with session_scope() as session:
        second_count = session.scalar(
            select(func.count()).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.event_key.like(f"slot_hold.abandoned/{hold_id}/%"),
            )
        )
    assert first_count == second_count


@pytest.mark.integration
def test_release_before_expiry_skips_abandoned_notifications(client, booking_setup):
    _, me, branch, employee, service = booking_setup
    body = payload_for(employee, service)
    base = f"/api/v1/public/booking/branches/{branch}"
    token = f"hold-token-{uuid7().hex[:12]}"
    slots = client.get(
        f"{base}/slots",
        params=_slot_params(body, employee, service),
    ).json()["slots"]
    pick = slots[0]
    claim = client.post(
        f"{base}/slot-holds",
        headers=_hold_headers(token),
        json={
            "serviceId": service,
            "employeeId": employee,
            "date": body["date"],
            "time": pick,
            "customerEmail": body["email"],
        },
    )
    assert claim.status_code == 201, claim.text
    hold_id = session_hold_id(token)
    released = client.delete(f"{base}/slot-holds", headers=_hold_headers(token))
    assert released.status_code == 204, released.text

    workspace_id = me["workspace"]["id"]
    _purge_holds()

    with session_scope() as session:
        bell_count = session.scalar(
            select(func.count()).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.event_key.like(f"slot_hold.abandoned/{hold_id}/%"),
            )
        )
        assert bell_count == 0
