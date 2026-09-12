import pytest
from app.services.customer_documents import (
    normalize_document_id,
    prepare_customer_document_fields,
)


def test_normalize_cedula_digits() -> None:
    assert normalize_document_id("cedula", "001-1234567-8") == "00112345678"


def test_prepare_cedula_formats_display() -> None:
    doc_type, display, normalized = prepare_customer_document_fields("cedula", "00112345678")
    assert doc_type == "cedula"
    assert normalized == "00112345678"
    assert display == "001-1234567-8"


def test_prepare_cedula_rejects_short_values() -> None:
    with pytest.raises(ValueError, match="11 dígitos"):
        prepare_customer_document_fields("cedula", "123")
