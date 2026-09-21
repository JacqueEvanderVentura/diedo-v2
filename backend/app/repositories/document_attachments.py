from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.document_attachments import DocumentAttachment

OwnerKind = Literal[
    "finance_expense",
    "finance_fixed_expense",
    "finance_manual_income",
    "cash_movement",
    "purchase_request",
]


@dataclass(frozen=True)
class DocumentAttachmentRecord:
    attachment: DocumentAttachment
    preview_url: str


def _owner_column(kind: OwnerKind) -> Any:
    return {
        "finance_expense": DocumentAttachment.finance_expense_id,
        "finance_fixed_expense": DocumentAttachment.finance_fixed_expense_id,
        "finance_manual_income": DocumentAttachment.finance_manual_income_id,
        "cash_movement": DocumentAttachment.cash_movement_id,
        "purchase_request": DocumentAttachment.purchase_request_id,
    }[kind]


def _preview_url(attachment: DocumentAttachment) -> str:
    return f"/api/v1/document-attachments/{attachment.id}/content"


class DocumentAttachmentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_for_owner(
        self,
        workspace_id: UUID,
        owner_kind: OwnerKind,
        owner_id: UUID,
    ) -> tuple[DocumentAttachmentRecord, ...]:
        column = _owner_column(owner_kind)
        rows = self._session.scalars(
            select(DocumentAttachment)
            .where(
                DocumentAttachment.workspace_id == workspace_id,
                column == owner_id,
            )
            .order_by(DocumentAttachment.created_at.asc(), DocumentAttachment.id.asc())
        ).all()
        return tuple(
            DocumentAttachmentRecord(attachment=row, preview_url=_preview_url(row)) for row in rows
        )

    def list_for_owners(
        self,
        workspace_id: UUID,
        owner_kind: OwnerKind,
        owner_ids: set[UUID],
    ) -> dict[UUID, tuple[DocumentAttachmentRecord, ...]]:
        if not owner_ids:
            return {}
        column = _owner_column(owner_kind)
        rows = self._session.scalars(
            select(DocumentAttachment)
            .where(
                DocumentAttachment.workspace_id == workspace_id,
                column.in_(owner_ids),
            )
            .order_by(DocumentAttachment.created_at.asc(), DocumentAttachment.id.asc())
        ).all()
        attr = {
            "finance_expense": "finance_expense_id",
            "finance_fixed_expense": "finance_fixed_expense_id",
            "finance_manual_income": "finance_manual_income_id",
            "cash_movement": "cash_movement_id",
            "purchase_request": "purchase_request_id",
        }[owner_kind]
        grouped: dict[UUID, list[DocumentAttachmentRecord]] = defaultdict(list)
        for row in rows:
            grouped[getattr(row, attr)].append(
                DocumentAttachmentRecord(attachment=row, preview_url=_preview_url(row))
            )
        return {key: tuple(value) for key, value in grouped.items()}

    def get(self, workspace_id: UUID, attachment_id: UUID) -> DocumentAttachment | None:
        return self._session.scalar(
            select(DocumentAttachment).where(
                DocumentAttachment.workspace_id == workspace_id,
                DocumentAttachment.id == attachment_id,
            )
        )

    def add(self, attachment: DocumentAttachment) -> DocumentAttachment:
        self._session.add(attachment)
        self._session.flush()
        return attachment
