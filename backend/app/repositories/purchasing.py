from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import ColumnElement, delete, exists, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.db.models import (
    AuditEntry,
    Branch,
    PlatformUser,
    PurchaseRequest,
    PurchaseRequestItem,
    PurchasingSettings,
    Supplier,
    SupplierBranchAssignment,
    WorkspaceMembership,
)


@dataclass(frozen=True)
class SupplierRecord:
    supplier: Supplier
    branch_ids: tuple[UUID, ...]


@dataclass(frozen=True)
class SupplierPage:
    items: tuple[SupplierRecord, ...]
    total_items: int


@dataclass(frozen=True)
class PurchaseRequestRecord:
    request: PurchaseRequest
    supplier_name: str
    items: tuple[PurchaseRequestItem, ...]


@dataclass(frozen=True)
class PurchaseRequestPage:
    items: tuple[PurchaseRequestRecord, ...]
    total_items: int


@dataclass(frozen=True)
class PurchaseRequestStatsRecord:
    total: int
    pendiente: int
    aprobada: int
    rechazada: int
    entregada: int


@dataclass(frozen=True)
class PurchasingSettingsRecord:
    settings: PurchasingSettings
    approver_name: str | None


@dataclass(frozen=True)
class PurchasingApproverRecord:
    membership_id: UUID
    display_name: str


class PurchasingRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_suppliers(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        active: bool | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> SupplierPage:
        predicates: list[ColumnElement[bool]] = [
            Supplier.workspace_id == workspace_id,
            Supplier.status != "archived",
            self._supplier_visibility_predicate(workspace_id, visible_branch_ids, branch_id),
        ]
        if search:
            value = search.casefold()
            predicates.append(
                or_(
                    func.lower(Supplier.name).contains(value),
                    func.lower(Supplier.tax_identifier).contains(value),
                    func.lower(Supplier.contact_name).contains(value),
                )
            )
        if active is not None:
            predicates.append(Supplier.status == ("active" if active else "inactive"))

        total_items = self._session.scalar(select(func.count(Supplier.id)).where(*predicates)) or 0
        order_fields: dict[str, Any] = {
            "name": func.lower(Supplier.name),
            "rnc": Supplier.tax_identifier,
            "contactName": Supplier.contact_name,
            "productCount": Supplier.product_count,
            "createdAt": Supplier.created_at,
        }
        order_field = order_fields[sort_by]
        order = (
            order_field.desc().nulls_last()
            if sort_direction == "desc"
            else order_field.asc().nulls_last()
        )
        suppliers = tuple(
            self._session.scalars(
                select(Supplier)
                .where(*predicates)
                .order_by(order, Supplier.id)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        branches = self._branches_by_supplier(workspace_id, [item.id for item in suppliers])
        return SupplierPage(
            items=tuple(
                SupplierRecord(supplier=item, branch_ids=branches.get(item.id, ()))
                for item in suppliers
            ),
            total_items=total_items,
        )

    def get_supplier(
        self,
        *,
        workspace_id: UUID,
        supplier_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
    ) -> SupplierRecord | None:
        supplier = self._session.scalar(
            select(Supplier).where(
                Supplier.workspace_id == workspace_id,
                Supplier.id == supplier_id,
                self._supplier_visibility_predicate(
                    workspace_id, visible_branch_ids, branch_id=None
                ),
            )
        )
        if supplier is None:
            return None
        branches = self._branches_by_supplier(workspace_id, [supplier.id])
        return SupplierRecord(supplier=supplier, branch_ids=branches.get(supplier.id, ()))

    def get_supplier_for_update(
        self, workspace_id: UUID, supplier_id: UUID
    ) -> SupplierRecord | None:
        supplier = self._session.scalar(
            select(Supplier)
            .where(Supplier.workspace_id == workspace_id, Supplier.id == supplier_id)
            .with_for_update()
        )
        if supplier is None:
            return None
        branches = self._branches_by_supplier(workspace_id, [supplier.id])
        return SupplierRecord(supplier=supplier, branch_ids=branches.get(supplier.id, ()))

    def supplier_by_creation_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> tuple[UUID, str | None] | None:
        row = self._session.execute(
            select(Supplier.id, Supplier.request_fingerprint).where(
                Supplier.workspace_id == workspace_id,
                Supplier.creation_idempotency_key == idempotency_key,
            )
        ).one_or_none()
        return (row[0], row[1]) if row else None

    def supplier_identity_exists(
        self,
        workspace_id: UUID,
        normalized_name: str,
        tax_identifier: str | None,
        *,
        exclude_id: UUID | None = None,
    ) -> bool:
        identity = or_(Supplier.normalized_name == normalized_name)
        if tax_identifier is not None:
            identity = or_(identity, Supplier.tax_identifier == tax_identifier)
        predicates = [
            Supplier.workspace_id == workspace_id,
            Supplier.status != "archived",
            identity,
        ]
        if exclude_id is not None:
            predicates.append(Supplier.id != exclude_id)
        return bool(self._session.scalar(select(exists().where(*predicates))))

    def create_supplier(
        self,
        *,
        supplier_id: UUID,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        values: dict[str, Any],
        branch_ids: Sequence[UUID],
        idempotency_key: str,
        request_fingerprint: str,
        request_id: str,
    ) -> Supplier:
        supplier = Supplier(
            id=supplier_id,
            workspace_id=workspace_id,
            name=values["name"],
            normalized_name=values["normalized_name"],
            tax_identifier=values.get("tax_identifier"),
            contact_name=values.get("contact_name"),
            phone=values.get("phone"),
            email=values.get("email"),
            address=values.get("address"),
            product_count=values.get("product_count", 0),
            status="active",
            creation_idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
            created_by_platform_user_id=actor_platform_user_id,
            updated_by_platform_user_id=actor_platform_user_id,
        )
        self._session.add(supplier)
        self._session.add_all(
            SupplierBranchAssignment(
                workspace_id=workspace_id,
                supplier_id=supplier_id,
                branch_id=branch_id,
            )
            for branch_id in branch_ids
        )
        self.add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="purchasing.supplier.create",
            target_type="supplier",
            target_id=supplier_id,
            request_id=request_id,
            details={"branchIds": [str(item) for item in branch_ids]},
        )
        self._session.flush()
        return supplier

    def update_supplier(
        self,
        *,
        supplier: Supplier,
        changes: dict[str, Any],
        branch_ids: Sequence[UUID] | None,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> None:
        for field, value in changes.items():
            setattr(supplier, field, value)
        if branch_ids is not None:
            self._session.execute(
                delete(SupplierBranchAssignment).where(
                    SupplierBranchAssignment.workspace_id == supplier.workspace_id,
                    SupplierBranchAssignment.supplier_id == supplier.id,
                )
            )
            self._session.add_all(
                SupplierBranchAssignment(
                    workspace_id=supplier.workspace_id,
                    supplier_id=supplier.id,
                    branch_id=branch_id,
                )
                for branch_id in branch_ids
            )
        supplier.updated_by_platform_user_id = actor_platform_user_id
        supplier.version += 1
        self.add_audit(
            workspace_id=supplier.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="purchasing.supplier.update",
            target_type="supplier",
            target_id=supplier.id,
            request_id=request_id,
            details={"fields": sorted(changes), "branchAssignmentsChanged": branch_ids is not None},
        )
        self._session.flush()

    def archive_supplier(
        self,
        *,
        supplier: Supplier,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> None:
        supplier.status = "archived"
        supplier.normalized_name = f"{supplier.normalized_name} archived {supplier.id}"
        supplier.updated_by_platform_user_id = actor_platform_user_id
        supplier.version += 1
        self.add_audit(
            workspace_id=supplier.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="purchasing.supplier.archive",
            target_type="supplier",
            target_id=supplier.id,
            request_id=request_id,
            details={},
        )
        self._session.flush()

    def list_purchase_requests(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        supplier_id: UUID | None,
        search: str | None,
        status: str | None,
        priority: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> PurchaseRequestPage:
        predicates = self._request_predicates(workspace_id, visible_branch_ids, branch_id)
        if supplier_id is not None:
            predicates.append(PurchaseRequest.supplier_id == supplier_id)
        if status is not None:
            predicates.append(PurchaseRequest.status == status)
        if priority is not None:
            predicates.append(PurchaseRequest.priority == priority)
        if search:
            value = search.casefold()
            predicates.append(
                or_(
                    func.lower(PurchaseRequest.request_number).contains(value),
                    func.lower(PurchaseRequest.requester_name).contains(value),
                    exists()
                    .where(
                        Supplier.workspace_id == PurchaseRequest.workspace_id,
                        Supplier.id == PurchaseRequest.supplier_id,
                        func.lower(Supplier.name).contains(value),
                    )
                    .correlate(PurchaseRequest),
                )
            )

        total_items = (
            self._session.scalar(select(func.count(PurchaseRequest.id)).where(*predicates)) or 0
        )
        total = (
            select(
                func.coalesce(
                    func.sum(PurchaseRequestItem.quantity * PurchaseRequestItem.unit_price),
                    Decimal("0"),
                )
            )
            .where(
                PurchaseRequestItem.workspace_id == PurchaseRequest.workspace_id,
                PurchaseRequestItem.purchase_request_id == PurchaseRequest.id,
            )
            .correlate(PurchaseRequest)
            .scalar_subquery()
        )
        order_fields: dict[str, Any] = {
            "createdAt": PurchaseRequest.created_at,
            "number": PurchaseRequest.request_number,
            "supplier": func.lower(Supplier.name),
            "requester": func.lower(PurchaseRequest.requester_name),
            "total": total,
            "status": PurchaseRequest.status,
            "priority": PurchaseRequest.priority,
        }
        order_field = order_fields[sort_by]
        order = order_field.desc() if sort_direction == "desc" else order_field.asc()
        rows = self._session.execute(
            select(PurchaseRequest, Supplier.name)
            .join(
                Supplier,
                (Supplier.workspace_id == PurchaseRequest.workspace_id)
                & (Supplier.id == PurchaseRequest.supplier_id),
            )
            .where(*predicates)
            .order_by(order.nulls_last(), PurchaseRequest.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        items = self._items_by_request(workspace_id, [row[0].id for row in rows])
        return PurchaseRequestPage(
            items=tuple(
                PurchaseRequestRecord(
                    request=row[0],
                    supplier_name=row[1],
                    items=items.get(row[0].id, ()),
                )
                for row in rows
            ),
            total_items=total_items,
        )

    def purchase_request_stats(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> PurchaseRequestStatsRecord:
        predicates = self._request_predicates(workspace_id, visible_branch_ids, branch_id)
        row = self._session.execute(
            select(
                func.count(PurchaseRequest.id),
                func.count(PurchaseRequest.id).filter(PurchaseRequest.status == "pendiente"),
                func.count(PurchaseRequest.id).filter(PurchaseRequest.status == "aprobada"),
                func.count(PurchaseRequest.id).filter(PurchaseRequest.status == "rechazada"),
                func.count(PurchaseRequest.id).filter(PurchaseRequest.status == "entregada"),
            ).where(*predicates)
        ).one()
        return PurchaseRequestStatsRecord(*(int(value or 0) for value in row))

    def get_purchase_request(
        self,
        *,
        workspace_id: UUID,
        request_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        for_update: bool = False,
    ) -> PurchaseRequestRecord | None:
        statement = (
            select(PurchaseRequest, Supplier.name)
            .join(
                Supplier,
                (Supplier.workspace_id == PurchaseRequest.workspace_id)
                & (Supplier.id == PurchaseRequest.supplier_id),
            )
            .where(
                PurchaseRequest.workspace_id == workspace_id,
                PurchaseRequest.id == request_id,
            )
        )
        if visible_branch_ids is not None:
            statement = statement.where(PurchaseRequest.branch_id.in_(visible_branch_ids))
        if for_update:
            statement = statement.with_for_update(of=PurchaseRequest)
        row = self._session.execute(statement).one_or_none()
        if row is None:
            return None
        items = self._items_by_request(workspace_id, [row[0].id])
        return PurchaseRequestRecord(
            request=row[0], supplier_name=row[1], items=items.get(row[0].id, ())
        )

    def purchase_request_by_creation_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> tuple[UUID, str] | None:
        row = self._session.execute(
            select(PurchaseRequest.id, PurchaseRequest.request_fingerprint).where(
                PurchaseRequest.workspace_id == workspace_id,
                PurchaseRequest.creation_idempotency_key == idempotency_key,
            )
        ).one_or_none()
        return (row[0], row[1]) if row else None

    def create_purchase_request(
        self,
        *,
        request_id_value: UUID,
        workspace_id: UUID,
        requester_membership_id: UUID,
        requester_name: str,
        actor_platform_user_id: UUID,
        values: dict[str, Any],
        idempotency_key: str,
        request_fingerprint: str,
        request_id: str,
    ) -> PurchaseRequest:
        request = PurchaseRequest(
            id=request_id_value,
            workspace_id=workspace_id,
            request_number=values["request_number"],
            supplier_id=values["supplier_id"],
            branch_id=values["branch_id"],
            requester_membership_id=requester_membership_id,
            requester_name=requester_name,
            status="pendiente",
            priority=values["priority"],
            notes=values.get("notes"),
            quote_file_name=values.get("quote_file_name"),
            creation_idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
            created_by_platform_user_id=actor_platform_user_id,
            updated_by_platform_user_id=actor_platform_user_id,
        )
        self._session.add(request)
        self._add_request_items(workspace_id, request_id_value, values["items"])
        self.add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="purchasing.request.create",
            target_type="purchase_request",
            target_id=request_id_value,
            request_id=request_id,
            details={
                "branchId": str(values["branch_id"]),
                "supplierId": str(values["supplier_id"]),
                "itemCount": len(values["items"]),
            },
        )
        self._session.flush()
        return request

    def update_purchase_request(
        self,
        *,
        request: PurchaseRequest,
        changes: dict[str, Any],
        items: Sequence[dict[str, Any]] | None,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> None:
        for field, value in changes.items():
            setattr(request, field, value)
        if items is not None:
            self._session.execute(
                delete(PurchaseRequestItem).where(
                    PurchaseRequestItem.workspace_id == request.workspace_id,
                    PurchaseRequestItem.purchase_request_id == request.id,
                )
            )
            self._add_request_items(request.workspace_id, request.id, items)
        request.updated_by_platform_user_id = actor_platform_user_id
        request.version += 1
        self.add_audit(
            workspace_id=request.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="purchasing.request.update",
            target_type="purchase_request",
            target_id=request.id,
            request_id=request_id,
            details={"fields": sorted(changes), "itemsChanged": items is not None},
        )
        self._session.flush()

    def review_purchase_request(
        self,
        *,
        request: PurchaseRequest,
        status: str,
        reviewer_membership_id: UUID,
        actor_platform_user_id: UUID,
        reviewed_at: Any,
        request_id: str,
    ) -> None:
        request.status = status
        request.reviewer_membership_id = reviewer_membership_id
        request.reviewed_at = reviewed_at
        request.updated_by_platform_user_id = actor_platform_user_id
        request.version += 1
        self.add_audit(
            workspace_id=request.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action=f"purchasing.request.{status}",
            target_type="purchase_request",
            target_id=request.id,
            request_id=request_id,
            details={"status": status},
        )
        self._session.flush()

    def deliver_purchase_request(
        self,
        *,
        request: PurchaseRequest,
        delivered_at: Any,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> None:
        request.status = "entregada"
        request.delivered_at = delivered_at
        request.updated_by_platform_user_id = actor_platform_user_id
        request.version += 1
        self.add_audit(
            workspace_id=request.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="purchasing.request.delivered",
            target_type="purchase_request",
            target_id=request.id,
            request_id=request_id,
            details={},
        )
        self._session.flush()

    def get_settings(
        self, workspace_id: UUID, *, for_update: bool = False
    ) -> PurchasingSettingsRecord | None:
        membership = aliased(WorkspaceMembership)
        user = aliased(PlatformUser)
        statement = (
            select(PurchasingSettings, user.display_name)
            .outerjoin(
                membership,
                (membership.workspace_id == PurchasingSettings.workspace_id)
                & (membership.id == PurchasingSettings.approver_membership_id),
            )
            .outerjoin(user, user.id == membership.platform_user_id)
            .where(PurchasingSettings.workspace_id == workspace_id)
        )
        if for_update:
            statement = statement.with_for_update(of=PurchasingSettings)
        row = self._session.execute(statement).one_or_none()
        return PurchasingSettingsRecord(settings=row[0], approver_name=row[1]) if row else None

    def update_settings(
        self,
        *,
        settings: PurchasingSettings,
        approver_membership_id: UUID | None,
        notify_on_request: bool,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> None:
        settings.approver_membership_id = approver_membership_id
        settings.notify_on_request = notify_on_request
        settings.updated_by_platform_user_id = actor_platform_user_id
        settings.version += 1
        self.add_audit(
            workspace_id=settings.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="purchasing.settings.update",
            target_type="purchasing_settings",
            target_id=settings.id,
            request_id=request_id,
            details={
                "approverUserId": str(approver_membership_id) if approver_membership_id else None,
                "notifyOnRequest": notify_on_request,
            },
        )
        self._session.flush()

    def active_branch_ids(self, workspace_id: UUID, branch_ids: set[UUID]) -> set[UUID]:
        if not branch_ids:
            return set()
        return set(
            self._session.scalars(
                select(Branch.id).where(
                    Branch.workspace_id == workspace_id,
                    Branch.id.in_(branch_ids),
                    Branch.status == "active",
                )
            )
        )

    def supplier_available_in_branch(
        self, workspace_id: UUID, supplier_id: UUID, branch_id: UUID
    ) -> bool:
        return (
            self._session.scalar(
                select(Supplier.id)
                .join(
                    SupplierBranchAssignment,
                    (SupplierBranchAssignment.workspace_id == Supplier.workspace_id)
                    & (SupplierBranchAssignment.supplier_id == Supplier.id),
                )
                .where(
                    Supplier.workspace_id == workspace_id,
                    Supplier.id == supplier_id,
                    Supplier.status == "active",
                    SupplierBranchAssignment.branch_id == branch_id,
                )
            )
            is not None
        )

    def active_membership_name(self, workspace_id: UUID, membership_id: UUID) -> str | None:
        return self._session.scalar(
            select(PlatformUser.display_name)
            .join(WorkspaceMembership, WorkspaceMembership.platform_user_id == PlatformUser.id)
            .where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.id == membership_id,
                WorkspaceMembership.status == "active",
                PlatformUser.status == "active",
            )
        )

    def list_active_memberships(self, workspace_id: UUID) -> tuple[PurchasingApproverRecord, ...]:
        rows = self._session.execute(
            select(WorkspaceMembership.id, PlatformUser.display_name)
            .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
            .where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.status == "active",
                PlatformUser.status == "active",
            )
            .order_by(func.lower(PlatformUser.display_name), WorkspaceMembership.id)
        )
        return tuple(PurchasingApproverRecord(row[0], row[1]) for row in rows)

    def add_audit(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        action: str,
        target_type: str,
        target_id: UUID,
        request_id: str,
        details: dict[str, object],
    ) -> None:
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                outcome="success",
                request_id=request_id,
                details=details,
            )
        )

    def _branches_by_supplier(
        self, workspace_id: UUID, supplier_ids: Sequence[UUID]
    ) -> dict[UUID, tuple[UUID, ...]]:
        result: dict[UUID, list[UUID]] = {}
        if not supplier_ids:
            return {}
        rows = self._session.execute(
            select(
                SupplierBranchAssignment.supplier_id,
                SupplierBranchAssignment.branch_id,
            )
            .where(
                SupplierBranchAssignment.workspace_id == workspace_id,
                SupplierBranchAssignment.supplier_id.in_(supplier_ids),
            )
            .order_by(SupplierBranchAssignment.supplier_id, SupplierBranchAssignment.branch_id)
        )
        for supplier_id, branch_id in rows:
            result.setdefault(supplier_id, []).append(branch_id)
        return {key: tuple(value) for key, value in result.items()}

    def _items_by_request(
        self, workspace_id: UUID, request_ids: Sequence[UUID]
    ) -> dict[UUID, tuple[PurchaseRequestItem, ...]]:
        result: dict[UUID, list[PurchaseRequestItem]] = {}
        if not request_ids:
            return {}
        items = self._session.scalars(
            select(PurchaseRequestItem)
            .where(
                PurchaseRequestItem.workspace_id == workspace_id,
                PurchaseRequestItem.purchase_request_id.in_(request_ids),
            )
            .order_by(PurchaseRequestItem.purchase_request_id, PurchaseRequestItem.position)
        )
        for item in items:
            result.setdefault(item.purchase_request_id, []).append(item)
        return {key: tuple(value) for key, value in result.items()}

    def _add_request_items(
        self, workspace_id: UUID, request_id: UUID, items: Sequence[dict[str, Any]]
    ) -> None:
        self._session.add_all(
            PurchaseRequestItem(
                workspace_id=workspace_id,
                purchase_request_id=request_id,
                position=index,
                name=item["name"],
                quantity=item["quantity"],
                unit=item["unit"],
                unit_price=item["unit_price"],
            )
            for index, item in enumerate(items, start=1)
        )

    @staticmethod
    def _supplier_visibility_predicate(
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> ColumnElement[bool]:
        branch_predicates = [
            SupplierBranchAssignment.workspace_id == workspace_id,
            SupplierBranchAssignment.supplier_id == Supplier.id,
        ]
        if visible_branch_ids is not None:
            branch_predicates.append(SupplierBranchAssignment.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            branch_predicates.append(SupplierBranchAssignment.branch_id == branch_id)
        return exists().where(*branch_predicates)

    @staticmethod
    def _request_predicates(
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> list[ColumnElement[bool]]:
        predicates: list[ColumnElement[bool]] = [PurchaseRequest.workspace_id == workspace_id]
        if visible_branch_ids is not None:
            predicates.append(PurchaseRequest.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            predicates.append(PurchaseRequest.branch_id == branch_id)
        return predicates
