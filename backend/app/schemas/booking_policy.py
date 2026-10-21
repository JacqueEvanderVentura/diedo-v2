from __future__ import annotations

from typing import Literal

PublicBookingLeadMinutes = Literal[5, 30, 45, 60, 90, 240, 360, 720, 1440]

PUBLIC_BOOKING_LEAD_MINUTES_CHOICES: tuple[int, ...] = (
    5,
    30,
    45,
    60,
    90,
    240,
    360,
    720,
    1440,
)

DEFAULT_PUBLIC_BOOKING_LEAD_MINUTES: PublicBookingLeadMinutes = 5
