import React, { useEffect, useState } from 'react';
import WorkspaceLayout from './components/layout/WorkspaceLayout';
import { usePdfStore } from './store/usePdfStore';
import { useGridStore } from './store/useGridStore';
import { useAgentStore } from './store/useAgentStore';
import './styles/theme.css';

export const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Hydrate all stores in parallel from IndexedDB
    Promise.all([
      usePdfStore.getState().hydrateFromDb(),
      useGridStore.getState().hydrateFromDb(),
      useAgentStore.getState().hydrateFromDb(),
    ])
      .catch((err) => console.warn('IndexedDB initial hydration notice:', err))
      .finally(() => setIsReady(true));
  }, []);

  if (!isReady) {
    return (
      <div
        style={{
          height: '100vh',
          width: '100vw',
          background: 'var(--bg-primary, #1e1e2e)',
          color: 'var(--accent-primary, #89b4fa)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.5px' }}>
          LITSIFT CLOUD
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary, #a6adc8)' }}>
          Resuming local workspace from IndexedDB...
        </div>
      </div>
    );
  }

  return <WorkspaceLayout />;
};

export default App;
