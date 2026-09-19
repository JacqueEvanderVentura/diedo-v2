from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """Base schema for camelCase JSON and snake_case Python fields."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
    )


class ImportRowModel(ApiModel):
    """CSV import rows may include helper columns that are not API fields."""

    model_config = ConfigDict(extra="ignore")


class ErrorResponse(ApiModel):
    message: str
    parameter: str | None = None


class SimpleOptionResponse(ApiModel):
    id: UUID
    name: str
