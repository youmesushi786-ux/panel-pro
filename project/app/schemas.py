"""Pydantic schemas for panel cutting optimizer."""

from __future__ import annotations

from typing import List, Optional, Dict, Any
from datetime import datetime

from pydantic import BaseModel, Field, model_validator
from enum import Enum


# -------- Enums --------


class GrainAlignment(str, Enum):
    none = "none"
    horizontal = "horizontal"
    vertical = "vertical"


class CoreType(str, Enum):
    plywood = "plywood"
    mdf = "mdf"
    chipboard = "chipboard"
    waterproof = "waterproof"


class ThicknessMM(int, Enum):
    t3 = 3
    t6 = 6
    t9 = 9
    t12 = 12
    t18 = 18


# -------- Board Selection --------


class BoardSelection(BaseModel):
    core_type: CoreType
    thickness_mm: ThicknessMM
    company: str
    color_code: str
    color_name: str
    color_hex: Optional[str] = None


# -------- Request Models --------


class EdgingSpec(BaseModel):
    left: bool = False
    right: bool = False
    top: bool = False
    bottom: bool = False


class PanelDetail(BaseModel):
    width: float = Field(gt=0, le=5000)
    length: float = Field(gt=0, le=5000)
    quantity: int = Field(gt=0, le=500)
    edging: EdgingSpec = Field(default_factory=EdgingSpec)
    alignment: GrainAlignment = GrainAlignment.none
    label: Optional[str] = None
    notes: Optional[str] = None
    board: Optional[BoardSelection] = None  # per-panel board override

    @property
    def area_mm2(self) -> float:
        return self.width * self.length

    @property
    def total_area_mm2(self) -> float:
        return self.area_mm2 * self.quantity

    @property
    def edge_length_mm(self) -> float:
        total = 0
        if self.edging.left:
            total += self.length
        if self.edging.right:
            total += self.length
        if self.edging.top:
            total += self.width
        if self.edging.bottom:
            total += self.width
        return total

    @property
    def total_edge_length_mm(self) -> float:
        return self.edge_length_mm * self.quantity

    def get_effective_board(self, default_board: BoardSelection) -> BoardSelection:
        return self.board or default_board


class SupplyMode(BaseModel):
    client_supply: bool = False
    factory_supply: bool = True
    client_board_qty: Optional[int] = Field(default=None, ge=1, le=100)
    client_edging_meters: Optional[float] = Field(
        default=None,
        ge=0,
        le=10000,
        description="Meters of edging supplied by client (for labour charging).",
    )

    @model_validator(mode="after")
    def check_mode(cls, v: "SupplyMode") -> "SupplyMode":
        if v.client_supply and v.factory_supply:
            raise ValueError("Only one of client_supply or factory_supply can be true")
        if not v.client_supply and not v.factory_supply:
            raise ValueError("Either client_supply or factory_supply must be true")

        if v.client_supply and (v.client_board_qty is None or v.client_board_qty <= 0):
            raise ValueError("client_board_qty is required when client_supply is true")
        return v


class StockSheet(BaseModel):
    length: float = Field(gt=0, le=5000)
    width: float = Field(gt=0, le=5000)
    qty: int = Field(gt=0, le=1000)


class Options(BaseModel):
    kerf: float = Field(default=3.0, ge=0, le=10)
    labels_on_panels: bool = False
    use_single_sheet: bool = False
    consider_material: bool = False
    edge_banding: bool = True
    consider_grain: bool = False


class CuttingRequest(BaseModel):
    panels: List[PanelDetail]
    board: BoardSelection
    supply: SupplyMode

    stock_sheets: Optional[List[StockSheet]] = None
    options: Optional[Options] = None

    project_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    notes: Optional[str] = None


# -------- Layout & Stats Models --------


class PlacedPanel(BaseModel):
    panel_index: int
    x: float
    y: float
    width: float
    length: float
    label: Optional[str] = None


class CutSegment(BaseModel):
    id: int
    orientation: str  # "H" or "V"
    x1: float
    y1: float
    x2: float
    y2: float
    length: float


class BoardLayout(BaseModel):
    board_number: int
    board_width: float
    board_length: float
    used_area_mm2: float
    waste_area_mm2: float
    efficiency_percent: float
    panel_count: int
    panels: List[PlacedPanel]
    cuts: List[CutSegment] = Field(default_factory=list)


class OptimizationSummary(BaseModel):
    total_boards: int
    total_panels: int
    unique_panel_types: int
    total_edging_meters: float
    total_cuts: int
    total_cut_length: float
    total_waste_mm2: float
    total_waste_percent: float
    board_width: float
    board_length: float


# -------- Edging Models --------


class EdgingDetail(BaseModel):
    panel_label: str
    quantity: int
    edge_per_panel_m: float
    total_edge_m: float
    edges_applied: str


class EdgingSummary(BaseModel):
    total_meters: float
    details: List[EdgingDetail]


# -------- Pricing & BOQ Models --------


class PricingLine(BaseModel):
    item: str
    description: str
    quantity: float
    unit: str
    unit_price: float
    amount: float


class PanelBoqLine(BaseModel):
    label: Optional[str]
    core_type: str
    thickness_mm: int
    company: str
    colour: str
    quantity: int
    area_m2: float
    material_amount: float


class PricingSummary(BaseModel):
    lines: List[PricingLine]
    subtotal: float
    tax_name: str
    tax_rate: float
    tax_amount: float
    total: float
    currency: str
    supplied_by: str
    panel_boq: List[PanelBoqLine] = []


class BOQItem(BaseModel):
    item_no: int
    description: str
    size: str
    quantity: int
    unit: str
    edges: str

    core_type: Optional[str] = None
    thickness_mm: Optional[int] = None
    company: Optional[str] = None
    colour: Optional[str] = None
    material_amount: Optional[float] = None


class BOQSummary(BaseModel):
    project_name: Optional[str]
    customer_name: Optional[str]
    date: str
    items: List[BOQItem]
    materials: Dict[str, Any]
    services: Dict[str, Any]
    pricing: PricingSummary


# -------- Top-level Response --------


class CuttingResponse(BaseModel):
    request_summary: Dict[str, Any]
    optimization: OptimizationSummary
    layouts: List[BoardLayout]
    edging: EdgingSummary
    boq: BOQSummary
    report_id: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class HealthResponse(BaseModel):
    status: str = "healthy"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    version: str = "1.0.0"