import React, { useState, useRef, useMemo } from 'react';
import { useGridStore } from '../../store/useGridStore';
import { useAgentStore } from '../../store/useAgentStore';
import { usePdfStore } from '../../store/usePdfStore';
import { useLogStore } from '../../store/useLogStore';
import { SidebarViewMode } from '../../types/layout';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Upload,
  Table,
  Download,
  Trash2,
  FolderOpen,
  Terminal,
  Copy,
  Check,
  Maximize2,
  FileArchive,
  Link,
  Search,
  CheckCircle2,
  CircleDot,
  Database,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface LeftExplorerPanelProps {
  activeSidebarView?: SidebarViewMode;
  onSelectPdf: (pdfId: string, title: string) => void;
  onOpenMasterGrid: () => void;
  onOpenDebugLogs?: () => void;
  onOpenWorkspaceHub?: (section: 'export' | 'import') => void;
  onOpenPaperDiscovery?: () => void;
  onResetWorkspace?: () => void;
}

export const LeftExplorerPanel: React.FC<LeftExplorerPanelProps> = ({
  activeSidebarView = 'explorer',
  onSelectPdf,
  onOpenMasterGrid,
  onOpenDebugLogs,
  onOpenWorkspaceHub,
  onOpenPaperDiscovery,
  onResetWorkspace,
}) => {
  const { columns, rows, clearTable } = useGridStore();
  const { logs, clearLogs } = useLogStore();
  const { pdfs, addPdfFile, setActivePdf } = usePdfStore();

  // Collapsible section state for Explorer view
  const [papersOpen, setPapersOpen] = useState(true);
  const [viewsOpen, setViewsOpen] = useState(true);

  // Collapsible section state for Workspace view
  const [workspaceStatsOpen, setWorkspaceStatsOpen] = useState(true);
  const [workspaceBundlesOpen, setWorkspaceBundlesOpen] = useState(true);
  const [csvToolsOpen, setCsvToolsOpen] = useState(true);

  // Collapsible section state for Debug view
  const [logsStreamOpen, setLogsStreamOpen] = useState(true);

  const [activeItem, setActiveItem] = useState<string>('workspace-hub');
  const [copiedLogs, setCopiedLogs] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Handle PDF Upload (Single or Batch Folder Upload)
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const pdfFiles = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );

    if (pdfFiles.length === 0) {
      alert('No PDF documents found in the selected files.');
      e.target.value = '';
      return;
    }

    let lastAddedPdf: any = null;
    for (const file of pdfFiles) {
      lastAddedPdf = await addPdfFile(file);
    }

    if (lastAddedPdf) {
      onSelectPdf(lastAddedPdf.id, lastAddedPdf.name);
      setActiveItem(lastAddedPdf.id);
    }
    e.target.value = '';
  };

  // Handle CSV Upload (Custom Schema or Existing Dataset)
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length === 0) return;

      const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      const headers = parseCsvLine(lines[0]);
      const parsedRows = lines.slice(1).map((line) => {
        const vals = parseCsvLine(line);
        const rowObj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          rowObj[h] = vals[idx] || '';
        });
        return rowObj;
      });

      const gridStore = useGridStore.getState();
      const hasExistingData = gridStore.rows.length > 0 || gridStore.columns.length > 0;

      if (!hasExistingData) {
        gridStore.importCsvDataset(headers, parsedRows);
        useAgentStore.setState((state) => ({
          messages: [
            ...state.messages,
            {
              id: `msg-${Date.now()}`,
              sender: 'agent',
              text: `📥 Automatically imported "${file.name}" (${parsedRows.length} rows, ${headers.length} columns) into master data grid.`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ],
        }));
      } else {
        (window as any).__pendingCsvImport = { headers, parsedRows, filename: file.name };

        useAgentStore.setState((state) => ({
          messages: [
            ...state.messages,
            {
              id: `msg-${Date.now()}`,
              sender: 'agent',
              text: `📥 CSV File "${file.name}" ready for import (${parsedRows.length} rows, ${headers.length} columns). How would you like to handle your open table?`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              options: [
                `👉 Append to current table (${file.name})`,
                `👉 Replace current table (${file.name})`,
              ],
            },
          ],
        }));
      }

      onOpenMasterGrid();
      setActiveItem('master-grid');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportCsv = () => {
    const validRows = rows.filter((r) => !r.isDraftRow);
    const headers = columns.map((c) => c.headerName);

    const csvLines = [
      headers.join(','),
      ...validRows.map((row) =>
        columns
          .map((col) => {
            const rawVal = row[col.field] ?? '';
            const escaped = String(rawVal).replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(',')
      ),
    ];

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'LitSift_Extracted_Dataset.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyAllLogs = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (logs.length === 0) return;
    const formatted = logs
      .map((l) => {
        let text = `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`;
        if (l.details) {
          text += `\nDetails: ${JSON.stringify(l.details, null, 2)}`;
        }
        return text;
      })
      .join('\n\n');

    navigator.clipboard.writeText(formatted).then(() => {
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    });
  };

  const validRowCount = rows.filter((r) => !r.isDraftRow).length;

  // Sort papers:
  // 1. All pending papers at the TOP (newest resolved/added pending papers first)
  // 2. Extracted (done) papers at the BOTTOM (newest done first, oldest done at the very bottom)
  const sortedPdfs = useMemo(() => {
    return [...pdfs].sort((a, b) => {
      const isExtractedA = rows.some(
        (r) =>
          !r.isDraftRow &&
          (r.pdfId === a.id || r.pdfTitle === a.name || (a.title && r.pdfTitle === a.title))
      );
      const isExtractedB = rows.some(
        (r) =>
          !r.isDraftRow &&
          (r.pdfId === b.id || r.pdfTitle === b.name || (b.title && r.pdfTitle === b.title))
      );

      // 1. Pending papers come before Extracted papers
      if (!isExtractedA && isExtractedB) return -1;
      if (isExtractedA && !isExtractedB) return 1;

      // 2. Within the same group (both pending OR both extracted):
      // Newer papers at top, older papers at bottom (oldest sinks to bottom)
      const timeA = a.uploadedAt || 0;
      const timeB = b.uploadedAt || 0;
      return timeB - timeA;
    });
  }, [pdfs, rows]);

  return (
    <aside
      className="panel left-explorer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-secondary, #181825)',
        borderRight: '1px solid var(--border-subtle, #313244)',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Hidden File / Folder Inputs */}
      <input
        type="file"
        ref={pdfInputRef}
        onChange={handlePdfUpload}
        accept="application/pdf"
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={handlePdfUpload}
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={csvInputRef}
        onChange={handleCsvUpload}
        accept=".csv"
        style={{ display: 'none' }}
      />

      {/* VS Code-style Sidebar Header */}
      <div
        style={{
          padding: '8px 12px 6px 12px',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.8px',
          color: 'var(--text-secondary, #a6adc8)',
          textTransform: 'uppercase',
          borderBottom: '1px solid var(--border-subtle, #313244)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-tertiary, #11111b)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {activeSidebarView === 'explorer' && 'Explorer'}
          {activeSidebarView === 'workspace' && 'Workspace'}
          {activeSidebarView === 'debug' && 'Debug & Telemetry'}
        </span>

        {activeSidebarView === 'explorer' && (
          <span
            style={{
              fontSize: '9.5px',
              padding: '1px 6px',
              borderRadius: '8px',
              background: 'rgba(137, 180, 250, 0.15)',
              color: 'var(--accent-primary)',
              fontWeight: 600,
            }}
          >
            {pdfs.length} papers
          </span>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. EXPLORER MODE (Daily Driver: Research Papers Scrollable, Views Docked)  */}
      {/* ========================================================================= */}
      {activeSidebarView === 'explorer' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {/* Top: RESEARCH PAPERS SECTION (Header fixed, list scrollable) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ flexShrink: 0 }}>
              <div className="vscode-tree-header" onClick={() => setPapersOpen(!papersOpen)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {papersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} RESEARCH PAPERS ({pdfs.length})
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span
                    className="vscode-action-icon"
                    title="Search Literature & Ingest DOIs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPaperDiscovery?.();
                      setActiveItem('paper-discovery');
                    }}
                    style={{
                      color: 'var(--accent-primary, #89b4fa)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Link size={13} />
                  </span>
                  <span
                    className="vscode-action-icon"
                    title="Select Folder (Auto-scans & uploads all PDFs)"
                    onClick={(e) => {
                      e.stopPropagation();
                      folderInputRef.current?.click();
                    }}
                  >
                    <FolderOpen size={13} color="var(--accent-warning, #f9e2af)" />
                  </span>
                  <span
                    className="vscode-action-icon"
                    title="Upload Single PDF File"
                    onClick={(e) => {
                      e.stopPropagation();
                      pdfInputRef.current?.click();
                    }}
                  >
                    <Plus size={14} />
                  </span>
                </div>
              </div>
            </div>

            {papersOpen && (
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: '8px' }}>
                {sortedPdfs.map((file) => {
                  // Check if this paper has any extracted rows in the master data grid
                  const isExtracted = rows.some(
                    (r) =>
                      !r.isDraftRow &&
                      (r.pdfId === file.id ||
                        r.pdfTitle === file.name ||
                        (file.title && r.pdfTitle === file.title))
                  );

                  const extractedRowCount = rows.filter(
                    (r) =>
                      !r.isDraftRow &&
                      (r.pdfId === file.id ||
                        r.pdfTitle === file.name ||
                        (file.title && r.pdfTitle === file.title))
                  ).length;

                  return (
                    <div
                      key={file.id}
                      className={`vscode-tree-item ${activeItem === file.id ? 'active' : ''}`}
                      onClick={() => {
                        setActivePdf(file.id);
                        onSelectPdf(file.id, file.name);
                        setActiveItem(file.id);
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        padding: '6px 10px 6px 14px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                      }}
                    >
                      {/* Top Row: Single Status Icon + Paper Title */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', width: '100%' }}>
                        {/* Real-time Extraction Status Indicator */}
                        {isExtracted ? (
                          <span
                            title={`Extraction Complete (${extractedRowCount} row${extractedRowCount > 1 ? 's' : ''} in Data Grid)`}
                            style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          >
                            <CheckCircle2 size={13} color="var(--accent-success, #a6e3a1)" />
                          </span>
                        ) : (
                          <span
                            title="Extraction Pending / Not started"
                            style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.6 }}
                          >
                            <CircleDot size={13} color="var(--text-muted, #6c7086)" />
                          </span>
                        )}

                        <span
                          style={{
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '11.5px',
                            fontWeight: activeItem === file.id ? 600 : 400,
                            color: activeItem === file.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                          }}
                          title={file.title || file.name}
                        >
                          {file.title || file.name}
                        </span>
                      </div>

                      {/* Sub-row: Journal & Year Metadata */}
                      {(file.journal || file.year) && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '10px',
                            color: 'var(--text-muted, #6c7086)',
                            paddingLeft: '20px',
                          }}
                        >
                          {file.journal && (
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '150px',
                              }}
                            >
                              {file.journal}
                            </span>
                          )}
                          {file.year && <span>• {file.year}</span>}
                          {file.url && file.sections && file.sections.length > 0 ? (
                            <span style={{ color: 'var(--accent-success, #a6e3a1)', fontSize: '9px' }}>[PDF + Text]</span>
                          ) : file.url ? (
                            <span style={{ color: 'var(--accent-primary, #89b4fa)', fontSize: '9px' }}>[PDF]</span>
                          ) : (
                            <span style={{ color: 'var(--accent-warning, #f9e2af)', fontSize: '9px' }}>[Text]</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {pdfs.length === 0 && (
                  <div
                    style={{
                      padding: '16px 12px',
                      fontSize: '11px',
                      color: 'var(--text-muted, #6c7086)',
                      textAlign: 'center',
                      lineHeight: 1.5,
                    }}
                  >
                    No papers loaded yet.
                    <div style={{ marginTop: '6px', fontSize: '10px' }}>
                      Click <strong>+</strong> to upload a PDF or <strong>🔗</strong> for DOI search.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom: VIEWS SECTION (Permanently Docked at Bottom of Sidebar) */}
          <div
            style={{
              flexShrink: 0,
              borderTop: '1px solid var(--border-subtle, #313244)',
              paddingTop: '4px',
              background: 'var(--bg-secondary, #181825)',
              zIndex: 5,
            }}
          >
            <div className="vscode-tree-header" onClick={() => setViewsOpen(!viewsOpen)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {viewsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} VIEWS
              </span>
            </div>

            {viewsOpen && (
              <div style={{ paddingBottom: '6px' }}>
                {onOpenWorkspaceHub && (
                  <div
                    className={`vscode-tree-item ${activeItem === 'workspace-hub' ? 'active' : ''}`}
                    onClick={() => {
                      onOpenWorkspaceHub('import');
                      setActiveItem('workspace-hub');
                    }}
                  >
                    <FileArchive size={13} color="var(--accent-primary, #89b4fa)" />
                    <span>Workspace Project Hub</span>
                  </div>
                )}

                <div
                  className={`vscode-tree-item ${activeItem === 'master-grid' ? 'active' : ''}`}
                  onClick={() => {
                    onOpenMasterGrid();
                    setActiveItem('master-grid');
                  }}
                >
                  <Table size={13} color="var(--accent-primary)" />
                  <span>Master Extraction Grid</span>
                </div>

                {onOpenPaperDiscovery && (
                  <div
                    className={`vscode-tree-item ${activeItem === 'paper-discovery' ? 'active' : ''}`}
                    onClick={() => {
                      onOpenPaperDiscovery();
                      setActiveItem('paper-discovery');
                    }}
                  >
                    <Search size={13} color="var(--accent-warning, #f9e2af)" />
                    <span>Paper Discovery & Ingest</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2 & 3. WORKSPACE & DEBUG MODES (Scroll naturally in vertical container)  */}
      {/* ========================================================================= */}
      {activeSidebarView !== 'explorer' && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 0' }}>

        {/* ========================================================================= */}
        {/* 2. WORKSPACE MODE (Project Snapshot, .litsift Bundles, CSV Datasets)       */}
        {/* ========================================================================= */}
        {activeSidebarView === 'workspace' && (
          <div>
            {/* PROJECT METRICS */}
            <div>
              <div className="vscode-tree-header" onClick={() => setWorkspaceStatsOpen(!workspaceStatsOpen)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {workspaceStatsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{' '}
                  <Sparkles size={12} color="var(--accent-primary)" /> PROJECT SNAPSHOT
                </span>
              </div>

              {workspaceStatsOpen && (
                <div style={{ padding: '6px 12px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      marginBottom: '8px',
                    }}
                  >
                    <div
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-primary)' }}>
                        {pdfs.length}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Papers Loaded</div>
                    </div>

                    <div
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-success)' }}>
                        {validRowCount}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Extracted Rows</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* STATE BUNDLES (.litsift) */}
            <div style={{ marginTop: '6px' }}>
              <div className="vscode-tree-header" onClick={() => setWorkspaceBundlesOpen(!workspaceBundlesOpen)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {workspaceBundlesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{' '}
                  <FileArchive size={12} color="var(--accent-secondary)" /> STATE PACKAGES (.LITSIFT)
                </span>
              </div>

              {workspaceBundlesOpen && (
                <div style={{ padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button
                    className="vscode-tree-item"
                    style={{
                      background: 'var(--accent-primary, #89b4fa)',
                      color: 'var(--bg-primary, #1e1e2e)',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '11px',
                    }}
                    onClick={() => onOpenWorkspaceHub?.('export')}
                    title="Export workspace state bundle (.litsift)"
                  >
                    <Download size={12} />
                    <span>Export State (.litsift)</span>
                  </button>

                  <button
                    className="vscode-tree-item"
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '11px',
                    }}
                    onClick={() => onOpenWorkspaceHub?.('import')}
                    title="Import workspace state bundle (.litsift)"
                  >
                    <Upload size={12} color="var(--accent-primary)" />
                    <span>Import State (.litsift)</span>
                  </button>

                  <button
                    className="vscode-tree-item"
                    style={{
                      background: 'rgba(137, 180, 250, 0.1)',
                      border: '1px solid rgba(137, 180, 250, 0.25)',
                      color: 'var(--accent-primary)',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                    onClick={() => onOpenWorkspaceHub?.('export')}
                  >
                    <FileArchive size={12} />
                    <span>Open Full Workspace Hub</span>
                  </button>
                </div>
              )}
            </div>

            {/* CSV DATASETS (Relocated cleanly to Workspace) */}
            <div style={{ marginTop: '6px' }}>
              <div className="vscode-tree-header" onClick={() => setCsvToolsOpen(!csvToolsOpen)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {csvToolsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{' '}
                  <Database size={12} color="var(--accent-success)" /> CSV DATASETS
                </span>
              </div>

              {csvToolsOpen && (
                <div style={{ padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button
                    className="vscode-tree-item"
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      justifyContent: 'center',
                      fontSize: '11px',
                    }}
                    onClick={() => csvInputRef.current?.click()}
                  >
                    <Upload size={12} color="var(--accent-primary)" />
                    <span>Import CSV Dataset</span>
                  </button>

                  <button
                    className="vscode-tree-item"
                    style={{
                      background: 'var(--accent-primary)',
                      color: 'var(--bg-secondary)',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '11px',
                    }}
                    onClick={handleExportCsv}
                  >
                    <Download size={12} />
                    <span>Export CSV Dataset</span>
                  </button>

                  {/* Danger Zone: Clear Table */}
                  <button
                    className="vscode-tree-item"
                    style={{
                      marginTop: '4px',
                      background: 'rgba(243, 139, 168, 0.12)',
                      border: '1px solid var(--accent-danger)',
                      color: 'var(--accent-danger)',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '11px',
                    }}
                    onClick={() => {
                      if (window.confirm('Clear entire table schema and all rows? (Can be undone with Ctrl+Z)')) {
                        clearTable();
                      }
                    }}
                    title="Clear entire table schema and all rows"
                  >
                    <Trash2 size={12} />
                    <span>Clear Entire Table</span>
                  </button>
                </div>
              )}
            </div>

            {/* Reset Workspace Action */}
            <div style={{ padding: '10px 12px 6px 12px' }}>
              <button
                className="vscode-tree-item"
                style={{
                  width: '100%',
                  background: 'rgba(249, 226, 175, 0.08)',
                  border: '1px solid var(--accent-warning)',
                  color: 'var(--accent-warning)',
                  borderRadius: '4px',
                  padding: '6px 8px',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '11px',
                }}
                onClick={onResetWorkspace}
                title="Start fresh project and clear workspace"
              >
                <RotateCcw size={12} />
                <span>New Project (Reset Workspace)</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. DEBUG & TELEMETRY MODE (Live Monospace Event Stream & Inspector)       */}
        {/* ========================================================================= */}
        {activeSidebarView === 'debug' && (
          <div>
            <div className="vscode-tree-header" onClick={() => setLogsStreamOpen(!logsStreamOpen)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {logsStreamOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} LIVE EVENT STREAM ({logs.length})
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span
                  className="vscode-action-icon"
                  title={copiedLogs ? 'Copied Full Logs!' : 'Copy All Logs to Clipboard'}
                  onClick={handleCopyAllLogs}
                  style={{ color: copiedLogs ? 'var(--accent-success)' : undefined }}
                >
                  {copiedLogs ? <Check size={13} /> : <Copy size={13} />}
                </span>
                {onOpenDebugLogs && (
                  <span
                    className="vscode-action-icon"
                    title="Open Detailed Logs Window"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDebugLogs();
                    }}
                  >
                    <Maximize2 size={13} />
                  </span>
                )}
                <span
                  className="vscode-action-icon"
                  title="Clear Logs"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearLogs();
                  }}
                >
                  <Trash2 size={13} />
                </span>
              </div>
            </div>

            {logsStreamOpen && (
              <div style={{ padding: '6px 12px' }}>
                {logs.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic', padding: '8px 4px' }}>
                    No telemetry events captured yet.
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: '320px',
                      overflowY: 'auto',
                      background: '#07080c',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '8px',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '9.5px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {logs.slice(-40).map((l) => (
                      <div key={l.id} style={{ display: 'flex', gap: '4px', lineHeight: '1.3' }}>
                        <span style={{ color: '#6c7086' }}>{l.timestamp.split(' ')[0]}</span>
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              l.level === 'error'
                                ? 'var(--accent-danger)'
                                : l.level === 'warn'
                                ? 'var(--accent-warning)'
                                : l.level === 'success'
                                ? 'var(--accent-success)'
                                : 'var(--accent-primary)',
                          }}
                        >
                          [{l.level[0].toUpperCase()}]
                        </span>
                        <span
                          style={{ color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={l.message}
                        >
                          {l.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button
                    className="vscode-tree-item"
                    style={{
                      flex: 1,
                      background: copiedLogs ? 'rgba(166, 227, 161, 0.2)' : 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      color: copiedLogs ? 'var(--accent-success)' : 'var(--text-primary)',
                      borderRadius: '4px',
                      padding: '5px 8px',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                    onClick={() => handleCopyAllLogs()}
                  >
                    {copiedLogs ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedLogs ? 'Copied' : 'Copy All'}</span>
                  </button>

                  {onOpenDebugLogs && (
                    <button
                      className="vscode-tree-item"
                      style={{
                        background: 'rgba(137, 180, 250, 0.12)',
                        border: '1px solid rgba(137, 180, 250, 0.3)',
                        color: 'var(--accent-primary)',
                        borderRadius: '4px',
                        padding: '5px 10px',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                      onClick={onOpenDebugLogs}
                      title="Open Full Log Inspector Modal"
                    >
                      <Terminal size={12} />
                      <span>Inspect</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )}
  </aside>
);
};

export default LeftExplorerPanel;
