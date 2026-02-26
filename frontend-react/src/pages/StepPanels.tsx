import { useState, useEffect } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
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
  stockSheets: StockSheet[];
  onStockSheetsChange: (sheets: StockSheet[]) => void;
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
  stockSheets,
  onStockSheetsChange,
  options,
  onOptionsChange,
  customer,
  onCustomerChange,
  supply,
  onSupplyChange,
  onNext,
}: StepPanelsProps) {
  const [catalog, setCatalog] = useState<BoardCatalog | null>(null);
  const [currentPanel, setCurrentPanel] = useState({
    label: '',
    width: '',
    length: '',
    quantity: '1',
    alignment: 'none',
    notes: '',
  });
  const [currentBoard, setCurrentBoard] = useState<Partial<BoardSelection>>({});
  const [currentEdges, setCurrentEdges] = useState<PanelEdges>({
    top: false,
    right: false,
    bottom: false,
    left: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getBoardCatalog().then(setCatalog).catch(console.error);
  }, []);

  const validatePanel = () => {
    const newErrors: Record<string, string> = {};
    if (!currentPanel.label) newErrors.label = 'Label is required';
    if (!currentPanel.width || Number(currentPanel.width) <= 0) newErrors.width = 'Width must be > 0';
    if (!currentPanel.length || Number(currentPanel.length) <= 0) newErrors.length = 'Length must be > 0';
    if (!currentPanel.quantity || Number(currentPanel.quantity) <= 0) newErrors.quantity = 'Quantity must be > 0';
    if (!currentBoard.core_type) newErrors.core = 'Core type is required';
    if (!currentBoard.thickness_mm) newErrors.thickness = 'Thickness is required';
    if (!currentBoard.company) newErrors.company = 'Company is required';
    if (!currentBoard.color_code) newErrors.color = 'Color is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addPanel = () => {
    if (!validatePanel()) return;

    const newPanel: Panel = {
      id: Date.now().toString(),
      label: currentPanel.label,
      width: Number(currentPanel.width),
      length: Number(currentPanel.length),
      quantity: Number(currentPanel.quantity),
      alignment: currentPanel.alignment as 'none' | 'horizontal' | 'vertical',
      notes: currentPanel.notes,
      board: currentBoard as BoardSelection,
      edges: { ...currentEdges },
    };

    onPanelsChange([...panels, newPanel]);
    setCurrentPanel({ label: '', width: '', length: '', quantity: '1', alignment: 'none', notes: '' });
    setCurrentBoard({});
    setCurrentEdges({ top: false, right: false, bottom: false, left: false });
    setErrors({});
  };

  const deletePanel = (id: string) => {
    onPanelsChange(panels.filter((p) => p.id !== id));
  };

  const addStockSheet = () => {
    onStockSheetsChange([
      ...stockSheets,
      { id: Date.now().toString(), length: 2440, width: 1220, quantity: 1 },
    ]);
  };

  const updateStockSheet = (id: string, field: string, value: number) => {
    onStockSheetsChange(
      stockSheets.map((sheet) => (sheet.id === id ? { ...sheet, [field]: value } : sheet))
    );
  };

  const deleteStockSheet = (id: string) => {
    onStockSheetsChange(stockSheets.filter((s) => s.id !== id));
  };

  const totalArea = panels.reduce((sum, p) => sum + (p.width * p.length * p.quantity) / 1000000, 0);
  const totalPieces = panels.reduce((sum, p) => sum + p.quantity, 0);

  const availableThicknesses = currentBoard.core_type && catalog
    ? catalog.catalog[currentBoard.core_type]?.thicknesses || []
    : [];

  const availableCompanies = currentBoard.core_type && currentBoard.thickness_mm && catalog
    ? catalog.catalog[currentBoard.core_type]?.companies || []
    : [];

  const availableColors = currentBoard.company && catalog
    ? catalog.colors[currentBoard.company] || []
    : [];

  // SAFE: core types list even if catalog or catalog.catalog is null/undefined
  const coreTypes = Object.keys(catalog?.catalog ?? {});

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Panels & Board Configuration</h2>
        <p className="text-gray-600">Define your panels, select board materials, and configure cutting options</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card title="New Panel" hover>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Label"
                  value={currentPanel.label}
                  onChange={(e) => setCurrentPanel({ ...currentPanel, label: e.target.value })}
                  error={errors.label}
                  placeholder="e.g., Door Panel"
                />
                <Input
                  label="Quantity"
                  type="number"
                  value={currentPanel.quantity}
                  onChange={(e) => setCurrentPanel({ ...currentPanel, quantity: e.target.value })}
                  error={errors.quantity}
                  min="1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Width (mm)"
                  type="number"
                  value={currentPanel.width}
                  onChange={(e) => setCurrentPanel({ ...currentPanel, width: e.target.value })}
                  error={errors.width}
                  placeholder="e.g., 600"
                />
                <Input
                  label="Length (mm)"
                  type="number"
                  value={currentPanel.length}
                  onChange={(e) => setCurrentPanel({ ...currentPanel, length: e.target.value })}
                  error={errors.length}
                  placeholder="e.g., 800"
                />
              </div>
              <Select
                label="Alignment"
                value={currentPanel.alignment}
                onChange={(e) => setCurrentPanel({ ...currentPanel, alignment: e.target.value })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'horizontal', label: 'Horizontal' },
                  { value: 'vertical', label: 'Vertical' },
                ]}
              />
              <Input
                label="Notes (Optional)"
                value={currentPanel.notes}
                onChange={(e) => setCurrentPanel({ ...currentPanel, notes: e.target.value })}
                placeholder="Additional notes..."
              />
              {currentPanel.width && currentPanel.length && (
                <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                  Area per panel:{' '}
                  <strong>
                    {(
                      (Number(currentPanel.width) * Number(currentPanel.length)) /
                      1000000
                    ).toFixed(2)}{' '}
                    m²
                  </strong>
                  {currentPanel.quantity &&
                    ` × ${currentPanel.quantity} = ${(
                      (Number(currentPanel.width) *
                        Number(currentPanel.length) *
                        Number(currentPanel.quantity)) /
                      1000000
                    ).toFixed(2)} m²`}
                </div>
              )}
            </div>
          </Card>

          <Card title="Board Selection" subtitle="Choose core, thickness, company, and color" hover>
            {errors.core || errors.thickness || errors.company || errors.color ? (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                Please complete all board selections
              </div>
            ) : null}

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">
                  Core Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {coreTypes.map((core) => (
                    <Chip
                      key={core}
                      label={core.replace('_', ' ').toUpperCase()}
                      selected={currentBoard.core_type === core}
                      onClick={() => setCurrentBoard({ core_type: core })}
                    />
                  ))}
                  {coreTypes.length === 0 && (
                    <p className="text-xs text-gray-400">
                      No board catalog data available.
                    </p>
                  )}
                </div>
              </div>

              {availableThicknesses.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">
                    Thickness (mm)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableThicknesses.map((thickness) => (
                      <Chip
                        key={thickness}
                        label={`${thickness}mm`}
                        selected={currentBoard.thickness_mm === thickness}
                        onClick={() =>
                          setCurrentBoard({ ...currentBoard, thickness_mm: thickness })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {availableCompanies.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">
                    Company
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableCompanies.map((company) => (
                      <Chip
                        key={company}
                        label={company}
                        selected={currentBoard.company === company}
                        onClick={() => setCurrentBoard({ ...currentBoard, company })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {availableColors.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {availableColors.map((color) => (
                      <Chip
                        key={color.code}
                        label={`${color.code} - ${color.name}`}
                        variant="color"
                        color={color.hex}
                        selected={currentBoard.color_code === color.code}
                        onClick={() =>
                          setCurrentBoard({
                            ...currentBoard,
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

              {currentBoard.core_type && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase">
                    Current Selection
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Core:</span>{' '}
                      <strong>
                        {currentBoard.core_type?.replace('_', ' ') || '-'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-600">Thickness:</span>{' '}
                      <strong>{currentBoard.thickness_mm || '-'}mm</strong>
                    </div>
                    <div>
                      <span className="text-gray-600">Company:</span>{' '}
                      <strong>{currentBoard.company || '-'}</strong>
                    </div>
                    <div>
                      <span className="text-gray-600">Color:</span>{' '}
                      <strong>{currentBoard.color_name || '-'}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card
            title="Panel Edges"
            subtitle={`Current panel: ${currentPanel.width || '0'}mm × ${
              currentPanel.length || '0'
            }mm`}
            hover
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                  <button
                    key={edge}
                    onClick={() =>
                      setCurrentEdges({ ...currentEdges, [edge]: !currentEdges[edge] })
                    }
                    className={`px-4 py-2 rounded-lg border-2 font-medium text-sm transition-all ${
                      currentEdges[edge]
                        ? 'border-orange-600 bg-orange-50 text-orange-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {currentEdges[edge] && (
                      <Check className="inline w-4 h-4 mr-1" />
                    )}
                    {edge.charAt(0).toUpperCase() + edge.slice(1)}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const allSelected = Object.values(currentEdges).every((v) => v);
                  setCurrentEdges({
                    top: !allSelected,
                    right: !allSelected,
                    bottom: !allSelected,
                    left: !allSelected,
                  });
                }}
              >
                Toggle All Edges
              </Button>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button onClick={addPanel} fullWidth>
              <Plus className="w-5 h-5" />
              Add Panel & New
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCurrentPanel({
                  label: '',
                  width: '',
                  length: '',
                  quantity: '1',
                  alignment: 'none',
                  notes: '',
                });
                setCurrentBoard({});
                setCurrentEdges({
                  top: false,
                  right: false,
                  bottom: false,
                  left: false,
                });
                setErrors({});
              }}
            >
              Clear Form
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <Card
            title="Panels Added"
            hover
            actions={
              <div className="text-sm text-gray-600">
                <div>
                  <strong>{panels.length}</strong> unique panels
                </div>
                <div>
                  <strong>{totalPieces}</strong> total pieces
                </div>
                <div>
                  <strong>{totalArea.toFixed(2)}</strong> m² total area
                </div>
              </div>
            }
          >
            {panels.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No panels added yet
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Label</th>
                      <th className="px-3 py-2 text-left">Size (mm)</th>
                      <th className="px-3 py-2 text-left">Qty</th>
                      <th className="px-3 py-2 text-left">Board</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {panels.map((panel, idx) => (
                      <tr key={panel.id} className="border-t border-gray-100">
                        <td className="px-3 py-3">{idx + 1}</td>
                        <td className="px-3 py-3 font-medium">
                          {panel.label}
                        </td>
                        <td className="px-3 py-3">
                          {panel.width} × {panel.length}
                        </td>
                        <td className="px-3 py-3">{panel.quantity}</td>
                        <td className="px-3 py-3 text-xs">
                          {panel.board.company} {panel.board.thickness_mm}mm
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => deletePanel(panel.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Stock Sheets" hover>
            <div className="space-y-3">
              {stockSheets.map((sheet) => (
                <div key={sheet.id} className="flex gap-3 items-center">
                  <Input
                    type="number"
                    value={sheet.length}
                    onChange={(e) =>
                      updateStockSheet(sheet.id, 'length', Number(e.target.value))
                    }
                    placeholder="Length"
                  />
                  <Input
                    type="number"
                    value={sheet.width}
                    onChange={(e) =>
                      updateStockSheet(sheet.id, 'width', Number(e.target.value))
                    }
                    placeholder="Width"
                  />
                  <Input
                    type="number"
                    value={sheet.quantity}
                    onChange={(e) =>
                      updateStockSheet(
                        sheet.id,
                        'quantity',
                        Number(e.target.value)
                      )
                    }
                    placeholder="Qty"
                  />
                  <button
                    onClick={() => deleteStockSheet(sheet.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button variant="outline" onClick={addStockSheet} fullWidth>
                <Plus className="w-4 h-4" />
                Add Stock Sheet
              </Button>
            </div>
          </Card>

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
                    onCustomerChange({ ...customer, project_name: e.target.value })
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
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={onNext} size="lg">
          Optimize & View Results
        </Button>
      </div>
    </div>
  );
}