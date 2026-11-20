"""Delete clients, agenda, and finance data for one workspace (preserve catalog/staff)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from app.db.models import (
    Appointment,
    AppointmentEvent,
    Attachment,
    CashMovement,
    CashMovementLine,
    CashRegister,
    CrmActivity,
    CrmLead,
    Customer,
    CustomerBranchAssignment,
    CustomerCrmProfile,
    CustomerPayment,
    CustomerReceivable,
    CustomerReceivableLine,
    DocumentAttachment,
    EmailNotification,
    FinanceAccount,
    FinanceBudget,
    FinanceExpense,
    FinanceFixedExpense,
    FinanceFixedExpensePayment,
    FinanceLiability,
    FinanceManualIncome,
    FinancePosIncomeCorrection,
    PaymentProof,
    PortalTaskCompletion,
    PurchaseRequest,
    Sale,
    SaleLine,
    SalesDocumentCounter,
    SalesQuote,
    SalesQuoteLine,
    SalesQuoteRevision,
    SaleTenderLine,
    Workspace,
)
from app.db.models.inventory import InventoryMovement
from app.services.errors import ConflictError, ResourceNotFoundError


def _delete(session: Session, model: type[Any], workspace_id: UUID) -> int:
    result = session.execute(delete(model).where(model.workspace_id == workspace_id))
    assert isinstance(result, CursorResult)
    return result.rowcount or 0


def _delete_branch(session: Session, model: type[Any], workspace_id: UUID, branch_id: UUID) -> int:
    result = session.execute(
        delete(model).where(
            model.workspace_id == workspace_id,
            model.branch_id == branch_id,
        )
    )
    assert isinstance(result, CursorResult)
    return result.rowcount or 0


def _confirm_workspace_slug(session: Session, workspace_id: UUID, confirmation_slug: str) -> None:
    workspace = session.scalar(select(Workspace).where(Workspace.id == workspace_id))
    if workspace is None:
        raise ResourceNotFoundError("La compañía no existe.", "workspaceId")
    if workspace.slug != confirmation_slug.strip().lower():
        raise ConflictError(
            "El slug de confirmación no coincide con la compañía.",
            "confirmationSlug",
        )


def selective_wipe(
    session: Session, workspace_id: UUID, *, confirmation_slug: str
) -> dict[str, int]:
    workspace = session.scalar(select(Workspace).where(Workspace.id == workspace_id))
    if workspace is None:
        raise ResourceNotFoundError("La compañía no existe.", "workspaceId")
    if workspace.slug != confirmation_slug.strip().lower():
        raise ConflictError(
            "El slug de confirmación no coincide con la compañía.",
            "confirmationSlug",
        )

    counts: dict[str, int] = {}

    session.execute(
        update(PurchaseRequest)
        .where(
            PurchaseRequest.workspace_id == workspace_id,
            PurchaseRequest.finance_expense_id.is_not(None),
        )
        .values(finance_expense_id=None)
    )
    session.execute(
        update(InventoryMovement)
        .where(
            InventoryMovement.workspace_id == workspace_id,
            InventoryMovement.appointment_id.is_not(None),
        )
        .values(appointment_id=None)
    )

    steps: list[tuple[str, type[Any]]] = [
        ("documentAttachments", DocumentAttachment),
        ("paymentProofs", PaymentProof),
        ("financePosIncomeCorrections", FinancePosIncomeCorrection),
        ("cashMovementLines", CashMovementLine),
        ("cashMovementsReversals", CashMovement),
        ("cashMovements", CashMovement),
        ("customerReceivableLines", CustomerReceivableLine),
        ("customerPayments", CustomerPayment),
        ("customerReceivables", CustomerReceivable),
        ("saleTenderLines", SaleTenderLine),
        ("saleLines", SaleLine),
        ("sales", Sale),
        ("salesQuoteLines", SalesQuoteLine),
        ("salesQuoteRevisions", SalesQuoteRevision),
        ("salesQuotes", SalesQuote),
        ("cashRegisters", CashRegister),
        ("financeFixedExpensePayments", FinanceFixedExpensePayment),
        ("financeFixedExpenses", FinanceFixedExpense),
        ("financeExpenses", FinanceExpense),
        ("financeManualIncomes", FinanceManualIncome),
        ("financeBudgets", FinanceBudget),
        ("financeAccounts", FinanceAccount),
        ("financeLiabilities", FinanceLiability),
        ("appointmentEvents", AppointmentEvent),
        ("emailNotifications", EmailNotification),
        ("appointments", Appointment),
        ("portalTaskCompletions", PortalTaskCompletion),
        ("crmActivities", CrmActivity),
        ("crmLeads", CrmLead),
        ("customerCrmProfiles", CustomerCrmProfile),
        ("customerBranchAssignments", CustomerBranchAssignment),
        ("customers", Customer),
    ]
    for label, model in steps:
        if label == "cashMovementsReversals":
            result = session.execute(
                delete(CashMovement).where(
                    CashMovement.workspace_id == workspace_id,
                    CashMovement.reversal_of_movement_id.is_not(None),
                )
            )
            assert isinstance(result, CursorResult)
            counts[label] = result.rowcount or 0
            continue
        counts[label] = _delete(session, model, workspace_id)

    att = session.execute(
        delete(Attachment).where(
            Attachment.workspace_id == workspace_id,
            Attachment.customer_id.is_not(None),
        )
    )
    assert isinstance(att, CursorResult)
    counts["attachmentsCustomer"] = att.rowcount or 0

    counter = session.scalar(
        select(SalesDocumentCounter).where(SalesDocumentCounter.workspace_id == workspace_id)
    )
    if counter is not None:
        counter.last_quote_value = 0
        counter.last_sale_value = 0
        counter.last_receivable_value = 0

    return counts


def selective_wipe_customers_and_agenda(
    session: Session, workspace_id: UUID, *, confirmation_slug: str
) -> dict[str, int]:
    """Remove clients and appointments only (preserve finance, catalog, staff)."""
    workspace = session.scalar(select(Workspace).where(Workspace.id == workspace_id))
    if workspace is None:
        raise ResourceNotFoundError("La compañía no existe.", "workspaceId")
    if workspace.slug != confirmation_slug.strip().lower():
        raise ConflictError(
            "El slug de confirmación no coincide con la compañía.",
            "confirmationSlug",
        )

    counts: dict[str, int] = {}

    session.execute(
        update(InventoryMovement)
        .where(
            InventoryMovement.workspace_id == workspace_id,
            InventoryMovement.appointment_id.is_not(None),
        )
        .values(appointment_id=None)
    )

    steps: list[tuple[str, type[Any]]] = [
        ("customerReceivableLines", CustomerReceivableLine),
        ("customerPayments", CustomerPayment),
        ("customerReceivables", CustomerReceivable),
        ("saleTenderLines", SaleTenderLine),
        ("saleLines", SaleLine),
        ("sales", Sale),
        ("salesQuoteLines", SalesQuoteLine),
        ("salesQuoteRevisions", SalesQuoteRevision),
        ("salesQuotes", SalesQuote),
        ("appointmentEvents", AppointmentEvent),
        ("emailNotifications", EmailNotification),
        ("appointments", Appointment),
        ("portalTaskCompletions", PortalTaskCompletion),
        ("crmActivities", CrmActivity),
        ("crmLeads", CrmLead),
        ("customerCrmProfiles", CustomerCrmProfile),
        ("customerBranchAssignments", CustomerBranchAssignment),
        ("customers", Customer),
    ]
    for label, model in steps:
        counts[label] = _delete(session, model, workspace_id)

    att = session.execute(
        delete(Attachment).where(
            Attachment.workspace_id == workspace_id,
            Attachment.customer_id.is_not(None),
        )
    )
    assert isinstance(att, CursorResult)
    counts["attachmentsCustomer"] = att.rowcount or 0

    return counts


def selective_wipe_customers_and_agenda_for_branch(
    session: Session,
    workspace_id: UUID,
    branch_id: UUID,
    *,
    confirmation_slug: str,
) -> dict[str, int]:
    """Remove clients and appointments for one branch only (DN/SDE intact)."""
    _confirm_workspace_slug(session, workspace_id, confirmation_slug)

    appointment_ids = select(Appointment.id).where(
        Appointment.workspace_id == workspace_id,
        Appointment.branch_id == branch_id,
    )
    counts: dict[str, int] = {}

    session.execute(
        update(InventoryMovement)
        .where(
            InventoryMovement.workspace_id == workspace_id,
            InventoryMovement.appointment_id.in_(appointment_ids),
        )
        .values(appointment_id=None)
    )

    session.execute(
        delete(AppointmentEvent).where(
            AppointmentEvent.workspace_id == workspace_id,
            AppointmentEvent.appointment_id.in_(appointment_ids),
        )
    )
    email_result = session.execute(
        delete(EmailNotification).where(
            EmailNotification.workspace_id == workspace_id,
            EmailNotification.appointment_id.in_(appointment_ids),
        )
    )
    assert isinstance(email_result, CursorResult)
    counts["emailNotifications"] = email_result.rowcount or 0

    branch_receivables = select(CustomerReceivable.id).where(
        CustomerReceivable.workspace_id == workspace_id,
        CustomerReceivable.branch_id == branch_id,
    )
    line_result = session.execute(
        delete(CustomerReceivableLine).where(
            CustomerReceivableLine.workspace_id == workspace_id,
            CustomerReceivableLine.receivable_id.in_(branch_receivables),
        )
    )
    assert isinstance(line_result, CursorResult)
    counts["customerReceivableLines"] = line_result.rowcount or 0

    counts["customerPayments"] = _delete_branch(session, CustomerPayment, workspace_id, branch_id)
    counts["customerReceivables"] = _delete_branch(
        session, CustomerReceivable, workspace_id, branch_id
    )

    branch_sales = select(Sale.id).where(
        Sale.workspace_id == workspace_id,
        Sale.branch_id == branch_id,
    )
    tender_result = session.execute(
        delete(SaleTenderLine).where(
            SaleTenderLine.workspace_id == workspace_id,
            SaleTenderLine.sale_id.in_(branch_sales),
        )
    )
    assert isinstance(tender_result, CursorResult)
    counts["saleTenderLines"] = tender_result.rowcount or 0

    sale_line_result = session.execute(
        delete(SaleLine).where(
            SaleLine.workspace_id == workspace_id,
            SaleLine.sale_id.in_(branch_sales),
        )
    )
    assert isinstance(sale_line_result, CursorResult)
    counts["saleLines"] = sale_line_result.rowcount or 0
    counts["sales"] = _delete_branch(session, Sale, workspace_id, branch_id)

    branch_quotes = select(SalesQuote.id).where(
        SalesQuote.workspace_id == workspace_id,
        SalesQuote.branch_id == branch_id,
    )
    quote_line_result = session.execute(
        delete(SalesQuoteLine).where(
            SalesQuoteLine.workspace_id == workspace_id,
            SalesQuoteLine.quote_id.in_(branch_quotes),
        )
    )
    assert isinstance(quote_line_result, CursorResult)
    counts["salesQuoteLines"] = quote_line_result.rowcount or 0

    revision_result = session.execute(
        delete(SalesQuoteRevision).where(
            SalesQuoteRevision.workspace_id == workspace_id,
            SalesQuoteRevision.quote_id.in_(branch_quotes),
        )
    )
    assert isinstance(revision_result, CursorResult)
    counts["salesQuoteRevisions"] = revision_result.rowcount or 0
    counts["salesQuotes"] = _delete_branch(session, SalesQuote, workspace_id, branch_id)

    counts["crmActivities"] = _delete_branch(session, CrmActivity, workspace_id, branch_id)
    counts["crmLeads"] = _delete_branch(session, CrmLead, workspace_id, branch_id)

    appt_result = session.execute(
        delete(Appointment).where(
            Appointment.workspace_id == workspace_id,
            Appointment.branch_id == branch_id,
        )
    )
    assert isinstance(appt_result, CursorResult)
    counts["appointments"] = appt_result.rowcount or 0

    branch_customers = select(CustomerBranchAssignment.customer_id).where(
        CustomerBranchAssignment.workspace_id == workspace_id,
        CustomerBranchAssignment.branch_id == branch_id,
    )
    portal_result = session.execute(
        delete(PortalTaskCompletion).where(
            PortalTaskCompletion.workspace_id == workspace_id,
            PortalTaskCompletion.customer_id.in_(branch_customers),
        )
    )
    assert isinstance(portal_result, CursorResult)
    counts["portalTaskCompletions"] = portal_result.rowcount or 0

    assignment_result = session.execute(
        delete(CustomerBranchAssignment).where(
            CustomerBranchAssignment.workspace_id == workspace_id,
            CustomerBranchAssignment.branch_id == branch_id,
        )
    )
    assert isinstance(assignment_result, CursorResult)
    counts["customerBranchAssignments"] = assignment_result.rowcount or 0

    remaining = select(CustomerBranchAssignment.customer_id).where(
        CustomerBranchAssignment.workspace_id == workspace_id,
        CustomerBranchAssignment.customer_id.in_(branch_customers),
    )
    orphan_customers = select(branch_customers.except_(remaining).subquery().c.customer_id)

    profile_result = session.execute(
        delete(CustomerCrmProfile).where(
            CustomerCrmProfile.workspace_id == workspace_id,
            CustomerCrmProfile.customer_id.in_(orphan_customers),
        )
    )
    assert isinstance(profile_result, CursorResult)
    counts["customerCrmProfiles"] = profile_result.rowcount or 0

    att = session.execute(
        delete(Attachment).where(
            Attachment.workspace_id == workspace_id,
            Attachment.customer_id.in_(orphan_customers),
        )
    )
    assert isinstance(att, CursorResult)
    counts["attachmentsCustomer"] = att.rowcount or 0

    customer_result = session.execute(
        delete(Customer).where(
            Customer.workspace_id == workspace_id,
            Customer.id.in_(orphan_customers),
        )
    )
    assert isinstance(customer_result, CursorResult)
    counts["customers"] = customer_result.rowcount or 0

    return counts
