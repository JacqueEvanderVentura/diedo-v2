import pytest
from app.services.fiscal_receipts import format_credit_fiscal_ncf
from fastapi.testclient import TestClient

from tests.test_inventory import _bootstrap_and_login


@pytest.mark.integration
def test_branch_patch_persists_credit_fiscal_sequence_without_losing_it_on_rename(
    client: TestClient,
) -> None:
    headers, session_context, _summary = _bootstrap_and_login(client)
    branch_id = str(session_context["visibleBranches"][0]["id"])
    current = client.get("/api/v1/branches", headers=headers)
    assert current.status_code == 200, current.text
    branch = next(row for row in current.json() if row["id"] == branch_id)
    assert branch["fiscalCreditNcfPrefix"] is None
    assert branch["fiscalCreditNcfNextSequence"] is None

    updated = client.patch(
        f"/api/v1/branches/{branch_id}",
        headers=headers,
        json={
            "fiscalCreditNcfPrefix": "b01",
            "fiscalCreditNcfNextSequence": "00000040",
            "version": branch["version"],
        },
    )
    assert updated.status_code == 200, updated.text
    saved = updated.json()
    assert saved["fiscalCreditNcfPrefix"] == "B01"
    assert saved["fiscalCreditNcfNextSequence"] == "00000040"
    assert saved["version"] == branch["version"] + 1
    assert (
        format_credit_fiscal_ncf(
            saved["fiscalCreditNcfPrefix"],
            saved["fiscalCreditNcfNextSequence"],
        )
        == "B0100000040"
    )

    renamed = client.patch(
        f"/api/v1/branches/{branch_id}",
        headers=headers,
        json={"name": "Sucursal NCF", "version": saved["version"]},
    )
    assert renamed.status_code == 200, renamed.text
    renamed_body = renamed.json()
    assert renamed_body["name"] == "Sucursal NCF"
    assert renamed_body["fiscalCreditNcfPrefix"] == "B01"
    assert renamed_body["fiscalCreditNcfNextSequence"] == "00000040"

    cleared = client.patch(
        f"/api/v1/branches/{branch_id}",
        headers=headers,
        json={
            "fiscalCreditNcfPrefix": None,
            "fiscalCreditNcfNextSequence": None,
            "version": renamed_body["version"],
        },
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["fiscalCreditNcfPrefix"] is None
    assert cleared.json()["fiscalCreditNcfNextSequence"] is None


@pytest.mark.integration
@pytest.mark.parametrize(
    "payload",
    [
        {"fiscalCreditNcfPrefix": "B02", "fiscalCreditNcfNextSequence": "00000040"},
        {"fiscalCreditNcfPrefix": "B01", "fiscalCreditNcfNextSequence": "40"},
        {"fiscalCreditNcfPrefix": "B01", "fiscalCreditNcfNextSequence": "0000000"},
        {"fiscalCreditNcfPrefix": "B01", "fiscalCreditNcfNextSequence": "1" * 21},
        {"fiscalCreditNcfPrefix": "B01"},
        {"fiscalCreditNcfNextSequence": "00000040"},
    ],
)
def test_branch_patch_rejects_invalid_credit_fiscal_sequence(
    client: TestClient,
    payload: dict[str, object],
) -> None:
    headers, session_context, _summary = _bootstrap_and_login(client)
    branch_id = str(session_context["visibleBranches"][0]["id"])
    current = client.get("/api/v1/branches", headers=headers)
    assert current.status_code == 200, current.text
    branch = next(row for row in current.json() if row["id"] == branch_id)

    rejected = client.patch(
        f"/api/v1/branches/{branch_id}",
        headers=headers,
        json={**payload, "version": branch["version"]},
    )
    assert rejected.status_code == 400, rejected.text
    listed = client.get("/api/v1/branches", headers=headers)
    assert listed.status_code == 200, listed.text
    unchanged = next(row for row in listed.json() if row["id"] == branch_id)
    assert unchanged["fiscalCreditNcfPrefix"] is None
    assert unchanged["fiscalCreditNcfNextSequence"] is None
    assert unchanged["version"] == branch["version"]
