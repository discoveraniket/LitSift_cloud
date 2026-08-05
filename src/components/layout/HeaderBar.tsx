import React from 'react';

interface HeaderBarProps {
  activeView: 'pdf' | 'master_grid';
  activePdfTitle?: string;
  onToggleView: (view: 'pdf' | 'master_grid') => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  activeView,
  activePdfTitle = 'Sample_Research_Paper_2026.pdf',
  onToggleView,
}) => {
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

      <div className="header-actions">
        <span className="status-indicator">
          <span className="status-dot online"></span>
          AI Agent Ready
        </span>
      </div>
    </header>
  );
};
