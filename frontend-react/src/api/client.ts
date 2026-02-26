import type {
  BoardCatalog,
  CuttingRequest,
  CuttingResponse,
  OrderResponse,
  PaymentStatus,
  BackendCuttingRequest,
} from '../types';

// Backend base URL
// You can override with Vite env: VITE_API_BASE="https://your-ngrok-url"
const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://127.0.0.1:8000';

/**
 * Convert frontend CuttingRequest shape -> backend CuttingRequest shape.
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
      qty: s.quantity, // backend expects `qty`
    })),

    options: req.options,
    supply: req.supply,
  };
}

/**
 * Generic helper to parse JSON and throw useful error messages.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  const text = await response.text().catch(() => '');

  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text; // not JSON
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
  /** GET /health */
  async checkHealth(): Promise<{ status: string }> {
    const response = await fetch(`${API_BASE}/health`);
    return handleResponse(response);
  },

  /** GET /api/boards/catalog */
  async getBoardCatalog(): Promise<BoardCatalog> {
    const response = await fetch(`${API_BASE}/api/boards/catalog`);
    return handleResponse(response);
  },

  /** POST /api/optimize */
  async optimize(request: CuttingRequest): Promise<CuttingResponse> {
    const backendReq = toBackendCuttingRequest(request);

    const response = await fetch(`${API_BASE}/api/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendReq),
    });
    return handleResponse(response);
  },

  /** POST /api/order/create */
  async createOrder(request: CuttingRequest): Promise<OrderResponse> {
    const backendReq = toBackendCuttingRequest(request);

    const response = await fetch(`${API_BASE}/api/order/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendReq),
    });
    return handleResponse(response);
  },

  /** POST /api/mpesa/initiate */
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

  /** GET /api/payment/status?order_id=... */
  async getPaymentStatus(orderId: string): Promise<PaymentStatus> {
    const response = await fetch(
      `${API_BASE}/api/payment/status?order_id=${encodeURIComponent(orderId)}`,
    );
    return handleResponse(response);
  },

  /** POST /api/notify/after-payment */
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
    // best-effort; ignore body
    await handleResponse<unknown>(response).catch(() => undefined);
  },
};