import React, { useState, useRef } from 'react';
import { useGridStore } from '../../store/useGridStore';
import { useAgentStore } from '../../store/useAgentStore';
import { usePdfStore } from '../../store/usePdfStore';
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
} from 'lucide-react';

interface LeftExplorerPanelProps {
  onSelectPdf: (pdfId: string, title: string) => void;
  onOpenMasterGrid: () => void;
}

export const LeftExplorerPanel: React.FC<LeftExplorerPanelProps> = ({
  onSelectPdf,
  onOpenMasterGrid,
}) => {
  const { columns, rows } = useGridStore();

  const [viewsOpen, setViewsOpen] = useState(true);
  const [papersOpen, setPapersOpen] = useState(true);
  const [schemasOpen, setSchemasOpen] = useState(true);
  const [activeItem, setActiveItem] = useState<string>('master-grid');

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
        {/* Collapsible Section: VIEWS */}
        <div>
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
              {pdfs.map((file) => (
                <div
                  key={file.id}
                  className={`vscode-tree-item ${activeItem === file.id ? 'active' : ''}`}
                  onClick={() => {
                    setActivePdf(file.id);
                    onSelectPdf(file.id, file.name);
                    setActiveItem(file.id);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}
                >
                  <FileText size={13} color="var(--accent-secondary)" style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                    {file.name}
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      padding: '1px 5px',
                      borderRadius: '8px',
                      background: file.status === 'Extracted' ? 'rgba(166, 227, 161, 0.2)' : 'var(--bg-tertiary)',
                      color: file.status === 'Extracted' ? 'var(--accent-success)' : 'var(--text-secondary)',
                      border: file.status === 'Extracted' ? '1px solid var(--accent-success)' : '1px solid var(--border-subtle)',
                      flexShrink: 0,
                    }}
                  >
                    {file.status}
                  </span>
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
              ))}
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
      </div>
    </aside>
  );
};
