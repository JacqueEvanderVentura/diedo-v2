from __future__ import annotations

from typing import Any

from app.db.models.foundation import Branch, Workspace
from app.schemas.administration import BranchBillingDocuments, BranchDetails


def _merge_billing(
    workspace_docs: dict[str, Any],
    branch: Branch | None,
) -> BranchBillingDocuments:
    workspace_billing = BranchBillingDocuments.model_validate(workspace_docs or {})
    merged = workspace_billing.model_dump()
    if branch is not None:
        branch_details = BranchDetails.model_validate(branch.configuration or {})
        branch_billing = branch_details.billing_documents
        if branch_billing is not None:
            for key, value in branch_billing.model_dump().items():
                if value is not None and str(value).strip() != "":
                    merged[key] = value
    return BranchBillingDocuments.model_validate(merged)


def resolve_billing_branding(
    workspace: Workspace,
    branch: Branch | None,
) -> dict[str, str]:
    billing = _merge_billing(workspace.billing_documents or {}, branch)
    branch_details = (
        BranchDetails.model_validate(branch.configuration or {}) if branch is not None else None
    )
    trade_name = (billing.trade_name or "").strip()
    business_name = trade_name or workspace.name or "Helios 360"
    address = (billing.address or "").strip()
    if not address and branch_details is not None:
        address = (branch_details.address or "").strip()
    phone = (billing.phone or "").strip()
    if not phone and branch_details is not None:
        phone = (branch_details.phone or "").strip()
    email = billing.email
    if email is None and branch_details is not None:
        email = branch_details.email
    email_str = str(email).strip() if email is not None else ""
    return {
        "business_name": business_name,
        "legal_name": (billing.legal_name or "").strip(),
        "business_rnc": (billing.rnc or "").strip(),
        "business_address": address,
        "business_phone": phone,
        "business_email": email_str,
        "logo_data_url": billing.logo_data_url or "",
        "footer_note": (billing.footer_note or "").strip(),
        "region": workspace.locale or "",
    }


def format_customer_tax_line(
    *,
    customer_type: str | None,
    document_type: str | None,
    document_id: str | None,
) -> str:
    doc = (document_id or "").strip()
    if not doc:
        return ""
    if customer_type == "business":
        return f"RNC: {doc}"
    if document_type == "pasaporte":
        return f"Pasaporte: {doc}"
    return f"Cédula: {doc}"
