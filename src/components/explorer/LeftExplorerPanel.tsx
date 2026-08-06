import React, { useState, useRef } from 'react';
import { useGridStore } from '../../store/useGridStore';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Upload,
  FileText,
  Table,
  Download,
} from 'lucide-react';

interface LeftExplorerPanelProps {
  onSelectPdf: (pdfId: string, title: string) => void;
  onOpenMasterGrid: () => void;
}

export const LeftExplorerPanel: React.FC<LeftExplorerPanelProps> = ({
  onSelectPdf,
  onOpenMasterGrid,
}) => {
  const { columns, rows, importCsvDataset } = useGridStore();

  const [viewsOpen, setViewsOpen] = useState(true);
  const [papersOpen, setPapersOpen] = useState(true);
  const [schemasOpen, setSchemasOpen] = useState(true);
  const [activeItem, setActiveItem] = useState<string>('master-grid');

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [availablePdfs, setAvailablePdfs] = useState<Array<{ id: string; name: string; status: string }>>([
    { id: 'pdf-1', name: '38094623.pdf', status: 'Extracted' },
  ]);

  // Handle PDF Upload
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const newPdfId = `pdf-${Date.now()}`;
    const newPdf = {
      id: newPdfId,
      name: file.name,
      status: 'Pending',
    };

    setAvailablePdfs((prev) => [...prev, newPdf]);
    onSelectPdf(newPdfId, file.name);
    setActiveItem(newPdfId);
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

      importCsvDataset(headers, parsedRows);
      onOpenMasterGrid();
      setActiveItem('master-grid');
    };
    reader.readAsText(file);
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
      {/* Hidden File Inputs for Native Picker */}
      <input
        type="file"
        ref={pdfInputRef}
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={handlePdfUpload}
      />
      <input
        type="file"
        ref={csvInputRef}
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleCsvUpload}
      />

      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <span>EXPLORER</span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Workspace</span>
      </div>

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
              {papersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} RESEARCH PAPERS ({availablePdfs.length})
            </span>
            <span
              className="vscode-action-icon"
              title="Add / Upload PDF Paper"
              onClick={(e) => {
                e.stopPropagation();
                pdfInputRef.current?.click();
              }}
            >
              <Plus size={14} />
            </span>
          </div>

          {papersOpen && (
            <div>
              {availablePdfs.map((file) => (
                <div
                  key={file.id}
                  className={`vscode-tree-item ${activeItem === file.id ? 'active' : ''}`}
                  onClick={() => {
                    onSelectPdf(file.id, file.name);
                    setActiveItem(file.id);
                  }}
                >
                  <FileText size={13} color="var(--accent-secondary)" />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                    }}
                  >
                    {file.status}
                  </span>
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
              <div className="schema-card" style={{ marginBottom: '8px' }}>
                <span className="schema-name">Standard Research Schema</span>
                <span className="schema-fields">
                  {columns.map((c) => c.headerName).join(', ')}
                </span>
              </div>

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
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
