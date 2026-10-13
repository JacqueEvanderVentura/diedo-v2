from app.db.models.master_data import Customer
from app.services.customer_import_merge import (
    build_customer_import_update_changes,
    display_name_is_placeholder,
)


def test_display_name_is_placeholder() -> None:
    assert display_name_is_placeholder("Cliente sin nombre", phone=None, normalized_phone=None)
    assert display_name_is_placeholder(
        "Cliente 99",
        phone=None,
        normalized_phone=None,
        external_id="99",
    )
    assert not display_name_is_placeholder("Cliente estable", phone=None, normalized_phone=None)
    assert not display_name_is_placeholder("Ana López", phone=None, normalized_phone=None)


def test_build_customer_import_update_changes_fills_placeholder_name() -> None:
    customer = Customer(
        customer_type="person",
        display_name="Cliente sin nombre",
        normalized_name="cliente sin nombre",
        phone="8095550001",
        normalized_phone="8095550001",
        status="active",
    )
    changes = build_customer_import_update_changes(
        customer,
        {
            "display_name": "Ana López",
            "first_name": "Ana",
            "last_name": "López",
            "phone": "8095550001",
        },
    )
    assert changes["display_name"] == "Ana López"
    assert changes["first_name"] == "Ana"


def test_build_customer_import_update_changes_empty_when_no_new_data() -> None:
    customer = Customer(
        customer_type="person",
        display_name="Ana López",
        normalized_name="ana lópez",
        first_name="Ana",
        last_name="López",
        phone="8095550001",
        normalized_phone="8095550001",
        status="active",
    )
    changes = build_customer_import_update_changes(
        customer,
        {
            "display_name": "Ana López",
            "first_name": "Ana",
            "last_name": "López",
            "phone": "8095550001",
        },
    )
    assert changes == {}


def test_build_customer_import_update_changes_skip_stable_cliente_prefix_name() -> None:
    customer = Customer(
        customer_type="person",
        display_name="Cliente estable",
        normalized_name="cliente estable",
        phone="829f3e2d1",
        normalized_phone="829321",
        acquisition_source="otros",
        status="active",
    )
    changes = build_customer_import_update_changes(
        customer,
        {
            "external_id": "dup-1",
            "display_name": "Cliente estable",
            "phone": "829f3e2d1",
            "acquisition_source": "otros",
            "customer_type": "person",
        },
    )
    assert changes == {}
