import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useGridStore } from '../../store/useGridStore';
import { highlightSnippetInContainer, clearActiveHighlights } from '../../services/highlightUtils';

// Set pdfjs worker source using CDN fallback for browser runtime compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface PdfReaderRef {
  search: (query: string) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  clearSearch: () => void;
}

interface PdfReaderProps {
  pdfUrl: string;
  zoomScale: number;
  onMatchCountChange?: (current: number, total: number) => void;
}

export const PdfReader = forwardRef<PdfReaderRef, PdfReaderProps>(({ pdfUrl, zoomScale, onMatchCountChange }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const activeEvidence = useGridStore((state) => state.activeEvidence);

  // Search matches tracking state
  const searchMatchesRef = useRef<HTMLElement[]>([]);
  const currentMatchIndexRef = useRef<number>(-1);

  // Auto-scroll to activeEvidence page and highlight exact sentence snippet
  useEffect(() => {
    if (!containerRef.current) return;

    clearActiveHighlights(containerRef.current);

    if (!activeEvidence) return;

    const pageWrapper = containerRef.current.querySelector<HTMLElement>(
      `[data-page-number="${activeEvidence.pageNumber}"]`
    );

    if (pageWrapper) {
      if (activeEvidence.snippetText && activeEvidence.snippetText.trim()) {
        const matchedEl = highlightSnippetInContainer(pageWrapper, activeEvidence.snippetText);
        if (matchedEl) {
          matchedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
      pageWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeEvidence]);

  // Render text layers with selectable and searchable spans
  const renderTextLayerForPage = async (page: any, viewport: any, pageWrapper: HTMLElement) => {
    try {
      const textContent = await page.getTextContent();
      
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'pdf-text-layer';
      textLayerDiv.style.position = 'absolute';
      textLayerDiv.style.top = '0';
      textLayerDiv.style.left = '0';
      textLayerDiv.style.height = `${viewport.height}px`;
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.overflow = 'hidden';
      textLayerDiv.style.lineHeight = '1.0';
      textLayerDiv.style.pointerEvents = 'auto';
      textLayerDiv.style.userSelect = 'text';

      for (const item of textContent.items) {
        if (!item.str || item.str.trim().length === 0) continue;

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);

        const textSpan = document.createElement('span');
        textSpan.textContent = item.str;
        textSpan.className = 'pdf-text-item';
        textSpan.style.position = 'absolute';
        textSpan.style.left = `${tx[4]}px`;
        textSpan.style.top = `${tx[5] - fontHeight}px`;
        textSpan.style.fontSize = `${fontHeight}px`;
        textSpan.style.fontFamily = item.fontName || 'sans-serif';
        textSpan.style.color = 'transparent';
        textSpan.style.transformOrigin = '0% 0%';
        textSpan.style.whiteSpace = 'pre';
        textSpan.style.cursor = 'text';

        textLayerDiv.appendChild(textSpan);
      }

      pageWrapper.appendChild(textLayerDiv);
    } catch (err) {
      console.warn('Text layer rendering note:', err);
    }
  };

  // Perform search highlighting across text spans
  const performSearch = (query: string) => {
    clearSearch();
    if (!query || !query.trim() || !containerRef.current) {
      onMatchCountChange?.(0, 0);
      return;
    }

    const lowerQuery = query.toLowerCase().trim();
    const textItems = containerRef.current.querySelectorAll('.pdf-text-item');
    const matchedSpans: HTMLElement[] = [];

    textItems.forEach((el) => {
      const text = el.textContent || '';
      if (text.toLowerCase().includes(lowerQuery)) {
        (el as HTMLElement).style.background = 'rgba(249, 226, 175, 0.65)';
        (el as HTMLElement).style.color = '#11111b';
        (el as HTMLElement).style.borderRadius = '2px';
        (el as HTMLElement).style.boxShadow = '0 0 4px rgba(249, 226, 175, 0.9)';
        matchedSpans.push(el as HTMLElement);
      }
    });

    searchMatchesRef.current = matchedSpans;
    if (matchedSpans.length > 0) {
      currentMatchIndexRef.current = 0;
      focusMatch(0);
      onMatchCountChange?.(1, matchedSpans.length);
    } else {
      currentMatchIndexRef.current = -1;
      onMatchCountChange?.(0, 0);
    }
  };

  const focusMatch = (index: number) => {
    const matches = searchMatchesRef.current;
    if (index < 0 || index >= matches.length) return;

    // Reset previous active match styling
    matches.forEach((m, idx) => {
      if (idx === index) {
        m.style.background = 'rgba(137, 180, 250, 0.9)';
        m.style.color = '#11111b';
        m.style.boxShadow = '0 0 8px rgba(137, 180, 250, 1)';
        m.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        m.style.background = 'rgba(249, 226, 175, 0.65)';
        m.style.color = '#11111b';
        m.style.boxShadow = '0 0 4px rgba(249, 226, 175, 0.9)';
      }
    });
  };

  const nextMatch = () => {
    const matches = searchMatchesRef.current;
    if (matches.length === 0) return;
    const nextIdx = (currentMatchIndexRef.current + 1) % matches.length;
    currentMatchIndexRef.current = nextIdx;
    focusMatch(nextIdx);
    onMatchCountChange?.(nextIdx + 1, matches.length);
  };

  const prevMatch = () => {
    const matches = searchMatchesRef.current;
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIndexRef.current - 1 + matches.length) % matches.length;
    currentMatchIndexRef.current = prevIdx;
    focusMatch(prevIdx);
    onMatchCountChange?.(prevIdx + 1, matches.length);
  };

  const clearSearch = () => {
    searchMatchesRef.current.forEach((el) => {
      el.style.background = 'transparent';
      el.style.color = 'transparent';
      el.style.boxShadow = 'none';
    });
    searchMatchesRef.current = [];
    currentMatchIndexRef.current = -1;
    onMatchCountChange?.(0, 0);
  };

  useImperativeHandle(ref, () => ({
    search: performSearch,
    nextMatch,
    prevMatch,
    clearSearch,
  }));

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadPdf = async () => {
      if (typeof window !== 'undefined' && navigator.userAgent.includes('jsdom')) {
        if (!isMounted) return;
        setNumPages(1);
        setLoading(false);
        return;
      }

      if (!pdfUrl) {
        setLoading(false);
        return;
      }

      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;

        if (!isMounted) return;
        setNumPages(pdf.numPages);

        if (containerRef.current) {
          containerRef.current.innerHTML = ''; // Clear previous renders

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            if (!isMounted) return;

            const viewport = page.getViewport({ scale: zoomScale });

            // Create wrapper container for page
            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'pdf-page-wrapper';
            pageWrapper.setAttribute('data-page-number', String(pageNum));
            pageWrapper.style.position = 'relative';
            pageWrapper.style.marginBottom = '16px';
            pageWrapper.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
            pageWrapper.style.borderRadius = '4px';
            pageWrapper.style.overflow = 'hidden';

            // Create HTML5 Canvas element
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            pageWrapper.appendChild(canvas);

            // Render selectable / searchable text layer
            await renderTextLayerForPage(page, viewport, pageWrapper);

            if (containerRef.current) {
              containerRef.current.appendChild(pageWrapper);
            }

            if (context) {
              await page.render({
                canvasContext: context,
                viewport: viewport,
              }).promise;
            }
          }
        }

        setLoading(false);
      } catch (err: any) {
        if (isMounted) {
          console.error('Error loading PDF:', err);
          setError(`Failed to render PDF: ${err.message || 'Unknown error'}`);
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [pdfUrl, zoomScale]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px',
        position: 'relative',
      }}
    >
      {loading && (
        <div style={{ color: 'var(--accent-primary)', marginTop: '40px', fontSize: '13px', fontWeight: 600 }}>
          ⚡ Rendering PDF Document ({pdfUrl})...
        </div>
      )}

      {error && (
        <div style={{ color: '#f38ba8', marginTop: '40px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && numPages > 0 && (
        <div
          style={{
            position: 'sticky',
            top: '8px',
            zIndex: 10,
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '2px 10px',
            fontSize: '10px',
            fontWeight: 600,
            marginBottom: '8px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          }}
        >
          📄 Document Pages: {numPages}
        </div>
      )}

      <div ref={containerRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }} />
    </div>
  );
});
