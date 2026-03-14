from __future__ import annotations

from typing import Dict, List
import os

CURRENCY = "KES"
TAX_RATE = 0.16

CUTTING_PRICE_PER_BOARD = 350.0
EDGING_PRICE_PER_METER = 75.0
CLIENT_EDGING_PRICE_PER_METER = 55.0

DEFAULT_BOARD_WIDTH_MM = 1220
DEFAULT_BOARD_LENGTH_MM = 2440

BOARD_PRICE_TABLE: Dict[str, Dict[int, Dict[str, float]]] = {
    "chipboard": {
        12: {
            "PG Bison Kenya": 2400.0,
            "Complywood": 2150.0,
        },
        18: {
            "PG Bison Kenya": 2950.0,
            "Complywood": 2700.0,
        },
    },
    "mdf": {
        12: {
            "Timsales MDF": 2450.0,
            "Raiply MDF": 2350.0,
        },
        18: {
            "Timsales MDF": 3200.0,
            "Raiply MDF": 3100.0,
        },
    },
    "plywood": {
        3: {
            "Complywood": 900.0,
            "Timsales": 850.0,
        },
        6: {
            "Complywood": 1450.0,
            "Timsales": 1350.0,
        },
        9: {
            "Complywood": 1850.0,
            "Timsales": 1750.0,
        },
        12: {
            "Complywood": 2350.0,
            "Timsales": 2250.0,
        },
        18: {
            "Complywood": 3250.0,
            "Timsales": 3150.0,
        },
    },
    "waterproof": {
        12: {
            "Raiply Marine": 4200.0,
            "Zhongzhe Marine": 4000.0,
        },
        18: {
            "Raiply Marine": 5600.0,
            "Zhongzhe Marine": 5400.0,
        },
    },
}

BOARD_COLORS: Dict[str, List[dict]] = {
    "PG Bison Kenya": [
        {"code": "PB-WH-SAT", "name": "White Satin", "hex": "#ffffff"},
        {"code": "PB-GR-MAT", "name": "Grey Matt", "hex": "#9ca3af"},
        {"code": "PB-OK-FIN", "name": "Natural Oak", "hex": "#d4b48c"},
        {"code": "PB-WN-DRK", "name": "Dark Walnut", "hex": "#4b3b30"},
        {"code": "PB-BK-MAT", "name": "Black Matt", "hex": "#111827"},
    ],
    "Complywood": [
        {"code": "CP-WH-101", "name": "White", "hex": "#ffffff"},
        {"code": "CP-IV-102", "name": "Ivory", "hex": "#fdf6e3"},
        {"code": "CP-GR-201", "name": "Light Grey", "hex": "#d1d5db"},
        {"code": "CP-OK-301", "name": "Oak", "hex": "#d6b58d"},
        {"code": "CP-MP-302", "name": "Maple", "hex": "#fbbf77"},
        {"code": "CP-WN-401", "name": "Walnut Dark", "hex": "#4b3b30"},
    ],
    "Timsales": [
        {"code": "TS-PL-RAW", "name": "Raw Plywood", "hex": "#f4e3c3"},
    ],
    "Timsales MDF": [
        {"code": "TSM-RAW", "name": "Raw MDF", "hex": "#d1b899"},
        {"code": "TSM-WH", "name": "White Painted", "hex": "#ffffff"},
    ],
    "Raiply MDF": [
        {"code": "RM-RAW", "name": "Raw MDF", "hex": "#cbb097"},
        {"code": "RM-WH", "name": "White Primer", "hex": "#f9fafb"},
    ],
    "Raiply Marine": [
        {"code": "RM-MR-RAW", "name": "Raw Marine Ply", "hex": "#f2dfc3"},
        {"code": "RM-MR-BRN", "name": "Brown Film Face", "hex": "#5b4632"},
    ],
    "Zhongzhe Marine": [
        {"code": "ZZ-RAW", "name": "Raw Marine Board", "hex": "#f5e0c2"},
        {"code": "ZZ-GR", "name": "Grey Film Face", "hex": "#6b7280"},
    ],
}

BOARD_CATALOG: Dict[str, dict] = {}

for core, thickness_map in BOARD_PRICE_TABLE.items():
    thicknesses = sorted(list(thickness_map.keys()))
    companies = sorted(
        {
            company
            for th_data in thickness_map.values()
            for company in th_data.keys()
        }
    )
    BOARD_CATALOG[core] = {
        "thicknesses": thicknesses,
        "companies": companies,
    }

MPESA_CONSUMER_KEY = os.getenv("MPESA_CONSUMER_KEY", "")
MPESA_CONSUMER_SECRET = os.getenv("MPESA_CONSUMER_SECRET", "")
MPESA_PASSKEY = os.getenv("MPESA_PASSKEY", "")
MPESA_SHORTCODE = os.getenv("MPESA_SHORTCODE", "174379")
MPESA_ENV = os.getenv("MPESA_ENV", "sandbox")
MPESA_CALLBACK_URL = os.getenv(
    "MPESA_CALLBACK_URL",
    "https://example.com/api/mpesa/callback",
)