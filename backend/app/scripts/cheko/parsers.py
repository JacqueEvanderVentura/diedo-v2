"""Parse Cheko finance markdown reports."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

TRANSACTION_LINE = re.compile(r"^\|(\d{2}/\d{2}/\d{4})\|([^|]+)\|([^|]+)\|\$?([\d,]+\.\d{2})\|\s*$")


@dataclass(frozen=True)
class FinanceTransactionRow:
    row_date: date
    description: str
    category: str
    amount: Decimal


def _clean_category(raw: str) -> str:
    text = raw.replace("<br>", " ").replace("<br/>", " ")
    return " ".join(text.split())


def _parse_amount(raw: str) -> Decimal:
    return Decimal(raw.replace(",", "").strip())


def _parse_date(raw: str) -> date:
    day, month, year = raw.strip().split("/")
    return date(int(year), int(month), int(day))


def parse_finance_report_markdown(path: Path) -> list[FinanceTransactionRow]:
    text = path.read_text(encoding="utf-8")
    rows: list[FinanceTransactionRow] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        if "Fecha" in stripped and "Monto" in stripped:
            continue
        if "TOTAL" in stripped.upper():
            continue
        match = TRANSACTION_LINE.match(stripped)
        if match is None:
            continue
        desc = match.group(2).strip()
        category = _clean_category(match.group(3))
        if not desc or not category:
            continue
        rows.append(
            FinanceTransactionRow(
                row_date=_parse_date(match.group(1)),
                description=desc,
                category=category,
                amount=_parse_amount(match.group(4)),
            )
        )
    return rows


def find_finance_report(root: Path, pattern: str) -> Path | None:
    for child in sorted(root.iterdir()):
        if child.is_file() and pattern in child.name and child.suffix.lower() == ".md":
            return child
    return None
