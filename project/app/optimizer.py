from __future__ import annotations

from dataclasses import dataclass
from math import floor
from typing import Iterable, List, Optional, Tuple

from .schemas import (
    BoardLayout,
    CuttingRequest,
    EdgingDetail,
    EdgingSummary,
    GrainAlignment,
    OptimizationSummary,
    PlacedPanel,
)
from .config import DEFAULT_BOARD_LENGTH_MM, DEFAULT_BOARD_WIDTH_MM

EPS = 1e-6


@dataclass(slots=True)
class FreeRect:
    x: float
    y: float
    width: float
    height: float

    def area(self) -> float:
        return self.width * self.height


def _resolve_board_size(request: CuttingRequest) -> Tuple[float, float]:
    return (
        float(request.effective_board_width_mm or DEFAULT_BOARD_WIDTH_MM),
        float(request.effective_board_length_mm or DEFAULT_BOARD_LENGTH_MM),
    )


def _rects_intersect(fr: FreeRect, x: float, y: float, w: float, h: float) -> bool:
    if x >= fr.x + fr.width - EPS or x + w <= fr.x + EPS:
        return False
    if y >= fr.y + fr.height - EPS or y + h <= fr.y + EPS:
        return False
    return True


def _contains(a: FreeRect, b: FreeRect) -> bool:
    return (
        b.x >= a.x - EPS
        and b.y >= a.y - EPS
        and b.x + b.width <= a.x + a.width + EPS
        and b.y + b.height <= a.y + a.height + EPS
    )


def _split_free_rect(
    fr: FreeRect,
    used_x: float,
    used_y: float,
    used_w: float,
    used_h: float,
) -> List[FreeRect]:
    if not _rects_intersect(fr, used_x, used_y, used_w, used_h):
        return [fr]

    result: List[FreeRect] = []

    fr_right = fr.x + fr.width
    fr_bottom = fr.y + fr.height
    used_right = used_x + used_w
    used_bottom = used_y + used_h

    if used_y > fr.y + EPS:
        result.append(FreeRect(fr.x, fr.y, fr.width, used_y - fr.y))

    if used_bottom < fr_bottom - EPS:
        result.append(FreeRect(fr.x, used_bottom, fr.width, fr_bottom - used_bottom))

    top = max(fr.y, used_y)
    bottom = min(fr_bottom, used_bottom)

    if used_x > fr.x + EPS and bottom > top + EPS:
        result.append(FreeRect(fr.x, top, used_x - fr.x, bottom - top))

    if used_right < fr_right - EPS and bottom > top + EPS:
        result.append(FreeRect(used_right, top, fr_right - used_right, bottom - top))

    return [r for r in result if r.width > EPS and r.height > EPS]


def _prune_free_rects(free_rects: List[FreeRect]) -> List[FreeRect]:
    cleaned: List[FreeRect] = []

    for r in free_rects:
        if r.width <= EPS or r.height <= EPS:
            continue

        duplicate = any(
            abs(r.x - c.x) < EPS
            and abs(r.y - c.y) < EPS
            and abs(r.width - c.width) < EPS
            and abs(r.height - c.height) < EPS
            for c in cleaned
        )
        if not duplicate:
            cleaned.append(r)

    pruned: List[FreeRect] = []
    for i, r in enumerate(cleaned):
        contained = False
        for j, other in enumerate(cleaned):
            if i != j and _contains(other, r):
                contained = True
                break
        if not contained:
            pruned.append(r)

    return pruned


def _overlap(a: PlacedPanel, b: PlacedPanel) -> bool:
    return not (
        a.x + a.width <= b.x + EPS
        or b.x + b.width <= a.x + EPS
        or a.y + a.length <= b.y + EPS
        or b.y + b.length <= a.y + EPS
    )


def _validate_board_layouts(
    boards_work: List[dict],
    board_width: float,
    board_length: float,
) -> None:
    for b in boards_work:
        panels = b["placed_panels"]

        for p in panels:
            if p.x < -EPS or p.y < -EPS:
                raise ValueError(f"Invalid placement: negative position for panel '{p.label}'")
            if p.x + p.width > board_width + EPS:
                raise ValueError(f"Invalid placement: panel '{p.label}' exceeds board width")
            if p.y + p.length > board_length + EPS:
                raise ValueError(f"Invalid placement: panel '{p.label}' exceeds board length")

        for i in range(len(panels)):
            for j in range(i + 1, len(panels)):
                if _overlap(panels[i], panels[j]):
                    raise ValueError(
                        f"Invalid placement: overlap detected on board {b['board_number']} "
                        f"between '{panels[i].label}' and '{panels[j].label}'"
                    )


def _panel_can_rotate(panel, request: CuttingRequest) -> bool:
    if request.options and not request.options.allow_rotation:
        return False
    if request.options and request.options.consider_grain:
        return panel.alignment == GrainAlignment.none
    return True


def _get_kerf_mm(request: CuttingRequest) -> float:
    return float(request.kerf_mm)


def _expand_panels(request: CuttingRequest) -> List[Tuple[int, object]]:
    panel_instances: List[Tuple[int, object]] = []
    for idx, p in enumerate(request.panels):
        for _ in range(int(p.quantity)):
            panel_instances.append((idx, p))
    return panel_instances


def _panel_sort_key(item: Tuple[int, object], mode: str):
    _, p = item
    w = float(p.width)
    h = float(p.length)
    area = w * h
    longest = max(w, h)
    shortest = min(w, h)

    if mode == "area":
        return (-area, -longest, -shortest)
    if mode == "long_side":
        return (-longest, -area, -shortest)
    if mode == "short_side":
        return (-shortest, -area, -longest)
    if mode == "perimeter":
        return (-(2 * (w + h)), -area, -longest)
    return (-area, -longest, -shortest)


def _score_placement(
    fr: FreeRect,
    placed_w: float,
    placed_h: float,
    board_used_area: float,
    board_area: float,
    heuristic: str,
):
    dw = fr.width - placed_w
    dh = fr.height - placed_h
    leftover_area = fr.area() - (placed_w * placed_h)
    short_side_fit = min(dw, dh)
    long_side_fit = max(dw, dh)
    board_fill_ratio = board_used_area / board_area if board_area > 0 else 0.0

    if heuristic == "best_area_fit":
        return (leftover_area, short_side_fit, long_side_fit, -board_fill_ratio)
    if heuristic == "best_short_side_fit":
        return (short_side_fit, long_side_fit, leftover_area, -board_fill_ratio)
    if heuristic == "best_long_side_fit":
        return (long_side_fit, short_side_fit, leftover_area, -board_fill_ratio)
    return (short_side_fit + long_side_fit, leftover_area, short_side_fit, -board_fill_ratio)


def _build_edging_summary(request: CuttingRequest) -> EdgingSummary:
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

    return EdgingSummary(total_meters=total_edging_m, details=edging_details)


def _build_optimization_summary(
    request: CuttingRequest,
    boards: List[BoardLayout],
    total_used_area: float,
    impossible_panels: List[str],
    warnings: List[str],
    kerf_mm: float,
    board_width: float,
    board_length: float,
    total_panels: int,
    total_edging_m: float,
) -> OptimizationSummary:
    board_area = board_width * board_length
    total_waste_mm2 = sum(b.waste_area_mm2 for b in boards)
    total_board_area = board_area * max(len(boards), 1)

    total_waste_percent = total_waste_mm2 / total_board_area * 100.0 if total_board_area > 0 else 0.0
    overall_efficiency_percent = total_used_area / total_board_area * 100.0 if total_board_area > 0 else 0.0

    return OptimizationSummary(
        total_boards=len(boards),
        total_panels=total_panels,
        unique_panel_types=len(request.panels),
        total_edging_meters=total_edging_m,
        total_cuts=0,
        total_cut_length=0.0,
        total_waste_mm2=total_waste_mm2,
        total_waste_percent=total_waste_percent,
        board_width=board_width,
        board_length=board_length,
        total_used_area_mm2=total_used_area,
        overall_efficiency_percent=overall_efficiency_percent,
        kerf_mm=kerf_mm,
        grain_considered=request.consider_grain,
        material_groups=1,
        impossible_panels=impossible_panels,
        warnings=warnings,
    )


def _build_nested_solution(
    request: CuttingRequest,
    sort_mode: str,
    heuristic: str,
) -> Tuple[List[BoardLayout], OptimizationSummary, EdgingSummary]:
    board_width, board_length = _resolve_board_size(request)
    board_area = board_width * board_length
    kerf = _get_kerf_mm(request)

    panel_instances = _expand_panels(request)
    panel_instances.sort(key=lambda item: _panel_sort_key(item, sort_mode))

    boards_work: List[dict] = []
    next_board_number = 1
    impossible_panels: List[str] = []

    def _create_board() -> dict:
        nonlocal next_board_number
        board = {
            "board_number": next_board_number,
            "free_rects": [FreeRect(0.0, 0.0, board_width, board_length)],
            "placed_panels": [],
            "used_area": 0.0,
        }
        next_board_number += 1
        boards_work.append(board)
        return board

    def _find_best_placement(panel) -> Tuple[Optional[dict], Optional[Tuple[float, float, float, float]], bool]:
        pw = float(panel.width)
        ph = float(panel.length)
        can_rotate = _panel_can_rotate(panel, request)

        best_board = None
        best_rect = None
        best_rotated = False
        best_score = None

        for board in boards_work:
            for fr in board["free_rects"]:
                orientations: Iterable[Tuple[float, float, bool]] = [(pw, ph, False)]
                if can_rotate and abs(pw - ph) > EPS:
                    orientations = [(pw, ph, False), (ph, pw, True)]

                for ow, oh, rotated in orientations:
                    if ow <= fr.width + EPS and oh <= fr.height + EPS:
                        score = _score_placement(
                            fr=fr,
                            placed_w=ow,
                            placed_h=oh,
                            board_used_area=float(board["used_area"]),
                            board_area=board_area,
                            heuristic=heuristic,
                        )
                        if best_score is None or score < best_score:
                            best_score = score
                            best_board = board
                            best_rect = (fr.x, fr.y, ow, oh)
                            best_rotated = rotated

        return best_board, best_rect, best_rotated

    if panel_instances:
        _create_board()

    for idx, panel in panel_instances:
        pw = float(panel.width)
        ph = float(panel.length)
        can_rotate = _panel_can_rotate(panel, request)

        fits_normal = pw <= board_width + EPS and ph <= board_length + EPS
        fits_rotated = ph <= board_width + EPS and pw <= board_length + EPS if can_rotate else False

        if not (fits_normal or fits_rotated):
            impossible_panels.append(panel.label or f"Panel-{idx}")
            continue

        best_board, best_rect, best_rotated = _find_best_placement(panel)

        if best_board is None or best_rect is None:
            best_board = _create_board()
            best_board, best_rect, best_rotated = _find_best_placement(panel)
            if best_board is None or best_rect is None:
                impossible_panels.append(panel.label or f"Panel-{idx}")
                continue

        x, y, placed_w, placed_h = best_rect

        placed_panel = PlacedPanel(
            panel_index=idx,
            x=x,
            y=y,
            width=placed_w,
            length=placed_h,
            label=panel.label,
            rotated=best_rotated,
            grain_aligned=panel.alignment,
            board_number=best_board["board_number"],
        )
        best_board["placed_panels"].append(placed_panel)
        best_board["used_area"] += placed_w * placed_h

        new_free: List[FreeRect] = []
        for fr in best_board["free_rects"]:
            split = _split_free_rect(fr, x, y, placed_w, placed_h)
            adjusted: List[FreeRect] = []

            for r in split:
                ax, ay, aw, ah = r.x, r.y, r.width, r.height

                if abs(ax - (x + placed_w)) < EPS:
                    ax += kerf
                    aw -= kerf
                if abs(ay - (y + placed_h)) < EPS:
                    ay += kerf
                    ah -= kerf

                if aw > EPS and ah > EPS:
                    adjusted.append(FreeRect(ax, ay, aw, ah))

            new_free.extend(adjusted)

        best_board["free_rects"] = _prune_free_rects(new_free)

    if not request.options or request.options.strict_validation:
        _validate_board_layouts(boards_work, board_width, board_length)

    boards: List[BoardLayout] = []
    total_used_area = 0.0

    for board in boards_work:
        used = float(board["used_area"])
        if used <= EPS:
            continue

        waste = max(board_area - used, 0.0)
        efficiency = used / board_area * 100.0 if board_area > 0 else 0.0
        total_used_area += used

        boards.append(
            BoardLayout(
                board_number=board["board_number"],
                board_width=board_width,
                board_length=board_length,
                used_area_mm2=used,
                waste_area_mm2=waste,
                efficiency_percent=efficiency,
                panel_count=len(board["placed_panels"]),
                panels=board["placed_panels"],
                cuts=[],
            )
        )

    edging_summary = _build_edging_summary(request)
    optimization = _build_optimization_summary(
        request=request,
        boards=boards,
        total_used_area=total_used_area,
        impossible_panels=impossible_panels,
        warnings=[],
        kerf_mm=kerf,
        board_width=board_width,
        board_length=board_length,
        total_panels=len(panel_instances),
        total_edging_m=edging_summary.total_meters,
    )

    return boards, optimization, edging_summary


def _build_strict_production_solution(
    request: CuttingRequest,
) -> Tuple[List[BoardLayout], OptimizationSummary, EdgingSummary]:
    board_width, board_length = _resolve_board_size(request)
    board_area = board_width * board_length

    boards: List[BoardLayout] = []
    board_no = 1
    total_used_area = 0.0
    impossible_panels: List[str] = []

    for idx, panel in enumerate(request.panels):
        pw = float(panel.width)
        ph = float(panel.length)
        qty = int(panel.quantity)
        can_rotate = _panel_can_rotate(panel, request)

        orientations = [(pw, ph, False)]
        if can_rotate and abs(pw - ph) > EPS:
            orientations.append((ph, pw, True))

        best = None
        for ow, oh, rotated in orientations:
            across = floor(board_width / ow) if ow > 0 else 0
            down = floor(board_length / oh) if oh > 0 else 0
            per_board = across * down
            if per_board > 0:
                if best is None or per_board > best[0]:
                    best = (per_board, across, down, ow, oh, rotated)

        if best is None:
            impossible_panels.append(panel.label or f"Panel-{idx}")
            continue

        per_board, across, down, placed_w, placed_h, rotated = best
        remaining = qty

        while remaining > 0:
            panels_on_this_board: List[PlacedPanel] = []
            place_count = min(per_board, remaining)

            count = 0
            for row in range(down):
                for col in range(across):
                    if count >= place_count:
                        break

                    panels_on_this_board.append(
                        PlacedPanel(
                            panel_index=idx,
                            x=col * placed_w,
                            y=row * placed_h,
                            width=placed_w,
                            length=placed_h,
                            label=panel.label,
                            rotated=rotated,
                            grain_aligned=panel.alignment,
                            board_number=board_no,
                        )
                    )
                    count += 1

                if count >= place_count:
                    break

            used = place_count * placed_w * placed_h
            waste = max(board_area - used, 0.0)
            efficiency = used / board_area * 100.0 if board_area > 0 else 0.0
            total_used_area += used

            boards.append(
                BoardLayout(
                    board_number=board_no,
                    board_width=board_width,
                    board_length=board_length,
                    used_area_mm2=used,
                    waste_area_mm2=waste,
                    efficiency_percent=efficiency,
                    panel_count=len(panels_on_this_board),
                    panels=panels_on_this_board,
                    cuts=[],
                )
            )

            board_no += 1
            remaining -= place_count

    edging_summary = _build_edging_summary(request)
    optimization = _build_optimization_summary(
        request=request,
        boards=boards,
        total_used_area=total_used_area,
        impossible_panels=impossible_panels,
        warnings=["Strict production mode applied"],
        kerf_mm=request.kerf_mm,
        board_width=board_width,
        board_length=board_length,
        total_panels=sum(p.quantity for p in request.panels),
        total_edging_m=edging_summary.total_meters,
    )

    return boards, optimization, edging_summary


def run_optimization(
    request: CuttingRequest,
) -> Tuple[List[BoardLayout], OptimizationSummary, EdgingSummary]:
    if request.strict_production_mode:
        return _build_strict_production_solution(request)

    candidate_runs = [
        ("area", "best_area_fit"),
        ("area", "best_short_side_fit"),
        ("long_side", "best_short_side_fit"),
        ("long_side", "best_area_fit"),
        ("perimeter", "best_short_side_fit"),
        ("short_side", "best_long_side_fit"),
        ("area", "mixed"),
    ]

    best_result: Optional[Tuple[List[BoardLayout], OptimizationSummary, EdgingSummary]] = None
    best_key = None
    errors: List[str] = []

    for sort_mode, heuristic in candidate_runs:
        try:
            boards, optimization, edging = _build_nested_solution(request, sort_mode, heuristic)
            avg_eff = sum(b.efficiency_percent for b in boards) / len(boards) if boards else 0.0
            key = (optimization.total_boards, optimization.total_waste_mm2, -avg_eff)

            if best_key is None or key < best_key:
                best_key = key
                best_result = (boards, optimization, edging)

        except Exception as exc:
            errors.append(f"{sort_mode}/{heuristic}: {exc}")

    if best_result is not None:
        return best_result

    raise ValueError("Optimization failed for all strategies. " + (" | ".join(errors) if errors else ""))
