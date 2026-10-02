from app.services.module_catalog import display_name_for_module


def test_display_name_for_module_matches_navigation() -> None:
    assert display_name_for_module("crm", "Customer relationship management") == "CRM"
    assert display_name_for_module("pos", "Point of sale") == "Terminal POS"
    assert display_name_for_module("appointments", "Appointments") == "Agenda"
    assert display_name_for_module("unknown", "Custom") == "Custom"
