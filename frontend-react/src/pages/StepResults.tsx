import { useState, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import type { CuttingResponse, PlacedPanel } from '../types';
import { api } from '../api/client';

// Demo flag: when true, payment always succeeds on the frontend
// and unlocks the layouts without calling real M‑Pesa.
const DEMO_PAYMENT_MODE = true;

interface StepResultsProps {
  results: CuttingResponse | null;
  onBack: () => void;
  customerEmail: string;
  customerPhone: string;
  customerName: string;
  projectName: string;
}

export function StepResults({
  results,
  onBack,
  customerEmail,
  customerPhone,
  customerName,
  projectName,
}: StepResultsProps) {
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [hoveredPanel, setHoveredPanel] = useState<PlacedPanel | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [orderId, setOrderId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<
    'idle' | 'processing' | 'paid' | 'failed'
  >('idle');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [hasPaid, setHasPaid] = useState(false); // controls access to layouts & optimization

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // Re-draw whenever layout‑related state changes
  useEffect(() => {
    if (results && canvasRef.current && hasPaid) {
      drawLayout();
    }
  }, [currentSheetIndex, zoom, hoveredPanel, results, hasPaid]);

  const drawLayout = () => {
    if (!results || !canvasRef.current || !hasPaid) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const layout = results.layouts[currentSheetIndex];
    if (!layout) return;

    const padding = 40;
    const availableWidth = canvas.width - padding * 2;
    const availableHeight = canvas.height - padding * 2;

    const scaleX = availableWidth / layout.board_width;
    const scaleY = availableHeight / layout.board_length;
    const scale = Math.min(scaleX, scaleY) * zoom;

    const offsetX = (canvas.width - layout.board_width * scale) / 2;
    const offsetY = (canvas.height - layout.board_length * scale) / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Board outline
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 3;
    ctx.strokeRect(
      offsetX,
      offsetY,
      layout.board_width * scale,
      layout.board_length * scale,
    );
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(
      offsetX,
      offsetY,
      layout.board_width * scale,
      layout.board_length * scale,
    );

    // Panels
    layout.panels.forEach((panel) => {
      const x = offsetX + panel.x * scale;
      const y = offsetY + panel.y * scale;
      const w = panel.width * scale;
      const h = panel.length * scale;

      const isHovered =
        hoveredPanel?.label === panel.label &&
        hoveredPanel?.x === panel.x &&
        hoveredPanel?.y === panel.y;

      ctx.fillStyle = isHovered ? '#fed7aa' : '#fdba74';
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = isHovered ? '#ea580c' : '#f97316';
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = '#1f2937';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.font = `${Math.max(10, 12 * zoom)}px Inter, sans-serif`;
      ctx.fillText(panel.label, x + w / 2, y + h / 2 - 8 * zoom);

      ctx.font = `${Math.max(8, 10 * zoom)}px Inter, sans-serif`;
      ctx.fillText(
        `${panel.width} × ${panel.length}`,
        x + w / 2,
        y + h / 2 + 8 * zoom,
      );
    });
  };

  const handleCanvasHover = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!results || !canvasRef.current || !hasPaid) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const layout = results.layouts[currentSheetIndex];
    if (!layout) return;

    const padding = 40;
    const availableWidth = canvas.width - padding * 2;
    const availableHeight = canvas.height - padding * 2;

    const scaleX = availableWidth / layout.board_width;
    const scaleY = availableHeight / layout.board_length;
    const scale = Math.min(scaleX, scaleY) * zoom;

    const offsetX = (canvas.width - layout.board_width * scale) / 2;
    const offsetY = (canvas.height - layout.board_length * scale) / 2;

    let found = false;
    for (const panel of layout.panels) {
      const x = offsetX + panel.x * scale;
      const y = offsetY + panel.y * scale;
      const w = panel.width * scale;
      const h = panel.length * scale;

      if (mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h) {
        setHoveredPanel(panel);
        found = true;
        break;
      }
    }

    if (!found) {
      setHoveredPanel(null);
    }
  };

  const handlePayment = async () => {
    if (!mpesaPhone || !results) return;

    // DEMO: simulate a successful payment, but still call backend
    // notifyAfterPayment so invoices/BOQ are actually generated and sent.
    if (DEMO_PAYMENT_MODE) {
      const demoOrderId = 'DEMO_' + Date.now();
      setOrderId(demoOrderId);
      setPaymentStatus('processing');
      setPaymentMessage(
        'Simulated payment... sending test invoice and BOQ via backend.',
      );

      try {
        await api.notifyAfterPayment({
          order_id: demoOrderId,
          project_name: projectName,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
        });

        setPaymentStatus('paid');
        setHasPaid(true);
        setReceiptNumber('DEMO-RECEIPT');
        setPaymentMessage(
          'Demo payment successful. Test invoice and BOQ have been sent.',
        );
      } catch (error) {
        console.error('notifyAfterPayment failed in demo mode:', error);
        setPaymentStatus('failed');
        setPaymentMessage(
          'Demo payment failed: could not trigger after-payment notifications.',
        );
      }

      return;
    }

    // REAL FLOW (for production, if you disable demo mode)
    try {
      setPaymentStatus('processing');
      setPaymentMessage('Creating order...');

      const newOrderId = 'ORDER_' + Date.now();
      setOrderId(newOrderId);

      const mpesaResponse = await api.initiateMpesa(newOrderId, mpesaPhone);
      setPaymentMessage(mpesaResponse.message);

      // Clear any existing pollers / timeouts
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Start polling for payment status
      pollIntervalRef.current = window.setInterval(async () => {
        try {
          const status = await api.getPaymentStatus(newOrderId);

          if (status.status === 'paid') {
            setPaymentStatus('paid');
            setHasPaid(true); // unlock layouts after real payment
            setReceiptNumber(status.mpesa_receipt || '');
            setPaymentMessage('Payment successful!');

            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }

            await api.notifyAfterPayment({
              order_id: newOrderId,
              project_name: projectName,
              customer_name: customerName,
              customer_email: customerEmail,
              customer_phone: customerPhone,
            });
          } else if (status.status === 'failed') {
            setPaymentStatus('failed');
            setPaymentMessage(status.status_reason || 'Payment failed');

            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        } catch (error) {
          console.error('Payment status check failed:', error);
        }
      }, 3000);

      // Hard timeout after 2 minutes
      timeoutRef.current = window.setTimeout(() => {
        if (paymentStatus === 'processing') {
          setPaymentStatus('failed');
          setPaymentMessage('Payment timeout');
        }
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }, 120000);
    } catch (error) {
      setPaymentStatus('failed');
      setPaymentMessage(error instanceof Error ? error.message : 'Payment failed');
    }
  };

  // Cleanup timers when component unmounts
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!results) {
    return (
      <div className="p-6">
        <Card>
          <p className="text-center text-gray-500 py-8">
            No results available. Please complete Step 1 first.
          </p>
          <div className="flex justify-center mt-4">
            <Button onClick={onBack}>Go Back to Step 1</Button>
          </div>
        </Card>
      </div>
    );
  }

  const layout = results.layouts[currentSheetIndex];

  // Per‑sheet used/waste areas (backend: used_area_mm2 / waste_area_mm2)
  const usedAreaMm2 =
    ((layout as any).used_area_mm2 ??
      (layout as any).used_area ??
      0) as number;
  const wasteAreaMm2 =
    ((layout as any).waste_area_mm2 ??
      (layout as any).waste_area ??
      0) as number;
  const boardTotalAreaMm2 = usedAreaMm2 + wasteAreaMm2;
  const boardWastePercent =
    boardTotalAreaMm2 > 0
      ? (wasteAreaMm2 / boardTotalAreaMm2) * 100
      : 0;

  // Global used/waste areas
  const totalUsedAreaMm2 = results.layouts.reduce(
    (sum, b) =>
      sum +
      (((b as any).used_area_mm2 ?? (b as any).used_area ?? 0) as number),
    0,
  );
  const totalWasteAreaMm2 =
    ((results.optimization as any).total_waste_mm2 ??
      (results.optimization as any).total_waste_area ??
      0) as number;

  const totalBoardsUsed =
    ((results.optimization as any).total_boards_used ??
      (results.optimization as any).total_boards ??
      results.layouts.length) as number;

  // ----------------- NORMALIZE BACKEND BOQ & PRICING SHAPE -----------------
  const rawBoq: any = (results as any).boq ?? {};

  // Items (should already be an array, but be defensive)
  const boqItems: any[] = Array.isArray(rawBoq.items) ? rawBoq.items : [];

  // Materials: backend sends a single object, not an array
  const materialsRaw: any = rawBoq.materials ?? null;
  const materialsList: any[] = Array.isArray(materialsRaw)
    ? materialsRaw
    : materialsRaw
    ? [materialsRaw]
    : [];

  // Services: backend sends { cutting: {...}, edging: {...} }
  const servicesObj: any = rawBoq.services ?? {};
  const servicesArray: {
    service: string;
    quantity: number;
    unit: string;
    unit_price: number;
    amount: number;
  }[] = [];

  if (servicesObj.cutting) {
    servicesArray.push({
      service: 'Cutting',
      quantity: servicesObj.cutting.boards ?? 0,
      unit: 'board',
      unit_price: servicesObj.cutting.price_per_board ?? 0,
      amount: servicesObj.cutting.total ?? 0,
    });
  }

  if (servicesObj.edging) {
    servicesArray.push({
      service: 'Edging',
      quantity: servicesObj.edging.meters ?? 0,
      unit: 'm',
      unit_price: servicesObj.edging.price_per_meter ?? 0,
      amount: servicesObj.edging.total ?? 0,
    });
  }

  // Pricing comes from boq.pricing (with fallback to results.pricing or defaults)
  const rawPricing: any =
    rawBoq.pricing ??
    (results as any).pricing ?? {
      lines: [],
      subtotal: 0,
      tax_name: 'Tax',
      tax_rate: 0,
      tax_amount: 0,
      total: 0,
    };

  const pricingLines: any[] = Array.isArray(rawPricing.lines)
    ? rawPricing.lines
    : [];

  const pricing = {
    ...rawPricing,
    lines: pricingLines,
    subtotal: rawPricing.subtotal ?? 0,
    tax_name: rawPricing.tax_name ?? 'Tax',
    tax_rate: rawPricing.tax_rate ?? 0,
    tax_amount: rawPricing.tax_amount ?? 0,
    total: rawPricing.total ?? 0,
  };

  // Normalized tax rate display:
  // - If backend sends 0.16, we show 16%
  // - If backend sends 16, we also show 16%
  const rawTaxRate = Number(pricing.tax_rate ?? 0);
  const displayTaxRatePercent =
    rawTaxRate > 1 ? rawTaxRate : rawTaxRate * 100;
  // ------------------------------------------------------------------------

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Optimization Results
        </h2>
        <p className="text-gray-600">
          Review bill of quantities and complete payment to unlock cutting layouts
        </p>
      </div>

      {/* Main grid: left = layouts/BOQ/pricing, right = payment */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-6">
        {/* LEFT / CENTER COLUMN */}
        <div className="space-y-6">
          {/* If not paid yet, show info instead of layouts */}
          {!hasPaid && (
            <Card title="Layouts & Optimization" hover>
              <p className="text-sm text-gray-700">
                Cutting layouts and optimization statistics are locked until payment is completed.
                Please review the bill of quantities and complete the payment on the right to
                unlock the full cutting plan and board layouts.
              </p>
            </Card>
          )}

          {/* Layout visualization & global stats only after payment */}
          {hasPaid && (
            <>
              {/* Layout visualization */}
              <Card title="Layout Visualization" hover>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          setCurrentSheetIndex(Math.max(0, currentSheetIndex - 1))
                        }
                        disabled={currentSheetIndex === 0}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm font-medium">
                        Sheet {currentSheetIndex + 1} / {results.layouts.length}
                      </span>
                      <Button
                        size="sm"
                        onClick={() =>
                          setCurrentSheetIndex(
                            Math.min(
                              results.layouts.length - 1,
                              currentSheetIndex + 1,
                            ),
                          )
                        }
                        disabled={currentSheetIndex === results.layouts.length - 1}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                      >
                        <ZoomOut className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setZoom(1)}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                      >
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={500}
                    onMouseMove={handleCanvasHover}
                    onMouseLeave={() => setHoveredPanel(null)}
                    className="w-full border border-gray-200 rounded-lg bg-white cursor-crosshair"
                  />

                  {/* Board + panel stats for current sheet */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-gray-600">Board Size</p>
                      <p className="font-semibold">
                        {layout.board_width} × {layout.board_length} mm
                      </p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-gray-600">Panels on Sheet</p>
                      <p className="font-semibold">
                        {layout.panels.length} pieces
                      </p>
                    </div>
                    <div className="bg-green-50 p-3 rounded">
                      <p className="text-green-700">Used Area</p>
                      <p className="font-semibold">
                        {(usedAreaMm2 / 1_000_000).toFixed(2)} m²
                      </p>
                    </div>
                    <div className="bg-red-50 p-3 rounded">
                      <p className="text-red-700">Waste Area</p>
                      <p className="font-semibold">
                        {(wasteAreaMm2 / 1_000_000).toFixed(2)} m² (
                        {boardWastePercent.toFixed(1)}%)
                      </p>
                    </div>
                  </div>

                  {hoveredPanel && (
                    <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                      <h4 className="font-semibold text-orange-900 mb-2">
                        Hovered Panel
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600">Label:</span>{' '}
                          <strong>{hoveredPanel.label}</strong>
                        </div>
                        <div>
                          <span className="text-gray-600">Size:</span>{' '}
                          <strong>
                            {hoveredPanel.width} × {hoveredPanel.length}mm
                          </strong>
                        </div>
                        <div>
                          <span className="text-gray-600">Position:</span>{' '}
                          <strong>
                            ({hoveredPanel.x}, {hoveredPanel.y})
                          </strong>
                        </div>
                        <div>
                          <span className="text-gray-600">Rotated:</span>{' '}
                          <strong>{(hoveredPanel as any).rotated ? 'Yes' : 'No'}</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Global statistics */}
              <Card title="Global Statistics" hover>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-600">Total Boards Used</p>
                    <p className="text-xl font-bold text-gray-900">
                      {totalBoardsUsed}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-600">Total Panels</p>
                    <p className="text-xl font-bold text-gray-900">
                      {results.optimization.total_panels}
                    </p>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <p className="text-green-700">Used Area</p>
                    <p className="text-xl font-bold text-green-900">
                      {(totalUsedAreaMm2 / 1_000_000).toFixed(2)} m²
                    </p>
                  </div>
                  <div className="bg-red-50 p-3 rounded">
                    <p className="text-red-700">Waste Area</p>
                    <p className="text-xl font-bold text-red-900">
                      {(totalWasteAreaMm2 / 1_000_000).toFixed(2)} m²
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-600">Total Cuts</p>
                    <p className="text-xl font-bold text-gray-900">
                      {results.optimization.total_cuts}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-600">Cut Length</p>
                    <p className="text-xl font-bold text-gray-900">
                      {(results.optimization.total_cut_length / 1000).toFixed(2)}m
                    </p>
                  </div>
                </div>
              </Card>
            </>
          )}

          {/* BOQ TABLE (always visible) */}
          <Card title="Bill of Quantities" hover>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left border-b">#</th>
                    <th className="px-3 py-2 text-left border-b">
                      Description
                    </th>
                    <th className="px-3 py-2 text-left border-b">Size</th>
                    <th className="px-3 py-2 text-right border-b">Qty</th>
                    <th className="px-3 py-2 text-left border-b">Unit</th>
                    <th className="px-3 py-2 text-left border-b">Edges</th>
                  </tr>
                </thead>
                <tbody>
                  {boqItems.map((item) => (
                    <tr key={item.item_no ?? item.item_number} className="border-b">
                      <td className="px-3 py-2">
                        {item.item_no ?? item.item_number}
                      </td>
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2">{item.size}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2">{item.unit}</td>
                      <td className="px-3 py-2">{item.edges}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Materials & services summary */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 p-2 rounded">
                <h4 className="font-semibold mb-1 text-gray-700 uppercase">
                  Materials
                </h4>
                {materialsList.map((mat, idx) => (
                  <div key={idx} className="mb-1">
                    <p>
                      <strong>{mat.board_type}</strong> - {mat.board_company}
                    </p>
                    <p className="text-gray-600">
                      {mat.board_size} × {mat.boards_required} boards
                    </p>
                    <p className="text-gray-600">
                      Supplied by: {mat.supplied_by}
                    </p>
                  </div>
                ))}
                {materialsList.length === 0 && (
                  <p className="text-gray-500 italic">No materials data</p>
                )}
              </div>

              <div className="bg-gray-50 p-2 rounded">
                <h4 className="font-semibold mb-1 text-gray-700 uppercase">
                  Services
                </h4>
                {servicesArray.map((service, idx) => (
                  <div key={service.service + idx} className="mb-1">
                    <p>
                      <strong>{service.service}</strong>
                    </p>
                    <p className="text-gray-600">
                      {service.quantity} {service.unit} @{' '}
                      {service.unit_price.toLocaleString()}
                    </p>
                    <p className="font-semibold">
                      Amount: {service.amount.toLocaleString()}
                    </p>
                  </div>
                ))}
                {servicesArray.length === 0 && (
                  <p className="text-gray-500 italic">No services data</p>
                )}
              </div>
            </div>
          </Card>

          {/* PRICING TABLE (always visible) */}
          <Card title="Pricing" hover>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left border-b">Item</th>
                    <th className="px-3 py-2 text-right border-b">Qty</th>
                    <th className="px-3 py-2 text-left border-b">Unit</th>
                    <th className="px-3 py-2 text-right border-b">
                      Unit Price
                    </th>
                    <th className="px-3 py-2 text-right border-b">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.lines.map((line: any, idx: number) => (
                    <tr key={line.item ?? idx} className="border-b">
                      <td className="px-3 py-2">{line.description}</td>
                      <td className="px-3 py-2 text-right">
                        {line.quantity}
                      </td>
                      <td className="px-3 py-2">{line.unit}</td>
                      <td className="px-3 py-2 text-right">
                        {line.unit_price.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {line.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {pricing.lines.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-2 text-center text-gray-500"
                      >
                        No pricing lines
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary rows */}
            <div className="mt-4 border-t pt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold">
                  {pricing.subtotal.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>
                  {pricing.tax_name} ({displayTaxRatePercent.toFixed(0)}%):
                </span>
                <span className="font-semibold">
                  {pricing.tax_amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-lg font-bold text-orange-600 bg-orange-50 p-3 rounded">
                <span>Total:</span>
                <span>{pricing.total.toLocaleString()} KES</span>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN – payment only */}
        <div className="space-y-6">
          <Card title="M-Pesa Payment" hover>
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 p-4 rounded text-center">
                <p className="text-sm font-medium text-green-900">M-PESA</p>
                <p className="text-xs text-green-700">
                  {DEMO_PAYMENT_MODE
                    ? 'Demo mode: no real charges. Use this to unlock layouts.'
                    : 'Secure mobile payment'}
                </p>
              </div>

              {paymentStatus === 'paid' ? (
                <div className="bg-green-50 border border-green-500 p-4 rounded text-center">
                  <p className="font-bold text-green-900">Payment Successful!</p>
                  {receiptNumber && (
                    <p className="text-sm text-green-700">
                      Receipt: {receiptNumber}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <Input
                    label="M-Pesa Phone Number"
                    value={mpesaPhone}
                    onChange={(e) => setMpesaPhone(e.target.value)}
                    placeholder="254712345678"
                  />

                  <Button
                    onClick={handlePayment}
                    fullWidth
                    disabled={!mpesaPhone || paymentStatus === 'processing'}
                  >
                    {paymentStatus === 'processing'
                      ? 'Processing...'
                      : 'Pay with M-Pesa'}
                  </Button>

                  {paymentMessage && (
                    <div
                      className={`p-3 rounded text-sm ${
                        paymentStatus === 'failed'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {paymentMessage}
                    </div>
                  )}
                </>
              )}

              <div className="text-xs text-gray-500 space-y-1">
                <p>
                  <strong>Order ID:</strong> {orderId || results.report_id}
                </p>
                <p>
                  <strong>Amount:</strong>{' '}
                  {pricing.total.toLocaleString()} KES
                </p>
                <p>
                  <strong>Project:</strong> {projectName}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" />
          Back to Configuration
        </Button>
      </div>
    </div>
  );
}