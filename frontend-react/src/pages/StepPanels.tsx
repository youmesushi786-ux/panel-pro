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

  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(
    panels[0]?.id ?? null,
  );
  const [boardError, setBoardError] = useState<string | null>(null);

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

  // Keep selectedPanelId valid if panels change
  useEffect(() => {
    if (!selectedPanelId && panels[0]) {
      setSelectedPanelId(panels[0].id);
    } else if (
      selectedPanelId &&
      !panels.some((p) => p.id === selectedPanelId)
    ) {
      setSelectedPanelId(panels[0]?.id ?? null);
    }
  }, [panels, selectedPanelId]);

  const selectedPanel = panels.find((p) => p.id === selectedPanelId) ?? null;

  const addPanelRow = () => {
    // Create a completely blank panel row; user will fill label/size/qty and then choose board.
    const newPanel: Panel = {
      id: Date.now().toString(),
      label: '',
      width: 0,
      length: 0,
      quantity: 1,
      alignment: 'none',
      notes: '',
      board: {
        // we mark board fields empty; validation will require user to fill them
        core_type: undefined as any,
        thickness_mm: undefined as any,
        company: '',
        color_code: '',
        color_name: '',
        color_hex: '',
      } as BoardSelection,
      edges: {
        top: false,
        right: false,
        bottom: false,
        left: false,
      },
    };

    onPanelsChange([...panels, newPanel]);
    setSelectedPanelId(newPanel.id);
    setBoardError(null);
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

  const updateSelectedPanelBoard = (
    field: keyof BoardSelection,
    value: any,
  ) => {
    if (!selectedPanel) return;
    onPanelsChange(
      panels.map((p) =>
        p.id === selectedPanel.id
          ? {
              ...p,
              board: {
                ...p.board,
                [field]: value,
              },
            }
          : p,
      ),
    );
    setBoardError(null);
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

  // Helpers for selected panel's board
  const selectedBoard = selectedPanel?.board ?? ({} as Partial<BoardSelection>);
  const selectedCore = selectedBoard.core_type as string | undefined;

  const availableThicknessesForSelected =
    selectedCore && coreMap[selectedCore]
      ? coreMap[selectedCore].thicknesses ?? []
      : [];

  const availableCompaniesForSelected =
    selectedCore && coreMap[selectedCore]
      ? coreMap[selectedCore].companies ?? []
      : [];

  const availableColorsForSelected =
    selectedBoard.company && colorsByCompany[selectedBoard.company]
      ? colorsByCompany[selectedBoard.company]
      : [];

  const handleNext = () => {
    // Ensure each panel has a board selection
    const incomplete = panels.find(
      (p) =>
        !p.board?.core_type ||
        !p.board?.thickness_mm ||
        !p.board?.company ||
        !p.board?.color_code,
    );
    if (incomplete) {
      setBoardError(
        'Please select a board (core, thickness, company, color) for every panel row.',
      );
      setSelectedPanelId(incomplete.id);
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
          Enter panel rows in the table, then choose a board for each panel
          using the section below.
        </p>
      </div>

      <div className="space-y-6">
        {/* PANELS TABLE (big, open, inline editable) */}
        <Card
          title="Panels"
          subtitle="Edit your panels directly in this table"
          hover
          actions={
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 justify-end">
              <div>
                <strong>{panels.length}</strong> unique panels
              </div>
              <div>
                <strong>{totalPieces}</strong> total pieces
              </div>
              <div>
                <strong>{totalArea.toFixed(2)}</strong> m² total area
              </div>
              <Button size="sm" onClick={addPanelRow}>
                <Plus className="w-4 h-4 mr-1" />
                Add Row
              </Button>
            </div>
          }
        >
          {panels.length === 0 ? (
            <p className="text-gray-500 text-center py-10 text-base">
              No panels yet. Click <strong>Add Row</strong> to start, then fill
              in label, size, and quantity.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm md:text-base border-collapse">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Label</th>
                    <th className="px-4 py-3 text-left">Length (mm)</th>
                    <th className="px-4 py-3 text-left">Width (mm)</th>
                    <th className="px-4 py-3 text-left">Qty</th>
                    <th className="px-4 py-3 text-left">Board</th>
                    <th className="px-4 py-3 text-left">Edges</th>
                    <th className="px-4 py-3"></th>
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
                    const isSelected = panel.id === selectedPanelId;

                    const boardSummary =
                      panel.board &&
                      (panel.board.company ||
                        panel.board.thickness_mm ||
                        panel.board.color_name)
                        ? `${panel.board.company ?? ''} ${
                            panel.board.thickness_mm ?? ''
                          }mm • ${panel.board.color_name ?? ''}`
                        : 'No board selected';

                    return (
                      <tr
                        key={panel.id}
                        className={`border-b border-gray-100 hover:bg-gray-50/70 transition-colors cursor-pointer ${
                          isSelected ? 'bg-orange-50/60' : ''
                        }`}
                        onClick={() => setSelectedPanelId(panel.id)}
                      >
                        <td className="px-4 py-3 align-middle">{idx + 1}</td>

                        {/* Label */}
                        <td className="px-4 py-3 align-middle">
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
                            className="h-10 text-sm md:text-base"
                          />
                        </td>

                        {/* Length */}
                        <td className="px-4 py-3 align-middle">
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
                            className="h-10 text-sm md:text-base"
                          />
                        </td>

                        {/* Width */}
                        <td className="px-4 py-3 align-middle">
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
                            className="h-10 text-sm md:text-base"
                          />
                        </td>

                        {/* Quantity */}
                        <td className="px-4 py-3 align-middle">
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
                            className="h-10 text-sm md:text-base w-20"
                          />
                        </td>

                        {/* Board summary */}
                        <td className="px-4 py-3 align-middle text-xs md:text-sm">
                          {boardSummary === 'No board selected' ? (
                            <span className="text-red-500">{boardSummary}</span>
                          ) : (
                            <span className="text-gray-800">
                              {boardSummary}
                            </span>
                          )}
                        </td>

                        {/* Edges (T/R/B/L toggles) */}
                        <td className="px-4 py-3 align-middle">
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePanelEdge(panel.id, key);
                                }}
                                className={`w-7 h-7 flex items-center justify-center rounded text-[11px] border ${
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
                        <td className="px-4 py-3 align-middle text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePanel(panel.id);
                            }}
                            className="text-red-500 hover:text-red-700"
                            type="button"
                          >
                            <Trash2 className="w-5 h-5" />
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

        {/* BOARD SELECTION FOR SELECTED PANEL */}
        <Card
          title="Board Selection for Selected Panel"
          subtitle="Choose core, thickness, company, and color for the highlighted row above"
          hover
        >
          {boardError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
              {boardError}
            </div>
          )}

          {!selectedPanel ? (
            <p className="text-gray-500 text-sm">
              No panel selected. Add a row above and click it to edit its board.
            </p>
          ) : (
            <div className="space-y-6">
              {catalogError && (
                <p className="text-xs text-red-500">
                  Failed to load board catalog: {catalogError}
                </p>
              )}

              {/* Selected panel summary */}
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p className="font-medium text-gray-900">
                  Panel: {selectedPanel.label || '(no label)'}
                </p>
                <p className="text-gray-700">
                  Size: {selectedPanel.length} × {selectedPanel.width} mm • Qty:{' '}
                  {selectedPanel.quantity}
                </p>
              </div>

              {/* Core type */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">
                  Core Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {coreTypes.map((core) => (
                    <Chip
                      key={core}
                      label={core.replace('_', ' ').toUpperCase()}
                      selected={selectedBoard.core_type === core}
                      onClick={() =>
                        updateSelectedPanelBoard('core_type', core)
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
              {availableThicknessesForSelected.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">
                    Thickness (mm)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableThicknessesForSelected.map((thickness) => (
                      <Chip
                        key={thickness}
                        label={`${thickness}mm`}
                        selected={selectedBoard.thickness_mm === thickness}
                        onClick={() =>
                          updateSelectedPanelBoard('thickness_mm', thickness)
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Company */}
              {availableCompaniesForSelected.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">
                    Company
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableCompaniesForSelected.map((company) => (
                      <Chip
                        key={company}
                        label={company}
                        selected={selectedBoard.company === company}
                        onClick={() =>
                          updateSelectedPanelBoard('company', company)
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Color */}
              {availableColorsForSelected.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {availableColorsForSelected.map((color) => (
                      <Chip
                        key={color.code}
                        label={`${color.code} - ${color.name}`}
                        variant="color"
                        color={color.hex}
                        selected={selectedBoard.color_code === color.code}
                        onClick={() => {
                          updateSelectedPanelBoard('color_code', color.code);
                          updateSelectedPanelBoard('color_name', color.name);
                          updateSelectedPanelBoard('color_hex', color.hex);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* OPTIONS + SUPPLY & CUSTOMER */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={handleNext} size="lg">
          Optimize & View Results
        </Button>
      </div>
    </div>
  );
}