from __future__ import annotations

import re
from typing import Literal

CustomerDocumentType = Literal["cedula", "pasaporte"]


def normalize_document_id(document_type: str | None, document_id: str | None) -> str | None:
    if not document_id:
        return None
    raw = document_id.strip()
    if not raw:
        return None
    if document_type == "pasaporte":
        normalized = re.sub(r"[^0-9A-Za-z]", "", raw).upper()
        return normalized or None
    digits = re.sub(r"\D", "", raw)
    return digits or None


def format_document_display(document_type: str | None, document_id: str | None) -> str | None:
    if not document_id:
        return None
    normalized = normalize_document_id(document_type, document_id)
    if not normalized:
        return None
    if document_type == "cedula" and len(normalized) == 11:
        return f"{normalized[:3]}-{normalized[3:10]}-{normalized[10]}"
    return document_id.strip()


def prepare_customer_document_fields(
    document_type: str | None,
    document_id: str | None,
) -> tuple[str | None, str | None, str | None]:
    if document_type is None and document_id is None:
        return None, None, None
    if document_type is None or document_id is None:
        raise ValueError("documentType y documentId deben enviarse juntos.")
    if document_type not in {"cedula", "pasaporte"}:
        raise ValueError("documentType inválido.")
    normalized = normalize_document_id(document_type, document_id)
    if not normalized:
        raise ValueError("documentId inválido.")
    if document_type == "cedula" and len(normalized) != 11:
        raise ValueError("La cédula debe tener 11 dígitos.")
    display = format_document_display(document_type, normalized) or normalized
    return document_type, display, normalized
