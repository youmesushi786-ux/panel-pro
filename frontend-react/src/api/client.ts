import type {
  BoardCatalog,
  CuttingRequest,
  CuttingResponse,
  OrderResponse,
  PaymentStatus,
  BackendCuttingRequest,
} from '../types';

const envBase =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  undefined;

const API_BASE: string =
  (envBase ? envBase.replace(/\/$/, '') : undefined) ?? 'http://127.0.0.1:8000';

/**
 * Convert frontend request shape -> backend FastAPI request shape
 */
function toBackendCuttingRequest(req: CuttingRequest): BackendCuttingRequest {
  const firstPanelBoard = req.panels[0]?.board;
  if (!firstPanelBoard) {
    throw new Error('No board information found in panels');
  }

  return {
    project_name: req.customer.project_name,
    customer_name: req.customer.customer_name,
    customer_email: req.customer.email,
    customer_phone: req.customer.phone,
    notes: req.customer.notes,

    board: firstPanelBoard,

    panels: req.panels.map((p) => ({
      label: p.label,
      width: p.width,
      length: p.length,
      quantity: p.quantity,
      alignment: p.alignment,
      notes: p.notes,
      edging: p.edging ?? {
        top: false,
        right: false,
        bottom: false,
        left: false,
      },
      board: p.board,
    })),

    stock_sheets: req.stock_sheets.map((s) => ({
      length: s.length,
      width: s.width,
      qty: s.quantity,
    })),

    options: {
      kerf: req.options.kerf,
      labels_on_panels: req.options.labels_on_panels,
      use_single_sheet: req.options.use_single_sheet,
      consider_material: req.options.consider_material,
      edge_banding: req.options.edge_banding,
      consider_grain: req.options.consider_grain,
      allow_rotation: req.options.allow_rotation ?? true,
      strict_validation: req.options.strict_validation ?? true,
      optimization_level: req.options.optimization_level ?? 2,
      strict_production_mode: req.options.strict_production_mode ?? true,
    },

    supply: {
      client_supply: req.supply.client_supply,
      factory_supply: req.supply.factory_supply,
      client_board_qty: req.supply.client_board_qty ?? null,
      client_edging_meters: req.supply.client_edging_meters ?? null,
    } as any,
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  const text = await response.text().catch(() => '');

  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const p = payload as any;
    const msg =
      p?.detail ||
      p?.message ||
      (typeof p === 'string' ? p : '') ||
      `HTTP ${response.status}`;
    throw new Error(msg);
  }

  if (text === '') {
    return undefined as T;
  }

  return payload as T;
}

export const api = {
  async checkHealth(): Promise<{ status: string; version?: string }> {
    const response = await fetch(`${API_BASE}/health`);
    return handleResponse(response);
  },

  async getBoardCatalog(): Promise<BoardCatalog> {
    const response = await fetch(`${API_BASE}/api/boards/catalog`);
    return handleResponse(response);
  },

  async optimize(request: CuttingRequest): Promise<CuttingResponse> {
    const backendReq = toBackendCuttingRequest(request);

    const response = await fetch(`${API_BASE}/api/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendReq),
    });

    return handleResponse(response);
  },

  async createOrder(request: CuttingRequest): Promise<OrderResponse> {
    const backendReq = toBackendCuttingRequest(request);

    const response = await fetch(`${API_BASE}/api/order/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendReq),
    });

    return handleResponse(response);
  },

  async initiateMpesa(
    orderId: string,
    phoneNumber: string,
  ): Promise<{ status: string; message: string; checkout_request_id?: string }> {
    const response = await fetch(`${API_BASE}/api/mpesa/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, phone_number: phoneNumber }),
    });

    return handleResponse(response);
  },

  async getPaymentStatus(orderId: string): Promise<PaymentStatus> {
    const response = await fetch(
      `${API_BASE}/api/payment/status?order_id=${encodeURIComponent(orderId)}`,
    );

    return handleResponse(response);
  },

  async notifyAfterPayment(data: {
    order_id: string;
    project_name: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
  }): Promise<void> {
    const response = await fetch(`${API_BASE}/api/notify/after-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    await handleResponse<unknown>(response).catch(() => undefined);
  },
};
