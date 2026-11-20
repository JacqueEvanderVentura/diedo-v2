from app.scripts.cheko.agenda_convert import (
    _appointment_row_to_item,
    customer_import_payload,
    customers_for_cheko_folder,
)
from app.scripts.cheko.cabinas import load_cheko_cabina_name_by_id
from app.scripts.cheko.context import FOLDER_TO_CHEKO_BRANCH


def test_customer_import_payload_strips_internal_branch_set() -> None:
    item = {
        "display_name": "Jatna Díaz",
        "cheko_branch_ids": {FOLDER_TO_CHEKO_BRANCH["charm-stgo"]},
    }
    payload = customer_import_payload(item)
    assert "cheko_branch_ids" not in payload
    assert payload["display_name"] == "Jatna Díaz"


def test_customers_for_cheko_folder_keeps_only_matching_sucursal() -> None:
    stgo_id = FOLDER_TO_CHEKO_BRANCH["charm-stgo"]
    dn_id = FOLDER_TO_CHEKO_BRANCH["charm-dn"]
    items = [
        {
            "external_id": "cheko-a",
            "display_name": "Cliente Santiago",
            "cheko_branch_ids": {stgo_id},
        },
        {
            "external_id": "cheko-b",
            "display_name": "Cliente DN",
            "cheko_branch_ids": {dn_id},
        },
        {
            "external_id": "cheko-c",
            "display_name": "Cliente dos sedes",
            "cheko_branch_ids": {stgo_id, dn_id},
        },
    ]
    stgo_only = customers_for_cheko_folder(items, "charm-stgo")
    names = {row["display_name"] for row in stgo_only}
    assert names == {"Cliente Santiago", "Cliente dos sedes"}


def test_appointment_maps_dn_cabina_five_by_cheko_id() -> None:
    cabina_id = "473f1e23-e672-5cd5-8af3-a2f793c79b50"
    assert load_cheko_cabina_name_by_id()[cabina_id] == "Cabina 5"
    row = {
        "id": "appt-dn-5",
        "sucursal_id": FOLDER_TO_CHEKO_BRANCH["charm-dn"],
        "cabina_id": cabina_id,
        "fecha": "2026-11-13",
        "hora": "08:00:00",
        "duration": "00:30:00",
        "client_name": "Cliente",
        "service_name": "Cita",
        "status": "confirmada",
    }
    item = _appointment_row_to_item(row, require_charm_branch=False)
    assert item is not None
    assert item["resource_name"] == "Cabina 5"


def test_appointment_maps_sde_cabina_one() -> None:
    cabina_id = "877cfe35-b836-5b4a-8649-b0738f1f1b4b"
    row = {
        "id": "appt-sde-1",
        "sucursal_id": FOLDER_TO_CHEKO_BRANCH["charm-sde"],
        "cabina_id": cabina_id,
        "fecha": "2026-10-19",
        "hora": "11:30:00",
        "duration": "00:30:00",
        "client_name": "Cliente",
        "service_name": "Cita",
        "status": "confirmada",
    }
    item = _appointment_row_to_item(row, require_charm_branch=False)
    assert item is not None
    assert item["resource_name"] == "Cabina 1"


def test_appointment_strips_sgto_cabina_one_name() -> None:
    cabina_id = "2cdf7eac-e66b-5ed4-9af6-8f1c70f49d12"
    assert load_cheko_cabina_name_by_id()[cabina_id] == "Cabina 1"
    row = {
        "id": "appt-stgo-1",
        "sucursal_id": FOLDER_TO_CHEKO_BRANCH["charm-stgo"],
        "cabina_id": cabina_id,
        "fecha": "2026-11-20",
        "hora": "09:00:00",
        "duration": "00:30:00",
        "client_name": "Cliente",
        "service_name": "Cita",
        "status": "confirmada",
    }
    item = _appointment_row_to_item(row, require_charm_branch=False)
    assert item is not None
    assert item["resource_name"] == "Cabina 1"


def test_appointment_unknown_cabina_id_omits_resource_name() -> None:
    row = {
        "id": "appt-unknown",
        "sucursal_id": FOLDER_TO_CHEKO_BRANCH["charm-dn"],
        "cabina_id": "00000000-0000-0000-0000-000000000000",
        "fecha": "2026-11-20",
        "hora": "09:00:00",
        "duration": "00:30:00",
        "client_name": "Cliente",
        "service_name": "Cita",
        "status": "confirmada",
    }
    item = _appointment_row_to_item(row, require_charm_branch=False)
    assert item is not None
    assert "resource_name" not in item
