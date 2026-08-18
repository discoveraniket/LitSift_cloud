import React from 'react';
import { PanelLeft, PanelBottom, PanelRight, FileText, Table } from 'lucide-react';

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
}) => {
  return (
    <header className="header-bar" style={{ height: '30px', padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Left: Editor Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '100%' }}>
        <div className="header-tabs" style={{ display: 'flex', height: '100%', gap: '2px' }}>
          <button
            className={`header-tab ${activeView === 'pdf' ? 'active' : ''}`}
            onClick={() => onToggleView('pdf')}
            style={{ fontSize: '11px', padding: '0 10px' }}
          >
            <FileText size={12} className="tab-icon pdf-icon" />
            <span className="tab-title">{activePdfTitle}</span>
          </button>
          <button
            className={`header-tab ${activeView === 'master_grid' ? 'active' : ''}`}
            onClick={() => onToggleView('master_grid')}
            style={{ fontSize: '11px', padding: '0 10px' }}
          >
            <Table size={12} className="tab-icon grid-icon" />
            <span className="tab-title">Master Data Grid</span>
          </button>
        </div>
      </div>

      {/* Center: Sleek Muted Breadcrumb */}
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.8 }}>
        <span>LitSift Cloud</span>
        <span>/</span>
        <span>{activeView === 'pdf' ? activePdfTitle : 'Master Data Grid'}</span>
      </div>

      {/* Right: Panel Controls */}
      <div className="header-controls">
        <div className="layout-toggle-group">
          <button
            className={`layout-toggle-btn ${showLeftPanel ? 'active' : ''}`}
            onClick={onToggleLeftPanel}
            title="Toggle Left Explorer (Ctrl+B)"
          >
            <PanelLeft size={14} />
          </button>
          <button
            className={`layout-toggle-btn ${showBottomPanel ? 'active' : ''}`}
            onClick={onToggleBottomPanel}
            title="Toggle Bottom Data Grid Panel"
          >
            <PanelBottom size={14} />
          </button>
          <button
            className={`layout-toggle-btn ${showRightPanel ? 'active' : ''}`}
            onClick={onToggleRightPanel}
            title="Toggle Right AI Copilot"
          >
            <PanelRight size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};
