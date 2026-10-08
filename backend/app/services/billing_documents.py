from __future__ import annotations

from typing import Any
from uuid import UUID, uuid7

from app.schemas.administration import (
    BillingDocumentTemplate,
    BranchBillingDocuments,
    WorkspaceBillingDocuments,
)


def normalize_workspace_billing_documents(raw: Any) -> WorkspaceBillingDocuments:
    return WorkspaceBillingDocuments.model_validate(raw or {})


def resolve_billing_template(
    workspace_docs: dict[str, Any] | None,
    branch_id: UUID | None,
) -> BillingDocumentTemplate:
    workspace = normalize_workspace_billing_documents(workspace_docs)
    templates = workspace.templates
    if branch_id is not None:
        for template in templates:
            if branch_id in template.branch_ids:
                return template
    return templates[0]


def template_to_branch_billing(template: BillingDocumentTemplate) -> BranchBillingDocuments:
    return BranchBillingDocuments.model_validate(template.model_dump())


def default_workspace_billing_documents() -> dict[str, Any]:
    template_id = uuid7()
    documents = WorkspaceBillingDocuments(
        templates=[
            BillingDocumentTemplate(
                id=template_id,
                name="Principal",
                branch_ids=[],
            )
        ]
    )
    return documents.model_dump(mode="json")
