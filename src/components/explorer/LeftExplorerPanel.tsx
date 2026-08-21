import React, { useState, useRef } from 'react';
import { useGridStore } from '../../store/useGridStore';
import { useAgentStore } from '../../store/useAgentStore';
import { usePdfStore } from '../../store/usePdfStore';
import { useLogStore } from '../../store/useLogStore';
import { downloadPdfFile } from '../../services/workspaceService';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Upload,
  FileText,
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
} from 'lucide-react';

interface LeftExplorerPanelProps {
  onSelectPdf: (pdfId: string, title: string) => void;
  onOpenMasterGrid: () => void;
  onOpenDebugLogs?: () => void;
  onOpenWorkspaceHub?: (section: 'export' | 'import') => void;
  onOpenPaperDiscovery?: () => void;
}

export const LeftExplorerPanel: React.FC<LeftExplorerPanelProps> = ({
  onSelectPdf,
  onOpenMasterGrid,
  onOpenDebugLogs,
  onOpenWorkspaceHub,
  onOpenPaperDiscovery,
}) => {
  const { columns, rows } = useGridStore();
  const { logs, clearLogs } = useLogStore();

  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [viewsOpen, setViewsOpen] = useState(true);
  const [papersOpen, setPapersOpen] = useState(true);
  const [schemasOpen, setSchemasOpen] = useState(true);
  const [logsOpen, setLogsOpen] = useState(true);
  const [activeItem, setActiveItem] = useState<string>('master-grid');
  const [copiedLogs, setCopiedLogs] = useState(false);


  const pdfInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);


  const { pdfs, addPdfFile, setActivePdf, removePdf } = usePdfStore();

  // Handle PDF Upload (Single or Batch Folder Upload)
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Filter only PDF files from the selected files / directory
    const pdfFiles = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );

    if (pdfFiles.length === 0) {
      alert('No PDF documents found in the selected folder.');
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

      // Simple CSV parser supporting quotes
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
        // Automatically import immediately if table is currently empty
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
        // Save pending CSV import payload and prompt user only if a table already exists
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
    // Reset file input value so user can re-upload same file if needed
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

  return (
    <aside className="panel left-explorer">
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

      <div style={{ padding: '4px 0', flex: 1, overflowY: 'auto' }}>
        {/* Collapsible Section: WORKSPACE PROJECT */}
        <div>
          <div className="vscode-tree-header" onClick={() => setWorkspaceOpen(!workspaceOpen)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {workspaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{' '}
              <FileArchive size={12} color="var(--accent-primary)" /> WORKSPACE
            </span>
            <span
              style={{
                fontSize: '9px',
                padding: '0 5px',
                borderRadius: '8px',
                background: 'rgba(137, 180, 250, 0.15)',
                color: 'var(--accent-primary)',
                fontWeight: 600,
              }}
            >
              {pdfs.length}P • {validRowCount}R
            </span>
          </div>

          {workspaceOpen && (
            <div style={{ padding: '4px 8px 6px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className="vscode-tree-item"
                  style={{
                    flex: 1,
                    background: 'var(--accent-primary, #89b4fa)',
                    color: 'var(--bg-primary, #1e1e2e)',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '11px',
                  }}
                  onClick={() => onOpenWorkspaceHub?.('export')}
                  title="Open Workspace Hub tab to package & export .litsift bundle"
                >
                  <Download size={12} />
                  <span>Export State</span>
                </button>

                <button
                  className="vscode-tree-item"
                  style={{
                    flex: 1,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '11px',
                  }}
                  onClick={() => onOpenWorkspaceHub?.('import')}
                  title="Open Workspace Hub tab to import .litsift bundle"
                >
                  <Upload size={12} color="var(--accent-primary)" />
                  <span>Import</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Section: VIEWS */}
        <div style={{ marginTop: '6px' }}>
          <div className="vscode-tree-header" onClick={() => setViewsOpen(!viewsOpen)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {viewsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} VIEWS
            </span>
          </div>

          {viewsOpen && (
            <div>
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

        {/* Collapsible Section: RESEARCH PAPERS */}
        <div style={{ marginTop: '8px' }}>
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

          {papersOpen && (
            <div>
              {pdfs.map((file) => {
                const isOa = file.oaStatus && file.oaStatus !== 'closed' && file.oaStatus !== 'unknown';

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
                      padding: '6px 8px',
                      position: 'relative',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                    }}
                  >
                    {/* Top Row: Icon + Title + Status Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                      <FileText
                        size={13}
                        color={isOa ? 'var(--accent-success, #a6e3a1)' : 'var(--accent-secondary, #b4befe)'}
                        style={{ flexShrink: 0 }}
                      />
                      
                      <span
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '12px',
                          fontWeight: activeItem === file.id ? 600 : 400,
                        }}
                        title={file.title || file.name}
                      >
                        {file.title || file.name}
                      </span>

                      {/* OA Badge */}
                      {isOa && (
                        <span
                          style={{
                            fontSize: '8.5px',
                            fontWeight: 700,
                            padding: '0px 4px',
                            borderRadius: '4px',
                            background: 'rgba(166, 227, 161, 0.2)',
                            color: '#a6e3a1',
                            flexShrink: 0,
                          }}
                        >
                          OA
                        </span>
                      )}

                      {/* Download Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadPdfFile({
                            name: file.name,
                            file: file.file,
                            base64: file.base64,
                            url: file.url,
                          });
                        }}
                        title={`Download "${file.name}"`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '3px',
                          opacity: 0.7,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.color = 'var(--accent-primary, #89b4fa)';
                          (e.currentTarget as HTMLElement).style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                          (e.currentTarget as HTMLElement).style.opacity = '0.7';
                        }}
                      >
                        <Download size={12} />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete paper "${file.name}" from your workspace?`)) {
                            removePdf(file.id);
                            if (activeItem === file.id) {
                              onOpenMasterGrid();
                              setActiveItem('master-grid');
                            }
                          }
                        }}
                        title={`Delete ${file.name}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '3px',
                          opacity: 0.7,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.color = 'var(--accent-danger, #f38ba8)';
                          (e.currentTarget as HTMLElement).style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                          (e.currentTarget as HTMLElement).style.opacity = '0.7';
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {/* Bottom Sub-row: Journal, Year, DOI indicator */}
                    {(file.journal || file.year || file.doi) && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '10px',
                          color: 'var(--text-muted, #6c7086)',
                          paddingLeft: '19px',
                        }}
                      >
                        {file.journal && (
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                            {file.journal}
                          </span>
                        )}
                        {file.year && <span>• {file.year}</span>}
                        {file.url ? (
                          <span style={{ color: 'var(--accent-primary, #89b4fa)', fontSize: '9px' }}>[PDF]</span>
                        ) : (
                          <span style={{ color: 'var(--accent-warning, #f9e2af)', fontSize: '9px' }}>[Reader]</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {pdfs.length === 0 && (
                <div
                  style={{
                    padding: '12px 10px',
                    fontSize: '11px',
                    color: 'var(--text-muted, #6c7086)',
                    textAlign: 'center',
                    lineHeight: 1.5,
                  }}
                >
                  No papers loaded yet. Click <strong>+</strong> or <strong>🔗</strong> to import.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Collapsible Section: SCHEMAS & EXPORT */}
        <div style={{ marginTop: '8px' }}>
          <div className="vscode-tree-header" onClick={() => setSchemasOpen(!schemasOpen)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {schemasOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} SCHEMAS & EXPORT
            </span>
            <span
              className="vscode-action-icon"
              title="Import CSV Dataset / Schema"
              onClick={(e) => {
                e.stopPropagation();
                csvInputRef.current?.click();
              }}
            >
              <Upload size={13} />
            </span>
          </div>

          {schemasOpen && (
            <div style={{ padding: '4px 8px 4px 18px' }}>
              <div style={{ display: 'flex', gap: '4px', flexDirection: 'column' }}>
                <button
                  className="vscode-tree-item"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    justifyContent: 'center',
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
                  }}
                  onClick={handleExportCsv}
                >
                  <Download size={12} />
                  <span>Export CSV Dataset</span>
                </button>

                <button
                  className="vscode-tree-item"
                  style={{
                    marginTop: '6px',
                    background: 'rgba(243, 139, 168, 0.15)',
                    border: '1px solid var(--accent-danger)',
                    color: 'var(--accent-danger)',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    justifyContent: 'center',
                    fontWeight: 600,
                  }}
                  onClick={() => useGridStore.getState().clearTable()}
                  title="Clear entire table schema and all rows (Can be undone via Ctrl+Z)"
                >
                  <Trash2 size={12} />
                  <span>Clear Entire Table</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Section: AGENT DEBUG LOGS */}
        <div style={{ marginTop: '8px' }}>
          <div className="vscode-tree-header" onClick={() => setLogsOpen(!logsOpen)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {logsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} DEBUG & TELEMETRY ({logs.length})
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

          {logsOpen && (
            <div style={{ padding: '4px 8px 8px 12px' }}>
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', fontStyle: 'italic', padding: '6px 4px' }}>
                  No logs captured yet.
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    background: '#07080c',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '6px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '9.5px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  {logs.slice(-25).map((l) => (
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
                      <span style={{ color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.message}>
                        {l.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                <button
                  className="vscode-tree-item"
                  style={{
                    flex: 1,
                    background: copiedLogs ? 'rgba(166, 227, 161, 0.2)' : 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    color: copiedLogs ? 'var(--accent-success)' : 'var(--text-primary)',
                    borderRadius: '4px',
                    padding: '4px 6px',
                    justifyContent: 'center',
                    fontSize: '10.5px',
                    fontWeight: 600,
                  }}
                  onClick={() => handleCopyAllLogs()}
                >
                  {copiedLogs ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedLogs ? 'Copied Full Log' : 'Copy All Logs'}</span>
                </button>

                {onOpenDebugLogs && (
                  <button
                    className="vscode-tree-item"
                    style={{
                      background: 'rgba(137, 180, 250, 0.12)',
                      border: '1px solid rgba(137, 180, 250, 0.3)',
                      color: 'var(--accent-primary)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      justifyContent: 'center',
                      fontSize: '10.5px',
                      fontWeight: 600,
                    }}
                    onClick={onOpenDebugLogs}
                    title="Open Full Log Inspector"
                  >
                    <Terminal size={11} />
                    <span>Inspect</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

