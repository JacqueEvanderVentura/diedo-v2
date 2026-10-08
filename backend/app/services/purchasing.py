from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, cast
from uuid import UUID, uuid7

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.repositories.authorization import AuthorizationRepository
from app.repositories.purchasing import (
    CatalogCompareRow,
    PurchaseRequestPage,
    PurchaseRequestRecord,
    PurchaseRequestStatsRecord,
    PurchasingApproverRecord,
    PurchasingRepository,
    PurchasingSettingsRecord,
    SupplierCatalogItemRecord,
    SupplierPage,
    SupplierRecord,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.finance import FinanceService
from app.services.inventory import InventoryService


class PurchasingService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = PurchasingRepository(session)
        self._authorization = AuthorizationRepository(session)

    def list_suppliers(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        active: bool | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> SupplierPage:
        self._require_visible_branch(grant, branch_id)
        return self._repository.list_suppliers(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            active=active,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def get_supplier(self, grant: PermissionGrant, supplier_id: UUID) -> SupplierRecord:
        record = self._repository.get_supplier(
            workspace_id=grant.workspace_id,
            supplier_id=supplier_id,
            visible_branch_ids=grant.allowed_branch_ids,
        )
        if record is None or record.supplier.status == "archived":
            raise ResourceNotFoundError("El proveedor no existe.", "supplierId")
        return record

    def create_supplier(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> SupplierRecord:
        branch_ids = set(cast(list[UUID], values["branch_ids"]))
        self._require_managed_branches(grant, branch_ids)
        self._validate_branches(grant.workspace_id, branch_ids)
        normalized = self._normalize_name(cast(str, values["name"]))
        tax_identifier = self._normalize_optional_text(cast(str | None, values.get("rnc")))
        persistent_values = {
            "name": cast(str, values["name"]).strip(),
            "normalized_name": normalized,
            "tax_identifier": tax_identifier,
            "contact_name": self._normalize_optional_text(
                cast(str | None, values.get("contact_name"))
            ),
            "phone": self._normalize_optional_text(cast(str | None, values.get("phone"))),
            "email": self._normalize_optional_text(cast(str | None, values.get("email"))),
            "address": self._normalize_optional_text(cast(str | None, values.get("address"))),
        }
        fingerprint = self._fingerprint(
            {**persistent_values, "branch_ids": sorted(str(item) for item in branch_ids)}
        )
        existing = self._repository.supplier_by_creation_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            if existing[1] != fingerprint:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.", "Idempotency-Key"
                )
            return self.get_supplier(grant, existing[0])
        if self._repository.supplier_identity_exists(
            grant.workspace_id, normalized, tax_identifier
        ):
            raise ConflictError("Ya existe un proveedor con ese nombre o RNC.", "name")

        supplier_id = uuid7()
        try:
            self._repository.create_supplier(
                supplier_id=supplier_id,
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                values=persistent_values,
                branch_ids=sorted(branch_ids, key=str),
                idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_supplier(grant, supplier_id)
        except IntegrityError as exc:
            self._session.rollback()
            existing = self._repository.supplier_by_creation_key(
                grant.workspace_id, idempotency_key
            )
            if existing is not None:
                if existing[1] != fingerprint:
                    raise ConflictError(
                        "Idempotency-Key ya fue usado con otro contenido.",
                        "Idempotency-Key",
                    ) from exc
                return self.get_supplier(grant, existing[0])
            raise ConflictError("No se pudo crear el proveedor por un conflicto de datos.") from exc

    def update_supplier(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        supplier_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> SupplierRecord:
        self.get_supplier(grant, supplier_id)
        record = self._repository.get_supplier_for_update(grant.workspace_id, supplier_id)
        if record is None or record.supplier.status == "archived":
            raise ResourceNotFoundError("El proveedor no existe.", "supplierId")
        self._require_managed_branches(grant, set(record.branch_ids))
        if record.supplier.version != expected_version:
            raise ConflictError(
                "El proveedor cambió; vuelve a cargarlo antes de guardar.", "version"
            )

        branch_ids = changes.pop("branch_ids", None)
        branch_values: list[UUID] | None = None
        if branch_ids is not None:
            branch_set = set(cast(list[UUID], branch_ids))
            self._require_managed_branches(grant, branch_set)
            self._validate_branches(grant.workspace_id, branch_set)
            branch_values = sorted(branch_set, key=str)

        persistent_changes: dict[str, Any] = {}
        if "name" in changes:
            name = cast(str, changes["name"]).strip()
            persistent_changes.update(name=name, normalized_name=self._normalize_name(name))
        if "rnc" in changes:
            persistent_changes["tax_identifier"] = self._normalize_optional_text(
                cast(str | None, changes["rnc"])
            )
        for public, internal in (
            ("contact_name", "contact_name"),
            ("phone", "phone"),
            ("email", "email"),
            ("address", "address"),
        ):
            if public in changes:
                persistent_changes[internal] = self._normalize_optional_text(
                    cast(str | None, changes[public])
                )
        if "active" in changes:
            persistent_changes["status"] = "active" if changes["active"] else "inactive"

        normalized = cast(
            str, persistent_changes.get("normalized_name", record.supplier.normalized_name)
        )
        tax_identifier = cast(
            str | None,
            persistent_changes.get("tax_identifier", record.supplier.tax_identifier),
        )
        if self._repository.supplier_identity_exists(
            grant.workspace_id,
            normalized,
            tax_identifier,
            exclude_id=record.supplier.id,
        ):
            raise ConflictError("Ya existe un proveedor con ese nombre o RNC.", "name")
        try:
            self._repository.update_supplier(
                supplier=record.supplier,
                changes=persistent_changes,
                branch_ids=branch_values,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_supplier(grant, supplier_id)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "No se pudo actualizar el proveedor por un conflicto de datos."
            ) from exc

    def archive_supplier(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        supplier_id: UUID,
    ) -> None:
        self.get_supplier(grant, supplier_id)
        record = self._repository.get_supplier_for_update(grant.workspace_id, supplier_id)
        if record is None or record.supplier.status == "archived":
            raise ResourceNotFoundError("El proveedor no existe.", "supplierId")
        self._require_managed_branches(grant, set(record.branch_ids))
        try:
            self._repository.archive_supplier(
                supplier=record.supplier,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo archivar el proveedor.") from exc

    def list_purchase_requests(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        supplier_id: UUID | None,
        search: str | None,
        status: str | None,
        priority: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> PurchaseRequestPage:
        self._require_visible_branch(grant, branch_id)
        return self._repository.list_purchase_requests(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            supplier_id=supplier_id,
            search=self._normalize_optional_text(search),
            status=status,
            priority=priority,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def purchase_request_stats(
        self, grant: PermissionGrant, branch_id: UUID | None
    ) -> PurchaseRequestStatsRecord:
        self._require_visible_branch(grant, branch_id)
        return self._repository.purchase_request_stats(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )

    def get_purchase_request(
        self, grant: PermissionGrant, request_id: UUID
    ) -> PurchaseRequestRecord:
        record = self._repository.get_purchase_request(
            workspace_id=grant.workspace_id,
            request_id=request_id,
            visible_branch_ids=grant.allowed_branch_ids,
        )
        if record is None:
            raise ResourceNotFoundError("La solicitud de compra no existe.", "requestId")
        return record

    def create_purchase_request(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> PurchaseRequestRecord:
        branch_id = cast(UUID, values["branch_id"])
        supplier_id = cast(UUID, values["supplier_id"])
        self._require_managed_branches(grant, {branch_id})
        self._validate_branches(grant.workspace_id, {branch_id})
        if not self._repository.supplier_available_in_branch(
            grant.workspace_id, supplier_id, branch_id
        ):
            raise ResourceNotFoundError(
                "El proveedor no está activo o autorizado para esa sucursal.", "supplierId"
            )
        persistent_values = self._purchase_values(values)
        fingerprint = self._fingerprint(persistent_values)
        existing = self._repository.purchase_request_by_creation_key(
            grant.workspace_id, idempotency_key
        )
        if existing is not None:
            if existing[1] != fingerprint:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.", "Idempotency-Key"
                )
            return self.get_purchase_request(grant, existing[0])

        purchase_request_id = uuid7()
        persistent_values["request_number"] = (
            f"SC-{datetime.now(UTC):%Y%m%d}-{purchase_request_id.hex[:16].upper()}"
        )
        try:
            self._repository.create_purchase_request(
                request_id_value=purchase_request_id,
                workspace_id=grant.workspace_id,
                requester_membership_id=principal.membership_id,
                requester_name=principal.display_name,
                actor_platform_user_id=principal.platform_user_id,
                values=persistent_values,
                idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_purchase_request(grant, purchase_request_id)
        except IntegrityError as exc:
            self._session.rollback()
            existing = self._repository.purchase_request_by_creation_key(
                grant.workspace_id, idempotency_key
            )
            if existing is not None:
                if existing[1] != fingerprint:
                    raise ConflictError(
                        "Idempotency-Key ya fue usado con otro contenido.",
                        "Idempotency-Key",
                    ) from exc
                return self.get_purchase_request(grant, existing[0])
            raise ConflictError("No se pudo crear la solicitud por un conflicto de datos.") from exc

    def update_purchase_request(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        request_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> PurchaseRequestRecord:
        record = self._locked_request(grant, request_id)
        request = record.request
        if request.status != "pendiente":
            raise InvalidOperationError("Solo se puede editar una solicitud pendiente.", "status")
        if not grant.workspace_wide and request.requester_membership_id != principal.membership_id:
            raise AuthorizationError("Solo quien creó la solicitud puede editarla.")
        self._require_version(request.version, expected_version)

        branch_id = cast(UUID, changes.get("branch_id", request.branch_id))
        supplier_id = cast(UUID, changes.get("supplier_id", request.supplier_id))
        self._require_managed_branches(grant, {request.branch_id, branch_id})
        self._validate_branches(grant.workspace_id, {branch_id})
        if not self._repository.supplier_available_in_branch(
            grant.workspace_id, supplier_id, branch_id
        ):
            raise ResourceNotFoundError(
                "El proveedor no está activo o autorizado para esa sucursal.", "supplierId"
            )

        items = changes.pop("items", None)
        persistent_changes: dict[str, Any] = {}
        for field in ("supplier_id", "branch_id", "priority", "notes"):
            if field in changes:
                persistent_changes[field] = changes[field]
        if "quote_file" in changes:
            quote = changes["quote_file"]
            persistent_changes["quote_file_name"] = quote["name"] if quote else None
        persistent_items = (
            self._purchase_items(cast(list[dict[str, Any]], items)) if items else None
        )
        try:
            self._repository.update_purchase_request(
                request=request,
                changes=persistent_changes,
                items=persistent_items,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_purchase_request(grant, request_id)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo actualizar la solicitud.") from exc

    def review_purchase_request(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        request_id: UUID,
        expected_version: int,
        status: str,
    ) -> PurchaseRequestRecord:
        record = self._locked_request(grant, request_id)
        request = record.request
        if request.status != "pendiente":
            raise InvalidOperationError("Solo se puede revisar una solicitud pendiente.", "status")
        self._require_version(request.version, expected_version)
        self._require_designated_approver(grant.workspace_id, principal.membership_id)
        try:
            self._repository.review_purchase_request(
                request=request,
                status=status,
                reviewer_membership_id=principal.membership_id,
                actor_platform_user_id=principal.platform_user_id,
                reviewed_at=datetime.now(UTC),
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_purchase_request(grant, request_id)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo revisar la solicitud.") from exc

    def pay_purchase_request(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        request_id: UUID,
        expected_version: int,
        idempotency_key: str,
    ) -> PurchaseRequestRecord:
        record = self._locked_request(grant, request_id)
        request = record.request
        if request.status != "aprobada":
            raise InvalidOperationError(
                "Solo una solicitud aprobada puede marcarse como pagada.", "status"
            )
        self._require_version(request.version, expected_version)
        finance_grant = AuthorizationService(self._session).require_permission(
            principal, "finance.manage"
        )
        total = sum(
            (item.quantity * item.unit_price for item in record.items),
            Decimal("0"),
        )
        if total <= 0:
            raise InvalidOperationError(
                "La solicitud no tiene un monto válido para pagar.", "items"
            )
        expense = FinanceService(self._session).create_expense(
            principal=principal,
            grant=finance_grant,
            values={
                "concept": f"Compra {request.request_number} · {record.supplier_name}",
                "amount": total,
                "category": "insumos",
                "date": date.today(),
                "branch_id": request.branch_id,
                "status": "pagado",
                "budget_id": None,
            },
            idempotency_key=idempotency_key,
        )
        try:
            self._repository.pay_purchase_request(
                request=request,
                paid_at=datetime.now(UTC),
                finance_expense_id=expense.id,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_purchase_request(grant, request_id)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo marcar la solicitud como pagada.") from exc

    def deliver_purchase_request(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        request_id: UUID,
        expected_version: int,
        lines: list[dict[str, Any]],
        idempotency_key: str,
    ) -> PurchaseRequestRecord:
        record = self._locked_request(grant, request_id)
        request = record.request
        if request.status != "pagada":
            raise InvalidOperationError(
                "Solo una solicitud pagada puede marcarse como recibida.", "status"
            )
        if self._repository.count_receipt_images(grant.workspace_id, request.id) < 1:
            raise InvalidOperationError(
                "Debes subir al menos una foto de comprobante de recepción.", "receipt"
            )
        self._require_version(request.version, expected_version)
        line_map = {
            cast(UUID, row["item_id"]): cast(UUID, row["inventory_item_id"]) for row in lines
        }
        purchase_items = [item for item in record.items if item.quantity > 0]
        if len(line_map) != len(purchase_items):
            raise InvalidOperationError(
                "Debes indicar el insumo de inventario para cada línea de la solicitud.", "lines"
            )
        for item in purchase_items:
            if item.id not in line_map:
                raise InvalidOperationError(
                    "Falta el mapeo de inventario para una línea de la solicitud.", "lines"
                )
            inventory_item_id = line_map[item.id]
            if not self._repository.inventory_item_is_supply(grant.workspace_id, inventory_item_id):
                raise ResourceNotFoundError(
                    "El insumo de inventario no existe o no es válido.", "inventoryItemId"
                )

        inventory_grant = AuthorizationService(self._session).require_permission(
            principal, "inventory.move"
        )
        deltas: dict[UUID, Decimal] = {}
        for item in purchase_items:
            inventory_item_id = line_map[item.id]
            deltas[inventory_item_id] = deltas.get(inventory_item_id, Decimal("0")) + item.quantity

        inventory_service = InventoryService(self._session)
        warehouse = inventory_service._repository.get_warehouse(
            workspace_id=grant.workspace_id,
            branch_id=request.branch_id,
            warehouse_id=None,
        )
        if warehouse is None:
            raise ResourceNotFoundError("No hay almacén configurado para la sucursal.", "branchId")

        adjustment_items: list[dict[str, Any]] = []
        for inventory_item_id, delta in deltas.items():
            balance = inventory_service._repository.ensure_balance_for_update(
                workspace_id=grant.workspace_id,
                item_id=inventory_item_id,
                branch_id=request.branch_id,
                warehouse_id=warehouse.id,
            )
            adjustment_items.append(
                {
                    "item_id": inventory_item_id,
                    "quantity": balance.quantity + delta,
                }
            )

        InventoryService(self._session).create_adjustment_movement(
            principal=principal,
            grant=inventory_grant,
            values={
                "branch_id": request.branch_id,
                "warehouse_id": warehouse.id,
                "comment": f"Compra recibida {request.request_number}",
                "items": adjustment_items,
            },
            idempotency_key=idempotency_key,
        )

        try:
            self._repository.deliver_purchase_request(
                request=request,
                delivered_at=datetime.now(UTC),
                line_inventory_map=line_map,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_purchase_request(grant, request_id)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo marcar la solicitud como entregada.") from exc

    def list_supplier_catalog(
        self, grant: PermissionGrant, supplier_id: UUID, *, active_only: bool = True
    ) -> tuple[SupplierCatalogItemRecord, ...]:
        self.get_supplier(grant, supplier_id)
        return self._repository.list_supplier_catalog(
            workspace_id=grant.workspace_id,
            supplier_id=supplier_id,
            active_only=active_only,
        )

    def create_supplier_catalog_item(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        supplier_id: UUID,
        values: dict[str, Any],
    ) -> SupplierCatalogItemRecord:
        self.get_supplier(grant, supplier_id)
        category_id = cast(UUID, values["category_id"])
        if not self._repository.category_is_supply(grant.workspace_id, category_id):
            raise ResourceNotFoundError("La categoría no existe o no es de insumos.", "categoryId")
        normalized = self._normalize_name(cast(str, values["name"]))
        persistent = {
            "name": cast(str, values["name"]).strip(),
            "normalized_name": normalized,
            "unit": cast(str, values["unit"]).strip(),
            "unit_price": values["unit_price"],
            "category_id": category_id,
        }
        item_id = uuid7()
        try:
            item = self._repository.create_catalog_item(
                item_id=item_id,
                workspace_id=grant.workspace_id,
                supplier_id=supplier_id,
                actor_platform_user_id=principal.platform_user_id,
                values=persistent,
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "Ya existe un producto con ese nombre en el catálogo del proveedor.", "name"
            ) from exc
        record = self._repository.get_catalog_item(grant.workspace_id, supplier_id, item.id)
        assert record is not None
        return record

    def update_supplier_catalog_item(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        supplier_id: UUID,
        item_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> SupplierCatalogItemRecord:
        self.get_supplier(grant, supplier_id)
        item = self._repository.get_catalog_item_for_update(
            grant.workspace_id, supplier_id, item_id
        )
        if item is None:
            raise ResourceNotFoundError("El producto del catálogo no existe.", "itemId")
        self._require_version(item.version, expected_version)
        persistent: dict[str, Any] = {}
        if "name" in changes and changes["name"] is not None:
            persistent["name"] = cast(str, changes["name"]).strip()
            persistent["normalized_name"] = self._normalize_name(cast(str, changes["name"]))
        if "unit" in changes and changes["unit"] is not None:
            persistent["unit"] = cast(str, changes["unit"]).strip()
        if "unit_price" in changes and changes["unit_price"] is not None:
            persistent["unit_price"] = changes["unit_price"]
        if "category_id" in changes and changes["category_id"] is not None:
            category_id = cast(UUID, changes["category_id"])
            if not self._repository.category_is_supply(grant.workspace_id, category_id):
                raise ResourceNotFoundError(
                    "La categoría no existe o no es de insumos.", "categoryId"
                )
            persistent["category_id"] = category_id
        if "active" in changes and changes["active"] is not None:
            persistent["active"] = changes["active"]
        try:
            self._repository.update_catalog_item(
                item=item,
                changes=persistent,
                actor_platform_user_id=principal.platform_user_id,
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo actualizar el producto del catálogo.") from exc
        record = self._repository.get_catalog_item(grant.workspace_id, supplier_id, item_id)
        assert record is not None
        return record

    def archive_supplier_catalog_item(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        supplier_id: UUID,
        item_id: UUID,
    ) -> None:
        self.get_supplier(grant, supplier_id)
        item = self._repository.get_catalog_item_for_update(
            grant.workspace_id, supplier_id, item_id
        )
        if item is None:
            raise ResourceNotFoundError("El producto del catálogo no existe.", "itemId")
        self._repository.archive_catalog_item(
            item=item,
            actor_platform_user_id=principal.platform_user_id,
        )
        self._session.commit()

    def compare_supplier_catalog(
        self,
        grant: PermissionGrant,
        *,
        category_id: UUID | None,
        search: str | None,
    ) -> tuple[CatalogCompareRow, ...]:
        return self._repository.compare_catalog(
            workspace_id=grant.workspace_id,
            category_id=category_id,
            search=self._normalize_optional_text(search),
        )

    def get_settings(self, grant: PermissionGrant) -> PurchasingSettingsRecord:
        record = self._repository.get_settings(grant.workspace_id)
        if record is None:
            raise ResourceNotFoundError("La configuración de compras no está inicializada.")
        return record

    def list_approvers(self, grant: PermissionGrant) -> tuple[PurchasingApproverRecord, ...]:
        memberships = self._repository.list_active_memberships(grant.workspace_id)
        return tuple(
            membership
            for membership in memberships
            if self._authorization.permission_scopes(
                workspace_id=grant.workspace_id,
                membership_id=membership.membership_id,
                permission_code="purchasing.requests.review",
            )
        )

    def update_settings(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        expected_version: int,
        approver_membership_id: UUID | None,
        notify_on_request: bool,
    ) -> PurchasingSettingsRecord:
        if not grant.workspace_wide:
            raise AuthorizationError("Configurar compras requiere alcance sobre todo el workspace.")
        record = self._repository.get_settings(grant.workspace_id, for_update=True)
        if record is None:
            raise ResourceNotFoundError("La configuración de compras no está inicializada.")
        self._require_version(record.settings.version, expected_version)
        if (
            approver_membership_id is not None
            and self._repository.active_membership_name(grant.workspace_id, approver_membership_id)
            is None
        ):
            raise ResourceNotFoundError(
                "El aprobador no existe o no está activo en este workspace.",
                "approverUserId",
            )
        if approver_membership_id is not None and not self._authorization.permission_scopes(
            workspace_id=grant.workspace_id,
            membership_id=approver_membership_id,
            permission_code="purchasing.requests.review",
        ):
            raise ConflictError(
                "El aprobador seleccionado no tiene permiso para revisar solicitudes.",
                "approverUserId",
            )
        try:
            self._repository.update_settings(
                settings=record.settings,
                approver_membership_id=approver_membership_id,
                notify_on_request=notify_on_request,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_settings(grant)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo actualizar la configuración de compras.") from exc

    def _locked_request(self, grant: PermissionGrant, request_id: UUID) -> PurchaseRequestRecord:
        record = self._repository.get_purchase_request(
            workspace_id=grant.workspace_id,
            request_id=request_id,
            visible_branch_ids=grant.allowed_branch_ids,
            for_update=True,
        )
        if record is None:
            raise ResourceNotFoundError("La solicitud de compra no existe.", "requestId")
        return record

    def _require_designated_approver(self, workspace_id: UUID, membership_id: UUID) -> None:
        settings = self._repository.get_settings(workspace_id)
        if settings is None:
            raise ResourceNotFoundError("La configuración de compras no está inicializada.")
        designated = settings.settings.approver_membership_id
        if designated is not None and designated != membership_id:
            raise AuthorizationError("Solo el aprobador designado puede revisar solicitudes.")

    def _validate_branches(self, workspace_id: UUID, branch_ids: set[UUID]) -> None:
        active = self._repository.active_branch_ids(workspace_id, branch_ids)
        if active != branch_ids:
            raise ResourceNotFoundError(
                "Una o más sucursales no existen o no están activas.", "branchIds"
            )

    @staticmethod
    def _purchase_values(values: dict[str, Any]) -> dict[str, Any]:
        quote = values.get("quote_file")
        return {
            "supplier_id": values["supplier_id"],
            "branch_id": values["branch_id"],
            "items": PurchasingService._purchase_items(values["items"]),
            "priority": values.get("priority", "normal"),
            "notes": PurchasingService._normalize_optional_text(values.get("notes")),
            "quote_file_name": quote["name"] if quote else None,
        }

    @staticmethod
    def _purchase_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "name": cast(str, item["name"]).strip(),
                "quantity": item["qty"],
                "unit": cast(str, item["unit"]).strip(),
                "unit_price": item["price"],
                "supplier_catalog_item_id": item.get("catalog_item_id"),
                "category_id": item.get("category_id"),
            }
            for item in items
        ]

    @staticmethod
    def _require_version(current: int, expected: int) -> None:
        if current != expected:
            raise ConflictError(
                "La solicitud cambió; vuelve a cargarla antes de continuar.", "version"
            )

    @staticmethod
    def _require_visible_branch(grant: PermissionGrant, branch_id: UUID | None) -> None:
        if (
            branch_id is not None
            and grant.allowed_branch_ids is not None
            and branch_id not in grant.allowed_branch_ids
        ):
            raise AuthorizationError("No puedes consultar una sucursal fuera de tu alcance.")

    @staticmethod
    def _require_managed_branches(grant: PermissionGrant, branch_ids: set[UUID]) -> None:
        if grant.allowed_branch_ids is not None and not branch_ids.issubset(
            grant.allowed_branch_ids
        ):
            raise AuthorizationError("No puedes gestionar compras fuera de tu alcance.")

    @staticmethod
    def _normalize_name(value: str) -> str:
        return " ".join(value.casefold().split())

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @staticmethod
    def _fingerprint(values: dict[str, Any]) -> str:
        encoded = json.dumps(values, sort_keys=True, default=str, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def page_count(total_items: int, page_size: int) -> int:
    return (total_items + page_size - 1) // page_size if total_items else 0
