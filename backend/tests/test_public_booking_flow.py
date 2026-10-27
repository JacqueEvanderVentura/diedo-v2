from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid7
from zoneinfo import ZoneInfo

import pytest
from app.config import settings
from app.db.models import Appointment, Branch, CustomerBranchAssignment, Employee
from app.db.models.email_notifications import EmailNotification
from app.db.session import get_session_factory
from app.services import email_notifications
from app.services.appointment_reminders import REMINDER_EVENT, AppointmentReminderService
from app.services.email import EmailDeliveryResult, EmailTransportError
from pydantic import SecretStr
from sqlalchemy import delete, select

from tests.test_agenda import (
    _bootstrap_and_login,
    _create_branch_agenda_manager,
    _hq_branch_id,
    _login_as_agenda_manager,
)


@pytest.fixture
def booking_setup(client, monkeypatch):
    client._transport.raise_server_exceptions = True
    headers, me = _bootstrap_and_login(client)
    branch = _hq_branch_id(me)

    def enable_online_booking(branch_id: str) -> None:
        listed = client.get("/api/v1/branches", headers=headers)
        assert listed.status_code == 200, listed.text
        branch_row = next(row for row in listed.json() if row["id"] == branch_id)
        enabled = client.patch(
            f"/api/v1/branches/{branch_id}",
            headers=headers,
            json={
                "onlineBookingSelectable": True,
                "version": branch_row["version"],
            },
        )
        assert enabled.status_code == 200, enabled.text

    enable_online_booking(branch)
    cleared_hours = client.put(
        f"/api/v1/branches/{branch}/opening-hours",
        headers=headers,
        json={"items": []},
    )
    assert cleared_hours.status_code == 200, cleared_hours.text
    resources = client.get(
        "/api/v1/appointment-resources", headers=headers, params={"branchId": branch}
    ).json()["items"]
    for resource in resources:
        cleared_acl = client.put(
            f"/api/v1/appointment-resources/{resource['id']}/acl",
            headers=headers,
            params={"branchId": branch},
            json={"items": []},
        )
        assert cleared_acl.status_code == 200, cleared_acl.text
    suffix = uuid7().hex[-12:]
    with get_session_factory()() as session:
        primary = session.get(Branch, UUID(branch))
        legal_entity_id = str(primary.legal_entity_id)
    another_branch = client.post(
        "/api/v1/branches",
        headers=headers,
        json={
            "legalEntityId": legal_entity_id,
            "code": f"BOOK-{suffix}",
            "name": f"Sucursal de prueba {suffix}",
            "timezone": "America/Santo_Domingo",
        },
    )
    assert another_branch.status_code == 201, another_branch.text
    enable_online_booking(another_branch.json()["id"])
    hq_branch = next(
        (item for item in me["visibleBranches"] if item.get("code") == "HQ"),
        me["visibleBranches"][0],
    )
    me["visibleBranches"] = [hq_branch, another_branch.json()]
    employee = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"BOOK-{suffix}",
            "firstName": "Prueba",
            "lastName": suffix,
            "position": "Especialista",
            "hireDate": date.today().isoformat(),
            "branchIds": [branch],
            "onlineBookingSelectable": True,
            "schedule": {
                day: [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "17:00"}]
                for day in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
            },
        },
    )
    assert employee.status_code == 201, employee.text
    category = client.post(
        "/api/v1/catalog/categories",
        headers=headers,
        json={"name": f"Agenda {suffix}", "categoryKind": "service"},
    )
    assert category.status_code == 201, category.text
    units = client.get("/api/v1/catalog/units-of-measure", headers=headers).json()
    service = client.post(
        "/api/v1/inventory/services",
        headers={**headers, "Idempotency-Key": f"service-{suffix}"},
        json={
            "name": f"Servicio {suffix}",
            "categoryId": category.json()["id"],
            "unitOfMeasureId": units[0]["id"],
            "branchIds": [branch],
            "salePrice": "1250.00",
            "taxRate": "0",
            "durationMinutes": 45,
        },
    )
    assert service.status_code == 201, service.text
    monkeypatch.setattr(settings, "email_enabled", False)
    return headers, me, branch, employee.json()["id"], service.json()["id"]


def payload_for(employee, service):
    suffix = uuid7().hex[:10]
    return {
        "documentType": "pasaporte",
        "documentId": f"TEST{uuid7().hex[:16]}",
        "displayName": "Cliente prueba Agenda",
        "email": f"booking-{suffix}@example.com",
        "phone": f"809555{suffix[:4]}",
        "serviceId": service,
        "employeeId": employee,
        "date": (date.today() + timedelta(days=400 + UUID(employee).int % 10000)).isoformat(),
        "time": "10:00",
    }


def _set_service_duration(client, headers, service_id, minutes):
    detail = client.get(f"/api/v1/inventory/items/{service_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    item = detail.json()
    updated = client.patch(
        f"/api/v1/inventory/items/{service_id}",
        headers=headers,
        json={"version": item["version"], "durationMinutes": minutes},
    )
    assert updated.status_code == 200, updated.text


def _slot_params(body, employee, service):
    return {"date": body["date"], "employeeId": employee, "serviceId": service}


def _patch_branch_lead(client, headers, branch_id, **fields):
    listed = client.get("/api/v1/branches", headers=headers)
    assert listed.status_code == 200, listed.text
    branch_row = next(row for row in listed.json() if row["id"] == branch_id)
    payload = {"version": branch_row["version"], **fields}
    updated = client.patch(
        f"/api/v1/branches/{branch_id}",
        headers=headers,
        json=payload,
    )
    assert updated.status_code == 200, updated.text
    return updated.json()


@pytest.mark.integration
def test_resources_other_branches_and_past_slots(client, booking_setup):
    from app.db.models import AppointmentResource, EmployeeBranchAssignment

    headers, me, branch, employee, service = booking_setup
    body = payload_for(employee, service)
    base = f"/api/v1/public/booking/branches/{branch}"
    resources = client.get(
        "/api/v1/appointment-resources", headers=headers, params={"branchId": branch}
    ).json()["items"]
    first = resources[0]["id"]

    def occupy(branch_id, resource_id, at, employee_id=None):
        result = client.post(
            "/api/v1/appointments",
            headers={**headers, "Idempotency-Key": str(uuid7())},
            json={
                "branchId": branch_id,
                "resourceId": resource_id,
                "employeeId": employee_id,
                "date": body["date"],
                "time": at,
                "duration": 60,
                "customerName": "Prueba ocupación",
            },
        )
        assert result.status_code == 201, result.text

    occupy(branch, first, "10:00")
    booking = client.post(
        f"{base}/appointments", json=body, headers={"Idempotency-Key": str(uuid7())}
    )
    assert booking.status_code == 201, booking.text
    with get_session_factory()() as session:
        appointment = session.get(Appointment, UUID(booking.json()["appointment"]["id"]))
        assert appointment.resource_id != UUID(first)
        session.add(
            EmployeeBranchAssignment(
                workspace_id=appointment.workspace_id,
                branch_id=UUID(me["visibleBranches"][1]["id"]),
                employee_id=UUID(employee),
                status="active",
            )
        )
        session.add(
            AppointmentResource(
                workspace_id=appointment.workspace_id,
                branch_id=UUID(me["visibleBranches"][1]["id"]),
                code=f"TEST-{uuid7().hex}",
                name="Cabina de prueba",
            )
        )
        session.commit()
    for resource in resources:
        occupy(branch, resource["id"], "13:00")
    other = me["visibleBranches"][1]["id"]
    other_resources = client.get(
        "/api/v1/appointment-resources", headers=headers, params={"branchId": other}
    ).json()["items"]
    occupy(other, other_resources[0]["id"], "15:00", employee)
    _set_service_duration(client, headers, service, 30)
    slots = client.get(f"{base}/slots", params=_slot_params(body, employee, service)).json()[
        "slots"
    ]
    assert "13:00" not in slots  # Every cabin occupied.
    assert "15:00" not in slots  # Specialist attends another branch.
    past = client.get(
        f"{base}/slots",
        params={
            **_slot_params(body, employee, service),
            "date": (date.today() - timedelta(days=1)).isoformat(),
        },
    ).json()["slots"]
    assert past == []


@pytest.mark.integration
def test_public_slots_respect_branch_opening_hours(client, booking_setup):
    headers, _, branch, employee, _service = booking_setup
    body = payload_for(employee, _service)
    booking_date = date.fromisoformat(body["date"])
    weekday = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[booking_date.weekday()]
    hours = client.put(
        f"/api/v1/branches/{branch}/opening-hours",
        headers=headers,
        json={"items": [{"weekday": weekday, "opensAt": "10:00", "closesAt": "12:00"}]},
    )
    assert hours.status_code == 200, hours.text
    base = f"/api/v1/public/booking/branches/{branch}"
    _set_service_duration(client, headers, _service, 30)
    slots = client.get(
        f"{base}/slots",
        params=_slot_params(body, employee, _service),
    ).json()["slots"]
    assert slots
    assert min(slots) >= "10:00"
    assert max(slots) <= "11:30"
    cleared = client.put(
        f"/api/v1/branches/{branch}/opening-hours",
        headers=headers,
        json={"items": []},
    )
    assert cleared.status_code == 200, cleared.text


@pytest.mark.integration
def test_public_booking_and_cancel_respect_branch_lead_times(client, booking_setup, monkeypatch):
    headers, _, branch, employee, service = booking_setup
    _patch_branch_lead(
        client,
        headers,
        branch,
        publicBookingMinLeadMinutes=60,
        publicCancelMinLeadMinutes=60,
    )
    base = f"/api/v1/public/booking/branches/{branch}"
    booking_date = "2026-06-15"
    zone = ZoneInfo("America/Santo_Domingo")
    # 60-minute lead is strict (slot must start after now + lead); 12:30 leaves 14:00 open.
    fixed_now = datetime(2026, 6, 15, 12, 30, tzinfo=zone).astimezone(UTC)
    monkeypatch.setattr("app.services.public_booking.utc_now", lambda: fixed_now)
    params = {"date": booking_date, "employeeId": employee, "serviceId": service}
    slots = client.get(f"{base}/slots", params=params).json()["slots"]
    assert "13:30" not in slots
    assert "14:00" in slots
    too_soon = client.post(
        f"{base}/appointments",
        json={
            **payload_for(employee, service),
            "date": booking_date,
            "time": "13:30",
        },
        headers={"Idempotency-Key": str(uuid7())},
    )
    assert too_soon.status_code == 409, too_soon.text
    booked = client.post(
        f"{base}/appointments",
        json={
            **payload_for(employee, service),
            "date": booking_date,
            "time": "14:00",
        },
        headers={"Idempotency-Key": str(uuid7())},
    )
    assert booked.status_code == 201, booked.text
    appointment = booked.json()["appointment"]
    token = appointment["managementToken"]
    uri = f"{base}/appointments/{appointment['id']}"
    monkeypatch.setattr(
        "app.services.public_booking.utc_now",
        lambda: datetime(2026, 6, 15, 13, 0, tzinfo=zone).astimezone(UTC),
    )
    detail = client.get(uri, params={"token": token}).json()
    assert detail["canManageOnline"] is False
    blocked_cancel = client.post(f"{uri}/cancel", json={"managementToken": token})
    assert blocked_cancel.status_code == 409, blocked_cancel.text
    monkeypatch.setattr(
        "app.services.public_booking.utc_now",
        lambda: datetime(2026, 6, 15, 12, 0, tzinfo=zone).astimezone(UTC),
    )
    detail_open = client.get(uri, params={"token": token}).json()
    assert detail_open["canManageOnline"] is True
    cancelled = client.post(f"{uri}/cancel", json={"managementToken": token})
    assert cancelled.status_code == 200, cancelled.text


@pytest.mark.integration
def test_schedule_timezone_leave_and_expired_email_retry(client, booking_setup, monkeypatch):
    from app.db.models import EmployeeSchedule, HrLeaveRequest

    _, _, branch, employee, service = booking_setup
    body = payload_for(employee, service)
    base = f"/api/v1/public/booking/branches/{branch}"
    with get_session_factory()() as session:
        member = session.get(Employee, UUID(employee))
        schedule = session.scalar(
            select(EmployeeSchedule).where(EmployeeSchedule.employee_id == member.id)
        )
        schedule.timezone = "UTC"
        session.commit()
    # 09:00 UTC = 05:00 Santo Domingo; the lunch break becomes 08:00-09:00.
    slots = client.get(f"{base}/slots", params=_slot_params(body, employee, service)).json()[
        "slots"
    ]
    assert "05:00" in slots and "08:00" not in slots
    response = client.post(
        f"{base}/appointments",
        json={**body, "time": "05:00"},
        headers={"Idempotency-Key": str(uuid7())},
    )
    assert response.status_code == 201, response.text
    notification_id = UUID(response.json()["appointment"]["notification"]["id"])
    with get_session_factory()() as session:
        member = session.get(Employee, UUID(employee))
        session.add(
            HrLeaveRequest(
                workspace_id=member.workspace_id,
                employee_id=member.id,
                start_date=date.fromisoformat(body["date"]),
                end_date=date.fromisoformat(body["date"]),
                reason="Prueba vacaciones",
                status="aprobada",
                requested_by_platform_user_id=member.created_by_platform_user_id,
                reviewed_by_platform_user_id=member.created_by_platform_user_id,
                reviewed_at=datetime.now(UTC),
            )
        )
        notification = session.get(EmailNotification, notification_id)
        notification.first_attempt_at = datetime.now(UTC) - timedelta(hours=25)
        notification.status = "failed"
        session.commit()
        monkeypatch.setattr(settings, "email_enabled", True)
        assert email_notifications.deliver_email(session, notification_id)["status"] == "review"
    assert (
        client.get(f"{base}/slots", params=_slot_params(body, employee, service)).json()["slots"]
        == []
    )


@pytest.mark.integration
def test_public_booking_any_available_specialist(client, booking_setup):
    headers, _, branch, employee, service = booking_setup
    base = f"/api/v1/public/booking/branches/{branch}"
    body = payload_for(employee, service)
    _set_service_duration(client, headers, service, 30)
    body.pop("employeeId", None)
    merged_slots = client.get(
        f"{base}/slots",
        params={"date": body["date"], "serviceId": service},
    ).json()["slots"]
    employee_slots = client.get(
        f"{base}/slots",
        params=_slot_params({**body, "employeeId": employee}, employee, service),
    ).json()["slots"]
    assert merged_slots
    assert set(employee_slots).issubset(set(merged_slots))
    pick = "10:00" if "10:00" in merged_slots else merged_slots[0]
    booked = client.post(
        f"{base}/appointments",
        json={**body, "time": pick},
        headers={"Idempotency-Key": str(uuid7())},
    )
    assert booked.status_code == 201, booked.text
    assert booked.json()["appointment"]["time"] == pick
    booked_ids = [booked.json()["appointment"]["id"]]
    for _ in range(50):
        another = client.post(
            f"{base}/appointments",
            json={
                **payload_for(employee, service),
                "date": body["date"],
                "time": pick,
                "employeeId": None,
            },
            headers={"Idempotency-Key": str(uuid7())},
        )
        if another.status_code == 409:
            assert another.json()["parameter"] == "time"
            break
        assert another.status_code == 201, another.text
        booked_ids.append(another.json()["appointment"]["id"])
    else:
        pytest.fail("Cualquiera disponible nunca agotó el cupo del horario.")
    with get_session_factory()() as session:
        stored = [session.get(Appointment, UUID(item)) for item in booked_ids]
    assert all(item.employee_id is not None and item.resource_id is not None for item in stored)
    assert len({item.employee_id for item in stored}) == len(stored)
    assert len({item.resource_id for item in stored}) == len(stored)


@pytest.mark.integration
def test_public_reschedule_assigns_orphan_appointment(client, booking_setup):
    headers, _, branch, employee, service = booking_setup
    base = f"/api/v1/public/booking/branches/{branch}"
    body = payload_for(employee, service)
    _set_service_duration(client, headers, service, 30)
    booked = client.post(
        f"{base}/appointments",
        json={**body, "time": "10:00"},
        headers={"Idempotency-Key": str(uuid7())},
    )
    assert booked.status_code == 201, booked.text
    appointment = booked.json()["appointment"]
    with get_session_factory()() as session:
        stored = session.get(Appointment, UUID(appointment["id"]))
        stored.employee_id = None
        stored.resource_id = None
        session.commit()

    rescheduled = client.post(
        f"{base}/appointments/{appointment['id']}/reschedule",
        json={
            "managementToken": appointment["managementToken"],
            "date": body["date"],
            "time": "11:00",
        },
    )
    assert rescheduled.status_code == 200, rescheduled.text
    assert rescheduled.json()["time"] == "11:00"
    with get_session_factory()() as session:
        stored = session.get(Appointment, UUID(appointment["id"]))
        assert stored.employee_id is not None
        assert str(stored.employee_id) == rescheduled.json()["employeeId"]
        assert stored.resource_id is not None


@pytest.mark.integration
def test_staff_any_available_leaves_unassigned(client, booking_setup):
    headers, _, branch, employee, service = booking_setup
    body = payload_for(employee, service)
    created = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": str(uuid7())},
        json={
            "branchId": branch,
            "employeeId": None,
            "anyAvailable": True,
            "serviceId": service,
            "date": body["date"],
            "time": "11:30",
            "duration": 45,
            "customerName": "Cliente cualquiera",
            "serviceName": "Servicio test",
            "price": "1250.00",
            "status": "confirmed",
            "pendingPayment": False,
            "pendingAmount": "0.00",
            "recurrence": "none",
            "repeatCount": 1,
        },
    )
    assert created.status_code == 201, created.text
    item = created.json()["items"][0]
    assert item.get("resource") is not None
    assert item["resource"]["id"]


@pytest.mark.integration
def test_booking_price_idempotency_and_token_management(client, booking_setup):
    headers, me, branch, employee, service = booking_setup
    base = f"/api/v1/public/booking/branches/{branch}"
    context = client.get(f"{base}/context").json()
    assert any(
        s["id"] == service and s["price"] == "1250.00" and s["durationMinutes"] == 45
        for s in context["services"]
    )
    assert any(s["id"] == employee for s in context["specialists"])
    body = payload_for(employee, service)
    _set_service_duration(client, headers, service, 90)
    slots = client.get(f"{base}/slots", params=_slot_params(body, employee, service)).json()[
        "slots"
    ]
    assert "11:00" not in slots  # Would cross the lunch break.
    assert "10:00" in slots
    key = {"Idempotency-Key": str(uuid7())}
    response = client.post(f"{base}/appointments", json=body, headers=key)
    assert response.status_code == 201, response.text
    appointment = response.json()["appointment"]
    assert appointment["notification"]["status"] == "disabled"
    again = client.post(f"{base}/appointments", json=body, headers=key)
    assert again.status_code == 201, again.text
    assert again.json()["appointment"]["id"] == appointment["id"]
    changed = client.post(f"{base}/appointments", json={**body, "time": "11:00"}, headers=key)
    assert changed.status_code == 409, changed.text
    uri = f"{base}/appointments/{appointment['id']}"
    token = appointment["managementToken"]
    assert client.get(uri, params={"token": "invalid-token"}).status_code == 403
    assert client.get(uri, params={"token": token}).status_code == 200
    profile = client.get(
        f"{base}/me",
        params={"documentType": body["documentType"], "documentId": body["documentId"]},
    )
    assert profile.status_code == 200, profile.text
    assert all(not item["managementToken"] for item in profile.json()["items"])
    assert appointment["durationMinutes"] == 90
    rescheduled = client.post(
        f"{uri}/reschedule",
        json={"managementToken": token, "date": body["date"], "time": "13:00"},
    )
    assert rescheduled.status_code == 200, rescheduled.text
    assert rescheduled.json()["time"] == "13:00"
    assert rescheduled.json()["durationMinutes"] == 90
    same = client.post(
        f"{uri}/reschedule",
        json={"managementToken": token, "date": body["date"], "time": "13:00"},
    )
    assert same.status_code == 200, same.text
    identified = client.post(
        f"{base}/identify",
        json={"documentType": body["documentType"], "documentId": body["documentId"]},
    )
    assert identified.status_code == 200, identified.text
    identified_body = identified.json()
    assert identified_body["isNew"] is False
    assert identified_body["lastServiceId"] == str(service)
    assert identified_body["lastEmployeeId"] == str(employee)
    cancelled = client.post(f"{uri}/cancel", json={"managementToken": token})
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert client.post(f"{uri}/cancel", json={"managementToken": token}).status_code == 200
    calendar = client.get(
        "/api/v1/appointments",
        headers=headers,
        params={"branchId": branch, "dateFrom": body["date"], "dateTo": body["date"]},
    ).json()
    assert any(a["id"] == appointment["id"] and a["price"] == "1250.00" for a in calendar["items"])
    with get_session_factory()() as session:
        notifications = session.scalars(
            select(EmailNotification).where(
                EmailNotification.appointment_id == UUID(appointment["id"])
            )
        ).all()
        assert len(notifications) == 3
        old_notice = next(
            row for row in notifications if row.event_key.startswith("appointment.confirmed/")
        )
        assert email_notifications.deliver_email(session, old_notice.id)["status"] == "superseded"
    other_branch = UUID(me["visibleBranches"][1]["id"])
    with get_session_factory()() as session:
        assignment = session.scalar(
            select(CustomerBranchAssignment).where(
                CustomerBranchAssignment.customer_id == UUID(appointment["customerId"]),
                CustomerBranchAssignment.branch_id == UUID(branch),
            )
        )
        assignment.branch_id = other_branch
        session.commit()
    existing_customer = client.post(
        f"{base}/appointments",
        json={**body, "time": "14:00"},
        headers={"Idempotency-Key": str(uuid7())},
    )
    assert existing_customer.status_code == 201, existing_customer.text
    assert existing_customer.json()["appointment"]["customerId"] == appointment["customerId"]
    with get_session_factory()() as session:
        assigned = set(
            session.scalars(
                select(CustomerBranchAssignment.branch_id).where(
                    CustomerBranchAssignment.customer_id == UUID(appointment["customerId"]),
                    CustomerBranchAssignment.status == "active",
                )
            ).all()
        )
        assert assigned == {UUID(branch), other_branch}


@pytest.mark.integration
def test_admin_appointment_responses_include_notification(client, booking_setup):
    headers, _, branch, employee, service = booking_setup
    body = payload_for(employee, service)
    base = f"/api/v1/public/booking/branches/{branch}"
    public = client.post(
        f"{base}/appointments",
        json=body,
        headers={"Idempotency-Key": str(uuid7())},
    )
    assert public.status_code == 201, public.text
    public_appointment = public.json()["appointment"]
    resources = client.get(
        "/api/v1/appointment-resources", headers=headers, params={"branchId": branch}
    ).json()["items"]
    created = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": str(uuid7())},
        json={
            "branchId": branch,
            "resourceId": resources[0]["id"],
            "customerId": public_appointment["customerId"],
            "employeeId": employee,
            "serviceId": service,
            "date": body["date"],
            "time": "14:00",
            "duration": 45,
            "customerName": body["displayName"],
            "customerPhone": body["phone"],
            "serviceName": "Servicio administrativo",
            "price": "1250.00",
        },
    )
    assert created.status_code == 201, created.text
    appointment = created.json()["items"][0]
    assert appointment["notification"]["status"] == "disabled"
    cancelled = client.patch(
        f"/api/v1/appointments/{appointment['id']}",
        headers=headers,
        json={"version": appointment["version"], "status": "cancelled"},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["notification"]["status"] == "disabled"


@pytest.mark.integration
def test_persisted_appointment_reminders_send_once_and_omit_short_notice(
    client, booking_setup, monkeypatch
):
    headers, _, branch, employee, service = booking_setup
    monkeypatch.setattr(settings, "email_enabled", True)
    deliveries = []

    def success(**kwargs):
        deliveries.append(kwargs)
        return EmailDeliveryResult(provider_id=f"provider-{len(deliveries)}")

    monkeypatch.setattr(email_notifications, "send_email", success)
    suffix = uuid7().hex[-12:]
    backup_employee = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"BOOK2-{suffix}",
            "firstName": "Prueba",
            "lastName": suffix,
            "position": "Especialista",
            "hireDate": date.today().isoformat(),
            "branchIds": [branch],
            "onlineBookingSelectable": True,
            "schedule": {
                day: [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "17:00"}]
                for day in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
            },
        },
    )
    assert backup_employee.status_code == 201, backup_employee.text
    base = f"/api/v1/public/booking/branches/{branch}"
    first = client.post(
        f"{base}/appointments",
        json=payload_for(employee, service),
        headers={"Idempotency-Key": str(uuid7())},
    )
    assert first.status_code == 201, first.text
    second_body = {**payload_for(backup_employee.json()["id"], service), "time": "13:00"}
    second = client.post(
        f"{base}/appointments",
        json=second_body,
        headers={"Idempotency-Key": str(uuid7())},
    )
    assert second.status_code == 201, second.text
    now = datetime.now(UTC).replace(microsecond=0)
    with get_session_factory()() as session:
        first_appointment = session.get(Appointment, UUID(first.json()["appointment"]["id"]))
        second_appointment = session.get(Appointment, UUID(second.json()["appointment"]["id"]))
        resources = client.get(
            "/api/v1/appointment-resources",
            headers=headers,
            params={"branchId": branch},
        ).json()["items"]
        first_resource = first_appointment.resource_id
        alternate_resource_id = UUID(
            next(item["id"] for item in resources if item["id"] != str(first_resource))
        )
        other_resource_id = UUID(
            next(
                item["id"]
                for item in resources
                if item["id"] not in {str(first_resource), str(alternate_resource_id)}
            )
        )
        first_appointment.resource_id = alternate_resource_id
        second_appointment.resource_id = other_resource_id
        second_appointment.employee_id = UUID(backup_employee.json()["id"])
        session.flush()
        assert first_appointment.resource_id != second_appointment.resource_id
        session.commit()
        reminder_starts = now + timedelta(hours=24) - timedelta(minutes=5)
        reminder_window_end = reminder_starts + timedelta(hours=1)
        for stray in session.scalars(
            select(Appointment).where(
                Appointment.workspace_id == first_appointment.workspace_id,
                Appointment.branch_id == first_appointment.branch_id,
                Appointment.record_status == "active",
                Appointment.id.not_in([first_appointment.id, second_appointment.id]),
                Appointment.starts_at < reminder_window_end,
                Appointment.ends_at > reminder_starts - timedelta(minutes=30),
            )
        ).all():
            stray.record_status = "inactive"
            stray.deactivated_at = now
        session.commit()
        first_appointment.starts_at = reminder_starts
        first_appointment.ends_at = reminder_starts + timedelta(
            minutes=first_appointment.duration_minutes
        )
        first_appointment.reminder_sent = False
        first_appointment.schedule_changed_at = now - timedelta(days=2)
        first_appointment.schedule_revision += 1
        session.commit()
        second_appointment.starts_at = reminder_starts
        second_appointment.ends_at = reminder_starts + timedelta(
            minutes=second_appointment.duration_minutes
        )
        second_appointment.reminder_sent = False
        second_appointment.schedule_changed_at = now
        second_appointment.schedule_revision += 1
        session.commit()
        session.execute(
            delete(EmailNotification).where(
                EmailNotification.appointment_id.in_([first_appointment.id, second_appointment.id])
            )
        )
        session.commit()
        first_id = first_appointment.id
        second_id = second_appointment.id

    with get_session_factory()() as reminder_session:
        summary = AppointmentReminderService(reminder_session).process_due(now=now)
        assert summary.sent == 1
        assert summary.omitted == 1
        assert reminder_session.get(Appointment, first_id).reminder_sent is True
        notices = reminder_session.scalars(
            select(EmailNotification).where(
                EmailNotification.event_type == REMINDER_EVENT,
                EmailNotification.appointment_id.in_([first_id, second_id]),
            )
        ).all()
        assert len(notices) == 2
        assert {notice.status for notice in notices} == {"sent", "superseded"}
        repeat = AppointmentReminderService(reminder_session).process_due(
            now=now + timedelta(minutes=5),
        )
        assert repeat.sent == 0
    reminder_deliveries = [
        item for item in deliveries if item["idempotency_key"].startswith("notification/")
    ]
    assert len(reminder_deliveries) >= 1


@pytest.mark.integration
def test_failed_email_keeps_booking_and_retries_once(client, booking_setup, monkeypatch):
    _, _, branch, employee, service = booking_setup
    monkeypatch.setattr(settings, "email_enabled", True)
    calls = []

    def failure(**kwargs):
        calls.append(kwargs)
        raise EmailTransportError("Proveedor temporalmente no disponible.")

    monkeypatch.setattr(email_notifications, "send_email", failure)
    body = payload_for(employee, service)
    response = client.post(
        f"/api/v1/public/booking/branches/{branch}/appointments",
        json=body,
        headers={"Idempotency-Key": str(uuid7())},
    )
    assert response.status_code == 201, response.text
    appointment = response.json()["appointment"]
    assert appointment["notification"]["status"] == "failed"

    def success(**kwargs):
        calls.append(kwargs)
        return EmailDeliveryResult(provider_id="provider-test-id")

    monkeypatch.setattr(email_notifications, "send_email", success)
    with get_session_factory()() as session:
        notification_id = UUID(appointment["notification"]["id"])
        assert email_notifications.deliver_email(session, notification_id)["status"] == "sent"
        assert email_notifications.deliver_email(session, notification_id)["status"] == "sent"
        assert session.get(Appointment, UUID(appointment["id"])).status == "confirmed"
    assert len(calls) == 2
    assert calls[0]["idempotency_key"] == calls[1]["idempotency_key"]


@pytest.mark.integration
def test_invitation_permissions_validation_and_idempotency(client, booking_setup, monkeypatch):
    headers, me, branch, _, _ = booking_setup
    route = "/api/v1/agenda/booking-links/email"
    body = {"branchId": branch, "name": "Cliente prueba", "email": "test@example.com"}
    key = {"Idempotency-Key": str(uuid7())}
    assert client.post(route, json=body, headers=key).status_code == 401
    assert (
        client.post(
            route, json={**body, "email": "invalid"}, headers={**headers, **key}
        ).status_code
        == 400
    )
    result = client.post(route, json=body, headers={**headers, **key})
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "disabled"
    assert (
        client.post(route, json=body, headers={**headers, **key}).json()["id"]
        == result.json()["id"]
    )
    assert (
        client.post(
            route, json={**body, "email": "other@example.com"}, headers={**headers, **key}
        ).status_code
        == 409
    )
    another = me["visibleBranches"][1]["id"]
    manager = _create_branch_agenda_manager(UUID(me["workspace"]["id"]), UUID(another))
    limited = _login_as_agenda_manager(client, manager)
    assert client.post(route, json=body, headers={**limited, **key}).status_code == 403


@pytest.mark.integration
def test_disabled_employee_and_concurrent_reservation(client, booking_setup):
    _, _, branch, employee, service = booking_setup
    base = f"/api/v1/public/booking/branches/{branch}"
    body = payload_for(employee, service)
    with get_session_factory()() as session:
        member = session.get(Employee, UUID(employee))
        member.online_booking_selectable = False
        session.commit()
    context = client.get(f"{base}/context").json()
    assert all(s["id"] != employee for s in context["specialists"])
    assert (
        client.post(
            f"{base}/appointments", json=body, headers={"Idempotency-Key": str(uuid7())}
        ).status_code
        == 404
    )
    with get_session_factory()() as session:
        session.get(Employee, UUID(employee)).online_booking_selectable = True
        session.commit()

    def reserve(index):
        from app.main import app
        from fastapi.testclient import TestClient

        with TestClient(app) as guest:
            return guest.post(
                f"{base}/appointments",
                json={**body, "documentId": f"{body['documentId']}{index}"},
                headers={"Idempotency-Key": str(uuid7())},
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(reserve, [1, 2]))
    assert sorted(response.status_code for response in responses) == [201, 409], [
        r.text for r in responses
    ]


@pytest.mark.integration
def test_inactive_employee_stays_bookable_when_selectable(client, booking_setup):
    _, _, branch, employee, _service = booking_setup
    base = f"/api/v1/public/booking/branches/{branch}"
    with get_session_factory()() as session:
        member = session.get(Employee, UUID(employee))
        member.status = "inactive"
        member.online_booking_selectable = True
        session.commit()
    context = client.get(f"{base}/context").json()
    assert any(item["id"] == employee for item in context["specialists"])
    with get_session_factory()() as session:
        session.get(Employee, UUID(employee)).status = "archived"
        session.commit()
    context = client.get(f"{base}/context").json()
    assert all(item["id"] != employee for item in context["specialists"])


@pytest.mark.integration
def test_booking_context_lists_workspace_branches(client, booking_setup):
    _, me, branch, _employee, _service = booking_setup
    context = client.get(f"/api/v1/public/booking/branches/{branch}/context").json()
    branches = context.get("workspaceBranches") or []
    assert len(branches) >= 2
    assert any(item["id"] == branch for item in branches)
    assert any(item["id"] == me["visibleBranches"][1]["id"] for item in branches)


@pytest.mark.integration
def test_booking_entry_context_lists_selectable_branches(client, booking_setup):
    _, me, branch, _employee, _service = booking_setup
    entry = client.get("/api/v1/public/booking/context", params={"branchId": branch})
    assert entry.status_code == 200, entry.text
    body = entry.json()
    branches = body.get("workspaceBranches") or []
    assert body.get("workspaceName")
    assert len(branches) >= 2
    assert any(item["id"] == branch for item in branches)


_BACKOFFICE_KEY = "test-backoffice-key-with-at-least-32-characters"


@pytest.mark.integration
def test_booking_entry_context_scoped_to_branch_workspace(client, booking_setup, monkeypatch):
    _, _me, branch, _employee, _service = booking_setup
    suffix = uuid7().hex[:10]
    monkeypatch.setattr(settings, "backoffice_api_key", SecretStr(_BACKOFFICE_KEY))
    provisioned = client.post(
        "/api/v1/backoffice/workspaces",
        headers={"X-Backoffice-Key": _BACKOFFICE_KEY},
        json={
            "slug": f"other-tenant-{suffix}",
            "name": "Otro comercio",
            "defaultCurrency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-do",
            "taxDefaultRate": "18.00",
            "owner": {
                "email": f"owner-{suffix}@example.com",
                "displayName": "Owner Other",
                "password": "Owner!password-not-a-production-secret",
            },
        },
    )
    assert provisioned.status_code == 201, provisioned.text
    other_workspace_id = UUID(provisioned.json()["workspaceId"])
    other_branch_name = "Cuts Facroty FP SRL"
    with get_session_factory()() as session:
        other_branch = session.scalar(
            select(Branch).where(Branch.workspace_id == other_workspace_id)
        )
        assert other_branch is not None
        other_branch.name = other_branch_name
        other_branch.online_booking_selectable = True
        session.commit()
        other_branch_id = str(other_branch.id)

    ambiguous = client.get("/api/v1/public/booking/context")
    assert ambiguous.status_code == 400, ambiguous.text

    scoped = client.get("/api/v1/public/booking/context", params={"branchId": branch})
    assert scoped.status_code == 200, scoped.text
    scoped_names = {item["name"] for item in scoped.json().get("workspaceBranches") or []}
    assert other_branch_name not in scoped_names

    context = client.get(f"/api/v1/public/booking/branches/{branch}/context").json()
    context_names = {item["name"] for item in context.get("workspaceBranches") or []}
    assert other_branch_name not in context_names
    assert other_branch_id not in {item["id"] for item in context.get("workspaceBranches") or []}


@pytest.mark.integration
def test_public_portal_register_and_empty_history(client, booking_setup):
    _, _me, branch, _employee, _service = booking_setup
    document_id = f"TEST{uuid7().hex[:16]}"
    register = client.post(
        f"/api/v1/public/portal/branches/{branch}/register",
        json={
            "documentType": "pasaporte",
            "documentId": document_id,
            "displayName": "Portal Cliente",
            "wantsInvoice": False,
            "wantsContact": False,
            "observaciones": "Prefiere tarde",
        },
    )
    assert register.status_code == 200, register.text
    body = register.json()
    assert body["customerId"]
    params = {"documentType": "pasaporte", "documentId": document_id}
    appointments = client.get(
        f"/api/v1/public/portal/branches/{branch}/appointments", params=params
    )
    assert appointments.status_code == 200
    assert appointments.json()["items"] == []
