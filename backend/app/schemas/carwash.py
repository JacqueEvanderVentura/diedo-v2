from datetime import datetime
from decimal import Decimal
from typing import Annotated, Self
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ApiModel

Percentage = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]


class CarwashRates(ApiModel):
    washer_rate: Percentage = Decimal("20.00")
    supervisor_rate: Percentage = Decimal("5.00")

    @model_validator(mode="after")
    def valid_total(self) -> Self:
        if self.washer_rate + self.supervisor_rate > 100:
            raise ValueError("La suma de las comisiones no puede superar el 100 %.")
        return self


class NewCarwashCatalogService(ApiModel):
    name: str = Field(min_length=2, max_length=160)
    category_id: UUID
    unit_of_measure_id: UUID
    sale_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    tax_rate: Percentage = Decimal("18.00")

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Ingresa un nombre de al menos dos caracteres.")
        return value


class CreateCarwashService(CarwashRates):
    item_id: UUID | None = None
    new_service: NewCarwashCatalogService | None = None

    @model_validator(mode="after")
    def one_source(self) -> Self:
        if (self.item_id is None) == (self.new_service is None):
            raise ValueError("Selecciona un servicio existente o crea uno nuevo.")
        return self


class CreateCarwashServicesRequest(ApiModel):
    branch_id: UUID
    services: list[CreateCarwashService] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def no_duplicates(self) -> Self:
        ids = [service.item_id for service in self.services if service.item_id]
        if len(ids) != len(set(ids)):
            raise ValueError("No repitas servicios en el mismo registro.")
        return self


class UpdateCarwashServiceRequest(CarwashRates):
    version: int = Field(ge=1)
    # Send all configuration fields together; rates are never patched independently.
    enabled: bool
    washer_rate: Percentage
    supervisor_rate: Percentage


class CarwashCatalogServiceResponse(ApiModel):
    item_id: UUID
    name: str
    category_id: UUID
    category_name: str
    sale_price: Decimal | None
    tax_rate: Decimal | None
    catalog_version: int
    available: bool
    unavailable_reason: str | None


class CarwashServiceResponse(CarwashCatalogServiceResponse):
    id: UUID
    branch_id: UUID
    enabled: bool
    washer_rate: Decimal
    supervisor_rate: Decimal
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedCarwashServicesResponse(ApiModel):
    items: list[CarwashServiceResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class PaginatedCarwashOptionsResponse(ApiModel):
    items: list[CarwashCatalogServiceResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CarwashServiceBatchResponse(ApiModel):
    items: list[CarwashServiceResponse]


class CarwashOptionReference(ApiModel):
    id: UUID
    name: str
    code: str | None = None


class CarwashFormOptionsResponse(ApiModel):
    categories: list[CarwashOptionReference]
    units: list[CarwashOptionReference]
    can_create_services: bool
    employee_count: int | None
