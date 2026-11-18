from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any, BinaryIO
from uuid import UUID, uuid7

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models import Customer, PortalTaskCompletion, PortalTaskTemplate
from app.schemas.portal_tasks import DEFAULT_CHECKBOX_LABEL
from app.services.attachment_storage import (
    AttachmentContentMismatchError,
    AttachmentStorage,
    AttachmentTooLargeError,
)
from app.services.authorization import PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.master_data import MasterDataService
from app.services.public_booking import PublicBookingService

_PDF = "application/pdf"
_EXTENSION = ".pdf"
_SAFE_NAME = re.compile(r"[^a-zA-Z0-9._-]+")


def _safe_filename(name: str) -> str:
    base = (name or "documento.pdf").strip()
    cleaned = _SAFE_NAME.sub("_", base)
    if not cleaned.lower().endswith(".pdf"):
        cleaned = f"{cleaned}.pdf"
    return cleaned[:255]


class PortalTaskService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_templates(self, workspace_id: UUID) -> list[PortalTaskTemplate]:
        return list(
            self._session.scalars(
                select(PortalTaskTemplate)
                .where(PortalTaskTemplate.workspace_id == workspace_id)
                .order_by(PortalTaskTemplate.created_at.desc())
            ).all()
        )

    def get_template(self, workspace_id: UUID, template_id: UUID) -> PortalTaskTemplate:
        row = self._session.scalar(
            select(PortalTaskTemplate).where(
                PortalTaskTemplate.workspace_id == workspace_id,
                PortalTaskTemplate.id == template_id,
            )
        )
        if row is None:
            raise ResourceNotFoundError("La plantilla no existe.", "templateId")
        return row

    def create_template(
        self,
        *,
        grant: PermissionGrant,
        principal_platform_user_id: UUID,
        source: BinaryIO,
        original_filename: str,
        content_type: str,
        title: str,
        checkbox_label: str | None,
        is_default_for_all: bool,
        storage: AttachmentStorage,
        max_bytes: int,
    ) -> PortalTaskTemplate:
        if content_type != _PDF:
            raise InvalidOperationError("Solo se permiten archivos PDF.", "file")
        template_id = uuid7()
        storage_key = f"{grant.workspace_id}/portal-tasks/{template_id}{_EXTENSION}"
        filename = _safe_filename(original_filename)
        try:
            blob = storage.save(
                source,
                storage_key=storage_key,
                content_type=content_type,
                max_bytes=max_bytes,
            )
        except AttachmentTooLargeError as exc:
            raise InvalidOperationError("El archivo excede el tamaño permitido.", "file") from exc
        except AttachmentContentMismatchError as exc:
            raise InvalidOperationError(
                "El contenido no coincide con el tipo declarado.", "file"
            ) from exc

        template = PortalTaskTemplate(
            id=template_id,
            workspace_id=grant.workspace_id,
            title=title.strip(),
            checkbox_label=(checkbox_label or DEFAULT_CHECKBOX_LABEL).strip(),
            kind="consent_document",
            is_default_for_all=is_default_for_all,
            is_active=True,
            original_filename=filename,
            storage_key=blob.storage_key,
            content_type=content_type,
            size_bytes=blob.size_bytes,
            checksum_sha256=blob.checksum_sha256,
            created_by_platform_user_id=principal_platform_user_id,
        )
        self._session.add(template)
        try:
            self._session.commit()
            self._session.refresh(template)
            return template
        except Exception:
            self._session.rollback()
            storage.delete(storage_key)
            raise

    def update_template(
        self,
        *,
        grant: PermissionGrant,
        template_id: UUID,
        payload: dict[str, Any],
        storage: AttachmentStorage,
        max_bytes: int,
        file: tuple[BinaryIO, str, str] | None = None,
    ) -> PortalTaskTemplate:
        template = self.get_template(grant.workspace_id, template_id)
        if payload.get("title") is not None:
            template.title = str(payload["title"]).strip()
        if payload.get("checkbox_label") is not None:
            template.checkbox_label = str(payload["checkbox_label"]).strip()
        if payload.get("is_default_for_all") is not None:
            template.is_default_for_all = bool(payload["is_default_for_all"])
        if payload.get("is_active") is not None:
            template.is_active = bool(payload["is_active"])

        old_key = template.storage_key
        if file is not None:
            source, original_filename, content_type = file
            if content_type != _PDF:
                raise InvalidOperationError("Solo se permiten archivos PDF.", "file")
            storage_key = f"{grant.workspace_id}/portal-tasks/{template.id}{_EXTENSION}"
            try:
                blob = storage.save(
                    source,
                    storage_key=storage_key,
                    content_type=content_type,
                    max_bytes=max_bytes,
                )
            except AttachmentTooLargeError as exc:
                raise InvalidOperationError(
                    "El archivo excede el tamaño permitido.", "file"
                ) from exc
            except AttachmentContentMismatchError as exc:
                raise InvalidOperationError(
                    "El contenido no coincide con el tipo declarado.", "file"
                ) from exc
            template.original_filename = _safe_filename(original_filename)
            template.storage_key = blob.storage_key
            template.content_type = content_type
            template.size_bytes = blob.size_bytes
            template.checksum_sha256 = blob.checksum_sha256

        self._session.commit()
        self._session.refresh(template)
        if file is not None and old_key != template.storage_key:
            storage.delete(old_key)
        return template

    def customer_task_status(
        self,
        *,
        grant: PermissionGrant,
        customer_id: UUID,
    ) -> list[dict[str, Any]]:
        MasterDataService(self._session).get_customer(grant, customer_id)
        templates = self._session.scalars(
            select(PortalTaskTemplate).where(
                PortalTaskTemplate.workspace_id == grant.workspace_id,
                PortalTaskTemplate.is_default_for_all.is_(True),
            )
        ).all()
        if not templates:
            return []
        template_ids = [row.id for row in templates]
        completions = {
            row.template_id: row
            for row in self._session.scalars(
                select(PortalTaskCompletion).where(
                    PortalTaskCompletion.workspace_id == grant.workspace_id,
                    PortalTaskCompletion.customer_id == customer_id,
                    PortalTaskCompletion.template_id.in_(template_ids),
                )
            ).all()
        }
        items: list[dict[str, Any]] = []
        for template in sorted(templates, key=lambda item: item.created_at):
            completion = completions.get(template.id)
            items.append(
                {
                    "template_id": template.id,
                    "title": template.title,
                    "checkbox_label": template.checkbox_label,
                    "kind": template.kind,
                    "is_active": template.is_active,
                    "is_default_for_all": template.is_default_for_all,
                    "accepted_at": completion.accepted_at if completion else None,
                }
            )
        return items

    def list_public_tasks(
        self,
        branch_id: UUID,
        document_type: str,
        document_id: str,
    ) -> list[dict[str, Any]]:
        booking = PublicBookingService(self._session)
        branch, _workspace = booking._resolve_branch(branch_id)
        customer = self._customer_for_document(branch.workspace_id, document_type, document_id)
        if customer is None:
            return []
        templates = self._session.scalars(
            select(PortalTaskTemplate)
            .where(
                PortalTaskTemplate.workspace_id == branch.workspace_id,
                PortalTaskTemplate.is_default_for_all.is_(True),
                PortalTaskTemplate.is_active.is_(True),
            )
            .order_by(PortalTaskTemplate.created_at)
        ).all()
        if not templates:
            return []
        template_ids = [row.id for row in templates]
        completions = {
            row.template_id: row.accepted_at
            for row in self._session.scalars(
                select(PortalTaskCompletion).where(
                    PortalTaskCompletion.workspace_id == branch.workspace_id,
                    PortalTaskCompletion.customer_id == customer.id,
                    PortalTaskCompletion.template_id.in_(template_ids),
                )
            ).all()
        }
        return [
            {
                "id": row.id,
                "title": row.title,
                "checkbox_label": row.checkbox_label,
                "kind": row.kind,
                "has_pdf": True,
                "accepted_at": completions.get(row.id),
            }
            for row in templates
        ]

    def public_task_pdf(
        self,
        branch_id: UUID,
        template_id: UUID,
        document_type: str,
        document_id: str,
        storage: AttachmentStorage,
    ) -> PortalTaskTemplate:
        booking = PublicBookingService(self._session)
        branch, _workspace = booking._resolve_branch(branch_id)
        customer = self._customer_for_document(branch.workspace_id, document_type, document_id)
        if customer is None:
            raise AuthorizationError("No tienes acceso a este documento.", "templateId")
        template = self._session.scalar(
            select(PortalTaskTemplate).where(
                PortalTaskTemplate.workspace_id == branch.workspace_id,
                PortalTaskTemplate.id == template_id,
                PortalTaskTemplate.is_default_for_all.is_(True),
                PortalTaskTemplate.is_active.is_(True),
            )
        )
        if template is None:
            raise ResourceNotFoundError("El documento no existe.", "templateId")
        _ = storage
        return template

    def accept_public_task(
        self,
        branch_id: UUID,
        template_id: UUID,
        document_type: str,
        document_id: str,
        *,
        accepted: bool,
    ) -> dict[str, Any]:
        if not accepted:
            raise ConflictError(
                "No se puede revertir una aceptación.",
                "accepted",
            )
        booking = PublicBookingService(self._session)
        branch, _workspace = booking._resolve_branch(branch_id)
        customer = self._customer_for_document(branch.workspace_id, document_type, document_id)
        if customer is None:
            raise AuthorizationError("No se pudo registrar la aceptación.", "documentId")
        template = self._session.scalar(
            select(PortalTaskTemplate).where(
                PortalTaskTemplate.workspace_id == branch.workspace_id,
                PortalTaskTemplate.id == template_id,
                PortalTaskTemplate.is_default_for_all.is_(True),
                PortalTaskTemplate.is_active.is_(True),
            )
        )
        if template is None:
            raise ResourceNotFoundError("La tarea no existe.", "templateId")

        existing = self._session.scalar(
            select(PortalTaskCompletion).where(
                PortalTaskCompletion.workspace_id == branch.workspace_id,
                PortalTaskCompletion.template_id == template_id,
                PortalTaskCompletion.customer_id == customer.id,
            )
        )
        if existing is not None:
            return {"template_id": template_id, "accepted_at": existing.accepted_at}

        now = datetime.now(UTC)
        completion = PortalTaskCompletion(
            workspace_id=branch.workspace_id,
            template_id=template_id,
            customer_id=customer.id,
            accepted_at=now,
        )
        self._session.add(completion)
        self._session.commit()
        _ = get_request_id()
        return {"template_id": template_id, "accepted_at": now}

    def read_pdf_bytes(self, storage: AttachmentStorage, template: PortalTaskTemplate) -> bytes:
        handle = storage.open(template.storage_key)
        try:
            return handle.read()
        finally:
            handle.close()

    def _customer_for_document(
        self, workspace_id: UUID, document_type: str, document_id: str
    ) -> Customer | None:
        booking = PublicBookingService(self._session)
        normalized = booking._normalized_document(document_type, document_id)
        return booking._master_data.customer_by_document(workspace_id, normalized)
