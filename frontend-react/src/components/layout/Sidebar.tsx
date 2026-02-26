import { Layers, Receipt, CheckCircle } from 'lucide-react';

interface SidebarProps {
  currentStep: number;
  onStepChange: (step: number) => void;
  projectName?: string;
  canNavigate: boolean;
}

export function Sidebar({ currentStep, onStepChange, projectName, canNavigate }: SidebarProps) {
  const steps = [
    { id: 1, label: 'Panels & Board', icon: Layers },
    { id: 2, label: 'Results & Payment', icon: Receipt },
  ];

  return (
    <aside className="w-64 bg-gray-900 text-white shadow-xl flex flex-col">
      <div className="p-6">
        <h2 className="text-xs uppercase tracking-wider text-gray-400 mb-4">Workflow</h2>
        <nav className="space-y-2">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = step.id < currentStep;
            const isClickable = step.id === 1 || (step.id === 2 && canNavigate);

            return (
              <button
                key={step.id}
                onClick={() => isClickable && onStepChange(step.id)}
                disabled={!isClickable}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-lg'
                    : isCompleted
                    ? 'bg-green-700 text-white hover:bg-green-600'
                    : isClickable
                    ? 'hover:bg-gray-800 text-gray-300'
                    : 'text-gray-600 cursor-not-allowed'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
                <span className="text-sm font-medium">{step.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-6 border-t border-gray-800">
        <h2 className="text-xs uppercase tracking-wider text-gray-400 mb-2">Project</h2>
        <p className="text-sm text-white">
          {projectName || <span className="text-gray-500">No project yet</span>}
        </p>
      </div>
    </aside>
  );
}
