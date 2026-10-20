from uuid import uuid4

from app.db.models.master_data import Customer
from app.services.customer_import_merge import (
    build_customer_import_update_changes,
    customer_has_placeholder_name,
    display_name_is_placeholder,
    format_customer_import_update_summary,
    meaningful_customer_import_changes,
    parse_import_customer_id,
)


def test_parse_import_customer_id_accepts_uuid_and_ignores_name() -> None:
    customer_id = uuid4()
    assert parse_import_customer_id({"external_id": str(customer_id)}) == customer_id
    assert parse_import_customer_id({"external_id": "charm-not-a-uuid"}) is None
    assert parse_import_customer_id({"display_name": "Ambar Domínguez"}) is None


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


def test_format_customer_import_update_summary_shows_field_changes() -> None:
    customer = Customer(
        customer_type="person",
        display_name="Cliente sin nombre",
        normalized_name="cliente sin nombre",
        phone="+18297789540",
        normalized_phone="+18297789540",
        email=None,
        status="active",
    )
    changes = build_customer_import_update_changes(
        customer,
        {
            "display_name": "Yira Santana",
            "first_name": "Yira",
            "last_name": "Santana",
            "phone": "+18297789540",
            "email": "yira@example.com",
        },
    )
    summary = format_customer_import_update_summary(customer, changes)
    assert "Cliente sin nombre" in summary
    assert "Yira Santana" in summary
    assert "Correo" in summary


def test_placeholder_incoming_name_does_not_overwrite_real_name() -> None:
    customer = Customer(
        customer_type="person",
        display_name="Ambar Domínguez",
        normalized_name="ambar domínguez",
        phone="+18299809976",
        normalized_phone="+18299809976",
        status="active",
    )
    changes = build_customer_import_update_changes(
        customer,
        {
            "display_name": "Cliente sin nombre",
            "phone": "+18299809976",
            "email": "Ambardomingueznunez@outlook.com",
        },
    )
    assert "display_name" not in changes
    assert changes["email"] == "Ambardomingueznunez@outlook.com"


def test_acquisition_source_only_is_not_a_meaningful_update() -> None:
    customer = Customer(
        customer_type="person",
        display_name="Ambar Domínguez",
        normalized_name="ambar domínguez",
        phone="+18299809976",
        normalized_phone="+18299809976",
        email="Ambardomingueznunez@outlook.com",
        status="active",
    )
    changes = build_customer_import_update_changes(
        customer,
        {
            "display_name": "Ambar Domínguez",
            "phone": "+18299809976",
            "email": "Ambardomingueznunez@outlook.com",
            "acquisition_source": "otros",
        },
    )
    assert meaningful_customer_import_changes(changes) == {}


def test_placeholder_customer_is_detected() -> None:
    customer = Customer(
        customer_type="person",
        display_name="Cliente sin nombre",
        normalized_name="cliente sin nombre",
        email="Ambardomingueznunez@outlook.com",
        status="active",
    )
    assert customer_has_placeholder_name(customer, {})
