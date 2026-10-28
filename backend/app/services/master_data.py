from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from math import ceil
from pathlib import Path
from typing import Any, BinaryIO, cast
from uuid import UUID, uuid7

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.repositories.master_data import (
    AttachmentRecord,
    CustomerRecord,
    EmployeeRecord,
    MasterDataRepository,
    ScheduleRecord,
    TimelineRecord,
)
from app.services.attachment_storage import (
    AttachmentContentMismatchError,
    AttachmentStorage,
    AttachmentTooLargeError,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.customer_documents import prepare_customer_document_fields
from app.services.customer_import_merge import (
    build_customer_import_update_changes,
    customer_import_row_context,
    find_import_customer_matches,
    format_customer_import_update_summary,
    meaningful_customer_import_changes,
)
from app.services.document_identity import (
    assert_document_available_in_workspace,
    require_document_pair,
)
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)

_LABOR_CONTRACT = "labor_contract"
_EMPLOYEE_DOCUMENT_TYPES = frozenset({"cedula", "pasaporte"})
_EMPLOYEE_STATUS_LABELS = {"active": "activo", "inactive": "inactivo", "archived": "archivado"}
_ALLOWED_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


@dataclass(frozen=True)
class CustomerListResult:
    items: tuple[CustomerRecord, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


@dataclass(frozen=True)
class EmployeeListResult:
    items: tuple[EmployeeRecord, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


def normalize_name(value: str) -> str:
    return " ".join(value.split()).casefold()


def normalize_email(value: str | None) -> str | None:
    normalized = value.strip().casefold() if value else None
    return normalized or None


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    normalized = "".join(
        character for character in value if character.isdigit() or character == "+"
    )
    return normalized or None


class MasterDataService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = MasterDataRepository(session)

    def list_customers(
        self,
        *,
        grant: PermissionGrant,
        search: str | None,
        name: str | None,
        phone: str | None,
        email: str | None,
        document_id: str | None,
        document_type: str | None,
        customer_type: str | None,
        status: str | None,
        branch_id: UUID | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> CustomerListResult:
        self._require_filter_branch(grant, branch_id)
        normalized_document = None
        if document_id:
            from app.services.customer_documents import normalize_document_id

            normalized_document = normalize_document_id(document_type or "cedula", document_id)
        result = self._repository.list_customers(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            search=normalize_name(search) if search else None,
            name=normalize_name(name) if name else None,
            phone=normalize_phone(phone),
            email=normalize_email(email),
            document_id=normalized_document,
            customer_type=customer_type,
            status=status,
            branch_id=branch_id,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )
        return CustomerListResult(
            result.items,
            page,
            page_size,
            result.total_items,
            ceil(result.total_items / page_size) if result.total_items else 0,
        )

    def get_customer(self, grant: PermissionGrant, customer_id: UUID) -> CustomerRecord:
        customer = self._repository.get_customer(
            grant.workspace_id, customer_id, grant.allowed_branch_ids
        )
        if customer is None:
            raise ResourceNotFoundError("El cliente no existe.", "customerId")
        return self._repository.customer_record(customer)

    def import_customers(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        branch_ids: set[UUID],
        items: list[dict[str, object]],
    ) -> list[dict[str, object]]:
        self._validate_branches(grant, branch_ids)
        results: list[dict[str, object]] = []

        def result_row(
            *,
            external_id: object,
            customer_id: UUID | None,
            status: str,
            message: str | None,
            raw_row: dict[str, object],
        ) -> dict[str, object]:
            return {
                "external_id": external_id,
                "customer_id": customer_id,
                "status": status,
                "message": message,
                **customer_import_row_context(raw_row),
            }

        for raw in items:
            external_id = raw.get("external_id")
            try:
                existing_customers = find_import_customer_matches(
                    self._repository,
                    workspace_id=grant.workspace_id,
                    allowed_branch_ids=grant.allowed_branch_ids,
                    destination_branch_ids=branch_ids,
                    raw=raw,
                )
                if existing_customers:
                    updated_id: UUID | None = None
                    summaries: list[str] = []
                    last_customer_id = existing_customers[0].id
                    for existing_customer in existing_customers:
                        update_changes = meaningful_customer_import_changes(
                            build_customer_import_update_changes(existing_customer, raw)
                        )
                        self._repository.ensure_customer_branches(
                            grant.workspace_id,
                            existing_customer.id,
                            branch_ids,
                        )
                        if not update_changes:
                            last_customer_id = existing_customer.id
                            continue
                        summaries.append(
                            format_customer_import_update_summary(
                                existing_customer,
                                update_changes,
                            )
                        )
                        prepared_update = self._prepare_customer_values(update_changes)
                        normalized_doc = cast_optional_str(
                            prepared_update.get("normalized_document_id")
                        )
                        if normalized_doc:
                            assert_document_available_in_workspace(
                                self._session,
                                workspace_id=grant.workspace_id,
                                normalized_document_id=normalized_doc,
                                exclude_customer_id=existing_customer.id,
                            )
                        record = self._repository.update_customer(
                            customer=existing_customer,
                            changes=prepared_update,
                            branch_ids=None,
                            actor_platform_user_id=principal.platform_user_id,
                            request_id=get_request_id(),
                        )
                        updated_id = record.id
                    self._session.commit()
                    if updated_id is not None:
                        results.append(
                            result_row(
                                external_id=external_id,
                                customer_id=updated_id,
                                status="updated",
                                message="; ".join(summaries)
                                or "Sucursal asignada al cliente existente.",
                                raw_row=raw,
                            )
                        )
                    else:
                        results.append(
                            result_row(
                                external_id=external_id,
                                customer_id=last_customer_id,
                                status="skipped",
                                message="Cliente existente sin cambios nuevos.",
                                raw_row=raw,
                            )
                        )
                    continue
                import_values: dict[str, object] = {
                    "customer_type": raw.get("customer_type", "person"),
                    "display_name": raw.get("display_name"),
                    "first_name": raw.get("first_name"),
                    "last_name": raw.get("last_name"),
                    "business_name": raw.get("business_name"),
                    "email": raw.get("email"),
                    "phone": raw.get("phone"),
                    "instagram_url": raw.get("instagram_url"),
                    "acquisition_source": raw.get("acquisition_source"),
                    "status": "active",
                }
                if raw.get("document_type") is not None or raw.get("document_id") is not None:
                    import_values["document_type"] = raw.get("document_type")
                    import_values["document_id"] = raw.get("document_id")
                prepared = self._prepare_customer_values(import_values)
                normalized_doc = cast_optional_str(prepared.get("normalized_document_id"))
                if normalized_doc:
                    assert_document_available_in_workspace(
                        self._session,
                        workspace_id=grant.workspace_id,
                        normalized_document_id=normalized_doc,
                    )
                record = self._repository.create_customer(
                    workspace_id=grant.workspace_id,
                    actor_platform_user_id=principal.platform_user_id,
                    values=prepared,
                    branch_ids=branch_ids,
                    request_id=get_request_id(),
                )
                self._session.commit()
                results.append(
                    result_row(
                        external_id=external_id,
                        customer_id=record.id,
                        status="created",
                        message=None,
                        raw_row=raw,
                    )
                )
            except Exception as exc:  # noqa: BLE001 - per-row import report
                self._session.rollback()
                results.append(
                    result_row(
                        external_id=external_id,
                        customer_id=None,
                        status="error",
                        message=str(exc),
                        raw_row=raw,
                    )
                )
        return results

    def create_customer(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, object],
        branch_ids: set[UUID],
    ) -> CustomerRecord:
        self._validate_branches(grant, branch_ids)
        require_document_pair(
            cast_optional_str(values.get("document_type")),
            cast_optional_str(values.get("document_id")),
        )
        prepared = self._prepare_customer_values(values)
        normalized_doc = cast_optional_str(prepared.get("normalized_document_id"))
        if normalized_doc:
            assert_document_available_in_workspace(
                self._session,
                workspace_id=grant.workspace_id,
                normalized_document_id=normalized_doc,
            )
        try:
            record = self._repository.create_customer(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                values=prepared,
                branch_ids=branch_ids,
                request_id=get_request_id(),
            )
            self._session.commit()
            return record
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "Ya existe un cliente con ese documento en el workspace.",
                "documentId",
            ) from exc

    def update_customer(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        customer_id: UUID,
        expected_version: int,
        changes: dict[str, object],
    ) -> CustomerRecord:
        customer = self._repository.get_customer(
            grant.workspace_id, customer_id, grant.allowed_branch_ids
        )
        if customer is None:
            raise ResourceNotFoundError("El cliente no existe.", "customerId")
        if customer.version != expected_version:
            raise ConflictError("El cliente cambió desde la última lectura.", "version")
        branch_ids_value = changes.pop("branch_ids", None)
        branch_ids = (
            set(cast(list[UUID], branch_ids_value)) if branch_ids_value is not None else None
        )
        if branch_ids is not None:
            self._validate_branches(grant, branch_ids)
        if customer.normalized_document_id is None and not (
            changes.get("document_type") and changes.get("document_id")
        ):
            raise InvalidOperationError(
                "El documento de identidad es obligatorio.",
                "documentId",
            )
        prepared = self._prepare_customer_values(changes)
        normalized_doc = cast_optional_str(
            prepared.get("normalized_document_id", customer.normalized_document_id)
        )
        if "normalized_document_id" in prepared and normalized_doc:
            assert_document_available_in_workspace(
                self._session,
                workspace_id=grant.workspace_id,
                normalized_document_id=normalized_doc,
                exclude_customer_id=customer.id,
            )
        try:
            record = self._repository.update_customer(
                customer=customer,
                changes=prepared,
                branch_ids=branch_ids,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return record
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "Ya existe un cliente con ese documento en el workspace.",
                "documentId",
            ) from exc

    def archive_customers(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        customer_ids: list[UUID],
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for customer_id in customer_ids:
            try:
                customer = self._repository.get_customer(
                    grant.workspace_id, customer_id, grant.allowed_branch_ids
                )
                if customer is None:
                    results.append(
                        {
                            "customer_id": customer_id,
                            "status": "error",
                            "message": "El cliente no existe o no tienes acceso.",
                        }
                    )
                    continue
                if customer.status == "archived":
                    results.append(
                        {
                            "customer_id": customer_id,
                            "status": "deleted",
                            "message": None,
                        }
                    )
                    continue
                self._repository.update_customer(
                    customer=customer,
                    changes={"status": "archived"},
                    branch_ids=None,
                    actor_platform_user_id=principal.platform_user_id,
                    request_id=get_request_id(),
                )
                self._session.commit()
                results.append(
                    {
                        "customer_id": customer_id,
                        "status": "deleted",
                        "message": None,
                    }
                )
            except Exception:
                self._session.rollback()
                results.append(
                    {
                        "customer_id": customer_id,
                        "status": "error",
                        "message": "No se pudo eliminar el cliente.",
                    }
                )
        return results

    def customer_timeline(
        self, grant: PermissionGrant, customer_id: UUID
    ) -> tuple[TimelineRecord, ...]:
        self.get_customer(grant, customer_id)
        return self._repository.customer_timeline(grant.workspace_id, customer_id)

    def list_employees(
        self,
        *,
        grant: PermissionGrant,
        principal: AuthPrincipal | None = None,
        search: str | None,
        status: str | None,
        branch_id: UUID | None,
        department: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EmployeeListResult:
        self._require_filter_branch(grant, branch_id)
        result = self._repository.list_employees(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            search=" ".join(search.split()) if search else None,
            status=status,
            branch_id=branch_id,
            department=" ".join(department.split()) if department else None,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
            include_labor_contract=self._can_read_labor_contract(principal),
        )
        return EmployeeListResult(
            result.items,
            page,
            page_size,
            result.total_items,
            ceil(result.total_items / page_size) if result.total_items else 0,
        )

    def get_employee(
        self,
        grant: PermissionGrant,
        employee_id: UUID,
        principal: AuthPrincipal | None = None,
    ) -> EmployeeRecord:
        employee = self._repository.get_employee(
            grant.workspace_id, employee_id, grant.allowed_branch_ids
        )
        if employee is None:
            raise ResourceNotFoundError("El empleado no existe.", "employeeId")
        return self._repository.employee_record(
            employee, include_labor_contract=self._can_read_labor_contract(principal)
        )

    def create_employee(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, object],
        branch_ids: set[UUID],
        supervisor_ids: set[UUID],
        timezone: str,
        weekly_schedule: dict[str, Any],
    ) -> EmployeeRecord:
        self._validate_branches(grant, branch_ids)
        self._validate_supervisors(grant, supervisor_ids)
        prepared = self._prepare_employee_values(grant.workspace_id, values)
        number = prepared.get("employee_number")
        if not number:
            prepared["employee_number"] = f"EMP-{uuid7().hex[:10].upper()}"
        self._validate_employee_uniques(grant.workspace_id, prepared)
        try:
            record = self._repository.create_employee(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                values=prepared,
                branch_ids=branch_ids,
                supervisor_ids=supervisor_ids,
                timezone=timezone,
                weekly_schedule=weekly_schedule,
                request_id=get_request_id(),
            )
            self._session.commit()
            return record
        except IntegrityError as exc:
            self._session.rollback()
            raise self._employee_integrity_error(exc, "No fue posible crear el empleado.") from exc

    def update_employee(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        employee_id: UUID,
        expected_version: int,
        changes: dict[str, object],
    ) -> EmployeeRecord:
        employee = self._repository.get_employee(
            grant.workspace_id, employee_id, grant.allowed_branch_ids
        )
        if employee is None:
            raise ResourceNotFoundError("El empleado no existe.", "employeeId")
        if employee.version != expected_version:
            raise ConflictError("El empleado cambió desde la última lectura.", "version")
        branch_ids_value = changes.pop("branch_ids", None)
        supervisor_ids_value = changes.pop("supervisor_ids", None)
        branch_ids = (
            set(cast(list[UUID], branch_ids_value)) if branch_ids_value is not None else None
        )
        supervisor_ids = (
            set(cast(list[UUID], supervisor_ids_value))
            if supervisor_ids_value is not None
            else None
        )
        if branch_ids is not None:
            self._validate_branches(grant, branch_ids)
        if supervisor_ids is not None:
            if employee_id in supervisor_ids:
                raise ConflictError(
                    "Un empleado no puede supervisarse a sí mismo.", "supervisorIds"
                )
            self._validate_supervisors(grant, supervisor_ids)
        if "first_name" in changes or "last_name" in changes:
            changes["normalized_name"] = normalize_name(
                f"{changes.get('first_name', employee.first_name)} "
                f"{changes.get('last_name', employee.last_name)}"
            )
        prepared = self._prepare_employee_values(grant.workspace_id, changes)
        if prepared.get("status", employee.status) == "archived":
            prepared["platform_user_id"] = None
        self._validate_employee_uniques(grant.workspace_id, prepared, exclude_id=employee_id)
        try:
            record = self._repository.update_employee(
                employee=employee,
                changes=prepared,
                branch_ids=branch_ids,
                supervisor_ids=supervisor_ids,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return record
        except IntegrityError as exc:
            self._session.rollback()
            raise self._employee_integrity_error(
                exc, "No fue posible actualizar el empleado."
            ) from exc

    def get_schedule(self, grant: PermissionGrant, employee_id: UUID) -> ScheduleRecord:
        self.get_employee(grant, employee_id)
        schedule = self._repository.get_schedule(grant.workspace_id, employee_id)
        if schedule is None:
            raise ResourceNotFoundError("El horario del empleado no existe.", "employeeId")
        return self._repository.schedule_record(schedule)

    def update_schedule(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        employee_id: UUID,
        expected_version: int,
        timezone: str,
        weekly_schedule: dict[str, Any],
    ) -> ScheduleRecord:
        self.get_employee(grant, employee_id)
        schedule = self._repository.get_schedule(grant.workspace_id, employee_id)
        if schedule is None:
            raise ResourceNotFoundError("El horario del empleado no existe.", "employeeId")
        if schedule.version != expected_version:
            raise ConflictError("El horario cambió desde la última lectura.", "version")
        record = self._repository.update_schedule(
            schedule=schedule,
            timezone=timezone,
            weekly_schedule=weekly_schedule,
            actor_platform_user_id=principal.platform_user_id,
            request_id=get_request_id(),
        )
        self._session.commit()
        return record

    def list_attachments(
        self,
        grant: PermissionGrant,
        owner_type: str,
        owner_id: UUID,
        principal: AuthPrincipal | None = None,
    ) -> tuple[AttachmentRecord, ...]:
        self._require_owner(grant, owner_type, owner_id)
        records = self._repository.list_attachments(grant.workspace_id, owner_type, owner_id)
        if owner_type != "employee" or self._can_read_labor_contract(principal):
            return records
        return tuple(item for item in records if item.classification != _LABOR_CONTRACT)

    def upload_attachment(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        owner_type: str,
        owner_id: UUID,
        source: BinaryIO,
        original_filename: str,
        content_type: str,
        classification: str,
        retention_until: date | None,
        storage: AttachmentStorage,
        max_bytes: int,
    ) -> AttachmentRecord:
        self._require_owner(grant, owner_type, owner_id)
        if retention_until is not None and retention_until < date.today():
            raise InvalidOperationError(
                "La fecha de retención no puede estar vencida.", "retentionUntil"
            )
        extension = _ALLOWED_CONTENT_TYPES.get(content_type)
        if extension is None:
            raise InvalidOperationError("Tipo de archivo no permitido.", "file")
        if owner_type == "customer" and classification in {
            "employee_document",
            _LABOR_CONTRACT,
        }:
            raise InvalidOperationError(
                "Clasificación incompatible con el cliente.", "classification"
            )
        if owner_type == "employee" and classification == "customer_document":
            raise InvalidOperationError(
                "Clasificación incompatible con el empleado.", "classification"
            )
        if classification == _LABOR_CONTRACT and not self._can_manage_labor_contract(principal):
            raise AuthorizationError("No tienes permiso para realizar esta acción.")
        filename = _safe_filename(original_filename)
        storage_key = f"{grant.workspace_id}/{owner_type}/{owner_id}/{uuid7()}{extension}"
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
        try:
            record = self._repository.create_attachment(
                workspace_id=grant.workspace_id,
                owner_type=owner_type,
                owner_id=owner_id,
                uploader_platform_user_id=principal.platform_user_id,
                original_filename=filename,
                storage_key=blob.storage_key,
                content_type=content_type,
                size_bytes=blob.size_bytes,
                checksum_sha256=blob.checksum_sha256,
                classification=classification,
                retention_until=retention_until,
                request_id=get_request_id(),
            )
            self._session.commit()
            return record
        except Exception:
            self._session.rollback()
            storage.delete(storage_key)
            raise

    def get_attachment(
        self,
        *,
        grant: PermissionGrant,
        owner_type: str,
        owner_id: UUID,
        attachment_id: UUID,
        principal: AuthPrincipal | None = None,
    ) -> AttachmentRecord:
        self._require_owner(grant, owner_type, owner_id)
        record = self._repository.get_attachment(
            grant.workspace_id, owner_type, owner_id, attachment_id
        )
        if record is None:
            raise ResourceNotFoundError("El adjunto no existe.", "attachmentId")
        if record.classification == _LABOR_CONTRACT and not self._can_read_labor_contract(
            principal
        ):
            raise ResourceNotFoundError("El adjunto no existe.", "attachmentId")
        return record

    def delete_attachment(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        owner_type: str,
        owner_id: UUID,
        attachment_id: UUID,
        storage: AttachmentStorage,
    ) -> None:
        record = self.get_attachment(
            grant=grant,
            owner_type=owner_type,
            owner_id=owner_id,
            attachment_id=attachment_id,
            principal=principal,
        )
        if record.classification == _LABOR_CONTRACT and not self._can_manage_labor_contract(
            principal
        ):
            raise AuthorizationError("No tienes permiso para realizar esta acción.")
        if record.retention_until is not None and record.retention_until >= date.today():
            raise InvalidOperationError(
                "El adjunto no puede eliminarse durante su período de retención.",
                "retentionUntil",
            )
        storage.delete(record.storage_key)
        deleted = self._repository.delete_attachment(
            workspace_id=grant.workspace_id,
            owner_type=owner_type,
            owner_id=owner_id,
            attachment_id=attachment_id,
            actor_platform_user_id=principal.platform_user_id,
            request_id=get_request_id(),
        )
        if not deleted:
            self._session.rollback()
            raise ResourceNotFoundError("El adjunto no existe.", "attachmentId")
        self._session.commit()

    def _require_owner(self, grant: PermissionGrant, owner_type: str, owner_id: UUID) -> None:
        if owner_type == "customer":
            self.get_customer(grant, owner_id)
        else:
            self.get_employee(grant, owner_id)

    def _validate_branches(self, grant: PermissionGrant, branch_ids: set[UUID]) -> None:
        if not branch_ids:
            raise InvalidOperationError("Selecciona al menos una sucursal.", "branchIds")
        if grant.allowed_branch_ids is not None and not branch_ids <= grant.allowed_branch_ids:
            raise AuthorizationError("No puedes usar una sucursal fuera de tu alcance.")
        if not self._repository.branches_exist(grant.workspace_id, branch_ids):
            raise ResourceNotFoundError("Una sucursal no existe o está inactiva.", "branchIds")

    def _validate_supervisors(self, grant: PermissionGrant, supervisor_ids: set[UUID]) -> None:
        if not self._repository.employees_exist_and_visible(
            grant.workspace_id, supervisor_ids, grant.allowed_branch_ids
        ):
            raise ResourceNotFoundError(
                "Un supervisor no existe o está fuera de alcance.", "supervisorIds"
            )

    def _validate_employee_uniques(
        self,
        workspace_id: UUID,
        values: dict[str, object],
        exclude_id: UUID | None = None,
    ) -> None:
        number = values.get("employee_number")
        if isinstance(number, str) and self._repository.employee_number_exists(
            workspace_id, number, exclude_id
        ):
            raise ConflictError("Ya existe este número de empleado.", "employeeNumber")
        platform_user_id = values.get("platform_user_id")
        if isinstance(platform_user_id, UUID):
            if not self._repository.platform_user_is_workspace_member(
                workspace_id, platform_user_id
            ):
                raise ResourceNotFoundError(
                    "El usuario no pertenece al workspace.", "platformUserId"
                )
            holder = self._repository.find_employee_by_platform_user(
                workspace_id, platform_user_id, exclude_id
            )
            if holder is not None:
                status_label = _EMPLOYEE_STATUS_LABELS.get(holder.status, holder.status)
                raise ConflictError(
                    "El usuario ya está vinculado a "
                    f"{holder.first_name} {holder.last_name} "
                    f"({holder.employee_number}, {status_label}).",
                    "platformUserId",
                )
        normalized_document_id = values.get("normalized_document_id")
        if isinstance(normalized_document_id, str) and self._repository.employee_by_document(
            workspace_id, normalized_document_id, exclude_id
        ):
            raise ConflictError("Ya existe un empleado con esa cédula.", "documentId")

    @staticmethod
    def _prepare_customer_values(values: dict[str, object]) -> dict[str, object]:
        prepared = dict(values)
        if "display_name" in prepared:
            prepared["normalized_name"] = normalize_name(str(prepared["display_name"]))
        if "email" in prepared:
            value = prepared["email"]
            prepared["email"] = str(value) if value is not None else None
            prepared["normalized_email"] = normalize_email(cast_optional_str(prepared["email"]))
        if "instagram_url" in prepared:
            value = prepared["instagram_url"]
            prepared["instagram_url"] = str(value) if value is not None else None
        if "phone" in prepared:
            prepared["normalized_phone"] = normalize_phone(cast_optional_str(prepared["phone"]))
        if "document_type" in prepared or "document_id" in prepared:
            doc_type = cast_optional_str(prepared.get("document_type"))
            doc_id = cast_optional_str(prepared.get("document_id"))
            if doc_type is None and doc_id is None:
                prepared["document_type"] = None
                prepared["document_id"] = None
                prepared["normalized_document_id"] = None
            else:
                try:
                    normalized_type, display_id, normalized_id = prepare_customer_document_fields(
                        doc_type, doc_id
                    )
                except ValueError as exc:
                    raise InvalidOperationError(str(exc), "documentId") from exc
                prepared["document_type"] = normalized_type
                prepared["document_id"] = display_id
                prepared["normalized_document_id"] = normalized_id
        return prepared

    @staticmethod
    def _prepare_employee_values(
        workspace_id: UUID, values: dict[str, object]
    ) -> dict[str, object]:
        del workspace_id
        prepared = dict(values)
        if "normalized_name" not in prepared and (
            "first_name" in prepared or "last_name" in prepared
        ):
            first_name = str(prepared.get("first_name", ""))
            last_name = str(prepared.get("last_name", ""))
            prepared["normalized_name"] = normalize_name(f"{first_name} {last_name}")
        if "email" in prepared:
            value = prepared["email"]
            prepared["email"] = str(value) if value is not None else None
            prepared["normalized_email"] = normalize_email(cast_optional_str(prepared["email"]))
        if "phone" in prepared:
            prepared["normalized_phone"] = normalize_phone(cast_optional_str(prepared["phone"]))
        if "document_type" in prepared or "document_id" in prepared:
            doc_type = cast_optional_str(prepared.get("document_type"))
            doc_id = cast_optional_str(prepared.get("document_id"))
            if doc_type is None and doc_id is None:
                prepared["document_type"] = None
                prepared["document_id"] = None
                prepared["normalized_document_id"] = None
            else:
                if doc_type is None:
                    doc_type = "cedula"
                if doc_type not in _EMPLOYEE_DOCUMENT_TYPES:
                    raise InvalidOperationError("documentType inválido.", "documentType")
                try:
                    normalized_type, display_id, normalized_id = prepare_customer_document_fields(
                        doc_type, doc_id
                    )
                except ValueError as exc:
                    raise InvalidOperationError(str(exc), "documentId") from exc
                prepared["document_type"] = normalized_type
                prepared["document_id"] = display_id
                prepared["normalized_document_id"] = normalized_id
        return prepared

    def _can_read_labor_contract(self, principal: AuthPrincipal | None) -> bool:
        if principal is None:
            return False
        return (
            AuthorizationService(self._session).optional_permission(principal, "hr.profile.read")
            is not None
        )

    def _can_manage_labor_contract(self, principal: AuthPrincipal) -> bool:
        return (
            AuthorizationService(self._session).optional_permission(principal, "hr.profile.manage")
            is not None
        )

    @staticmethod
    def _employee_integrity_error(exc: IntegrityError, fallback: str) -> ConflictError:
        if _integrity_mentions_document(exc):
            return ConflictError("Ya existe un empleado con esa cédula.", "documentId")
        return ConflictError(fallback)

    @staticmethod
    def _require_filter_branch(grant: PermissionGrant, branch_id: UUID | None) -> None:
        if (
            branch_id is not None
            and grant.allowed_branch_ids is not None
            and branch_id not in grant.allowed_branch_ids
        ):
            raise AuthorizationError("No puedes consultar una sucursal fuera de tu alcance.")


def cast_optional_str(value: object) -> str | None:
    return str(value) if value is not None else None


def _integrity_mentions_document(exc: IntegrityError) -> bool:
    detail = str(getattr(exc, "orig", exc)).lower()
    return "uq_employees_workspace_document_active" in detail or (
        "normalized_document" in detail and "employees" in detail
    )


def _safe_filename(value: str) -> str:
    name = Path(value or "archivo").name
    sanitized = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    return (sanitized or "archivo")[:255]
