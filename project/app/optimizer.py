# app/optimizer.py
from __future__ import annotations

from typing import List, Tuple

from .schemas import (
    CuttingRequest,
    BoardLayout,
    PlacedPanel,
    OptimizationSummary,
    EdgingSummary,
    EdgingDetail,
)
from .config import DEFAULT_BOARD_WIDTH_MM, DEFAULT_BOARD_LENGTH_MM


def run_optimization(
    request: CuttingRequest,
) -> Tuple[List[BoardLayout], OptimizationSummary, EdgingSummary]:
    """
    Very simple greedy layout:
    - Place panels left‑to‑right in rows.
    - When no space horizontally, start a new row.
    - When no vertical space, start a new board.
    """

    board_width = DEFAULT_BOARD_WIDTH_MM
    board_length = DEFAULT_BOARD_LENGTH_MM
    board_area = board_width * board_length

    # Expand panels per quantity
    panel_instances = []
    for idx, p in enumerate(request.panels):
        for _ in range(p.quantity):
            panel_instances.append((idx, p))

    boards: List[BoardLayout] = []
    current_panels: List[PlacedPanel] = []
    used_area = 0.0
    board_number = 1

    x = 0.0
    y = 0.0
    row_height = 0.0

    def flush_board(board_num: int, placed: List[PlacedPanel], used: float) -> None:
        if not placed:
            return
        waste = board_area - used
        eff = (used / board_area * 100.0) if board_area > 0 else 0.0
        boards.append(
            BoardLayout(
                board_number=board_num,
                board_width=board_width,
                board_length=board_length,
                used_area_mm2=used,
                waste_area_mm2=max(waste, 0.0),
                efficiency_percent=eff,
                panel_count=len(placed),
                panels=placed,
                cuts=[],
            )
        )

    for instance_index, (idx, p) in enumerate(panel_instances):
        w, h = p.width, p.length

        # If panel doesn't fit horizontally, move to next row
        if x + w > board_width:
            x = 0.0
            y += row_height
            row_height = 0.0

        # If still doesn't fit vertically, flush board and start a new one
        if y + h > board_length or (x == 0 and y == 0 and (w > board_width or h > board_length)):
            flush_board(board_number, current_panels, used_area)
            board_number += 1
            current_panels = []
            used_area = 0.0
            x = 0.0
            y = 0.0
            row_height = 0.0

        placed = PlacedPanel(
            panel_index=idx,
            x=x,
            y=y,
            width=w,
            length=h,
            label=p.label,
        )
        current_panels.append(placed)
        used_area += w * h

        x += w
        row_height = max(row_height, h)

    # Flush last board
    flush_board(board_number, current_panels, used_area)

    # ---- Edging summary ----
    total_edging_m = 0.0
    edging_details: List[EdgingDetail] = []
    for p in request.panels:
        edge_per_panel_m = p.edge_length_mm / 1000.0
        total_edge_m = p.total_edge_length_mm / 1000.0
        total_edging_m += total_edge_m

        edges_applied = "".join(
            side[0].upper()
            for side, flag in [
                ("top", p.edging.top),
                ("right", p.edging.right),
                ("bottom", p.edging.bottom),
                ("left", p.edging.left),
            ]
            if flag
        ) or "None"

        edging_details.append(
            EdgingDetail(
                panel_label=p.label or "Panel",
                quantity=p.quantity,
                edge_per_panel_m=edge_per_panel_m,
                total_edge_m=total_edge_m,
                edges_applied=edges_applied,
            )
        )

    edging_summary = EdgingSummary(
        total_meters=total_edging_m,
        details=edging_details,
    )

    total_waste_mm2 = sum(b.waste_area_mm2 for b in boards)
    total_board_area = board_area * max(len(boards), 1)
    total_waste_percent = (
        total_waste_mm2 / total_board_area * 100.0 if total_board_area > 0 else 0.0
    )

    optimization = OptimizationSummary(
        total_boards=len(boards),
        total_panels=len(panel_instances),
        unique_panel_types=len(request.panels),
        total_edging_meters=total_edging_m,
        total_cuts=0,
        total_cut_length=0.0,
        total_waste_mm2=total_waste_mm2,
        total_waste_percent=total_waste_percent,
        board_width=board_width,
        board_length=board_length,
    )

    return boards, optimization, edging_summary