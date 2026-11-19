"""Traditional DGII credit-fiscal NCF (series B, type 01).

The prefix is ``B01``. The sequential is a digit string of 8 to 20 characters,
so a branch can follow the 8-digit series or a longer authorized range.
``00000040`` formats as ``B0100000040``; the next stored value is ``00000041``.
"""

from __future__ import annotations

import re

CREDIT_FISCAL_NCF_PREFIX = "B01"
CREDIT_FISCAL_NCF_DIGIT_MIN = 8
CREDIT_FISCAL_NCF_DIGIT_MAX = 20

_PREFIX_ERROR = "El prefijo de crédito fiscal debe ser B01."
_SEQUENCE_ERROR = "La secuencia debe tener entre 8 y 20 dígitos."
_PAIR_ERROR = "El prefijo y la próxima secuencia deben configurarse juntos."
_SEQUENCE_PATTERN = re.compile(r"\d{8,20}")


def normalize_credit_fiscal_prefix(prefix: str | None) -> str | None:
    if prefix is None:
        return None
    return prefix.strip().upper()


def normalize_credit_fiscal_sequence(sequence: object) -> str | None:
    if sequence is None:
        return None
    if isinstance(sequence, bool) or not isinstance(sequence, str | int):
        raise ValueError(_SEQUENCE_ERROR)
    text = str(sequence).strip() if isinstance(sequence, str) else str(sequence)
    if _SEQUENCE_PATTERN.fullmatch(text) is None or set(text) == {"0"}:
        raise ValueError(_SEQUENCE_ERROR)
    return text


def validate_credit_fiscal_sequence_pair(
    prefix: str | None,
    sequence: str | None,
) -> None:
    if (prefix is None) != (sequence is None):
        raise ValueError(_PAIR_ERROR)
    if prefix is None or sequence is None:
        return
    if prefix != CREDIT_FISCAL_NCF_PREFIX:
        raise ValueError(_PREFIX_ERROR)
    if (
        not isinstance(sequence, str)
        or _SEQUENCE_PATTERN.fullmatch(sequence) is None
        or set(sequence) == {"0"}
    ):
        raise ValueError(_SEQUENCE_ERROR)


def format_credit_fiscal_ncf(prefix: str, sequence: str) -> str:
    validate_credit_fiscal_sequence_pair(prefix, sequence)
    return f"{prefix}{sequence}"


def next_credit_fiscal_sequence(sequence: str) -> str:
    normalized = normalize_credit_fiscal_sequence(sequence)
    if normalized is None:
        raise ValueError(_SEQUENCE_ERROR)
    incremented = str(int(normalized) + 1).zfill(len(normalized))
    if len(incremented) != len(normalized):
        raise ValueError(_SEQUENCE_ERROR)
    return incremented


def credit_fiscal_sequence_error_parameter(message: str) -> str:
    if "secuencia" in message or "dígito" in message:
        return "fiscalCreditNcfNextSequence"
    return "fiscalCreditNcfPrefix"
