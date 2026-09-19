from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid7

import pytest
from app.config import settings
from app.db.models import Appointment, Branch, CustomerBranchAssignment, Employee
from app.db.models.email_notifications import EmailNotification
from app.db.session import get_session_factory
from app.services import email_notifications
from app.services.appointment_reminders import REMINDER_EVENT, AppointmentReminderService
from app.services.email import EmailDeliveryResult, EmailTransportError
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
        },
    )
    assert service.status_code == 201, service.text
    monkeypatch.setattr(settings, "email_enabled", False)
    return headers, me, branch, employee.json()["id"], service.json()["id"]


def payload_for(employee, service):
    return {
        "documentType": "pasaporte",
        "documentId": f"TEST{uuid7().hex[:16]}",
        "displayName": "Cliente prueba Agenda",
        "email": "booking-test@example.com",
        "phone": "8294220141",
        "serviceId": service,
        "employeeId": employee,
        "date": (date.today() + timedelta(days=400 + UUID(employee).int % 10000)).isoformat(),
        "time": "10:00",
        "duration": 45,
    }


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
    slots = client.get(
        f"{base}/slots", params={"date": body["date"], "employeeId": employee, "duration": 30}
    ).json()["slots"]
    assert "13:00" not in slots  # Every cabin occupied.
    assert "15:00" not in slots  # Specialist attends another branch.
    past = client.get(
        f"{base}/slots",
        params={"date": (date.today() - timedelta(days=1)).isoformat(), "employeeId": employee},
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
    slots = client.get(
        f"{base}/slots",
        params={"date": body["date"], "employeeId": employee, "duration": 30},
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
    slots = client.get(
        f"{base}/slots", params={"date": body["date"], "employeeId": employee, "duration": 45}
    ).json()["slots"]
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
        client.get(f"{base}/slots", params={"date": body["date"], "employeeId": employee}).json()[
            "slots"
        ]
        == []
    )


@pytest.mark.integration
def test_booking_price_idempotency_and_token_management(client, booking_setup):
    headers, me, branch, employee, service = booking_setup
    base = f"/api/v1/public/booking/branches/{branch}"
    context = client.get(f"{base}/context").json()
    assert any(s["id"] == service and s["price"] == "1250.00" for s in context["services"])
    assert any(s["id"] == employee for s in context["specialists"])
    body = payload_for(employee, service)
    slots = client.get(
        f"{base}/slots", params={"date": body["date"], "employeeId": employee, "duration": 90}
    ).json()["slots"]
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
    rescheduled = client.post(
        f"{uri}/reschedule",
        json={"managementToken": token, "date": body["date"], "time": "13:00", "duration": 60},
    )
    assert rescheduled.status_code == 200, rescheduled.text
    assert rescheduled.json()["time"] == "13:00"
    same = client.post(
        f"{uri}/reschedule",
        json={"managementToken": token, "date": body["date"], "time": "13:00", "duration": 60},
    )
    assert same.status_code == 200, same.text
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
    identified = client.post(
        f"{base}/identify",
        json={"documentType": body["documentType"], "documentId": body["documentId"]},
    )
    assert identified.status_code == 200, identified.text
    assert identified.json()["isNew"] is False
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
        summary = AppointmentReminderService(reminder_session).process_due(
            recipient_email="booking-test@example.com",
            now=now,
        )
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
            recipient_email="booking-test@example.com",
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
