from app.core.errors import (
    friendly_validation_message,
    parameter_from_validation_location,
    raise_api_error,
)
from app.main import create_app
from app.schemas.common import ApiModel
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import Field


class ExamplePayload(ApiModel):
    item_name: str = Field(min_length=2)


def build_error_test_app() -> FastAPI:
    application = create_app()

    @application.post("/test-validation")
    def validate_payload(payload: ExamplePayload) -> ExamplePayload:
        return payload

    @application.get("/test-conflict")
    def conflict() -> None:
        raise_api_error(409, "El registro ya existe.", "itemName")

    @application.get("/test-crash")
    def crash() -> None:
        raise RuntimeError("internal database detail")

    return application


def test_validation_error_uses_public_error_contract() -> None:
    with TestClient(build_error_test_app(), raise_server_exceptions=False) as client:
        response = client.post("/test-validation", json={})

    assert response.status_code == 400
    assert response.json() == {
        "message": "Este campo es obligatorio.",
        "parameter": "itemName",
    }


def test_expected_error_uses_public_error_contract() -> None:
    with TestClient(build_error_test_app(), raise_server_exceptions=False) as client:
        response = client.get("/test-conflict")

    assert response.status_code == 409
    assert response.json() == {
        "message": "El registro ya existe.",
        "parameter": "itemName",
    }


def test_unhandled_error_does_not_leak_internal_details() -> None:
    with TestClient(build_error_test_app(), raise_server_exceptions=False) as client:
        response = client.get("/test-crash")

    assert response.status_code == 500
    assert response.json() == {
        "message": "Error interno del servidor.",
        "parameter": None,
    }
    assert "database" not in response.text


def test_validation_location_formats_nested_array_path() -> None:
    assert parameter_from_validation_location(("body", "items", 2, "unitPrice")) == (
        "items[2].unitPrice"
    )
    assert parameter_from_validation_location((0, "name")) == "[0].name"
    assert parameter_from_validation_location(()) is None


def test_validation_messages_cover_common_types() -> None:
    expected = {
        "string_type": "Tipo de valor incorrecto para este campo.",
        "string_too_short": "El texto es demasiado corto.",
        "string_too_long": "El texto es demasiado largo.",
        "int_parsing": "Debe ser un numero entero.",
        "float_parsing": "Debe ser un numero.",
        "bool_parsing": "Debe ser verdadero o falso.",
    }
    for error_type, message in expected.items():
        assert friendly_validation_message({"type": error_type}) == message
    assert friendly_validation_message({"type": "unknown", "msg": "Custom"}) == "Custom"
    assert friendly_validation_message({"type": "unknown"}) == "Solicitud invalida."
