from uuid import uuid4

import pytest
from app.config import Settings
from app.services.carwash_rate_limit import CarwashMutationRateLimiter
from app.services.errors import RateLimitExceededError


def test_carwash_mutation_limit_blocks_bursts_and_recovers_after_window() -> None:
    now = [100.0]
    limiter = CarwashMutationRateLimiter(2, window_seconds=60, clock=lambda: now[0])
    workspace_id = uuid4()
    membership_id = uuid4()

    limiter.check(workspace_id, membership_id)
    limiter.check(workspace_id, membership_id)
    with pytest.raises(RateLimitExceededError) as captured:
        limiter.check(workspace_id, membership_id)

    assert captured.value.retry_after_seconds == 61
    now[0] = 161.0
    limiter.check(workspace_id, membership_id)


def test_carwash_mutation_limit_is_isolated_by_workspace_membership() -> None:
    limiter = CarwashMutationRateLimiter(1, clock=lambda: 100.0)
    workspace_id = uuid4()

    limiter.check(workspace_id, uuid4())
    limiter.check(workspace_id, uuid4())


def test_carwash_mutation_limit_prunes_inactive_memberships() -> None:
    now = [0.0]
    limiter = CarwashMutationRateLimiter(
        2,
        window_seconds=10,
        clock=lambda: now[0],
        max_keys=1,
    )
    stale_key = (uuid4(), uuid4())
    active_key = (uuid4(), uuid4())

    limiter.check(*stale_key)
    now[0] = 11.0
    limiter.check(*active_key)

    assert stale_key not in limiter._events
    assert active_key in limiter._events


def test_carwash_rate_limit_defaults_to_deployments_and_supports_override() -> None:
    assert Settings(app_env="test", _env_file=None).carwash_rate_limit_enabled is False
    assert (
        Settings(
            app_env="production",
            jwt_secret_key="a-production-secret-with-at-least-32-characters",
            _env_file=None,
        ).carwash_rate_limit_enabled
        is True
    )
    assert (
        Settings(
            app_env="production",
            jwt_secret_key="a-production-secret-with-at-least-32-characters",
            carwash_mutation_rate_limit_enabled=False,
            _env_file=None,
        ).carwash_rate_limit_enabled
        is False
    )
