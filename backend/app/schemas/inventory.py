from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Self
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ApiModel

InventoryItemType = Literal["product", "service", "supply"]
InventoryItemStatus = Literal["active", "inactive", "archived"]
CreateInventoryStatus = Literal["active", "inactive"]
InventoryStockStatus = Literal["available", "low", "out", "not_tracked"]
InventoryStockFilter = Literal["available", "low", "out"]
InventoryMovementType = Literal["opening", "outbound", "adjustment", "inbound"]
AssetStatus = Literal["activo", "reparacion", "baja"]
ReferenceStatus = Literal["active", "inactive", "archived"]
SortDirection = Literal["asc", "desc"]
InventoryItemSortField = Literal[
    "name", "sku", "itemType", "stock", "minimumStock", "createdAt", "updatedAt"
]
AssetSortField = Literal["name", "code", "category", "status", "value", "createdAt"]
MovementSortField = Literal["createdAt", "type", "employee"]


def _normalize_required_text(value: str) -> str:
    return " ".join(value.split())


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.split())
    return normalized or None


def _normalize_code(value: str | None) -> str | None:
    normalized = _normalize_optional_text(value)
    return normalized.upper() if normalized is not None else None


class InventorySummaryResponse(ApiModel):
    total_products: int
    total_supplies: int
    low_stock: int
    out_of_stock: int
    total_value: Decimal


class InventoryBranchReference(ApiModel):
    id: UUID
    code: str
    name: str


class InventoryCategoryReference(ApiModel):
    id: UUID
    name: str


class InventoryUnitReference(ApiModel):
    id: UUID
    code: str
    name: str
    symbol: str


class InventoryWarehouseResponse(ApiModel):
    id: UUID
    branch: InventoryBranchReference
    code: str
    name: str
    is_default: bool
    status: ReferenceStatus
    version: int


class InventoryStockLocationResponse(ApiModel):
    branch: InventoryBranchReference
    warehouse_id: UUID
    warehouse_name: str
    quantity: Decimal
    minimum_stock: Decimal
    stock_status: Literal["available", "low", "out"]
    version: int


class InventoryItemResponse(ApiModel):
    id: UUID
    item_type: InventoryItemType
    name: str
    description: str | None
    sku: str | None
    category: InventoryCategoryReference
    unit_of_measure: InventoryUnitReference
    branches: list[InventoryBranchReference]
    stock_locations: list[InventoryStockLocationResponse]
    sale_price: Decimal | None
    unit_cost: Decimal | None
    tax_rate: Decimal
    stock_quantity: Decimal | None
    minimum_stock: Decimal | None
    stock_status: InventoryStockStatus
    status: InventoryItemStatus
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedInventoryItemsResponse(ApiModel):
    items: list[InventoryItemResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class _CreateInventoryItemBase(ApiModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    sku: str | None = Field(default=None, max_length=64)
    category_id: UUID
    unit_of_measure_id: UUID
    branch_id: UUID
    warehouse_id: UUID | None = None
    status: CreateInventoryStatus = "active"

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = _normalize_required_text(value)
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str | None) -> str | None:
        return _normalize_code(value)


class CreateInventoryProductRequest(_CreateInventoryItemBase):
    sale_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    unit_cost: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    tax_rate: Decimal = Field(default=Decimal("18"), ge=0, le=100, decimal_places=2)
    stock: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=3)
    minimum_stock: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=3)


class CreateInventorySupplyRequest(_CreateInventoryItemBase):
    unit_cost: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    stock: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=3)
    minimum_stock: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=3)


class CreateInventoryServiceRequest(_CreateInventoryItemBase):
    sale_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    tax_rate: Decimal = Field(default=Decimal("18"), ge=0, le=100, decimal_places=2)


class UpdateInventoryItemRequest(ApiModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    sku: str | None = Field(default=None, max_length=64)
    category_id: UUID | None = None
    unit_of_measure_id: UUID | None = None
    sale_price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    unit_cost: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    tax_rate: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    branch_id: UUID | None = None
    warehouse_id: UUID | None = None
    minimum_stock: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=3)
    status: InventoryItemStatus | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return _normalize_required_text(value) if value is not None else None

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str | None) -> str | None:
        return _normalize_code(value)

    @model_validator(mode="after")
    def validate_changes(self) -> Self:
        changed = self.model_fields_set - {"version"}
        if not changed:
            raise ValueError("Debes enviar al menos un cambio.")
        non_nullable = {
            "name",
            "category_id",
            "unit_of_measure_id",
            "tax_rate",
            "minimum_stock",
            "status",
        }
        if any(name in changed and getattr(self, name) is None for name in non_nullable):
            raise ValueError("Este campo no puede ser nulo.")
        if "minimum_stock" in changed and self.branch_id is None:
            raise ValueError("Indica branchId para cambiar el stock mínimo.")
        if self.warehouse_id is not None and self.branch_id is None:
            raise ValueError("Indica branchId junto con warehouseId.")
        return self


class AssetCategoryResponse(ApiModel):
    id: UUID
    code: str
    name: str
    status: ReferenceStatus
    version: int


class CreateAssetCategoryRequest(ApiModel):
    code: str = Field(min_length=2, max_length=48)
    name: str = Field(min_length=2, max_length=120)

    @field_validator("code")
    @classmethod
    def normalize_category_code(cls, value: str) -> str:
        return value.strip().casefold().replace(" ", "-")

    @field_validator("name")
    @classmethod
    def normalize_category_name(cls, value: str) -> str:
        return _normalize_required_text(value)


class AssetSummaryResponse(ApiModel):
    total_value: Decimal
    operational: int
    in_repair: int
    retired: int


class AssetResponse(ApiModel):
    id: UUID
    name: str
    code: str | None
    category: AssetCategoryResponse
    branch: InventoryBranchReference
    acquisition_value: Decimal
    status: AssetStatus
    location: str | None
    purchase_date: date | None
    notes: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedAssetsResponse(ApiModel):
    items: list[AssetResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateAssetRequest(ApiModel):
    name: str = Field(min_length=2, max_length=160)
    code: str | None = Field(default=None, max_length=64)
    category_id: UUID
    branch_id: UUID
    acquisition_value: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    status: AssetStatus = "activo"
    location: str | None = Field(default=None, max_length=240)
    purchase_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("code")
    @classmethod
    def normalize_asset_code(cls, value: str | None) -> str | None:
        return _normalize_code(value)

    @field_validator("location", "notes")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class UpdateAssetRequest(ApiModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=2, max_length=160)
    code: str | None = Field(default=None, max_length=64)
    category_id: UUID | None = None
    branch_id: UUID | None = None
    acquisition_value: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    status: AssetStatus | None = None
    location: str | None = Field(default=None, max_length=240)
    purchase_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return _normalize_required_text(value) if value is not None else None

    @field_validator("code")
    @classmethod
    def normalize_asset_code(cls, value: str | None) -> str | None:
        return _normalize_code(value)

    @field_validator("location", "notes")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def validate_changes(self) -> Self:
        changed = self.model_fields_set - {"version"}
        if not changed:
            raise ValueError("Debes enviar al menos un cambio.")
        non_nullable = {
            "name",
            "category_id",
            "branch_id",
            "acquisition_value",
            "status",
        }
        if any(name in changed and getattr(self, name) is None for name in non_nullable):
            raise ValueError("Este campo no puede ser nulo.")
        return self


class OutboundMovementItemRequest(ApiModel):
    item_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)


class CreateOutboundMovementRequest(ApiModel):
    branch_id: UUID
    warehouse_id: UUID | None = None
    employee_id: UUID
    appointment_id: UUID | None = None
    comment: str | None = Field(default=None, max_length=1000)
    items: list[OutboundMovementItemRequest] = Field(min_length=1, max_length=100)

    @field_validator("comment")
    @classmethod
    def normalize_comment(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("items")
    @classmethod
    def reject_duplicate_items(
        cls, value: list[OutboundMovementItemRequest]
    ) -> list[OutboundMovementItemRequest]:
        ids = [item.item_id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("No repitas ítems en el movimiento.")
        return value


class AdjustmentMovementItemRequest(ApiModel):
    item_id: UUID
    quantity: Decimal = Field(ge=0, max_digits=14, decimal_places=3)


class CreateAdjustmentMovementRequest(ApiModel):
    branch_id: UUID
    warehouse_id: UUID | None = None
    comment: str = Field(min_length=2, max_length=1000)
    items: list[AdjustmentMovementItemRequest] = Field(min_length=1, max_length=100)

    @field_validator("comment")
    @classmethod
    def normalize_comment(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("items")
    @classmethod
    def reject_duplicate_items(
        cls, value: list[AdjustmentMovementItemRequest]
    ) -> list[AdjustmentMovementItemRequest]:
        ids = [item.item_id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("No repitas ítems en el movimiento.")
        return value


class InventoryMovementLineResponse(ApiModel):
    id: UUID
    item_id: UUID
    item_name: str
    item_sku: str | None
    unit_symbol: str
    quantity_delta: Decimal
    quantity_before: Decimal
    quantity_after: Decimal
    unit_cost: Decimal | None


class InventoryEmployeeReference(ApiModel):
    id: UUID
    name: str


class InventoryAppointmentReference(ApiModel):
    id: UUID
    label: str


class InventoryMovementResponse(ApiModel):
    id: UUID
    movement_type: InventoryMovementType
    branch: InventoryBranchReference
    warehouse: InventoryWarehouseResponse
    employee: InventoryEmployeeReference | None
    appointment: InventoryAppointmentReference | None
    comment: str | None
    items: list[InventoryMovementLineResponse]
    created_by: str
    created_at: datetime


class PaginatedInventoryMovementsResponse(ApiModel):
    items: list[InventoryMovementResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class SupplyUsageResponse(ApiModel):
    employee_id: UUID
    employee_name: str
    supply_id: UUID
    supply_name: str
    quantity: Decimal
    appointments_count: int
    per_appointment: Decimal | None
