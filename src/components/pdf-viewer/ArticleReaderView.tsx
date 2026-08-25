import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
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
  Paperclip,
} from 'lucide-react';
import { PaperDocumentInfo, PaperTable } from '../../types/paper';
import { useGridStore } from '../../store/useGridStore';
import { usePdfStore } from '../../store/usePdfStore';
import {
  highlightArticleSnippet,
  clearActiveHighlights,
  flashActiveHighlights,
} from '../../services/highlightUtils';

export interface ArticleReaderViewRef {
  search: (query: string) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  clearSearch: () => void;
}

export interface ArticleReaderViewProps {
  paper: PaperDocumentInfo;
  onSwitchToPdf?: () => void;
  fontSizeScale?: number;
  onMatchCountChange?: (current: number, total: number) => void;
}

export const ArticleReaderView = forwardRef<ArticleReaderViewRef, ArticleReaderViewProps>(({
  paper,
  onSwitchToPdf,
  fontSizeScale = 1.0,
  onMatchCountChange,
}, ref) => {
  const [activeSectionId, setActiveSectionId] = useState<string>('abstract');
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const mainContainerRef = useRef<HTMLElement>(null);
  const searchMatchesRef = useRef<HTMLElement[]>([]);
  const currentMatchIndexRef = useRef<number>(-1);

  const { addColumn, appendRows, activeEvidence } = useGridStore();
  const { updatePaperDocument } = usePdfStore();

  // In-Article Text Search & Match Navigation
  const clearSearch = () => {
    if (!mainContainerRef.current) return;
    const marks = mainContainerRef.current.querySelectorAll('mark.reader-search-mark');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
      }
    });
    searchMatchesRef.current = [];
    currentMatchIndexRef.current = -1;
    onMatchCountChange?.(0, 0);
  };

  const search = (query: string) => {
    clearSearch();
    if (!query || !query.trim() || !mainContainerRef.current) return;

    const trimmedQuery = query.trim().toLowerCase();
    const walker = document.createTreeWalker(mainContainerRef.current, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Text | null = null;
    while ((node = walker.nextNode() as Text | null)) {
      const parentTag = node.parentElement?.tagName.toLowerCase();
      if (parentTag === 'button' || parentTag === 'nav' || node.parentElement?.closest('button')) {
        continue;
      }
      if (node.nodeValue && node.nodeValue.toLowerCase().includes(trimmedQuery)) {
        textNodes.push(node);
      }
    }

    const createdMarks: HTMLElement[] = [];

    for (const textNode of textNodes) {
      let currentText = textNode.nodeValue || '';
      let lower = currentText.toLowerCase();
      let matchIdx = lower.indexOf(trimmedQuery);

      if (matchIdx !== -1) {
        const parent = textNode.parentNode;
        if (!parent) continue;

        let workingNode: Text = textNode;

        while (matchIdx !== -1 && workingNode.nodeValue) {
          const before = workingNode.nodeValue.substring(0, matchIdx);
          const matched = workingNode.nodeValue.substring(matchIdx, matchIdx + trimmedQuery.length);
          const after = workingNode.nodeValue.substring(matchIdx + trimmedQuery.length);

          workingNode.nodeValue = before;

          const mark = document.createElement('mark');
          mark.className = 'reader-search-mark';
          mark.textContent = matched;

          const afterNode = document.createTextNode(after);

          parent.insertBefore(mark, workingNode.nextSibling);
          parent.insertBefore(afterNode, mark.nextSibling);

          createdMarks.push(mark);

          workingNode = afterNode;
          lower = (workingNode.nodeValue || '').toLowerCase();
          matchIdx = lower.indexOf(trimmedQuery);
        }
      }
    }

    searchMatchesRef.current = createdMarks;

    if (createdMarks.length > 0) {
      currentMatchIndexRef.current = 0;
      createdMarks[0].classList.add('reader-search-match-current');
      createdMarks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      onMatchCountChange?.(1, createdMarks.length);
    } else {
      onMatchCountChange?.(0, 0);
    }
  };

  const nextMatch = () => {
    const total = searchMatchesRef.current.length;
    if (total === 0) return;

    if (currentMatchIndexRef.current >= 0 && currentMatchIndexRef.current < total) {
      searchMatchesRef.current[currentMatchIndexRef.current].classList.remove('reader-search-match-current');
    }

    currentMatchIndexRef.current = (currentMatchIndexRef.current + 1) % total;
    const currentEl = searchMatchesRef.current[currentMatchIndexRef.current];
    currentEl.classList.add('reader-search-match-current');
    currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    onMatchCountChange?.(currentMatchIndexRef.current + 1, total);
  };

  const prevMatch = () => {
    const total = searchMatchesRef.current.length;
    if (total === 0) return;

    if (currentMatchIndexRef.current >= 0 && currentMatchIndexRef.current < total) {
      searchMatchesRef.current[currentMatchIndexRef.current].classList.remove('reader-search-match-current');
    }

    currentMatchIndexRef.current = (currentMatchIndexRef.current - 1 + total) % total;
    const currentEl = searchMatchesRef.current[currentMatchIndexRef.current];
    currentEl.classList.add('reader-search-match-current');
    currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    onMatchCountChange?.(currentMatchIndexRef.current + 1, total);
  };

  useImperativeHandle(ref, () => ({
    search,
    nextMatch,
    prevMatch,
    clearSearch,
  }));

  // Auto-scroll and highlight exact sentence when activeEvidence changes (with gentle flash)
  useEffect(() => {
    if (!mainContainerRef.current) return;

    if (!activeEvidence) {
      clearActiveHighlights(mainContainerRef.current);
      return;
    }

    const searchText = activeEvidence.snippetText?.trim() || activeEvidence.keywordText?.trim() || '';

    if (searchText) {
      const matchedEl = highlightArticleSnippet(
        mainContainerRef.current,
        searchText,
        {
          keyword: activeEvidence.keywordText,
          sectionName: activeEvidence.sectionName,
          paragraphNumber: activeEvidence.paragraphNumber,
        }
      );
      if (matchedEl) {
        flashActiveHighlights(mainContainerRef.current);
        matchedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    // Dynamic Section Fallback: scroll to matching section heading if snippet couldn't be matched
    if (activeEvidence.sectionName) {
      const lowerSec = activeEvidence.sectionName.toLowerCase().trim();
      if (lowerSec.includes('abstract')) {
        document.getElementById('sec-abstract')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (lowerSec.includes('table')) {
        document.getElementById('sec-tables')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (lowerSec.includes('figure')) {
        document.getElementById('sec-figures')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const targetClean = lowerSec.replace(/[^a-z0-9]/g, '');
        const matchedSec = (paper.sections || []).find((s) => {
          const sTitle = s.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          const sId = s.id.toLowerCase().replace(/[^a-z0-9]/g, '');
          return sTitle.includes(targetClean) || targetClean.includes(sTitle) || sId === targetClean;
        });
        if (matchedSec) {
          document.getElementById(`sec-${matchedSec.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [activeEvidence, paper.sections]);

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
        aiStatus: 'Pending Review',
      };

      table.headers.forEach((h, cIdx) => {
        const fieldKey = h.toLowerCase().replace(/[^a-z0-9]/g, '_');
        let cellVal = row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]).trim() : 'Not reported';
        if (cellVal === '-' || cellVal === '' || cellVal.toLowerCase() === 'none' || cellVal.toLowerCase() === 'n/a') {
          cellVal = 'Not reported';
        }
        rowData[fieldKey] = cellVal;
      });

      return rowData as any;
    });

    appendRows(newRows);
    alert(`Imported ${newRows.length} rows from "${table.label || 'Table'}" directly into the Master Data Grid.`);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Attach local PDF binary to this paper document (keeps both Reader View and PDF Canvas in workspace)
  const attachPdfFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Please select a valid .PDF document.');
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

  // Handle Drag & Drop of local PDF onto paper
  const handlePdfDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await attachPdfFile(file);
  };

  const sections = paper.sections || [];
  const tables = paper.tables || [];
  const figures = paper.figures || [];

  const hasRealPdf = Boolean(
    paper.url &&
    paper.url.trim().length > 0 &&
    paper.url !== 'blob:' &&
    (!paper.file || (paper.file instanceof Blob && paper.file.size > 0)) &&
    paper.sourceType !== 'doi_abstract_only' &&
    paper.sourceType !== 'doi_structured'
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handlePdfDrop}
      style={{
        display: 'flex',
        height: '100%',
        background: 'var(--bg-primary, #1e1e2e)',
        color: 'var(--text-primary, #cdd6f4)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Visual Glassmorphic Drag & Drop Overlay */}
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(24, 24, 37, 0.92)',
            backdropFilter: 'blur(6px)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            border: '2px dashed var(--accent-primary, #89b4fa)',
            margin: '12px',
            borderRadius: '12px',
            pointerEvents: 'none',
          }}
        >
          <Upload size={44} color="var(--accent-primary, #89b4fa)" />
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)', margin: 0 }}>
            Drop PDF to attach to this paper
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #6c7086)', margin: 0 }}>
            Enables visual PDF Canvas while preserving structured Reader View
          </p>
        </div>
      )}

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
          fontSize: `${14.5 * (fontSizeScale || 1.0)}px`,
          lineHeight: 1.7,
          transition: 'font-size 0.15s ease',
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
              fontSize: `${24 * fontSizeScale}px`,
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
            <div style={{ fontSize: `${13 * fontSizeScale}px`, color: 'var(--text-secondary, #a6adc8)', marginBottom: '8px', lineHeight: 1.5 }}>
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
          <div style={{ fontSize: `${12 * fontSizeScale}px`, color: 'var(--text-muted, #6c7086)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{paper.journal || 'Academic Article'}</span>
            {paper.year && <span>• {paper.year}</span>}
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '18px' }}>
            {/* Hidden File Input for Attaching PDF */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) attachPdfFile(f);
                e.target.value = '';
              }}
            />

            {/* Switch to PDF Canvas Button (when PDF binary is available) */}
            {hasRealPdf && onSwitchToPdf && (
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
                title="Switch to visual PDF canvas with page-by-page rendering"
              >
                <FileText size={14} />
                <span>Switch to PDF Canvas</span>
              </button>
            )}

            {/* Attach PDF / Replace PDF Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: hasRealPdf ? 'var(--bg-tertiary, #11111b)' : 'rgba(166, 227, 161, 0.12)',
                border: `1px solid ${hasRealPdf ? 'var(--border-subtle, #313244)' : 'rgba(166, 227, 161, 0.35)'}`,
                color: hasRealPdf ? 'var(--text-secondary, #a6adc8)' : 'var(--accent-success, #a6e3a1)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title={hasRealPdf ? "Replace the attached PDF file" : "Attach a local PDF file to this paper (keeps both Reader View and PDF Canvas in workspace)"}
            >
              <Paperclip size={14} />
              <span>{hasRealPdf ? 'Replace Attached PDF' : 'Attach PDF to Paper'}</span>
            </button>

            {hasRealPdf && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--accent-success, #a6e3a1)',
                  background: 'rgba(166, 227, 161, 0.08)',
                  padding: '5px 8px',
                  borderRadius: '5px',
                  border: '1px solid rgba(166, 227, 161, 0.2)',
                }}
              >
                <Check size={12} />
                <span>PDF Attached</span>
              </span>
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
                fontSize: `${16 * fontSizeScale}px`,
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
            <p style={{ fontSize: `${14.5 * fontSizeScale}px`, lineHeight: 1.7, color: 'var(--text-primary, #cdd6f4)', margin: 0 }}>
              {paper.abstractText}
            </p>
          </section>
        )}

        {/* Paywalled / Missing Full Text Drag & Drop Upgrade Zone (Only shown when no full-text sections exist) */}
        {!paper.url && (!sections || sections.length === 0) && (
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
            <h3 style={{ fontSize: `${14 * fontSizeScale}px`, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
              Have Institutional Access to the Full PDF?
            </h3>
            <p style={{ fontSize: `${12 * fontSizeScale}px`, color: 'var(--text-muted, #6c7086)', margin: '0 0 12px 0' }}>
              Only the abstract is available from open registries. Drag & drop the downloaded PDF here to enable the full PDF Viewer and visual chart extraction.
            </p>
          </div>
        )}

        {/* Structured Sections */}
        {sections.map((sec) => (
          <section key={sec.id} id={`sec-${sec.id}`} style={{ marginBottom: '36px' }}>
            <h2
              style={{
                fontSize: `${18 * fontSizeScale}px`,
                fontWeight: 700,
                color: 'var(--text-primary, #cdd6f4)',
                borderBottom: '1px solid var(--border-subtle, #313244)',
                paddingBottom: '8px',
                marginBottom: '16px',
              }}
            >
              {sec.title}
            </h2>
            <div style={{ fontSize: `${14.5 * fontSizeScale}px`, lineHeight: 1.7, color: 'var(--text-secondary, #a6adc8)' }}>
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
                fontSize: `${18 * fontSizeScale}px`,
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
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: `${12.5 * fontSizeScale}px`, textAlign: 'left' }}>
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
                  <strong style={{ fontSize: `${13 * fontSizeScale}px`, color: 'var(--accent-primary, #89b4fa)' }}>
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
                  <p style={{ fontSize: `${11.5 * fontSizeScale}px`, color: 'var(--text-muted, #6c7086)', margin: 0, lineHeight: 1.4 }}>
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
});

ArticleReaderView.displayName = 'ArticleReaderView';
