from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import BinaryIO
from uuid import UUID, uuid7

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models.document_attachments import DocumentAttachment
from app.db.models.finance import FinanceExpense, FinanceFixedExpense, FinanceManualIncome
from app.db.models.pos import CashMovement
from app.db.models.purchasing import PurchaseRequest
from app.repositories.document_attachments import (
    DocumentAttachmentRecord,
    DocumentAttachmentRepository,
    OwnerKind,
)
from app.services.attachment_storage import (
    AttachmentContentMismatchError,
    AttachmentStorage,
    AttachmentTooLargeError,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import InvalidOperationError, ResourceNotFoundError

_ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def _safe_filename(filename: str | None) -> str:
    base = (filename or "adjunto").strip() or "adjunto"
    return re.sub(r"[^\w.\- ]+", "_", base)[:255]


@dataclass(frozen=True)
class StoredDocumentAttachment:
    record: DocumentAttachmentRecord


class DocumentAttachmentService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = DocumentAttachmentRepository(session)

    def list_for_owner(
        self,
        grant: PermissionGrant,
        owner_kind: OwnerKind,
        owner_id: UUID,
    ) -> tuple[DocumentAttachmentRecord, ...]:
        self._require_owner(grant, owner_kind, owner_id)
        return self._repository.list_for_owner(grant.workspace_id, owner_kind, owner_id)

    def attachments_by_owners(
        self,
        workspace_id: UUID,
        owner_kind: OwnerKind,
        owner_ids: set[UUID],
    ) -> dict[UUID, tuple[DocumentAttachmentRecord, ...]]:
        return self._repository.list_for_owners(workspace_id, owner_kind, owner_ids)

    def upload(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        owner_kind: OwnerKind,
        owner_id: UUID,
        source: BinaryIO,
        filename: str | None,
        content_type: str | None,
        storage: AttachmentStorage,
        max_bytes: int,
    ) -> StoredDocumentAttachment:
        self._require_owner(grant, owner_kind, owner_id)
        normalized_type = self._content_type(content_type)
        self._digest(source, max_bytes=max_bytes)
        attachment_id = uuid7()
        extension = _ALLOWED_TYPES[normalized_type]
        storage_key = (
            f"{grant.workspace_id}/documents/{owner_kind}/{owner_id}/{attachment_id}{extension}"
        )
        try:
            blob = storage.save(
                source,
                storage_key=storage_key,
                content_type=normalized_type,
                max_bytes=max_bytes,
            )
        except AttachmentTooLargeError as exc:
            raise InvalidOperationError("El archivo excede el tamaño permitido.", "file") from exc
        except AttachmentContentMismatchError as exc:
            raise InvalidOperationError(
                "El contenido no coincide con el tipo declarado.", "file"
            ) from exc

        owner_kwargs = {
            "finance_expense": {"finance_expense_id": owner_id},
            "finance_fixed_expense": {"finance_fixed_expense_id": owner_id},
            "finance_manual_income": {"finance_manual_income_id": owner_id},
            "cash_movement": {"cash_movement_id": owner_id},
            "purchase_request": {"purchase_request_id": owner_id},
        }[owner_kind]

        attachment = DocumentAttachment(
            id=attachment_id,
            workspace_id=grant.workspace_id,
            original_filename=_safe_filename(filename),
            storage_key=blob.storage_key,
            content_type=normalized_type,
            size_bytes=blob.size_bytes,
            checksum_sha256=blob.checksum_sha256,
            uploaded_by_platform_user_id=principal.platform_user_id,
            **owner_kwargs,
        )
        try:
            self._repository.add(attachment)
            if owner_kind == "purchase_request":
                request = self._session.get(PurchaseRequest, owner_id)
                if request is not None and request.workspace_id == grant.workspace_id:
                    request.quote_file_name = attachment.original_filename
            self._session.commit()
        except IntegrityError:
            self._session.rollback()
            storage.delete(storage_key)
            raise InvalidOperationError("No se pudo guardar el adjunto.", "file") from None
        except Exception:
            self._session.rollback()
            storage.delete(storage_key)
            raise

        record = DocumentAttachmentRecord(
            attachment=attachment,
            preview_url=f"/api/v1/document-attachments/{attachment.id}/content",
        )
        return StoredDocumentAttachment(record=record)

    def get_content(
        self,
        grant: PermissionGrant,
        attachment_id: UUID,
    ) -> DocumentAttachment:
        attachment = self._repository.get(grant.workspace_id, attachment_id)
        if attachment is None:
            raise ResourceNotFoundError("El adjunto no existe.", "attachmentId")
        if attachment.finance_expense_id is not None:
            self._require_owner(grant, "finance_expense", attachment.finance_expense_id)
        elif attachment.finance_fixed_expense_id is not None:
            self._require_owner(grant, "finance_fixed_expense", attachment.finance_fixed_expense_id)
        elif attachment.finance_manual_income_id is not None:
            self._require_owner(grant, "finance_manual_income", attachment.finance_manual_income_id)
        elif attachment.cash_movement_id is not None:
            self._require_owner(grant, "cash_movement", attachment.cash_movement_id)
        elif attachment.purchase_request_id is not None:
            self._require_owner(grant, "purchase_request", attachment.purchase_request_id)
        return attachment

    def _require_owner(self, grant: PermissionGrant, owner_kind: OwnerKind, owner_id: UUID) -> None:
        branch_id: UUID | None = None
        if owner_kind == "finance_expense":
            expense = self._session.get(FinanceExpense, owner_id)
            if expense is None or expense.workspace_id != grant.workspace_id:
                raise ResourceNotFoundError("El gasto no existe.", "expenseId")
            if expense.record_status != "active":
                raise ResourceNotFoundError("El gasto no existe.", "expenseId")
            branch_id = expense.branch_id
        elif owner_kind == "finance_fixed_expense":
            fixed = self._session.get(FinanceFixedExpense, owner_id)
            if fixed is None or fixed.workspace_id != grant.workspace_id:
                raise ResourceNotFoundError("El gasto fijo no existe.", "fixedExpenseId")
            branch_id = fixed.branch_id
        elif owner_kind == "finance_manual_income":
            income = self._session.get(FinanceManualIncome, owner_id)
            if income is None or income.workspace_id != grant.workspace_id:
                raise ResourceNotFoundError("El ingreso no existe.", "incomeId")
            if income.record_status != "active":
                raise ResourceNotFoundError("El ingreso no existe.", "incomeId")
            branch_id = income.branch_id
        elif owner_kind == "cash_movement":
            movement = self._session.get(CashMovement, owner_id)
            if movement is None or movement.workspace_id != grant.workspace_id:
                raise ResourceNotFoundError("El movimiento no existe.", "movementId")
            branch_id = movement.branch_id
        elif owner_kind == "purchase_request":
            request = self._session.get(PurchaseRequest, owner_id)
            if request is None or request.workspace_id != grant.workspace_id:
                raise ResourceNotFoundError("La solicitud no existe.", "requestId")
            branch_id = request.branch_id

        if branch_id is not None and grant.allowed_branch_ids is not None:
            if branch_id not in grant.allowed_branch_ids:
                raise ResourceNotFoundError("El recurso no existe.", "ownerId")

    @staticmethod
    def _content_type(content_type: str | None) -> str:
        normalized = (content_type or "").split(";", 1)[0].strip().lower()
        if normalized not in _ALLOWED_TYPES:
            raise InvalidOperationError("Tipo de archivo no permitido.", "file")
        return normalized

    @staticmethod
    def _digest(source: BinaryIO, max_bytes: int) -> hashlib._Hash:
        digest = hashlib.sha256()
        total = 0
        while chunk := source.read(64 * 1024):
            total += len(chunk)
            if total > max_bytes:
                raise AttachmentTooLargeError
            digest.update(chunk)
        source.seek(0)
        return digest
