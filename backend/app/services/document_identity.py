from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.repositories.crm import CrmRepository
from app.repositories.master_data import MasterDataRepository
from app.services.customer_documents import prepare_customer_document_fields
from app.services.errors import ConflictError


def assert_document_available_in_workspace(
    session: Session,
    *,
    workspace_id: UUID,
    normalized_document_id: str,
    exclude_customer_id: UUID | None = None,
    exclude_lead_id: UUID | None = None,
) -> None:
    master_data = MasterDataRepository(session)
    existing_customer = master_data.customer_by_document(workspace_id, normalized_document_id)
    if existing_customer is not None and existing_customer.id != exclude_customer_id:
        raise ConflictError(
            "Ya existe un cliente con ese documento en el workspace.",
            "documentId",
        )
    crm = CrmRepository(session)
    existing_lead = crm.lead_by_document(
        workspace_id,
        normalized_document_id,
        exclude_lead_id=exclude_lead_id,
    )
    if existing_lead is not None:
        raise ConflictError(
            "Ya existe un lead abierto con ese documento en el workspace.",
            "documentId",
        )


def prepare_optional_document_values(
    document_type: str | None,
    document_id: str | None,
) -> dict[str, str | None]:
    if document_type is None and document_id is None:
        return {
            "document_type": None,
            "document_id": None,
            "normalized_document_id": None,
        }
    try:
        normalized_type, display_id, normalized_id = prepare_customer_document_fields(
            document_type, document_id
        )
    except ValueError as exc:
        from app.services.errors import InvalidOperationError

        raise InvalidOperationError(str(exc), "documentId") from exc
    return {
        "document_type": normalized_type,
        "document_id": display_id,
        "normalized_document_id": normalized_id,
    }


def require_document_pair(document_type: str | None, document_id: str | None) -> None:
    from app.services.errors import InvalidOperationError

    if not document_type or not document_id:
        raise InvalidOperationError(
            "El documento de identidad es obligatorio.",
            "documentId",
        )
