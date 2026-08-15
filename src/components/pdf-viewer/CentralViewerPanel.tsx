import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { AgGridWrapper } from '../data-grid/AgGridWrapper';
import { PdfReader, PdfReaderRef } from './PdfReader';
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

  // In-Viewer Find / Search Bar State
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);

  const pdfReaderRef = useRef<PdfReaderRef>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 0.2, 2.5));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 0.2, 0.6));
  const handleFitWidth = () => setZoomScale(1.1);

  // Retrieve matching PDF url from usePdfStore
  const foundPdf = pdfs.find((p) => p.id === activePdfId || p.name === activePdfTitle);
  const pdfUrl = foundPdf?.url || '';

  // Intercept Ctrl+F to open the in-viewer PDF search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && activeView === 'pdf' && pdfUrl) {
        e.preventDefault();
        setShowSearchBar(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === 'Escape' && showSearchBar) {
        handleCloseSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, pdfUrl, showSearchBar]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    pdfReaderRef.current?.search(query);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        pdfReaderRef.current?.prevMatch();
      } else {
        pdfReaderRef.current?.nextMatch();
      }
    }
  };

  const handleCloseSearch = () => {
    setShowSearchBar(false);
    setSearchQuery('');
    setCurrentMatch(0);
    setTotalMatches(0);
    pdfReaderRef.current?.clearSearch();
  };

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
    <main className="panel central-viewer pdf-mode" style={{ position: 'relative' }}>
      <div className="viewer-header">
        <span>DOCUMENT VIEWER: {activePdfTitle}</span>
        {pdfUrl && (
          <div className="viewer-controls" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              className="control-btn"
              onClick={() => {
                setShowSearchBar(true);
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }}
              title="Find text in PDF (Ctrl+F)"
              style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 7px' }}
            >
              <Search size={11} /> Find
            </button>
            <button className="control-btn" onClick={handleZoomOut}>Zoom Out (-)</button>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '0 4px' }}>
              {Math.round(zoomScale * 100)}%
            </span>
            <button className="control-btn" onClick={handleZoomIn}>Zoom In (+)</button>
            <button className="control-btn" onClick={handleFitWidth}>Fit Width</button>
          </div>
        )}
      </div>

      {/* Floating In-Viewer Find Bar */}
      {showSearchBar && pdfUrl && (
        <div
          style={{
            position: 'absolute',
            top: '38px',
            right: '24px',
            zIndex: 100,
            background: 'var(--bg-surface, #252538)',
            border: '1px solid var(--border-subtle, #3b3b4f)',
            borderRadius: '6px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <Search size={13} color="var(--text-secondary)" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Find in document..."
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            style={{
              background: 'var(--bg-secondary, #181825)',
              border: '1px solid var(--border-subtle, #3b3b4f)',
              color: 'var(--text-primary, #cdd6f4)',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '11px',
              width: '170px',
              outline: 'none',
            }}
          />
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', minWidth: '55px', textAlign: 'center' }}>
            {totalMatches > 0 ? `${currentMatch} of ${totalMatches}` : searchQuery ? 'No matches' : ''}
          </span>
          <button
            onClick={() => pdfReaderRef.current?.prevMatch()}
            disabled={totalMatches === 0}
            title="Previous match (Shift+Enter)"
            style={{
              background: 'none',
              border: 'none',
              color: totalMatches > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: totalMatches > 0 ? 'pointer' : 'default',
              padding: '2px',
              display: 'flex',
            }}
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => pdfReaderRef.current?.nextMatch()}
            disabled={totalMatches === 0}
            title="Next match (Enter)"
            style={{
              background: 'none',
              border: 'none',
              color: totalMatches > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: totalMatches > 0 ? 'pointer' : 'default',
              padding: '2px',
              display: 'flex',
            }}
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={handleCloseSearch}
            title="Close find bar (Escape)"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              marginLeft: '2px',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="viewer-placeholder-content" style={{ padding: 0, height: 'calc(100% - 32px)' }}>
        {pdfUrl ? (
          <PdfReader
            ref={pdfReaderRef}
            key={activePdfTitle}
            pdfUrl={pdfUrl}
            zoomScale={zoomScale}
            onMatchCountChange={(curr, tot) => {
              setCurrentMatch(curr);
              setTotalMatches(tot);
            }}
          />
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
