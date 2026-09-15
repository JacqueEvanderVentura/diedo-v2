from datetime import UTC, datetime, timedelta
from unittest.mock import Mock
from uuid import uuid7

import pytest
from app.db.models import WorkspaceSubscription
from app.repositories.modules import ModuleAccessRecord
from app.services.modules import ModuleAccessService
from app.services.subscription_access import effective_subscription_status

NOW = datetime(2026, 9, 14, 12, tzinfo=UTC)


@pytest.mark.parametrize(
    ("status", "start_offset", "end_offset", "expected"),
    [
        ("active", -1, None, "active"),
        ("trial", -1, 1, "trial"),
        ("active", 0, 0, "active"),
        ("trial", -2, -1, "expired"),
        ("active", 1, None, "scheduled"),
        ("cancelled", -1, None, "cancelled"),
        ("expired", -1, None, "expired"),
    ],
)
def test_subscription_boundaries(status, start_offset, end_offset, expected):
    subscription = WorkspaceSubscription(
        status=status,
        started_at=NOW + timedelta(seconds=start_offset),
        ends_at=None if end_offset is None else NOW + timedelta(seconds=end_offset),
    )
    assert effective_subscription_status(subscription, now=NOW) == expected


@pytest.mark.parametrize("subscribed", [False, True])
def test_expiry_preserves_configured_modules_and_legacy_access(subscribed):
    service = object.__new__(ModuleAccessService)
    repository = Mock()
    service._repository = repository
    repository.customer_subscription.return_value = (
        WorkspaceSubscription(status="active", started_at=NOW, ends_at=NOW) if subscribed else None
    )
    repository.list_access_records.return_value = [
        ModuleAccessRecord(code, "available", (), "enabled", NOW, None)
        for code in ("foundation", "iam", "sales")
    ]
    workspace_id = uuid7()
    assert service.enabled_modules(workspace_id, now=NOW) == {"foundation", "iam", "sales"}
    assert service.enabled_modules(workspace_id, now=NOW + timedelta(microseconds=1)) == (
        {"foundation", "iam"} if subscribed else {"foundation", "iam", "sales"}
    )
    assert all(
        record.entitlement_status == "enabled"
        for record in repository.list_access_records.return_value
    )
