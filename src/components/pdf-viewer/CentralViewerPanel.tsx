import React from 'react';

interface CentralViewerPanelProps {
  activeView: 'pdf' | 'master_grid';
  activePdfTitle: string;
}

export const CentralViewerPanel: React.FC<CentralViewerPanelProps> = ({
  activeView,
  activePdfTitle,
}) => {
  if (activeView === 'master_grid') {
    return (
      <main className="panel central-viewer master-grid-mode">
        <div className="viewer-header">
          <span>WORKSPACE MASTER DATA GRID (GLOBAL VIEW)</span>
        </div>
        <div className="viewer-placeholder-content">
          <div className="placeholder-card">
            <h2>📊 Master Structured Data View</h2>
            <p>
              Displaying aggregated extraction table across all research papers in the workspace.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="panel central-viewer pdf-mode">
      <div className="viewer-header">
        <span>DOCUMENT VIEWER: {activePdfTitle}</span>
        <div className="viewer-controls">
          <button className="control-btn">Zoom In (+)</button>
          <button className="control-btn">Zoom Out (-)</button>
          <button className="control-btn">Fit Width</button>
        </div>
      </div>
      <div className="viewer-placeholder-content">
        <div className="pdf-paper-page">
          <h3>[PDF READER CANVAS PLACEHOLDER]</h3>
          <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>
            Showing pages for <strong>{activePdfTitle}</strong> with evidence bounding-box highlight layer.
          </p>
          <div className="evidence-highlight-snippet">
            Snippet Evidence Highlighted: "We evaluate our architecture on WMT 2014 English-to-German translation task..."
          </div>
        </div>
      </div>
    </main>
  );
};
