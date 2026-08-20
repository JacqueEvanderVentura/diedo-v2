import pytest
from app.schemas.common import ApiModel, ErrorResponse
from pydantic import ValidationError


class ExampleSchema(ApiModel):
    created_by: str


def test_api_schema_reads_and_writes_camel_case() -> None:
    schema = ExampleSchema.model_validate({"createdBy": "user-1"})

    assert schema.created_by == "user-1"
    assert schema.model_dump() == {"createdBy": "user-1"}


def test_api_schema_forbids_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        ExampleSchema.model_validate({"createdBy": "user-1", "unknown": True})


def test_error_response_defaults_parameter_to_none() -> None:
    response = ErrorResponse(message="Not found")

    assert response.model_dump() == {"message": "Not found", "parameter": None}
