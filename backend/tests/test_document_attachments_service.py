from __future__ import annotations

from datetime import date
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID, uuid7

import pytest
from app.api.deps import get_attachment_storage
from app.main import app
from app.services.attachment_storage import (
    AttachmentContentMismatchError,
    AttachmentTooLargeError,
    LocalAttachmentStorage,
    StoredBlob,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.document_attachments import DocumentAttachmentService
from app.services.errors import InvalidOperationError, ResourceNotFoundError
from sqlalchemy.exc import IntegrityError

from tests.test_finance import _login

pytest_plugins = ("tests.test_finance",)

_PNG = b"\x89PNG\r\n\x1a\nadjunto"
_PDF = b"%PDF-1.4\nvalid\n%%EOF"


def test_document_attachment_content_type_normalizes_and_rejects() -> None:
    assert DocumentAttachmentService._content_type("image/png; charset=binary") == "image/png"
    with pytest.raises(InvalidOperationError, match="no permitido") as exc_info:
        DocumentAttachmentService._content_type("text/plain")
    assert exc_info.value.parameter == "file"
    with pytest.raises(InvalidOperationError) as empty_type:
        DocumentAttachmentService._content_type(None)
    assert empty_type.value.parameter == "file"


def test_document_attachment_digest_rejects_oversized_stream() -> None:
    payload = b"x" * 32
    with pytest.raises(AttachmentTooLargeError):
        DocumentAttachmentService._digest(BytesIO(payload), max_bytes=16)
    digest = DocumentAttachmentService._digest(BytesIO(payload), max_bytes=64)
    assert digest.hexdigest()
    assert BytesIO(payload).tell() == 0


@pytest.fixture
def local_attachment_storage(tmp_path: Path) -> LocalAttachmentStorage:
    storage = LocalAttachmentStorage(tmp_path / "attachments")
    app.dependency_overrides[get_attachment_storage] = lambda: storage
    try:
        yield storage
    finally:
        app.dependency_overrides.pop(get_attachment_storage, None)


@pytest.mark.integration
def test_document_attachment_upload_validation_and_missing_content(
    finance_context,
    local_attachment_storage: LocalAttachmentStorage,
) -> None:
    client, _session = finance_context
    headers, me = _login(client)
    branch_id = me["visibleBranches"][0]["id"]

    created = client.post(
        "/api/v1/finance/expenses",
        headers={**headers, "Idempotency-Key": f"doc-attach-validation-{uuid7().hex}"},
        json={
            "concept": "Adjunto validación",
            "amount": "50.00",
            "category": "otros",
            "date": date.today().isoformat(),
            "branchId": str(branch_id),
            "status": "pagado",
        },
    )
    assert created.status_code == 201, created.text
    expense_id = created.json()["id"]

    invalid_type = client.post(
        f"/api/v1/finance/expenses/{expense_id}/attachments",
        headers=headers,
        files={"file": ("notes.txt", b"plain text", "text/plain")},
    )
    assert invalid_type.status_code == 400
    assert invalid_type.json()["parameter"] == "file"

    mismatch = client.post(
        f"/api/v1/finance/expenses/{expense_id}/attachments",
        headers=headers,
        files={"file": ("fake.pdf", b"not-a-pdf", "application/pdf")},
    )
    assert mismatch.status_code == 400
    assert mismatch.json()["parameter"] == "file"

    missing_owner = client.post(
        f"/api/v1/finance/expenses/{uuid7()}/attachments",
        headers=headers,
        files={"file": ("proof.png", _PNG, "image/png")},
    )
    assert missing_owner.status_code == 404
    assert missing_owner.json()["parameter"] == "expenseId"

    upload = client.post(
        f"/api/v1/finance/expenses/{expense_id}/attachments",
        headers=headers,
        files={"file": ("proof.png", _PNG, "image/png")},
    )
    assert upload.status_code == 201, upload.text
    preview_url = upload.json()["previewUrl"]

    missing_attachment = client.get(
        f"/api/v1/document-attachments/{uuid7()}/content",
        headers=headers,
    )
    assert missing_attachment.status_code == 404
    assert missing_attachment.json()["parameter"] == "attachmentId"

    content = client.get(preview_url, headers=headers)
    assert content.status_code == 200
    assert content.content == _PNG
    assert local_attachment_storage.open.__self__ is local_attachment_storage


@pytest.mark.integration
def test_document_attachment_owner_branches_and_purchase_quote_name(
    finance_context,
    local_attachment_storage: LocalAttachmentStorage,
) -> None:
    client, _session = finance_context
    headers, me = _login(client)
    branch_id = me["visibleBranches"][0]["id"]

    fixed = client.post(
        "/api/v1/finance/fixed-expenses",
        headers={**headers, "Idempotency-Key": f"doc-fixed-{uuid7().hex}"},
        json={
            "concept": "Servicio con adjunto",
            "amount": "1200.00",
            "category": "servicios",
            "branchId": str(branch_id),
            "dayOfMonth": 5,
        },
    )
    assert fixed.status_code == 201, fixed.text
    fixed_id = fixed.json()["id"]
    fixed_upload = client.post(
        f"/api/v1/finance/fixed-expenses/{fixed_id}/attachments",
        headers=headers,
        files={"file": ("fixed.pdf", _PDF, "application/pdf")},
    )
    assert fixed_upload.status_code == 201, fixed_upload.text
    fixed_list = client.get(
        f"/api/v1/finance/fixed-expenses/{fixed_id}/attachments",
        headers=headers,
    )
    assert len(fixed_list.json()) == 1

    income = client.post(
        "/api/v1/finance/manual-incomes",
        headers={**headers, "Idempotency-Key": f"doc-income-{uuid7().hex}"},
        json={
            "category": "transferencia",
            "amount": "250.00",
            "date": date.today().isoformat(),
            "branchId": str(branch_id),
            "customer": "Cliente adjunto",
            "source": "Prueba",
            "status": "pagado",
        },
    )
    assert income.status_code == 201, income.text
    income_id = income.json()["id"]
    income_upload = client.post(
        f"/api/v1/finance/incomes/{income_id}/attachments",
        headers=headers,
        files={"file": ("income.png", _PNG, "image/png")},
    )
    assert income_upload.status_code == 201, income_upload.text
    income_content = client.get(income_upload.json()["previewUrl"], headers=headers)
    assert income_content.status_code == 200

    supplier = client.post(
        "/api/v1/purchasing/suppliers",
        headers={**headers, "Idempotency-Key": f"doc-supplier-{uuid7().hex}"},
        json={
            "name": f"Proveedor adjuntos {uuid7().hex[-8:]}",
            "branchIds": [str(branch_id)],
        },
    )
    assert supplier.status_code == 201, supplier.text
    purchase = client.post(
        "/api/v1/purchasing/requests",
        headers={**headers, "Idempotency-Key": f"doc-request-{uuid7().hex}"},
        json={
            "supplierId": supplier.json()["id"],
            "branchId": str(branch_id),
            "items": [{"name": "Material", "qty": "1", "unit": "unidad", "price": "10.00"}],
            "priority": "normal",
        },
    )
    assert purchase.status_code == 201, purchase.text
    request_id = purchase.json()["id"]
    quote = client.post(
        f"/api/v1/purchasing/requests/{request_id}/quote",
        headers=headers,
        files={"file": ("cotizacion-oficial.pdf", _PDF, "application/pdf")},
    )
    assert quote.status_code == 201, quote.text
    refreshed = client.get(f"/api/v1/purchasing/requests/{request_id}", headers=headers)
    assert refreshed.status_code == 200
    assert refreshed.json()["quoteFile"]["name"] == "cotizacion-oficial.pdf"
    quote_list = client.get(f"/api/v1/purchasing/requests/{request_id}/quote", headers=headers)
    assert len(quote_list.json()) == 1


def _document_grant(
    workspace_id: UUID,
    *,
    branches: frozenset[UUID] | None = None,
) -> PermissionGrant:
    return PermissionGrant(
        permission_code="finance.manage",
        workspace_id=workspace_id,
        membership_id=uuid7(),
        allowed_legal_entity_ids=None,
        allowed_branch_ids=branches,
    )


def test_document_attachment_require_owner_covers_owner_kinds() -> None:
    workspace_id = uuid7()
    branch_id = uuid7()
    owner_id = uuid7()
    grant = _document_grant(workspace_id)
    limited = _document_grant(workspace_id, branches=frozenset({uuid7()}))
    session = Mock()
    service = DocumentAttachmentService(session)

    session.get.return_value = None
    with pytest.raises(ResourceNotFoundError) as missing_expense:
        service._require_owner(grant, "finance_expense", owner_id)
    assert missing_expense.value.parameter == "expenseId"

    session.get.return_value = SimpleNamespace(
        workspace_id=workspace_id,
        record_status="void",
        branch_id=branch_id,
    )
    with pytest.raises(ResourceNotFoundError):
        service._require_owner(grant, "finance_expense", owner_id)

    session.get.return_value = SimpleNamespace(
        workspace_id=workspace_id,
        record_status="active",
        branch_id=branch_id,
    )
    service._require_owner(grant, "finance_expense", owner_id)
    with pytest.raises(ResourceNotFoundError) as denied:
        service._require_owner(limited, "finance_expense", owner_id)
    assert denied.value.parameter == "ownerId"

    session.get.return_value = None
    with pytest.raises(ResourceNotFoundError) as missing_fixed:
        service._require_owner(grant, "finance_fixed_expense", owner_id)
    assert missing_fixed.value.parameter == "fixedExpenseId"

    session.get.return_value = SimpleNamespace(workspace_id=workspace_id, branch_id=branch_id)
    service._require_owner(grant, "finance_fixed_expense", owner_id)

    session.get.return_value = None
    with pytest.raises(ResourceNotFoundError) as missing_income:
        service._require_owner(grant, "finance_manual_income", owner_id)
    assert missing_income.value.parameter == "incomeId"

    session.get.return_value = SimpleNamespace(
        workspace_id=workspace_id,
        record_status="active",
        branch_id=branch_id,
    )
    service._require_owner(grant, "finance_manual_income", owner_id)

    session.get.return_value = None
    with pytest.raises(ResourceNotFoundError) as missing_movement:
        service._require_owner(grant, "cash_movement", owner_id)
    assert missing_movement.value.parameter == "movementId"

    session.get.return_value = SimpleNamespace(workspace_id=workspace_id, branch_id=branch_id)
    service._require_owner(grant, "cash_movement", owner_id)

    session.get.return_value = None
    with pytest.raises(ResourceNotFoundError) as missing_request:
        service._require_owner(grant, "purchase_request", owner_id)
    assert missing_request.value.parameter == "requestId"

    session.get.return_value = SimpleNamespace(workspace_id=workspace_id, branch_id=branch_id)
    service._require_owner(grant, "purchase_request", owner_id)


def test_document_attachment_get_content_and_upload_error_paths(
    tmp_path: Path,
) -> None:
    workspace_id = uuid7()
    grant = _document_grant(workspace_id)
    attachment_id = uuid7()
    expense_id = uuid7()
    session = Mock()
    service = DocumentAttachmentService(session)
    repository = Mock()
    service._repository = repository

    repository.get.return_value = None
    with pytest.raises(ResourceNotFoundError) as missing:
        service.get_content(grant, attachment_id)
    assert missing.value.parameter == "attachmentId"

    attachment = SimpleNamespace(
        finance_expense_id=expense_id,
        finance_fixed_expense_id=None,
        finance_manual_income_id=None,
        cash_movement_id=None,
        purchase_request_id=None,
        storage_key="key",
    )
    repository.get.return_value = attachment
    session.get.return_value = SimpleNamespace(
        workspace_id=workspace_id,
        record_status="active",
        branch_id=None,
    )
    assert service.get_content(grant, attachment_id) is attachment

    principal = AuthPrincipal(
        platform_user_id=uuid7(),
        membership_id=grant.membership_id,
        workspace_id=workspace_id,
        session_id=uuid7(),
        email="u@example.com",
        display_name="User",
    )
    session.get.return_value = SimpleNamespace(
        workspace_id=workspace_id,
        record_status="active",
        branch_id=None,
    )

    class FailingStorage(LocalAttachmentStorage):
        def save(self, source, *, storage_key, content_type, max_bytes):  # type: ignore[no-untyped-def]
            raise AttachmentTooLargeError

    with pytest.raises(InvalidOperationError) as too_large:
        service.upload(
            principal=principal,
            grant=grant,
            owner_kind="finance_expense",
            owner_id=expense_id,
            source=BytesIO(_PNG),
            filename="proof.png",
            content_type="image/png",
            storage=FailingStorage(tmp_path),
            max_bytes=1024,
        )
    assert too_large.value.parameter == "file"

    class MismatchStorage(LocalAttachmentStorage):
        def save(self, source, *, storage_key, content_type, max_bytes):  # type: ignore[no-untyped-def]
            raise AttachmentContentMismatchError

    with pytest.raises(InvalidOperationError) as mismatch:
        service.upload(
            principal=principal,
            grant=grant,
            owner_kind="finance_expense",
            owner_id=expense_id,
            source=BytesIO(_PNG),
            filename="proof.png",
            content_type="image/png",
            storage=MismatchStorage(tmp_path),
            max_bytes=1024,
        )
    assert mismatch.value.parameter == "file"

    repository.add.side_effect = IntegrityError("insert", {}, Exception("dup"))
    working_storage = Mock()
    working_storage.save.return_value = StoredBlob(
        storage_key=f"{workspace_id}/documents/finance_expense/{expense_id}/file.png",
        size_bytes=len(_PNG),
        checksum_sha256="abc",
    )
    with pytest.raises(InvalidOperationError) as integrity:
        service.upload(
            principal=principal,
            grant=grant,
            owner_kind="finance_expense",
            owner_id=expense_id,
            source=BytesIO(_PNG),
            filename="proof.png",
            content_type="image/png",
            storage=working_storage,
            max_bytes=1024,
        )
    assert integrity.value.parameter == "file"
    working_storage.delete.assert_called_once()
    session.rollback.assert_called()

    repository.add.side_effect = None
    request_id = uuid7()
    session.get.side_effect = lambda model, pk: SimpleNamespace(
        workspace_id=workspace_id,
        record_status="active",
        branch_id=None,
        quote_file_name=None,
        id=request_id,
    )
    working_storage.save.return_value = StoredBlob(
        storage_key=f"{workspace_id}/documents/purchase_request/{request_id}/file.pdf",
        size_bytes=len(_PDF),
        checksum_sha256="def",
    )
    stored = service.upload(
        principal=principal,
        grant=grant,
        owner_kind="purchase_request",
        owner_id=request_id,
        source=BytesIO(_PDF),
        filename="cotizacion.pdf",
        content_type="application/pdf",
        storage=working_storage,
        max_bytes=1024,
    )
    assert stored.record.preview_url.endswith("/content")
    purchase_request = session.get.call_args[0][1]
    assert purchase_request == request_id
