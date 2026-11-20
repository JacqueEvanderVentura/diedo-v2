from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Appointment,
    Branch,
    Customer,
    CustomerPayment,
    CustomerReceivable,
    PaymentMethod,
    Sale,
    SaleTenderLine,
)
from app.repositories.pos import PosRepository
from app.services.booking_tokens import issue_appointment_management_token
from app.services.errors import AuthorizationError, ResourceNotFoundError
from app.services.invoice_pdf import InvoicePdfService
from app.services.public_booking import PublicBookingService


def _portal_tender_visible(line: SaleTenderLine) -> bool:
    if line.settlement_policy == "receivable":
        return False
    if line.settlement_policy == "immediate":
        return line.status == "settled"
    if line.settlement_policy == "pending_confirmation":
        return line.status in ("settled", "awaiting_approval")
    return False


class PublicPortalService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._booking = PublicBookingService(session)

    def register(self, branch_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        return self._booking.update_profile(branch_id, payload)

    def me(self, branch_id: UUID, document_type: str, document_id: str) -> dict[str, Any]:
        return self._booking.identify(branch_id, document_type, document_id)

    def list_appointments(
        self, branch_id: UUID, document_type: str, document_id: str
    ) -> list[dict[str, Any]]:
        branch, _workspace = self._booking._resolve_branch(branch_id)
        customer = self._customer_for_document(branch.workspace_id, document_type, document_id)
        if customer is None:
            return []
        rows = self._session.scalars(
            select(Appointment).where(
                Appointment.workspace_id == branch.workspace_id,
                Appointment.customer_id == customer.id,
                Appointment.record_status == "active",
            )
        ).all()
        branch_ids = {row.branch_id for row in rows}
        branches = {
            item.id: item
            for item in self._session.scalars(select(Branch).where(Branch.id.in_(branch_ids)))
        }
        return [
            {
                **self._booking._appointment_summary(
                    row,
                    issue_appointment_management_token(row.id),
                ),
                "can_manage_online": PublicBookingService._management_access(
                    row, branches[row.branch_id]
                )["can_manage_online"],
            }
            for row in sorted(rows, key=lambda item: (item.scheduled_date, item.scheduled_time))
        ]

    def list_receivables(
        self, branch_id: UUID, document_type: str, document_id: str
    ) -> list[dict[str, Any]]:
        branch, _workspace = self._booking._resolve_branch(branch_id)
        customer = self._customer_for_document(branch.workspace_id, document_type, document_id)
        if customer is None:
            return []
        rows = self._session.scalars(
            select(CustomerReceivable).where(
                CustomerReceivable.workspace_id == branch.workspace_id,
                CustomerReceivable.customer_id == customer.id,
                CustomerReceivable.status != "cancelled",
            )
        ).all()
        sale_ids = {row.sale_id for row in rows if row.sale_id is not None}
        sale_numbers: dict[UUID, str] = {}
        if sale_ids:
            sale_numbers = {
                sale.id: sale.sale_number
                for sale in self._session.scalars(
                    select(Sale).where(
                        Sale.workspace_id == branch.workspace_id,
                        Sale.id.in_(sale_ids),
                    )
                ).all()
            }
        items: list[dict[str, Any]] = []

        def receivable_sort_key(item: CustomerReceivable) -> tuple:
            due = item.due_date or item.created_at.date()
            return due, item.id

        for row in sorted(rows, key=receivable_sort_key):
            balance = row.amount - row.paid_amount - row.approval_pending_amount
            items.append(
                {
                    "id": row.id,
                    "branch_id": row.branch_id,
                    "receivable_number": row.receivable_number,
                    "sale_number": (
                        sale_numbers.get(row.sale_id) if row.sale_id is not None else None
                    ),
                    "status": row.status,
                    "amount": row.amount,
                    "paid_amount": row.paid_amount,
                    "balance": balance,
                    "due_date": row.due_date,
                    "currency_code": row.currency_code,
                }
            )
        return items

    def list_payments(
        self, branch_id: UUID, document_type: str, document_id: str
    ) -> list[dict[str, Any]]:
        branch, _workspace = self._booking._resolve_branch(branch_id)
        customer = self._customer_for_document(branch.workspace_id, document_type, document_id)
        if customer is None:
            return []
        items: list[dict[str, Any]] = []

        receivable_ids = self._session.scalars(
            select(CustomerReceivable.id).where(
                CustomerReceivable.workspace_id == branch.workspace_id,
                CustomerReceivable.customer_id == customer.id,
            )
        ).all()
        receivable_sale_numbers: dict[UUID, str | None] = {}
        if receivable_ids:
            receivable_rows = self._session.scalars(
                select(CustomerReceivable).where(
                    CustomerReceivable.workspace_id == branch.workspace_id,
                    CustomerReceivable.id.in_(receivable_ids),
                )
            ).all()
            rec_sale_ids = {row.sale_id for row in receivable_rows if row.sale_id is not None}
            rec_sale_numbers: dict[UUID, str] = {}
            if rec_sale_ids:
                rec_sale_numbers = {
                    sale.id: sale.sale_number
                    for sale in self._session.scalars(
                        select(Sale).where(
                            Sale.workspace_id == branch.workspace_id,
                            Sale.id.in_(rec_sale_ids),
                        )
                    ).all()
                }
            for rec in receivable_rows:
                receivable_sale_numbers[rec.id] = (
                    rec_sale_numbers.get(rec.sale_id) if rec.sale_id is not None else None
                )

            rows = self._session.scalars(
                select(CustomerPayment).where(
                    CustomerPayment.workspace_id == branch.workspace_id,
                    CustomerPayment.receivable_id.in_(receivable_ids),
                    CustomerPayment.status == "posted",
                )
            ).all()
            for row in rows:
                sale_number = receivable_sale_numbers.get(row.receivable_id)
                items.append(
                    {
                        "id": row.id,
                        "branch_id": row.branch_id,
                        "receivable_id": row.receivable_id,
                        "sale_id": None,
                        "sale_number": sale_number,
                        "source": "receivable",
                        "amount": row.amount,
                        "currency_code": row.currency_code,
                        "payment_method_name": row.payment_method_name,
                        "reference": row.reference,
                        "posted_at": row.posted_at,
                        "status": row.status,
                    }
                )

        sales = self._session.scalars(
            select(Sale).where(
                Sale.workspace_id == branch.workspace_id,
                Sale.customer_id == customer.id,
                Sale.status == "completed",
            )
        ).all()
        sale_ids = [sale.id for sale in sales]
        tenders_by_sale: dict[UUID, list[SaleTenderLine]] = {}
        if sale_ids:
            tender_rows = self._session.scalars(
                select(SaleTenderLine).where(
                    SaleTenderLine.workspace_id == branch.workspace_id,
                    SaleTenderLine.sale_id.in_(sale_ids),
                )
            ).all()
            method_ids = {row.payment_method_id for row in tender_rows}
            method_names: dict[UUID, str] = {}
            if method_ids:
                methods = self._session.scalars(
                    select(PaymentMethod).where(
                        PaymentMethod.workspace_id == branch.workspace_id,
                        PaymentMethod.id.in_(method_ids),
                    )
                ).all()
                method_names = {method.id: method.name for method in methods}
            for tender in tender_rows:
                tenders_by_sale.setdefault(tender.sale_id, []).append(tender)

        for sale in sales:
            tender_lines = tenders_by_sale.get(sale.id, [])
            if tender_lines:
                for line in sorted(tender_lines, key=lambda item: item.position):
                    if not _portal_tender_visible(line):
                        continue
                    items.append(
                        {
                            "id": line.id,
                            "branch_id": sale.branch_id,
                            "receivable_id": None,
                            "sale_id": sale.id,
                            "sale_number": sale.sale_number,
                            "source": "sale",
                            "amount": line.amount,
                            "currency_code": sale.currency_code,
                            "payment_method_name": method_names.get(
                                line.payment_method_id, sale.payment_method_name
                            ),
                            "reference": line.reference,
                            "posted_at": sale.completed_at,
                            "status": "posted",
                        }
                    )
                continue
            if sale.settlement_policy not in ("immediate", "pending_confirmation"):
                continue
            items.append(
                {
                    "id": sale.id,
                    "branch_id": sale.branch_id,
                    "receivable_id": None,
                    "sale_id": sale.id,
                    "sale_number": sale.sale_number,
                    "source": "sale",
                    "amount": sale.total,
                    "currency_code": sale.currency_code,
                    "payment_method_name": sale.payment_method_name,
                    "reference": sale.payment_reference,
                    "posted_at": sale.completed_at,
                    "status": "posted",
                }
            )

        return sorted(items, key=lambda item: item["posted_at"], reverse=True)

    def list_invoices(
        self, branch_id: UUID, document_type: str, document_id: str
    ) -> list[dict[str, Any]]:
        branch, _workspace = self._booking._resolve_branch(branch_id)
        customer = self._customer_for_document(branch.workspace_id, document_type, document_id)
        if customer is None:
            return []
        rows = self._session.scalars(
            select(Sale).where(
                Sale.workspace_id == branch.workspace_id,
                Sale.customer_id == customer.id,
                Sale.status == "completed",
            )
        ).all()
        return [
            {
                "id": row.id,
                "branch_id": row.branch_id,
                "sale_number": row.sale_number,
                "total": row.total,
                "currency_code": row.currency_code,
                "completed_at": row.completed_at,
                "status": row.status,
            }
            for row in sorted(rows, key=lambda item: item.completed_at, reverse=True)
        ]

    def invoice_pdf(
        self,
        branch_id: UUID,
        sale_id: UUID,
        document_type: str,
        document_id: str,
    ) -> tuple[bytes, str]:
        branch, _workspace = self._booking._resolve_branch(branch_id)
        customer = self._customer_for_document(branch.workspace_id, document_type, document_id)
        if customer is None:
            raise AuthorizationError("No tienes acceso a esta factura.", "saleId")
        sale = self._session.scalar(
            select(Sale).where(
                Sale.workspace_id == branch.workspace_id,
                Sale.id == sale_id,
                Sale.customer_id == customer.id,
                Sale.status == "completed",
            )
        )
        if sale is None:
            raise ResourceNotFoundError("La factura no existe.", "saleId")
        record = PosRepository(self._session).sale_record(sale)
        pdf_bytes = InvoicePdfService(self._session).render_sale_pdf(branch.workspace_id, record)
        return pdf_bytes, f"{sale.sale_number}.pdf"

    def _customer_for_document(
        self, workspace_id: UUID, document_type: str, document_id: str
    ) -> Customer | None:
        normalized = self._booking._normalized_document(document_type, document_id)
        return self._booking._master_data.customer_by_document(workspace_id, normalized)
