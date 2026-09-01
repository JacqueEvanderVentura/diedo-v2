from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

MODULES = ("pos", "agenda", "inventarios", "finanzas", "crm", "incidencias", "config")
MODULE_LABELS = {
    "pos": "POS",
    "agenda": "Agenda",
    "inventarios": "Inventarios",
    "finanzas": "Finanzas",
    "crm": "CRM",
    "incidencias": "Incidencias",
    "config": "Configuración",
}
DEFAULT_SCORING_WEIGHTS: dict[str, float] = {
    "pos": 1,
    "agenda": 1,
    "inventarios": 1,
    "finanzas": 1,
    "crm": 1,
    "incidencias": 0.8,
    "config": 0.6,
}
SERP_HOUR_LIMIT = 50
SERP_MONTH_LIMIT = 250


@dataclass(frozen=True)
class ScoringResult:
    score: int
    module_fits: dict[str, int]
    reasons: list[str]


_VERTICALS: tuple[tuple[str, tuple[str, ...], dict[str, int]], ...] = (
    (
        "salon",
        (r"sal[oó]n", r"peluquer", r"barber", r"beauty", r"belleza", r"nail", r"uñas"),
        {
            "pos": 75,
            "agenda": 95,
            "inventarios": 70,
            "finanzas": 60,
            "crm": 80,
            "incidencias": 50,
            "config": 55,
        },
    ),
    (
        "spa",
        (r"spa\b", r"masaje", r"wellness", r"est[eé]tica", r"facial"),
        {
            "pos": 70,
            "agenda": 98,
            "inventarios": 65,
            "finanzas": 55,
            "crm": 85,
            "incidencias": 45,
            "config": 50,
        },
    ),
    (
        "clinica",
        (r"cl[ií]nica", r"consultorio", r"m[eé]dico", r"dental", r"odontolog", r"hospital"),
        {
            "pos": 65,
            "agenda": 92,
            "inventarios": 75,
            "finanzas": 70,
            "crm": 88,
            "incidencias": 60,
            "config": 65,
        },
    ),
    (
        "restaurante",
        (r"restaurant", r"caf[eé]", r"comida", r"food", r"bar\b", r"bistro"),
        {
            "pos": 95,
            "agenda": 40,
            "inventarios": 90,
            "finanzas": 75,
            "crm": 55,
            "incidencias": 55,
            "config": 60,
        },
    ),
    (
        "retail",
        (r"tienda", r"retail", r"boutique", r"ferreter", r"minimarket", r"supermercado"),
        {
            "pos": 92,
            "agenda": 25,
            "inventarios": 95,
            "finanzas": 70,
            "crm": 60,
            "incidencias": 45,
            "config": 55,
        },
    ),
    (
        "carwash",
        (r"car\s*wash", r"lavado", r"autolavado", r"detailing"),
        {
            "pos": 88,
            "agenda": 70,
            "inventarios": 80,
            "finanzas": 65,
            "crm": 72,
            "incidencias": 55,
            "config": 50,
        },
    ),
    (
        "gym",
        (r"gym", r"gimnasio", r"fitness", r"crossfit", r"yoga"),
        {
            "pos": 80,
            "agenda": 85,
            "inventarios": 55,
            "finanzas": 65,
            "crm": 90,
            "incidencias": 50,
            "config": 55,
        },
    ),
)

_SIGNALS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("pos", (r"caja", r"punto de venta", r"pos\b", r"factur", r"cobro", r"venta")),
    ("agenda", (r"cita", r"agenda", r"reserv", r"turno", r"appointment", r"booking")),
    ("inventarios", (r"inventario", r"stock", r"almac[eé]n", r"producto", r"insumo")),
    ("finanzas", (r"finanz", r"contab", r"presupuesto", r"gasto", r"ingreso")),
    ("crm", (r"cliente", r"lead", r"crm", r"fideliz", r"membres")),
    ("incidencias", (r"incidencia", r"soporte", r"mantenimiento", r"ticket")),
    ("config", (r"sucursal", r"multi-?sucursal", r"franquicia", r"permiso")),
)


def _matches(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


def _clamp(value: float) -> int:
    return max(0, min(100, round(value)))


def compute_auto_score(values: dict[str, Any], weights: dict[str, float]) -> ScoringResult:
    text = " ".join(
        str(values.get(field) or "")
        for field in ("name", "company", "raw_snippet", "location", "website")
    ).strip()
    vertical = next(
        ((name, fits) for name, patterns, fits in _VERTICALS if _matches(text, patterns)),
        None,
    )
    base = (
        dict(vertical[1])
        if vertical is not None
        else {
            "pos": 45,
            "agenda": 45,
            "inventarios": 45,
            "finanzas": 40,
            "crm": 50,
            "incidencias": 35,
            "config": 35,
        }
    )
    boosts = {module: 0 for module in MODULES}
    for module, patterns in _SIGNALS:
        if _matches(text, patterns):
            boosts[module] += 12
    if re.search(r"google\.com/maps|goo\.gl/maps", text, re.IGNORECASE):
        boosts["crm"] += 5
    if re.search(r"review|rating|estrellas", text, re.IGNORECASE):
        boosts["crm"] += 8
    if re.search(r"website|sitio web|www\.", text, re.IGNORECASE):
        boosts["crm"] += 6

    reasons: list[str] = []
    if vertical is not None:
        reasons.append(f"Vertical detectada: {vertical[0]}")
    module_fits: dict[str, int] = {}
    for module in MODULES:
        module_fits[module] = _clamp(base.get(module, 30) + boosts[module])
        if boosts[module] > 0:
            reasons.append(f"Señal {module}: +{boosts[module]}")
    ranked = sorted(
        MODULES,
        key=lambda module: module_fits[module] * weights.get(module, 1),
        reverse=True,
    )
    top = ranked[:5]
    score = _clamp(sum(module_fits[module] for module in top) / len(top)) if top else 0
    if top:
        reasons.append(f"Top módulos: {', '.join(MODULE_LABELS[module] for module in top)}")
    if values.get("website"):
        reasons.append("Tiene sitio web")
    if values.get("phone"):
        reasons.append("Teléfono disponible")
    return ScoringResult(score, module_fits, reasons)
