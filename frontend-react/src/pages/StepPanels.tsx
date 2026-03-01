import { useState, useEffect } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Toggle } from '../components/ui/Toggle';
import { Chip } from '../components/ui/Chip';
import { api } from '../api/client';
import type {
  Panel,
  BoardSelection,
  PanelEdges,
  StockSheet,
  OptimizationOptions,
  CustomerDetails,
  SupplyMode,
  BoardCatalog,
} from '../types';

interface StepPanelsProps {
  panels: Panel[];
  onPanelsChange: (panels: Panel[]) => void;
  stockSheets: StockSheet[]; // kept for compatibility but not used
  onStockSheetsChange: (sheets: StockSheet[]) => void; // kept for compatibility but not used
  options: OptimizationOptions;
  onOptionsChange: (options: OptimizationOptions) => void;
  customer: CustomerDetails;
  onCustomerChange: (customer: CustomerDetails) => void;
  supply: SupplyMode;
  onSupplyChange: (supply: SupplyMode) => void;
  onNext: () => void;
}

export function StepPanels({
  panels,
  onPanelsChange,
  stockSheets, // unused
  onStockSheetsChange, // unused
  options,
  onOptionsChange,
  customer,
  onCustomerChange,
  supply,
  onSupplyChange,
  onNext,
}: StepPanelsProps) {
  const [catalog, setCatalog] = useState<BoardCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Current panel form
  const [panelForm, setPanelForm] = useState({
    label: '',
    width: '',
    length: '',
    quantity: '1',
    notes: '',
  });

  // Current board selection for this panel
  const [boardForm, setBoardForm] = useState<Partial<BoardSelection>>({});

  // Current edges for this panel
  const [edgesForm, setEdgesForm] = useState<PanelEdges>({
    top: false,
    right: false,
    bottom: false,
    left: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveMessage, setSaveMessage] = useState<string>('');

  useEffect(() => {
    api
      .getBoardCatalog()
      .then((data) => {
        console.log('Board catalog from API:', data);
        setCatalog(data);
        setCatalogError(null);
      })
      .catch((err) => {
        console.error('Error loading board catalog:', err);
        setCatalogError(
          err instanceof Error ? err.message : 'Failed to load board catalog',
        );
      });
  }, []);

  const validatePanelAndBoard = () => {
    const newErrors: Record<string, string> = {};

    if (!panelForm.label) newErrors.label = 'Label is required';
    if (!panelForm.width || Number(panelForm.width) <= 0)
      newErrors.width = 'Width must be > 0';
    if (!panelForm.length || Number(panelForm.length) <= 0)
      newErrors.length = 'Length must be > 0';
    if (!panelForm.quantity || Number(panelForm.quantity) <= 0)
      newErrors.quantity = 'Quantity must be > 0';

    if (!boardForm.core_type) newErrors.core = 'Core type is required';
    if (!boardForm.thickness_mm)
      newErrors.thickness = 'Thickness is required';
    if (!boardForm.company) newErrors.company = 'Company is required';
    if (!boardForm.color_code) newErrors.color = 'Color is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSavePanel = () => {
    if (!validatePanelAndBoard()) {
      setSaveMessage('');
      return;
    }

    const newPanel: Panel = {
      id: Date.now().toString(),
      label: panelForm.label,
      width: Number(panelForm.width),
      length: Number(panelForm.length),
      quantity: Number(panelForm.quantity),
      alignment: 'none',
      notes: panelForm.notes,
      board: boardForm as BoardSelection,
      edges: { ...edgesForm },
    };

    // Save to parent state (this is what goes to backend)
    onPanelsChange([...panels, newPanel]);

    // Clear form for next panel (but keep previous ones in table)
    setPanelForm({
      label: '',
      width: '',
      length: '',
      quantity: '1',
      notes: '',
    });
    setBoardForm({});
    setEdgesForm({
      top: false,
      right: false,
      bottom: false,
      left: false,
    });
    setErrors({});
    setSaveMessage('Panel saved. You can now enter the next panel.');
    // Hide message after a while
    setTimeout(() => setSaveMessage(''), 2500);
  };

  const deletePanel = (id: string) => {
    onPanelsChange(panels.filter((p) => p.id !== id));
  };

  const totalArea = panels.reduce(
    (sum, p) => sum + (p.width * p.length * p.quantity) / 1000000,
    0,
  );
  const totalPieces = panels.reduce((sum, p) => sum + p.quantity, 0);

  // Board catalog mapping
  const coreMap = (catalog?.catalog ?? {}) as Record<
    string,
    { thicknesses?: number[]; companies?: string[] }
  >;
  const colorsByCompany = (catalog?.colors ?? {}) as Record<
    string,
    { code: string; name: string; hex: string }[]
  >;

  const coreTypes = Object.keys(coreMap);

  const availableThicknesses =
    boardForm.core_type && coreMap[boardForm.core_type]
      ? coreMap[boardForm.core_type].thicknesses ?? []
      : [];

  const availableCompanies =
    boardForm.core_type &&
    boardForm.thickness_mm &&
    coreMap[boardForm.core_type]
      ? coreMap[boardForm.core_type].companies ?? []
      : [];

  const availableColors =
    boardForm.company && colorsByCompany[boardForm.company]
      ? colorsByCompany[boardForm.company]
      : [];

  const handleNext = () => {
    if (panels.length === 0) {
      setSaveMessage('Please add at least one panel before continuing.');
      return;
    }
    onNext();
  };

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Panels & Board Configuration
        </h2>
        <p className="text-gray-600">
          Simple, step‑by‑step flow for carpenters: enter one panel at a time,
          select its board, then save and repeat.
        </p>
      </div>

      {/* STEP 1 + 2 + 3 – single panel builder */}
      <Card
        title="Step 1–3: Add a Panel"
        subtitle="1) Panel size, 2) Board selection, 3) Edges"
        hover
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Step 1: Panel size & quantity */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">
              Step 1: Panel Size & Quantity
            </h3>
            <Input
              label="Label"
              value={panelForm.label}
              onChange={(e) =>
                setPanelForm({ ...panelForm, label: e.target.value })
              }
              error={errors.label}
              placeholder="e.g., Door Panel"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Length (mm)"
                type="number"
                value={panelForm.length}
                onChange={(e) =>
                  setPanelForm({ ...panelForm, length: e.target.value })
                }
                error={errors.length}
                placeholder="e.g., 2000"
              />
              <Input
                label="Width (mm)"
                type="number"
                value={panelForm.width}
                onChange={(e) =>
                  setPanelForm({ ...panelForm, width: e.target.value })
                }
                error={errors.width}
                placeholder="e.g., 600"
              />
            </div>
            <Input
              label="Quantity"
              type="number"
              value={panelForm.quantity}
              onChange={(e) =>
                setPanelForm({ ...panelForm, quantity: e.target.value })
              }
              error={errors.quantity}
              min="1"
            />
            <Input
              label="Notes (Optional)"
              value={panelForm.notes}
              onChange={(e) =>
                setPanelForm({ ...panelForm, notes: e.target.value })
              }
              placeholder="Any extra notes for this panel..."
            />
            {panelForm.width && panelForm.length && (
              <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded">
                Area per panel:{' '}
                <strong>
                  {(
                    (Number(panelForm.width) * Number(panelForm.length)) /
                    1_000_000
                  ).toFixed(2)}{' '}
                  m²
                </strong>
                {panelForm.quantity &&
                  ` × ${panelForm.quantity} = ${(
                    (Number(panelForm.width) *
                      Number(panelForm.length) *
                      Number(panelForm.quantity)) /
                    1_000_000
                  ).toFixed(2)} m²`}
              </div>
            )}
          </div>

          {/* Step 2: Board selection */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">
              Step 2: Board Selection
            </h3>
            {catalogError && (
              <p className="text-xs text-red-500">
                Failed to load board catalog: {catalogError}
              </p>
            )}
            {(errors.core ||
              errors.thickness ||
              errors.company ||
              errors.color) && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                Please choose all board options for this panel.
              </div>
            )}

            <div className="space-y-3">
              {/* Core */}
              <div>
                <p className="text-[11px] font-medium text-gray-500 mb-1 uppercase">
                  Core Type
                </p>
                <div className="flex flex-wrap gap-2">
                  {coreTypes.map((core) => (
                    <Chip
                      key={core}
                      label={core.replace('_', ' ').toUpperCase()}
                      selected={boardForm.core_type === core}
                      onClick={() =>
                        setBoardForm({
                          core_type: core,
                          thickness_mm: undefined,
                          company: '',
                          color_code: '',
                          color_name: '',
                          color_hex: '',
                        })
                      }
                    />
                  ))}
                  {!catalogError && coreTypes.length === 0 && (
                    <p className="text-xs text-gray-400">
                      No board catalog data available.
                    </p>
                  )}
                </div>
              </div>

              {/* Thickness */}
              {availableThicknesses.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-1 uppercase">
                    Thickness (mm)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableThicknesses.map((thickness) => (
                      <Chip
                        key={thickness}
                        label={`${thickness}mm`}
                        selected={boardForm.thickness_mm === thickness}
                        onClick={() =>
                          setBoardForm({
                            ...boardForm,
                            thickness_mm: thickness,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Company */}
              {availableCompanies.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-1 uppercase">
                    Company
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableCompanies.map((company) => (
                      <Chip
                        key={company}
                        label={company}
                        selected={boardForm.company === company}
                        onClick={() =>
                          setBoardForm({
                            ...boardForm,
                            company,
                            color_code: '',
                            color_name: '',
                            color_hex: '',
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Color */}
              {availableColors.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-1 uppercase">
                    Color
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {availableColors.map((color) => (
                      <Chip
                        key={color.code}
                        label={`${color.code} - ${color.name}`}
                        variant="color"
                        color={color.hex}
                        selected={boardForm.color_code === color.code}
                        onClick={() =>
                          setBoardForm({
                            ...boardForm,
                            color_code: color.code,
                            color_name: color.name,
                            color_hex: color.hex,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Current selection summary */}
              {(boardForm.core_type || boardForm.company) && (
                <div className="bg-gray-50 p-3 rounded text-xs">
                  <p className="font-semibold text-gray-800 mb-1">
                    Current board for this panel:
                  </p>
                  <p>
                    Core:{' '}
                    <strong>
                      {boardForm.core_type
                        ? boardForm.core_type.replace('_', ' ')
                        : '-'}
                    </strong>
                  </p>
                  <p>
                    Thickness:{' '}
                    <strong>{boardForm.thickness_mm || '-'}mm</strong>
                  </p>
                  <p>
                    Company: <strong>{boardForm.company || '-'}</strong>
                  </p>
                  <p>
                    Color: <strong>{boardForm.color_name || '-'}</strong>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Edges */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">
              Step 3: Edges (Optional)
            </h3>
            <p className="text-xs text-gray-500">
              Click the sides that should receive edge banding for this panel.
            </p>
            <div className="flex flex-wrap gap-2">
              {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                <button
                  key={edge}
                  type="button"
                  onClick={() =>
                    setEdgesForm({
                      ...edgesForm,
                      [edge]: !edgesForm[edge],
                    })
                  }
                  className={`px-4 py-2 rounded-lg border-2 font-medium text-sm transition-all ${
                    edgesForm[edge]
                      ? 'border-orange-600 bg-orange-50 text-orange-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {edgesForm[edge] && (
                    <Check className="inline w-4 h-4 mr-1" />
                  )}
                  {edge.charAt(0).toUpperCase() + edge.slice(1)}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                const allSelected = Object.values(edgesForm).every((v) => v);
                setEdgesForm({
                  top: !allSelected,
                  right: !allSelected,
                  bottom: !allSelected,
                  left: !allSelected,
                });
              }}
            >
              Toggle All Edges
            </Button>

            {/* Save button */}
            <div className="pt-4 border-t mt-4">
              <Button
                fullWidth
                size="lg"
                type="button"
                onClick={handleSavePanel}
              >
                Save Panel & Add Next
              </Button>
              {saveMessage && (
                <p className="mt-2 text-xs text-green-600">{saveMessage}</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* PANELS IN JOB TABLE */}
      <Card
        title="Panels in this Job"
        subtitle="All saved panels that will be sent to the optimizer and BOQ"
        hover
      >
        {panels.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No panels saved yet. Use the form above to add the first panel.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm border-collapse">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Label</th>
                  <th className="px-3 py-2 text-left">Size (mm)</th>
                  <th className="px-3 py-2 text-left">Qty</th>
                  <th className="px-3 py-2 text-left">Board</th>
                  <th className="px-3 py-2 text-left">Edges</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {panels.map((panel, idx) => {
                  const edges = panel.edges || {
                    top: false,
                    right: false,
                    bottom: false,
                    left: false,
                  };
                  const edgesLabel =
                    Object.entries(edges)
                      .filter(([, v]) => v)
                      .map(([k]) => k[0].toUpperCase())
                      .join('') || 'None';

                  const board =
                    panel.board &&
                    (panel.board.company ||
                      panel.board.thickness_mm ||
                      panel.board.color_name)
                      ? `${panel.board.company ?? ''} ${
                          panel.board.thickness_mm ?? ''
                        }mm • ${panel.board.color_name ?? ''}`
                      : 'No board';

                  return (
                    <tr key={panel.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 align-middle">{idx + 1}</td>
                      <td className="px-3 py-2 align-middle font-medium">
                        {panel.label}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {panel.length} × {panel.width}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {panel.quantity}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs sm:text-sm">
                        {board}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs">
                        {edgesLabel}
                      </td>
                      <td className="px-3 py-2 align-middle text-right">
                        <button
                          onClick={() => deletePanel(panel.id)}
                          className="text-red-500 hover:text-red-700"
                          type="button"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* OPTIONS + SUPPLY & CUSTOMER */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        {/* Options */}
        <Card title="Options" hover>
          <div className="space-y-2">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kerf (mm)
              </label>
              <Input
                type="number"
                value={options.kerf}
                onChange={(e) =>
                  onOptionsChange({ ...options, kerf: Number(e.target.value) })
                }
                step="0.1"
              />
            </div>
            <Toggle
              label="Labels on panels"
              checked={options.labels_on_panels}
              onChange={(v) =>
                onOptionsChange({ ...options, labels_on_panels: v })
              }
            />
            <Toggle
              label="Use single sheet"
              checked={options.use_single_sheet}
              onChange={(v) =>
                onOptionsChange({ ...options, use_single_sheet: v })
              }
            />
            <Toggle
              label="Consider material"
              checked={options.consider_material}
              onChange={(v) =>
                onOptionsChange({ ...options, consider_material: v })
              }
            />
            <Toggle
              label="Edge banding"
              checked={options.edge_banding}
              onChange={(v) =>
                onOptionsChange({ ...options, edge_banding: v })
              }
            />
            <Toggle
              label="Consider grain"
              checked={options.consider_grain}
              onChange={(v) =>
                onOptionsChange({ ...options, consider_grain: v })
              }
            />
          </div>
        </Card>

        {/* Supply & Customer */}
        <Card title="Supply & Customer" hover>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3 uppercase">
                Supply Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() =>
                    onSupplyChange({ factory_supply: true, client_supply: false })
                  }
                  className={`p-4 rounded-lg border-2 transition-all ${
                    supply.factory_supply
                      ? 'border-orange-600 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <h4 className="font-semibold text-gray-900">Factory Supply</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    We provide materials
                  </p>
                </button>
                <button
                  onClick={() =>
                    onSupplyChange({ factory_supply: false, client_supply: true })
                  }
                  className={`p-4 rounded-lg border-2 transition-all ${
                    supply.client_supply
                      ? 'border-orange-600 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <h4 className="font-semibold text-gray-900">Client Supply</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    You provide materials
                  </p>
                </button>
              </div>
            </div>

            {supply.client_supply && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Client Boards (qty)"
                  type="number"
                  value={supply.client_boards || ''}
                  onChange={(e) =>
                    onSupplyChange({
                      ...supply,
                      client_boards: Number(e.target.value),
                    })
                  }
                />
                <Input
                  label="Client Edging (m)"
                  type="number"
                  value={supply.client_edging || ''}
                  onChange={(e) =>
                    onSupplyChange({
                      ...supply,
                      client_edging: Number(e.target.value),
                    })
                  }
                />
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700 uppercase">
                Customer Details
              </h4>
              <Input
                label="Project Name"
                value={customer.project_name}
                onChange={(e) =>
                  onCustomerChange({
                    ...customer,
                    project_name: e.target.value,
                  })
                }
                placeholder="e.g., Kitchen Cabinets"
              />
              <Input
                label="Customer Name"
                value={customer.customer_name}
                onChange={(e) =>
                  onCustomerChange({
                    ...customer,
                    customer_name: e.target.value,
                  })
                }
                placeholder="Full name"
              />
              <Input
                label="Email"
                type="email"
                value={customer.email}
                onChange={(e) =>
                  onCustomerChange({ ...customer, email: e.target.value })
                }
                placeholder="email@example.com"
              />
              <Input
                label="Phone/WhatsApp"
                value={customer.phone}
                onChange={(e) =>
                  onCustomerChange({ ...customer, phone: e.target.value })
                }
                placeholder="254712345678"
              />
              <Input
                label="Notes (Optional)"
                value={customer.notes}
                onChange={(e) =>
                  onCustomerChange({ ...customer, notes: e.target.value })
                }
                placeholder="Additional notes..."
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={handleNext} size="lg">
          Optimize & View Results
        </Button>
      </div>
    </div>
  );
}