import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Download,
  Table,
  FileArchive,
  Keyboard,
  BookOpen,
  FileText,
  Minimize2,
  ExternalLink,
} from 'lucide-react';
import { AgGridWrapper } from '../data-grid/AgGridWrapper';
import { PdfReader, PdfReaderRef } from './PdfReader';
import { ArticleReaderView } from './ArticleReaderView';
import { WorkspaceHubView } from '../workspace/WorkspaceHubView';
import { PaperDiscoveryView } from '../workspace/PaperDiscoveryView';
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
  onOpenPaperDiscovery?: () => void;
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
  onOpenPaperDiscovery,
}) => {
  const [zoomScale, setZoomScale] = useState<number>(1.2);
  const [viewMode, setViewMode] = useState<'pdf' | 'reader'>('pdf');
  const [isPillCollapsed, setIsPillCollapsed] = useState(false);

  const pdfs = usePdfStore((state) => state.pdfs);

  // In-Viewer Find / Search Bar State
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

  // Intercept Ctrl+F to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && activeTab?.type === 'pdf' && pdfUrl && viewMode === 'pdf') {
        e.preventDefault();
        setIsPillCollapsed(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, pdfUrl, viewMode]);

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
    } else if (e.key === 'Escape') {
      handleCloseSearch();
    }
  };

  const handleCloseSearch = () => {
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
              onClick={() => onOpenPaperDiscovery?.()}
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
              <Search size={14} />
              <span>Paper Discovery & DOI Ingest</span>
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
              <span>Discover & Ingest DOIs</span>
              <span style={{ color: 'var(--accent-primary)' }}>Click "Paper Discovery & DOI Ingest"</span>
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
      </main>
    );
  }

  // 1. Paper Discovery & Ingestion Tab Mode
  if (activeTab.type === 'paper_discovery') {
    return (
      <main className="panel central-viewer paper-discovery-mode" style={{ height: '100%', padding: 0 }}>
        <PaperDiscoveryView onNavigateToPdf={onNavigateToPdf} />
      </main>
    );
  }

  // 2. Workspace Project Hub View
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

  // 3. Master Data Grid Mode
  if (activeTab.type === 'master_grid') {
    return (
      <main className="panel central-viewer master-grid-mode" style={{ height: '100%', padding: 0 }}>
        <div className="table-container" style={{ height: '100%', padding: 0 }}>
          <AgGridWrapper />
        </div>
      </main>
    );
  }

  // 4. Paper Document Mode (PDF View or Structured Reader View)
  const hasPdfUrl = Boolean(pdfUrl);

  return (
    <main
      className="panel central-viewer pdf-mode"
      style={{
        position: 'relative',
        height: '100%',
        width: '100%',
        padding: 0,
        overflow: 'hidden',
        background: 'var(--bg-primary, #1e1e2e)',
      }}
    >
      {/* FLOATING GLASSMORPHISM PILL TOOLBAR (Option B) */}
      {foundPdf && (
        <>
          {isPillCollapsed ? (
            /* Collapsed State: Sleek Round Floating Icon */
            <button
              onClick={() => setIsPillCollapsed(false)}
              title="Expand Controls & View Switcher"
              style={{
                position: 'absolute',
                top: '12px',
                right: '16px',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(24, 24, 37, 0.85)',
                backdropFilter: 'blur(14px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                color: 'var(--accent-primary, #89b4fa)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 50,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-primary, #89b4fa)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.12)';
              }}
            >
              {viewMode === 'pdf' ? <FileText size={16} /> : <BookOpen size={16} />}
            </button>
          ) : (
            /* Expanded State: Floating Glass Pill */
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '16px',
                zIndex: 50,
                background: 'rgba(24, 24, 37, 0.85)',
                backdropFilter: 'blur(16px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '24px',
                padding: '4px 8px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.55)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                animation: 'fadeIn 0.15s ease-out',
              }}
            >
              {/* Segmented View Mode Switcher */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.35)',
                  padding: '2px',
                  borderRadius: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <button
                  onClick={() => setViewMode('pdf')}
                  disabled={!hasPdfUrl}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 9px',
                    borderRadius: '14px',
                    border: 'none',
                    background: viewMode === 'pdf' ? 'rgba(137, 180, 250, 0.25)' : 'transparent',
                    color: viewMode === 'pdf' ? 'var(--accent-primary, #89b4fa)' : hasPdfUrl ? 'var(--text-secondary, #a6adc8)' : 'var(--text-muted, #585b70)',
                    fontSize: '11px',
                    fontWeight: viewMode === 'pdf' ? 700 : 500,
                    cursor: hasPdfUrl ? 'pointer' : 'not-allowed',
                    opacity: hasPdfUrl ? 1 : 0.5,
                    transition: 'all 0.15s ease',
                  }}
                  title={hasPdfUrl ? 'Switch to PDF Canvas' : 'PDF binary not available'}
                >
                  <FileText size={12} />
                  <span>PDF</span>
                </button>

                <button
                  onClick={() => setViewMode('reader')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 9px',
                    borderRadius: '14px',
                    border: 'none',
                    background: viewMode === 'reader' ? 'rgba(137, 180, 250, 0.25)' : 'transparent',
                    color: viewMode === 'reader' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                    fontSize: '11px',
                    fontWeight: viewMode === 'reader' ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title="Switch to Structured Article Reader"
                >
                  <BookOpen size={12} />
                  <span>Reader</span>
                </button>
              </div>

              {/* Permanent Search Box (when in PDF Mode) */}
              {viewMode === 'pdf' && hasPdfUrl && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '2px 8px',
                    gap: '4px',
                  }}
                >
                  <Search size={12} color="var(--text-muted, #6c7086)" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Find in PDF..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    style={{
                      width: '95px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary, #cdd6f4)',
                      fontSize: '11px',
                      outline: 'none',
                    }}
                  />
                  {searchQuery && (
                    <span style={{ fontSize: '9.5px', color: 'var(--text-secondary, #a6adc8)', minWidth: '30px', textAlign: 'center' }}>
                      {totalMatches > 0 ? `${currentMatch}/${totalMatches}` : '0'}
                    </span>
                  )}
                  {searchQuery && (
                    <>
                      <button
                        onClick={() => pdfReaderRef.current?.prevMatch()}
                        disabled={totalMatches === 0}
                        title="Previous match (Shift+Enter)"
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '1px', display: 'flex' }}
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => pdfReaderRef.current?.nextMatch()}
                        disabled={totalMatches === 0}
                        title="Next match (Enter)"
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '1px', display: 'flex' }}
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        onClick={handleCloseSearch}
                        title="Clear search (Escape)"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '1px', display: 'flex' }}
                      >
                        <X size={12} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Zoom Controls (PDF Mode) */}
              {viewMode === 'pdf' && hasPdfUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <button
                    onClick={handleZoomOut}
                    title="Zoom Out"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary, #a6adc8)',
                      padding: '2px 6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                  >
                    -
                  </button>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary, #a6adc8)', minWidth: '28px', textAlign: 'center', fontWeight: 600 }}>
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button
                    onClick={handleZoomIn}
                    title="Zoom In"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary, #a6adc8)',
                      padding: '2px 6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                  >
                    +
                  </button>
                  <button
                    onClick={handleFitWidth}
                    title="Fit Width"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted, #6c7086)',
                      padding: '2px 5px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                  >
                    Fit
                  </button>
                </div>
              )}

              {/* Download PDF Button */}
              {foundPdf.url && (
                <button
                  onClick={handleDownloadActivePdf}
                  title="Download PDF to computer"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-primary, #89b4fa)',
                    padding: '3px 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    fontSize: '11px',
                  }}
                >
                  <Download size={12} />
                </button>
              )}

              {/* DOI External Link */}
              {foundPdf.doi && (
                <a
                  href={foundPdf.landingPageUrl || `https://doi.org/${foundPdf.doi}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open DOI ${foundPdf.doi} in publisher portal`}
                  style={{
                    color: 'var(--text-muted, #6c7086)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '3px 4px',
                    textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={12} />
                </a>
              )}

              {/* Minimize Pill Button */}
              <button
                onClick={() => setIsPillCollapsed(true)}
                title="Minimize toolbar to icon"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #6c7086)',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                  marginLeft: '2px',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-primary, #cdd6f4)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-muted, #6c7086)';
                }}
              >
                <Minimize2 size={12} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Main Document Content Area (Takes 100% of vertical height with 0px top wasted space) */}
      <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
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
              Upload a research PDF or use <strong>Paper Discovery</strong> to begin synthesis.
            </div>
          </div>
        )}
      </div>
    </main>
  );
};
