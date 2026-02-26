import { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
  children: ReactNode;
  currentStep: number;
  onStepChange: (step: number) => void;
  projectName?: string;
  canNavigate: boolean;
}

export function MainLayout({ children, currentStep, onStepChange, projectName, canNavigate }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      <TopNav />
      <div className="flex flex-1">
        <Sidebar
          currentStep={currentStep}
          onStepChange={onStepChange}
          projectName={projectName}
          canNavigate={canNavigate}
        />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
