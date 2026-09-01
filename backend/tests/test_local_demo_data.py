from decimal import Decimal

import pytest
from app.core.security import hash_password, verify_password
from app.db.models import (
    Asset,
    Branch,
    CashMovement,
    CashRegister,
    CustomerPayment,
    CustomerReceivable,
    DemoSeedRegistry,
    Incident,
    IncidentAttachment,
    IncidentCounter,
    InventoryStockBalance,
    InventoryWarehouse,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    PaymentMethod,
    PlatformUser,
    Role,
    RolePermission,
    Sale,
    SalesQuote,
    WorkspaceMembership,
)
from app.db.session import session_scope
from app.services.demo_seed import seed_demo_data
from app.services.local_bootstrap import bootstrap_local_foundation
from app.services.local_demo_data import seed_local_demo_data
from sqlalchemy import func, select
from sqlalchemy.orm import undefer


def test_demo_seed_flag_false_is_a_no_op() -> None:
    summary = seed_demo_data(None, None, enabled=False)  # type: ignore[arg-type]

    assert summary.enabled is False
    assert summary.workspace_id is None
    assert summary.branch_count == 0
    assert summary.demo_user_count == 0
    assert summary.payment_method_count == 0
    assert summary.customer_count == 0
    assert summary.crm_profile_count == 0
    assert summary.crm_lead_count == 0
    assert summary.crm_opportunity_count == 0
    assert summary.crm_activity_count == 0
    assert summary.employee_count == 0
    assert summary.leave_request_count == 0
    assert summary.debt_count == 0
    assert summary.document_count == 0
    assert summary.catalog_category_count == 0
    assert summary.catalog_item_count == 0
    assert summary.catalog_assignment_count == 0
    assert summary.inventory_warehouse_count == 0
    assert summary.inventory_profile_count == 0
    assert summary.inventory_stock_balance_count == 0
    assert summary.inventory_asset_count == 0
    assert summary.inventory_movement_count == 0
    assert summary.purchasing_supplier_count == 0
    assert summary.purchase_request_count == 0
    assert summary.incident_count == 0
    assert summary.incident_attachment_count == 0
    assert summary.pos_register_count == 0
    assert summary.pos_quote_count == 0
    assert summary.pos_sale_count == 0
    assert summary.pos_receivable_count == 0
    assert summary.pos_payment_count == 0
    assert summary.pos_cash_movement_count == 0
    assert summary.pos_inventory_movement_count == 0
    assert summary.appointment_count == 0
    assert summary.dashboard_task_count == 0


@pytest.mark.integration
def test_local_demo_seed_is_repeatable_and_covers_iam_scenarios() -> None:
    first_password_hash = hash_password("first-local-demo-password-not-a-secret")
    current_password = "current-local-demo-password-not-a-secret"

    with session_scope() as session:
        foundation = bootstrap_local_foundation(session, first_password_hash)
        adopted_branch = session.scalar(
            select(Branch).where(
                Branch.workspace_id == foundation.workspace_id,
                Branch.code == "NORTH",
            )
        )
        if adopted_branch is None:
            adopted_branch = Branch(
                workspace_id=foundation.workspace_id,
                legal_entity_id=foundation.legal_entity_id,
                code="NORTH",
                name="Sucursal norte sin registro de seed",
                status="active",
                timezone="America/Santo_Domingo",
                configuration={},
            )
            session.add(adopted_branch)
            session.flush()
        adopted_branch_id = adopted_branch.id

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
                PaymentMethod.is_system.is_(True),
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
        catalog_category_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "item_category",
            )
        )
        catalog_item_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "item",
            )
        )
        catalog_assignment_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "item_branch_assignment",
            )
        )
        inventory_profile_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "inventory_item_profile",
            )
        )
        inventory_stock_balance_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "inventory_stock_balance",
            )
        )
        inventory_asset_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "asset",
            )
        )
        inventory_movement_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "inventory_opening_movement",
            )
        )
        purchasing_supplier_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "supplier",
            )
        )
        purchase_request_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "purchase_request",
            )
        )
        incident_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "incident",
            )
        )
        incident_attachment_count = session.scalar(
            select(func.count(DemoSeedRegistry.id)).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.seed_version == "v1",
                DemoSeedRegistry.entity_type == "incident_attachment",
            )
        )
        seeded_incident = session.scalar(
            select(Incident).where(
                Incident.workspace_id == second.workspace_id,
                Incident.code == "INC-1188",
            )
        )
        seeded_attachment = session.scalar(
            select(IncidentAttachment)
            .options(undefer(IncidentAttachment.content))
            .where(
                IncidentAttachment.workspace_id == second.workspace_id,
                IncidentAttachment.incident_id == seeded_incident.id,
            )
        )
        incident_counter = session.get(IncidentCounter, second.workspace_id)
        inventory_warehouse_count = session.scalar(
            select(func.count(InventoryWarehouse.id))
            .join(Branch, Branch.id == InventoryWarehouse.branch_id)
            .where(
                InventoryWarehouse.workspace_id == second.workspace_id,
                InventoryWarehouse.status == "active",
                Branch.code.in_({"HQ", "NORTH", "DOWNTOWN", "EAST"}),
            )
        )
        seeded_item_ids = select(DemoSeedRegistry.entity_id).where(
            DemoSeedRegistry.workspace_id == second.workspace_id,
            DemoSeedRegistry.seed_version == "v1",
            DemoSeedRegistry.entity_type == "item",
        )
        seeded_balance_ids = select(DemoSeedRegistry.entity_id).where(
            DemoSeedRegistry.workspace_id == second.workspace_id,
            DemoSeedRegistry.seed_version == "v1",
            DemoSeedRegistry.entity_type == "inventory_stock_balance",
        )
        seeded_asset_ids = select(DemoSeedRegistry.entity_id).where(
            DemoSeedRegistry.workspace_id == second.workspace_id,
            DemoSeedRegistry.seed_version == "v1",
            DemoSeedRegistry.entity_type == "asset",
        )
        seeded_item_types = dict(
            session.execute(
                select(Item.item_type, func.count(Item.id))
                .where(
                    Item.workspace_id == second.workspace_id,
                    Item.id.in_(seeded_item_ids),
                )
                .group_by(Item.item_type)
            ).all()
        )
        products_per_branch = dict(
            session.execute(
                select(Branch.code, func.count(ItemBranchAssignment.id))
                .join(
                    ItemBranchAssignment,
                    ItemBranchAssignment.branch_id == Branch.id,
                )
                .join(Item, Item.id == ItemBranchAssignment.item_id)
                .where(
                    Branch.workspace_id == second.workspace_id,
                    Item.id.in_(seeded_item_ids),
                    Item.item_type == "product",
                    ItemBranchAssignment.status == "active",
                )
                .group_by(Branch.code)
            ).all()
        )
        supplies_per_branch = dict(
            session.execute(
                select(Branch.code, func.count(ItemBranchAssignment.id))
                .join(
                    ItemBranchAssignment,
                    ItemBranchAssignment.branch_id == Branch.id,
                )
                .join(Item, Item.id == ItemBranchAssignment.item_id)
                .where(
                    Branch.workspace_id == second.workspace_id,
                    Item.id.in_(seeded_item_ids),
                    Item.item_type == "supply",
                    ItemBranchAssignment.status == "active",
                )
                .group_by(Branch.code)
            ).all()
        )
        stock_items_per_branch = dict(
            session.execute(
                select(Branch.code, func.count(InventoryStockBalance.id))
                .join(
                    InventoryStockBalance,
                    InventoryStockBalance.branch_id == Branch.id,
                )
                .where(
                    Branch.workspace_id == second.workspace_id,
                    InventoryStockBalance.id.in_(seeded_balance_ids),
                )
                .group_by(Branch.code)
            ).all()
        )
        assets_per_branch = dict(
            session.execute(
                select(Branch.code, func.count(Asset.id))
                .join(Asset, Asset.branch_id == Branch.id)
                .where(
                    Branch.workspace_id == second.workspace_id,
                    Asset.id.in_(seeded_asset_ids),
                )
                .group_by(Branch.code)
            ).all()
        )
        persisted_category_count = session.scalar(
            select(func.count(ItemCategory.id)).where(
                ItemCategory.workspace_id == second.workspace_id,
                ItemCategory.status == "active",
                ItemCategory.id.in_(
                    select(DemoSeedRegistry.entity_id).where(
                        DemoSeedRegistry.workspace_id == second.workspace_id,
                        DemoSeedRegistry.seed_version == "v1",
                        DemoSeedRegistry.entity_type == "item_category",
                    )
                ),
            )
        )
        north_branch = session.scalar(
            select(Branch).where(
                Branch.workspace_id == second.workspace_id,
                Branch.code == "NORTH",
            )
        )
        north_registry = session.scalar(
            select(DemoSeedRegistry).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.entity_type == "branch",
                DemoSeedRegistry.seed_key == "north",
            )
        )
        pos_entity_types = {
            "cash_register",
            "sales_quote",
            "sale",
            "customer_receivable",
            "customer_payment",
            "cash_movement",
            "pos_inventory_movement",
        }
        pos_registry_counts = dict(
            session.execute(
                select(DemoSeedRegistry.entity_type, func.count(DemoSeedRegistry.id))
                .where(
                    DemoSeedRegistry.workspace_id == second.workspace_id,
                    DemoSeedRegistry.seed_version == "v1",
                    DemoSeedRegistry.entity_type.in_(pos_entity_types),
                )
                .group_by(DemoSeedRegistry.entity_type)
            ).all()
        )
        seeded_sale_ids = select(DemoSeedRegistry.entity_id).where(
            DemoSeedRegistry.workspace_id == second.workspace_id,
            DemoSeedRegistry.seed_version == "v1",
            DemoSeedRegistry.entity_type == "sale",
        )
        seeded_quote_ids = select(DemoSeedRegistry.entity_id).where(
            DemoSeedRegistry.workspace_id == second.workspace_id,
            DemoSeedRegistry.seed_version == "v1",
            DemoSeedRegistry.entity_type == "sales_quote",
        )
        seeded_receivable_ids = select(DemoSeedRegistry.entity_id).where(
            DemoSeedRegistry.workspace_id == second.workspace_id,
            DemoSeedRegistry.seed_version == "v1",
            DemoSeedRegistry.entity_type == "customer_receivable",
        )
        seeded_payment_ids = select(DemoSeedRegistry.entity_id).where(
            DemoSeedRegistry.workspace_id == second.workspace_id,
            DemoSeedRegistry.seed_version == "v1",
            DemoSeedRegistry.entity_type == "customer_payment",
        )
        seeded_cash_movement_ids = select(DemoSeedRegistry.entity_id).where(
            DemoSeedRegistry.workspace_id == second.workspace_id,
            DemoSeedRegistry.seed_version == "v1",
            DemoSeedRegistry.entity_type == "cash_movement",
        )
        sale_statuses = dict(
            session.execute(
                select(Sale.status, func.count(Sale.id))
                .where(Sale.id.in_(seeded_sale_ids))
                .group_by(Sale.status)
            ).all()
        )
        quote_statuses = dict(
            session.execute(
                select(SalesQuote.status, func.count(SalesQuote.id))
                .where(SalesQuote.id.in_(seeded_quote_ids))
                .group_by(SalesQuote.status)
            ).all()
        )
        receivable_statuses = dict(
            session.execute(
                select(CustomerReceivable.status, func.count(CustomerReceivable.id))
                .where(CustomerReceivable.id.in_(seeded_receivable_ids))
                .group_by(CustomerReceivable.status)
            ).all()
        )
        payment_statuses = dict(
            session.execute(
                select(CustomerPayment.status, func.count(CustomerPayment.id))
                .where(CustomerPayment.id.in_(seeded_payment_ids))
                .group_by(CustomerPayment.status)
            ).all()
        )
        cash_movement_types = dict(
            session.execute(
                select(CashMovement.movement_type, func.count(CashMovement.id))
                .where(CashMovement.id.in_(seeded_cash_movement_ids))
                .group_by(CashMovement.movement_type)
            ).all()
        )
        north_register_id = session.scalar(
            select(DemoSeedRegistry.entity_id).where(
                DemoSeedRegistry.workspace_id == second.workspace_id,
                DemoSeedRegistry.entity_type == "cash_register",
                DemoSeedRegistry.seed_key == "north-aug31",
            )
        )
        north_register = session.get(CashRegister, north_register_id)

    assert second.workspace_id == first.workspace_id
    assert owner is not None
    assert verify_password(current_password, owner.password_hash)
    assert demo_user_count == 8
    assert {"HQ", "NORTH", "DOWNTOWN", "EAST"} <= branch_codes
    assert status_counts == {"active": 7, "suspended": 1}
    assert manager_permission_count is not None
    assert manager_permission_count >= 6
    assert payment_method_count == 5
    assert registry_count is not None and registry_count >= 1
    assert first.customer_count == second.customer_count == customer_count == 5
    assert first.employee_count == second.employee_count == employee_count == 13
    assert first.leave_request_count == second.leave_request_count == 2
    assert first.debt_count == second.debt_count == 2
    assert first.document_count == second.document_count == 0
    assert first.catalog_category_count == second.catalog_category_count == 6
    assert first.catalog_item_count == second.catalog_item_count == 22
    assert first.catalog_assignment_count == second.catalog_assignment_count == 66
    assert first.inventory_warehouse_count == second.inventory_warehouse_count == 4
    assert first.inventory_profile_count == second.inventory_profile_count == 21
    assert first.inventory_stock_balance_count == second.inventory_stock_balance_count == 40
    assert first.inventory_asset_count == second.inventory_asset_count == 16
    assert first.inventory_movement_count == second.inventory_movement_count == 35
    assert first.purchasing_supplier_count == second.purchasing_supplier_count == 2
    assert first.purchase_request_count == second.purchase_request_count == 2
    assert first.incident_count == second.incident_count == incident_count == 6
    assert (
        first.incident_attachment_count
        == second.incident_attachment_count
        == incident_attachment_count
        == 1
    )
    assert catalog_category_count == persisted_category_count == 6
    assert catalog_item_count == 22
    assert catalog_assignment_count == 66
    assert inventory_warehouse_count == 4
    assert inventory_profile_count == 21
    assert inventory_stock_balance_count == 40
    assert inventory_asset_count == 16
    assert inventory_movement_count == 35
    assert purchasing_supplier_count == 2
    assert purchase_request_count == 2
    assert seeded_incident is not None
    assert seeded_attachment is not None
    assert seeded_attachment.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert seeded_attachment.size_bytes == len(seeded_attachment.content)
    assert incident_counter is not None and incident_counter.last_value >= 1193
    assert seeded_item_types == {"membership": 1, "product": 6, "service": 11, "supply": 4}
    assert products_per_branch == {"DOWNTOWN": 6, "EAST": 6, "HQ": 6, "NORTH": 6}
    assert supplies_per_branch == {"DOWNTOWN": 4, "EAST": 4, "HQ": 4, "NORTH": 4}
    assert stock_items_per_branch == {"DOWNTOWN": 10, "EAST": 10, "HQ": 10, "NORTH": 10}
    assert assets_per_branch == {"DOWNTOWN": 4, "EAST": 4, "HQ": 4, "NORTH": 4}
    assert first.pos_register_count == second.pos_register_count == 4
    assert first.pos_quote_count == second.pos_quote_count == 6
    assert first.pos_sale_count == second.pos_sale_count == 16
    assert first.pos_receivable_count == second.pos_receivable_count == 6
    assert first.pos_payment_count == second.pos_payment_count == 5
    assert first.pos_cash_movement_count == second.pos_cash_movement_count == 15
    assert first.pos_inventory_movement_count == second.pos_inventory_movement_count == 9
    assert first.appointment_count == second.appointment_count == 9
    assert first.dashboard_task_count == second.dashboard_task_count == 18
    assert pos_registry_counts == {
        "cash_movement": 15,
        "cash_register": 4,
        "customer_payment": 5,
        "customer_receivable": 6,
        "pos_inventory_movement": 9,
        "sale": 16,
        "sales_quote": 6,
    }
    assert sale_statuses == {"completed": 14, "voided": 2}
    assert quote_statuses == {"cancelled": 1, "converted": 1, "expired": 1, "open": 3}
    assert receivable_statuses == {"cancelled": 1, "paid": 1, "partial": 2, "pending": 2}
    assert payment_statuses == {"posted": 4, "reversed": 1}
    assert cash_movement_types == {
        "expense": 3,
        "income": 2,
        "receivable_payment": 2,
        "reversal": 2,
        "sale": 6,
    }
    assert north_register is not None
    assert north_register.status == "closed"
    assert north_register.cash_sales_amount == Decimal("1840.80")
    assert north_register.receivable_payments_amount == Decimal("1500.00")
    assert north_register.cash_expense_amount == Decimal("600.00")
    assert north_register.expected_cash == Decimal("6240.80")
    assert north_register.actual_cash == Decimal("6290.80")
    assert north_register.difference == Decimal("50.00")
    assert north_branch is not None and north_branch.id == adopted_branch_id
    assert north_branch.name == "Sucursal Norte"
    assert north_registry is not None and north_registry.entity_id == adopted_branch_id
    assert all(verify_password(current_password, user.password_hash) for user in demo_users)
