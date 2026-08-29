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
  RefreshCw,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
  Layers,
  Database,
} from 'lucide-react';
import { PaperDocumentInfo, PaperTable } from '../../types/paper';
import { useGridStore } from '../../store/useGridStore';
import { usePdfStore } from '../../store/usePdfStore';
import { resolvePaperByDoi, normalizeDoi, getPaperTextSourceInfo } from '../../services/doiService';
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

export interface OutlineChildItem {
  id: string;
  domId: string;
  fullTitle: string;
  displayTitle: string;
  type: 'abstract' | 'section' | 'tables' | 'figures';
}

export interface OutlineGroup {
  id: string;
  groupTitle: string;
  domId: string;
  isGroup: boolean;
  type: 'abstract' | 'section' | 'tables' | 'figures';
  children: OutlineChildItem[];
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

  // Hierarchical Outline Grouping (Group sections with ' > ' or ' / ' under parent headers)
  const hierarchicalGroups = useMemo(() => {
    const groups: OutlineGroup[] = [];

    // 1. Abstract
    if (paper.abstractText) {
      groups.push({
        id: 'group-abstract',
        groupTitle: 'Abstract',
        domId: 'sec-abstract',
        isGroup: false,
        type: 'abstract',
        children: [
          {
            id: 'abstract',
            domId: 'sec-abstract',
            fullTitle: 'Abstract',
            displayTitle: 'Abstract',
            type: 'abstract',
          },
        ],
      });
    }

    // 2. Sections grouping
    const currentGroupMap: Record<string, OutlineGroup> = {};

    sections.forEach((sec, secIdx) => {
      const rawTitle = (sec.title || `Section ${secIdx + 1}`).trim();
      const hasDelimiter = rawTitle.includes(' > ') || rawTitle.includes(' / ');

      if (hasDelimiter) {
        const parts = rawTitle.split(/\s*(?:>|\/)\s*/);
        const parentTitle = parts[0].trim();
        const childTitle = parts.slice(1).join(' > ').trim();
        const groupKey = parentTitle.toLowerCase();

        if (!currentGroupMap[groupKey]) {
          const newGroup: OutlineGroup = {
            id: `group-${sec.id}`,
            groupTitle: parentTitle,
            domId: `sec-${sec.id}`,
            isGroup: true,
            type: 'section',
            children: [],
          };
          currentGroupMap[groupKey] = newGroup;
          groups.push(newGroup);
        }

        currentGroupMap[groupKey].children.push({
          id: sec.id,
          domId: `sec-${sec.id}`,
          fullTitle: rawTitle,
          displayTitle: childTitle || rawTitle,
          type: 'section',
        });
      } else if (sec.subsections && sec.subsections.length > 0) {
        const newGroup: OutlineGroup = {
          id: `group-${sec.id}`,
          groupTitle: rawTitle,
          domId: `sec-${sec.id}`,
          isGroup: true,
          type: 'section',
          children: [
            {
              id: sec.id,
              domId: `sec-${sec.id}`,
              fullTitle: rawTitle,
              displayTitle: 'Overview',
              type: 'section',
            },
            ...sec.subsections.map((sub) => ({
              id: sub.id,
              domId: `sec-${sub.id}`,
              fullTitle: `${rawTitle} > ${sub.title}`,
              displayTitle: sub.title,
              type: 'section' as const,
            })),
          ],
        };
        groups.push(newGroup);
      } else {
        // Standalone section
        groups.push({
          id: `group-${sec.id}`,
          groupTitle: rawTitle,
          domId: `sec-${sec.id}`,
          isGroup: false,
          type: 'section',
          children: [
            {
              id: sec.id,
              domId: `sec-${sec.id}`,
              fullTitle: rawTitle,
              displayTitle: rawTitle,
              type: 'section',
            },
          ],
        });
      }
    });

    // 3. Tables
    if (tables.length > 0) {
      groups.push({
        id: 'group-tables',
        groupTitle: `Tables & Datasets (${tables.length})`,
        domId: 'sec-tables',
        isGroup: false,
        type: 'tables',
        children: [
          {
            id: 'tables',
            domId: 'sec-tables',
            fullTitle: `Tables & Datasets (${tables.length})`,
            displayTitle: `Tables & Datasets (${tables.length})`,
            type: 'tables',
          },
        ],
      });
    }

    // 4. Figures
    if (figures.length > 0) {
      groups.push({
        id: 'group-figures',
        groupTitle: `Figures & Visuals (${figures.length})`,
        domId: 'sec-figures',
        isGroup: false,
        type: 'figures',
        children: [
          {
            id: 'figures',
            domId: 'sec-figures',
            fullTitle: `Figures & Visuals (${figures.length})`,
            displayTitle: `Figures & Visuals (${figures.length})`,
            type: 'figures',
          },
        ],
      });
    }

    return groups;
  }, [paper.abstractText, sections, tables, figures]);

  const [activeSectionId, setActiveSectionId] = useState<string>(() => sectionItems[0]?.id || 'abstract');
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Outline UI States: Filter, Collapsible Groups, Resizing, and Panel Collapse
  const [outlineFilter, setOutlineFilter] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [outlineWidth, setOutlineWidth] = useState<number>(() => {
    const saved = localStorage.getItem('LITSIFT_OUTLINE_WIDTH');
    return saved ? Math.min(480, Math.max(180, Number(saved))) : 260;
  });
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('LITSIFT_OUTLINE_COLLAPSED') === 'true';
  });
  const [isResizing, setIsResizing] = useState(false);

  const mainContainerRef = useRef<HTMLElement>(null);
  const searchMatchesRef = useRef<HTMLElement[]>([]);
  const currentMatchIndexRef = useRef<number>(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { addColumn, appendRows, activeEvidence } = useGridStore();
  const { updatePaperDocument } = usePdfStore();

  const currentSectionIndex = sectionItems.findIndex((s) => s.id === activeSectionId);

  // Filtered Groups for Search
  const filteredGroups = useMemo(() => {
    const q = outlineFilter.trim().toLowerCase();
    if (!q) return hierarchicalGroups;

    return hierarchicalGroups
      .map((grp) => {
        const matchesGroupTitle = grp.groupTitle.toLowerCase().includes(q);
        const matchingChildren = grp.children.filter(
          (c) =>
            c.displayTitle.toLowerCase().includes(q) ||
            c.fullTitle.toLowerCase().includes(q)
        );

        if (matchesGroupTitle) {
          return grp;
        }

        if (matchingChildren.length > 0) {
          return {
            ...grp,
            children: matchingChildren,
          };
        }

        return null;
      })
      .filter((g): g is OutlineGroup => g !== null);
  }, [hierarchicalGroups, outlineFilter]);

  const toggleGroupCollapse = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = outlineWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(480, Math.max(180, startWidth + delta));
      setOutlineWidth(newWidth);
      localStorage.setItem('LITSIFT_OUTLINE_WIDTH', String(newWidth));
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Auto-expand parent group when active section is inside a collapsed group
  useEffect(() => {
    if (!activeSectionId) return;
    const parentGroup = hierarchicalGroups.find((g) =>
      g.isGroup && g.children.some((c) => c.id === activeSectionId)
    );
    if (parentGroup && collapsedGroups[parentGroup.id]) {
      setCollapsedGroups((prev) => ({ ...prev, [parentGroup.id]: false }));
    }
  }, [activeSectionId, hierarchicalGroups]);

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
      const result = event.target?.result as string;
      if (result) {
        const cleanBase64 = result.includes(',') ? result.split(',')[1] : result;
        await updatePaperDocument(paper.id, { base64: cleanBase64.trim() });
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

  // Re-query academic databases & registries (OpenAlex, Europe PMC, Unpaywall, Crossref)
  const [isRefetching, setIsRefetching] = useState(false);
  const [refetchStatus, setRefetchStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const handleRefetchArticle = async () => {
    const rawDoi = paper.doi ? normalizeDoi(paper.doi) : '';
    if (!rawDoi) {
      setRefetchStatus({
        message: 'No valid DOI associated with this paper to query academic registries.',
        type: 'error',
      });
      setTimeout(() => setRefetchStatus(null), 5000);
      return;
    }

    setIsRefetching(true);
    setRefetchStatus({ message: `Querying academic registries for DOI: ${rawDoi}...`, type: 'info' });

    try {
      const resolved = await resolvePaperByDoi(rawDoi, (p) => {
        setRefetchStatus({ message: p.message, type: 'info' });
      });

      const mergedUpdates: Partial<PaperDocumentInfo> = {
        doi: resolved.doi || paper.doi,
        pmcid: resolved.pmcid || paper.pmcid,
        title: resolved.title || paper.title,
        authors: resolved.authors && resolved.authors.length > 0 ? resolved.authors : paper.authors,
        journal: resolved.journal || paper.journal,
        year: resolved.year || paper.year,
        citationCount: resolved.citationCount ?? paper.citationCount,
        oaStatus: resolved.oaStatus && resolved.oaStatus !== 'unknown' ? resolved.oaStatus : paper.oaStatus,
        abstractText: resolved.abstractText || paper.abstractText,
        sections: resolved.sections && resolved.sections.length > 0 ? resolved.sections : paper.sections,
        tables: resolved.tables && resolved.tables.length > 0 ? resolved.tables : paper.tables,
        figures: resolved.figures && resolved.figures.length > 0 ? resolved.figures : paper.figures,
        landingPageUrl: resolved.landingPageUrl || paper.landingPageUrl,
        pdfDownloadUrl: resolved.pdfDownloadUrl || paper.pdfDownloadUrl,
        sourceType: resolved.sections && resolved.sections.length > 0 ? 'doi_structured' : (paper.sourceType || 'doi_abstract_only'),
        textSource: resolved.textSource || paper.textSource,
        textSourceUrl: resolved.textSourceUrl || paper.textSourceUrl,
      };

      if (resolved.url && !paper.url) {
        mergedUpdates.url = resolved.url;
        mergedUpdates.file = resolved.file;
        mergedUpdates.base64 = resolved.base64;
      }

      await updatePaperDocument(paper.id, mergedUpdates);

      const sectionCount = mergedUpdates.sections?.length || 0;
      const tableCount = mergedUpdates.tables?.length || 0;
      setRefetchStatus({
        message: `Article refreshed! ${sectionCount > 0 ? `${sectionCount} structured sections` : 'Metadata updated'}, ${tableCount} tables retrieved.`,
        type: 'success',
      });
      setTimeout(() => setRefetchStatus(null), 5000);
    } catch (err: any) {
      console.error('Error re-fetching article:', err);
      setRefetchStatus({
        message: err.message || 'Failed to re-fetch article from academic registries.',
        type: 'error',
      });
      setTimeout(() => setRefetchStatus(null), 6000);
    } finally {
      setIsRefetching(false);
    }
  };

  const hasRealPdf = Boolean(
    paper.url &&
    paper.url.trim().length > 0 &&
    paper.url !== 'blob:' &&
    (!paper.file || (paper.file instanceof Blob && paper.file.size > 0)) &&
    paper.sourceType !== 'doi_abstract_only' &&
    paper.sourceType !== 'doi_structured'
  );

  const textSourceInfo = useMemo(() => getPaperTextSourceInfo(paper), [paper]);

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

      {/* Sticky Left Navigation Outline (Resizable, Collapsible, Hierarchical) */}
      {!isOutlineCollapsed && (
        <nav
          style={{
            width: `${outlineWidth}px`,
            borderRight: '1px solid var(--border-subtle, #313244)',
            background: 'var(--bg-secondary, #181825)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            position: 'relative',
            userSelect: isResizing ? 'none' : 'auto',
          }}
        >
          {/* Resize Drag Splitter */}
          <div
            onMouseDown={handleMouseDownResize}
            title="Drag to resize Document Outline"
            style={{
              position: 'absolute',
              right: '-3px',
              top: 0,
              bottom: 0,
              width: '6px',
              cursor: 'col-resize',
              zIndex: 30,
              background: isResizing ? 'var(--accent-primary, #89b4fa)' : 'transparent',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isResizing) e.currentTarget.style.background = 'rgba(137, 180, 250, 0.4)';
            }}
            onMouseLeave={(e) => {
              if (!isResizing) e.currentTarget.style.background = 'transparent';
            }}
          />

          {/* Outline Header with Total Count and Collapse Button */}
          <div
            style={{
              padding: '12px 10px 8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-subtle, #313244)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
              <Layers size={13} color="var(--accent-primary, #89b4fa)" style={{ flexShrink: 0 }} />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--text-primary, #cdd6f4)',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}
              >
                Document Outline
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  color: 'var(--text-muted, #6c7086)',
                  fontWeight: 600,
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  whiteSpace: 'nowrap',
                }}
              >
                {sectionItems.length} sections
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsOutlineCollapsed(true);
                localStorage.setItem('LITSIFT_OUTLINE_COLLAPSED', 'true');
              }}
              title="Collapse Document Outline"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #6c7086)',
                cursor: 'pointer',
                padding: '3px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary, #cdd6f4)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted, #6c7086)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <PanelLeftClose size={14} />
            </button>
          </div>

          {/* Section Search / Filter Bar */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', flexShrink: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-tertiary, #11111b)',
                border: '1px solid var(--border-subtle, #313244)',
                borderRadius: '5px',
                padding: '3px 8px',
              }}
            >
              <Search size={11} color="var(--text-muted, #6c7086)" />
              <input
                type="text"
                value={outlineFilter}
                onChange={(e) => setOutlineFilter(e.target.value)}
                placeholder="Filter outline..."
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '11px',
                  color: 'var(--text-primary, #cdd6f4)',
                }}
              />
              {outlineFilter && (
                <button
                  type="button"
                  onClick={() => setOutlineFilter('')}
                  title="Clear filter"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted, #6c7086)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          </div>

          {/* Outline Items Tree List */}
          <div
            style={{
              padding: '8px 6px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              flex: 1,
            }}
          >
            {filteredGroups.length === 0 ? (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--text-muted, #6c7086)', fontSize: '11px' }}>
                No matching sections found.
              </div>
            ) : (
              filteredGroups.map((group) => {
                if (!group.isGroup) {
                  // Single Standalone Item (Abstract, Tables, Figures, Simple Top-Level)
                  const item = group.children[0];
                  if (!item) return null;
                  const isActive = activeSectionId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        handleGoToSection(item.id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '5px',
                        border: 'none',
                        borderLeft: isActive ? '3px solid var(--accent-primary, #89b4fa)' : '3px solid transparent',
                        background: isActive ? 'rgba(137, 180, 250, 0.16)' : 'transparent',
                        color: isActive ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                        boxShadow: isActive ? 'inset 0 0 8px rgba(137, 180, 250, 0.08)' : 'none',
                        fontSize: '11.5px',
                        fontWeight: isActive ? 600 : 500,
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        width: '100%',
                      }}
                      title={item.fullTitle}
                    >
                      {item.type === 'abstract' && (
                        <FileText size={13} style={{ flexShrink: 0, color: isActive ? 'var(--accent-primary, #89b4fa)' : 'inherit' }} />
                      )}
                      {item.type === 'section' && (
                        <BookOpen size={13} style={{ flexShrink: 0, color: isActive ? 'var(--accent-primary, #89b4fa)' : 'inherit' }} />
                      )}
                      {item.type === 'tables' && (
                        <TableIcon size={13} style={{ flexShrink: 0, color: isActive ? 'var(--accent-primary, #89b4fa)' : 'inherit' }} />
                      )}
                      {item.type === 'figures' && (
                        <ImageIcon size={13} style={{ flexShrink: 0, color: isActive ? 'var(--accent-primary, #89b4fa)' : 'inherit' }} />
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.displayTitle}</span>
                    </button>
                  );
                }

                // Hierarchical Group with Subsections (e.g., MATERIALS AND METHODS (12), RESULTS (5))
                const isCollapsed = Boolean(collapsedGroups[group.id] && !outlineFilter);
                const hasActiveChild = group.children.some((c) => c.id === activeSectionId);

                return (
                  <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginBottom: '2px' }}>
                    {/* Parent Group Header */}
                    <div
                      onClick={() => {
                        const firstChild = group.children[0];
                        if (firstChild) {
                          handleGoToSection(firstChild.id);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 6px 5px 4px',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        background: hasActiveChild ? 'rgba(137, 180, 250, 0.08)' : 'transparent',
                        color: hasActiveChild ? 'var(--text-primary, #cdd6f4)' : 'var(--text-secondary, #a6adc8)',
                        transition: 'all 0.15s ease',
                      }}
                      title={group.groupTitle}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                        <button
                          type="button"
                          onClick={(e) => toggleGroupCollapse(group.id, e)}
                          title={isCollapsed ? 'Expand section group' : 'Collapse section group'}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted, #6c7086)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        </button>
                        <BookOpen size={12} color="var(--accent-secondary, #cba6f7)" style={{ flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {group.groupTitle}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: '9px',
                          color: 'var(--text-muted, #6c7086)',
                          background: 'rgba(255, 255, 255, 0.05)',
                          padding: '1px 5px',
                          borderRadius: '8px',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {group.children.length}
                      </span>
                    </div>

                    {/* Nested Subsections (With clean, un-prefixed titles) */}
                    {!isCollapsed && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1px',
                          paddingLeft: '14px',
                          marginLeft: '9px',
                          borderLeft: '1px solid rgba(255, 255, 255, 0.07)',
                        }}
                      >
                        {group.children.map((child) => {
                          const isChildActive = activeSectionId === child.id;
                          return (
                            <button
                              key={child.id}
                              onClick={() => {
                                handleGoToSection(child.id);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4.5px 8px',
                                borderRadius: '4px',
                                border: 'none',
                                borderLeft: isChildActive ? '2.5px solid var(--accent-primary, #89b4fa)' : '2.5px solid transparent',
                                background: isChildActive ? 'rgba(137, 180, 250, 0.16)' : 'transparent',
                                color: isChildActive ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                                fontSize: '11px',
                                fontWeight: isChildActive ? 600 : 400,
                                textAlign: 'left',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                width: '100%',
                              }}
                              title={child.fullTitle}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{child.displayTitle}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </nav>
      )}

      {/* Collapsed State: Sleek Docked Mini-Sidebar Rail */}
      {isOutlineCollapsed && (
        <aside
          onClick={() => {
            setIsOutlineCollapsed(false);
            localStorage.setItem('LITSIFT_OUTLINE_COLLAPSED', 'false');
          }}
          title={`Click to expand Document Outline (${sectionItems.length} sections)`}
          style={{
            width: '38px',
            borderRight: '1px solid var(--border-subtle, #313244)',
            background: 'var(--bg-secondary, #181825)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 0',
            gap: '12px',
            flexShrink: 0,
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary, #181825)';
          }}
        >
          <button
            type="button"
            title="Expand Document Outline"
            onClick={(e) => {
              e.stopPropagation();
              setIsOutlineCollapsed(false);
              localStorage.setItem('LITSIFT_OUTLINE_COLLAPSED', 'false');
            }}
            style={{
              background: 'rgba(137, 180, 250, 0.12)',
              border: '1px solid rgba(137, 180, 250, 0.25)',
              color: 'var(--accent-primary, #89b4fa)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <PanelLeftOpen size={15} />
          </button>

          {/* Vertical Title & Section Count */}
          <div
            style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted, #6c7086)',
              marginTop: '6px',
            }}
          >
            <span>Outline</span>
            <span
              style={{
                fontSize: '9px',
                background: 'rgba(255, 255, 255, 0.06)',
                color: 'var(--text-secondary, #a6adc8)',
                padding: '2px 4px',
                borderRadius: '8px',
                transform: 'rotate(90deg)',
                fontWeight: 600,
              }}
            >
              {sectionItems.length}
            </span>
          </div>
        </aside>
      )}

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

            {/* Database / Text Provenance Source Badge */}
            {textSourceInfo && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(203, 166, 247, 0.12)',
                  color: 'var(--accent-secondary, #cba6f7)',
                  border: '1px solid rgba(203, 166, 247, 0.28)',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
                title={`Database Text Source: ${textSourceInfo.name}${textSourceInfo.isStructured ? ' (Full structured sections retrieved)' : ' (Abstract & metadata)'}`}
              >
                <Database size={11} />
                <span><strong>{textSourceInfo.shortName}</strong></span>
                {textSourceInfo.url && (
                  <a
                    href={textSourceInfo.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: 'var(--accent-secondary, #cba6f7)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      textDecoration: 'none',
                      opacity: 0.8,
                    }}
                    title={`Open source record on ${textSourceInfo.shortName}`}
                  >
                    <ArrowUpRight size={10} />
                  </a>
                )}
              </span>
            )}

            {/* Quick 1-Click Refresh Button */}
            {paper.doi && (
              <button
                onClick={handleRefetchArticle}
                disabled={isRefetching}
                title="Re-query academic registries (OpenAlex, Europe PMC, Unpaywall, Crossref) for latest metadata & full-text"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: isRefetching ? 'rgba(137, 180, 250, 0.2)' : 'var(--bg-tertiary, #11111b)',
                  color: 'var(--accent-primary, #89b4fa)',
                  border: '1px solid var(--border-subtle, #313244)',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  cursor: isRefetching ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <RefreshCw size={10} className={isRefetching ? 'spin-animation' : ''} />
                <span>{isRefetching ? 'Refreshing...' : 'Refresh'}</span>
              </button>
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

            {/* Re-fetch Article from Academic Registries / Database Button */}
            <button
              onClick={handleRefetchArticle}
              disabled={isRefetching}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isRefetching ? 'rgba(137, 180, 250, 0.15)' : 'var(--bg-tertiary, #11111b)',
                border: `1px solid ${isRefetching ? 'var(--accent-primary, #89b4fa)' : 'var(--border-subtle, #313244)'}`,
                color: isRefetching ? 'var(--accent-primary, #89b4fa)' : 'var(--text-primary, #cdd6f4)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isRefetching ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Re-query OpenAlex, Europe PMC, Unpaywall & Crossref to fetch full structured text, tables, and fresh metadata"
            >
              <RefreshCw size={14} className={isRefetching ? 'spin-animation' : ''} />
              <span>{isRefetching ? 'Fetching...' : 'Re-fetch Article'}</span>
            </button>

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

          {/* Re-fetch Status Notification */}
          {refetchStatus && (
            <div
              style={{
                marginTop: '16px',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background:
                  refetchStatus.type === 'error'
                    ? 'rgba(243, 139, 168, 0.12)'
                    : refetchStatus.type === 'success'
                    ? 'rgba(166, 227, 161, 0.12)'
                    : 'rgba(137, 180, 250, 0.12)',
                border: `1px solid ${
                  refetchStatus.type === 'error'
                    ? 'rgba(243, 139, 168, 0.35)'
                    : refetchStatus.type === 'success'
                    ? 'rgba(166, 227, 161, 0.35)'
                    : 'rgba(137, 180, 250, 0.35)'
                }`,
                color:
                  refetchStatus.type === 'error'
                    ? '#f38ba8'
                    : refetchStatus.type === 'success'
                    ? '#a6e3a1'
                    : '#89b4fa',
                animation: 'fadeIn 0.2s ease',
              }}
            >
              {refetchStatus.type === 'info' && <Loader2 size={14} className="spin-animation" />}
              {refetchStatus.type === 'success' && <Check size={14} />}
              {refetchStatus.type === 'error' && <AlertCircle size={14} />}
              <span style={{ flex: 1 }}>{refetchStatus.message}</span>
              <button
                onClick={() => setRefetchStatus(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: '14px',
                  lineHeight: 1,
                  padding: '2px 4px',
                  opacity: 0.7,
                }}
              >
                ×
              </button>
            </div>
          )}
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
            <p style={{ fontSize: `${12 * fontSizeScale}px`, color: 'var(--text-muted, #6c7086)', margin: '0 0 14px 0', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto' }}>
              Only the abstract is available from open registries. Drag & drop the downloaded PDF here to enable the full PDF Viewer and visual chart extraction, or retry fetching from academic registries.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(166, 227, 161, 0.12)',
                  border: '1px solid rgba(166, 227, 161, 0.35)',
                  color: 'var(--accent-success, #a6e3a1)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Paperclip size={13} />
                <span>Attach Local PDF</span>
              </button>

              {paper.doi && (
                <button
                  onClick={handleRefetchArticle}
                  disabled={isRefetching}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--bg-primary, #1e1e2e)',
                    border: '1px solid var(--border-subtle, #313244)',
                    color: 'var(--text-primary, #cdd6f4)',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: isRefetching ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RefreshCw size={13} className={isRefetching ? 'spin-animation' : ''} />
                  <span>{isRefetching ? 'Querying Registries...' : 'Retry Fetch from Open Registries'}</span>
                </button>
              )}
            </div>
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
