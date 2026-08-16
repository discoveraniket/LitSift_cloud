import React from 'react';
import { PanelLeft, PanelBottom, PanelRight, Maximize2, Settings, RotateCcw } from 'lucide-react';
import { getSelectedGeminiModel } from '../../services/geminiService';

interface HeaderBarProps {
  activeView: 'pdf' | 'master_grid';
  activePdfTitle?: string;
  showLeftPanel: boolean;
  showBottomPanel: boolean;
  showRightPanel: boolean;
  onToggleView: (view: 'pdf' | 'master_grid') => void;
  onToggleLeftPanel: () => void;
  onToggleBottomPanel: () => void;
  onToggleRightPanel: () => void;
  onToggleZenMode: () => void;
  onOpenSettings: () => void;
  onResetWorkspace: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  activeView,
  activePdfTitle = 'Sample_Research_Paper_2026.pdf',
  showLeftPanel,
  showBottomPanel,
  showRightPanel,
  onToggleView,
  onToggleLeftPanel,
  onToggleBottomPanel,
  onToggleRightPanel,
  onToggleZenMode,
  onOpenSettings,
  onResetWorkspace,
}) => {
  const currentModel = getSelectedGeminiModel();

  return (
    <header className="header-bar">
      <div className="header-brand">
        <span className="brand-logo">⚡</span>
        <span className="brand-title">LitSift Cloud</span>
        <span className="brand-badge">Agentic Workspace</span>
      </div>

      <div className="header-tabs">
        <button
          className={`header-tab ${activeView === 'pdf' ? 'active' : ''}`}
          onClick={() => onToggleView('pdf')}
        >
          📄 {activePdfTitle}
        </button>
        <button
          className={`header-tab ${activeView === 'master_grid' ? 'active' : ''}`}
          onClick={() => onToggleView('master_grid')}
        >
          📊 Master Data Grid
        </button>
      </div>

      <div className="header-controls">
        <button
          className="layout-toggle-btn reset-workspace-btn"
          onClick={onResetWorkspace}
          title="Reset Workspace & Start Fresh Project (Clears all PDFs, table rows, and chat history)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            background: 'var(--bg-secondary)',
            cursor: 'pointer',
          }}
        >
          <RotateCcw size={13} color="var(--accent-warning, #f9e2af)" />
          <span style={{ fontSize: '11px', fontWeight: 600 }}>New Project</span>
        </button>

        <button
          className="layout-toggle-btn"
          onClick={onOpenSettings}
          title={`Configure AI Model & API Settings (Active: ${currentModel})`}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', fontSize: '11px' }}
        >
          <Settings size={15} color="var(--accent-primary)" />
          <span style={{ fontSize: '11px', fontWeight: 600 }}>{currentModel}</span>
        </button>

        <div className="status-indicator">
          <span className="status-dot online"></span>
          AI Ready
        </div>

        <div className="layout-toggle-group">
          <button
            className={`layout-toggle-btn ${showLeftPanel ? 'active' : ''}`}
            onClick={onToggleLeftPanel}
            title="Toggle Left Explorer (Ctrl+B)"
          >
            <PanelLeft size={16} />
          </button>
          <button
            className={`layout-toggle-btn ${showBottomPanel ? 'active' : ''}`}
            onClick={onToggleBottomPanel}
            title="Toggle Bottom Data Grid"
          >
            <PanelBottom size={16} />
          </button>
          <button
            className={`layout-toggle-btn ${showRightPanel ? 'active' : ''}`}
            onClick={onToggleRightPanel}
            title="Toggle Right AI Agent"
          >
            <PanelRight size={16} />
          </button>
          <button
            className="layout-toggle-btn zen-btn"
            onClick={onToggleZenMode}
            title="Zen Reader Mode (Hide All Panels)"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};
