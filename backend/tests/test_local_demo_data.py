import pytest
from app.core.security import hash_password, verify_password
from app.db.models import Branch, PlatformUser, Role, RolePermission, WorkspaceMembership
from app.db.session import session_scope
from app.services.local_demo_data import seed_local_demo_data
from sqlalchemy import func, select


@pytest.mark.integration
def test_local_demo_seed_is_repeatable_and_covers_iam_scenarios() -> None:
    first_password_hash = hash_password("first-local-demo-password-not-a-secret")
    current_password = "current-local-demo-password-not-a-secret"

    with session_scope() as session:
        first = seed_local_demo_data(session, first_password_hash)
    with session_scope() as session:
        second = seed_local_demo_data(session, hash_password(current_password))

        demo_user_count = session.scalar(
            select(func.count(PlatformUser.id)).where(
                PlatformUser.external_subject.like("local:demo:%")
            )
        )
        branch_codes = set(
            session.scalars(select(Branch.code).where(Branch.workspace_id == second.workspace_id))
        )
        status_counts = dict(
            session.execute(
                select(WorkspaceMembership.status, func.count(WorkspaceMembership.id))
                .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
                .where(
                    WorkspaceMembership.workspace_id == second.workspace_id,
                    PlatformUser.external_subject.like("local:demo:%"),
                )
                .group_by(WorkspaceMembership.status)
            ).all()
        )
        manager_permission_count = session.scalar(
            select(func.count(RolePermission.id))
            .join(Role, Role.id == RolePermission.role_id)
            .where(
                RolePermission.workspace_id == second.workspace_id,
                Role.code == "manager",
            )
        )
        owner = session.scalar(
            select(PlatformUser).where(PlatformUser.external_subject == "local:owner")
        )
        demo_users = session.scalars(
            select(PlatformUser).where(PlatformUser.external_subject.like("local:demo:%"))
        ).all()

    assert second.workspace_id == first.workspace_id
    assert owner is not None
    assert verify_password(current_password, owner.password_hash)
    assert demo_user_count == 8
    assert {"HQ", "NORTH", "DOWNTOWN", "EAST"} <= branch_codes
    assert status_counts == {"active": 7, "suspended": 1}
    assert manager_permission_count is not None
    assert manager_permission_count >= 6
    assert all(verify_password(current_password, user.password_hash) for user in demo_users)
