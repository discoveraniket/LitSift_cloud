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

  // Retrieve matching PDF url from usePdfStore
  const foundPdf = pdfs.find((p) => p.id === activePdfId || p.name === activePdfTitle);
  const pdfUrl = foundPdf?.url || '';

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
        {pdfUrl && (
          <div className="viewer-controls">
            <button className="control-btn" onClick={handleZoomOut}>Zoom Out (-)</button>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '0 4px' }}>
              {Math.round(zoomScale * 100)}%
            </span>
            <button className="control-btn" onClick={handleZoomIn}>Zoom In (+)</button>
            <button className="control-btn" onClick={handleFitWidth}>Fit Width</button>
          </div>
        )}
      </div>
      <div className="viewer-placeholder-content" style={{ padding: 0, height: 'calc(100% - 32px)' }}>
        {pdfUrl ? (
          <PdfReader key={activePdfTitle} pdfUrl={pdfUrl} zoomScale={zoomScale} />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              gap: '12px',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32px' }}>📄</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              No Research Paper Selected
            </div>
            <div style={{ fontSize: '12px', maxWidth: '360px', lineHeight: 1.5 }}>
              Upload a research PDF using the <strong>+</strong> button under <strong>RESEARCH PAPERS</strong> in the left explorer panel to begin synthesis.
            </div>
          </div>
        )}
      </div>
    </main>
  );
};
