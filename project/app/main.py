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
from app.whatsapp_utils import send_whatsapp_message

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
# CORS
# ---------------------------------------------------------------------------

_allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if _allowed_origins_env:
    _origins = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
else:
    _origins = ["*"]  # dev default; override with ALLOWED_ORIGINS in production

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Logging middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def log_requests(request: Request, call_next):
    route_id = f"{request.method} {request.url.path}"
    logger.info("➡ %s", route_id)

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
# Validation error handler
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


# ---------------------------------------------------------------------------
# In-memory stores (demo only)
# ---------------------------------------------------------------------------

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
                material_amount=0.0,  # detailed per-panel price is in pricing.panel_boq
            )
        )

    # Compute client vs factory boards for BOQ display (simple: only one global board here)
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
        edging=edgeging_summary if False else edging_summary,  # always uses edging_summary
        boq=boq,
        report_id=report_id,
    )


# ---------------------------------------------------------------------------
# ORDER CREATION
# ---------------------------------------------------------------------------


@app.post("/api/order/create")
async def order_create(req: CuttingRequest):
    """
    Create an order and calculate the payable amount.
    Frontend calls this before initiating M-Pesa.
    """
    logger.info(
        "Creating order for project=%s customer=%s",
        req.project_name,
        req.customer_name,
    )

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
    PAYMENTS[order_id] = {
        "status": "pending",
    }

    return {
        "order_id": order_id,
        "amount": pricing.total,
        "currency": pricing.currency,
        "status": "created",
    }


# ---------------------------------------------------------------------------
# M-PESA
# ---------------------------------------------------------------------------


@app.post("/api/mpesa/initiate")
async def mpesa_initiate_endpoint(payload: Dict[str, Any]):
    logger.info("Received /api/mpesa/initiate payload=%s", payload)

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
    logger.info("Daraja response: %s", resp)

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
    else:
        reason = (
            resp.get("errorMessage")
            or resp.get("ResponseDescription")
            or "Unknown error"
        )
        PAYMENTS[order_id] = {
            "status": "failed",
            "status_reason": reason,
        }
        return {
            "status": "failed",
            "message": reason,
        }


@app.post("/api/mpesa/callback")
async def mpesa_callback(request: Request):
    data = await request.json()
    logger.info("Received /api/mpesa/callback: %s", data)

    try:
        stk = data["Body"]["stkCallback"]
        checkout_id = stk["CheckoutRequestID"]
        result_code = stk["ResultCode"]
        result_desc = stk["ResultDesc"]
    except KeyError:
        logger.warning("Malformed callback payload: %s", data)
        return {"ResultCode": 1, "ResultDesc": "Invalid callback payload"}

    order_id = PENDING_CHECKOUT.pop(checkout_id, None)
    if not order_id:
        logger.warning("Callback for unknown CheckoutRequestID=%s", checkout_id)
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
        PAYMENTS[order_id] = {
            "status": "failed",
            "status_reason": result_desc,
        }

    return {"ResultCode": 0, "ResultDesc": "OK"}


@app.get("/api/payment/status")
async def payment_status(order_id: str = Query(...)):
    logger.info("Checking payment status for order_id=%s", order_id)
    data = PAYMENTS.get(order_id)
    if not data:
        return {"status": "pending"}
    return data


# ---------------------------------------------------------------------------
# EMAIL / WHATSAPP TEST ENDPOINTS
# ---------------------------------------------------------------------------


@app.post("/api/test-email")
async def test_email(to: str = Query(..., description="Destination email")):
    logger.info("Sending test email to %s", to)
    subject = "PanelPro test email"
    html = "<h1>PanelPro Email Test</h1><p>If you see this, email is working.</p>"

    try:
        send_email(to_email=to, subject=subject, html_body=html)
        return {"status": "sent", "to": to}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to send test email: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": str(exc)},
        )


@app.post("/api/test-whatsapp")
async def test_whatsapp(
    phone: str = Query(..., description="Customer phone, e.g. 2547xxxxxxx"),
):
    logger.info("Sending test WhatsApp to %s", phone)
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


# ---------------------------------------------------------------------------
# NOTIFY AFTER PAYMENT
# ---------------------------------------------------------------------------


@app.post("/api/notify/after-payment")
async def notify_after_payment(payload: Dict[str, Any]):
    """
    Called by frontend after payment success (demo or real).

    Frontend sends:
      {
        "order_id": "...",
        "project_name": "...",
        "customer_name": "...",
        "customer_email": "...",
        "customer_phone": "..."
      }

    Behaviour:
      - Send a confirmation/invoice email to the customer_email.
      - Send a job summary email to COMPANY_EMAIL.
      - Send a WhatsApp notification to customer_phone.
    """
    logger.info("notify_after_payment payload=%s", payload)

    order_id: str | None = payload.get("order_id")
    project_name: str | None = payload.get("project_name")
    customer_name: str | None = payload.get("customer_name")
    customer_email: str | None = payload.get("customer_email")
    customer_phone: str | None = payload.get("customer_phone")

    order = ORDERS.get(order_id) if order_id else None
    payment = PAYMENTS.get(order_id) if order_id else None

    amount = order["amount"] if order else 0.0
    currency = order["currency"] if order else "KES"
    payment_status = payment["status"] if payment else "unknown"
    mpesa_receipt = payment.get("mpesa_receipt") if payment else None

    # 1) Email to customer
    customer_email_sent = False
    if customer_email:
        subject_c = f"Invoice for {project_name or 'your project'}"
        html_c = f"""
        <h2>Thank you, {customer_name or 'Customer'}</h2>
        <p>Your payment for project <strong>{project_name or order_id}</strong> has been recorded.</p>
        <p><strong>Order ID:</strong> {order_id or 'N/A'}</p>
        <p><strong>Amount:</strong> {amount:.2f} {currency}</p>
        <p><strong>Status:</strong> {payment_status}</p>
        <p><strong>Mpesa Receipt:</strong> {mpesa_receipt or 'N/A'}</p>
        """
        try:
            send_email(to_email=customer_email, subject=subject_c, html_body=html_c)
            customer_email_sent = True
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to send customer email: %s", exc)

    # 2) Email to company
    subject_i = f"[PANELPRO JOB] {project_name or order_id or 'New Job'}"
    html_i = f"""
    <h2>New Cutting Job Paid</h2>
    <p><strong>Project:</strong> {project_name or 'N/A'}</p>
    <p><strong>Customer:</strong> {customer_name or 'N/A'}</p>
    <p><strong>Customer Email:</strong> {customer_email or 'N/A'}</p>
    <p><strong>Customer Phone:</strong> {customer_phone or 'N/A'}</p>
    <p><strong>Order ID:</strong> {order_id or 'N/A'}</p>
    <p><strong>Amount:</strong> {amount:.2f} {currency}</p>
    <p><strong>Status:</strong> {payment_status}</p>
    <p><strong>Mpesa Receipt:</strong> {mpesa_receipt or 'N/A'}</p>
    """

    company_email_sent = False
    try:
        send_email(to_email=COMPANY_EMAIL, subject=subject_i, html_body=html_i)
        company_email_sent = True
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to send company email: %s", exc)

    # 3) WhatsApp to customer
    whatsapp_sid = None
    if customer_phone:
        wa_message = (
            f"PanelPro: Payment received for project '{project_name or order_id}'.\n"
            f"Amount: {amount:.2f} {currency}\n"
            f"Status: {payment_status}\n"
            f"Mpesa Receipt: {mpesa_receipt or 'N/A'}"
        )
        whatsapp_sid = send_whatsapp_message(customer_phone, wa_message)

    return {
        "status": "ok",
        "message": "Notifications processed.",
        "customer_email_sent": customer_email_sent,
        "company_email_sent": company_email_sent,
        "whatsapp_sid": whatsapp_sid,
    }