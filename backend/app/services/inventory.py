from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from hashlib import sha256
from math import ceil
from typing import Any, cast
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.repositories.inventory import (
    AssetPage,
    AssetRecord,
    AssetSummaryRecord,
    InventoryItemPage,
    InventoryItemRecord,
    InventoryRepository,
    InventorySummaryRecord,
    MovementPage,
    MovementRecord,
    SupplyUsageRecord,
    WarehouseRecord,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)


class InventoryService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = InventoryRepository(session)

    def summary(self, grant: PermissionGrant, branch_id: UUID | None) -> InventorySummaryRecord:
        self._require_visible_branch(grant, branch_id)
        return self._repository.inventory_summary(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )

    def list_warehouses(
        self, grant: PermissionGrant, branch_id: UUID | None
    ) -> tuple[WarehouseRecord, ...]:
        self._require_visible_branch(grant, branch_id)
        return self._repository.list_warehouses(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )

    def list_items(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        item_type: str | None,
        category_id: UUID | None,
        status: str | None,
        stock_status: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> InventoryItemPage:
        self._require_visible_branch(grant, branch_id)
        return self._repository.list_items(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            item_type=item_type,
            category_id=category_id,
            status=status,
            stock_status=stock_status,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def get_item(
        self,
        grant: PermissionGrant,
        item_id: UUID,
        branch_id: UUID | None = None,
    ) -> InventoryItemRecord:
        self._require_visible_branch(grant, branch_id)
        record = self._repository.get_item(
            workspace_id=grant.workspace_id,
            item_id=item_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )
        if record is None:
            raise ResourceNotFoundError("El ítem de inventario no existe.", "itemId")
        return record

    def create_item(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        item_type: str,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> InventoryItemRecord:
        fingerprint = self._fingerprint({"itemType": item_type, **values})
        existing = self._repository.item_by_creation_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            if existing[1] != fingerprint:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.",
                    "Idempotency-Key",
                )
            return self.get_item(grant, existing[0])

        branch_id = cast(UUID, values["branch_id"])
        warehouse_id = cast(UUID | None, values.get("warehouse_id"))
        self._require_managed_branch(grant, branch_id)
        self._validate_item_references(
            workspace_id=grant.workspace_id,
            category_id=cast(UUID, values["category_id"]),
            unit_id=cast(UUID, values["unit_of_measure_id"]),
            branch_id=branch_id,
        )
        warehouse = self._repository.get_warehouse(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            warehouse_id=warehouse_id,
        )
        if warehouse is None:
            raise ResourceNotFoundError(
                "El almacén no existe, no está activo o no pertenece a la sucursal.",
                "warehouseId",
            )
        sku = cast(str | None, values.get("sku"))
        if sku is not None and self._repository.item_sku_exists(grant.workspace_id, sku):
            raise ConflictError("Ya existe un ítem con este SKU.", "sku")

        sale_price = cast(Decimal | None, values.get("sale_price"))
        unit_cost = cast(Decimal | None, values.get("unit_cost"))
        tax_rate = cast(Decimal, values.get("tax_rate", Decimal("0")))
        stock = cast(Decimal | None, values.get("stock"))
        minimum_stock = cast(Decimal | None, values.get("minimum_stock"))
        self._validate_item_kind_fields(
            item_type=item_type,
            sale_price=sale_price,
            unit_cost=unit_cost,
            tax_rate=tax_rate,
            stock=stock,
            minimum_stock=minimum_stock,
        )
        try:
            item_id = self._repository.create_item(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                item_type=item_type,
                name=cast(str, values["name"]),
                description=cast(str | None, values.get("description")),
                sku=sku,
                category_id=cast(UUID, values["category_id"]),
                unit_of_measure_id=cast(UUID, values["unit_of_measure_id"]),
                branch_id=branch_id,
                warehouse=warehouse,
                sale_price=sale_price,
                unit_cost=unit_cost,
                tax_rate=tax_rate,
                stock=stock,
                minimum_stock=minimum_stock,
                status=cast(str, values.get("status", "active")),
                idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_item(grant, item_id)
        except IntegrityError as exc:
            self._session.rollback()
            existing = self._repository.item_by_creation_key(
                grant.workspace_id, idempotency_key
            )
            if existing is not None:
                if existing[1] != fingerprint:
                    raise ConflictError(
                        "Idempotency-Key ya fue usado con otro contenido.",
                        "Idempotency-Key",
                    ) from exc
                return self.get_item(grant, existing[0])
            raise ConflictError("No se pudo crear el ítem por un conflicto de datos.") from exc

    def update_item(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        item_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> InventoryItemRecord:
        item = self._repository.get_item_for_update(grant.workspace_id, item_id)
        if item is None:
            raise ResourceNotFoundError("El ítem de inventario no existe.", "itemId")
        branch_ids = self._repository.active_item_branch_ids(grant.workspace_id, item_id)
        self._require_managed_branches(grant, branch_ids)
        if item.version != expected_version:
            raise ConflictError("El ítem cambió; vuelve a cargarlo antes de guardar.", "version")
        if "sku" in changes:
            sku = cast(str | None, changes["sku"])
            if sku is not None and self._repository.item_sku_exists(
                grant.workspace_id, sku, exclude_id=item.id
            ):
                raise ConflictError("Ya existe un ítem con este SKU.", "sku")
        if (
            "category_id" in changes
            and self._repository.get_active_category(
                grant.workspace_id, cast(UUID, changes["category_id"])
            )
            is None
        ):
            raise ResourceNotFoundError("La categoría no existe o no está activa.", "categoryId")
        if (
            "unit_of_measure_id" in changes
            and self._repository.get_active_unit(
                grant.workspace_id, cast(UUID, changes["unit_of_measure_id"])
            )
            is None
        ):
            raise ResourceNotFoundError(
                "La unidad de medida no existe o no está activa.", "unitOfMeasureId"
            )
        self._validate_update_kind_fields(item.item_type, changes)
        profile = self._repository.ensure_profile(grant.workspace_id, item.id)
        balance = None
        if "minimum_stock" in changes:
            branch_id = cast(UUID, changes.pop("branch_id"))
            self._require_managed_branch(grant, branch_id)
            if branch_id not in branch_ids:
                raise ResourceNotFoundError("El ítem no está asignado a esta sucursal.", "branchId")
            warehouse = self._repository.get_warehouse(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                warehouse_id=cast(UUID | None, changes.pop("warehouse_id", None)),
            )
            if warehouse is None:
                raise ResourceNotFoundError(
                    "El almacén no existe o no pertenece a la sucursal.", "warehouseId"
                )
            balance = self._repository.ensure_balance_for_update(
                workspace_id=grant.workspace_id,
                item_id=item.id,
                branch_id=branch_id,
                warehouse_id=warehouse.id,
            )
        else:
            changes.pop("branch_id", None)
            changes.pop("warehouse_id", None)
        try:
            self._repository.update_item(
                item=item,
                profile=profile,
                balance=balance,
                changes=changes,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_item(grant, item.id)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo actualizar el ítem por un conflicto de datos.") from exc

    def list_asset_categories(self, grant: PermissionGrant) -> tuple[Any, ...]:
        return self._repository.list_asset_categories(grant.workspace_id)

    def create_asset_category(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        code: str,
        name: str,
    ) -> Any:
        if not grant.workspace_wide:
            raise AuthorizationError(
                "Gestionar categorías de activos requiere alcance sobre todo el workspace."
            )
        name_key = name.casefold()
        if self._repository.asset_category_exists(grant.workspace_id, code, name_key):
            raise ConflictError("Ya existe una categoría de activo con ese código o nombre.")
        try:
            category = self._repository.create_asset_category(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                code=code,
                name=name,
                normalized_name=name_key,
                request_id=get_request_id(),
            )
            self._session.commit()
            return category
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "No se pudo crear la categoría de activo por un conflicto de datos."
            ) from exc

    def asset_summary(self, grant: PermissionGrant, branch_id: UUID | None) -> AssetSummaryRecord:
        self._require_visible_branch(grant, branch_id)
        return self._repository.asset_summary(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )

    def list_assets(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        category_id: UUID | None,
        status: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> AssetPage:
        self._require_visible_branch(grant, branch_id)
        return self._repository.list_assets(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            category_id=category_id,
            status=status,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def get_asset(self, grant: PermissionGrant, asset_id: UUID) -> AssetRecord:
        record = self._repository.get_asset(
            workspace_id=grant.workspace_id,
            asset_id=asset_id,
            visible_branch_ids=grant.allowed_branch_ids,
        )
        if record is None:
            raise ResourceNotFoundError("El activo no existe.", "assetId")
        return record

    def create_asset(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> AssetRecord:
        fingerprint = self._fingerprint(values)
        existing = self._repository.asset_by_creation_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            if existing[1] != fingerprint:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.",
                    "Idempotency-Key",
                )
            return self.get_asset(grant, existing[0])
        branch_id = cast(UUID, values["branch_id"])
        self._require_managed_branch(grant, branch_id)
        if self._repository.get_active_branch(grant.workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        if (
            self._repository.get_active_asset_category(
                grant.workspace_id, cast(UUID, values["category_id"])
            )
            is None
        ):
            raise ResourceNotFoundError(
                "La categoría de activo no existe o no está activa.", "categoryId"
            )
        code = cast(str | None, values.get("code"))
        if code is not None and self._repository.asset_code_exists(grant.workspace_id, code):
            raise ConflictError("Ya existe un activo con este código.", "code")
        try:
            asset_id = self._repository.create_asset(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                values=values,
                idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_asset(grant, asset_id)
        except IntegrityError as exc:
            self._session.rollback()
            existing = self._repository.asset_by_creation_key(
                grant.workspace_id, idempotency_key
            )
            if existing is not None:
                if existing[1] != fingerprint:
                    raise ConflictError(
                        "Idempotency-Key ya fue usado con otro contenido.",
                        "Idempotency-Key",
                    ) from exc
                return self.get_asset(grant, existing[0])
            raise ConflictError("No se pudo crear el activo por un conflicto de datos.") from exc

    def update_asset(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        asset_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> AssetRecord:
        asset = self._repository.get_asset_for_update(grant.workspace_id, asset_id)
        if asset is None:
            raise ResourceNotFoundError("El activo no existe.", "assetId")
        requested_branch = cast(UUID, changes.get("branch_id", asset.branch_id))
        self._require_managed_branches(grant, {asset.branch_id, requested_branch})
        if asset.version != expected_version:
            raise ConflictError("El activo cambió; vuelve a cargarlo antes de guardar.", "version")
        if (
            "branch_id" in changes
            and self._repository.get_active_branch(grant.workspace_id, requested_branch) is None
        ):
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        if (
            "category_id" in changes
            and self._repository.get_active_asset_category(
                grant.workspace_id, cast(UUID, changes["category_id"])
            )
            is None
        ):
            raise ResourceNotFoundError(
                "La categoría de activo no existe o no está activa.", "categoryId"
            )
        if "code" in changes:
            code = cast(str | None, changes["code"])
            if code is not None and self._repository.asset_code_exists(
                grant.workspace_id, code, exclude_id=asset.id
            ):
                raise ConflictError("Ya existe un activo con este código.", "code")
        try:
            self._repository.update_asset(
                asset=asset,
                changes=changes,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_asset(grant, asset.id)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "No se pudo actualizar el activo por un conflicto de datos."
            ) from exc

    def create_outbound_movement(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> MovementRecord:
        return self._create_stock_movement(
            principal=principal,
            grant=grant,
            movement_type="outbound",
            values=values,
            idempotency_key=idempotency_key,
        )

    def create_adjustment_movement(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> MovementRecord:
        return self._create_stock_movement(
            principal=principal,
            grant=grant,
            movement_type="adjustment",
            values=values,
            idempotency_key=idempotency_key,
        )

    def _create_stock_movement(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        movement_type: str,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> MovementRecord:
        fingerprint = self._fingerprint({"movementType": movement_type, **values})
        existing = self._repository.movement_by_idempotency_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            if existing.request_fingerprint != fingerprint:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.",
                    "Idempotency-Key",
                )
            return self.get_movement(grant, existing.id)
        branch_id = cast(UUID, values["branch_id"])
        self._require_managed_branch(grant, branch_id)
        warehouse = self._repository.get_warehouse(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            warehouse_id=cast(UUID | None, values.get("warehouse_id")),
        )
        if warehouse is None:
            raise ResourceNotFoundError(
                "El almacén no existe o no pertenece a la sucursal.", "warehouseId"
            )
        employee_id = cast(UUID | None, values.get("employee_id"))
        appointment_id = cast(UUID | None, values.get("appointment_id"))
        if movement_type == "outbound":
            if (
                employee_id is None
                or self._repository.get_employee_name(
                    workspace_id=grant.workspace_id,
                    branch_id=branch_id,
                    employee_id=employee_id,
                )
                is None
            ):
                raise ResourceNotFoundError(
                    "El empleado no existe, no está activo o no pertenece a la sucursal.",
                    "employeeId",
                )
            if (
                appointment_id is not None
                and self._repository.get_appointment_label(
                    workspace_id=grant.workspace_id,
                    branch_id=branch_id,
                    appointment_id=appointment_id,
                    employee_id=employee_id,
                )
                is None
            ):
                raise ResourceNotFoundError(
                    "La cita no existe o no corresponde a la sucursal y empleado.",
                    "appointmentId",
                )
        item_values = {
            cast(UUID, row["item_id"]): cast(Decimal, row["quantity"])
            for row in cast(list[dict[str, Any]], values["items"])
        }
        records = self._repository.lock_stock_records(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            warehouse_id=warehouse.id,
            item_ids=set(item_values),
        )
        # A concurrent request with the same key may have committed while this
        # transaction waited for the stock locks. Re-check before applying a
        # second mutation, then release the locks before loading the replay.
        existing = self._repository.movement_by_idempotency_key(
            grant.workspace_id, idempotency_key
        )
        if existing is not None:
            self._session.rollback()
            if existing.request_fingerprint != fingerprint:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.",
                    "Idempotency-Key",
                )
            return self.get_movement(grant, existing.id)
        if len(records) != len(item_values):
            raise ResourceNotFoundError(
                "Uno o más ítems no existen, no controlan stock o no pertenecen al almacén.",
                "items",
            )
        changes = []
        for record in records:
            requested = item_values[record.item.id]
            before = Decimal(record.balance.quantity)
            new_quantity = before - requested if movement_type == "outbound" else requested
            if new_quantity < 0:
                raise ConflictError(f'"{record.item.name}" no tiene stock suficiente.', "items")
            if new_quantity != before:
                changes.append((record, new_quantity))
        if not changes:
            raise InvalidOperationError("El ajuste no cambia ninguna existencia.", "items")
        try:
            movement_id = self._repository.create_movement(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                warehouse_id=warehouse.id,
                movement_type=movement_type,
                employee_id=employee_id,
                appointment_id=appointment_id,
                comment=cast(str | None, values.get("comment")),
                idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                actor_platform_user_id=principal.platform_user_id,
                changes=changes,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self.get_movement(grant, movement_id)
        except IntegrityError as exc:
            self._session.rollback()
            existing = self._repository.movement_by_idempotency_key(
                grant.workspace_id, idempotency_key
            )
            if existing is not None:
                if existing.request_fingerprint != fingerprint:
                    raise ConflictError(
                        "Idempotency-Key ya fue usado con otro contenido.",
                        "Idempotency-Key",
                    ) from exc
                return self.get_movement(grant, existing.id)
            raise ConflictError(
                "No se pudo registrar el movimiento por un conflicto de datos."
            ) from exc

    def get_movement(self, grant: PermissionGrant, movement_id: UUID) -> MovementRecord:
        record = self._repository.get_movement(
            workspace_id=grant.workspace_id,
            movement_id=movement_id,
            visible_branch_ids=grant.allowed_branch_ids,
        )
        if record is None:
            raise ResourceNotFoundError("El movimiento no existe.", "movementId")
        return record

    def list_movements(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        movement_type: str | None,
        item_id: UUID | None,
        employee_id: UUID | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> MovementPage:
        self._require_visible_branch(grant, branch_id)
        if date_from is not None and date_to is not None:
            if date_to < date_from:
                raise InvalidOperationError("dateTo no puede ser anterior a dateFrom.", "dateTo")
            if (date_to - date_from).days > 366:
                raise InvalidOperationError(
                    "El rango de movimientos no puede superar 366 días.", "dateTo"
                )
        return self._repository.list_movements(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            movement_type=movement_type,
            item_id=item_id,
            employee_id=employee_id,
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def supply_usage(
        self, grant: PermissionGrant, branch_id: UUID | None
    ) -> tuple[SupplyUsageRecord, ...]:
        self._require_visible_branch(grant, branch_id)
        return self._repository.supply_usage(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )

    def _validate_item_references(
        self,
        *,
        workspace_id: UUID,
        category_id: UUID,
        unit_id: UUID,
        branch_id: UUID,
    ) -> None:
        if self._repository.get_active_category(workspace_id, category_id) is None:
            raise ResourceNotFoundError("La categoría no existe o no está activa.", "categoryId")
        if self._repository.get_active_unit(workspace_id, unit_id) is None:
            raise ResourceNotFoundError(
                "La unidad de medida no existe o no está activa.", "unitOfMeasureId"
            )
        if self._repository.get_active_branch(workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")

    @staticmethod
    def _validate_item_kind_fields(
        *,
        item_type: str,
        sale_price: Decimal | None,
        unit_cost: Decimal | None,
        tax_rate: Decimal,
        stock: Decimal | None,
        minimum_stock: Decimal | None,
    ) -> None:
        if item_type == "service":
            if sale_price is None:
                raise InvalidOperationError("El servicio requiere precio de venta.", "salePrice")
            if stock is not None or minimum_stock is not None or unit_cost is not None:
                raise InvalidOperationError(
                    "Los servicios no controlan existencias ni costo unitario.", "stock"
                )
        elif item_type == "supply":
            if unit_cost is None:
                raise InvalidOperationError("El insumo requiere costo unitario.", "unitCost")
            if sale_price is not None or tax_rate != 0:
                raise InvalidOperationError(
                    "Los insumos no tienen precio de venta ni impuesto.", "salePrice"
                )
        elif item_type == "product" and sale_price is None:
            raise InvalidOperationError("El producto requiere precio de venta.", "salePrice")

    @staticmethod
    def _validate_update_kind_fields(item_type: str, changes: dict[str, Any]) -> None:
        if item_type == "service" and ({"unit_cost", "minimum_stock"} & changes.keys()):
            raise InvalidOperationError("Los servicios no controlan existencias ni costo unitario.")
        if item_type == "supply" and ({"sale_price", "tax_rate"} & changes.keys()):
            raise InvalidOperationError("Los insumos no tienen precio de venta ni impuesto.")

    @staticmethod
    def _require_visible_branch(grant: PermissionGrant, branch_id: UUID | None) -> None:
        if (
            branch_id is not None
            and grant.allowed_branch_ids is not None
            and branch_id not in grant.allowed_branch_ids
        ):
            raise AuthorizationError("No puedes consultar una sucursal fuera de tu alcance.")

    @staticmethod
    def _require_managed_branch(grant: PermissionGrant, branch_id: UUID) -> None:
        InventoryService._require_managed_branches(grant, {branch_id})

    @staticmethod
    def _require_managed_branches(grant: PermissionGrant, branch_ids: set[UUID]) -> None:
        if grant.allowed_branch_ids is not None and not branch_ids.issubset(
            grant.allowed_branch_ids
        ):
            raise AuthorizationError("No puedes gestionar inventario fuera de tu alcance.")

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized or None

    @staticmethod
    def _fingerprint(values: dict[str, Any]) -> str:
        encoded = json.dumps(values, sort_keys=True, default=str, separators=(",", ":"))
        return sha256(encoded.encode("utf-8")).hexdigest()


def page_count(total_items: int, page_size: int) -> int:
    return ceil(total_items / page_size) if total_items else 0
