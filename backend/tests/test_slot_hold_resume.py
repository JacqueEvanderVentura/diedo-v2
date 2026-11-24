from datetime import date, timedelta
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid7

import pytest
from app.db.models import UserNotification
from app.db.session import session_scope
from app.schemas.user_notifications import SlotHoldResumeLink
from app.services.errors import ResourceNotFoundError
from app.services.public_booking import PublicBookingService
from app.services.user_notifications import NotificationPayload, UserNotificationService
from sqlalchemy import select

from tests.test_slot_hold_abandoned import _claim_with_customer, _expire_hold, _purge_holds

pytest_plugins = ("tests.test_public_booking_flow",)


def _notification_id_for_hold(hold_id) -> UUID:
    with session_scope() as session:
        notification_id = session.scalar(
            select(UserNotification.id).where(
                UserNotification.event_key.like(f"slot_hold.abandoned/{hold_id}/%")
            )
        )
        assert notification_id is not None
        return notification_id


def _resume(client, headers, notification_id):
    return client.get(f"/api/v1/notifications/{notification_id}/slot-hold-resume", headers=headers)


def _snapshot(branch, service, employee, *, scheduled_date: date, scheduled_time: str) -> dict:
    return SlotHoldResumeLink(
        branch_id=UUID(branch),
        service_id=UUID(service),
        service_name="Depilación bigote",
        employee_id=UUID(employee),
        customer_name="Peter la anguila",
        customer_phone="809-555-1234",
        scheduled_date=scheduled_date,
        scheduled_time=scheduled_time,
    ).model_dump(by_alias=True, mode="json")


def _seed_notification(*, me, link: dict, event_type: str = "slot_hold.abandoned") -> UUID:
    membership_id = UUID(me["membershipId"])
    event_key = f"slot_hold.abandoned/seed-{uuid7().hex}/{membership_id}"
    with session_scope() as session:
        UserNotificationService(session).fanout(
            workspace_id=UUID(me["workspaceId"]),
            payloads=(
                NotificationPayload(
                    membership_id=membership_id,
                    event_type=event_type,
                    event_key=event_key,
                    title="Agenda sin finalizar",
                    body="Prueba",
                    priority="normal",
                    link=link,
                ),
            ),
        )
    with session_scope() as session:
        notification_id = session.scalar(
            select(UserNotification.id).where(UserNotification.event_key == event_key)
        )
        assert notification_id is not None
        return notification_id


def _query(url: str) -> dict[str, list[str]]:
    return parse_qs(urlparse(url).query)


@pytest.mark.integration
def test_abandoned_booking_keeps_date_and_time_when_slot_is_still_free(client, booking_setup):
    headers, *_ = booking_setup
    branch, employee, service, body, _token, hold_id, pick = _claim_with_customer(
        client, booking_setup
    )
    _expire_hold(hold_id)
    _purge_holds()

    notification_id = _notification_id_for_hold(hold_id)
    listed = client.get("/api/v1/notifications?page=1&pageSize=5", headers=headers)
    assert listed.status_code == 200, listed.text
    item = next(row for row in listed.json()["items"] if row["id"] == str(notification_id))
    snapshot = item["link"]["slotHoldResume"]
    assert snapshot["customerPhone"] == body["phone"]
    assert snapshot["scheduledTime"] == pick

    response = _resume(client, headers, notification_id)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["scheduledDate"] == body["date"]
    assert data["scheduledTime"] == pick
    params = _query(data["resumeUrl"])
    assert params["branch"] == [branch]
    assert params["service"] == [service]
    assert params["employee"] == [employee]
    assert params["date"] == [body["date"]]
    assert params["time"] == [pick]


@pytest.mark.integration
def test_abandoned_booking_drops_time_when_slot_was_taken(client, booking_setup):
    headers, *_ = booking_setup
    branch, _employee, service, body, _token, hold_id, pick = _claim_with_customer(
        client, booking_setup
    )
    _expire_hold(hold_id)
    _purge_holds()

    base = f"/api/v1/public/booking/branches/{branch}"
    booked = client.post(
        f"{base}/appointments",
        headers={"Idempotency-Key": f"resume-taken-{uuid7().hex[:16]}"},
        json={**body, "time": pick},
    )
    assert booked.status_code == 201, booked.text

    response = _resume(client, headers, _notification_id_for_hold(hold_id))
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["scheduledDate"] == body["date"]
    assert data["scheduledTime"] is None
    params = _query(data["resumeUrl"])
    assert params["service"] == [service]
    assert params["date"] == [body["date"]]
    assert "time" not in params


@pytest.mark.integration
def test_abandoned_booking_drops_date_and_time_when_day_already_passed(client, booking_setup):
    headers, me, branch, employee, service = booking_setup
    past = date.today() - timedelta(days=3)
    notification_id = _seed_notification(
        me=me,
        link={
            "path": "/agenda",
            "slotHoldResume": _snapshot(
                branch, service, employee, scheduled_date=past, scheduled_time="09:00"
            ),
        },
    )

    response = _resume(client, headers, notification_id)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["scheduledDate"] is None
    assert data["scheduledTime"] is None
    params = _query(data["resumeUrl"])
    assert params["service"] == [service]
    assert "date" not in params
    assert "time" not in params


def _no_slots(*_args, **_kwargs):
    return [], 30, []


def _service_gone(*_args, **_kwargs):
    raise ResourceNotFoundError("El servicio no está disponible.", "serviceId")


@pytest.mark.integration
@pytest.mark.parametrize(
    "fake_list_slots",
    [_no_slots, _service_gone],
    ids=["no-slots-that-day", "service-no-longer-bookable"],
)
def test_abandoned_booking_drops_date_when_nothing_is_bookable_that_day(
    client, booking_setup, monkeypatch, fake_list_slots
):
    headers, me, branch, employee, service = booking_setup
    monkeypatch.setattr(PublicBookingService, "list_slots", fake_list_slots)
    notification_id = _seed_notification(
        me=me,
        link={
            "path": "/agenda",
            "slotHoldResume": _snapshot(
                branch,
                service,
                employee,
                scheduled_date=date.today() + timedelta(days=5),
                scheduled_time="09:00",
            ),
        },
    )

    response = _resume(client, headers, notification_id)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["scheduledDate"] is None
    assert data["scheduledTime"] is None
    params = _query(data["resumeUrl"])
    assert params["service"] == [service]
    assert "date" not in params


@pytest.mark.integration
def test_resume_link_requires_auth(client):
    denied = client.get(f"/api/v1/notifications/{uuid7()}/slot-hold-resume")
    assert denied.status_code == 401


@pytest.mark.integration
def test_resume_link_404_for_unknown_notification(client, booking_setup):
    headers, *_ = booking_setup
    missing = _resume(client, headers, uuid7())
    assert missing.status_code == 404


@pytest.mark.integration
@pytest.mark.parametrize(
    ("event_type", "with_snapshot"),
    [
        ("slot_hold.abandoned", False),
        ("test.event", True),
    ],
    ids=["legacy-without-snapshot", "snapshot-on-other-event"],
)
def test_resume_link_404_when_notification_cannot_resume_a_booking(
    client, booking_setup, event_type, with_snapshot
):
    headers, me, branch, employee, service = booking_setup
    link: dict = {"path": "/agenda"}
    if with_snapshot:
        link["slotHoldResume"] = _snapshot(
            branch,
            service,
            employee,
            scheduled_date=date.today() + timedelta(days=5),
            scheduled_time="09:00",
        )
    notification_id = _seed_notification(me=me, link=link, event_type=event_type)

    response = _resume(client, headers, notification_id)
    assert response.status_code == 404, response.text
