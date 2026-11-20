"""Load Cheko export JSON (single array or multiple arrays in one file)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_TRAILING_COMMA = re.compile(r",(\s*[\]}])")


def _strip_trailing_commas(text: str) -> str:
    previous = None
    current = text
    while previous != current:
        previous = current
        current = _TRAILING_COMMA.sub(r"\1", current)
    return current


def load_json_arrays(path: Path) -> list[dict[str, Any]]:
    text = _strip_trailing_commas(path.read_text(encoding="utf-8")).strip()
    if not text:
        return []
    decoder = json.JSONDecoder()
    rows: list[dict[str, Any]] = []
    index = 0
    length = len(text)
    while index < length:
        while index < length and text[index].isspace():
            index += 1
        if index >= length:
            break
        value, end = decoder.raw_decode(text, index)
        index = end
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    rows.append(item)
        elif isinstance(value, dict):
            rows.append(value)
    return rows
