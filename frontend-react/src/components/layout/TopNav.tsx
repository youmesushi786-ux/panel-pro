import { useEffect, useState } from 'react';
import { Box } from 'lucide-react';
import { api } from '../../api/client';

export function TopNav() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'healthy' | 'offline'>('checking');

  useEffect(() => {
    const checkHealth = async () => {
      try {
        await api.checkHealth();
        setApiStatus('healthy');
      } catch {
        setApiStatus('offline');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusColors = {
    checking: 'bg-yellow-500',
    healthy: 'bg-green-500',
    offline: 'bg-red-500',
  };

  const statusLabels = {
    checking: 'Checking',
    healthy: 'Healthy',
    offline: 'Offline',
  };

  return (
    <nav className="bg-gray-900 text-white shadow-lg z-50">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 perspective-1000">
            <div className="w-full h-full animate-rotate-cube" style={{ transformStyle: 'preserve-3d' }}>
              <Box className="w-10 h-10 text-orange-500" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold">PanelPro</h1>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Cutting Optimizer</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">API:</span>
          <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 ${statusColors[apiStatus]} bg-opacity-20`}>
            <div className={`w-2 h-2 rounded-full ${statusColors[apiStatus]}`} />
            {statusLabels[apiStatus]}
          </div>
        </div>
      </div>
    </nav>
  );
}
