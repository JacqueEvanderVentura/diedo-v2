from types import SimpleNamespace

from app.services.public_portal import _portal_tender_visible


def test_portal_tender_visible_immediate_settled() -> None:
    line = SimpleNamespace(
        settlement_policy="immediate",
        status="settled",
    )
    assert _portal_tender_visible(line) is True


def test_portal_tender_visible_pending_confirmation_awaiting() -> None:
    line = SimpleNamespace(
        settlement_policy="pending_confirmation",
        status="awaiting_approval",
    )
    assert _portal_tender_visible(line) is True


def test_portal_tender_visible_receivable_credit_hidden() -> None:
    line = SimpleNamespace(
        settlement_policy="receivable",
        status="settled",
    )
    assert _portal_tender_visible(line) is False


def test_portal_tender_visible_immediate_awaiting_hidden() -> None:
    line = SimpleNamespace(
        settlement_policy="immediate",
        status="awaiting_approval",
    )
    assert _portal_tender_visible(line) is False
