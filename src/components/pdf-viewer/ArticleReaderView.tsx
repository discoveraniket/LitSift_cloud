import React, { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
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
  nextSection: () => void;
  prevSection: () => void;
  goToSection: (id: string) => void;
}

export interface ArticleReaderViewProps {
  paper: PaperDocumentInfo;
  onSwitchToPdf?: () => void;
  fontSizeScale?: number;
  onMatchCountChange?: (current: number, total: number) => void;
  onActiveSectionChange?: (info: { id: string; title: string; index: number; total: number }) => void;
}

export const ArticleReaderView = forwardRef<ArticleReaderViewRef, ArticleReaderViewProps>(({
  paper,
  onSwitchToPdf,
  fontSizeScale = 1.0,
  onMatchCountChange,
  onActiveSectionChange,
}, ref) => {
  const sections = paper.sections || [];
  const tables = paper.tables || [];
  const figures = paper.figures || [];

  const sectionItems = useMemo(() => {
    const list: Array<{ id: string; domId: string; title: string; type: 'abstract' | 'section' | 'tables' | 'figures' }> = [];
    if (paper.abstractText) {
      list.push({ id: 'abstract', domId: 'sec-abstract', title: 'Abstract', type: 'abstract' });
    }
    sections.forEach((sec) => {
      list.push({ id: sec.id, domId: `sec-${sec.id}`, title: sec.title, type: 'section' });
    });
    if (tables.length > 0) {
      list.push({ id: 'tables', domId: 'sec-tables', title: `Tables & Datasets (${tables.length})`, type: 'tables' });
    }
    if (figures.length > 0) {
      list.push({ id: 'figures', domId: 'sec-figures', title: `Figures & Visuals (${figures.length})`, type: 'figures' });
    }
    return list;
  }, [paper.abstractText, sections, tables, figures]);

  const [activeSectionId, setActiveSectionId] = useState<string>(() => sectionItems[0]?.id || 'abstract');
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const mainContainerRef = useRef<HTMLElement>(null);
  const searchMatchesRef = useRef<HTMLElement[]>([]);
  const currentMatchIndexRef = useRef<number>(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { addColumn, appendRows, activeEvidence } = useGridStore();
  const { updatePaperDocument } = usePdfStore();

  const currentSectionIndex = sectionItems.findIndex((s) => s.id === activeSectionId);

  // ScrollSpy: Track the active section dynamically as user scrolls the reading area
  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container || sectionItems.length === 0) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;

      // If at top of reading area, default to the first section (e.g. Abstract)
      if (scrollTop < 50) {
        const first = sectionItems[0];
        setActiveSectionId(first?.id || 'abstract');
        if (first) {
          onActiveSectionChange?.({
            id: first.id,
            title: first.title,
            index: 0,
            total: sectionItems.length,
          });
        }
        return;
      }

      // Find which section is currently active
      const containerRect = container.getBoundingClientRect();
      let currentActiveItem = sectionItems[0];

      for (let i = 0; i < sectionItems.length; i++) {
        const item = sectionItems[i];
        const el = document.getElementById(item.domId);
        if (el) {
          const elRect = el.getBoundingClientRect();
          const relativeTop = elRect.top - containerRect.top;
          if (relativeTop <= 160) {
            currentActiveItem = item;
          }
        }
      }

      if (currentActiveItem) {
        setActiveSectionId(currentActiveItem.id);
        const idx = sectionItems.findIndex((s) => s.id === currentActiveItem.id);
        onActiveSectionChange?.({
          id: currentActiveItem.id,
          title: currentActiveItem.title,
          index: idx >= 0 ? idx : 0,
          total: sectionItems.length,
        });
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [sectionItems, onActiveSectionChange]);

  const handlePrevSection = () => {
    if (currentSectionIndex > 0) {
      const prev = sectionItems[currentSectionIndex - 1];
      const el = document.getElementById(prev.domId);
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      setActiveSectionId(prev.id);
      onActiveSectionChange?.({
        id: prev.id,
        title: prev.title,
        index: currentSectionIndex - 1,
        total: sectionItems.length,
      });
    }
  };

  const handleNextSection = () => {
    if (currentSectionIndex < sectionItems.length - 1) {
      const next = sectionItems[currentSectionIndex + 1];
      const el = document.getElementById(next.domId);
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      setActiveSectionId(next.id);
      onActiveSectionChange?.({
        id: next.id,
        title: next.title,
        index: currentSectionIndex + 1,
        total: sectionItems.length,
      });
    }
  };

  const handleGoToSection = (id: string) => {
    const target = sectionItems.find((s) => s.id === id);
    if (target) {
      document.getElementById(target.domId)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      setActiveSectionId(target.id);
      const idx = sectionItems.findIndex((s) => s.id === target.id);
      onActiveSectionChange?.({
        id: target.id,
        title: target.title,
        index: idx >= 0 ? idx : 0,
        total: sectionItems.length,
      });
    }
  };

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
    nextSection: handleNextSection,
    prevSection: handlePrevSection,
    goToSection: handleGoToSection,
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

    const parsedRows = table.rows.map((r, rIdx) => {
      const rowObj: Record<string, any> = {
        id: `tbl-${table.id}-row-${rIdx}-${Date.now()}`,
        pdfId: paper.id,
        pdfTitle: paper.name,
        aiStatus: 'Ready' as const,
      };
      table.headers.forEach((h, hIdx) => {
        rowObj[h] = r[hIdx] ?? '';
      });
      return rowObj;
    });

    appendRows(parsedRows as any);
  };

  // Attach / Replace Local PDF File
  const attachPdfFile = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a valid PDF file.');
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    await updatePaperDocument(paper.id, {
      file: file,
      url: blobUrl,
      sourceType: 'pdf_upload',
      status: 'Ready',
    });

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        await updatePaperDocument(paper.id, { base64 });
      }
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

      {/* Sticky Left Navigation Outline with Active Highlight */}
      <nav
        style={{
          width: '240px',
          borderRight: '1px solid var(--border-subtle, #313244)',
          background: 'var(--bg-secondary, #181825)',
          padding: '16px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Document Outline</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>
            {sectionItems.length} sections
          </span>
        </div>

        {sectionItems.map((item) => {
          const isActive = activeSectionId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveSectionId(item.id);
                document.getElementById(item.domId)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                borderLeft: isActive ? '3px solid var(--accent-primary, #89b4fa)' : '3px solid transparent',
                background: isActive ? 'rgba(137, 180, 250, 0.16)' : 'transparent',
                color: isActive ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                boxShadow: isActive ? 'inset 0 0 8px rgba(137, 180, 250, 0.08)' : 'none',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 500,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={item.title}
            >
              {item.type === 'abstract' && (
                <FileText size={14} style={{ flexShrink: 0, color: isActive ? 'var(--accent-primary, #89b4fa)' : 'inherit' }} />
              )}
              {item.type === 'section' && (
                <BookOpen size={14} style={{ flexShrink: 0, color: isActive ? 'var(--accent-primary, #89b4fa)' : 'inherit' }} />
              )}
              {item.type === 'tables' && (
                <TableIcon size={14} style={{ flexShrink: 0, color: isActive ? 'var(--accent-primary, #89b4fa)' : 'inherit' }} />
              )}
              {item.type === 'figures' && (
                <ImageIcon size={14} style={{ flexShrink: 0, color: isActive ? 'var(--accent-primary, #89b4fa)' : 'inherit' }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Reading Area */}
      <main
        ref={mainContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 48px 48px 48px',
          maxWidth: '960px',
          margin: '0 auto',
          fontSize: `${14.5 * (fontSizeScale || 1.0)}px`,
          lineHeight: 1.7,
          transition: 'font-size 0.15s ease',
          position: 'relative',
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
