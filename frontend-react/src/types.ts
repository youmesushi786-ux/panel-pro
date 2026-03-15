export interface Panel {
  id: string;
  label: string;
  width: number;
  length: number;
  quantity: number;
  alignment: 'none' | 'horizontal' | 'vertical';
  notes: string;
  board: BoardSelection;
  edges: PanelEdges;
}

export interface BoardSelection {
  core_type: string;
  thickness_mm: number;
  company: string;
  color_code: string;
  color_name: string;
  color_hex: string;
}

export interface PanelEdges {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface StockSheet {
  id: string;
  length: number;
  width: number;
  quantity: number;
}

export interface OptimizationOptions {
  kerf: number;
  labels_on_panels: boolean;
  use_single_sheet: boolean;
  consider_material: boolean;
  edge_banding: boolean;
  consider_grain: boolean;
  allow_rotation?: boolean;
  strict_validation?: boolean;
  optimization_level?: number;
  strict_production_mode?: boolean;
}

export interface CustomerDetails {
  project_name: string;
  customer_name: string;
  email: string;
  phone: string;
  notes: string;
}

export interface SupplyMode {
  factory_supply: boolean;
  client_supply: boolean;
  client_board_qty?: number;
  client_edging_meters?: number;
}

export interface BoardCatalog {
  catalog: {
    [core: string]: {
      thicknesses: number[];
      companies: string[];
    };
  };
  price_table: {
    [key: string]: number;
  };
  colors: {
    [company: string]: Array<{
      code: string;
      name: string;
      hex: string;
    }>;
  };
}

export interface CuttingRequest {
  panels: Array<{
    label: string;
    width: number;
    length: number;
    quantity: number;
    alignment?: string;
    notes?: string;
    board: BoardSelection;
    edging?: PanelEdges;
  }>;
  stock_sheets: Array<{
    length: number;
    width: number;
    quantity: number;
  }>;
  options: OptimizationOptions;
  supply: SupplyMode;
  customer: CustomerDetails;
}

export interface BackendCuttingRequest {
  project_name: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  notes?: string;

  board: BoardSelection;

  panels: Array<{
    label: string;
    width: number;
    length: number;
    quantity: number;
    alignment?: string;
    notes?: string;
    edging: PanelEdges;
    board?: BoardSelection;
  }>;

  stock_sheets: Array<{
    length: number;
    width: number;
    qty: number;
  }>;

  options: OptimizationOptions;
  supply: SupplyMode;
}

export interface PlacedPanel {
  panel_index: number;
  label?: string;
  width: number;
  length: number;
  x: number;
  y: number;
  rotated?: boolean;
  board_number?: number;
  grain_aligned?: string | null;
}

export interface Cut {
  id?: number;
  orientation?: string;
  type?: string;
  position?: number;
  start?: number;
  end?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  length?: number;
}

export interface Layout {
  board_number: number;
  board_width: number;
  board_length: number;
  panels: PlacedPanel[];
  cuts: Cut[];
  used_area_mm2: number;
  waste_area_mm2: number;
  efficiency_percent: number;
  panel_count: number;
}

export interface BOQItem {
  item_no: number;
  description: string;
  size: string;
  quantity: number;
  unit: string;
  edges: string;
  core_type?: string;
  thickness_mm?: number;
  company?: string;
  colour?: string;
  material_amount?: number;
}

export interface PricingLine {
  item: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
}

export interface StickerLabel {
  serial_no: string;
  panel_label: string;
  width_mm: number;
  length_mm: number;
  quantity_index: number;
  board_number?: number | null;
  core_type?: string | null;
  thickness_mm?: number | null;
  company?: string | null;
  colour?: string | null;
  edges: string;
  grain_alignment?: string | null;
  logo_url?: string | null;
  company_name?: string | null;
}

export interface StickerSheet {
  total_labels: number;
  labels: StickerLabel[];
}

export interface CuttingResponse {
  request_summary: {
    project_name?: string;
    customer_name?: string;
    total_panels: number;
  };
  optimization: {
    total_boards: number;
    total_panels: number;
    unique_panel_types: number;
    total_edging_meters: number;
    total_cuts: number;
    total_cut_length: number;
    total_waste_mm2: number;
    total_waste_percent: number;
    board_width: number;
    board_length: number;
    total_used_area_mm2: number;
    overall_efficiency_percent: number;
    kerf_mm?: number;
    grain_considered?: boolean;
    material_groups?: number;
    impossible_panels?: string[];
    warnings?: string[];
  };
  layouts: Layout[];
  edging: {
    total_meters: number;
    details: Array<{
      panel_label: string;
      quantity: number;
      edge_per_panel_m: number;
      total_edge_m: number;
      edges_applied: string;
    }>;
  };
  stickers: StickerSheet;
  boq: {
    project_name?: string;
    customer_name?: string;
    date: string;
    items: BOQItem[];
    materials: {
      board_type: string;
      board_company: string;
      board_color: string;
      board_size: string;
      boards_required: number;
      boards_client?: number;
      boards_factory?: number;
      supplied_by: string;
    };
    services: {
      cutting: {
        boards: number;
        price_per_board: number;
        total: number;
      };
      edging: {
        meters: number;
        price_per_meter: number;
        total: number;
      };
    };
    pricing: {
      lines: PricingLine[];
      subtotal: number;
      tax_name: string;
      tax_rate: number;
      tax_amount: number;
      total: number;
      currency: string;
      supplied_by: string;
      panel_boq: Array<{
        label?: string;
        core_type: string;
        thickness_mm: number;
        company: string;
        colour: string;
        quantity: number;
        area_m2: number;
        material_amount: number;
      }>;
    };
  };
  report_id: string;
  generated_at: string;
}

export interface OrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface PaymentStatus {
  status: 'pending' | 'paid' | 'failed';
  mpesa_receipt?: string;
  status_reason?: string;
}
