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
from app.services.authorization import PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)

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
        customer_type: str | None,
        status: str | None,
        branch_id: UUID | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> CustomerListResult:
        self._require_filter_branch(grant, branch_id)
        result = self._repository.list_customers(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            search=normalize_name(search) if search else None,
            name=normalize_name(name) if name else None,
            phone=normalize_phone(phone),
            email=normalize_email(email),
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

    def create_customer(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, object],
        branch_ids: set[UUID],
    ) -> CustomerRecord:
        self._validate_branches(grant, branch_ids)
        prepared = self._prepare_customer_values(values)
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
            raise ConflictError("No fue posible crear el cliente.") from exc

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
        prepared = self._prepare_customer_values(changes)
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
            raise ConflictError("No fue posible actualizar el cliente.") from exc

    def customer_timeline(
        self, grant: PermissionGrant, customer_id: UUID
    ) -> tuple[TimelineRecord, ...]:
        self.get_customer(grant, customer_id)
        return self._repository.customer_timeline(grant.workspace_id, customer_id)

    def list_employees(
        self,
        *,
        grant: PermissionGrant,
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
        )
        return EmployeeListResult(
            result.items,
            page,
            page_size,
            result.total_items,
            ceil(result.total_items / page_size) if result.total_items else 0,
        )

    def get_employee(self, grant: PermissionGrant, employee_id: UUID) -> EmployeeRecord:
        employee = self._repository.get_employee(
            grant.workspace_id, employee_id, grant.allowed_branch_ids
        )
        if employee is None:
            raise ResourceNotFoundError("El empleado no existe.", "employeeId")
        return self._repository.employee_record(employee)

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
            raise ConflictError("No fue posible crear el empleado.") from exc

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
            raise ConflictError("No fue posible actualizar el empleado.") from exc

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
        self, grant: PermissionGrant, owner_type: str, owner_id: UUID
    ) -> tuple[AttachmentRecord, ...]:
        self._require_owner(grant, owner_type, owner_id)
        return self._repository.list_attachments(grant.workspace_id, owner_type, owner_id)

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
        if owner_type == "customer" and classification == "employee_document":
            raise InvalidOperationError(
                "Clasificación incompatible con el cliente.", "classification"
            )
        if owner_type == "employee" and classification == "customer_document":
            raise InvalidOperationError(
                "Clasificación incompatible con el empleado.", "classification"
            )
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
    ) -> AttachmentRecord:
        self._require_owner(grant, owner_type, owner_id)
        record = self._repository.get_attachment(
            grant.workspace_id, owner_type, owner_id, attachment_id
        )
        if record is None:
            raise ResourceNotFoundError("El adjunto no existe.", "attachmentId")
        return record

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
            if self._repository.platform_user_link_exists(
                workspace_id, platform_user_id, exclude_id
            ):
                raise ConflictError(
                    "El usuario ya está vinculado a otro empleado.", "platformUserId"
                )

    @staticmethod
    def _prepare_customer_values(values: dict[str, object]) -> dict[str, object]:
        prepared = dict(values)
        if "display_name" in prepared:
            prepared["normalized_name"] = normalize_name(str(prepared["display_name"]))
        if "email" in prepared:
            value = prepared["email"]
            prepared["email"] = str(value) if value is not None else None
            prepared["normalized_email"] = normalize_email(cast_optional_str(prepared["email"]))
        if "phone" in prepared:
            prepared["normalized_phone"] = normalize_phone(cast_optional_str(prepared["phone"]))
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
        return prepared

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


def _safe_filename(value: str) -> str:
    name = Path(value or "archivo").name
    sanitized = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    return (sanitized or "archivo")[:255]
