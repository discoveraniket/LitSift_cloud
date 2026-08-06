import React from 'react';
import { useGridStore } from '../../store/useGridStore';

interface LeftExplorerPanelProps {
  onSelectPdf: (pdfId: string, title: string) => void;
  onOpenMasterGrid: () => void;
}

export const LeftExplorerPanel: React.FC<LeftExplorerPanelProps> = ({
  onSelectPdf,
  onOpenMasterGrid,
}) => {
  const { columns, rows } = useGridStore();

  const availablePdfs = [
    { id: 'pdf-1', name: '38094623.pdf', status: 'Extracted' },
  ];

  const handleExportCsv = () => {
    const validRows = rows.filter((r) => !r.isDraftRow);
    const headers = columns.map((c) => c.headerName);

    const csvLines = [
      headers.join(','),
      ...validRows.map((row) =>
        columns
          .map((col) => {
            const rawVal = row[col.field] ?? '';
            // Escape quotes and line breaks for CSV standard formatting
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
      <div className="panel-header">
        <span>EXPLORER</span>
      </div>

      <div className="panel-section">
        <div className="section-title">NAVIGATE VIEWS</div>
        <button className="explorer-item-btn" onClick={onOpenMasterGrid}>
          📊 Master Extraction Grid
        </button>
      </div>

      <div className="panel-section">
        <div className="section-title">RESEARCH PAPERS (1)</div>
        <ul className="file-tree-list">
          {availablePdfs.map((file) => (
            <li
              key={file.id}
              className="file-tree-item"
              onClick={() => onSelectPdf(file.id, file.name)}
            >
              <span className="file-icon">📄</span>
              <span className="file-name">{file.name}</span>
              <span className={`file-badge ${file.status.toLowerCase()}`}>
                {file.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel-section">
        <div className="section-title">EXTRACTION SCHEMAS</div>
        <div className="schema-card">
          <span className="schema-name">Standard Research Schema (CSV)</span>
          <span className="schema-fields">Columns: Title, Authors, Methodology, Sample Size, Key Results</span>
        </div>
        <button
          className="explorer-item-btn"
          style={{
            marginTop: '10px',
            background: 'var(--accent-primary)',
            color: 'var(--bg-secondary)',
            fontWeight: 600,
            justifyContent: 'center',
          }}
          onClick={handleExportCsv}
        >
          📥 Export CSV Dataset
        </button>
      </div>
    </aside>
  );
};
