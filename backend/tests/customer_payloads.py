from uuid import UUID


def customer_create_payload(
    *,
    display_name: str,
    branch_id: UUID,
    document_suffix: str = "8",
) -> dict[str, object]:
    """Build a valid interactive customer create body with a unique cédula suffix."""
    tail = document_suffix.zfill(1)[-1]
    digits = f"0011234567{tail}"
    return {
        "displayName": display_name,
        "documentType": "cedula",
        "documentId": f"{digits[:3]}-{digits[3:10]}-{digits[10]}",
        "branchIds": [str(branch_id)],
    }


def lead_document_fields(document_suffix: str = "1") -> dict[str, str]:
    tail = document_suffix.zfill(1)[-1]
    digits = f"0011234567{tail}"
    return {
        "documentType": "cedula",
        "documentId": f"{digits[:3]}-{digits[3:10]}-{digits[10]}",
    }
