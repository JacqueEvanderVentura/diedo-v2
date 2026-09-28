"""Per-process abuse guard for authenticated Carwash mutations.

The deployment gateway should also enforce a distributed limit when the API runs
with multiple instances. This guard keeps one process from accepting an unbounded
burst from the same workspace membership.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable
from uuid import UUID

from app.services.errors import RateLimitExceededError


class CarwashMutationRateLimiter:
    def __init__(
        self,
        limit: int,
        *,
        window_seconds: int = 60,
        clock: Callable[[], float] = time.monotonic,
        max_keys: int = 10_000,
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.clock = clock
        self.max_keys = max_keys
        self._events: dict[tuple[UUID, UUID], deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, workspace_id: UUID, membership_id: UUID) -> None:
        now = self.clock()
        cutoff = now - self.window_seconds
        key = (workspace_id, membership_id)
        with self._lock:
            events = self._events.setdefault(key, deque())
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                retry_after = max(1, int(events[0] + self.window_seconds - now) + 1)
                raise RateLimitExceededError(
                    "Demasiadas operaciones de Carwash. Intenta nuevamente en unos segundos.",
                    retry_after_seconds=retry_after,
                )
            events.append(now)

            # Opportunistic cleanup prevents inactive memberships from accumulating forever.
            if len(self._events) > self.max_keys:
                stale = [item for item, values in self._events.items() if values[-1] <= cutoff]
                for item in stale:
                    self._events.pop(item, None)
