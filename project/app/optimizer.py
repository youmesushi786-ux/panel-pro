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


class FreeRect:
    """
    A free (unused) rectangle on a board.
    Coordinates are in mm from the top‑left corner of the board.
    """

    __slots__ = ("x", "y", "width", "height")

    def __init__(self, x: float, y: float, width: float, height: float) -> None:
        self.x = x
        self.y = y
        self.width = width
        self.height = height

    def area(self) -> float:
        return self.width * self.height


def _rects_intersect(
    fr: FreeRect, x: float, y: float, w: float, h: float
) -> bool:
    """Return True if the free rect and the used rect intersect (area > 0)."""
    if x >= fr.x + fr.width or x + w <= fr.x:
        return False
    if y >= fr.y + fr.height or y + h <= fr.y:
        return False
    return True


def _split_free_rect(
    fr: FreeRect, used_x: float, used_y: float, used_w: float, used_h: float
) -> List[FreeRect]:
    """
    Split a free rectangle by subtracting the area occupied by the used rect.
    Returns a list of resulting free rectangles (0‑4).
    """
    if not _rects_intersect(fr, used_x, used_y, used_w, used_h):
        return [fr]

    result: List[FreeRect] = []

    fr_right = fr.x + fr.width
    fr_bottom = fr.y + fr.height
    used_right = used_x + used_w
    used_bottom = used_y + used_h

    # Top segment
    if used_y > fr.y:
        h = used_y - fr.y
        if h > 0:
            result.append(FreeRect(fr.x, fr.y, fr.width, h))

    # Bottom segment
    if used_bottom < fr_bottom:
        h = fr_bottom - used_bottom
        if h > 0:
            result.append(FreeRect(fr.x, used_bottom, fr.width, h))

    # Left segment (middle band)
    top = max(fr.y, used_y)
    bottom = min(fr_bottom, used_bottom)
    if used_x > fr.x and bottom > top:
        w = used_x - fr.x
        if w > 0:
            result.append(FreeRect(fr.x, top, w, bottom - top))

    # Right segment (middle band)
    if used_right < fr_right and bottom > top:
        w = fr_right - used_right
        if w > 0:
            result.append(FreeRect(used_right, top, w, bottom - top))

    return result


def _prune_free_rects(free_rects: List[FreeRect]) -> List[FreeRect]:
    """
    Remove free rectangles that are fully contained in others,
    and remove duplicates. This keeps the free‑rect set small and clean.
    """
    pruned: List[FreeRect] = []

    for i, r in enumerate(free_rects):
        contained = False
        for j, other in enumerate(free_rects):
            if i == j:
                continue

            if (
                r.x >= other.x
                and r.y >= other.y
                and r.x + r.width <= other.x + other.width
                and r.y + r.height <= other.y + other.height
            ):
                contained = True
                break

        if not contained:
            # Also avoid exact duplicates
            if not any(
                abs(r.x - p.x) < 1e-6
                and abs(r.y - p.y) < 1e-6
                and abs(r.width - p.width) < 1e-6
                and abs(r.height - p.height) < 1e-6
                for p in pruned
            ):
                pruned.append(r)

    return pruned


def run_optimization(
    request: CuttingRequest,
) -> Tuple[List[BoardLayout], OptimizationSummary, EdgingSummary]:
    """
    Advanced 2D nesting / cutting optimization using a MaxRects‑style heuristic.

    Strategy:
    - Expand all panels by quantity.
    - Sort instances by area descending (place big items first).
    - Maintain, for each board, a list of free rectangles.
    - For each panel instance:
        * Try to place it (optionally rotated) into the best‑fitting free rect
          on any existing board (minimal leftover area).
        * If it doesn’t fit on any existing board, open a new board and place it there.
    - This typically yields much lower waste than simple row/shelf packing.
    """

    board_width = float(DEFAULT_BOARD_WIDTH_MM)
    board_length = float(DEFAULT_BOARD_LENGTH_MM)
    board_area = board_width * board_length

    # Expand panels per quantity
    panel_instances: List[Tuple[int, object]] = []
    for idx, p in enumerate(request.panels):
        for _ in range(p.quantity):
            panel_instances.append((idx, p))

    # Sort by area descending (largest first for better packing)
    panel_instances.sort(
        key=lambda item: float(item[1].width) * float(item[1].length), reverse=True
    )

    # Each working board tracks: number, free rects, placed panels, used area
    boards_work: List[dict] = []
    next_board_number = 1

    def _create_board() -> dict:
        nonlocal next_board_number
        b = {
            "board_number": next_board_number,
            "free_rects": [
                FreeRect(0.0, 0.0, board_width, board_length)
            ],  # full board initially free
            "placed_panels": [],  # type: List[PlacedPanel]
            "used_area": 0.0,
        }
        next_board_number += 1
        boards_work.append(b)
        return b

    # Ensure at least one board exists
    _create_board()

    # ---- Placement loop (MaxRects‑style) ----
    for instance_index, (idx, p) in enumerate(panel_instances):
        pw = float(p.width)
        ph = float(p.length)
        panel_area = pw * ph

        best_board = None
        best_rect = None
        best_rotated = False
        best_score = None  # lower is better (leftover area)

        # Try to place on existing boards
        for b in boards_work:
            for fr in b["free_rects"]:
                # Orientation 1: no rotation
                if pw <= fr.width and ph <= fr.height:
                    leftover_area = fr.width * fr.height - panel_area
                    # Tie‑breaking: prefer placements that leave a more "square" leftover
                    short_side_leftover = min(fr.width - pw, fr.height - ph)
                    score = (leftover_area, short_side_leftover)

                    if best_score is None or score < best_score:
                        best_score = score
                        best_board = b
                        best_rect = (fr.x, fr.y, pw, ph)
                        best_rotated = False

                # Orientation 2: rotated 90°
                if ph <= fr.width and pw <= fr.height:
                    leftover_area = fr.width * fr.height - panel_area
                    short_side_leftover = min(fr.width - ph, fr.height - pw)
                    score = (leftover_area, short_side_leftover)

                    if best_score is None or score < best_score:
                        best_score = score
                        best_board = b
                        best_rect = (fr.x, fr.y, ph, pw)  # swapped width/length
                        best_rotated = True

        # If it fits nowhere, create a new board and place it there
        if best_board is None:
            best_board = _create_board()
            fr = best_board["free_rects"][0]
            # Try both orientations on the fresh board
            placed = False

            # No rotation
            if pw <= fr.width and ph <= fr.height:
                best_rect = (fr.x, fr.y, pw, ph)
                best_rotated = False
                placed = True
            # Rotated
            elif ph <= fr.width and pw <= fr.height:
                best_rect = (fr.x, fr.y, ph, pw)
                best_rotated = True
                placed = True
            else:
                # This panel physically cannot fit on the board (even empty).
                # In practice this should not happen if data is valid.
                # We simply skip it to avoid a hard crash.
                # You may want to raise an exception here instead.
                continue
        else:
            # We already chose best_rect above
            placed = True

        if not placed or best_rect is None:
            # Safety check; should not occur.
            continue

        x, y, placed_w, placed_h = best_rect

        # Record placement
        placed_panel = PlacedPanel(
            panel_index=idx,
            x=x,
            y=y,
            width=placed_w,
            length=placed_h,
            label=p.label,
        )
        best_board["placed_panels"].append(placed_panel)
        best_board["used_area"] += placed_w * placed_h

        # Update free rectangles for that board:
        # Split all rectangles that intersect with the placed panel.
        new_free: List[FreeRect] = []
        for fr in best_board["free_rects"]:
            split = _split_free_rect(fr, x, y, placed_w, placed_h)
            new_free.extend(split)

        # Clean up / prune free rectangles
        best_board["free_rects"] = _prune_free_rects(new_free)

    # ---- Build BoardLayout objects ----
    boards: List[BoardLayout] = []
    for b in boards_work:
        used = float(b["used_area"])
        if used <= 0:
            # Skip completely unused boards (no panels placed)
            continue
        waste = board_area - used
        efficiency = (used / board_area * 100.0) if board_area > 0 else 0.0

        boards.append(
            BoardLayout(
                board_number=b["board_number"],
                board_width=int(board_width),
                board_length=int(board_length),
                used_area_mm2=used,
                waste_area_mm2=max(waste, 0.0),
                efficiency_percent=efficiency,
                panel_count=len(b["placed_panels"]),
                panels=b["placed_panels"],
                cuts=[],  # Detailed cut lines can be added later if needed
            )
        )

    # ---- Edging summary (unchanged logic) ----
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

    # ---- Overall optimization summary ----
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
        total_cuts=0,  # still 0 because we are not computing detailed cut lines yet
        total_cut_length=0.0,
        total_waste_mm2=total_waste_mm2,
        total_waste_percent=total_waste_percent,
        board_width=int(board_width),
        board_length=int(board_length),
    )

    return boards, optimization, edging_summary