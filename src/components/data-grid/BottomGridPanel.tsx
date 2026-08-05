import React from 'react';

interface BottomGridPanelProps {
  activePdfTitle: string;
}

export const BottomGridPanel: React.FC<BottomGridPanelProps> = ({ activePdfTitle }) => {
  return (
    <footer className="panel bottom-grid">
      <div className="grid-toolbar">
        <span className="grid-scope-label">
          SCOPED TABLE (Active PDF: {activePdfTitle})
        </span>
        <div className="grid-actions">
          <button className="grid-action-btn primary">⚡ Extract Data</button>
          <button className="grid-action-btn">🔗 Merge Rows</button>
          <button className="grid-action-btn">✂️ Split Cell</button>
          <button className="grid-action-btn success">✓ Confirm AI Edits</button>
          <button className="grid-action-btn danger">✗ Reject AI Edits</button>
          <button className="grid-action-btn">Undo</button>
          <button className="grid-action-btn">Redo</button>
          <button className="grid-action-btn secondary">📥 Export CSV</button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-grid-table">
          <thead>
            <tr>
              <th>Row #</th>
              <th>Document</th>
              <th>Methodology</th>
              <th>Sample Size</th>
              <th>Key Results</th>
              <th>AI Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="ai-pending-row">
              <td>1</td>
              <td>{activePdfTitle}</td>
              <td>Transformer Self-Attention Mechanism</td>
              <td>8 x NVIDIA P100 GPUs</td>
              <td>28.4 BLEU score on WMT 2014 EN-DE</td>
              <td>
                <span className="pending-badge">Pending Review</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </footer>
  );
};
