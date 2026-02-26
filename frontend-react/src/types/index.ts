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
  client_boards?: number;
  client_edging?: number;
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

/**
 * Frontend shape used in the React app.
 */
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

/**
 * Shape expected by the FastAPI backend.
 * We convert from `CuttingRequest` to this before sending.
 */
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
    board?: BoardSelection; // optional per‑panel override
  }>;

  stock_sheets: Array<{
    length: number;
    width: number;
    qty: number; // matches backend `qty`
  }>;

  options: OptimizationOptions;
  supply: SupplyMode;
}

export interface PlacedPanel {
  label: string;
  width: number;
  length: number;
  x: number;
  y: number;
  rotated: boolean;
  board_id: number;
}

export interface Cut {
  type: string;
  position: number;
  start: number;
  end: number;
}

export interface Layout {
  board_id: number;
  board_width: number;
  board_length: number;
  panels: PlacedPanel[];
  cuts: Cut[];
  used_area: number;
  waste_area: number;
  efficiency: number;
}

export interface BOQItem {
  item_number: number;
  description: string;
  size: string;
  quantity: number;
  unit: string;
  edges: string;
}

export interface PricingLine {
  item: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
}

export interface CuttingResponse {
  optimization: {
    total_boards_used: number;
    total_panels: number;
    total_used_area: number;
    total_waste_area: number;
    overall_efficiency: number;
    total_edging_meters: number;
    total_cuts: number;
    total_cut_length: number;
  };
  layouts: Layout[];
  edging: {
    total_meters: number;
    by_edge: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  };
  boq: {
    items: BOQItem[];
    materials: Array<{
      board_type: string;
      board_company: string;
      board_color: string;
      board_size: string;
      boards_required: number;
      supplied_by: string;
    }>;
    services: Array<{
      service: string;
      quantity: number;
      unit: string;
      unit_price: number;
      amount: number;
    }>;
  };
  pricing: {
    lines: PricingLine[];
    subtotal: number;
    tax_name: string;
    tax_rate: number;
    tax_amount: number;
    total: number;
  };
  report_id: string;
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