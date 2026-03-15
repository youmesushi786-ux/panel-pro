import { useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { StepPanels } from './pages/StepPanels';
import { StepResults } from './pages/StepResults';
import { ToastContainer, ToastProps } from './components/ui/Toast';
import { api } from './api/client';
import type {
  Panel,
  StockSheet,
  OptimizationOptions,
  CustomerDetails,
  SupplyMode,
  CuttingResponse,
  CuttingRequest,
} from './types';

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [stockSheets, setStockSheets] = useState<StockSheet[]>([
    { id: '1', length: 2440, width: 1220, quantity: 10 },
  ]);

  const [options, setOptions] = useState<OptimizationOptions>({
    kerf: 3,
    labels_on_panels: true,
    use_single_sheet: false,
    consider_material: true,
    edge_banding: true,
    consider_grain: false,
    allow_rotation: true,
    strict_validation: true,
    optimization_level: 2,
    strict_production_mode: true,
  });

  const [customer, setCustomer] = useState<CustomerDetails>({
    project_name: '',
    customer_name: '',
    email: '',
    phone: '',
    notes: '',
  });

  const [supply, setSupply] = useState<SupplyMode>({
    factory_supply: true,
    client_supply: false,
    client_board_qty: undefined,
    client_edging_meters: undefined,
  });

  const [results, setResults] = useState<CuttingResponse | null>(null);
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message, onClose: () => removeToast(id) }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleOptimize = async () => {
    if (panels.length === 0) {
      addToast('error', 'Please add at least one panel before optimizing');
      return;
    }

    if (!customer.project_name || !customer.customer_name) {
      addToast('error', 'Please fill in project name and customer name');
      return;
    }

    setIsOptimizing(true);

    try {
      const request: CuttingRequest = {
        panels: panels.map((p) => ({
          label: p.label,
          width: p.width,
          length: p.length,
          quantity: p.quantity,
          alignment: p.alignment,
          notes: p.notes,
          board: p.board,
          edging: p.edges,
        })),
        stock_sheets: stockSheets.map((s) => ({
          length: s.length,
          width: s.width,
          quantity: s.quantity,
        })),
        options,
        supply,
        customer,
      };

      const response = await api.optimize(request);
      setResults(response);
      setCurrentStep(2);
      addToast('success', 'Optimization completed successfully!');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleStepChange = (step: number) => {
    if (step === 2 && !results) {
      addToast('info', 'Please complete optimization first');
      return;
    }
    setCurrentStep(step);
  };

  return (
    <>
      <MainLayout
        currentStep={currentStep}
        onStepChange={handleStepChange}
        projectName={customer.project_name}
        canNavigate={results !== null}
      >
        {currentStep === 1 ? (
          <StepPanels
            panels={panels}
            onPanelsChange={setPanels}
            stockSheets={stockSheets}
            onStockSheetsChange={setStockSheets}
            options={options}
            onOptionsChange={setOptions}
            customer={customer}
            onCustomerChange={setCustomer}
            supply={supply}
            onSupplyChange={setSupply}
            onNext={handleOptimize}
          />
        ) : (
          <StepResults
            results={results}
            onBack={() => setCurrentStep(1)}
            customerEmail={customer.email}
            customerPhone={customer.phone}
            customerName={customer.customer_name}
            projectName={customer.project_name}
          />
        )}

        {isOptimizing && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 shadow-2xl">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-orange-600 mx-auto mb-4"></div>
              <p className="text-lg font-semibold text-gray-900">Optimizing layout...</p>
              <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
            </div>
          </div>
        )}
      </MainLayout>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

export default App;
