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
    <header className="header-bar">
      {/* VS Code Style Editor Tabs Strip */}
      <div className="header-tabs">
        <button
          className={`header-tab ${activeView === 'pdf' ? 'active' : ''}`}
          onClick={() => onToggleView('pdf')}
        >
          <FileText size={13} className="tab-icon pdf-icon" />
          <span className="tab-title">{activePdfTitle}</span>
        </button>
        <button
          className={`header-tab ${activeView === 'master_grid' ? 'active' : ''}`}
          onClick={() => onToggleView('master_grid')}
        >
          <Table size={13} className="tab-icon grid-icon" />
          <span className="tab-title">Master Data Grid</span>
        </button>
      </div>

      {/* VS Code Panel Layout Controls */}
      <div className="header-controls">
        <div className="layout-toggle-group">
          <button
            className={`layout-toggle-btn ${showLeftPanel ? 'active' : ''}`}
            onClick={onToggleLeftPanel}
            title="Toggle Left Explorer (Ctrl+B)"
          >
            <PanelLeft size={15} />
          </button>
          <button
            className={`layout-toggle-btn ${showBottomPanel ? 'active' : ''}`}
            onClick={onToggleBottomPanel}
            title="Toggle Bottom Data Grid Panel"
          >
            <PanelBottom size={15} />
          </button>
          <button
            className={`layout-toggle-btn ${showRightPanel ? 'active' : ''}`}
            onClick={onToggleRightPanel}
            title="Toggle Right AI Copilot"
          >
            <PanelRight size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};
