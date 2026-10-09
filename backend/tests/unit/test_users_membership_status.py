from app.services.users import _normalize_membership_status


def test_normalize_membership_status_maps_inactive_to_suspended() -> None:
    assert _normalize_membership_status("inactive") == "suspended"
    assert _normalize_membership_status("active") == "active"
    assert _normalize_membership_status(None) is None
