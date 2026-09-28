"""Release acceptance: tenant boundaries and reversible module activation."""

from uuid import uuid7

import pytest

from tests.test_backoffice_management import PASSWORD, login
from tests.test_backoffice_management import operator as operator_fixture
from tests.test_carwash_checkout import checkout_setup as checkout_fixture
from tests.test_carwash_commissions import earned, pay, reverse
from tests.test_carwash_settings import BASE

pytestmark = pytest.mark.integration


@pytest.fixture
def operator(client, monkeypatch):
    return operator_fixture.__wrapped__(client, monkeypatch)


@pytest.fixture
def setup(client, operator):
    yield from checkout_fixture.__wrapped__(client)


def snapshot(client, setup):
    result = {}
    for resource in ("services", "washes", "commissions", "settlements", "reports", "indicators"):
        response = client.get(
            f"{BASE}/{resource}",
            headers=setup["headers"],
            params={"branchId": setup["branchId"]},
        )
        assert response.status_code == 200, response.text
        data = response.json()
        data.pop("generatedAt", None)
        result[resource] = data
    return result


def test_activation_preserves_posted_history_and_foreign_tenant_cannot_mutate_it(
    client, setup, operator
):
    wash, commissions = earned(client, setup)
    response = pay(client, setup, commissions)
    assert response.status_code == 201, response.text
    settlement = response.json()
    workspace_url = f"/api/v1/backoffice/workspaces/{setup['workspaceId']}"
    detail = client.get(workspace_url, headers=operator).json()
    modules = detail["configuredModules"]
    assert "carwash" in modules
    before = snapshot(client, setup)
    sale_url = f"/api/v1/pos/sales/{wash['saleId']}"
    sale = client.get(sale_url, headers=setup["headers"]).json()
    disabled = client.patch(
        workspace_url,
        headers=operator,
        json={
            "version": detail["version"],
            "enabledModules": [m for m in modules if m != "carwash"],
        },
    )
    assert disabled.status_code == 200, disabled.text
    try:
        for resource in before:
            assert (
                client.get(
                    f"{BASE}/{resource}",
                    headers=setup["headers"],
                    params={"branchId": setup["branchId"]},
                ).status_code
                == 403
            )
        assert reverse(client, setup, settlement).status_code == 403
        assert client.get(sale_url, headers=setup["headers"]).json() == sale
    finally:
        current = client.get(workspace_url, headers=operator).json()
        enabled = client.patch(
            workspace_url,
            headers=operator,
            json={"version": current["version"], "enabledModules": modules},
        )
        assert enabled.status_code == 200, enabled.text
    assert snapshot(client, setup) == before

    suffix = uuid7().hex
    email = f"carwash-isolation-{suffix}@example.com"
    created = client.post(
        "/api/v1/backoffice/workspaces",
        headers=operator,
        json={
            "slug": f"cw-isolation-{suffix}",
            "name": "Carwash isolated company",
            "defaultCurrency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-DO",
            "enabledModules": modules,
            "owner": {"email": email, "displayName": "Other owner", "password": PASSWORD},
        },
    )
    assert created.status_code == 201, created.text
    foreign = {**setup, "headers": login(client, email)}
    for resource in before:
        response = client.get(
            f"{BASE}/{resource}",
            headers=foreign["headers"],
            params={"branchId": setup["branchId"]},
        )
        assert response.status_code == 404, response.text
    for resource, entity_id in (
        ("washes", wash["id"]),
        ("services", setup["services"][0]["id"]),
        ("settlements", settlement["id"]),
    ):
        assert (
            client.get(f"{BASE}/{resource}/{entity_id}", headers=foreign["headers"]).status_code
            == 404
        )
    assert reverse(client, foreign, settlement).status_code == 404
    assert pay(client, foreign, commissions).status_code == 404
    assert snapshot(client, setup) == before
    assert client.get(sale_url, headers=setup["headers"]).json() == sale
    # The original owner can still reverse, proving that denial did not mutate versions.
    assert reverse(client, setup, settlement).status_code == 200
