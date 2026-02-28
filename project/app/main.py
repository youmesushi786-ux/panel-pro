from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Dict

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.schemas import (
    CuttingRequest,
    CuttingResponse,
    HealthResponse,
    BOQSummary,
    BOQItem,
)
from app.optimizer import run_optimization
from app.pricing import calculate_pricing
from app.config import (
    BOARD_CATALOG,
    BOARD_PRICE_TABLE,
    BOARD_COLORS,
    CUTTING_PRICE_PER_BOARD,
    EDGING_PRICE_PER_METER,
    CLIENT_EDGING_PRICE_PER_METER,
)
from app.mpesa import initiate_stk_push
from app.email_utils import send_email, COMPANY_EMAIL
from app.reporting import generate_report_pdf

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

logger = logging.getLogger("panelpro")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(title="PanelPro - Cutting Optimizer")

# ---------------------------------------------------------------------------
# CORS (configurable via ALLOWED_ORIGINS env)
# ---------------------------------------------------------------------------

_allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if _allowed_origins_env:
    _origins = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
else:
    _origins = ["*"]  # dev default; set ALLOWED_ORIGINS in prod

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request / response logging middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def log_requests(request: Request, call_next):
    route_id = f"{request.method} {request.url.path}"
    logger.info("➡ %s", route_id)

    # Log request body (best effort)
    try:
        body_bytes = await request.body()
        if body_bytes:
            try:
                logger.info("Request body: %s", body_bytes.decode("utf-8"))
            except UnicodeDecodeError:
                logger.info("Request body (bytes): %s", body_bytes)
    except Exception:
        logger.exception("Failed to read request body")

    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Unhandled error while processing %s", route_id)
        raise

    status = response.status_code
    logger.info("⬅ %s - status %s", route_id, status)

    # Log response body (best effort)
    try:
        body_bytes = getattr(response, "body", b"")
        if body_bytes:
            try:
                logger.info("Response body: %s", body_bytes.decode("utf-8"))
            except UnicodeDecodeError:
                logger.info("Response body (bytes): %s", body_bytes)
    except Exception:
        logger.exception("Failed to read response body for %s", route_id)

    return response


# ---------------------------------------------------------------------------
# Global validation error handler
# ---------------------------------------------------------------------------


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
):
    logger.error("Validation error on %s", request.url.path)
    logger.error("Errors: %s", exc.errors())
    logger.error("Body: %s", exc.body)
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


# In-memory stores (demo only – real apps should use a DB)
ORDERS: dict[str, dict[str, Any]] = {}
PAYMENTS: dict[str, dict[str, Any]] = {}
PENDING_CHECKOUT: dict[str, str] = {}  # CheckoutRequestID -> order_id


# ---------------------------------------------------------------------------
# HEALTH & BOARDS CATALOG
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@app.get("/api/boards/catalog")
async def boards_catalog() -> Dict[str, Any]:
    """
    Shape expected by the frontend:
      { catalog: {...}, price_table: {...}, colors: {...} }
    """
    return {
        "catalog": BOARD_CATALOG,
        "price_table": BOARD_PRICE_TABLE,
        "colors": BOARD_COLORS,
    }


# ---------------------------------------------------------------------------
# OPTIMIZE & BOQ
# ---------------------------------------------------------------------------


def build_boq(
    request: CuttingRequest,
    optimization,
    edging,
    pricing,
) -> BOQSummary:
    items: list[BOQItem] = []

    for idx, p in enumerate(request.panels, start=1):
        edges = "".join(
            edge[0].upper()
            for edge, flag in [
                ("Top", p.edging.top),
                ("Right", p.edging.right),
                ("Bottom", p.edging.bottom),
                ("Left", p.edging.left),
            ]
            if flag
        ) or "None"

        eff_board = p.get_effective_board(request.board)

        items.append(
            BOQItem(
                item_no=idx,
                description=p.label or f"Panel {idx}",
                size=f"{p.width}×{p.length} mm",
                quantity=p.quantity,
                unit="pcs",
                edges=edges,
                core_type=eff_board.core_type.value,
                thickness_mm=int(eff_board.thickness_mm.value),
                company=eff_board.company,
                colour=eff_board.color_name,
                material_amount=0.0,
            )
        )

    materials = {
        "board_type": request.board.core_type.value.upper(),
        "board_company": request.board.company,
        "board_color": request.board.color_name,
        "board_size": f"{optimization.board_width}×{optimization.board_length} mm",
        "boards_required": optimization.total_boards,
        "supplied_by": pricing.supplied_by,
    }

    cutting_line = next((l for l in pricing.lines if l.item == "Cutting"), None)
    edging_line = next((l for l in pricing.lines if l.item == "Edging"), None)

    edging_rate = (
        CLIENT_EDGING_PRICE_PER_METER
        if request.supply.client_supply
        else EDGING_PRICE_PER_METER
    )

    services = {
        "cutting": {
            "boards": optimization.total_boards,
            "price_per_board": CUTTING_PRICE_PER_BOARD,
            "total": cutting_line.amount if cutting_line else 0.0,
        },
        "edging": {
            "meters": edging.total_meters,
            "price_per_meter": edging_rate,
            "total": edging_line.amount if edging_line else 0.0,
        },
    }

    return BOQSummary(
        project_name=request.project_name,
        customer_name=request.customer_name,
        date=datetime.utcnow().strftime("%Y-%m-%d"),
        items=items,
        materials=materials,
        services=services,
        pricing=pricing,
    )


@app.post("/api/optimize", response_model=CuttingResponse)
async def api_optimize(req: CuttingRequest) -> CuttingResponse:
    logger.info(
        "Handling /api/optimize for project=%s customer=%s",
        req.project_name,
        req.customer_name,
    )

    boards, optimization, edging_summary = run_optimization(req)
    pricing = calculate_pricing(req, optimization, edging_summary.total_meters)
    boq = build_boq(req, optimization, edging_summary, pricing)

    report_id = (
        f"RPT-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-"
        f"{datetime.utcnow().microsecond:06d}"
    )

    return CuttingResponse(
        request_summary={
            "project_name": req.project_name,
            "customer_name": req.customer_name,
            "total_panels": optimization.total_panels,
        },
        optimization=optimization,
        layouts=boards,
        edging=edging_summary, 
        boq=boq,
        report_id=report_id,
    )