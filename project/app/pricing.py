from __future__ import annotations

from typing import List, Dict, Any
import math
import logging

from app.schemas import (
    CuttingRequest,
    OptimizationSummary,
    BoardSelection,
    PricingLine,
    PricingSummary,
    PanelBoqLine,
)
from app.config import (
    BOARD_PRICE_TABLE,
    CUTTING_PRICE_PER_BOARD,
    EDGING_PRICE_PER_METER,           # factory edging price (e.g. 75 KES/m)
    CLIENT_EDGING_PRICE_PER_METER,    # client edging price (e.g. 55 KES/m)
    TAX_RATE,                         # decimal fraction, e.g. 0.16 for 16%
    CURRENCY,
    DEFAULT_BOARD_WIDTH_MM,
    DEFAULT_BOARD_LENGTH_MM,
)

logger = logging.getLogger("panelpro")


def get_board_price_per_sheet(board: BoardSelection) -> float:
    """
    Look up a board's price per sheet from BOARD_PRICE_TABLE.

    Expected structure:
        BOARD_PRICE_TABLE[core][thickness_mm][company] -> price_per_sheet

    Falls back to 0.0 if not found.
    """
    core = board.core_type.value
    th = int(board.thickness_mm.value)
    company = board.company

    try:
        price = float(BOARD_PRICE_TABLE[core][th][company])
        logger.info(
            "Board price lookup: core=%s thickness=%s company=%s price=%.2f",
            core,
            th,
            company,
            price,
        )
        return price
    except KeyError:
        logger.warning(
            "No entry in BOARD_PRICE_TABLE for core=%s thickness=%s company=%s",
            core,
            th,
            company,
        )
        return 0.0


def _group_panels_by_board(request: CuttingRequest) -> Dict[tuple, Dict[str, Any]]:
    """
    Group panels by their effective board (panel.board override or global request.board).

    Returns:
        {
          (core, thickness, company, color_code, color_name): {
              "board": BoardSelection,
              "total_area_mm2": float,
              "total_pieces": int,
              "panels_count": int,
              "panels": [panel1, panel2, ...],
          },
          ...
        }
    """
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
                "total_pieces": 0,
                "panels_count": 0,
                "panels": [],
            }

        grp = groups[key]
        grp["total_area_mm2"] += p.total_area_mm2
        grp["total_pieces"] += p.quantity
        grp["panels_count"] += 1
        grp["panels"].append(p)

    return groups


def calculate_pricing(
    request: CuttingRequest,
    summary: OptimizationSummary,
    total_edging_m: float,
) -> PricingSummary:
    """
    Build pricing summary from optimization.

    - Factory supply:
        * Materials charged from BOARD_PRICE_TABLE.
        * If no panel overrides, all panels share the same board and
          we use summary.total_boards for board count.
        * If there are overrides, each board type is priced separately
          based on area, using DEFAULT_BOARD_WIDTH_MM/LENGTH_MM as sheet size.
        * Each panel gets a BOQ row in panel_boq with its material cost.
        * Edging uses optimizer total_edging_m at EDGING_PRICE_PER_METER.
    - Client supply:
        * No material charges (material_cost = 0).
        * Panels still appear in panel_boq with material_amount = 0.
        * Edging uses request.supply.client_edging_meters (if provided),
          otherwise falls back to optimizer total_edging_m.
        * Charged at CLIENT_EDGING_PRICE_PER_METER.
    """
    material_cost = 0.0
    lines: List[PricingLine] = []
    panel_boq: List[PanelBoqLine] = []

    board_groups = _group_panels_by_board(request)

    # ---------- MATERIALS ----------
    if not request.supply.client_supply:
        supplied_by = "Factory"

        has_overrides = any(p.board is not None for p in request.panels)
        default_sheet_area_mm2 = DEFAULT_BOARD_WIDTH_MM * DEFAULT_BOARD_LENGTH_MM

        if not has_overrides:
            # Single board type (no overrides): use optimizer's total_boards.
            board = request.board
            unit_price = get_board_price_per_sheet(board)
            boards_required = summary.total_boards
            material_cost = boards_required * unit_price

            desc = (
                f"{board.core_type.value.upper()} "
                f"{int(board.thickness_mm.value)}mm "
                f"{board.company} ({board.color_name})"
            )

            lines.append(
                PricingLine(
                    item="Materials",
                    description=desc,
                    quantity=boards_required,
                    unit="sheet",
                    unit_price=unit_price,
                    amount=material_cost,
                )
            )

            total_area_mm2 = sum(p.total_area_mm2 for p in request.panels)
            price_per_mm2 = (
                material_cost / total_area_mm2 if total_area_mm2 > 0 else 0.0
            )

            for p in request.panels:
                panel_amount = p.total_area_mm2 * price_per_mm2
                panel_boq.append(
                    PanelBoqLine(
                        label=p.label,
                        core_type=board.core_type.value,
                        thickness_mm=int(board.thickness_mm.value),
                        company=board.company,
                        colour=board.color_name,
                        quantity=p.quantity,
                        area_m2=p.total_area_mm2 / 1_000_000.0,
                        material_amount=panel_amount,
                    )
                )

        else:
            # Multiple board types: price each group separately by area.
            for grp in board_groups.values():
                board = grp["board"]
                total_area_mm2 = grp["total_area_mm2"]

                if default_sheet_area_mm2 > 0:
                    sheets = max(
                        1, math.ceil(total_area_mm2 / default_sheet_area_mm2)
                    )
                else:
                    sheets = 0

                unit_price = get_board_price_per_sheet(board)
                amount = sheets * unit_price
                material_cost += amount

                desc = (
                    f"{board.core_type.value.upper()} "
                    f"{int(board.thickness_mm.value)}mm "
                    f"{board.company} ({board.color_name})"
                )

                lines.append(
                    PricingLine(
                        item="Materials",
                        description=desc,
                        quantity=sheets,
                        unit="sheet",
                        unit_price=unit_price,
                        amount=amount,
                    )
                )

                price_per_mm2 = amount / total_area_mm2 if total_area_mm2 > 0 else 0.0

                for p in grp["panels"]:
                    panel_amount = p.total_area_mm2 * price_per_mm2
                    panel_boq.append(
                        PanelBoqLine(
                            label=p.label,
                            core_type=board.core_type.value,
                            thickness_mm=int(board.thickness_mm.value),
                            company=board.company,
                            colour=board.color_name,
                            quantity=p.quantity,
                            area_m2=p.total_area_mm2 / 1_000_000.0,
                            material_amount=panel_amount,
                        )
                    )

    else:
        # Client supplies boards: no material cost, but we still show
        # every panel in panel_boq with board config.
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

    # ---------- SERVICES: CUTTING ----------
    cutting_cost = summary.total_boards * CUTTING_PRICE_PER_BOARD
    lines.append(
        PricingLine(
            item="Cutting",
            description="Board cutting service",
            quantity=summary.total_boards,
            unit="board",
            unit_price=CUTTING_PRICE_PER_BOARD,
            amount=cutting_cost,
        )
    )

    # ---------- SERVICES: EDGING ----------
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
            amount=edgeging_cost if False else edging_cost,  # will evaluate edging_cost only
        )
    )

    # ---------- TOTALS & TAX ----------
    subtotal = material_cost + cutting_cost + edging_cost
    tax_amount = subtotal * TAX_RATE
    total = subtotal + tax_amount

    logger.info(
        "Pricing: subtotal=%.2f %s, tax=%.2f, total=%.2f",
        subtotal,
        CURRENCY,
        tax_amount,
        total,
    )

    return PricingSummary(
        lines=lines,
        subtotal=subtotal,
        tax_name="VAT",
        tax_rate=TAX_RATE * 100.0,  # displayed as percent
        tax_amount=tax_amount,
        total=total,
        currency=CURRENCY,
        supplied_by=supplied_by,
        panel_boq=panel_boq,
    )