from uuid import uuid7

import pytest
from app.services.administration import AdministrationService
from app.services.authorization import PermissionGrant
from app.services.errors import AuthorizationError, ConflictError, InvalidOperationError
from sqlalchemy.exc import IntegrityError


def test_administration_service_validates_payment_methods_and_versions() -> None:
    with pytest.raises(InvalidOperationError) as drawer:
        AdministrationService._validate_payment_method_semantics(
            channel="card",
            settlement_policy="immediate",
            affects_cash_drawer=True,
            requires_evidence=False,
        )
    assert drawer.value.parameter == "affectsCashDrawer"
    with pytest.raises(InvalidOperationError) as evidence:
        AdministrationService._validate_payment_method_semantics(
            channel="cash",
            settlement_policy="immediate",
            affects_cash_drawer=False,
            requires_evidence=True,
        )
    assert evidence.value.parameter == "requiresEvidence"
    with pytest.raises(ConflictError) as version:
        AdministrationService._check_version(2, 1)
    assert version.value.parameter == "version"

    grant = PermissionGrant(
        permission_code="administration.manage",
        workspace_id=uuid7(),
        membership_id=uuid7(),
        allowed_legal_entity_ids=None,
        allowed_branch_ids=frozenset({uuid7()}),
    )
    with pytest.raises(AuthorizationError):
        AdministrationService._require_workspace_wide(grant)
    with pytest.raises(AuthorizationError):
        AdministrationService._require_branch_access(grant, uuid7())


def test_administration_integrity_constraint_helper() -> None:
    class FakeDiag:
        constraint_name = "uq_entity_identities_workspace_identifier"

    class FakeOrig:
        diag = FakeDiag()

    assert (
        AdministrationService._integrity_constraint(IntegrityError("stmt", {}, FakeOrig()))
        == "uq_entity_identities_workspace_identifier"
    )
    assert AdministrationService._integrity_constraint(IntegrityError("stmt", {}, object())) is None
