from __future__ import annotations

from typing import Any, Dict, List
import logging
import math

from app.schemas import (
    BoardSelection,
    CuttingRequest,
    OptimizationSummary,
    PanelBoqLine,
    PricingLine,
    PricingSummary,
)
from app.config import (
    BOARD_PRICE_TABLE,
    CLIENT_EDGING_PRICE_PER_METER,
    CUTTING_PRICE_PER_BOARD,
    CURRENCY,
    DEFAULT_BOARD_LENGTH_MM,
    DEFAULT_BOARD_WIDTH_MM,
    EDGING_PRICE_PER_METER,
    TAX_RATE,
)

logger = logging.getLogger("panelpro")


def get_board_price_per_sheet(board: BoardSelection) -> float:
    core = board.core_type.value
    th = int(board.thickness_mm.value)
    company = board.company

    try:
        return float(BOARD_PRICE_TABLE[core][th][company])
    except KeyError:
        logger.warning(
            "No entry in BOARD_PRICE_TABLE for core=%s thickness=%s company=%s",
            core,
            th,
            company,
        )
        return 0.0


def _group_panels_by_board(request: CuttingRequest) -> Dict[tuple, Dict[str, Any]]:
    groups: Dict[tuple, Dict[str, Any]] = {}

    for p in request.panels:
        panel_board = p.board or request.board
        key = (
            panel_board.core_type.value,
            int(panel_board.thickness_mm.value),
            panel_board.company,
            panel_board.color_code,
            panel_board.color_name,
        )

        if key not in groups:
            groups[key] = {
                "board": panel_board,
                "total_area_mm2": 0.0,
                "panels": [],
            }

        groups[key]["total_area_mm2"] += p.total_area_mm2
        groups[key]["panels"].append(p)

    return groups


def calculate_pricing(
    request: CuttingRequest,
    summary: OptimizationSummary,
    total_edging_m: float,
) -> PricingSummary:
    material_cost = 0.0
    lines: List[PricingLine] = []
    panel_boq: List[PanelBoqLine] = []

    board_groups = _group_panels_by_board(request)
    has_overrides = any(p.board is not None for p in request.panels)
    default_sheet_area_mm2 = DEFAULT_BOARD_WIDTH_MM * DEFAULT_BOARD_LENGTH_MM
    optimizer_boards_used = int(summary.total_boards)

    if not request.supply.client_supply:
        supplied_by = "Factory"

        if not has_overrides or request.strict_production_mode:
            board = request.board
            unit_price = get_board_price_per_sheet(board)
            boards_required = optimizer_boards_used
            material_cost = boards_required * unit_price

            lines.append(
                PricingLine(
                    item="Materials",
                    description=(
                        f"{board.core_type.value.upper()} "
                        f"{int(board.thickness_mm.value)}mm "
                        f"{board.company} ({board.color_name})"
                    ),
                    quantity=boards_required,
                    unit="sheet",
                    unit_price=unit_price,
                    amount=material_cost,
                )
            )

            total_area_mm2 = sum(p.total_area_mm2 for p in request.panels)
            price_per_mm2 = material_cost / total_area_mm2 if total_area_mm2 > 0 else 0.0

            for p in request.panels:
                panel_boq.append(
                    PanelBoqLine(
                        label=p.label,
                        core_type=board.core_type.value,
                        thickness_mm=int(board.thickness_mm.value),
                        company=board.company,
                        colour=board.color_name,
                        quantity=p.quantity,
                        area_m2=p.total_area_mm2 / 1_000_000.0,
                        material_amount=p.total_area_mm2 * price_per_mm2,
                    )
                )
        else:
            for grp in board_groups.values():
                board = grp["board"]
                total_area_mm2_grp = grp["total_area_mm2"]

                sheets = (
                    max(1, math.ceil(total_area_mm2_grp / default_sheet_area_mm2))
                    if default_sheet_area_mm2 > 0
                    else 0
                )

                unit_price = get_board_price_per_sheet(board)
                amount = sheets * unit_price
                material_cost += amount

                lines.append(
                    PricingLine(
                        item="Materials",
                        description=(
                            f"{board.core_type.value.upper()} "
                            f"{int(board.thickness_mm.value)}mm "
                            f"{board.company} ({board.color_name})"
                        ),
                        quantity=sheets,
                        unit="sheet",
                        unit_price=unit_price,
                        amount=amount,
                    )
                )

                price_per_mm2_grp = amount / total_area_mm2_grp if total_area_mm2_grp > 0 else 0.0

                for p in grp["panels"]:
                    panel_boq.append(
                        PanelBoqLine(
                            label=p.label,
                            core_type=board.core_type.value,
                            thickness_mm=int(board.thickness_mm.value),
                            company=board.company,
                            colour=board.color_name,
                            quantity=p.quantity,
                            area_m2=p.total_area_mm2 / 1_000_000.0,
                            material_amount=p.total_area_mm2 * price_per_mm2_grp,
                        )
                    )
    else:
        supplied_by = "Client"

        for grp in board_groups.values():
            board = grp["board"]
            for p in grp["panels"]:
                panel_boq.append(
                    PanelBoqLine(
                        label=p.label,
                        core_type=board.core_type.value,
                        thickness_mm=int(board.thickness_mm.value),
                        company=board.company,
                        colour=board.color_name,
                        quantity=p.quantity,
                        area_m2=p.total_area_mm2 / 1_000_000.0,
                        material_amount=0.0,
                    )
                )

    cutting_cost = optimizer_boards_used * CUTTING_PRICE_PER_BOARD
    lines.append(
        PricingLine(
            item="Cutting",
            description="Board cutting service",
            quantity=optimizer_boards_used,
            unit="board",
            unit_price=CUTTING_PRICE_PER_BOARD,
            amount=cutting_cost,
        )
    )

    if request.supply.client_supply:
        effective_edging_m = (
            request.supply.client_edging_meters
            if request.supply.client_edging_meters is not None
            else total_edging_m
        )
        edging_rate = CLIENT_EDGING_PRICE_PER_METER
    else:
        effective_edging_m = total_edging_m
        edging_rate = EDGING_PRICE_PER_METER

    edging_cost = effective_edging_m * edging_rate
    lines.append(
        PricingLine(
            item="Edging",
            description="Edge banding service",
            quantity=effective_edging_m,
            unit="m",
            unit_price=edging_rate,
            amount=edging_cost,
        )
    )

    subtotal = material_cost + cutting_cost + edging_cost
    tax_amount = subtotal * TAX_RATE
    total = subtotal + tax_amount

    return PricingSummary(
        lines=lines,
        subtotal=subtotal,
        tax_name="VAT",
        tax_rate=TAX_RATE * 100.0,
        tax_amount=tax_amount,
        total=total,
        currency=CURRENCY,
        supplied_by=supplied_by,
        panel_boq=panel_boq,
    )
