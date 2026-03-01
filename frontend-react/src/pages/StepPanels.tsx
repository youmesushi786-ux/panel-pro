import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
  stockSheets, // unused now
  onStockSheetsChange, // unused now
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

  const [currentBoard, setCurrentBoard] = useState<Partial<BoardSelection>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const validateBoardSelection = () => {
    const newErrors: Record<string, string> = {};
    if (!currentBoard.core_type) newErrors.core = 'Core type is required';
    if (!currentBoard.thickness_mm)
      newErrors.thickness = 'Thickness is required';
    if (!currentBoard.company) newErrors.company = 'Company is required';
    if (!currentBoard.color_code) newErrors.color = 'Color is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addPanelRow = () => {
    if (!validateBoardSelection()) return;

    const newPanel: Panel = {
      id: Date.now().toString(),
      label: '',
      width: 0,
      length: 0,
      quantity: 1,
      alignment: 'none',
      notes: '',
      board: currentBoard as BoardSelection,
      edges: {
        top: false,
        right: false,
        bottom: false,
        left: false,
      },
    };

    onPanelsChange([...panels, newPanel]);
  };

  const updatePanelField = (
    id: string,
    field: keyof Panel,
    value: string | number,
  ) => {
    onPanelsChange(
      panels.map((p) =>
        p.id === id
          ? {
              ...p,
              [field]:
                field === 'width' ||
                field === 'length' ||
                field === 'quantity'
                  ? Number(value) || 0
                  : value,
            }
          : p,
      ),
    );
  };

  const togglePanelEdge = (id: string, edge: keyof PanelEdges) => {
    onPanelsChange(
      panels.map((p) =>
        p.id === id
          ? {
              ...p,
              edges: {
                ...p.edges,
                [edge]: !p.edges?.[edge],
              },
            }
          : p,
      ),
    );
  };

  const deletePanel = (id: string) => {
    onPanelsChange(panels.filter((p) => p.id !== id));
  };

  const totalArea = panels.reduce(
    (sum, p) => sum + (p.width * p.length * p.quantity) / 1000000,
    0,
  );
  const totalPieces = panels.reduce((sum, p) => sum + p.quantity, 0);

  // Map structures derived from backend JSON
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
    currentBoard.core_type && coreMap[currentBoard.core_type]
      ? coreMap[currentBoard.core_type].thicknesses ?? []
      : [];

  const availableCompanies =
    currentBoard.core_type &&
    currentBoard.thickness_mm &&
    coreMap[currentBoard.core_type]
      ? coreMap[currentBoard.core_type].companies ?? []
      : [];

  const availableColors =
    currentBoard.company && colorsByCompany[currentBoard.company]
      ? colorsByCompany[currentBoard.company]
      : [];

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Panels & Board Configuration
        </h2>
        <p className="text-gray-600">
          Define your panels, select board materials, and configure cutting
          options
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* LEFT COLUMN: Board selection + summary + actions */}
        <div className="space-y-6">
          {/* Board selection */}
          <Card
            title="Board Selection"
            subtitle="Choose core, thickness, company, and color (applies to new rows)"
            hover
          >
            {(errors.core ||
              errors.thickness ||
              errors.company ||
              errors.color) && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                Please complete all board selections for new rows.
              </div>
            )}

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

                  {catalogError && (
                    <p className="text-xs text-red-500">
                      Failed to load board catalog: {catalogError}
                    </p>
                  )}

                  {!catalogError && coreTypes.length === 0 && (
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
                          setCurrentBoard({
                            ...currentBoard,
                            thickness_mm: thickness,
                          })
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
                        onClick={() =>
                          setCurrentBoard({ ...currentBoard, company })
                        }
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
                    Current Board for New Rows
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

          {/* Add row button */}
          <Card hover>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-900">Panel Rows</p>
                <p>
                  Define panels directly in the table on the right. Each new row
                  uses the current board selection.
                </p>
              </div>
              <Button onClick={addPanelRow}>
                <Plus className="w-4 h-4 mr-1" />
                Add Row
              </Button>
            </div>
          </Card>

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

        {/* RIGHT COLUMN: Advanced panels table */}
        <div className="space-y-6">
          <Card
            title="Panels"
            subtitle="Edit your panels directly in this table"
            hover
            actions={
              <div className="text-sm text-gray-600 text-right">
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
                No panels yet. Use <strong>Add Row</strong> after selecting a
                board.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm border-collapse">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Label</th>
                      <th className="px-3 py-2 text-left">Length (mm)</th>
                      <th className="px-3 py-2 text-left">Width (mm)</th>
                      <th className="px-3 py-2 text-left">Qty</th>
                      <th className="px-3 py-2 text-left">Material</th>
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

                      return (
                        <tr
                          key={panel.id}
                          className="border-b border-gray-100 hover:bg-gray-50/70 transition-colors"
                        >
                          <td className="px-3 py-2 align-middle">
                            {idx + 1}
                          </td>

                          {/* Label */}
                          <td className="px-3 py-2 align-middle">
                            <Input
                              value={panel.label}
                              onChange={(e) =>
                                updatePanelField(
                                  panel.id,
                                  'label',
                                  e.target.value,
                                )
                              }
                              placeholder="Label"
                              className="h-8 text-xs sm:text-sm"
                            />
                          </td>

                          {/* Length */}
                          <td className="px-3 py-2 align-middle">
                            <Input
                              type="number"
                              value={panel.length || ''}
                              onChange={(e) =>
                                updatePanelField(
                                  panel.id,
                                  'length',
                                  e.target.value,
                                )
                              }
                              placeholder="Length"
                              className="h-8 text-xs sm:text-sm"
                            />
                          </td>

                          {/* Width */}
                          <td className="px-3 py-2 align-middle">
                            <Input
                              type="number"
                              value={panel.width || ''}
                              onChange={(e) =>
                                updatePanelField(
                                  panel.id,
                                  'width',
                                  e.target.value,
                                )
                              }
                              placeholder="Width"
                              className="h-8 text-xs sm:text-sm"
                            />
                          </td>

                          {/* Quantity */}
                          <td className="px-3 py-2 align-middle">
                            <Input
                              type="number"
                              value={panel.quantity || ''}
                              onChange={(e) =>
                                updatePanelField(
                                  panel.id,
                                  'quantity',
                                  e.target.value,
                                )
                              }
                              placeholder="Qty"
                              className="h-8 text-xs sm:text-sm"
                            />
                          </td>

                          {/* Material summary */}
                          <td className="px-3 py-2 align-middle text-[10px] sm:text-xs">
                            <div className="whitespace-nowrap">
                              <span className="font-medium">
                                {panel.board.company}
                              </span>{' '}
                              {panel.board.thickness_mm}mm
                            </div>
                            <div className="text-gray-500 truncate max-w-[140px]">
                              {panel.board.color_name}
                            </div>
                          </td>

                          {/* Edges (T/R/B/L toggles) */}
                          <td className="px-3 py-2 align-middle">
                            <div className="flex gap-1">
                              {(
                                [
                                  ['T', 'top'],
                                  ['R', 'right'],
                                  ['B', 'bottom'],
                                  ['L', 'left'],
                                ] as const
                              ).map(([label, key]) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() =>
                                    togglePanelEdge(panel.id, key)
                                  }
                                  className={`w-6 h-6 flex items-center justify-center rounded text-[10px] border ${
                                    edges[key]
                                      ? 'bg-orange-500 text-white border-orange-500'
                                      : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-100'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </td>

                          {/* Delete */}
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