import pytest
from app.schemas.administration import UpdateBranchRequest
from app.services.administration import AdministrationService
from app.services.errors import InvalidOperationError
from app.services.fiscal_receipts import (
    assign_credit_fiscal_ncf,
    format_credit_fiscal_ncf,
    next_credit_fiscal_sequence,
    validate_credit_fiscal_sequence_pair,
)
from pydantic import ValidationError


def test_credit_fiscal_ncf_formats_sequence_40_and_the_following_numbers() -> None:
    assert format_credit_fiscal_ncf("B01", "00000040") == "B0100000040"
    assert next_credit_fiscal_sequence("00000040") == "00000041"
    assert format_credit_fiscal_ncf("B01", "00000041") == "B0100000041"
    assert format_credit_fiscal_ncf("B01", "0000000040") == "B010000000040"
    assert len(format_credit_fiscal_ncf("B01", "1" * 20)) == 23
    ncf, following = assign_credit_fiscal_ncf("B01", "00000040")
    assert ncf == "B0100000040"
    assert following == "00000041"
    with pytest.raises(ValueError, match="datos fiscales"):
        assign_credit_fiscal_ncf(None, None)
    with pytest.raises(ValueError, match="agotó"):
        next_credit_fiscal_sequence("9" * 20)


def test_update_branch_accepts_credit_fiscal_sequence_and_normalizes_prefix() -> None:
    payload = UpdateBranchRequest.model_validate(
        {
            "version": 3,
            "fiscalCreditNcfPrefix": " b01 ",
            "fiscalCreditNcfNextSequence": "00000040",
        }
    )

    assert payload.fiscal_credit_ncf_prefix == "B01"
    assert payload.fiscal_credit_ncf_next_sequence == "00000040"
    assert (
        format_credit_fiscal_ncf(
            payload.fiscal_credit_ncf_prefix or "",
            payload.fiscal_credit_ncf_next_sequence or "",
        )
        == "B0100000040"
    )


def test_update_branch_accepts_clearing_both_sequence_fields() -> None:
    payload = UpdateBranchRequest.model_validate(
        {
            "version": 1,
            "fiscalCreditNcfPrefix": None,
            "fiscalCreditNcfNextSequence": None,
        }
    )

    assert payload.fiscal_credit_ncf_prefix is None
    assert payload.fiscal_credit_ncf_next_sequence is None


def test_update_branch_ignores_sequence_when_the_fields_are_omitted() -> None:
    payload = UpdateBranchRequest.model_validate({"version": 1, "name": "Norte"})

    assert "fiscal_credit_ncf_prefix" not in payload.model_fields_set
    assert "fiscal_credit_ncf_next_sequence" not in payload.model_fields_set


@pytest.mark.parametrize(
    "body",
    [
        {"version": 1, "fiscalCreditNcfPrefix": "B02", "fiscalCreditNcfNextSequence": "00000040"},
        {"version": 1, "fiscalCreditNcfPrefix": "B01", "fiscalCreditNcfNextSequence": "40"},
        {"version": 1, "fiscalCreditNcfPrefix": "B01", "fiscalCreditNcfNextSequence": "0000000"},
        {"version": 1, "fiscalCreditNcfPrefix": "B01", "fiscalCreditNcfNextSequence": "1" * 21},
        {"version": 1, "fiscalCreditNcfPrefix": "B01", "fiscalCreditNcfNextSequence": "00000000"},
        {"version": 1, "fiscalCreditNcfPrefix": "B01"},
        {"version": 1, "fiscalCreditNcfNextSequence": 40},
    ],
)
def test_update_branch_rejects_invalid_credit_fiscal_sequence(body: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        UpdateBranchRequest.model_validate(body)


def test_update_branch_rejects_a_prefix_without_its_sequence_value() -> None:
    with pytest.raises(ValidationError):
        UpdateBranchRequest.model_validate(
            {
                "version": 1,
                "fiscalCreditNcfPrefix": "B01",
                "fiscalCreditNcfNextSequence": None,
            }
        )


def test_sequence_pair_rejects_type_and_range_edges() -> None:
    with pytest.raises(ValueError, match="juntos"):
        validate_credit_fiscal_sequence_pair("B01", None)
    with pytest.raises(ValueError, match="8 y 20"):
        validate_credit_fiscal_sequence_pair("B01", "40")
    with pytest.raises(ValueError, match="8 y 20"):
        validate_credit_fiscal_sequence_pair("B01", "0000000")
    with pytest.raises(ValueError, match="8 y 20"):
        validate_credit_fiscal_sequence_pair("B01", "1" * 21)


def test_apply_fiscal_credit_sequence_reports_each_invalid_branch() -> None:
    with pytest.raises(InvalidOperationError, match="juntos") as only_prefix:
        AdministrationService._apply_fiscal_credit_sequence({"fiscal_credit_ncf_prefix": "B01"})
    assert only_prefix.value.parameter == "fiscalCreditNcfPrefix"

    with pytest.raises(InvalidOperationError, match="B01") as bad_prefix_type:
        AdministrationService._apply_fiscal_credit_sequence(
            {
                "fiscal_credit_ncf_prefix": 1,
                "fiscal_credit_ncf_next_sequence": "00000040",
            }
        )
    assert bad_prefix_type.value.parameter == "fiscalCreditNcfPrefix"

    with pytest.raises(InvalidOperationError, match="secuencia") as bad_sequence_type:
        AdministrationService._apply_fiscal_credit_sequence(
            {
                "fiscal_credit_ncf_prefix": "B01",
                "fiscal_credit_ncf_next_sequence": "40",
            }
        )
    assert bad_sequence_type.value.parameter == "fiscalCreditNcfNextSequence"

    with pytest.raises(InvalidOperationError, match="B01") as bad_prefix:
        AdministrationService._apply_fiscal_credit_sequence(
            {
                "fiscal_credit_ncf_prefix": "B02",
                "fiscal_credit_ncf_next_sequence": "00000040",
            }
        )
    assert bad_prefix.value.parameter == "fiscalCreditNcfPrefix"

    with pytest.raises(InvalidOperationError, match="8 y 20") as low_sequence:
        AdministrationService._apply_fiscal_credit_sequence(
            {
                "fiscal_credit_ncf_prefix": "B01",
                "fiscal_credit_ncf_next_sequence": "40",
            }
        )
    assert low_sequence.value.parameter == "fiscalCreditNcfNextSequence"

    changes: dict[str, object] = {
        "fiscal_credit_ncf_prefix": " b01 ",
        "fiscal_credit_ncf_next_sequence": "00000040",
    }
    AdministrationService._apply_fiscal_credit_sequence(changes)
    assert changes["fiscal_credit_ncf_prefix"] == "B01"
    assert changes["fiscal_credit_ncf_next_sequence"] == "00000040"

    untouched = {"name": "Norte"}
    AdministrationService._apply_fiscal_credit_sequence(untouched)
    assert untouched == {"name": "Norte"}

    cleared: dict[str, object] = {
        "fiscal_credit_ncf_prefix": None,
        "fiscal_credit_ncf_next_sequence": None,
    }
    AdministrationService._apply_fiscal_credit_sequence(cleared)
    assert cleared["fiscal_credit_ncf_prefix"] is None
    assert cleared["fiscal_credit_ncf_next_sequence"] is None

    with pytest.raises(InvalidOperationError, match="secuencia"):
        AdministrationService._apply_fiscal_credit_sequence(
            {
                "fiscal_credit_ncf_prefix": "B01",
                "fiscal_credit_ncf_next_sequence": True,
            }
        )
