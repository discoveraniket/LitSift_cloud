import React, { useState } from 'react';
import { AgGridWrapper } from '../data-grid/AgGridWrapper';
import { PdfReader } from './PdfReader';
import { usePdfStore } from '../../store/usePdfStore';

interface CentralViewerPanelProps {
  activeView: 'pdf' | 'master_grid';
  activePdfId?: string;
  activePdfTitle: string;
}

export const CentralViewerPanel: React.FC<CentralViewerPanelProps> = ({
  activeView,
  activePdfId,
  activePdfTitle,
}) => {
  const [zoomScale, setZoomScale] = useState<number>(1.2);
  const pdfs = usePdfStore((state) => state.pdfs);

  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 0.2, 2.5));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 0.2, 0.6));
  const handleFitWidth = () => setZoomScale(1.1);

  // Retrieve matching PDF url from usePdfStore or fallback to sample PDF
  const foundPdf = pdfs.find((p) => p.id === activePdfId || p.name === activePdfTitle);
  const pdfUrl = foundPdf?.url || '/sample-pdfs/38094623.pdf';

  if (activeView === 'master_grid') {
    return (
      <main className="panel central-viewer master-grid-mode">
        <div className="viewer-header">
          <span>WORKSPACE MASTER DATA GRID (GLOBAL VIEW - ALL PAPERS)</span>
        </div>
        <div className="table-container" style={{ height: 'calc(100% - 32px)', padding: '4px' }}>
          <AgGridWrapper />
        </div>
      </main>
    );
  }

  return (
    <main className="panel central-viewer pdf-mode">
      <div className="viewer-header">
        <span>DOCUMENT VIEWER: {activePdfTitle}</span>
        <div className="viewer-controls">
          <button className="control-btn" onClick={handleZoomOut}>Zoom Out (-)</button>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '0 4px' }}>
            {Math.round(zoomScale * 100)}%
          </span>
          <button className="control-btn" onClick={handleZoomIn}>Zoom In (+)</button>
          <button className="control-btn" onClick={handleFitWidth}>Fit Width</button>
        </div>
      </div>
      <div className="viewer-placeholder-content" style={{ padding: 0, height: 'calc(100% - 32px)' }}>
        <PdfReader key={activePdfTitle} pdfUrl={pdfUrl} zoomScale={zoomScale} />
      </div>
    </main>
  );
};
