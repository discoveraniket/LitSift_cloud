import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronUp, ChevronDown, X, Download, Table, FileArchive, Keyboard, BookOpen, FileText, Link } from 'lucide-react';
import { AgGridWrapper } from '../data-grid/AgGridWrapper';
import { PdfReader, PdfReaderRef } from './PdfReader';
import { ArticleReaderView } from './ArticleReaderView';
import { WorkspaceHubView } from '../workspace/WorkspaceHubView';
import { ImportDoiModal } from '../explorer/ImportDoiModal';
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
  const [viewMode, setViewMode] = useState<'pdf' | 'reader'>('pdf');
  const [showDoiModal, setShowDoiModal] = useState(false);

  const pdfs = usePdfStore((state) => state.pdfs);
  const setActivePdf = usePdfStore((state) => state.setActivePdf);

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

  // Retrieve matching paper document from usePdfStore
  const foundPdf = pdfs.find((p) => p.id === targetPdfId || p.name === activePdfTitle);
  const pdfUrl = foundPdf?.url || '';

  // Auto-switch to Reader mode if document has no PDF binary
  useEffect(() => {
    if (foundPdf && !foundPdf.url && (foundPdf.abstractText || (foundPdf.sections && foundPdf.sections.length > 0))) {
      setViewMode('reader');
    }
  }, [foundPdf?.id, foundPdf?.url]);

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && activeTab?.type === 'pdf' && pdfUrl && viewMode === 'pdf') {
        e.preventDefault();
        setShowSearchBar(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === 'Escape' && showSearchBar) {
        handleCloseSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, pdfUrl, showSearchBar, viewMode]);

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
              onClick={() => setShowDoiModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '6px',
                background: 'rgba(137, 180, 250, 0.15)',
                border: '1px solid rgba(137, 180, 250, 0.35)',
                color: 'var(--accent-primary, #89b4fa)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(137, 180, 250, 0.25)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(137, 180, 250, 0.15)';
              }}
            >
              <Link size={14} />
              <span>Import Paper by DOI</span>
            </button>

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
                background: 'var(--bg-tertiary, #11111b)',
                border: '1px solid var(--border-subtle, #313244)',
                color: 'var(--text-secondary, #a6adc8)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(137, 180, 250, 0.1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary, #11111b)';
              }}
            >
              <FileArchive size={14} />
              <span>Workspace Hub</span>
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
              <Keyboard size={13} /> Quick Guide
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle, #313244)', paddingTop: '6px' }}>
              <span>Paste Scientific DOI</span>
              <span style={{ color: 'var(--accent-primary)' }}>Click "Import Paper by DOI" or 🔗 in Left Explorer</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Search in PDF</span>
              <kbd style={{ background: 'var(--bg-tertiary, #11111b)', border: '1px solid var(--border-subtle, #313244)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Ctrl + F</kbd>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Toggle Left Explorer</span>
              <kbd style={{ background: 'var(--bg-tertiary, #11111b)', border: '1px solid var(--border-subtle, #313244)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Ctrl + B</kbd>
            </div>
          </div>
        </div>

        <ImportDoiModal
          isOpen={showDoiModal}
          onClose={() => setShowDoiModal(false)}
          onPaperImported={(paper) => {
            setActivePdf(paper.id);
            if (onNavigateToPdf) onNavigateToPdf(paper.id);
          }}
        />
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

  // 3. Paper Document Mode (PDF View or Structured Reader View)
  const hasPdfUrl = Boolean(pdfUrl);

  return (
    <main className="panel central-viewer pdf-mode" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top Multi-View & Controls Overlay Header */}
      {foundPdf && (
        <div
          style={{
            height: '38px',
            background: 'var(--bg-tertiary, #11111b)',
            borderBottom: '1px solid var(--border-subtle, #313244)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            zIndex: 20,
            flexShrink: 0,
          }}
        >
          {/* Left: View Mode Segmented Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-secondary, #181825)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle, #313244)' }}>
            <button
              onClick={() => setViewMode('pdf')}
              disabled={!hasPdfUrl}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '4px',
                border: 'none',
                background: viewMode === 'pdf' ? 'rgba(137, 180, 250, 0.2)' : 'transparent',
                color: viewMode === 'pdf' ? 'var(--accent-primary, #89b4fa)' : hasPdfUrl ? 'var(--text-secondary, #a6adc8)' : 'var(--text-muted, #585b70)',
                fontSize: '11.5px',
                fontWeight: viewMode === 'pdf' ? 600 : 500,
                cursor: hasPdfUrl ? 'pointer' : 'not-allowed',
                opacity: hasPdfUrl ? 1 : 0.5,
                transition: 'all 0.15s ease',
              }}
              title={hasPdfUrl ? 'Switch to PDF Canvas Reader' : 'PDF not available for this abstract-only paper'}
            >
              <FileText size={13} />
              <span>PDF View</span>
            </button>

            <button
              onClick={() => setViewMode('reader')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '4px',
                border: 'none',
                background: viewMode === 'reader' ? 'rgba(137, 180, 250, 0.2)' : 'transparent',
                color: viewMode === 'reader' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                fontSize: '11.5px',
                fontWeight: viewMode === 'reader' ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Switch to Structured Article Reader"
            >
              <BookOpen size={13} />
              <span>Reader View</span>
            </button>
          </div>

          {/* Right: PDF Zoom Controls & Actions (Visible when in PDF Mode) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {viewMode === 'pdf' && hasPdfUrl && (
              <>
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

                <button className="control-btn" onClick={handleZoomOut}>-</button>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', padding: '0 4px', fontWeight: 600 }}>
                  {Math.round(zoomScale * 100)}%
                </span>
                <button className="control-btn" onClick={handleZoomIn}>+</button>
                <button className="control-btn" onClick={handleFitWidth}>Fit</button>
              </>
            )}

            {foundPdf.doi && (
              <a
                href={foundPdf.landingPageUrl || `https://doi.org/${foundPdf.doi}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: 'var(--text-muted, #6c7086)',
                  textDecoration: 'none',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                <span>DOI</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Floating In-Viewer Find Bar (PDF Mode) */}
      {showSearchBar && pdfUrl && viewMode === 'pdf' && (
        <div
          style={{
            position: 'absolute',
            top: '46px',
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

      {/* Main Content Area */}
      <div style={{ flex: 1, overflow: 'hidden', height: 'calc(100% - 38px)' }}>
        {foundPdf ? (
          viewMode === 'reader' || !hasPdfUrl ? (
            <ArticleReaderView
              paper={foundPdf}
              onSwitchToPdf={() => setViewMode('pdf')}
            />
          ) : (
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
          )
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
              Upload a research PDF or click <strong>🔗 Import DOI</strong> to begin synthesis.
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

