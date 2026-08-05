import React from 'react';
import { AgGridWrapper } from './AgGridWrapper';
import { useGridStore } from '../../store/useGridStore';

interface BottomGridPanelProps {
  activePdfTitle: string;
}

export const BottomGridPanel: React.FC<BottomGridPanelProps> = ({ activePdfTitle }) => {
  const { confirmAIEdits, rejectAIEdits } = useGridStore();

  return (
    <footer className="panel bottom-grid">
      <div className="table-container">
        <AgGridWrapper filterPdfId="pdf-1" activePdfTitle={activePdfTitle} />
      </div>

      <div className="grid-toolbar bottom-toolbar">
        <span className="grid-scope-label">
          SCOPED TABLE (Active PDF: {activePdfTitle})
        </span>

        <div className="grid-actions">
          <button className="grid-action-btn primary">⚡ Extract Data</button>
          <button className="grid-action-btn">🔗 Merge Rows</button>
          <button className="grid-action-btn">✂️ Split Cell</button>
          <button className="grid-action-btn success" onClick={() => confirmAIEdits()}>
            ✓ Confirm All AI Edits
          </button>
          <button className="grid-action-btn danger" onClick={() => rejectAIEdits()}>
            ✗ Reject All AI Edits
          </button>
          <button className="grid-action-btn">Undo</button>
          <button className="grid-action-btn">Redo</button>
          <button className="grid-action-btn secondary">📥 Export CSV</button>
        </div>
      </div>
    </footer>
  );
};
