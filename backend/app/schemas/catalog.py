from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ApiModel

CatalogStatus = Literal["active", "inactive", "archived"]
CreateCatalogStatus = Literal["active", "inactive"]
CatalogItemType = Literal["product", "service", "membership", "other"]
SortDirection = Literal["asc", "desc"]
CategorySortField = Literal["name", "status", "createdAt", "updatedAt"]
ProductSortField = Literal["name", "sku", "status", "createdAt", "updatedAt"]


def _normalized_name(value: str) -> str:
    return " ".join(value.split())


def _normalized_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalized_sku(value: str | None) -> str | None:
    normalized = _normalized_optional_text(value)
    return normalized.upper() if normalized is not None else None


class CategoryResponse(ApiModel):
    id: UUID
    name: str
    description: str | None
    status: CatalogStatus
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedCategoriesResponse(ApiModel):
    items: list[CategoryResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateCategoryRequest(ApiModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    status: CreateCatalogStatus = "active"

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = _normalized_name(value)
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return _normalized_optional_text(value)


class UpdateCategoryRequest(ApiModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    status: CatalogStatus | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = _normalized_name(value)
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return _normalized_optional_text(value)

    @model_validator(mode="after")
    def validate_changes(self) -> Self:
        changed_fields = self.model_fields_set - {"version"}
        if not changed_fields:
            raise ValueError("Debes enviar al menos un cambio.")
        if "name" in changed_fields and self.name is None:
            raise ValueError("El nombre no puede ser nulo.")
        if "status" in changed_fields and self.status is None:
            raise ValueError("El estado no puede ser nulo.")
        return self


class UnitOfMeasureResponse(ApiModel):
    id: UUID
    code: str
    name: str
    symbol: str


class ProductCategoryReference(ApiModel):
    id: UUID
    name: str


class ProductBranchReference(ApiModel):
    id: UUID
    code: str
    name: str


class ProductResponse(ApiModel):
    id: UUID
    item_type: CatalogItemType
    name: str
    description: str | None
    sku: str | None
    category: ProductCategoryReference
    unit_of_measure: UnitOfMeasureResponse
    branches: list[ProductBranchReference]
    status: CatalogStatus
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedProductsResponse(ApiModel):
    items: list[ProductResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateProductRequest(ApiModel):
    item_type: CatalogItemType = "product"
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    sku: str | None = Field(default=None, max_length=64)
    category_id: UUID
    unit_of_measure_id: UUID
    branch_ids: list[UUID] = Field(min_length=1, max_length=100)
    status: CreateCatalogStatus = "active"

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = _normalized_name(value)
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return _normalized_optional_text(value)

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str | None) -> str | None:
        return _normalized_sku(value)

    @field_validator("branch_ids")
    @classmethod
    def reject_duplicate_branches(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("No repitas sucursales.")
        return value


class UpdateProductRequest(ApiModel):
    version: int = Field(ge=1)
    item_type: CatalogItemType | None = None
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    sku: str | None = Field(default=None, max_length=64)
    category_id: UUID | None = None
    unit_of_measure_id: UUID | None = None
    branch_ids: list[UUID] | None = Field(default=None, min_length=1, max_length=100)
    status: CatalogStatus | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = _normalized_name(value)
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return _normalized_optional_text(value)

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str | None) -> str | None:
        return _normalized_sku(value)

    @field_validator("branch_ids")
    @classmethod
    def reject_duplicate_branches(cls, value: list[UUID] | None) -> list[UUID] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("No repitas sucursales.")
        return value

    @model_validator(mode="after")
    def validate_changes(self) -> Self:
        changed_fields = self.model_fields_set - {"version"}
        if not changed_fields:
            raise ValueError("Debes enviar al menos un cambio.")
        non_nullable_fields = {
            "item_type",
            "name",
            "category_id",
            "unit_of_measure_id",
            "branch_ids",
            "status",
        }
        if any(
            field in changed_fields and getattr(self, field) is None
            for field in non_nullable_fields
        ):
            raise ValueError("Este campo no puede ser nulo.")
        return self
