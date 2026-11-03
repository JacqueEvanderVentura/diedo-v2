from datetime import date, timedelta
from hashlib import sha256
from uuid import UUID, uuid7

import pytest
from app.core.security import hash_password
from app.db.models import Appointment, AppointmentResource, Customer
from app.db.models.email_notifications import EmailNotification
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from sqlalchemy import func, select

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "agenda-import-owner-password-not-a-secret"


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


def _hq_branch_id(session: dict[str, object]) -> str:
    branches = session["visibleBranches"]
    hq = next((branch for branch in branches if branch.get("code") == "HQ"), branches[0])
    return str(hq["id"])


def _import_customers(
    client: TestClient,
    headers: dict[str, str],
    branch_id: str,
    items: list[dict[str, object]],
) -> list[dict[str, object]]:
    suffix = uuid7().hex[-8:]
    response = client.post(
        "/api/v1/customers/import",
        headers={**headers, "Idempotency-Key": sha256(suffix.encode()).hexdigest()},
        json={"branchIds": [branch_id], "items": items},
    )
    assert response.status_code == 201, response.text
    return response.json()["items"]


def _post_import_appointments(
    client: TestClient,
    headers: dict[str, str],
    branch_id: str,
    items: list[dict[str, object]],
    *,
    key_suffix: str | None = None,
):
    suffix = key_suffix or uuid7().hex[-8:]
    return client.post(
        "/api/v1/appointments/import",
        headers={**headers, "Idempotency-Key": sha256(suffix.encode()).hexdigest()},
        json={"branchId": branch_id, "items": items},
    )


def _import_appointments(
    client: TestClient,
    headers: dict[str, str],
    branch_id: str,
    items: list[dict[str, object]],
    *,
    key_suffix: str | None = None,
) -> tuple[int, list[dict[str, object]]]:
    response = _post_import_appointments(client, headers, branch_id, items, key_suffix=key_suffix)
    assert response.status_code == 201, response.text
    return response.status_code, response.json()["items"]


def _create_resource(client: TestClient, headers: dict[str, str], branch_id: str, name: str) -> str:
    response = client.post(
        "/api/v1/appointment-resources",
        headers=headers,
        json={"branchId": branch_id, "name": name},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.mark.integration
def test_agenda_import_links_existing_customer_by_phone(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = _hq_branch_id(session)
    suffix = uuid7().hex[-8:]
    phone = f"809{suffix[:7]}"
    customer_rows = _import_customers(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"c-{suffix}",
                "displayName": "Cliente Importado",
                "phone": phone,
                "acquisitionSource": "otros",
            }
        ],
    )
    customer_id = customer_rows[0]["customerId"]
    with session_scope() as db:
        before_count = db.scalar(select(func.count()).select_from(Customer))

    resource_name = f"Cabina import {suffix}"
    _create_resource(client, headers, branch_id, resource_name)
    scheduled = date.today() + timedelta(days=90_000 + uuid7().int % 3_000)

    _, rows = _import_appointments(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"cita-{suffix}",
                "date": scheduled.isoformat(),
                "time": "10:00",
                "duration": 30,
                "customerName": "Nombre CSV",
                "customerPhone": phone,
                "resourceName": resource_name,
                "serviceName": "Consulta",
            }
        ],
    )
    assert rows[0]["status"] == "created"
    assert rows[0]["customerLinked"] is True
    assert rows[0]["customerId"] == customer_id

    with session_scope() as db:
        after_count = db.scalar(select(func.count()).select_from(Customer))
        appointment_id = UUID(rows[0]["appointmentId"])
        appointment = db.scalar(select(Appointment).where(Appointment.id == appointment_id))
    assert before_count == after_count
    assert appointment is not None
    assert appointment.customer_id == UUID(customer_id)


@pytest.mark.integration
def test_agenda_import_unmatched_customer_adds_note_without_creating_customer(
    client: TestClient,
) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = _hq_branch_id(session)
    suffix = uuid7().hex[-8:]
    resource_name = f"Cabina sin cliente {suffix}"
    _create_resource(client, headers, branch_id, resource_name)
    scheduled = date.today() + timedelta(days=91_000 + uuid7().int % 3_000)
    phone = f"829{suffix[:7]}"

    with session_scope() as db:
        before_count = db.scalar(select(func.count()).select_from(Customer))

    _, rows = _import_appointments(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"cita-u-{suffix}",
                "date": scheduled.isoformat(),
                "time": "11:00",
                "customerName": "Desconocido CSV",
                "customerPhone": phone,
                "resourceName": resource_name,
            }
        ],
    )
    assert rows[0]["status"] == "created"
    assert rows[0]["customerLinked"] is False
    assert rows[0]["customerId"] is None
    assert rows[0]["message"] is not None
    assert "No existía dicho cliente" in rows[0]["message"]

    with session_scope() as db:
        after_count = db.scalar(select(func.count()).select_from(Customer))
        appointment_id = UUID(rows[0]["appointmentId"])
        appointment = db.scalar(select(Appointment).where(Appointment.id == appointment_id))
    assert before_count == after_count
    assert appointment is not None
    assert appointment.customer_id is None
    assert appointment.notes is not None
    assert "No existía dicho cliente" in appointment.notes


@pytest.mark.integration
def test_agenda_import_without_resource_creates_cabina_1(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = _hq_branch_id(session)
    suffix = uuid7().hex[-8:]
    scheduled = date.today() + timedelta(days=96_000 + uuid7().int % 3_000)

    with session_scope() as db:
        active_resources = db.scalars(
            select(AppointmentResource).where(
                AppointmentResource.branch_id == UUID(branch_id),
                AppointmentResource.status == "active",
            )
        ).all()
        for resource in active_resources:
            resource.status = "archived"
        before_count = db.scalar(
            select(func.count())
            .select_from(AppointmentResource)
            .where(
                AppointmentResource.branch_id == UUID(branch_id),
                AppointmentResource.code == "cabina-1",
            )
        )

    _, rows = _import_appointments(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"no-cab-{suffix}",
                "date": scheduled.isoformat(),
                "time": "09:30",
                "customerName": "Ana",
            }
        ],
    )
    assert rows[0]["status"] == "created"

    with session_scope() as db:
        after_count = db.scalar(
            select(func.count())
            .select_from(AppointmentResource)
            .where(
                AppointmentResource.branch_id == UUID(branch_id),
                AppointmentResource.code == "cabina-1",
            )
        )
        appointment = db.scalar(
            select(Appointment).where(Appointment.id == UUID(rows[0]["appointmentId"]))
        )
        cabina = db.scalar(
            select(AppointmentResource).where(
                AppointmentResource.branch_id == UUID(branch_id),
                AppointmentResource.code == "cabina-1",
            )
        )
    assert appointment is not None
    assert cabina is not None
    assert appointment.resource_id == cabina.id
    if before_count == 0:
        assert after_count == 1
    else:
        assert after_count == before_count


@pytest.mark.integration
def test_agenda_import_without_resource_reuses_existing_cabina_1(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = _hq_branch_id(session)
    suffix = uuid7().hex[-8:]
    scheduled = date.today() + timedelta(days=97_000 + uuid7().int % 3_000)

    with session_scope() as db:
        cabina = db.scalar(
            select(AppointmentResource).where(
                AppointmentResource.branch_id == UUID(branch_id),
                AppointmentResource.code == "cabina-1",
                AppointmentResource.status == "active",
            )
        )
        assert cabina is not None
        cabina_id = str(cabina.id)
        before_count = db.scalar(
            select(func.count())
            .select_from(AppointmentResource)
            .where(
                AppointmentResource.branch_id == UUID(branch_id),
                AppointmentResource.status == "active",
            )
        )

    _, rows = _import_appointments(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"reuse-{suffix}",
                "date": scheduled.isoformat(),
                "time": "10:15",
                "customerName": "Luis",
            }
        ],
    )
    assert rows[0]["status"] == "created"

    with session_scope() as db:
        after_count = db.scalar(
            select(func.count())
            .select_from(AppointmentResource)
            .where(
                AppointmentResource.branch_id == UUID(branch_id),
                AppointmentResource.status == "active",
            )
        )
        appointment = db.scalar(
            select(Appointment).where(Appointment.id == UUID(rows[0]["appointmentId"]))
        )
    assert before_count == after_count
    assert appointment is not None
    assert str(appointment.resource_id) == cabina_id


@pytest.mark.integration
def test_agenda_import_unknown_resource_falls_back_to_cabina_1(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = _hq_branch_id(session)
    suffix = uuid7().hex[-8:]
    scheduled = date.today() + timedelta(days=92_000 + uuid7().int % 3_000)

    _, rows = _import_appointments(
        client,
        headers,
        branch_id,
        [
            {
                "date": scheduled.isoformat(),
                "time": "09:00",
                "customerName": "Ana",
                "resourceName": f"No existe {suffix}",
            }
        ],
    )
    assert rows[0]["status"] == "created"

    with session_scope() as db:
        appointment = db.scalar(
            select(Appointment).where(Appointment.id == UUID(rows[0]["appointmentId"]))
        )
        assert appointment is not None
        resource = db.scalar(
            select(AppointmentResource).where(AppointmentResource.id == appointment.resource_id)
        )
    assert resource is not None
    assert resource.name == "Cabina 1"


@pytest.mark.integration
def test_agenda_import_duplicate_external_id_is_skipped(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = _hq_branch_id(session)
    suffix = uuid7().hex[-8:]
    resource_name = f"Cabina dup {suffix}"
    _create_resource(client, headers, branch_id, resource_name)
    scheduled = date.today() + timedelta(days=93_000 + uuid7().int % 3_000)
    item = {
        "externalId": f"dup-{suffix}",
        "date": scheduled.isoformat(),
        "time": "15:00",
        "customerName": "Cliente Dup",
        "resourceName": resource_name,
    }
    _, first = _import_appointments(client, headers, branch_id, [item], key_suffix=f"a-{suffix}")
    _, second = _import_appointments(client, headers, branch_id, [item], key_suffix=f"b-{suffix}")
    assert first[0]["status"] == "created"
    assert second[0]["status"] == "skipped"


@pytest.mark.integration
def test_agenda_import_slot_conflict_does_not_abort_batch(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = _hq_branch_id(session)
    suffix = uuid7().hex[-8:]
    resource_name = f"Cabina overlap {suffix}"
    _create_resource(client, headers, branch_id, resource_name)
    scheduled = date.today() + timedelta(days=94_000 + uuid7().int % 3_000)
    base = {
        "date": scheduled.isoformat(),
        "time": "16:00",
        "duration": 60,
        "customerName": "Cliente A",
        "resourceName": resource_name,
    }
    _, rows = _import_appointments(
        client,
        headers,
        branch_id,
        [
            {**base, "externalId": f"ov-1-{suffix}"},
            {**base, "externalId": f"ov-2-{suffix}", "customerName": "Cliente B"},
            {**base, "externalId": f"ov-3-{suffix}", "customerName": "Cliente C"},
        ],
    )
    assert rows[0]["status"] == "created"
    assert rows[1]["status"] == "created"
    assert rows[2]["status"] == "created"
    assert rows[2].get("importStacked") is True


@pytest.mark.integration
def test_agenda_import_requires_manage_permission(client: TestClient) -> None:
    from tests.test_agenda import _AGENDA_MANAGER_PASSWORD, _create_branch_agenda_reader

    headers, session = _bootstrap_and_login(client)
    branch_id = _hq_branch_id(session)
    workspace_id = UUID(str(session["workspaceId"]))
    reader_email = _create_branch_agenda_reader(workspace_id, UUID(branch_id))
    login = client.post(
        "/api/v1/auth/login",
        json={"email": reader_email, "password": _AGENDA_MANAGER_PASSWORD},
    )
    assert login.status_code == 200, login.text
    reader_headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    response = _post_import_appointments(
        client,
        reader_headers,
        branch_id,
        [
            {
                "date": date.today().isoformat(),
                "time": "08:00",
                "customerName": "X",
                "resourceName": "N/A",
            }
        ],
    )
    assert response.status_code == 403


@pytest.mark.integration
def test_agenda_import_does_not_enqueue_email(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = _hq_branch_id(session)
    suffix = uuid7().hex[-8:]
    phone = f"849{suffix[:7]}"
    _import_customers(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"mail-{suffix}",
                "displayName": "Con Email",
                "phone": phone,
                "email": f"agenda-import-{suffix}@example.com",
                "acquisitionSource": "otros",
            }
        ],
    )
    resource_name = f"Cabina mail {suffix}"
    _create_resource(client, headers, branch_id, resource_name)
    scheduled = date.today() + timedelta(days=95_000 + uuid7().int % 3_000)

    _, rows = _import_appointments(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"mail-cita-{suffix}",
                "date": scheduled.isoformat(),
                "time": "12:30",
                "customerName": "Con Email",
                "customerPhone": phone,
                "customerEmail": f"agenda-import-{suffix}@example.com",
                "resourceName": resource_name,
            }
        ],
    )
    assert rows[0]["status"] == "created"
    with session_scope() as db:
        count = db.scalar(
            select(func.count())
            .select_from(EmailNotification)
            .where(EmailNotification.appointment_id == UUID(rows[0]["appointmentId"]))
        )
    assert count == 0


@pytest.mark.integration
def test_agenda_import_batch_of_many_rows_in_one_request(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = _hq_branch_id(session)
    suffix = uuid7().hex[-8:]
    resource_name = f"Cabina batch {suffix}"
    _create_resource(client, headers, branch_id, resource_name)
    scheduled = date.today() + timedelta(days=98_000 + uuid7().int % 3_000)
    items = []
    for index in range(100):
        hour = 8 + (index // 12)
        minute = (index % 12) * 5
        items.append(
            {
                "externalId": f"batch-{suffix}-{index}",
                "date": scheduled.isoformat(),
                "time": f"{hour:02d}:{minute:02d}",
                "duration": 30,
                "customerName": f"Cliente {index}",
                "resourceName": resource_name,
            }
        )

    _, rows = _import_appointments(
        client,
        headers,
        branch_id,
        items,
        key_suffix=f"batch-{suffix}",
    )
    created = [row for row in rows if row["status"] == "created"]
    assert len(created) == 100

    with session_scope() as db:
        count = db.scalar(
            select(func.count())
            .select_from(Appointment)
            .where(Appointment.id.in_([UUID(row["appointmentId"]) for row in created]))
        )
    assert count == 100
