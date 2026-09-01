from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date
from typing import Any, cast
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.repositories.incidents import (
    IncidentAttachmentContentRecord,
    IncidentPage,
    IncidentRecord,
    IncidentRepository,
    IncidentStatsRecord,
    NewIncidentImage,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import (
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)

_IMAGE_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
}
_STATUS_LABELS = {
    "abierta": "abierta",
    "en_proceso": "en proceso",
    "resuelta": "resuelta",
    "cerrada": "cerrada",
}


@dataclass(frozen=True)
class IncidentImageInput:
    filename: str
    content_type: str
    content: bytes


class IncidentService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = IncidentRepository(session)

    def list_incidents(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        incident_type: str | None,
        priority: str | None,
        status: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> IncidentPage:
        self._require_visible_branch(grant, branch_id)
        if date_from is not None and date_to is not None and date_to < date_from:
            raise InvalidOperationError(
                "La fecha final no puede ser anterior a la inicial.", "dateTo"
            )
        return self._repository.list_incidents(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            incident_type=incident_type,
            priority=priority,
            status=status,
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def incident_stats(self, grant: PermissionGrant, branch_id: UUID | None) -> IncidentStatsRecord:
        self._require_visible_branch(grant, branch_id)
        return self._repository.incident_stats(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )

    def get_incident(self, grant: PermissionGrant, incident_id: UUID) -> IncidentRecord:
        record = self._repository.get_incident(
            workspace_id=grant.workspace_id,
            incident_id=incident_id,
            visible_branch_ids=grant.allowed_branch_ids,
        )
        if record is None:
            raise ResourceNotFoundError("La incidencia no existe.", "incidentId")
        return record

    def create_incident(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> IncidentRecord:
        fingerprint = self._fingerprint(values)
        existing = self._repository.incident_by_creation_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            if existing[1] != fingerprint:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.", "Idempotency-Key"
                )
            return self.get_incident(grant, existing[0])

        branch_id = cast(UUID, values["branch_id"])
        self._require_visible_branch(grant, branch_id)
        if self._repository.get_active_branch(grant.workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        incident_type = cast(str, values["incident_type"])
        asset_id = cast(UUID | None, values.get("asset_id"))
        if incident_type != "activo" and asset_id is not None:
            raise InvalidOperationError(
                "Solo una incidencia de activo puede relacionar una maquinaria o equipo.",
                "activoId",
            )
        if (
            asset_id is not None
            and self._repository.active_asset_in_branch(grant.workspace_id, branch_id, asset_id)
            is None
        ):
            raise ResourceNotFoundError(
                "El activo no existe, está dado de baja o no pertenece a la sucursal.",
                "activoId",
            )
        participant_ids = set(cast(list[UUID], values.pop("participant_ids")))
        participant_names = self._repository.active_participant_names(
            grant.workspace_id, participant_ids
        )
        if set(participant_names) != participant_ids:
            raise ResourceNotFoundError(
                "Uno o más intervinientes no existen o no están activos.",
                "participantIds",
            )
        try:
            incident_id = self._repository.create_incident(
                workspace_id=grant.workspace_id,
                reporter_membership_id=principal.membership_id,
                reporter_name=principal.display_name,
                actor_platform_user_id=principal.platform_user_id,
                values=values,
                participant_names=participant_names,
                idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_incident(grant, incident_id)
        except IntegrityError as exc:
            self._session.rollback()
            existing = self._repository.incident_by_creation_key(
                grant.workspace_id, idempotency_key
            )
            if existing is not None:
                if existing[1] != fingerprint:
                    raise ConflictError(
                        "Idempotency-Key ya fue usado con otro contenido.",
                        "Idempotency-Key",
                    ) from exc
                return self.get_incident(grant, existing[0])
            raise ConflictError(
                "No se pudo crear la incidencia por un conflicto de datos."
            ) from exc

    def update_status(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        incident_id: UUID,
        status: str,
        expected_version: int,
    ) -> IncidentRecord:
        incident = self._locked_visible_incident(grant, incident_id)
        self._require_version(incident.version, expected_version)
        if incident.status == status:
            raise InvalidOperationError("La incidencia ya tiene ese estado.", "status")
        try:
            self._repository.update_status(
                incident=incident,
                status=status,
                status_label=_STATUS_LABELS[status],
                actor_membership_id=principal.membership_id,
                actor_platform_user_id=principal.platform_user_id,
                actor_name=principal.display_name,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_incident(grant, incident.id)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo actualizar la incidencia.") from exc

    def add_comment(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        incident_id: UUID,
        message: str,
        expected_version: int,
    ) -> IncidentRecord:
        incident = self._locked_visible_incident(grant, incident_id)
        self._require_version(incident.version, expected_version)
        try:
            self._repository.add_comment(
                incident=incident,
                message=message,
                actor_membership_id=principal.membership_id,
                actor_platform_user_id=principal.platform_user_id,
                actor_name=principal.display_name,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_incident(grant, incident.id)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo agregar el comentario.") from exc

    def add_images(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        incident_id: UUID,
        expected_version: int,
        inputs: tuple[IncidentImageInput, ...],
        max_files: int,
        max_bytes: int,
    ) -> IncidentRecord:
        if not inputs:
            raise InvalidOperationError("Adjunta al menos una imagen.", "files")
        if len(inputs) > max_files:
            raise InvalidOperationError(
                f"Puedes adjuntar un máximo de {max_files} imágenes por solicitud.",
                "files",
            )
        images = tuple(self._validate_image(item, max_bytes) for item in inputs)
        incident = self._locked_visible_incident(grant, incident_id)
        self._require_version(incident.version, expected_version)
        try:
            self._repository.add_attachments(
                incident=incident,
                images=images,
                actor_membership_id=principal.membership_id,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_incident(grant, incident.id)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudieron guardar las imágenes.") from exc

    def get_attachment_content(
        self,
        *,
        grant: PermissionGrant,
        incident_id: UUID,
        attachment_id: UUID,
    ) -> IncidentAttachmentContentRecord:
        record = self._repository.get_attachment_content(
            workspace_id=grant.workspace_id,
            incident_id=incident_id,
            attachment_id=attachment_id,
            visible_branch_ids=grant.allowed_branch_ids,
        )
        if record is None:
            raise ResourceNotFoundError("La imagen adjunta no existe.", "attachmentId")
        return record

    def _locked_visible_incident(self, grant: PermissionGrant, incident_id: UUID) -> Any:
        incident = self._repository.get_incident_for_update(grant.workspace_id, incident_id)
        if incident is None:
            raise ResourceNotFoundError("La incidencia no existe.", "incidentId")
        self._require_visible_branch(grant, incident.branch_id)
        return incident

    @staticmethod
    def _validate_image(item: IncidentImageInput, max_bytes: int) -> NewIncidentImage:
        content_type = item.content_type.casefold().split(";", 1)[0].strip()
        if content_type not in {*_IMAGE_SIGNATURES, "image/webp"}:
            raise InvalidOperationError("Formato no permitido. Usa JPG, PNG, WEBP o GIF.", "files")
        if not item.content:
            raise InvalidOperationError("La imagen está vacía.", "files")
        if len(item.content) > max_bytes:
            raise InvalidOperationError(
                f"Cada imagen debe pesar como máximo {max_bytes // (1024 * 1024)} MB.",
                "files",
            )
        valid_signature = (
            item.content.startswith(_IMAGE_SIGNATURES[content_type])
            if content_type in _IMAGE_SIGNATURES
            else item.content.startswith(b"RIFF")
            and len(item.content) >= 12
            and item.content[8:12] == b"WEBP"
        )
        if not valid_signature:
            raise InvalidOperationError(
                "El contenido no coincide con el formato de imagen declarado.", "files"
            )
        filename = re.split(r"[\\/]", item.filename or "imagen")[-1]
        filename = "".join(char for char in filename if char.isprintable()).strip()[:255]
        if not filename:
            filename = "imagen"
        return NewIncidentImage(
            original_filename=filename,
            content_type=content_type,
            content=item.content,
            checksum_sha256=hashlib.sha256(item.content).hexdigest(),
        )

    @staticmethod
    def _require_visible_branch(grant: PermissionGrant, branch_id: UUID | None) -> None:
        if (
            branch_id is not None
            and grant.allowed_branch_ids is not None
            and branch_id not in grant.allowed_branch_ids
        ):
            raise ResourceNotFoundError(
                "La sucursal no existe o no está dentro de tu alcance.", "branchId"
            )

    @staticmethod
    def _require_version(current: int, expected: int) -> None:
        if current != expected:
            raise ConflictError(
                "La incidencia cambió; vuelve a cargarla antes de guardar.", "version"
            )

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized or None

    @staticmethod
    def _fingerprint(values: dict[str, Any]) -> str:
        payload = json.dumps(
            values,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def page_count(total_items: int, page_size: int) -> int:
    return (total_items + page_size - 1) // page_size if total_items else 0
