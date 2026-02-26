import { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';

export interface MainLayoutProps {
  children: ReactNode;
  currentStep: number;
  onStepChange: (step: number) => void;
  projectName?: string;
  canNavigate: boolean;
}

export function MainLayout({
  children,
  currentStep,
  onStepChange,
  projectName,
  canNavigate,
}: MainLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Top navigation */}
      <TopNav />

      {/* Content area: stack on mobile, sidebar on the left on md+ */}
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar
          currentStep={currentStep}
          onStepChange={onStepChange}
          projectName={projectName}
          canNavigate={canNavigate}
        />

        <main className="flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}