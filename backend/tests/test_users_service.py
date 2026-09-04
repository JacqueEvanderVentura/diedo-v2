from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID, uuid7

import pytest
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import AuthorizationError
from app.services.users import UsersService


def _principal_and_grant() -> tuple[AuthPrincipal, PermissionGrant]:
    workspace_id = uuid7()
    membership_id = uuid7()
    principal = AuthPrincipal(
        platform_user_id=uuid7(),
        membership_id=membership_id,
        workspace_id=workspace_id,
        session_id=uuid7(),
        email="admin@example.com",
        display_name="Admin",
    )
    grant = PermissionGrant(
        permission_code="membership.manage",
        workspace_id=workspace_id,
        membership_id=membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    return principal, grant


def _service_for_reset(target_membership_id: UUID) -> tuple[UsersService, Mock, Mock]:
    session = Mock()
    repository = Mock()
    repository.membership_for_update.return_value = SimpleNamespace(
        id=target_membership_id,
        status="active",
        version=1,
    )
    repository.get_user_for_authorization.return_value = SimpleNamespace(
        platform_user_id=uuid7(),
        role_assignments=(),
    )
    service = UsersService(session)
    service._repository = repository
    service.get_user = Mock()
    service._require_target_within_grant = Mock()
    return service, session, repository


def test_admin_cannot_reset_workspace_admin_password() -> None:
    principal, grant = _principal_and_grant()
    target_membership_id = uuid7()
    service, session, repository = _service_for_reset(target_membership_id)
    repository.get_user_for_authorization.return_value.role_assignments = (
        SimpleNamespace(
            role=SimpleNamespace(code="workspace_admin"),
            scope_type="workspace",
        ),
    )
    repository.is_workspace_admin.return_value = False

    with pytest.raises(AuthorizationError, match="Solo un workspace admin"):
        service.reset_password(
            principal=principal,
            grant=grant,
            membership_id=target_membership_id,
            new_password="Blocked!password",
        )

    repository.platform_user.assert_not_called()
    session.commit.assert_not_called()


def test_workspace_admin_can_reset_regular_admin_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    principal, grant = _principal_and_grant()
    target_membership_id = uuid7()
    service, session, repository = _service_for_reset(target_membership_id)
    repository.is_workspace_admin.return_value = False
    user = SimpleNamespace(id=uuid7(), password_hash="old", password_changed_at=None, version=1)
    repository.platform_user.return_value = user
    repository.platform_user_membership_count.return_value = 1
    monkeypatch.setattr("app.services.users.hash_password", lambda _password: "new-hash")

    service.reset_password(
        principal=principal,
        grant=grant,
        membership_id=target_membership_id,
        new_password="Allowed!password",
    )

    assert user.password_hash == "new-hash"
    repository.revoke_platform_user_sessions.assert_called_once()
    repository.add_security_audit.assert_called_once()
    session.commit.assert_called_once_with()
