import React, { useState, useRef, useEffect } from 'react';
import {
  ExternalLink,
  Download,
  BookOpen,
  FileText,
  Table as TableIcon,
  Image as ImageIcon,
  Upload,
  Copy,
  Check,
  Plus,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';
import { PaperDocumentInfo, PaperTable } from '../../types/paper';
import { useGridStore } from '../../store/useGridStore';
import { usePdfStore } from '../../store/usePdfStore';
import { highlightSnippetInContainer, clearActiveHighlights } from '../../services/highlightUtils';

interface ArticleReaderViewProps {
  paper: PaperDocumentInfo;
  onSwitchToPdf?: () => void;
}

export const ArticleReaderView: React.FC<ArticleReaderViewProps> = ({
  paper,
  onSwitchToPdf,
}) => {
  const [activeSectionId, setActiveSectionId] = useState<string>('abstract');
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const mainContainerRef = useRef<HTMLElement>(null);

  const { addColumn, appendRows, activeEvidence } = useGridStore();
  const { updatePaperDocument } = usePdfStore();

  // Auto-scroll and highlight exact sentence when activeEvidence changes
  useEffect(() => {
    if (!mainContainerRef.current) return;

    clearActiveHighlights(mainContainerRef.current);

    if (!activeEvidence) return;

    if (activeEvidence.snippetText && activeEvidence.snippetText.trim()) {
      const matchedEl = highlightSnippetInContainer(mainContainerRef.current, activeEvidence.snippetText);
      if (matchedEl) {
        matchedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    // Fallback: scroll to matching section heading if snippet couldn't be matched
    if (activeEvidence.sectionName) {
      const lowerSec = activeEvidence.sectionName.toLowerCase();
      if (lowerSec.includes('abstract')) {
        document.getElementById('sec-abstract')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (lowerSec.includes('table')) {
        document.getElementById('sec-tables')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeEvidence]);

  // Copy table content as TSV/CSV to clipboard
  const handleCopyTable = (table: PaperTable) => {
    const headerLine = table.headers.join('\t');
    const rowLines = table.rows.map((r) => r.join('\t')).join('\n');
    const fullTsv = `${headerLine}\n${rowLines}`;

    navigator.clipboard.writeText(fullTsv);
    setCopiedTableId(table.id);
    setTimeout(() => setCopiedTableId(null), 2000);
  };

  // Convert table rows directly into LitSift Data Grid
  const handleImportTableToGrid = (table: PaperTable) => {
    // Add missing headers as schema columns
    table.headers.forEach((h) => {
      if (h && h.trim()) {
        addColumn(h);
      }
    });

    // Create new grid rows
    const newRows = table.rows.map((row, rIdx) => {
      const rowData: Record<string, any> = {
        id: `row-${Date.now()}-${rIdx}`,
        pdfId: paper.id,
        pdfTitle: paper.name,
        aiStatus: 'Confirmed',
      };

      table.headers.forEach((h, cIdx) => {
        const fieldKey = h.toLowerCase().replace(/[^a-z0-9]/g, '_');
        rowData[fieldKey] = row[cIdx] || '';
      });

      return rowData as any;
    });

    appendRows(newRows);
    alert(`Imported ${newRows.length} rows from "${table.label || 'Table'}" directly into the Master Data Grid.`);
  };

  // Handle Drag & Drop of local PDF onto abstract-only paper
  const handlePdfDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Please drop a valid .PDF document.');
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    
    // Read Base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      await updatePaperDocument(paper.id, {
        file,
        url: blobUrl,
        base64,
        sourceType: 'doi_full_pdf',
      });
      if (onSwitchToPdf) onSwitchToPdf();
    };
    reader.readAsDataURL(file);
  };

  const sections = paper.sections || [];
  const tables = paper.tables || [];
  const figures = paper.figures || [];

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: 'var(--bg-primary, #1e1e2e)',
        color: 'var(--text-primary, #cdd6f4)',
        overflow: 'hidden',
      }}
    >
      {/* Sticky Left Navigation Outline */}
      <nav
        style={{
          width: '240px',
          borderRight: '1px solid var(--border-subtle, #313244)',
          background: 'var(--bg-secondary, #181825)',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          overflowY: 'auto',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--text-muted, #6c7086)',
            letterSpacing: '0.05em',
            marginBottom: '8px',
            paddingLeft: '8px',
          }}
        >
          Document Outline
        </div>

        {paper.abstractText && (
          <button
            onClick={() => {
              setActiveSectionId('abstract');
              document.getElementById('sec-abstract')?.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              background: activeSectionId === 'abstract' ? 'rgba(137, 180, 250, 0.15)' : 'transparent',
              color: activeSectionId === 'abstract' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
              fontSize: '12px',
              fontWeight: 500,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <FileText size={14} />
            <span>Abstract</span>
          </button>
        )}

        {sections.map((sec) => (
          <button
            key={sec.id}
            onClick={() => {
              setActiveSectionId(sec.id);
              document.getElementById(`sec-${sec.id}`)?.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              background: activeSectionId === sec.id ? 'rgba(137, 180, 250, 0.15)' : 'transparent',
              color: activeSectionId === sec.id ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
              fontSize: '12px',
              fontWeight: 500,
              textAlign: 'left',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <BookOpen size={14} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sec.title}</span>
          </button>
        ))}

        {tables.length > 0 && (
          <button
            onClick={() => {
              setActiveSectionId('tables');
              document.getElementById('sec-tables')?.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              background: activeSectionId === 'tables' ? 'rgba(137, 180, 250, 0.15)' : 'transparent',
              color: activeSectionId === 'tables' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
              fontSize: '12px',
              fontWeight: 500,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <TableIcon size={14} />
            <span>Tables ({tables.length})</span>
          </button>
        )}

        {figures.length > 0 && (
          <button
            onClick={() => {
              setActiveSectionId('figures');
              document.getElementById('sec-figures')?.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              background: activeSectionId === 'figures' ? 'rgba(137, 180, 250, 0.15)' : 'transparent',
              color: activeSectionId === 'figures' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
              fontSize: '12px',
              fontWeight: 500,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <ImageIcon size={14} />
            <span>Figures ({figures.length})</span>
          </button>
        )}
      </nav>

      {/* Main Reading Area */}
      <main
        ref={mainContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 48px',
          maxWidth: '960px',
          margin: '0 auto',
        }}
      >
        {/* Paper Header Hero */}
        <header style={{ marginBottom: '32px', borderBottom: '1px solid var(--border-subtle, #313244)', paddingBottom: '24px' }}>
          {/* Metadata Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            {/* Open Access Badge */}
            {paper.oaStatus && paper.oaStatus !== 'closed' && paper.oaStatus !== 'unknown' ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(166, 227, 161, 0.15)',
                  color: '#a6e3a1',
                  border: '1px solid rgba(166, 227, 161, 0.3)',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <ShieldCheck size={12} /> {paper.oaStatus.toUpperCase()} OPEN ACCESS
              </span>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(249, 226, 175, 0.15)',
                  color: '#f9e2af',
                  border: '1px solid rgba(249, 226, 175, 0.3)',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <ShieldAlert size={12} /> ABSTRACT & METADATA
              </span>
            )}

            {/* DOI Link Badge */}
            {paper.doi && (
              <a
                href={paper.landingPageUrl || `https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(137, 180, 250, 0.1)',
                  color: 'var(--accent-primary, #89b4fa)',
                  border: '1px solid rgba(137, 180, 250, 0.25)',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  textDecoration: 'none',
                }}
              >
                DOI: {paper.doi} <ArrowUpRight size={10} />
              </a>
            )}

            {/* Citation Count */}
            {paper.citationCount !== undefined && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--bg-tertiary, #11111b)',
                  color: 'var(--text-secondary, #a6adc8)',
                  border: '1px solid var(--border-subtle, #313244)',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                }}
              >
                Cited by {paper.citationCount}
              </span>
            )}
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 700,
              lineHeight: 1.35,
              color: 'var(--text-primary, #cdd6f4)',
              margin: '0 0 16px 0',
            }}
          >
            {paper.title || paper.name}
          </h1>

          {/* Authors */}
          {paper.authors && paper.authors.length > 0 && (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary, #a6adc8)', marginBottom: '8px', lineHeight: 1.5 }}>
              <strong>Authors: </strong>
              {paper.authors.map((a, idx) => (
                <span key={idx}>
                  {a.name}
                  {idx < (paper.authors?.length || 0) - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}

          {/* Journal & Year */}
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #6c7086)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{paper.journal || 'Academic Article'}</span>
            {paper.year && <span>• {paper.year}</span>}
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '18px' }}>
            {paper.url && onSwitchToPdf && (
              <button
                onClick={onSwitchToPdf}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(137, 180, 250, 0.15)',
                  border: '1px solid rgba(137, 180, 250, 0.3)',
                  color: 'var(--accent-primary, #89b4fa)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <FileText size={14} />
                <span>Switch to PDF Canvas</span>
              </button>
            )}

            {paper.pdfDownloadUrl && (
              <a
                href={paper.pdfDownloadUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--bg-tertiary, #11111b)',
                  border: '1px solid var(--border-subtle, #313244)',
                  color: 'var(--text-primary, #cdd6f4)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  textDecoration: 'none',
                }}
              >
                <Download size={14} />
                <span>Download Publisher PDF</span>
              </a>
            )}

            {paper.landingPageUrl && (
              <a
                href={paper.landingPageUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--bg-tertiary, #11111b)',
                  border: '1px solid var(--border-subtle, #313244)',
                  color: 'var(--text-secondary, #a6adc8)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  textDecoration: 'none',
                }}
              >
                <ExternalLink size={14} />
                <span>Publisher Portal</span>
              </a>
            )}
          </div>
        </header>

        {/* Abstract Box */}
        {paper.abstractText && (
          <section
            id="sec-abstract"
            style={{
              background: 'rgba(137, 180, 250, 0.04)',
              borderLeft: '4px solid var(--accent-primary, #89b4fa)',
              borderRadius: '0 8px 8px 0',
              padding: '18px 24px',
              marginBottom: '36px',
            }}
          >
            <h2
              style={{
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--accent-primary, #89b4fa)',
                margin: '0 0 10px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <FileText size={16} /> Abstract
            </h2>
            <p style={{ fontSize: '13.5px', lineHeight: 1.7, color: 'var(--text-primary, #cdd6f4)', margin: 0 }}>
              {paper.abstractText}
            </p>
          </section>
        )}

        {/* Paywalled / Missing PDF Drag & Drop Upgrade Zone */}
        {!paper.url && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handlePdfDrop}
            style={{
              background: isDragOver ? 'rgba(137, 180, 250, 0.15)' : 'var(--bg-secondary, #181825)',
              border: `2px dashed ${isDragOver ? 'var(--accent-primary, #89b4fa)' : 'var(--border-subtle, #313244)'}`,
              borderRadius: '10px',
              padding: '24px',
              textAlign: 'center',
              marginBottom: '36px',
              transition: 'all 0.2s ease',
            }}
          >
            <Upload size={24} style={{ color: 'var(--accent-primary, #89b4fa)', marginBottom: '8px' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
              Have Institutional Access to the Full PDF?
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #6c7086)', margin: '0 0 12px 0' }}>
              Drag & drop the downloaded PDF here to enable the full PDF Viewer and visual chart extraction.
            </p>
          </div>
        )}

        {/* Structured Sections */}
        {sections.map((sec) => (
          <section key={sec.id} id={`sec-${sec.id}`} style={{ marginBottom: '36px' }}>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary, #cdd6f4)',
                borderBottom: '1px solid var(--border-subtle, #313244)',
                paddingBottom: '8px',
                marginBottom: '16px',
              }}
            >
              {sec.title}
            </h2>
            <div style={{ fontSize: '13.5px', lineHeight: 1.7, color: 'var(--text-secondary, #a6adc8)' }}>
              {sec.content.split('\n\n').map((paragraph, pIdx) => (
                <p key={pIdx} style={{ marginBottom: '14px' }}>
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        {/* Structured Tables Section */}
        {tables.length > 0 && (
          <section id="sec-tables" style={{ marginBottom: '40px' }}>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary, #cdd6f4)',
                borderBottom: '1px solid var(--border-subtle, #313244)',
                paddingBottom: '8px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <TableIcon size={18} /> Tables & Datasets ({tables.length})
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {tables.map((tbl) => (
                <div
                  key={tbl.id}
                  style={{
                    background: 'var(--bg-secondary, #181825)',
                    border: '1px solid var(--border-subtle, #313244)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}
                >
                  {/* Table Header Bar */}
                  <div
                    style={{
                      padding: '10px 14px',
                      background: 'var(--bg-tertiary, #11111b)',
                      borderBottom: '1px solid var(--border-subtle, #313244)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '13px', color: 'var(--accent-primary, #89b4fa)' }}>
                        {tbl.label || 'Table'}
                      </strong>
                      {tbl.caption && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted, #6c7086)', margin: '2px 0 0 0' }}>
                          {tbl.caption}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleCopyTable(tbl)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'transparent',
                          border: '1px solid var(--border-subtle, #313244)',
                          color: 'var(--text-secondary, #a6adc8)',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedTableId === tbl.id ? <Check size={12} color="#a6e3a1" /> : <Copy size={12} />}
                        <span>{copiedTableId === tbl.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        onClick={() => handleImportTableToGrid(tbl)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(137, 180, 250, 0.15)',
                          border: '1px solid rgba(137, 180, 250, 0.3)',
                          color: 'var(--accent-primary, #89b4fa)',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={12} />
                        <span>Add to Data Grid</span>
                      </button>
                    </div>
                  </div>

                  {/* Rendered HTML Table */}
                  <div style={{ overflowX: 'auto', maxHeight: '320px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border-subtle, #313244)' }}>
                          {tbl.headers.map((h, hIdx) => (
                            <th
                              key={hIdx}
                              style={{
                                padding: '8px 12px',
                                fontWeight: 600,
                                color: 'var(--text-primary, #cdd6f4)',
                                borderRight: '1px solid var(--border-subtle, #313244)',
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tbl.rows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            style={{
                              borderBottom: '1px solid var(--border-subtle, #313244)',
                              background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                            }}
                          >
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                style={{
                                  padding: '8px 12px',
                                  color: 'var(--text-secondary, #a6adc8)',
                                  borderRight: '1px solid var(--border-subtle, #313244)',
                                }}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Figures Gallery Section */}
        {figures.length > 0 && (
          <section id="sec-figures" style={{ marginBottom: '40px' }}>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary, #cdd6f4)',
                borderBottom: '1px solid var(--border-subtle, #313244)',
                paddingBottom: '8px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <ImageIcon size={18} /> Figures & Visual Artifacts ({figures.length})
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {figures.map((fig) => (
                <div
                  key={fig.id}
                  style={{
                    background: 'var(--bg-secondary, #181825)',
                    border: '1px solid var(--border-subtle, #313244)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <strong style={{ fontSize: '13px', color: 'var(--accent-primary, #89b4fa)' }}>
                    {fig.label || 'Figure'}
                  </strong>
                  {fig.url && (
                    <img
                      src={fig.url}
                      alt={fig.caption}
                      style={{
                        width: '100%',
                        maxHeight: '180px',
                        objectFit: 'contain',
                        borderRadius: '4px',
                        background: '#000',
                      }}
                    />
                  )}
                  <p style={{ fontSize: '11px', color: 'var(--text-muted, #6c7086)', margin: 0, lineHeight: 1.4 }}>
                    {fig.caption}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
