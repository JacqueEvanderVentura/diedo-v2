from uuid import UUID, uuid7


def unique_cedula_document_id() -> str:
    digits = f"{int(uuid7().hex[:12], 16) % 10**11:011d}"
    return f"{digits[:3]}-{digits[3:10]}-{digits[10]}"


def customer_create_payload(
    *,
    display_name: str,
    branch_id: UUID,
    document_suffix: str = "8",
) -> dict[str, object]:
    """Build a valid interactive customer create body with a unique cédula."""
    _ = document_suffix  # kept for call-site compatibility; identity is always unique
    return {
        "displayName": display_name,
        "documentType": "cedula",
        "documentId": unique_cedula_document_id(),
        "branchIds": [str(branch_id)],
    }


def _cedula_tail_from_suffix(document_suffix: str) -> str:
    raw = (document_suffix or "1")[-1]
    if raw.isdigit():
        return raw
    return str(int(raw, 16) % 10)


def lead_document_fields(document_suffix: str = "1") -> dict[str, str]:
    tail = _cedula_tail_from_suffix(document_suffix)
    digits = f"0011234567{tail}"
    return {
        "documentType": "cedula",
        "documentId": f"{digits[:3]}-{digits[3:10]}-{digits[10]}",
    }


def unique_lead_document_fields() -> dict[str, str]:
    return {
        "documentType": "cedula",
        "documentId": unique_cedula_document_id(),
    }
