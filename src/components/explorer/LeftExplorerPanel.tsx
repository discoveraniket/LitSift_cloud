import React from 'react';

interface LeftExplorerPanelProps {
  onSelectPdf: (pdfId: string, title: string) => void;
  onOpenMasterGrid: () => void;
}

export const LeftExplorerPanel: React.FC<LeftExplorerPanelProps> = ({
  onSelectPdf,
  onOpenMasterGrid,
}) => {
  const mockPdfs = [
    { id: 'pdf-1', name: 'Attention_Is_All_You_Need.pdf', status: 'Extracted' },
    { id: 'pdf-2', name: 'GPT4_Technical_Report.pdf', status: 'Pending' },
    { id: 'pdf-3', name: 'Llama3_Architecture_Paper.pdf', status: 'Extracted' },
  ];

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
        <div className="section-title">RESEARCH PAPERS (3)</div>
        <ul className="file-tree-list">
          {mockPdfs.map((file) => (
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
      </div>
    </aside>
  );
};
