import base64
from datetime import UTC, date, datetime, timedelta
from hashlib import sha256
from typing import Any, cast
from uuid import uuid7

import pytest
from app.core.errors import InvalidOperationError
from app.core.security import hash_password
from app.db.models import IncidentAttachment
from app.db.session import session_scope
from app.schemas.incidents import CreateIncidentRequest
from app.services.incidents import IncidentImageInput, IncidentService
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "incidents-owner-password-not-a-secret"
_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


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
    assert "incidents" in me.json()["enabledModules"]
    return headers, me.json()


def test_incident_schema_normalizes_text_and_rejects_duplicate_participants() -> None:
    branch_id = uuid7()
    membership_id = uuid7()
    payload = CreateIncidentRequest.model_validate(
        {
            "title": "  Fuga   en recepción ",
            "branchId": branch_id,
            "participantIds": [membership_id],
        }
    )
    assert payload.title == "Fuga en recepción"
    with pytest.raises(ValidationError, match="No repitas intervinientes"):
        CreateIncidentRequest.model_validate(
            {
                "title": "Fuga en recepción",
                "branchId": branch_id,
                "participantIds": [membership_id, membership_id],
            }
        )


def test_incident_image_validation_rejects_unsafe_files_and_normalizes_names() -> None:
    with pytest.raises(InvalidOperationError, match="Formato no permitido"):
        IncidentService._validate_image(
            IncidentImageInput(filename="evidencia.txt", content_type="text/plain", content=b"x"),
            max_bytes=1024,
        )
    with pytest.raises(InvalidOperationError, match="vacía"):
        IncidentService._validate_image(
            IncidentImageInput(filename="vacia.png", content_type="image/png", content=b""),
            max_bytes=1024,
        )
    with pytest.raises(InvalidOperationError, match="máximo"):
        IncidentService._validate_image(
            IncidentImageInput(filename="grande.png", content_type="image/png", content=_PNG),
            max_bytes=1,
        )

    normalized = IncidentService._validate_image(
        IncidentImageInput(
            filename="C:\\fakepath\\\x00",
            content_type="image/png; charset=binary",
            content=_PNG,
        ),
        max_bytes=1024,
    )
    assert normalized.original_filename == "imagen"
    assert normalized.content_type == "image/png"


@pytest.mark.integration
def test_incidents_complete_http_contract_and_database_image_preview(
    client: TestClient,
) -> None:
    headers, session_context = _bootstrap_and_login(client)
    visible_branches = cast(list[dict[str, Any]], session_context["visibleBranches"])
    branch_id = str(visible_branches[0]["id"])
    membership_id = str(session_context["membershipId"])
    suffix = uuid7().hex[-10:]

    unauthorized = client.get("/api/v1/incidents")
    assert unauthorized.status_code == 401

    categories = client.get("/api/v1/inventory/asset-categories", headers=headers)
    assert categories.status_code == 200, categories.text
    category_id = categories.json()[0]["id"]
    asset_response = client.post(
        "/api/v1/inventory/assets",
        headers={**headers, "Idempotency-Key": f"incident-asset-{suffix}"},
        json={
            "name": f"Máquina de vapor {suffix}",
            "code": f"MV-{suffix}",
            "categoryId": category_id,
            "branchId": branch_id,
            "acquisitionValue": "25000.00",
            "status": "activo",
        },
    )
    assert asset_response.status_code == 201, asset_response.text
    asset_id = asset_response.json()["id"]

    payload = {
        "title": f"Reparar máquina de vapor {suffix}",
        "description": "La máquina pierde presión durante el uso.",
        "type": "activo",
        "priority": "alta",
        "branchId": branch_id,
        "activoId": asset_id,
        "participantIds": [membership_id],
    }
    create = client.post(
        "/api/v1/incidents",
        headers={**headers, "Idempotency-Key": f"incident-{suffix}"},
        json=payload,
    )
    assert create.status_code == 201, create.text
    incident = create.json()
    assert incident["code"].startswith("INC-")
    assert incident["status"] == "abierta"
    assert incident["activoId"] == asset_id
    assert incident["intervenientes"] == [
        {"id": membership_id, "name": session_context["displayName"]}
    ]
    assert incident["images"] == []
    assert incident["activity"][0]["message"] == "Incidencia reportada y abierta."
    assert incident["version"] == 1

    replay = client.post(
        "/api/v1/incidents",
        headers={**headers, "Idempotency-Key": f"incident-{suffix}"},
        json=payload,
    )
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == incident["id"]
    idempotency_conflict = client.post(
        "/api/v1/incidents",
        headers={**headers, "Idempotency-Key": f"incident-{suffix}"},
        json={**payload, "title": "Otro reporte"},
    )
    assert idempotency_conflict.status_code == 409
    assert idempotency_conflict.json()["parameter"] == "Idempotency-Key"

    invalid_relation = client.post(
        "/api/v1/incidents",
        headers={**headers, "Idempotency-Key": f"incident-invalid-{suffix}"},
        json={
            **payload,
            "title": "Incidencia de personal",
            "type": "personal",
        },
    )
    assert invalid_relation.status_code == 400
    assert invalid_relation.json()["parameter"] == "activoId"

    listed = client.get(
        "/api/v1/incidents",
        headers=headers,
        params={
            "branchId": branch_id,
            "type": "activo",
            "status": "abierta",
            "search": suffix,
        },
    )
    assert listed.status_code == 200, listed.text
    assert listed.headers["cache-control"] == "no-store"
    assert listed.json()["totalItems"] == 1
    assert listed.json()["items"][0]["id"] == incident["id"]

    invalid_dates = client.get(
        "/api/v1/incidents",
        headers=headers,
        params={
            "dateFrom": date.today().isoformat(),
            "dateTo": (date.today() - timedelta(days=1)).isoformat(),
        },
    )
    assert invalid_dates.status_code == 400
    assert invalid_dates.json()["parameter"] == "dateTo"

    missing_incident = client.get(f"/api/v1/incidents/{uuid7()}", headers=headers)
    assert missing_incident.status_code == 404
    assert missing_incident.json()["parameter"] == "incidentId"

    invalid_branch = client.post(
        "/api/v1/incidents",
        headers={**headers, "Idempotency-Key": f"incident-branch-{suffix}"},
        json={**payload, "branchId": str(uuid7()), "activoId": None},
    )
    assert invalid_branch.status_code == 404
    assert invalid_branch.json()["parameter"] == "branchId"

    invalid_asset = client.post(
        "/api/v1/incidents",
        headers={**headers, "Idempotency-Key": f"incident-asset-invalid-{suffix}"},
        json={**payload, "activoId": str(uuid7())},
    )
    assert invalid_asset.status_code == 404
    assert invalid_asset.json()["parameter"] == "activoId"

    invalid_participant = client.post(
        "/api/v1/incidents",
        headers={**headers, "Idempotency-Key": f"incident-participant-{suffix}"},
        json={**payload, "participantIds": [str(uuid7())]},
    )
    assert invalid_participant.status_code == 404
    assert invalid_participant.json()["parameter"] == "participantIds"

    stats = client.get("/api/v1/incidents/stats", headers=headers, params={"branchId": branch_id})
    assert stats.status_code == 200, stats.text
    assert stats.json()["total"] >= 1
    assert stats.json()["abiertas"] >= 1

    comment = client.post(
        f"/api/v1/incidents/{incident['id']}/comments",
        headers=headers,
        json={"version": incident["version"], "message": "Técnico asignado para revisión."},
    )
    assert comment.status_code == 200, comment.text
    incident = comment.json()
    assert incident["activity"][0]["type"] == "comment"
    assert incident["activity"][0]["message"] == "Técnico asignado para revisión."
    assert incident["version"] == 2

    stale_status = client.patch(
        f"/api/v1/incidents/{incident['id']}/status",
        headers=headers,
        json={"version": 1, "status": "en_proceso"},
    )
    assert stale_status.status_code == 409
    assert stale_status.json()["parameter"] == "version"
    status_update = client.patch(
        f"/api/v1/incidents/{incident['id']}/status",
        headers=headers,
        json={"version": incident["version"], "status": "en_proceso"},
    )
    assert status_update.status_code == 200, status_update.text
    incident = status_update.json()
    assert incident["status"] == "en_proceso"
    assert incident["activity"][0]["message"] == "Estado cambiado a en proceso."
    assert incident["version"] == 3

    unchanged_status = client.patch(
        f"/api/v1/incidents/{incident['id']}/status",
        headers=headers,
        json={"version": incident["version"], "status": "en_proceso"},
    )
    assert unchanged_status.status_code == 400
    assert unchanged_status.json()["parameter"] == "status"

    missing_status_target = client.patch(
        f"/api/v1/incidents/{uuid7()}/status",
        headers=headers,
        json={"version": 1, "status": "en_proceso"},
    )
    assert missing_status_target.status_code == 404

    upload = client.post(
        f"/api/v1/incidents/{incident['id']}/attachments",
        headers=headers,
        data={"version": str(incident["version"])},
        files=[("files", ("C:\\fakepath\\evidencia.png", _PNG, "image/png"))],
    )
    assert upload.status_code == 200, upload.text
    incident = upload.json()
    assert incident["version"] == 4
    assert len(incident["attachments"]) == 1
    attachment = incident["attachments"][0]
    assert attachment["originalFilename"] == "evidencia.png"
    assert attachment["contentType"] == "image/png"
    assert attachment["sizeBytes"] == len(_PNG)
    assert attachment["checksumSha256"] == sha256(_PNG).hexdigest()
    assert incident["images"] == [attachment["previewUrl"]]

    attachment_id = attachment["id"]
    with session_scope() as session:
        stored_size = session.scalar(
            select(func.octet_length(IncidentAttachment.content)).where(
                IncidentAttachment.id == attachment_id
            )
        )
        assert stored_size == len(_PNG)

    preview = client.get(attachment["previewUrl"], headers=headers)
    assert preview.status_code == 200, preview.text
    assert preview.content == _PNG
    assert preview.headers["content-type"] == "image/png"
    assert preview.headers["content-disposition"].startswith("inline;")
    assert preview.headers["etag"] == f'"{sha256(_PNG).hexdigest()}"'
    unauthorized_preview = client.get(attachment["previewUrl"])
    assert unauthorized_preview.status_code == 401

    invalid_image = client.post(
        f"/api/v1/incidents/{incident['id']}/attachments",
        headers=headers,
        data={"version": str(incident["version"])},
        files=[("files", ("falsa.png", b"not-an-image", "image/png"))],
    )
    assert invalid_image.status_code == 400
    assert invalid_image.json()["parameter"] == "files"

    too_many_images = client.post(
        f"/api/v1/incidents/{incident['id']}/attachments",
        headers=headers,
        data={"version": str(incident["version"])},
        files=[("files", (f"evidencia-{index}.png", _PNG, "image/png")) for index in range(6)],
    )
    assert too_many_images.status_code == 400
    assert too_many_images.json()["parameter"] == "files"

    missing_attachment = client.get(
        f"/api/v1/incidents/{incident['id']}/attachments/{uuid7()}/content",
        headers=headers,
    )
    assert missing_attachment.status_code == 404
    assert missing_attachment.json()["parameter"] == "attachmentId"

    today = datetime.now(UTC).date().isoformat()
    dated = client.get(
        "/api/v1/incidents",
        headers=headers,
        params={"dateFrom": today, "dateTo": today, "search": suffix},
    )
    assert dated.status_code == 200, dated.text
    assert dated.json()["totalItems"] == 1
