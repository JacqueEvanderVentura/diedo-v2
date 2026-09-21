from datetime import date, time

from app.services.demo_manifest import load_demo_bundle
from app.services.demo_seed import (
    AGENDA_VOLUME_DAYS_AFTER,
    AGENDA_VOLUME_DAYS_BEFORE,
    AGENDA_VOLUME_PER_BRANCH_PER_DAY,
    build_agenda_volume_appointments,
)


def test_agenda_volume_fills_sixty_confirmed_slots_per_branch_today() -> None:
    bundle = load_demo_bundle()
    today = date(2026, 9, 21)
    fixtures = build_agenda_volume_appointments(bundle, today=today)
    day_span = AGENDA_VOLUME_DAYS_BEFORE + AGENDA_VOLUME_DAYS_AFTER + 1
    branch_count = len(bundle.foundation.branches)

    assert len(fixtures) == day_span * branch_count * AGENDA_VOLUME_PER_BRANCH_PER_DAY

    today_downtown = [
        item for item in fixtures if item.date == today and item.branch_code == "DOWNTOWN"
    ]
    assert len(today_downtown) == AGENDA_VOLUME_PER_BRANCH_PER_DAY
    assert all(item.status == "confirmed" for item in today_downtown)
    assert len({(item.resource_code, item.time) for item in today_downtown}) == len(today_downtown)

    yesterday = [
        item for item in fixtures if item.date == date(2026, 9, 20) and item.branch_code == "HQ"
    ]
    assert len(yesterday) == AGENDA_VOLUME_PER_BRANCH_PER_DAY
    assert all(item.status == "fulfilled" for item in yesterday)
    assert yesterday[0].time == time(8, 0)
    assert yesterday[-1].time == time(13, 30)
