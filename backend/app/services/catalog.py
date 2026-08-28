from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from typing import cast
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.repositories.catalog import (
    CatalogRepository,
    CategoryRecord,
    ProductRecord,
    UnitOfMeasureRecord,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import AuthorizationError, ConflictError, ResourceNotFoundError


@dataclass(frozen=True)
class CategoryListResult:
    items: tuple[CategoryRecord, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


@dataclass(frozen=True)
class ProductListResult:
    items: tuple[ProductRecord, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


def normalize_catalog_name(value: str) -> str:
    return " ".join(value.split())


def normalize_category_key(value: str) -> str:
    return normalize_catalog_name(value).casefold()


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def normalize_sku(value: str | None) -> str | None:
    normalized = normalize_optional_text(value)
    return normalized.upper() if normalized is not None else None


class CatalogService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = CatalogRepository(session)

    def list_categories(
        self,
        *,
        grant: PermissionGrant,
        search: str | None,
        status: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> CategoryListResult:
        result = self._repository.list_categories(
            workspace_id=grant.workspace_id,
            search=normalize_optional_text(search),
            status=status,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )
        return CategoryListResult(
            items=result.items,
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        )

    def get_category(self, grant: PermissionGrant, category_id: UUID) -> CategoryRecord:
        category = self._repository.get_category(grant.workspace_id, category_id)
        if category is None:
            raise ResourceNotFoundError("La categoría no existe.", "categoryId")
        return CategoryRecord(
            id=category.id,
            name=category.name,
            description=category.description,
            status=category.status,
            version=category.version,
            created_at=category.created_at,
            updated_at=category.updated_at,
        )

    def create_category(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        name: str,
        description: str | None,
        status: str,
    ) -> CategoryRecord:
        self._require_workspace_wide(grant)
        normalized_name = normalize_catalog_name(name)
        category_key = normalize_category_key(normalized_name)
        if self._repository.category_name_exists(grant.workspace_id, category_key):
            raise ConflictError("Ya existe una categoría con este nombre.", "name")
        try:
            category = self._repository.create_category(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                name=normalized_name,
                normalized_name=category_key,
                description=normalize_optional_text(description),
                status=status,
                request_id=get_request_id(),
            )
            self._session.commit()
            return category
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo crear la categoría por un conflicto de datos.") from exc

    def update_category(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        category_id: UUID,
        expected_version: int,
        changes: dict[str, object],
    ) -> CategoryRecord:
        self._require_workspace_wide(grant)
        category = self._repository.get_category_for_update(grant.workspace_id, category_id)
        if category is None:
            raise ResourceNotFoundError("La categoría no existe.", "categoryId")
        if category.version != expected_version:
            raise ConflictError(
                "La categoría cambió; vuelve a cargarla antes de guardar.",
                "version",
            )
        normalized_changes = dict(changes)
        if "name" in normalized_changes:
            name = normalize_catalog_name(cast(str, normalized_changes["name"]))
            category_key = normalize_category_key(name)
            if self._repository.category_name_exists(
                grant.workspace_id, category_key, exclude_id=category.id
            ):
                raise ConflictError("Ya existe una categoría con este nombre.", "name")
            normalized_changes["name"] = name
            normalized_changes["normalized_name"] = category_key
        if "description" in normalized_changes:
            normalized_changes["description"] = normalize_optional_text(
                cast(str | None, normalized_changes["description"])
            )
        if normalized_changes.get("status") == "archived" and (
            self._repository.category_has_non_archived_items(grant.workspace_id, category.id)
        ):
            raise ConflictError(
                "No puedes archivar una categoría con productos no archivados.",
                "status",
            )
        try:
            result = self._repository.update_category(
                category=category,
                changes=normalized_changes,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return result
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "No se pudo actualizar la categoría por un conflicto de datos."
            ) from exc

    def list_units_of_measure(self, grant: PermissionGrant) -> tuple[UnitOfMeasureRecord, ...]:
        return self._repository.list_units_of_measure(grant.workspace_id)

    def list_products(
        self,
        *,
        grant: PermissionGrant,
        search: str | None,
        status: str | None,
        category_id: UUID | None,
        branch_id: UUID | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> ProductListResult:
        self._require_visible_branch(grant, branch_id)
        result = self._repository.list_products(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            search=normalize_optional_text(search),
            status=status,
            category_id=category_id,
            branch_id=branch_id,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )
        return ProductListResult(
            items=result.items,
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        )

    def get_product(self, grant: PermissionGrant, product_id: UUID) -> ProductRecord:
        product = self._repository.get_product(
            workspace_id=grant.workspace_id,
            product_id=product_id,
            visible_branch_ids=grant.allowed_branch_ids,
        )
        if product is None:
            raise ResourceNotFoundError("El producto no existe.", "productId")
        return product

    def create_product(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        name: str,
        description: str | None,
        sku: str | None,
        category_id: UUID,
        unit_of_measure_id: UUID,
        branch_ids: list[UUID],
        status: str,
    ) -> ProductRecord:
        requested_branch_ids = set(branch_ids)
        self._require_managed_branches(grant, requested_branch_ids)
        self._validate_product_references(
            workspace_id=grant.workspace_id,
            category_id=category_id,
            unit_of_measure_id=unit_of_measure_id,
            branch_ids=requested_branch_ids,
        )
        normalized_sku = normalize_sku(sku)
        if normalized_sku is not None and self._repository.sku_exists(
            grant.workspace_id, normalized_sku
        ):
            raise ConflictError("Ya existe un producto con este SKU.", "sku")
        try:
            product_id = self._repository.create_product(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                name=normalize_catalog_name(name),
                description=normalize_optional_text(description),
                sku=normalized_sku,
                category_id=category_id,
                unit_of_measure_id=unit_of_measure_id,
                branch_ids=requested_branch_ids,
                status=status,
                request_id=get_request_id(),
            )
            product = self._repository.get_product(
                workspace_id=grant.workspace_id,
                product_id=product_id,
                visible_branch_ids=grant.allowed_branch_ids,
            )
            if product is None:
                raise RuntimeError("Created product could not be reloaded.")
            self._session.commit()
            return product
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo crear el producto por un conflicto de datos.") from exc

    def update_product(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        product_id: UUID,
        expected_version: int,
        changes: dict[str, object],
    ) -> ProductRecord:
        item = self._repository.get_product_for_update(grant.workspace_id, product_id)
        if item is None:
            raise ResourceNotFoundError("El producto no existe.", "productId")
        if item.version != expected_version:
            raise ConflictError(
                "El producto cambió; vuelve a cargarlo antes de guardar.",
                "version",
            )
        current_branch_ids = self._repository.active_branch_ids(grant.workspace_id, item.id)
        requested_branch_ids = (
            set(cast(list[UUID], changes["branch_ids"]))
            if "branch_ids" in changes
            else current_branch_ids
        )
        self._require_managed_branches(grant, current_branch_ids | requested_branch_ids)

        normalized_changes = dict(changes)
        normalized_changes.pop("branch_ids", None)
        if "name" in normalized_changes:
            normalized_changes["name"] = normalize_catalog_name(
                cast(str, normalized_changes["name"])
            )
        if "description" in normalized_changes:
            normalized_changes["description"] = normalize_optional_text(
                cast(str | None, normalized_changes["description"])
            )
        if "sku" in normalized_changes:
            normalized_sku = normalize_sku(cast(str | None, normalized_changes["sku"]))
            if normalized_sku is not None and self._repository.sku_exists(
                grant.workspace_id, normalized_sku, exclude_id=item.id
            ):
                raise ConflictError("Ya existe un producto con este SKU.", "sku")
            normalized_changes["sku"] = normalized_sku

        category_id = cast(UUID, normalized_changes.get("category_id", item.category_id))
        unit_of_measure_id = cast(
            UUID,
            normalized_changes.get("unit_of_measure_id", item.unit_of_measure_id),
        )
        if (
            "category_id" in normalized_changes
            or "unit_of_measure_id" in normalized_changes
            or "branch_ids" in changes
        ):
            self._validate_product_references(
                workspace_id=grant.workspace_id,
                category_id=category_id,
                unit_of_measure_id=unit_of_measure_id,
                branch_ids=requested_branch_ids,
            )
        try:
            self._repository.update_product(
                item=item,
                changes=normalized_changes,
                branch_ids=requested_branch_ids if "branch_ids" in changes else None,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            product = self._repository.get_product(
                workspace_id=grant.workspace_id,
                product_id=item.id,
                visible_branch_ids=grant.allowed_branch_ids,
            )
            if product is None:
                raise RuntimeError("Updated product could not be reloaded.")
            self._session.commit()
            return product
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "No se pudo actualizar el producto por un conflicto de datos."
            ) from exc

    def _validate_product_references(
        self,
        *,
        workspace_id: UUID,
        category_id: UUID,
        unit_of_measure_id: UUID,
        branch_ids: set[UUID],
    ) -> None:
        category = self._repository.get_category(workspace_id, category_id)
        if category is None or category.status != "active":
            raise ResourceNotFoundError(
                "La categoría no existe o no está activa.",
                "categoryId",
            )
        unit = self._repository.get_unit_of_measure(workspace_id, unit_of_measure_id)
        if unit is None:
            raise ResourceNotFoundError(
                "La unidad de medida no existe o no está activa.",
                "unitOfMeasureId",
            )
        branches = self._repository.get_active_branches(workspace_id, branch_ids)
        if len(branches) != len(branch_ids):
            raise ResourceNotFoundError(
                "Una o más sucursales no existen o no están activas.",
                "branchIds",
            )

    @staticmethod
    def _require_workspace_wide(grant: PermissionGrant) -> None:
        if not grant.workspace_wide:
            raise AuthorizationError(
                "Gestionar categorías requiere alcance sobre todo el workspace."
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
            raise AuthorizationError(
                "No puedes gestionar un producto asignado fuera de tu alcance."
            )
