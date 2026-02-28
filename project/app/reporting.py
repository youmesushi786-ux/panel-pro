# project/app/reporting.py
from __future__ import annotations

from io import BytesIO
from typing import Any, Optional

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

from app.schemas import CuttingResponse


def generate_report_pdf(
    cutting: CuttingResponse,
    order_id: Optional[str],
    payment: Optional[dict[str, Any]] = None,
) -> bytes:
    """
    Generate a simple PDF report with:
      - Project & customer info
      - Optimization summary
      - BOQ summary
      - Basic board layouts listing
      - Payment/Mpesa info
    Returns the PDF as bytes.
    """
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 40
    y = height - margin

    def line(text: str = "", bold: bool = False, size: int = 10):
        nonlocal y
        if y < margin + 40:  # new page if near bottom
            c.showPage()
            c.setFont("Helvetica", size)
            y = height - margin
        font_name = "Helvetica-Bold" if bold else "Helvetica"
        c.setFont(font_name, size)
        c.drawString(margin, y, text)
        y -= 14

    # Header
    line("PanelPro Optimization Report", bold=True, size=16)
    line()

    # Meta
    rs = cutting.request_summary or {}
    boq = cutting.boq
    opt = cutting.optimization

    line(f"Project: {boq.project_name or rs.get('project_name') or 'N/A'}", bold=True)
    line(f"Customer: {boq.customer_name or rs.get('customer_name') or 'N/A'}")
    line(f"Report ID: {cutting.report_id}")
    if order_id:
        line(f"Order ID: {order_id}")
    line(f"Generated at: {cutting.generated_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    line()

    # Payment
    if payment:
        line("Payment", bold=True, size=12)
        line(f"Status: {payment.get('status', 'unknown')}")
        amount = payment.get("amount")
        currency = rs.get("currency", "KES")
        if amount is not None:
            line(f"Amount: {amount} {currency}")
        mpesa_receipt = payment.get("mpesa_receipt")
        if mpesa_receipt:
            line(f"Mpesa Receipt: {mpesa_receipt}")
        phone = payment.get("phone")
        if phone:
            line(f"Phone: {phone}")
        line()

    # Optimization summary
    line("Optimization Summary", bold=True, size=12)
    line(f"Total boards: {opt.total_boards}")
    line(f"Total panels: {opt.total_panels}")
    line(
        f"Total waste: {opt.total_waste_mm2 / 1_000_000:.2f} m² "
        f"({opt.total_waste_percent:.1f}%)"
    )
    line(f"Board size: {opt.board_width} x {opt.board_length} mm")
    line()

    # Pricing summary
    line("Pricing Summary", bold=True, size=12)
    line(
        f"Subtotal: {boq.pricing.subtotal:.2f} {boq.pricing.currency} "
        f"({boq.pricing.supplied_by})"
    )
    line(
        f"{boq.pricing.tax_name}: {boq.pricing.tax_amount:.2f} "
        f"({boq.pricing.tax_rate * 100:.0f}%)"
    )
    line(f"Total: {boq.pricing.total:.2f} {boq.pricing.currency}")
    line()

    # BOQ items
    line("BOQ Items", bold=True, size=12)
    for item in boq.items:
        line(
            f"{item.item_no}. {item.description} | {item.size} | "
            f"Qty: {item.quantity} {item.unit} | Edges: {item.edges}"
        )
    line()

    # Board layouts
    line("Board Layouts", bold=True, size=12)
    for layout in cutting.layouts:
        line(
            f"Board {layout.board_number}: "
            f"{layout.board_width} x {layout.board_length} mm | "
            f"Panels: {layout.panel_count} | "
            f"Waste: {layout.waste_area_mm2 / 1_000_000:.2f} m² "
            f"({layout.efficiency_percent:.1f}% used)"
        )
        for p in layout.panels:
            line(
                f"  - {p.label or 'Panel'}: {p.width} x {p.length} mm "
                f"@ ({p.x}, {p.y})"
            )
        line()

    c.showPage()
    c.save()
    return buffer.getvalue()