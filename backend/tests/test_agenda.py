from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from threading import Barrier
from uuid import UUID, uuid7
from zoneinfo import ZoneInfo

import pytest
from app.core.security import hash_password
from app.db.models import Appointment
from app.db.session import get_session_factory, session_scope
from app.schemas.agenda import CreateAppointmentRequest, UpdateAppointmentRequest
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "agenda-owner-password-not-a-secret"


def _bootstrap_and_login(client: TestClient) -> tuple[dict[str, str], dict[str, object]]:
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


def _appointment_payload(
    *,
    branch_id: str,
    resource_id: str,
    scheduled_date: date,
    scheduled_time: str,
    customer_name: str,
    employee_id: str | None = None,
    recurrence: str = "none",
    repeat_count: int = 1,
) -> dict[str, object]:
    return {
        "branchId": branch_id,
        "resourceId": resource_id,
        "employeeId": employee_id,
        "date": scheduled_date.isoformat(),
        "time": scheduled_time,
        "duration": 60,
        "customerName": customer_name,
        "serviceName": "Sesión de terapia",
        "price": "1500.00",
        "status": "confirmed",
        "pendingPayment": False,
        "pendingAmount": "0.00",
        "recurrence": recurrence,
        "repeatCount": repeat_count,
    }


def test_agenda_schemas_reject_ambiguous_recurrence_money_and_empty_updates() -> None:
    base = {
        "branchId": uuid7(),
        "resourceId": uuid7(),
        "date": date.today(),
        "time": "14:00",
        "customerName": "Cliente",
    }
    with pytest.raises(ValidationError, match="repeatCount"):
        CreateAppointmentRequest(**base, recurrence="none", repeatCount=2)
    with pytest.raises(ValidationError, match="monto pendiente"):
        CreateAppointmentRequest(
            **base,
            price="100.00",
            pendingPayment=True,
            pendingAmount="100.01",
        )
    with pytest.raises(ValidationError, match="al menos un cambio"):
        UpdateAppointmentRequest(version=1)


@pytest.mark.integration
def test_agenda_calendar_management_conflicts_recurrence_and_fresh_reads(
    client: TestClient,
) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = str(session["visibleBranches"][0]["id"])
    resources_response = client.get(
        "/api/v1/appointment-resources",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert resources_response.status_code == 200, resources_response.text
    assert resources_response.headers["cache-control"] == "no-store"
    resources = resources_response.json()["items"]
    assert len(resources) >= 2
    first_resource_id = resources[0]["id"]
    second_resource_id = resources[1]["id"]
    nonce = uuid7()
    scheduled_date = date.today() + timedelta(days=420 + nonce.int % 10_000)
    suffix = nonce.hex[-10:]

    payload = _appointment_payload(
        branch_id=branch_id,
        resource_id=first_resource_id,
        scheduled_date=scheduled_date,
        scheduled_time="14:00",
        customer_name=f"Cliente Agenda {suffix}",
    )
    idempotency_headers = {**headers, "Idempotency-Key": f"agenda-create-{suffix}"}
    created = client.post(
        "/api/v1/appointments",
        headers=idempotency_headers,
        json=payload,
    )
    assert created.status_code == 201, created.text
    appointment = created.json()["items"][0]
    assert appointment["resource"]["id"] == first_resource_id
    assert appointment["history"][0]["action"] == "create"

    repeated = client.post(
        "/api/v1/appointments",
        headers=idempotency_headers,
        json=payload,
    )
    assert repeated.status_code == 201, repeated.text
    assert repeated.json()["items"][0]["id"] == appointment["id"]

    reused_key = client.post(
        "/api/v1/appointments",
        headers=idempotency_headers,
        json={**payload, "customerName": f"Otro Cliente {suffix}"},
    )
    assert reused_key.status_code == 409, reused_key.text
    assert reused_key.json()["parameter"] == "Idempotency-Key"

    filtered = client.get(
        "/api/v1/appointments",
        headers=headers,
        params={
            "branchId": branch_id,
            "dateFrom": scheduled_date.isoformat(),
            "dateTo": scheduled_date.isoformat(),
            "status": "confirmed",
            "search": suffix,
            "sortBy": "customerName",
            "sortDirection": "desc",
        },
    )
    assert filtered.status_code == 200, filtered.text
    assert [item["id"] for item in filtered.json()["items"]] == [appointment["id"]]

    reverse_range = client.get(
        "/api/v1/appointments",
        headers=headers,
        params={
            "branchId": branch_id,
            "dateFrom": scheduled_date.isoformat(),
            "dateTo": (scheduled_date - timedelta(days=1)).isoformat(),
        },
    )
    assert reverse_range.status_code == 400, reverse_range.text
    assert reverse_range.json()["parameter"] == "dateTo"

    oversized_range = client.get(
        "/api/v1/appointments",
        headers=headers,
        params={
            "branchId": branch_id,
            "dateFrom": scheduled_date.isoformat(),
            "dateTo": (scheduled_date + timedelta(days=367)).isoformat(),
        },
    )
    assert oversized_range.status_code == 400, oversized_range.text
    assert oversized_range.json()["parameter"] == "dateTo"

    overlapping = _appointment_payload(
        branch_id=branch_id,
        resource_id=first_resource_id,
        scheduled_date=scheduled_date,
        scheduled_time="14:30",
        customer_name=f"Conflicto Cabina {suffix}",
    )
    conflict = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": f"agenda-room-conflict-{suffix}"},
        json=overlapping,
    )
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["parameter"] == "time"

    parallel = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": f"agenda-parallel-{suffix}"},
        json={**overlapping, "resourceId": second_resource_id},
    )
    assert parallel.status_code == 201, parallel.text
    parallel_appointment = parallel.json()["items"][0]
    rescheduled = client.patch(
        f"/api/v1/appointments/{parallel_appointment['id']}",
        headers=headers,
        json={
            "version": parallel_appointment["version"],
            "date": (scheduled_date + timedelta(days=2)).isoformat(),
            "time": "15:00",
            "duration": 90,
            "notes": "Cambio validado desde gestión de citas",
            "status": "rescheduled",
        },
    )
    assert rescheduled.status_code == 200, rescheduled.text
    assert rescheduled.json()["version"] == parallel_appointment["version"] + 1
    assert rescheduled.json()["history"][-1]["action"] == "update"

    stale_update = client.patch(
        f"/api/v1/appointments/{parallel_appointment['id']}",
        headers=headers,
        json={"version": parallel_appointment["version"], "notes": "stale"},
    )
    assert stale_update.status_code == 409, stale_update.text
    assert stale_update.json()["parameter"] == "version"

    missing_update = client.patch(
        f"/api/v1/appointments/{uuid7()}",
        headers=headers,
        json={"version": 1, "status": "cancelled"},
    )
    assert missing_update.status_code == 404, missing_update.text
    assert missing_update.json()["parameter"] == "appointmentId"

    employee = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"APT-{suffix}",
            "firstName": "Terapeuta",
            "lastName": suffix,
            "position": "Especialista",
            "hireDate": date.today().isoformat(),
            "branchIds": [branch_id],
        },
    )
    assert employee.status_code == 201, employee.text
    employee_id = employee.json()["id"]
    schedule = employee.json()["schedule"]
    schedule_update = client.put(
        f"/api/v1/employees/{employee_id}/schedule",
        headers=headers,
        json={
            "timezone": "America/Santo_Domingo",
            "week": {
                day: [{"start": "08:00", "end": "20:00"}]
                for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
            },
            "version": schedule["version"],
        },
    )
    assert schedule_update.status_code == 200, schedule_update.text
    employee_date = scheduled_date + timedelta(days=1)
    employee_booking = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": f"agenda-employee-{suffix}"},
        json=_appointment_payload(
            branch_id=branch_id,
            resource_id=first_resource_id,
            scheduled_date=employee_date,
            scheduled_time="16:00",
            customer_name=f"Empleado Base {suffix}",
            employee_id=employee_id,
        ),
    )
    assert employee_booking.status_code == 201, employee_booking.text
    employee_conflict = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": f"agenda-employee-conflict-{suffix}"},
        json=_appointment_payload(
            branch_id=branch_id,
            resource_id=second_resource_id,
            scheduled_date=employee_date,
            scheduled_time="16:30",
            customer_name=f"Conflicto Empleado {suffix}",
            employee_id=employee_id,
        ),
    )
    assert employee_conflict.status_code == 409, employee_conflict.text
    assert employee_conflict.json()["parameter"] == "time"

    cancelled = client.patch(
        f"/api/v1/appointments/{appointment['id']}",
        headers=headers,
        json={"version": appointment["version"], "status": "cancelled"},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    replacement = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": f"agenda-replacement-{suffix}"},
        json=payload,
    )
    assert replacement.status_code == 201, replacement.text

    recurrence_start = scheduled_date + timedelta(days=30)
    blocker_date = recurrence_start + timedelta(days=7)
    blocker = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": f"agenda-blocker-{suffix}"},
        json=_appointment_payload(
            branch_id=branch_id,
            resource_id=first_resource_id,
            scheduled_date=blocker_date,
            scheduled_time="10:00",
            customer_name=f"Bloqueador {suffix}",
        ),
    )
    assert blocker.status_code == 201, blocker.text
    series_name = f"Serie Atómica {suffix}"
    series = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": f"agenda-series-{suffix}"},
        json=_appointment_payload(
            branch_id=branch_id,
            resource_id=first_resource_id,
            scheduled_date=recurrence_start,
            scheduled_time="10:00",
            customer_name=series_name,
            recurrence="weekly",
            repeat_count=3,
        ),
    )
    assert series.status_code == 409, series.text
    series_lookup = client.get(
        "/api/v1/appointments",
        headers=headers,
        params={"branchId": branch_id, "search": series_name, "pageSize": 200},
    )
    assert series_lookup.status_code == 200, series_lookup.text
    assert series_lookup.headers["cache-control"] == "no-store"
    assert series_lookup.json()["items"] == []

    monthly = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": f"agenda-monthly-{suffix}"},
        json=_appointment_payload(
            branch_id=branch_id,
            resource_id=second_resource_id,
            scheduled_date=date(2092, 1, 31),
            scheduled_time="11:00",
            customer_name=f"Serie Mensual {suffix}",
            recurrence="monthly",
            repeat_count=2,
        ),
    )
    assert monthly.status_code == 201, monthly.text
    assert [item["date"] for item in monthly.json()["items"]] == [
        "2092-01-31",
        "2092-02-29",
    ]


@pytest.mark.integration
def test_database_exclusion_constraint_serializes_concurrent_room_booking(
    client: TestClient,
) -> None:
    headers, session_context = _bootstrap_and_login(client)
    branch = session_context["visibleBranches"][0]
    branch_id = UUID(str(branch["id"]))
    workspace_id = UUID(str(session_context["workspaceId"]))
    actor_id = UUID(str(session_context["userId"]))
    resources_response = client.get(
        "/api/v1/appointment-resources",
        headers=headers,
        params={"branchId": str(branch_id)},
    )
    resource_id = UUID(resources_response.json()["items"][0]["id"])
    scheduled_date = date.today() + timedelta(days=900 + uuid7().int % 10_000)
    zone = ZoneInfo("America/Santo_Domingo")
    starts_at = datetime.combine(scheduled_date, time(9, 0), tzinfo=zone).astimezone(UTC)
    ends_at = starts_at + timedelta(minutes=60)
    barrier = Barrier(2)

    def attempt(index: int) -> str:
        factory = get_session_factory()
        with factory() as database:
            appointment = Appointment(
                workspace_id=workspace_id,
                branch_id=branch_id,
                resource_id=resource_id,
                customer_id=None,
                employee_id=None,
                service_id=None,
                scheduled_date=scheduled_date,
                scheduled_time=time(9, 0),
                timezone="America/Santo_Domingo",
                starts_at=starts_at,
                ends_at=ends_at,
                duration_minutes=60,
                customer_name=f"Concurrente {index}",
                customer_phone=None,
                service_name="Sesión de terapia",
                price=Decimal("1000.00"),
                status="confirmed",
                notes=None,
                pending_payment=False,
                pending_amount=Decimal("0"),
                first_time=False,
                free_trial=False,
                reminder_sent=False,
                source="staff",
                recurrence="none",
                recurrence_group_id=None,
                occurrence_index=0,
                repeat_count=1,
                idempotency_key=f"concurrent-{uuid7()}-{index}",
                request_fingerprint="0" * 64,
                created_by_platform_user_id=actor_id,
                updated_by_platform_user_id=actor_id,
            )
            database.add(appointment)
            barrier.wait(timeout=10)
            try:
                database.commit()
                return "created"
            except IntegrityError as exc:
                database.rollback()
                return getattr(getattr(exc.orig, "diag", None), "constraint_name", "conflict")

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(attempt, (1, 2)))
    assert results.count("created") == 1
    assert results.count("excl_appointments_resource_period") == 1
