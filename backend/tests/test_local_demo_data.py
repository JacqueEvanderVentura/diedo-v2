import pytest
from app.core.security import hash_password, verify_password
from app.db.models import (
    Branch,
    DemoSeedRegistry,
    PaymentMethod,
    PlatformUser,
    Role,
    RolePermission,
    WorkspaceMembership,
)
from app.db.session import session_scope
from app.services.demo_seed import seed_demo_data
from app.services.local_demo_data import seed_local_demo_data
from sqlalchemy import func, select


def test_demo_seed_flag_false_is_a_no_op() -> None:
    summary = seed_demo_data(None, None, enabled=False)  # type: ignore[arg-type]

    assert summary.enabled is False
    assert summary.workspace_id is None
    assert summary.branch_count == 0
    assert summary.demo_user_count == 0
    assert summary.payment_method_count == 0
    assert summary.customer_count == 0
    assert summary.employee_count == 0


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
                PlatformUser.external_subject.like("demo:v1:%")
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
                    PlatformUser.external_subject.like("demo:v1:%"),
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
            select(PlatformUser).where(PlatformUser.external_subject.like("demo:v1:%"))
        ).all()
        payment_method_count = session.scalar(
            select(func.count(PaymentMethod.id)).where(
                PaymentMethod.workspace_id == second.workspace_id,
                PaymentMethod.status != "archived",
            )
        )
        registry_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
            )
        )
        customer_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "customer",
            )
        )
        employee_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "employee",
            )
        )

    assert second.workspace_id == first.workspace_id
    assert owner is not None
    assert verify_password(current_password, owner.password_hash)
    assert demo_user_count == 8
    assert {"HQ", "NORTH", "DOWNTOWN", "EAST"} <= branch_codes
    assert status_counts == {"active": 7, "suspended": 1}
    assert manager_permission_count is not None
    assert manager_permission_count >= 6
    assert payment_method_count == 3
    assert registry_count is not None and registry_count >= 1
    assert first.customer_count == second.customer_count == customer_count == 5
    assert first.employee_count == second.employee_count == employee_count == 13
    assert all(verify_password(current_password, user.password_hash) for user in demo_users)
