import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronUp, ChevronDown, X, Download, Table, FileArchive, Keyboard } from 'lucide-react';
import { AgGridWrapper } from '../data-grid/AgGridWrapper';
import { PdfReader, PdfReaderRef } from './PdfReader';
import { WorkspaceHubView } from '../workspace/WorkspaceHubView';
import { usePdfStore } from '../../store/usePdfStore';
import { downloadPdfFile } from '../../services/workspaceService';
import { EditorTab } from '../../types/layout';

interface CentralViewerPanelProps {
  activeTab?: EditorTab | null;
  activePdfId?: string;
  activePdfTitle: string;
  initialHubSection?: 'export' | 'import';
  pendingWorkspaceFile?: File | null;
  onNavigateToGrid?: () => void;
  onNavigateToPdf?: (pdfId: string) => void;
  onOpenWorkspaceHub?: (section?: 'export' | 'import') => void;
}

export const CentralViewerPanel: React.FC<CentralViewerPanelProps> = ({
  activeTab,
  activePdfId,
  activePdfTitle,
  initialHubSection = 'export',
  pendingWorkspaceFile = null,
  onNavigateToGrid,
  onNavigateToPdf,
  onOpenWorkspaceHub,
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

  // Target PDF ID can come from activeTab or activePdfId prop
  const targetPdfId = (activeTab?.type === 'pdf' && activeTab.pdfId) ? activeTab.pdfId : activePdfId;

  // Retrieve matching PDF url from usePdfStore
  const foundPdf = pdfs.find((p) => p.id === targetPdfId || p.name === activePdfTitle);
  const pdfUrl = foundPdf?.url || '';

  const handleDownloadActivePdf = () => {
    if (foundPdf) {
      downloadPdfFile({
        name: foundPdf.name,
        file: foundPdf.file,
        base64: foundPdf.base64,
        url: foundPdf.url,
      });
    }
  };

  // Intercept Ctrl+F to open the in-viewer PDF search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && activeTab?.type === 'pdf' && pdfUrl) {
        e.preventDefault();
        setShowSearchBar(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === 'Escape' && showSearchBar) {
        handleCloseSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, pdfUrl, showSearchBar]);

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

  // 0. Empty Editor State (When all tabs are closed)
  if (!activeTab) {
    return (
      <main
        className="panel central-viewer empty-editor-mode"
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary, #1e1e2e)',
          color: 'var(--text-secondary, #a6adc8)',
          userSelect: 'none',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '560px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '20px',
          }}
        >
          {/* Logo Badge */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(137, 180, 250, 0.2), rgba(180, 190, 254, 0.1))',
              border: '1px solid rgba(137, 180, 250, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            }}
          >
            ⚡
          </div>

          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary, #cdd6f4)', marginBottom: '4px' }}>
              LitSift Cloud
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #6c7086)' }}>
              Agentic Literature Review & Paper Synthesis Workspace
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}>
            <button
              onClick={onNavigateToGrid}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '6px',
                background: 'rgba(166, 227, 161, 0.12)',
                border: '1px solid rgba(166, 227, 161, 0.3)',
                color: 'var(--accent-success, #a6e3a1)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(166, 227, 161, 0.2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(166, 227, 161, 0.12)';
              }}
            >
              <Table size={14} />
              <span>Open Master Data Grid</span>
            </button>

            <button
              onClick={() => onOpenWorkspaceHub?.('export')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '6px',
                background: 'rgba(137, 180, 250, 0.12)',
                border: '1px solid rgba(137, 180, 250, 0.3)',
                color: 'var(--accent-primary, #89b4fa)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(137, 180, 250, 0.2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(137, 180, 250, 0.12)';
              }}
            >
              <FileArchive size={14} />
              <span>Open Workspace Hub</span>
            </button>
          </div>

          {/* Quick Shortcuts Cheat Sheet */}
          <div
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '14px 18px',
              borderRadius: '8px',
              background: 'var(--bg-secondary, #181825)',
              border: '1px solid var(--border-subtle, #313244)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '11px',
              textAlign: 'left',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Keyboard size={13} /> Keyboard Shortcuts
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle, #313244)', paddingTop: '6px' }}>
              <span>Toggle Left Explorer</span>
              <kbd style={{ background: 'var(--bg-tertiary, #11111b)', border: '1px solid var(--border-subtle, #313244)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Ctrl + B</kbd>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Search in PDF</span>
              <kbd style={{ background: 'var(--bg-tertiary, #11111b)', border: '1px solid var(--border-subtle, #313244)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Ctrl + F</kbd>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Open Research Papers</span>
              <span style={{ color: 'var(--text-muted)' }}>Click paper in Left Explorer</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // 1. Workspace Project Hub View
  if (activeTab.type === 'workspace_hub') {
    return (
      <main className="panel central-viewer workspace-hub-mode" style={{ height: '100%', padding: 0 }}>
        <WorkspaceHubView
          initialSection={initialHubSection}
          pendingFile={pendingWorkspaceFile}
          onNavigateToGrid={onNavigateToGrid}
          onNavigateToPdf={onNavigateToPdf}
        />
      </main>
    );
  }

  // 2. Master Data Grid Mode
  if (activeTab.type === 'master_grid') {
    return (
      <main className="panel central-viewer master-grid-mode" style={{ height: '100%', padding: 0 }}>
        <div className="table-container" style={{ height: '100%', padding: 0 }}>
          <AgGridWrapper />
        </div>
      </main>
    );
  }

  // 3. PDF Mode
  return (
    <main className="panel central-viewer pdf-mode" style={{ position: 'relative', height: '100%' }}>
      {/* Floating In-Viewer Controls Overlay */}
      {pdfUrl && (
        <div
          className="viewer-controls"
          style={{
            position: 'absolute',
            top: '6px',
            right: '12px',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '2px 6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          <button
            className="control-btn"
            onClick={handleDownloadActivePdf}
            title={`Download ${activePdfTitle} to your computer`}
            style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 7px', color: 'var(--accent-primary)' }}
          >
            <Download size={11} /> PDF
          </button>
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
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', padding: '0 4px', fontWeight: 600 }}>
            {Math.round(zoomScale * 100)}%
          </span>
          <button className="control-btn" onClick={handleZoomIn}>Zoom In (+)</button>
          <button className="control-btn" onClick={handleFitWidth}>Fit Width</button>
        </div>
      )}

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
            key={targetPdfId || activePdfTitle}
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
