"""Hard-delete operational tenant data while preserving workspace identity and IAM."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

AuditActorType = Literal["operator", "api_key", "tenant"]

from sqlalchemy import delete, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models import (
    Appointment,
    AppointmentEvent,
    AppointmentResource,
    AppointmentResourceAcl,
    Asset,
    AssetAttachment,
    AssetCategory,
    Attachment,
    AuditEntry,
    AuthSession,
    BranchOpeningHour,
    CarwashCommission,
    CarwashServiceConfig,
    CarwashSettlement,
    CarwashSettlementDetail,
    CarwashWash,
    CarwashWashLine,
    CashMovement,
    CashMovementLine,
    CashRegister,
    ChatChannelAccount,
    ChatChannelAccountBranch,
    ChatConversation,
    ChatMessage,
    ChatOauthState,
    CrmActivity,
    CrmDiscoveryUsage,
    CrmLead,
    Customer,
    CustomerBranchAssignment,
    CustomerCrmProfile,
    CustomerPayment,
    CustomerReceivable,
    CustomerReceivableLine,
    DemoSeedRegistry,
    DocumentAttachment,
    EmailNotification,
    Employee,
    EmployeeBranchAssignment,
    EmployeeDebt,
    EmployeeDebtPayment,
    EmployeeHrProfile,
    EmployeeSchedule,
    EmployeeSupervisor,
    FinanceAccount,
    FinanceBudget,
    FinanceExpense,
    FinanceFixedExpense,
    FinanceFixedExpensePayment,
    FinanceLiability,
    FinanceManualIncome,
    FinancePosIncomeCorrection,
    HrDocumentRecord,
    HrLeaveRequest,
    Incident,
    IncidentActivity,
    IncidentAttachment,
    IncidentCounter,
    IncidentParticipant,
    InventoryItemProfile,
    InventoryMovement,
    InventoryMovementLine,
    InventoryStockBalance,
    InventoryWarehouse,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    PaymentMethod,
    PaymentProof,
    PurchaseRequest,
    PurchaseRequestItem,
    Sale,
    SaleLine,
    SalesDocumentCounter,
    SalesQuote,
    SalesQuoteLine,
    SalesQuoteRevision,
    Supplier,
    SupplierBranchAssignment,
    Task,
    UnitOfMeasure,
    Workspace,
)
from app.services.attachment_storage import AttachmentStorage
from app.services.errors import ConflictError, ResourceNotFoundError
from app.services.platform_workspace import PLATFORM_WORKSPACE_SLUG
from app.services.workspace_provisioning import _PAYMENT_METHODS, _UNITS_OF_MEASURE

logger = logging.getLogger(__name__)

_SYSTEM_UOM_CODES = frozenset(code for code, _, _ in _UNITS_OF_MEASURE)


@dataclass(frozen=True)
class WorkspaceResetResult:
    workspace_id: UUID
    reset_at: datetime
    deleted_counts: dict[str, int]
    storage_cleanup: str = "pending"
    storage_keys_removed: int = 0
    pending_storage_keys: frozenset[str] = frozenset()


@dataclass
class _ResetContext:
    deleted_counts: dict[str, int] = field(default_factory=dict)
    storage_keys: set[str] = field(default_factory=set)


class WorkspaceResetService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def reset_operational_data(
        self,
        workspace_id: UUID,
        *,
        confirmation_slug: str,
        actor_platform_user_id: UUID | None,
        audit_action: str = "workspace.backoffice_data_reset",
        actor_type: AuditActorType | None = None,
    ) -> WorkspaceResetResult:
        workspace = self._session.scalar(
            select(Workspace).where(
                Workspace.id == workspace_id,
                Workspace.slug != PLATFORM_WORKSPACE_SLUG,
            )
        )
        if workspace is None:
            raise ResourceNotFoundError("La compañía no existe.", "workspaceId")
        if workspace.slug != confirmation_slug.strip().lower():
            raise ConflictError(
                "El slug de confirmación no coincide con la compañía.",
                "confirmationSlug",
            )

        ctx = _ResetContext()
        self._collect_storage_keys(ctx, workspace_id)
        self._delete_operational_rows(ctx, workspace_id)
        self._revoke_sessions(workspace_id)
        self._reset_counters(workspace_id)
        self._delete_non_system_catalog(ctx, workspace_id)
        self._ensure_system_catalog(workspace_id)

        reset_at = datetime.now(UTC)
        resolved_actor_type: AuditActorType = actor_type or (
            "operator" if actor_platform_user_id else "api_key"
        )
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action=audit_action,
                target_type="workspace",
                target_id=workspace_id,
                outcome="success",
                request_id=get_request_id() or None,
                details={
                    "deletedCounts": ctx.deleted_counts,
                    "actorType": resolved_actor_type,
                },
            )
        )
        self._session.flush()

        return WorkspaceResetResult(
            workspace_id=workspace_id,
            reset_at=reset_at,
            deleted_counts=dict(ctx.deleted_counts),
            pending_storage_keys=frozenset(ctx.storage_keys),
        )

    def purge_workspace_storage(
        self,
        storage: AttachmentStorage,
        workspace_id: UUID,
        keys: frozenset[str],
    ) -> tuple[str, int]:
        return self._purge_storage(storage, workspace_id, set(keys))

    def _collect_storage_keys(self, ctx: _ResetContext, workspace_id: UUID) -> None:
        for model in (DocumentAttachment, Attachment, PaymentProof):
            keys = self._session.scalars(
                select(model.storage_key).where(model.workspace_id == workspace_id)
            ).all()
            ctx.storage_keys.update(keys)

    def _delete_operational_rows(self, ctx: _ResetContext, workspace_id: UUID) -> None:
        steps: list[tuple[str, type[Any]]] = [
            ("chatMessages", ChatMessage),
            ("chatChannelAccountBranches", ChatChannelAccountBranch),
            ("chatConversations", ChatConversation),
            ("chatOauthStates", ChatOauthState),
            ("incidentParticipants", IncidentParticipant),
            ("incidentActivity", IncidentActivity),
            ("incidentAttachments", IncidentAttachment),
            ("incidents", Incident),
            ("documentAttachments", DocumentAttachment),
            ("paymentProofs", PaymentProof),
            ("assetAttachments", AssetAttachment),
            ("carwashSettlementDetails", CarwashSettlementDetail),
            ("carwashSettlements", CarwashSettlement),
            ("carwashCommissions", CarwashCommission),
            ("carwashWashLines", CarwashWashLine),
            ("carwashWashes", CarwashWash),
            ("carwashServiceConfigs", CarwashServiceConfig),
            ("financeFixedExpensePayments", FinanceFixedExpensePayment),
            ("financePosIncomeCorrections", FinancePosIncomeCorrection),
            ("financeManualIncomes", FinanceManualIncome),
            ("financeExpenses", FinanceExpense),
            ("financeFixedExpenses", FinanceFixedExpense),
            ("financeLiabilities", FinanceLiability),
            ("financeBudgets", FinanceBudget),
            ("financeAccounts", FinanceAccount),
            ("cashMovementLines", CashMovementLine),
            ("cashMovements", CashMovement),
            ("customerReceivableLines", CustomerReceivableLine),
            ("customerPayments", CustomerPayment),
            ("customerReceivables", CustomerReceivable),
            ("saleLines", SaleLine),
            ("sales", Sale),
            ("salesQuoteLines", SalesQuoteLine),
            ("salesQuoteRevisions", SalesQuoteRevision),
            ("salesQuotes", SalesQuote),
            ("cashRegisters", CashRegister),
            ("purchaseRequestItems", PurchaseRequestItem),
            ("purchaseRequests", PurchaseRequest),
            ("inventoryMovementLines", InventoryMovementLine),
            ("inventoryMovements", InventoryMovement),
            ("inventoryStockBalances", InventoryStockBalance),
            ("inventoryItemProfiles", InventoryItemProfile),
            ("inventoryWarehouses", InventoryWarehouse),
            ("assets", Asset),
            ("assetCategories", AssetCategory),
            ("appointmentEvents", AppointmentEvent),
            ("appointments", Appointment),
            ("appointmentResourceAcl", AppointmentResourceAcl),
            ("branchOpeningHours", BranchOpeningHour),
            ("appointmentResources", AppointmentResource),
            ("emailNotifications", EmailNotification),
            ("tasks", Task),
            ("crmActivities", CrmActivity),
            ("crmLeads", CrmLead),
            ("crmDiscoveryUsage", CrmDiscoveryUsage),
            ("customerCrmProfiles", CustomerCrmProfile),
            ("hrDocumentRecords", HrDocumentRecord),
            ("hrLeaveRequests", HrLeaveRequest),
            ("employeeDebtPayments", EmployeeDebtPayment),
            ("employeeDebts", EmployeeDebt),
            ("employeeHrProfiles", EmployeeHrProfile),
            ("employeeSchedules", EmployeeSchedule),
            ("employeeSupervisors", EmployeeSupervisor),
            ("employeeBranchAssignments", EmployeeBranchAssignment),
            ("employees", Employee),
            ("attachments", Attachment),
            ("customerBranchAssignments", CustomerBranchAssignment),
            ("customers", Customer),
            ("itemBranchAssignments", ItemBranchAssignment),
            ("items", Item),
            ("itemCategories", ItemCategory),
            ("supplierBranchAssignments", SupplierBranchAssignment),
            ("suppliers", Supplier),
            ("chatChannelAccounts", ChatChannelAccount),
            ("demoSeedRegistry", DemoSeedRegistry),
        ]
        for label, model in steps:
            ctx.deleted_counts[label] = self._delete_for_workspace(model, workspace_id)

    def _delete_non_system_catalog(self, ctx: _ResetContext, workspace_id: UUID) -> None:
        pm_result = self._session.execute(
            delete(PaymentMethod).where(
                PaymentMethod.workspace_id == workspace_id,
                PaymentMethod.is_system.is_(False),
            )
        )
        assert isinstance(pm_result, CursorResult)
        ctx.deleted_counts["paymentMethodsCustom"] = pm_result.rowcount or 0

        uom_result = self._session.execute(
            delete(UnitOfMeasure).where(
                UnitOfMeasure.workspace_id == workspace_id,
                UnitOfMeasure.code.not_in(_SYSTEM_UOM_CODES),
            )
        )
        assert isinstance(uom_result, CursorResult)
        ctx.deleted_counts["unitsOfMeasureCustom"] = uom_result.rowcount or 0

    def _delete_for_workspace(self, model: type[Any], workspace_id: UUID) -> int:
        workspace_column = getattr(model, "workspace_id")
        result = self._session.execute(delete(model).where(workspace_column == workspace_id))
        cursor = result  # CursorResult from DELETE
        assert isinstance(cursor, CursorResult)
        return cursor.rowcount or 0

    def _revoke_sessions(self, workspace_id: UUID) -> None:
        now = datetime.now(UTC)
        self._session.execute(
            update(AuthSession)
            .where(
                AuthSession.workspace_id == workspace_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

    def _reset_counters(self, workspace_id: UUID) -> None:
        counter = self._session.get(SalesDocumentCounter, workspace_id)
        if counter is not None:
            counter.last_quote_value = 0
            counter.last_sale_value = 0
            counter.last_receivable_value = 0
        else:
            self._session.add(
                SalesDocumentCounter(
                    workspace_id=workspace_id,
                    last_quote_value=0,
                    last_sale_value=0,
                    last_receivable_value=0,
                )
            )

        incident_counter = self._session.get(IncidentCounter, workspace_id)
        if incident_counter is not None:
            incident_counter.last_value = 1193
        else:
            self._session.add(IncidentCounter(workspace_id=workspace_id, last_value=1193))

    def _ensure_system_catalog(self, workspace_id: UUID) -> None:
        existing_pm = set(
            self._session.scalars(
                select(PaymentMethod.code).where(PaymentMethod.workspace_id == workspace_id)
            ).all()
        )
        for (
            code,
            method_name,
            icon,
            channel,
            settlement_policy,
            affects_cash_drawer,
            requires_evidence,
        ) in _PAYMENT_METHODS:
            if code in existing_pm:
                continue
            self._session.add(
                PaymentMethod(
                    workspace_id=workspace_id,
                    code=code,
                    name=method_name,
                    icon=icon,
                    status="active",
                    is_system=True,
                    channel=channel,
                    settlement_policy=settlement_policy,
                    affects_cash_drawer=affects_cash_drawer,
                    requires_evidence=requires_evidence,
                )
            )

        existing_uom = set(
            self._session.scalars(
                select(UnitOfMeasure.code).where(UnitOfMeasure.workspace_id == workspace_id)
            ).all()
        )
        for code, unit_name, symbol in _UNITS_OF_MEASURE:
            if code in existing_uom:
                continue
            self._session.add(
                UnitOfMeasure(
                    workspace_id=workspace_id,
                    code=code,
                    name=unit_name,
                    symbol=symbol,
                    status="active",
                )
            )

    def _purge_storage(
        self,
        storage: AttachmentStorage,
        workspace_id: UUID,
        keys: set[str],
    ) -> tuple[str, int]:
        removed = 0
        partial = False
        prefix = f"{workspace_id}/"
        for key in keys:
            try:
                storage.delete(key)
                removed += 1
            except Exception:
                logger.exception("Failed to delete attachment blob %s", key)
                partial = True
        try:
            storage.delete_prefix(prefix)
        except Exception:
            logger.exception("Failed to delete attachment prefix %s", prefix)
            partial = True
        return ("partial" if partial else "complete"), removed
