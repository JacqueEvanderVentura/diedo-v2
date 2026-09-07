from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.services import demo_pos_seed


class _RegisterSession:
    def __init__(self, registry: object, seeded_register: object, live_register: object) -> None:
        self.registry = registry
        self.seeded_register = seeded_register
        self.live_register = live_register
        self.flush_count = 0

    def scalar(self, _statement: object) -> object:
        return self.registry

    def add(self, _entity: object) -> None:
        raise AssertionError("The registered demo cash register must be reused.")

    def flush(self) -> None:
        self.flush_count += 1
        if self.seeded_register.status == self.live_register.status == "open":
            raise AssertionError("uq_cash_registers_open_branch would be violated")

    def scalars(self, _statement: object) -> object:
        raise AssertionError("A preserved cash register must not be recalculated.")


def test_seed_preserves_a_closed_demo_register_when_another_register_is_open(
    monkeypatch,
) -> None:
    workspace_id = uuid4()
    branch_id = uuid4()
    membership_id = uuid4()
    platform_user_id = uuid4()
    seeded_register = SimpleNamespace(id=uuid4(), status="closed")
    live_register = SimpleNamespace(id=uuid4(), status="open")
    registry = SimpleNamespace(entity_id=seeded_register.id)
    session = _RegisterSession(registry, seeded_register, live_register)
    fixture = SimpleNamespace(
        seed_key="hq-current",
        branch_code="HQ",
        opened_by_user_seed_key="cashier",
        closed_by_user_seed_key=None,
        status="open",
        opening_cash=Decimal("5000.00"),
        closing_difference=None,
        notes="Caja demo inicial",
        opened_at=None,
        closed_at=None,
        model_dump=lambda **_kwargs: {"seedKey": "hq-current", "status": "open"},
    )
    context = SimpleNamespace(
        session=session,
        bundle=SimpleNamespace(pos=SimpleNamespace(registers=[fixture])),
        workspace_id=workspace_id,
        seed_version="v1",
        registers={},
        preserved_register_ids=set(),
    )
    actor = demo_pos_seed._Actor(
        SimpleNamespace(id=platform_user_id, display_name="Demo Cashier"),
        SimpleNamespace(id=membership_id),
    )

    monkeypatch.setattr(
        demo_pos_seed,
        "_branch",
        lambda *_args: SimpleNamespace(id=branch_id),
    )
    monkeypatch.setattr(demo_pos_seed, "_actor", lambda *_args: actor)
    monkeypatch.setattr(
        demo_pos_seed,
        "registered_entity",
        lambda *_args, **_kwargs: seeded_register,
    )

    demo_pos_seed._seed_registers(context)
    demo_pos_seed._finalize_registers(context)

    assert seeded_register.status == "closed"
    assert live_register.status == "open"
    assert context.registers[fixture.seed_key] is seeded_register
    assert context.preserved_register_ids == {seeded_register.id}
    assert session.flush_count == 2
