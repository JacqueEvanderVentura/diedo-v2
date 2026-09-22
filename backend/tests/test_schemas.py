from uuid import uuid7

import pytest
from app.schemas.common import ApiModel, ErrorResponse
from app.schemas.crm import CreateLeadRequest, UpdateLeadRequest
from app.schemas.master_data import CreateCustomerRequest, UpdateCustomerRequest
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


def test_instagram_url_is_independent_and_validated_on_leads_and_customers() -> None:
    branch_id = uuid7()
    url = "https://www.instagram.com/helios.test/"
    lead = CreateLeadRequest.model_validate(
        {
            "branchId": branch_id,
            "name": "Helios",
            "website": "https://helios.example",
            "instagramUrl": url,
        }
    )
    assert str(lead.instagram_url) == url
    assert str(lead.website) == "https://helios.example/"
    assert (
        str(UpdateLeadRequest.model_validate({"version": 1, "instagramUrl": url}).instagram_url)
        == url
    )
    customer = CreateCustomerRequest.model_validate(
        {"displayName": "Helios", "branchIds": [branch_id], "instagramUrl": url}
    )
    assert str(customer.instagram_url) == url
    assert (
        str(UpdateCustomerRequest.model_validate({"version": 1, "instagramUrl": url}).instagram_url)
        == url
    )
    with pytest.raises(ValidationError):
        CreateLeadRequest.model_validate(
            {"branchId": branch_id, "name": "Helios", "instagramUrl": "https://example.com/not-ig"}
        )
