from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Appointment, Customer, CustomerPayment, CustomerReceivable, Sale
from app.repositories.pos import PosRepository
from app.services.booking_tokens import issue_appointment_management_token
from app.services.errors import AuthorizationError, ResourceNotFoundError
from app.services.invoice_pdf import InvoicePdfService
from app.services.public_booking import PublicBookingService


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
        return [
            self._booking._appointment_summary(
                row,
                issue_appointment_management_token(row.id),
            )
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
        items: list[dict[str, Any]] = []

        def receivable_sort_key(item: CustomerReceivable) -> tuple:
            due = item.due_date or item.created_at.date()
            return due, item.id

        for row in sorted(rows, key=receivable_sort_key):
            balance = row.amount - row.paid_amount
            items.append(
                {
                    "id": row.id,
                    "branch_id": row.branch_id,
                    "receivable_number": row.receivable_number,
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
        receivable_ids = self._session.scalars(
            select(CustomerReceivable.id).where(
                CustomerReceivable.workspace_id == branch.workspace_id,
                CustomerReceivable.customer_id == customer.id,
            )
        ).all()
        if not receivable_ids:
            return []
        rows = self._session.scalars(
            select(CustomerPayment).where(
                CustomerPayment.workspace_id == branch.workspace_id,
                CustomerPayment.receivable_id.in_(receivable_ids),
                CustomerPayment.status == "posted",
            )
        ).all()
        return [
            {
                "id": row.id,
                "branch_id": row.branch_id,
                "receivable_id": row.receivable_id,
                "amount": row.amount,
                "currency_code": row.currency_code,
                "payment_method_name": row.payment_method_name,
                "reference": row.reference,
                "posted_at": row.posted_at,
                "status": row.status,
            }
            for row in sorted(rows, key=lambda item: item.posted_at, reverse=True)
        ]

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
