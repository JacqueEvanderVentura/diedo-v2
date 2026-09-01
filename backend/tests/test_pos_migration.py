from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid7
from zoneinfo import ZoneInfo

import pytest
from alembic import command
from alembic.config import Config
from app.core.security import hash_password
from app.db.models import (
    Appointment,
    AppointmentResource,
    Branch,
    Customer,
    CustomerBranchAssignment,
    CustomerReceivable,
    CustomerReceivableLine,
    ModuleDefinition,
    ModuleEntitlement,
    PaymentMethod,
    SalesDocumentCounter,
    Workspace,
)
from app.db.session import dispose_engine, session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from sqlalchemy import func, select

_OWNER_PASSWORD = "pos-migration-password-not-a-secret"


def _migration_config() -> Config:
    return Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))


def _legacy_appointment(
    *,
    workspace_id: UUID,
    branch: Branch,
    resource_id: UUID,
    customer_id: UUID | None,
    actor_id: UUID,
    scheduled_date: date,
    scheduled_time: time,
    pending_amount: Decimal,
    suffix: str,
    service_name: str,
    status: str = "confirmed",
) -> Appointment:
    zone = ZoneInfo(branch.timezone)
    starts_at = datetime.combine(scheduled_date, scheduled_time, tzinfo=zone).astimezone(UTC)
    return Appointment(
        workspace_id=workspace_id,
        branch_id=branch.id,
        resource_id=resource_id,
        customer_id=customer_id,
        employee_id=None,
        service_id=None,
        scheduled_date=scheduled_date,
        scheduled_time=scheduled_time,
        timezone=branch.timezone,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=1),
        duration_minutes=60,
        customer_name=f"Cliente legado {suffix}",
        customer_phone="+1 809 555 0101",
        service_name=service_name,
        price=pending_amount,
        status=status,
        notes="Cita anterior a Terminal POS",
        pending_payment=True,
        pending_amount=pending_amount,
        first_time=False,
        free_trial=False,
        reminder_sent=False,
        source="staff",
        recurrence="none",
        recurrence_group_id=None,
        occurrence_index=0,
        repeat_count=1,
        idempotency_key=f"legacy-appointment-{suffix}",
        request_fingerprint=("a" if customer_id is not None else "b") * 64,
        created_by_platform_user_id=actor_id,
        updated_by_platform_user_id=actor_id,
    )


@pytest.mark.integration
def test_0013_backfills_only_attributable_appointment_receivables() -> None:
    suffix = uuid7().hex[-12:]
    with session_scope() as session:
        summary = bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
        branch = session.scalar(
            select(Branch).where(
                Branch.workspace_id == summary.workspace_id,
                Branch.id == summary.branch_id,
            )
        )
        resource_id = session.scalar(
            select(AppointmentResource.id).where(
                AppointmentResource.workspace_id == summary.workspace_id,
                AppointmentResource.branch_id == summary.branch_id,
                AppointmentResource.status == "active",
            )
        )
        assert branch is not None
        assert resource_id is not None
        email = f"legacy.receivable.{suffix}@example.com"
        customer = Customer(
            workspace_id=summary.workspace_id,
            customer_type="person",
            display_name=f"Cliente legado {suffix}",
            normalized_name=f"cliente legado {suffix}",
            first_name="Cliente",
            last_name=suffix,
            business_name=None,
            email=email,
            normalized_email=email,
            phone="+1 809 555 0101",
            normalized_phone="18095550101",
            status="active",
            created_by_platform_user_id=summary.platform_user_id,
            updated_by_platform_user_id=summary.platform_user_id,
        )
        session.add(customer)
        session.flush()
        session.add(
            CustomerBranchAssignment(
                workspace_id=summary.workspace_id,
                customer_id=customer.id,
                branch_id=summary.branch_id,
                status="active",
            )
        )
        scheduled_date = date.today() + timedelta(days=30_000 + uuid7().int % 10_000)
        long_service_name = "Servicio legado " + ("x" * 170)
        attributable = _legacy_appointment(
            workspace_id=summary.workspace_id,
            branch=branch,
            resource_id=resource_id,
            customer_id=customer.id,
            actor_id=summary.platform_user_id,
            scheduled_date=scheduled_date,
            scheduled_time=time(9),
            pending_amount=Decimal("87.65"),
            suffix=f"with-customer-{suffix}",
            service_name=long_service_name,
        )
        anonymous = _legacy_appointment(
            workspace_id=summary.workspace_id,
            branch=branch,
            resource_id=resource_id,
            customer_id=None,
            actor_id=summary.platform_user_id,
            scheduled_date=scheduled_date,
            scheduled_time=time(11),
            pending_amount=Decimal("55.00"),
            suffix=f"without-customer-{suffix}",
            service_name="Servicio sin cliente registrado",
        )
        cancelled = _legacy_appointment(
            workspace_id=summary.workspace_id,
            branch=branch,
            resource_id=resource_id,
            customer_id=customer.id,
            actor_id=summary.platform_user_id,
            scheduled_date=scheduled_date,
            scheduled_time=time(13),
            pending_amount=Decimal("45.00"),
            suffix=f"cancelled-{suffix}",
            service_name="Servicio cancelado con flags legados",
            status="cancelled",
        )
        session.add_all([attributable, anonymous, cancelled])
        session.flush()
        attributable_id = attributable.id
        anonymous_id = anonymous.id
        cancelled_id = cancelled.id
        workspace_id = summary.workspace_id

        catalog_workspace = Workspace(
            slug=f"pos-migration-{suffix}",
            name=f"POS migration {suffix}",
            status="active",
            default_currency="DOP",
            timezone="America/Santo_Domingo",
            locale="es-DO",
            tax_default_rate=Decimal("18.00"),
        )
        session.add(catalog_workspace)
        session.flush()
        custom_card = PaymentMethod(
            workspace_id=catalog_workspace.id,
            code="card",
            name=f"Tarjeta privada {suffix}",
            icon="CustomCard",
            status="inactive",
            is_system=False,
            channel="other",
            settlement_policy="immediate",
            affects_cash_drawer=False,
            requires_evidence=False,
        )
        pos_module = session.scalar(select(ModuleDefinition).where(ModuleDefinition.code == "pos"))
        assert pos_module is not None
        existing_entitlement = ModuleEntitlement(
            workspace_id=catalog_workspace.id,
            module_definition_id=pos_module.id,
            status="disabled",
            effective_from=datetime.now(UTC),
        )
        session.add_all([custom_card, existing_entitlement])
        session.flush()
        catalog_workspace_id = catalog_workspace.id
        custom_card_id = custom_card.id
        existing_entitlement_id = existing_entitlement.id

    dispose_engine()
    migration_config = _migration_config()
    try:
        command.downgrade(migration_config, "20260831_0012")
        command.upgrade(migration_config, "20260831_0013")
    except BaseException:
        command.upgrade(migration_config, "20260831_0013")
        raise
    finally:
        dispose_engine()

    with session_scope() as session:
        preserved_card = session.scalar(
            select(PaymentMethod).where(
                PaymentMethod.workspace_id == catalog_workspace_id,
                PaymentMethod.code == "card",
            )
        )
        assert preserved_card is not None
        assert preserved_card.id == custom_card_id
        assert preserved_card.name == f"Tarjeta privada {suffix}"
        assert preserved_card.icon == "CustomCard"
        assert preserved_card.status == "inactive"
        assert preserved_card.is_system is False
        assert preserved_card.channel == "card"
        assert preserved_card.settlement_policy == "immediate"
        preserved_entitlement = session.get(ModuleEntitlement, existing_entitlement_id)
        assert preserved_entitlement is not None
        assert preserved_entitlement.workspace_id == catalog_workspace_id
        assert preserved_entitlement.status == "disabled"

        receivable = session.scalar(
            select(CustomerReceivable).where(
                CustomerReceivable.workspace_id == workspace_id,
                CustomerReceivable.appointment_id == attributable_id,
            )
        )
        assert receivable is not None
        assert receivable.source == "appointment"
        assert receivable.sale_id is None
        assert receivable.amount == Decimal("87.65")
        assert receivable.paid_amount == Decimal("0.00")
        assert receivable.status == "pending"
        assert receivable.creation_idempotency_key == f"agenda-backfill:{attributable_id}"
        assert receivable.receivable_number.startswith("CXC-")
        assert len(receivable.request_fingerprint) == 64
        workspace = session.get(Workspace, workspace_id)
        assert workspace is not None
        assert receivable.currency_code == workspace.default_currency

        line = session.scalar(
            select(CustomerReceivableLine).where(
                CustomerReceivableLine.workspace_id == workspace_id,
                CustomerReceivableLine.receivable_id == receivable.id,
                CustomerReceivableLine.position == 1,
            )
        )
        assert line is not None
        assert line.item_name == long_service_name[:160]
        assert line.quantity == Decimal("1.000")
        assert line.unit_price == Decimal("87.65")
        assert line.line_total == Decimal("87.65")

        excluded_count = session.scalar(
            select(func.count(CustomerReceivable.id)).where(
                CustomerReceivable.workspace_id == workspace_id,
                CustomerReceivable.appointment_id.in_([anonymous_id, cancelled_id]),
            )
        )
        assert excluded_count == 0
        counter = session.get(SalesDocumentCounter, workspace_id)
        assert counter is not None
        maximum_number = session.scalar(
            select(
                func.max(
                    func.cast(
                        func.substring(CustomerReceivable.receivable_number, 5),
                        SalesDocumentCounter.last_receivable_value.type,
                    )
                )
            ).where(
                CustomerReceivable.workspace_id == workspace_id,
                CustomerReceivable.receivable_number.regexp_match(r"^CXC-[0-9]+$"),
            )
        )
        assert maximum_number is not None
        assert counter.last_receivable_value == maximum_number
