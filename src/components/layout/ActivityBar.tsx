import React from 'react';
import {
  Files,
  Table,
  Terminal,
  Settings,
  Maximize2,
  RotateCcw,
  Bug,
} from 'lucide-react';
import { getSelectedGeminiModel } from '../../services/geminiService';
import { useLogStore } from '../../store/useLogStore';

interface ActivityBarProps {
  showLeftPanel: boolean;
  showBottomPanel: boolean;
  activeView: 'pdf' | 'master_grid';
  onToggleLeftPanel: () => void;
  onToggleBottomPanel: () => void;
  onOpenMasterGrid: () => void;
  onOpenDebugLogs: () => void;
  onToggleZenMode: () => void;
  onOpenSettings: () => void;
  onResetWorkspace: () => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  showLeftPanel,
  showBottomPanel,
  activeView,
  onToggleLeftPanel,
  onToggleBottomPanel,
  onOpenMasterGrid,
  onOpenDebugLogs,
  onToggleZenMode,
  onOpenSettings,
  onResetWorkspace,
}) => {
  const currentModel = getSelectedGeminiModel();
  const logCount = useLogStore((state) => state.logs.length);

  return (
    <aside className="activity-bar">
      <div className="activity-bar-top">
        {/* Brand/Logo Badge */}
        <div className="activity-item brand-item" title="LitSift Cloud — Agentic Research Workspace">
          <span className="activity-logo">⚡</span>
        </div>

        {/* Explorer (Left Panel Toggle) */}
        <button
          className={`activity-item ${showLeftPanel ? 'active' : ''}`}
          onClick={onToggleLeftPanel}
          title="Explorer (PDF Papers & Schemas)"
        >
          <Files size={19} />
          <span className="activity-tooltip">Explorer</span>
        </button>

        {/* Master Data Grid View Toggle */}
        <button
          className={`activity-item ${activeView === 'master_grid' ? 'active' : ''}`}
          onClick={onOpenMasterGrid}
          title="Master Extraction Data Grid View"
        >
          <Table size={19} />
          <span className="activity-tooltip">Data Grid</span>
        </button>

        {/* Debug Logs Viewer Button */}
        <button
          className="activity-item"
          onClick={onOpenDebugLogs}
          title={`Agent Debug & Telemetry Logs (${logCount} events)`}
          style={{ position: 'relative' }}
        >
          <Bug size={19} color={logCount > 0 ? 'var(--accent-primary)' : undefined} />
          {logCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '5px',
                right: '5px',
                background: 'var(--accent-primary)',
                color: 'var(--bg-primary)',
                borderRadius: '8px',
                fontSize: '8.5px',
                fontWeight: 700,
                padding: '0 3.5px',
                lineHeight: '12px',
                minWidth: '12px',
                textAlign: 'center',
              }}
            >
              {logCount > 99 ? '99+' : logCount}
            </span>
          )}
          <span className="activity-tooltip">Debug Logs</span>
        </button>

        {/* Bottom Panel Toggle */}
        <button
          className={`activity-item ${showBottomPanel ? 'active' : ''}`}
          onClick={onToggleBottomPanel}
          title="Toggle Bottom Extraction Grid & Logs Drawer"
        >
          <Terminal size={19} />
          <span className="activity-tooltip">Bottom Grid</span>
        </button>
      </div>

      <div className="activity-bar-bottom">
        {/* Zen Mode Toggle */}
        <button
          className="activity-item"
          onClick={onToggleZenMode}
          title="Zen Reader Mode (Toggle Distraction-Free Workspace)"
        >
          <Maximize2 size={18} />
          <span className="activity-tooltip">Zen Reader</span>
        </button>

        {/* New Project / Reset Workspace */}
        <button
          className="activity-item danger-item"
          onClick={onResetWorkspace}
          title="New Project (Reset Workspace & Start Fresh)"
        >
          <RotateCcw size={18} color="var(--accent-warning, #f9e2af)" />
          <span className="activity-tooltip">New Project</span>
        </button>

        {/* Settings Button */}
        <button
          className="activity-item"
          onClick={onOpenSettings}
          title={`AI Settings & Model Selection (Active: ${currentModel})`}
        >
          <Settings size={18} />
          <span className="activity-tooltip">Settings</span>
        </button>
      </div>
    </aside>
  );
};
