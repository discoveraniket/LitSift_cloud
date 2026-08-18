import React from 'react';
import { AgGridWrapper } from './AgGridWrapper';

interface BottomGridPanelProps {
  activePdfId?: string;
  activePdfTitle?: string;
}

export const BottomGridPanel: React.FC<BottomGridPanelProps> = ({ activePdfId, activePdfTitle }) => {
  return (
    <div className="panel bottom-grid" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="table-container" style={{ flex: 1, height: '100%', padding: 0 }}>
        <AgGridWrapper filterPdfId={activePdfId} activePdfTitle={activePdfTitle} isPreviewMode={true} />
      </div>
    </div>
  );
};
