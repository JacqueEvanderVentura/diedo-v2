from uuid import uuid7

import pytest
from app.schemas.administration import WorkspaceBillingDocuments
from app.services.billing_documents import resolve_billing_template, template_to_branch_billing
from pydantic import ValidationError


def test_workspace_billing_wraps_legacy_flat_shape() -> None:
    documents = WorkspaceBillingDocuments.model_validate(
        {
            "trade_name": "Helios Spa",
            "rnc": "1-3290890-2",
        }
    )
    assert len(documents.templates) == 1
    assert documents.templates[0].name == "Principal"
    assert documents.templates[0].trade_name == "Helios Spa"
    assert documents.templates[0].rnc == "1-3290890-2"
    assert documents.templates[0].branch_ids == []


def test_workspace_billing_requires_at_least_one_template() -> None:
    with pytest.raises(ValidationError):
        WorkspaceBillingDocuments.model_validate({"templates": []})


def test_workspace_billing_rejects_duplicate_branch_assignments() -> None:
    branch_id = uuid7()
    template_a = uuid7()
    template_b = uuid7()
    with pytest.raises(ValidationError):
        WorkspaceBillingDocuments.model_validate(
            {
                "templates": [
                    {
                        "id": template_a,
                        "name": "A",
                        "branch_ids": [branch_id],
                    },
                    {
                        "id": template_b,
                        "name": "B",
                        "branch_ids": [branch_id],
                    },
                ]
            }
        )


def test_template_to_branch_billing_strips_template_metadata() -> None:
    workspace_docs = WorkspaceBillingDocuments.model_validate(
        {
            "templates": [
                {
                    "id": uuid7(),
                    "name": "Principal",
                    "trade_name": "Helios Spa",
                    "rnc": "1-3290890-2",
                    "branch_ids": [],
                }
            ]
        }
    )
    branch_billing = template_to_branch_billing(workspace_docs.templates[0])
    assert branch_billing.trade_name == "Helios Spa"
    assert branch_billing.rnc == "1-3290890-2"


def test_resolve_billing_template_prefers_branch_assignment() -> None:
    branch_id = uuid7()
    other_branch = uuid7()
    workspace_docs = WorkspaceBillingDocuments.model_validate(
        {
            "templates": [
                {
                    "id": uuid7(),
                    "name": "Default",
                    "trade_name": "General",
                    "branch_ids": [],
                },
                {
                    "id": uuid7(),
                    "name": "Norte",
                    "trade_name": "Sucursal Norte",
                    "branch_ids": [branch_id],
                },
            ]
        }
    ).model_dump(mode="json")
    template = resolve_billing_template(workspace_docs, branch_id)
    assert template.name == "Norte"
    assert template.trade_name == "Sucursal Norte"
    fallback = resolve_billing_template(workspace_docs, other_branch)
    assert fallback.name == "Default"
