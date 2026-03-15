from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator


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


class BoardSelection(BaseModel):
    core_type: CoreType
    thickness_mm: ThicknessMM
    company: str = Field(min_length=1, max_length=100)
    color_code: str = Field(min_length=1, max_length=100)
    color_name: str = Field(min_length=1, max_length=100)
    color_hex: Optional[str] = Field(default=None, max_length=20)


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
    board: Optional[BoardSelection] = None

    @property
    def area_mm2(self) -> float:
        return self.width * self.length

    @property
    def total_area_mm2(self) -> float:
        return self.area_mm2 * self.quantity

    @property
    def edge_length_mm(self) -> float:
        total = 0.0
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
    client_edging_meters: Optional[float] = Field(default=None, ge=0, le=10000)

    @model_validator(mode="after")
    def check_mode(self) -> "SupplyMode":
        if self.client_supply and self.factory_supply:
            raise ValueError("Only one of client_supply or factory_supply can be true")
        if not self.client_supply and not self.factory_supply:
            raise ValueError("Either client_supply or factory_supply must be true")
        if self.client_supply and (self.client_board_qty is None or self.client_board_qty <= 0):
            raise ValueError("client_board_qty is required when client_supply is true")
        return self


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
    allow_rotation: bool = True
    prefer_fewer_boards: bool = True
    prefer_less_waste: bool = True
    generate_cuts: bool = False
    reuse_offcuts: bool = False
    strict_validation: bool = True
    optimization_level: int = Field(default=2, ge=1, le=5)
    strict_production_mode: bool = True


class CuttingRequest(BaseModel):
    panels: List[PanelDetail] = Field(min_length=1)
    board: BoardSelection
    supply: SupplyMode
    stock_sheets: Optional[List[StockSheet]] = None
    options: Optional[Options] = None
    board_width_mm: Optional[float] = Field(default=None, gt=0, le=5000)
    board_length_mm: Optional[float] = Field(default=None, gt=0, le=5000)
    project_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    notes: Optional[str] = None

    @property
    def kerf_mm(self) -> float:
        return self.options.kerf if self.options else 3.0

    @property
    def consider_grain(self) -> bool:
        return self.options.consider_grain if self.options else False

    @property
    def strict_production_mode(self) -> bool:
        return self.options.strict_production_mode if self.options else True

    @property
    def effective_board_width_mm(self) -> Optional[float]:
        if self.board_width_mm is not None:
            return self.board_width_mm
        if self.stock_sheets and len(self.stock_sheets) == 1:
            return self.stock_sheets[0].width
        return None

    @property
    def effective_board_length_mm(self) -> Optional[float]:
        if self.board_length_mm is not None:
            return self.board_length_mm
        if self.stock_sheets and len(self.stock_sheets) == 1:
            return self.stock_sheets[0].length
        return None


class PlacedPanel(BaseModel):
    panel_index: int
    x: float
    y: float
    width: float
    length: float
    label: Optional[str] = None
    rotated: bool = False
    grain_aligned: Optional[GrainAlignment] = None
    board_number: Optional[int] = None


class CutSegment(BaseModel):
    id: int
    orientation: str
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
    total_used_area_mm2: float = 0.0
    overall_efficiency_percent: float = 0.0
    kerf_mm: float = 0.0
    grain_considered: bool = False
    material_groups: int = 1
    impossible_panels: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class EdgingDetail(BaseModel):
    panel_label: str
    quantity: int
    edge_per_panel_m: float
    total_edge_m: float
    edges_applied: str


class EdgingSummary(BaseModel):
    total_meters: float
    details: List[EdgingDetail]


class StickerLabel(BaseModel):
    serial_no: str
    panel_label: str
    width_mm: float
    length_mm: float
    quantity_index: int
    board_number: Optional[int] = None
    core_type: Optional[str] = None
    thickness_mm: Optional[int] = None
    company: Optional[str] = None
    colour: Optional[str] = None
    edges: str
    grain_alignment: Optional[str] = None
    logo_url: Optional[str] = None
    company_name: Optional[str] = None


class StickerSheet(BaseModel):
    total_labels: int
    labels: List[StickerLabel]


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
    panel_boq: List[PanelBoqLine] = Field(default_factory=list)


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


class CuttingResponse(BaseModel):
    request_summary: Dict[str, Any]
    optimization: OptimizationSummary
    layouts: List[BoardLayout]
    edging: EdgingSummary
    stickers: StickerSheet
    boq: BOQSummary
    report_id: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class HealthResponse(BaseModel):
    status: str = "healthy"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    version: str = "2.3.0-sync"
