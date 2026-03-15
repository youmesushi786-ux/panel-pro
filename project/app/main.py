from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.schemas import (
    BOQItem,
    BOQSummary,
    CuttingRequest,
    CuttingResponse,
    HealthResponse,
    StickerLabel,
    StickerSheet,
)
from app.optimizer import run_optimization
from app.pricing import calculate_pricing
from app.config import (
    BOARD_CATALOG,
    BOARD_COLORS,
    BOARD_PRICE_TABLE,
    CUTTING_PRICE_PER_BOARD,
    EDGING_PRICE_PER_METER,
)
from app.email_utils import COMPANY_EMAIL, send_email
from app.mpesa import initiate_stk_push
from app.whatsapp_utils import send_whatsapp_message

logger = logging.getLogger("panelpro")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")
DISABLE_DOCS_IN_PRODUCTION = os.getenv("DISABLE_DOCS_IN_PRODUCTION", "false").lower() == "true"
COMPANY_LOGO_URL = os.getenv("COMPANY_LOGO_URL", "")
STICKER_COMPANY_NAME = os.getenv("STICKER_COMPANY_NAME", "PanelPro")

docs_url = None if (IS_PRODUCTION and DISABLE_DOCS_IN_PRODUCTION) else "/docs"
redoc_url = None if (IS_PRODUCTION and DISABLE_DOCS_IN_PRODUCTION) else "/redoc"
openapi_url = None if (IS_PRODUCTION and DISABLE_DOCS_IN_PRODUCTION) else "/openapi.json"

app = FastAPI(
    title="PanelPro - Cutting Optimizer",
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
)

_allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if _allowed_origins_env:
    _origins = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
else:
    _origins = ["*"] if not IS_PRODUCTION else []

logger.info("ENVIRONMENT=%s", ENVIRONMENT)
logger.info("IS_PRODUCTION=%s", IS_PRODUCTION)
logger.info("ALLOWED_ORIGINS raw=%s", _allowed_origins_env)
logger.info("CORS allow_origins=%s", _origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

ORDERS: dict[str, dict[str, Any]] = {}
PAYMENTS: dict[str, dict[str, Any]] = {}
PENDING_CHECKOUT: dict[str, str] = {}


def require_admin_api_key(x_api_key: Optional[str]) -> None:
    if not ADMIN_API_KEY:
        raise HTTPException(status_code=500, detail="ADMIN_API_KEY is not configured")
    if x_api_key != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error("Validation error on %s", request.url.path)
    logger.error("Validation details: %s", exc.errors())
    logger.error("Request body: %s", exc.body)
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.get("/")
async def root():
    return {
        "message": "PanelPro API is running",
        "environment": ENVIRONMENT,
        "status": "ok",
    }


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@app.get("/api/boards/catalog")
async def boards_catalog() -> Dict[str, Any]:
    return {
        "catalog": BOARD_CATALOG,
        "price_table": BOARD_PRICE_TABLE,
        "colors": BOARD_COLORS,
    }


def build_boq(request: CuttingRequest, optimization, edging, pricing) -> BOQSummary:
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

        panel_price = 0.0
        for line in pricing.panel_boq:
            if line.label == p.label and line.quantity == p.quantity:
                panel_price = line.material_amount
                break

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
                material_amount=panel_price,
            )
        )

    client_boards = request.supply.client_board_qty or 0
    client_boards = max(min(client_boards, optimization.total_boards), 0)
    factory_boards = max(optimization.total_boards - client_boards, 0)

    materials = {
        "board_type": request.board.core_type.value.upper(),
        "board_company": request.board.company,
        "board_color": request.board.color_name,
        "board_size": f"{optimization.board_width}×{optimization.board_length} mm",
        "boards_required": optimization.total_boards,
        "boards_client": client_boards,
        "boards_factory": factory_boards,
        "supplied_by": pricing.supplied_by,
    }

    cutting_line = next((l for l in pricing.lines if l.item == "Cutting"), None)
    edging_line = next((l for l in pricing.lines if l.item == "Edging"), None)

    services = {
        "cutting": {
            "boards": optimization.total_boards,
            "price_per_board": CUTTING_PRICE_PER_BOARD,
            "total": cutting_line.amount if cutting_line else 0.0,
        },
        "edging": {
            "meters": edging.total_meters,
            "price_per_meter": EDGING_PRICE_PER_METER,
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


def build_stickers(request: CuttingRequest, layouts) -> StickerSheet:
    labels: list[StickerLabel] = []
    serial_counter = 1
    panel_instance_counter: dict[int, int] = {}

    for layout in layouts:
        for placed in layout.panels:
            panel = request.panels[placed.panel_index]
            eff_board = panel.get_effective_board(request.board)

            panel_instance_counter.setdefault(placed.panel_index, 0)
            panel_instance_counter[placed.panel_index] += 1
            quantity_index = panel_instance_counter[placed.panel_index]

            edges = "".join(
                edge[0].upper()
                for edge, flag in [
                    ("Top", panel.edging.top),
                    ("Right", panel.edging.right),
                    ("Bottom", panel.edging.bottom),
                    ("Left", panel.edging.left),
                ]
                if flag
            ) or "None"

            labels.append(
                StickerLabel(
                    serial_no=f"LBL-{serial_counter:05d}",
                    panel_label=panel.label or f"Panel {placed.panel_index + 1}",
                    width_mm=placed.width,
                    length_mm=placed.length,
                    quantity_index=quantity_index,
                    board_number=layout.board_number,
                    core_type=eff_board.core_type.value,
                    thickness_mm=int(eff_board.thickness_mm.value),
                    company=eff_board.company,
                    colour=eff_board.color_name,
                    edges=edges,
                    grain_alignment=panel.alignment.value if panel.alignment else None,
                    logo_url=COMPANY_LOGO_URL or None,
                    company_name=STICKER_COMPANY_NAME,
                )
            )
            serial_counter += 1

    return StickerSheet(total_labels=len(labels), labels=labels)


@app.post("/api/optimize", response_model=CuttingResponse)
async def api_optimize(req: CuttingRequest) -> CuttingResponse:
    logger.info(
        "Received /api/optimize request: project=%s customer=%s panels=%s",
        req.project_name,
        req.customer_name,
        len(req.panels),
    )

    boards, optimization, edging_summary = run_optimization(req)
    pricing = calculate_pricing(req, optimization, edging_summary.total_meters)
    boq = build_boq(req, optimization, edging_summary, pricing)
    stickers = build_stickers(req, boards)

    report_id = f"RPT-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{datetime.utcnow().microsecond:06d}"

    return CuttingResponse(
        request_summary={
            "project_name": req.project_name,
            "customer_name": req.customer_name,
            "total_panels": optimization.total_panels,
        },
        optimization=optimization,
        layouts=boards,
       edging=edging_summary,
        stickers=stickers,
        boq=boq,
        report_id=report_id,
    )


@app.post("/api/order/create")
async def order_create(req: CuttingRequest):
    _, optimization, edging_summary = run_optimization(req)
    pricing = calculate_pricing(req, optimization, edging_summary.total_meters)

    order_id = f"ORD-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    ORDERS[order_id] = {
        "amount": pricing.total,
        "currency": pricing.currency,
        "status": "created",
        "created_at": datetime.utcnow().isoformat(),
        "project_name": req.project_name,
        "customer_name": req.customer_name,
        "customer_email": req.customer_email,
        "customer_phone": req.customer_phone,
        "request": req,
    }
    PAYMENTS[order_id] = {"status": "pending"}

    return {
        "order_id": order_id,
        "amount": pricing.total,
        "currency": pricing.currency,
        "status": "created",
    }


@app.post("/api/mpesa/initiate")
async def mpesa_initiate_endpoint(payload: Dict[str, Any]):
    order_id = payload.get("order_id")
    phone = payload.get("phone_number")

    if not order_id or not phone:
        return {"error": "order_id and phone_number required"}

    order = ORDERS.get(order_id)
    if not order:
        return {"error": f"Order {order_id} not found"}

    amount = order["amount"]

    resp = await initiate_stk_push(
        order_id=order_id,
        phone_number=phone,
        amount=amount,
        account_reference=order_id,
        description="PanelPro payment",
    )

    if resp.get("ResponseCode") == "0":
        checkout_id = resp.get("CheckoutRequestID")
        PENDING_CHECKOUT[checkout_id] = order_id
        PAYMENTS[order_id] = {
            "status": "pending",
            "status_reason": resp.get("CustomerMessage"),
        }
        return {
            "status": "pending",
            "message": resp.get("CustomerMessage"),
            "checkout_request_id": checkout_id,
        }

    reason = resp.get("errorMessage") or resp.get("ResponseDescription") or "Unknown error"
    PAYMENTS[order_id] = {"status": "failed", "status_reason": reason}
    return {"status": "failed", "message": reason}


@app.post("/api/mpesa/callback")
async def mpesa_callback(request: Request):
    data = await request.json()

    try:
        stk = data["Body"]["stkCallback"]
        checkout_id = stk["CheckoutRequestID"]
        result_code = stk["ResultCode"]
        result_desc = stk["ResultDesc"]
    except KeyError:
        return {"ResultCode": 1, "ResultDesc": "Invalid callback payload"}

    order_id = PENDING_CHECKOUT.pop(checkout_id, None)
    if not order_id:
        return {"ResultCode": 0, "ResultDesc": "OK"}

    if result_code == 0:
        mpesa_receipt = None
        amount = None
        phone = None
        metadata = stk.get("CallbackMetadata", {}).get("Item", [])

        for item in metadata:
            name = item.get("Name")
            val = item.get("Value")
            if name == "MpesaReceiptNumber":
                mpesa_receipt = val
            elif name == "Amount":
                amount = val
            elif name == "PhoneNumber":
                phone = val

        PAYMENTS[order_id] = {
            "status": "paid",
            "status_reason": result_desc,
            "mpesa_receipt": mpesa_receipt,
            "amount": amount,
            "phone": phone,
        }
    else:
        PAYMENTS[order_id] = {"status": "failed", "status_reason": result_desc}

    return {"ResultCode": 0, "ResultDesc": "OK"}


@app.get("/api/payment/status")
async def payment_status(order_id: str = Query(...)):
    data = PAYMENTS.get(order_id)
    if not data:
        return {"status": "pending"}
    return data


@app.post("/api/test-email")
async def test_email(
    to: str = Query(..., description="Destination email"),
    x_api_key: Optional[str] = Header(default=None),
):
    if IS_PRODUCTION:
        require_admin_api_key(x_api_key)

    subject = "PanelPro test email"
    html = "<h1>PanelPro Email Test</h1><p>If you see this, email is working.</p>"

    try:
        send_email(to_email=to, subject=subject, html_body=html)
        return {"status": "sent", "to": to}
    except Exception as exc:
        return JSONResponse(status_code=500, content={"status": "error", "detail": str(exc)})


@app.post("/api/test-whatsapp")
async def test_whatsapp(
    phone: str = Query(..., description="Customer phone, e.g. 2547xxxxxxx"),
    x_api_key: Optional[str] = Header(default=None),
):
    if IS_PRODUCTION:
        require_admin_api_key(x_api_key)

    msg_id = send_whatsapp_message(
        phone,
        "PanelPro test WhatsApp message. If you see this, WhatsApp Cloud API is working.",
    )
    if msg_id:
        return {"status": "sent", "id": msg_id}
    return JSONResponse(
        status_code=500,
        content={"status": "error", "detail": "Failed to send WhatsApp message"},
    )


@app.post("/api/notify/after-payment")
async def notify_after_payment(payload: Dict[str, Any]):
    order_id = payload.get("order_id")
    project_name = payload.get("project_name")
    customer_name = payload.get("customer_name")
    customer_email = payload.get("customer_email")
    customer_phone = payload.get("customer_phone")

    order = ORDERS.get(order_id) if order_id else None
    payment = PAYMENTS.get(order_id) if order_id else None

    amount = order["amount"] if order else 0.0
    currency = order["currency"] if order else "KES"
    payment_status_value = payment["status"] if payment else "unknown"
    mpesa_receipt = payment.get("mpesa_receipt") if payment else None

    customer_email_sent = False
    if customer_email:
        try:
            send_email(
                to_email=customer_email,
                subject=f"Invoice for {project_name or 'your project'}",
                html_body=f"""
                <h2>Thank you, {customer_name or 'Customer'}</h2>
                <p>Your payment for project <strong>{project_name or order_id}</strong> has been recorded.</p>
                <p><strong>Order ID:</strong> {order_id or 'N/A'}</p>
                <p><strong>Amount:</strong> {amount:.2f} {currency}</p>
                <p><strong>Status:</strong> {payment_status_value}</p>
                <p><strong>Mpesa Receipt:</strong> {mpesa_receipt or 'N/A'}</p>
                """,
            )
            customer_email_sent = True
        except Exception:
            logger.exception("Failed to send customer email")

    company_email_sent = False
    try:
        send_email(
            to_email=COMPANY_EMAIL,
            subject=f"[PANELPRO JOB] {project_name or order_id or 'New Job'}",
            html_body=f"""
            <h2>New Cutting Job Paid</h2>
            <p><strong>Project:</strong> {project_name or 'N/A'}</p>
            <p><strong>Customer:</strong> {customer_name or 'N/A'}</p>
            <p><strong>Customer Email:</strong> {customer_email or 'N/A'}</p>
            <p><strong>Customer Phone:</strong> {customer_phone or 'N/A'}</p>
            <p><strong>Order ID:</strong> {order_id or 'N/A'}</p>
            <p><strong>Amount:</strong> {amount:.2f} {currency}</p>
            <p><strong>Status:</strong> {payment_status_value}</p>
            <p><strong>Mpesa Receipt:</strong> {mpesa_receipt or 'N/A'}</p>
            """,
        )
        company_email_sent = True
    except Exception:
        logger.exception("Failed to send company email")

    whatsapp_sid = None
    if customer_phone:
        whatsapp_sid = send_whatsapp_message(
            customer_phone,
            (
                f"PanelPro: Payment received for project '{project_name or order_id}'. "
                f"Amount: {amount:.2f} {currency}. "
                f"Status: {payment_status_value}. "
                f"Mpesa Receipt: {mpesa_receipt or 'N/A'}"
            ),
        )

    return {
        "status": "ok",
        "message": "Notifications processed.",
        "customer_email_sent": customer_email_sent,
        "company_email_sent": company_email_sent,
        "whatsapp_sid": whatsapp_sid,
    }
