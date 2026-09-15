from datetime import UTC, datetime

from app.db.models import WorkspaceSubscription


def effective_subscription_status(
    subscription: WorkspaceSubscription, *, now: datetime | None = None
) -> str:
    instant = now or datetime.now(UTC)
    if subscription.status in {"cancelled", "expired"}:
        return subscription.status
    if subscription.ends_at is not None and subscription.ends_at < instant:
        return "expired"
    if subscription.started_at > instant:
        return "scheduled"
    return subscription.status
