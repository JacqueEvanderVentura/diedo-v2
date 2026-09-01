import hashlib
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid7

import pytest
from app.services.attachment_storage import (
    AttachmentContentMismatchError,
    AttachmentTooLargeError,
    StoredBlob,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.pos import PosService
from sqlalchemy.exc import IntegrityError


def _principal_and_grant() -> tuple[AuthPrincipal, PermissionGrant]:
    workspace_id = uuid7()
    membership_id = uuid7()
    principal = AuthPrincipal(
        platform_user_id=uuid7(),
        membership_id=membership_id,
        workspace_id=workspace_id,
        session_id=uuid7(),
        email="pos-guards@example.com",
        display_name="POS Guards",
    )
    grant = PermissionGrant(
        permission_code="pos.cash.manage",
        workspace_id=workspace_id,
        membership_id=membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    return principal, grant


def _service(repository: object, session: object | None = None) -> PosService:
    service = object.__new__(PosService)
    service._repository = repository  # type: ignore[assignment]
    service._session = session or SimpleNamespace(commit=lambda: None)  # type: ignore[assignment]
    return service


def test_pos_proof_validation_handles_invalid_empty_large_and_unseekable_files() -> None:
    assert PosService._proof_content_type("image/png; charset=binary") == "image/png"
    with pytest.raises(InvalidOperationError, match="Tipo de comprobante"):
        PosService._proof_content_type("text/plain")
    with pytest.raises(InvalidOperationError, match="vacío"):
        PosService._digest_proof(BytesIO(), max_bytes=8)
    with pytest.raises(InvalidOperationError, match="tamaño permitido"):
        PosService._digest_proof(BytesIO(b"too-large"), max_bytes=3)

    class Unseekable:
        def __init__(self) -> None:
            self._read = False

        def tell(self) -> int:
            raise OSError("not seekable")

        def read(self, _size: int) -> bytes:
            if self._read:
                return b""
            self._read = True
            return b"proof"

        def seek(self, _offset: int) -> None:
            raise OSError("not seekable")

    with pytest.raises(InvalidOperationError, match="preparar"):
        PosService._digest_proof(Unseekable(), max_bytes=20)  # type: ignore[arg-type]

    digest = PosService._digest_proof(BytesIO(b"proof"), max_bytes=20)
    assert digest.size_bytes == 5
    assert len(digest.checksum_sha256) == 64
    assert PosService._safe_filename(r"C:\fake\folder\proof.png") == "proof.png"
    assert PosService._safe_filename("\x00") == "comprobante"


def test_pos_cash_accumulators_cover_same_and_cross_register_reversals() -> None:
    register = SimpleNamespace(
        id=uuid7(),
        opening_cash=Decimal("100.00"),
        cash_sales_amount=Decimal("0.00"),
        receivable_payments_amount=Decimal("0.00"),
        cash_income_amount=Decimal("0.00"),
        cash_expense_amount=Decimal("0.00"),
        version=1,
    )
    PosService._apply_cash_effect(register, "sale", Decimal("20.00"))  # type: ignore[arg-type]
    PosService._apply_cash_effect(  # type: ignore[arg-type]
        register, "receivable_payment", Decimal("10.00")
    )
    PosService._apply_cash_effect(register, "income", Decimal("5.00"))  # type: ignore[arg-type]
    PosService._apply_cash_effect(register, "expense", Decimal("7.00"))  # type: ignore[arg-type]
    assert PosService._expected_cash(register) == Decimal("128.00")  # type: ignore[arg-type]

    PosService._reverse_cash_effect(  # type: ignore[arg-type]
        register,
        SimpleNamespace(
            cash_register_id=uuid7(),
            cash_delta=Decimal("4.00"),
            movement_type="income",
            amount=Decimal("4.00"),
        ),
    )
    PosService._reverse_cash_effect(  # type: ignore[arg-type]
        register,
        SimpleNamespace(
            cash_register_id=uuid7(),
            cash_delta=Decimal("-3.00"),
            movement_type="expense",
            amount=Decimal("3.00"),
        ),
    )
    assert register.cash_expense_amount == Decimal("11.00")
    assert register.cash_income_amount == Decimal("8.00")

    PosService._reverse_cash_effect(  # type: ignore[arg-type]
        register,
        SimpleNamespace(
            cash_register_id=register.id,
            cash_delta=Decimal("-2.00"),
            movement_type="expense",
            amount=Decimal("2.00"),
        ),
    )
    assert register.cash_expense_amount == Decimal("9.00")
    with pytest.raises(ConflictError, match="no admite"):
        PosService._reverse_cash_effect(  # type: ignore[arg-type]
            register,
            SimpleNamespace(
                cash_register_id=register.id,
                cash_delta=Decimal("0.00"),
                movement_type="reversal",
                amount=Decimal("1.00"),
            ),
        )
    with pytest.raises(ConflictError, match="acumulado"):
        PosService._reverse_cash_effect(  # type: ignore[arg-type]
            register,
            SimpleNamespace(
                cash_register_id=register.id,
                cash_delta=Decimal("-50.00"),
                movement_type="expense",
                amount=Decimal("50.00"),
            ),
        )


def test_pos_receivable_state_transitions_and_management_guards() -> None:
    principal, grant = _principal_and_grant()
    commits: list[bool] = []

    class Repository:
        def receivable_record(self, receivable: object) -> object:
            return receivable

        def add_audit(self, **_values: object) -> None:
            return None

    service = _service(Repository(), SimpleNamespace(commit=lambda: commits.append(True)))
    receivable = SimpleNamespace(
        id=uuid7(),
        workspace_id=grant.workspace_id,
        branch_id=uuid7(),
        appointment_id=None,
        source="appointment",
        status="pending",
        amount=Decimal("100.00"),
        paid_amount=Decimal("0.00"),
        due_date=None,
        notes=None,
        paid_at=None,
        cancelled_at=None,
        cancellation_reason=None,
        updated_by_platform_user_id=None,
        version=1,
    )
    service._locked_receivable = lambda _grant, _id: receivable  # type: ignore[method-assign]

    updated = service.update_receivable(
        principal=principal,
        grant=grant,
        receivable_id=receivable.id,
        expected_version=1,
        changes={"due_date": date(2026, 9, 30), "notes": "  Seguimiento   mensual  "},
    )
    assert updated.due_date == date(2026, 9, 30)
    assert updated.notes == "Seguimiento mensual"
    assert updated.version == 2

    cancelled = service.cancel_receivable(
        principal=principal,
        grant=grant,
        receivable_id=receivable.id,
        expected_version=2,
        reason="Cuenta creada por error",
    )
    assert cancelled.status == "cancelled"
    assert cancelled.cancellation_reason == "Cuenta creada por error"
    assert cancelled.version == 3
    assert len(commits) == 2
    assert (
        service.cancel_receivable(
            principal=principal,
            grant=grant,
            receivable_id=receivable.id,
            expected_version=3,
            reason="Reintento",
        )
        is receivable
    )
    with pytest.raises(ConflictError, match="cancelada"):
        service.update_receivable(
            principal=principal,
            grant=grant,
            receivable_id=receivable.id,
            expected_version=3,
            changes={"notes": "No permitido"},
        )

    paid = SimpleNamespace(
        **{**receivable.__dict__, "status": "partial", "paid_amount": Decimal("1")}
    )
    service._locked_receivable = lambda _grant, _id: paid  # type: ignore[method-assign]
    with pytest.raises(ConflictError, match="Revierte primero"):
        service.cancel_receivable(
            principal=principal,
            grant=grant,
            receivable_id=paid.id,
            expected_version=paid.version,
            reason="No permitido",
        )

    for paid_amount, expected_status in (
        (Decimal("0"), "pending"),
        (Decimal("40"), "partial"),
        (Decimal("100"), "paid"),
    ):
        state = SimpleNamespace(
            amount=Decimal("100"),
            paid_amount=paid_amount,
            status="",
            paid_at=None,
            cancelled_at=datetime.now(UTC),
            cancellation_reason="old",
        )
        PosService._set_receivable_status(state)  # type: ignore[arg-type]
        assert state.status == expected_status
        assert (state.paid_at is not None) is (expected_status == "paid")
        assert state.cancelled_at is None
        assert state.cancellation_reason is None


def test_pos_repository_guards_hide_missing_or_out_of_scope_resources() -> None:
    _, unrestricted = _principal_and_grant()
    branch_id = uuid7()
    restricted = PermissionGrant(
        permission_code=unrestricted.permission_code,
        workspace_id=unrestricted.workspace_id,
        membership_id=unrestricted.membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=frozenset({branch_id}),
    )

    class Repository:
        branch_value: object | None = None
        register_value: object | None = None
        current_value: object | None = None
        customer_value: object | None = None
        method_value: object | None = None
        proof_value: object | None = None

        def branch(self, _workspace_id: object, _branch_id: object) -> object | None:
            return self.branch_value

        def get_register(self, *_args: object, **_kwargs: object) -> object | None:
            return self.register_value

        def current_register(self, *_args: object, **_kwargs: object) -> object | None:
            return self.current_value

        def customer(self, *_args: object) -> object | None:
            return self.customer_value

        def payment_method(self, *_args: object) -> object | None:
            return self.method_value

        def get_proof(self, **_kwargs: object) -> object | None:
            return self.proof_value

        def movement_record(self, movement: object) -> object:
            return movement

    repository = Repository()
    service = _service(repository)

    with pytest.raises(ResourceNotFoundError, match="caja no existe"):
        service.get_register(unrestricted, uuid7())
    with pytest.raises(ResourceNotFoundError, match="caja no existe"):
        service.list_register_movements(
            unrestricted,
            register_id=uuid7(),
            movement_type=None,
            page=1,
            page_size=20,
        )
    with pytest.raises(ResourceNotFoundError, match="comprobante no existe"):
        service.get_proof(unrestricted, uuid7())

    with pytest.raises(ResourceNotFoundError, match="inactiva"):
        service._require_active_branch(unrestricted.workspace_id, branch_id)
    repository.branch_value = SimpleNamespace(id=branch_id, legal_entity_id=uuid7())
    assert service._require_active_branch(unrestricted.workspace_id, branch_id).id == branch_id

    PosService._require_branch(restricted, branch_id)
    service._require_optional_branch(restricted, None)
    with pytest.raises(ResourceNotFoundError, match="fuera de tu alcance"):
        PosService._require_branch(restricted, uuid7())

    with pytest.raises(ResourceNotFoundError, match="cliente"):
        service._optional_customer(unrestricted.workspace_id, branch_id, uuid7())
    assert service._optional_customer(unrestricted.workspace_id, branch_id, None) is None
    repository.customer_value = SimpleNamespace(id=uuid7())
    assert (
        service._optional_customer(
            unrestricted.workspace_id, branch_id, repository.customer_value.id
        )
        is repository.customer_value
    )

    with pytest.raises(ResourceNotFoundError, match="método de pago"):
        service._require_payment_method(unrestricted.workspace_id, uuid7())
    repository.method_value = SimpleNamespace(id=uuid7())
    assert (
        service._require_payment_method(unrestricted.workspace_id, repository.method_value.id)
        is repository.method_value
    )

    with pytest.raises(ResourceNotFoundError, match="caja"):
        service._locked_open_register(unrestricted, uuid7())
    repository.register_value = SimpleNamespace(id=uuid7(), branch_id=branch_id, status="closed")
    with pytest.raises(ConflictError, match="cerrada"):
        service._locked_open_register(unrestricted, repository.register_value.id)
    repository.register_value.status = "open"
    assert (
        service._locked_open_register(unrestricted, repository.register_value.id)
        is repository.register_value
    )

    movement = SimpleNamespace(cash_register_id=repository.register_value.id)
    assert service._movement_from_register(unrestricted, movement) is movement  # type: ignore[arg-type]
    repository.register_value = None
    with pytest.raises(ResourceNotFoundError, match="caja"):
        service._movement_from_register(unrestricted, movement)  # type: ignore[arg-type]


def test_pos_reversal_register_discount_and_appointment_balance_guards() -> None:
    principal, grant = _principal_and_grant()
    branch_id = uuid7()

    class Repository:
        register_value: object | None = None
        current_value: object | None = None
        branch_value: object | None = SimpleNamespace(legal_entity_id=uuid7())
        appointment_value: object | None = None

        def get_register(self, *_args: object, **_kwargs: object) -> object | None:
            return self.register_value

        def current_register(self, *_args: object, **_kwargs: object) -> object | None:
            return self.current_value

        def branch(self, *_args: object) -> object | None:
            return self.branch_value

        def appointment(self, *_args: object, **_kwargs: object) -> object | None:
            return self.appointment_value

    repository = Repository()
    service = _service(repository)

    with pytest.raises(ResourceNotFoundError, match="original"):
        service._locked_reversal_register(grant, original_register_id=uuid7(), branch_id=branch_id)
    repository.register_value = SimpleNamespace(id=uuid7(), branch_id=uuid7(), status="open")
    with pytest.raises(ConflictError, match="no pertenece"):
        service._locked_reversal_register(
            grant,
            original_register_id=repository.register_value.id,
            branch_id=branch_id,
        )
    repository.register_value.branch_id = branch_id
    assert (
        service._locked_reversal_register(
            grant,
            original_register_id=repository.register_value.id,
            branch_id=branch_id,
        )
        is repository.register_value
    )
    repository.register_value.status = "closed"
    with pytest.raises(ConflictError, match="Abre una caja"):
        service._locked_reversal_register(
            grant,
            original_register_id=repository.register_value.id,
            branch_id=branch_id,
        )
    repository.current_value = SimpleNamespace(id=uuid7(), branch_id=branch_id, status="open")
    assert (
        service._locked_reversal_register(
            grant,
            original_register_id=repository.register_value.id,
            branch_id=branch_id,
        )
        is repository.current_value
    )

    service._authorization = SimpleNamespace(  # type: ignore[assignment]
        permission_scopes=lambda **_kwargs: []
    )
    with pytest.raises(AuthorizationError, match="descuentos"):
        service._require_discount_permission(principal, grant.workspace_id, branch_id)
    service._authorization = SimpleNamespace(  # type: ignore[assignment]
        permission_scopes=lambda **_kwargs: [SimpleNamespace(scope_type="workspace")]
    )
    service._require_discount_permission(principal, grant.workspace_id, branch_id)

    receivable = SimpleNamespace(
        workspace_id=grant.workspace_id,
        appointment_id=uuid7(),
        amount=Decimal("100"),
        paid_amount=Decimal("30"),
        status="partial",
        updated_by_platform_user_id=principal.platform_user_id,
    )
    with pytest.raises(ConflictError, match="cita asociada"):
        service._sync_appointment_balance(receivable)  # type: ignore[arg-type]
    appointment = SimpleNamespace(
        pending_payment=False,
        pending_amount=Decimal("0"),
        updated_by_platform_user_id=None,
        version=1,
    )
    repository.appointment_value = appointment
    service._sync_appointment_balance(receivable)  # type: ignore[arg-type]
    assert appointment.pending_payment is True
    assert appointment.pending_amount == Decimal("70.00")
    receivable.status = "paid"
    service._sync_appointment_balance(receivable)  # type: ignore[arg-type]
    assert appointment.pending_payment is False
    assert appointment.pending_amount == Decimal("0")


def test_pos_small_idempotency_and_version_helpers() -> None:
    PosService._require_version(2, 2)
    with pytest.raises(ConflictError, match="cambió"):
        PosService._require_version(2, 1)
    PosService._require_same_fingerprint("same", "same", "Idempotency-Key")
    with pytest.raises(ConflictError, match="idempotencia"):
        PosService._require_same_fingerprint("first", "second", "Idempotency-Key")

    first = PosService._fingerprint({"amount": Decimal("1.00"), "branch": uuid7()})
    assert len(first) == 64
    assert PosService._derived_key("test", "value").startswith("test:")
    assert PosService._optional_text(None) is None
    assert PosService._optional_text("  ") is None
    assert PosService._optional_text("  nota   limpia ") == "nota limpia"
    assert PosService._join_note(None, "primera") == "primera"
    assert PosService._join_note("primera", "segunda") == "primera\nsegunda"

    method = SimpleNamespace(
        id=uuid7(),
        code="cash",
        name="Efectivo",
        channel="cash",
        settlement_policy="immediate",
        affects_cash_drawer=True,
        requires_evidence=False,
    )
    snapshot = PosService._payment_snapshot(method)  # type: ignore[arg-type]
    assert snapshot["payment_method_id"] == method.id
    assert set(PosService._empty_payment_snapshot().values()) == {None}


def test_receivable_payment_replay_concurrency_and_business_guards() -> None:
    principal, grant = _principal_and_grant()
    receivable_id = uuid7()
    method_id = uuid7()

    def receivable(**changes: object) -> SimpleNamespace:
        values: dict[str, object] = {
            "id": receivable_id,
            "workspace_id": grant.workspace_id,
            "branch_id": uuid7(),
            "appointment_id": None,
            "receivable_number": "CXC-1",
            "currency_code": "BOB",
            "amount": Decimal("100"),
            "paid_amount": Decimal("0"),
            "status": "pending",
            "version": 1,
        }
        values.update(changes)
        return SimpleNamespace(**values)

    class Repository:
        def __init__(self, results: list[object | None] | None = None) -> None:
            self.results = list(results or [])

        def payment_by_key(self, *_args: object) -> object | None:
            return self.results.pop(0) if self.results else None

        @staticmethod
        def receivable_record(value: object) -> object:
            return value

    replay = SimpleNamespace(request_fingerprint="replayed", receivable_id=receivable_id)
    replay_service = _service(Repository([replay]))
    replay_service._require_same_fingerprint = lambda *_args: None  # type: ignore[method-assign]
    replay_service.get_receivable = lambda _grant, _id: "replayed"  # type: ignore[method-assign]
    assert (
        replay_service.create_receivable_payment(
            principal=principal,
            grant=grant,
            receivable_id=receivable_id,
            amount=Decimal("10"),
            payment_method_id=method_id,
            reference=None,
            note=None,
            register_id=None,
            expected_version=1,
            idempotency_key="payment-replay",
            evidence_source=None,
            filename=None,
            content_type=None,
            storage=SimpleNamespace(),  # type: ignore[arg-type]
            max_bytes=100,
        )
        == "replayed"
    )

    concurrent = SimpleNamespace(request_fingerprint="concurrent")
    concurrent_value = receivable()
    concurrent_service = _service(Repository([None, concurrent]))
    concurrent_service._locked_receivable = lambda *_args: concurrent_value  # type: ignore[method-assign]
    concurrent_service._require_same_fingerprint = lambda *_args: None  # type: ignore[method-assign]
    assert (
        concurrent_service.create_receivable_payment(
            principal=principal,
            grant=grant,
            receivable_id=receivable_id,
            amount=Decimal("10"),
            payment_method_id=method_id,
            reference=None,
            note=None,
            register_id=None,
            expected_version=1,
            idempotency_key="payment-concurrent",
            evidence_source=None,
            filename=None,
            content_type=None,
            storage=SimpleNamespace(),  # type: ignore[arg-type]
            max_bytes=100,
        )
        is concurrent_value
    )

    def guarded_call(
        current: SimpleNamespace,
        method: SimpleNamespace,
        *,
        amount: Decimal = Decimal("10"),
        register_id: object | None = None,
        register: object | None = None,
    ) -> None:
        service = _service(Repository())
        service._locked_receivable = lambda *_args: current  # type: ignore[method-assign]
        service._require_payment_method = lambda *_args: method  # type: ignore[method-assign]
        if register is not None:
            service._locked_open_register = lambda *_args: register  # type: ignore[method-assign]
        service.create_receivable_payment(
            principal=principal,
            grant=grant,
            receivable_id=receivable_id,
            amount=amount,
            payment_method_id=method_id,
            reference=None,
            note=None,
            register_id=register_id,  # type: ignore[arg-type]
            expected_version=1,
            idempotency_key=f"guard-{uuid7()}",
            evidence_source=None,
            filename=None,
            content_type=None,
            storage=SimpleNamespace(),  # type: ignore[arg-type]
            max_bytes=100,
        )

    card = SimpleNamespace(
        id=method_id,
        settlement_policy="immediate",
        requires_evidence=False,
        affects_cash_drawer=False,
    )
    with pytest.raises(ConflictError, match="ya no admite"):
        guarded_call(receivable(status="paid"), card)
    with pytest.raises(InvalidOperationError, match="excede"):
        guarded_call(receivable(), card, amount=Decimal("101"))
    with pytest.raises(InvalidOperationError, match="otro método de crédito"):
        guarded_call(
            receivable(),
            SimpleNamespace(
                id=method_id,
                settlement_policy="receivable",
                requires_evidence=False,
                affects_cash_drawer=False,
            ),
        )
    with pytest.raises(InvalidOperationError, match="comprobante requerido"):
        guarded_call(
            receivable(),
            SimpleNamespace(
                id=method_id,
                settlement_policy="pending_confirmation",
                requires_evidence=True,
                affects_cash_drawer=False,
            ),
        )
    cash = SimpleNamespace(
        id=method_id,
        settlement_policy="immediate",
        requires_evidence=False,
        affects_cash_drawer=True,
    )
    with pytest.raises(InvalidOperationError, match="caja abierta"):
        guarded_call(receivable(), cash)
    with pytest.raises(InvalidOperationError, match="otra sucursal"):
        guarded_call(
            receivable(branch_id=uuid7()),
            cash,
            register_id=uuid7(),
            register=SimpleNamespace(id=uuid7(), branch_id=uuid7()),
        )


def test_receivable_payment_evidence_and_storage_failures() -> None:
    principal, grant = _principal_and_grant()
    receivable_id = uuid7()
    method_id = uuid7()
    proof = b"proof"
    checksum = hashlib.sha256(proof).hexdigest()

    class Session:
        def __init__(self) -> None:
            self.commits = 0
            self.rollbacks = 0

        def commit(self) -> None:
            self.commits += 1

        def rollback(self) -> None:
            self.rollbacks += 1

    class Repository:
        def __init__(self, *, add_error: Exception | None = None) -> None:
            self.add_error = add_error
            self.proofs: list[object] = []

        @staticmethod
        def payment_by_key(*_args: object) -> None:
            return None

        def add_payment(self, payment: object) -> None:
            if self.add_error is not None:
                raise self.add_error
            payment.id = uuid7()  # type: ignore[attr-defined]

        def add_proof(self, payment_proof: object) -> None:
            self.proofs.append(payment_proof)

        @staticmethod
        def add_audit(**_values: object) -> None:
            return None

        @staticmethod
        def receivable_record(value: object) -> object:
            return value

    class Storage:
        def __init__(self, result: StoredBlob | Exception) -> None:
            self.result = result
            self.deleted: list[str] = []

        def save(self, *_args: object, **kwargs: object) -> StoredBlob:
            if isinstance(self.result, Exception):
                raise self.result
            return StoredBlob(
                storage_key=str(kwargs["storage_key"]),
                size_bytes=self.result.size_bytes,
                checksum_sha256=self.result.checksum_sha256,
            )

        def delete(self, storage_key: str) -> None:
            self.deleted.append(storage_key)

    method = SimpleNamespace(
        id=method_id,
        code="transfer",
        name="Transferencia",
        channel="bank_transfer",
        settlement_policy="pending_confirmation",
        affects_cash_drawer=False,
        requires_evidence=True,
    )

    def run(storage: Storage, repository: Repository | None = None) -> tuple[object, Session]:
        current = SimpleNamespace(
            id=receivable_id,
            workspace_id=grant.workspace_id,
            branch_id=uuid7(),
            appointment_id=None,
            receivable_number="CXC-2",
            currency_code="BOB",
            amount=Decimal("100"),
            paid_amount=Decimal("0"),
            paid_at=None,
            cancelled_at=None,
            cancellation_reason=None,
            status="pending",
            version=1,
            updated_by_platform_user_id=None,
        )
        active_repository = repository or Repository()
        session = Session()
        service = _service(active_repository, session)
        service._locked_receivable = lambda *_args: current  # type: ignore[method-assign]
        service._require_payment_method = lambda *_args: method  # type: ignore[method-assign]
        result = service.create_receivable_payment(
            principal=principal,
            grant=grant,
            receivable_id=receivable_id,
            amount=Decimal("10"),
            payment_method_id=method_id,
            reference=" TRANS-1 ",
            note=" Evidencia ",
            register_id=None,
            expected_version=1,
            idempotency_key=f"evidence-{uuid7()}",
            evidence_source=BytesIO(proof),
            filename="transfer.png",
            content_type="image/png",
            storage=storage,  # type: ignore[arg-type]
            max_bytes=100,
        )
        return result, session

    valid_storage = Storage(StoredBlob("unused", len(proof), checksum))
    result, session = run(valid_storage)
    assert result.status == "partial"
    assert result.paid_amount == Decimal("10.00")
    assert session.commits == 1

    changed_storage = Storage(StoredBlob("unused", len(proof) + 1, checksum))
    with pytest.raises(InvalidOperationError, match="cambió"):
        run(changed_storage)
    assert changed_storage.deleted

    too_large_storage = Storage(AttachmentTooLargeError())
    with pytest.raises(InvalidOperationError, match="tamaño permitido"):
        run(too_large_storage)
    assert too_large_storage.deleted

    mismatch_storage = Storage(AttachmentContentMismatchError())
    with pytest.raises(InvalidOperationError, match="contenido no coincide"):
        run(mismatch_storage)
    assert mismatch_storage.deleted

    broken_storage = Storage(RuntimeError("storage offline"))
    with pytest.raises(RuntimeError, match="storage offline"):
        run(broken_storage)
    assert broken_storage.deleted


def test_stock_consumption_and_restoration_guards() -> None:
    principal, grant = _principal_and_grant()
    branch_id = uuid7()
    product_id = uuid7()
    product_line = SimpleNamespace(
        catalog=SimpleNamespace(
            item=SimpleNamespace(id=product_id, item_type="product", name="Alcohol")
        ),
        quantity=Decimal("3"),
    )
    service_line = SimpleNamespace(
        catalog=SimpleNamespace(
            item=SimpleNamespace(id=uuid7(), item_type="service", name="Consulta")
        ),
        quantity=Decimal("1"),
    )

    class Repository:
        warehouse: object | None = None
        movement: object | None = None

        def default_warehouse(self, *_args: object) -> object | None:
            return self.warehouse

        def inventory_movement(self, *_args: object) -> object | None:
            return self.movement

    class Inventory:
        locked: list[object] = []

        def lock_stock_records(self, **_values: object) -> list[object]:
            return self.locked

        @staticmethod
        def create_movement(**_values: object) -> object:
            return uuid7()

    repository = Repository()
    inventory = Inventory()
    service = _service(repository)
    service._inventory = inventory  # type: ignore[assignment]

    common = {
        "principal": principal,
        "workspace_id": grant.workspace_id,
        "branch_id": branch_id,
        "sale_number": "V-1",
        "idempotency_key": "stock-sale",
        "request_fingerprint": "fingerprint",
    }
    assert service._consume_stock(lines=(service_line,), **common) is None  # type: ignore[arg-type]
    with pytest.raises(InvalidOperationError, match="almacén predeterminado"):
        service._consume_stock(lines=(product_line,), **common)  # type: ignore[arg-type]

    repository.warehouse = SimpleNamespace(id=uuid7())
    with pytest.raises(ConflictError, match="balance de inventario"):
        service._consume_stock(lines=(product_line,), **common)  # type: ignore[arg-type]

    stock = SimpleNamespace(
        item=product_line.catalog.item,
        balance=SimpleNamespace(quantity=Decimal("2")),
    )
    inventory.locked = [stock]
    with pytest.raises(ConflictError, match="Stock insuficiente"):
        service._consume_stock(lines=(product_line,), **common)  # type: ignore[arg-type]
    stock.balance.quantity = Decimal("5")
    assert service._consume_stock(lines=(product_line,), **common) is not None  # type: ignore[arg-type]

    historical_service = SimpleNamespace(
        item_id=uuid7(), item_type="service", quantity=Decimal("1")
    )
    historical_product = SimpleNamespace(
        item_id=product_id, item_type="product", quantity=Decimal("3")
    )
    sale = SimpleNamespace(
        workspace_id=grant.workspace_id,
        branch_id=branch_id,
        inventory_movement_id=None,
        sale_number="V-1",
    )
    restore_common = {
        "principal": principal,
        "sale": sale,
        "idempotency_key": "stock-void",
        "request_fingerprint": "fingerprint",
        "reason": "Error",
    }
    assert service._restore_stock(lines=(historical_service,), **restore_common) is None  # type: ignore[arg-type]
    with pytest.raises(ConflictError, match="no tiene movimiento"):
        service._restore_stock(lines=(historical_product,), **restore_common)  # type: ignore[arg-type]
    sale.inventory_movement_id = uuid7()
    with pytest.raises(ConflictError, match="no existe"):
        service._restore_stock(lines=(historical_product,), **restore_common)  # type: ignore[arg-type]
    repository.movement = SimpleNamespace(warehouse_id=repository.warehouse.id)
    inventory.locked = []
    with pytest.raises(ConflictError, match="bloquear todo"):
        service._restore_stock(lines=(historical_product,), **restore_common)  # type: ignore[arg-type]
    inventory.locked = [stock]
    assert service._restore_stock(lines=(historical_product,), **restore_common) is not None  # type: ignore[arg-type]


def test_close_register_replay_concurrency_and_state_guards() -> None:
    principal, grant = _principal_and_grant()
    register_id = uuid7()

    class Repository:
        def __init__(
            self,
            close_results: list[object | None],
            register: object | None = None,
        ) -> None:
            self.close_results = close_results
            self.register = register

        def register_by_close_key(self, *_args: object) -> object | None:
            return self.close_results.pop(0) if self.close_results else None

        def get_register(self, *_args: object, **_kwargs: object) -> object | None:
            return self.register

        @staticmethod
        def register_record(value: object) -> object:
            return value

    def close(repository: Repository) -> object:
        service = _service(repository)
        service._require_same_fingerprint = lambda *_args: None  # type: ignore[method-assign]
        return service.close_register(
            principal=principal,
            grant=grant,
            register_id=register_id,
            expected_version=1,
            counted_cash=Decimal("100"),
            notes=None,
            idempotency_key=f"close-{uuid7()}",
        )

    replay = SimpleNamespace(branch_id=uuid7(), close_request_fingerprint="same")
    assert close(Repository([replay])) is replay
    with pytest.raises(ResourceNotFoundError, match="caja no existe"):
        close(Repository([None]))

    register = SimpleNamespace(status="open")
    concurrent = SimpleNamespace(branch_id=uuid7(), close_request_fingerprint="same")
    assert close(Repository([None, concurrent], register)) is concurrent
    register.status = "closed"
    with pytest.raises(ConflictError, match="ya está cerrada"):
        close(Repository([None, None], register))


def test_payment_reversal_and_sale_void_guards() -> None:
    principal, grant = _principal_and_grant()
    payment_id = uuid7()
    receivable_id = uuid7()

    class PaymentRepository:
        def __init__(
            self,
            reversal_results: list[object | None],
            payment: object | None = None,
            movement: object | None = None,
        ) -> None:
            self.reversal_results = reversal_results
            self.payment = payment
            self.movement = movement

        def payment_by_reversal_key(self, *_args: object) -> object | None:
            return self.reversal_results.pop(0) if self.reversal_results else None

        def get_payment(self, *_args: object, **_kwargs: object) -> object | None:
            return self.payment

        def movement_for_payment(self, *_args: object) -> object | None:
            return self.movement

    base_payment = {
        "id": payment_id,
        "branch_id": uuid7(),
        "receivable_id": receivable_id,
        "version": 1,
        "status": "posted",
        "amount": Decimal("10"),
        "affects_cash_drawer": False,
        "cash_register_id": None,
    }
    current_receivable = SimpleNamespace(paid_amount=Decimal("10"))

    def reverse(repository: PaymentRepository) -> object:
        service = _service(repository)
        service._require_same_fingerprint = lambda *_args: None  # type: ignore[method-assign]
        service.get_receivable = lambda *_args: "replayed"  # type: ignore[method-assign]
        service._locked_receivable = lambda *_args: current_receivable  # type: ignore[method-assign]
        service._locked_reversal_register = lambda *_args, **_kwargs: SimpleNamespace(id=uuid7())  # type: ignore[method-assign]
        return service.reverse_payment(
            principal=principal,
            grant=grant,
            payment_id=payment_id,
            expected_version=1,
            reason="Corrección",
            idempotency_key=f"reverse-{uuid7()}",
        )

    replay = SimpleNamespace(
        branch_id=uuid7(),
        receivable_id=receivable_id,
        reversal_request_fingerprint="same",
    )
    assert reverse(PaymentRepository([replay])) == "replayed"
    with pytest.raises(ResourceNotFoundError, match="pago no existe"):
        reverse(PaymentRepository([None]))
    concurrent = SimpleNamespace(receivable_id=receivable_id, reversal_request_fingerprint="same")
    assert (
        reverse(PaymentRepository([None, concurrent], SimpleNamespace(**base_payment)))
        == "replayed"
    )
    with pytest.raises(ConflictError, match="ya fue revertido"):
        reverse(
            PaymentRepository(
                [None, None], SimpleNamespace(**{**base_payment, "status": "reversed"})
            )
        )
    current_receivable.paid_amount = Decimal("5")
    with pytest.raises(ConflictError, match="inconsistente"):
        reverse(PaymentRepository([None, None], SimpleNamespace(**base_payment)))
    current_receivable.paid_amount = Decimal("10")
    cash_payment = SimpleNamespace(
        **{**base_payment, "affects_cash_drawer": True, "cash_register_id": None}
    )
    with pytest.raises(ConflictError, match="no tiene una caja"):
        reverse(PaymentRepository([None, None], cash_payment))
    cash_payment.cash_register_id = uuid7()
    with pytest.raises(ConflictError, match="movimiento de caja"):
        reverse(PaymentRepository([None, None], cash_payment))

    sale_id = uuid7()

    class SaleRepository:
        def __init__(
            self,
            void_results: list[object | None],
            sale: object | None = None,
            receivable: object | None = None,
        ) -> None:
            self.void_results = void_results
            self.sale = sale
            self.receivable = receivable

        def sale_by_void_key(self, *_args: object) -> object | None:
            return self.void_results.pop(0) if self.void_results else None

        def get_sale(self, *_args: object, **_kwargs: object) -> object | None:
            return self.sale

        @staticmethod
        def sale_record(value: object) -> object:
            return value

        def receivable_for_sale(self, *_args: object, **_kwargs: object) -> object | None:
            return self.receivable

    base_sale = {
        "id": sale_id,
        "branch_id": uuid7(),
        "version": 1,
        "status": "completed",
    }

    def void(repository: SaleRepository) -> object:
        service = _service(repository)
        service._require_same_fingerprint = lambda *_args: None  # type: ignore[method-assign]
        return service.void_sale(
            principal=principal,
            grant=grant,
            sale_id=sale_id,
            expected_version=1,
            reason="Venta duplicada",
            idempotency_key=f"void-{uuid7()}",
        )

    void_replay = SimpleNamespace(branch_id=uuid7(), void_request_fingerprint="same")
    assert void(SaleRepository([void_replay])) is void_replay
    with pytest.raises(ResourceNotFoundError, match="venta no existe"):
        void(SaleRepository([None]))
    void_concurrent = SimpleNamespace(branch_id=uuid7(), void_request_fingerprint="same")
    assert (
        void(SaleRepository([None, void_concurrent], SimpleNamespace(**base_sale)))
        is void_concurrent
    )
    with pytest.raises(ConflictError, match="ya fue anulada"):
        void(SaleRepository([None, None], SimpleNamespace(**{**base_sale, "status": "voided"})))
    with pytest.raises(ConflictError, match="Revierte primero"):
        void(
            SaleRepository(
                [None, None],
                SimpleNamespace(**base_sale),
                SimpleNamespace(paid_amount=Decimal("1")),
            )
        )


def test_upload_receivable_proof_failure_paths() -> None:
    principal, grant = _principal_and_grant()
    receivable_id = uuid7()
    payload = b"proof"
    checksum = hashlib.sha256(payload).hexdigest()

    class Session:
        def rollback(self) -> None:
            return None

    class Repository:
        def __init__(
            self,
            receivable: object | None,
            proof_results: list[object | None] | None = None,
            add_error: Exception | None = None,
        ) -> None:
            self.receivable = receivable
            self.proof_results = list(proof_results or [])
            self.add_error = add_error

        def get_receivable(self, *_args: object, **_kwargs: object) -> object | None:
            return self.receivable

        def proof_by_receivable_checksum(self, *_args: object) -> object | None:
            return self.proof_results.pop(0) if self.proof_results else None

        def add_proof(self, _proof: object) -> None:
            if self.add_error is not None:
                raise self.add_error

        @staticmethod
        def add_audit(**_values: object) -> None:
            return None

    class Storage:
        def __init__(self, result: StoredBlob | Exception) -> None:
            self.result = result
            self.deleted: list[str] = []

        def save(self, *_args: object, **kwargs: object) -> StoredBlob:
            if isinstance(self.result, Exception):
                raise self.result
            return StoredBlob(
                str(kwargs["storage_key"]),
                self.result.size_bytes,
                self.result.checksum_sha256,
            )

        def delete(self, storage_key: str) -> None:
            self.deleted.append(storage_key)

    def upload(repository: Repository, storage: Storage) -> object:
        return _service(repository, Session()).upload_receivable_proof(
            principal=principal,
            grant=grant,
            receivable_id=receivable_id,
            evidence_source=BytesIO(payload),
            filename="proof.png",
            content_type="image/png",
            storage=storage,  # type: ignore[arg-type]
            max_bytes=100,
        )

    blob = StoredBlob("unused", len(payload), checksum)
    with pytest.raises(ResourceNotFoundError, match="cuenta por cobrar"):
        upload(Repository(None), Storage(blob))
    cancelled = SimpleNamespace(id=receivable_id, status="cancelled")
    with pytest.raises(ConflictError, match="cancelada"):
        upload(Repository(cancelled), Storage(blob))
    active = SimpleNamespace(id=receivable_id, branch_id=uuid7(), status="pending")
    with pytest.raises(InvalidOperationError, match="tamaño permitido"):
        upload(Repository(active), Storage(AttachmentTooLargeError()))
    with pytest.raises(InvalidOperationError, match="contenido no coincide"):
        upload(Repository(active), Storage(AttachmentContentMismatchError()))

    replay = SimpleNamespace(id=uuid7())
    integrity = IntegrityError("insert", {}, RuntimeError("duplicate"))
    replay_storage = Storage(blob)
    assert upload(Repository(active, [None, replay], integrity), replay_storage) is replay
    assert replay_storage.deleted

    generic_storage = Storage(blob)
    with pytest.raises(RuntimeError, match="write failed"):
        upload(Repository(active, [None], RuntimeError("write failed")), generic_storage)
    assert generic_storage.deleted


def test_checkout_pricing_and_receivable_lock_guards() -> None:
    principal, grant = _principal_and_grant()
    branch_id = uuid7()
    register_id = uuid7()
    method_id = uuid7()
    item_id = uuid7()

    class Repository:
        catalog_records: list[object] = []
        workspace_value: object | None = None
        receivable_results: list[object | None] = []
        appointment_value: object | None = None

        @staticmethod
        def sale_by_key(*_args: object) -> None:
            return None

        def workspace(self, *_args: object) -> object | None:
            return self.workspace_value

        def catalog(self, **_values: object) -> list[object]:
            return self.catalog_records

        def get_receivable(self, *_args: object, **_kwargs: object) -> object | None:
            return self.receivable_results.pop(0)

        def appointment(self, *_args: object, **_kwargs: object) -> object | None:
            return self.appointment_value

    repository = Repository()
    service = _service(repository)
    service._locked_open_register = lambda *_args: SimpleNamespace(  # type: ignore[method-assign]
        id=register_id, branch_id=branch_id
    )
    service._optional_customer = lambda *_args: None  # type: ignore[method-assign]
    card = SimpleNamespace(
        id=method_id,
        settlement_policy="immediate",
        requires_evidence=False,
        affects_cash_drawer=False,
    )
    service._require_payment_method = lambda *_args: card  # type: ignore[method-assign]
    values = {
        "branch_id": branch_id,
        "register_id": register_id,
        "payment_method_id": method_id,
        "customer_id": None,
        "lines": [{"item_id": item_id, "quantity": Decimal("1")}],
    }

    with pytest.raises(InvalidOperationError, match="deben enviarse juntos"):
        service.checkout(
            principal=principal,
            grant=grant,
            values={**values, "quote_id": uuid7()},
            idempotency_key="checkout-pair",
        )

    service._locked_open_register = lambda *_args: SimpleNamespace(  # type: ignore[method-assign]
        id=register_id, branch_id=uuid7()
    )
    with pytest.raises(InvalidOperationError, match="otra sucursal"):
        service.checkout(
            principal=principal,
            grant=grant,
            values=values,
            idempotency_key="checkout-register",
        )

    service._locked_open_register = lambda *_args: SimpleNamespace(  # type: ignore[method-assign]
        id=register_id, branch_id=branch_id
    )
    service._require_payment_method = lambda *_args: SimpleNamespace(  # type: ignore[method-assign]
        settlement_policy="immediate",
        requires_evidence=True,
        affects_cash_drawer=False,
    )
    with pytest.raises(InvalidOperationError, match="requiere comprobante"):
        service.checkout(
            principal=principal,
            grant=grant,
            values=values,
            idempotency_key="checkout-evidence",
        )

    service._require_payment_method = lambda *_args: SimpleNamespace(  # type: ignore[method-assign]
        settlement_policy="receivable",
        requires_evidence=False,
        affects_cash_drawer=False,
    )
    with pytest.raises(InvalidOperationError, match="cliente registrado"):
        service.checkout(
            principal=principal,
            grant=grant,
            values=values,
            idempotency_key="checkout-customer",
        )

    service._require_payment_method = lambda *_args: card  # type: ignore[method-assign]
    service._price_lines = lambda **_kwargs: (SimpleNamespace(total=Decimal("10")), ())  # type: ignore[method-assign]
    with pytest.raises(ResourceNotFoundError, match="workspace"):
        service.checkout(
            principal=principal,
            grant=grant,
            values=values,
            idempotency_key="checkout-workspace",
        )

    service = _service(repository)
    service._require_active_branch = lambda *_args: None  # type: ignore[method-assign]
    repository.catalog_records = []
    with pytest.raises(ResourceNotFoundError, match="artículo"):
        service._price_lines(
            principal=principal,
            grant=grant,
            branch_id=branch_id,
            raw_lines=values["lines"],  # type: ignore[arg-type]
            discount_type=None,
            discount_value=None,
        )
    record = SimpleNamespace(
        item=SimpleNamespace(id=item_id, name="Alcohol", sku="ALC", item_type="product"),
        profile=SimpleNamespace(sale_price=None, tax_rate=Decimal("0"), unit_cost=Decimal("1")),
        unit=SimpleNamespace(symbol="u"),
    )
    repository.catalog_records = [record]
    with pytest.raises(InvalidOperationError, match="no tiene precio"):
        service._price_lines(
            principal=principal,
            grant=grant,
            branch_id=branch_id,
            raw_lines=values["lines"],  # type: ignore[arg-type]
            discount_type=None,
            discount_value=None,
        )
    record.profile.sale_price = Decimal("10")
    discount_checks: list[bool] = []
    service._require_discount_permission = lambda *_args: discount_checks.append(True)  # type: ignore[method-assign]
    priced, lines = service._price_lines(
        principal=principal,
        grant=grant,
        branch_id=branch_id,
        raw_lines=[
            {
                "item_id": item_id,
                "quantity": Decimal("2"),
                "unit_price": Decimal("9"),
            }
        ],
        discount_type=None,
        discount_value=None,
    )
    assert priced.total == Decimal("18.00")
    assert lines[0].unit_price == Decimal("9.00")
    assert discount_checks == [True]

    repository.receivable_results = [None]
    with pytest.raises(ResourceNotFoundError, match="cuenta por cobrar"):
        service._locked_receivable(grant, uuid7())
    candidate = SimpleNamespace(appointment_id=uuid7())
    repository.receivable_results = [candidate]
    with pytest.raises(ConflictError, match="cita asociada"):
        service._locked_receivable(grant, uuid7())
    candidate.appointment_id = None
    repository.receivable_results = [candidate, None]
    with pytest.raises(ResourceNotFoundError, match="cuenta por cobrar"):
        service._locked_receivable(grant, uuid7())
