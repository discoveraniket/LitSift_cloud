import React, { useState } from 'react';
import { AgGridWrapper } from './AgGridWrapper';
import { parseCsv } from '../../services/csvImportService';
import { useGridStore } from '../../store/useGridStore';
import { UploadCloud } from 'lucide-react';

interface BottomGridPanelProps {
  activePdfId?: string;
  activePdfTitle?: string;
}

export const BottomGridPanel: React.FC<BottomGridPanelProps> = ({ activePdfId, activePdfTitle }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files[0] && files[0].name.toLowerCase().endsWith('.csv')) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (text) {
          const parsed = parseCsv(text, file.name);
          useGridStore.getState().setPendingCsvImport(parsed);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div
      className="panel bottom-grid"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(24, 24, 37, 0.92)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: 'var(--accent-primary, #89b4fa)',
            fontSize: '13px',
            fontWeight: 600,
            border: '2px dashed var(--accent-primary, #89b4fa)',
            pointerEvents: 'none',
          }}
        >
          <UploadCloud size={20} />
          Drop CSV to Import Schema or Dataset
        </div>
      )}
      <div className="table-container" style={{ flex: 1, height: '100%', padding: 0 }}>
        <AgGridWrapper filterPdfId={activePdfId} activePdfTitle={activePdfTitle} isPreviewMode={true} />
      </div>
    </div>
  );
};
