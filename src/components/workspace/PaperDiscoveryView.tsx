import React, { useState } from 'react';
import {
  Search,
  Link,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { resolvePaperByDoi, reconstructAbstract } from '../../services/doiService';
import { usePdfStore } from '../../store/usePdfStore';
import { PaperDocumentInfo, OpenAccessStatus } from '../../types/paper';

interface PaperDiscoveryViewProps {
  onNavigateToPdf?: (pdfId: string) => void;
}

interface SearchResultItem {
  id: string;
  doi: string;
  title: string;
  authors: string[];
  journal: string;
  year?: number;
  citationCount?: number;
  isOa: boolean;
  oaStatus: OpenAccessStatus;
  abstractSnippet: string;
  pdfUrl?: string;
  landingPageUrl?: string;
}

const SAMPLE_DOIS = [
  {
    label: 'Nature Communications (Open Access)',
    doi: '10.1038/s41467-020-17849-0',
    tag: 'Gold OA + Full PDF',
  },
  {
    label: 'PLOS ONE (Open Access + Tables)',
    doi: '10.1371/journal.pone.0281234',
    tag: 'Gold OA + PMC Tables',
  },
  {
    label: 'Science (Paywalled / Abstract)',
    doi: '10.1126/science.abf8454',
    tag: 'Abstract & Metadata',
  },
];

export const PaperDiscoveryView: React.FC<PaperDiscoveryViewProps> = ({ onNavigateToPdf }) => {
  const [activeTab, setActiveTab] = useState<'doi_ingest' | 'search'>('doi_ingest');

  // Single DOI State
  const [singleDoiInput, setSingleDoiInput] = useState('');
  const [isResolvingSingle, setIsResolvingSingle] = useState(false);
  const [singleProgressMessage, setSingleProgressMessage] = useState('');
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleSuccessPaper, setSingleSuccessPaper] = useState<PaperDocumentInfo | null>(null);

  // Batch DOI State
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchDoiText, setBatchDoiText] = useState('');
  const [isResolvingBatch, setIsResolvingBatch] = useState(false);
  const [batchResults, setBatchResults] = useState<Array<{ doi: string; status: 'pending' | 'resolving' | 'done' | 'error'; title?: string; error?: string }>>([]);

  // Search Engine State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [oaFilterOnly, setOaFilterOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'citations' | 'year'>('relevance');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [importingDoiMap, setImportingDoiMap] = useState<Record<string, boolean>>({});

  const { pdfs, addPaperDocument } = usePdfStore();

  // 1. Handle Single DOI Resolution
  const handleResolveSingleDoi = async (targetDoi?: string) => {
    const doiToFetch = (targetDoi || singleDoiInput).trim();
    if (!doiToFetch) {
      setSingleError('Please enter a DOI or paper link (e.g. 10.1038/s41467-020-17849-0)');
      return;
    }

    setIsResolvingSingle(true);
    setSingleError(null);
    setSingleSuccessPaper(null);

    try {
      const paper = await resolvePaperByDoi(doiToFetch, (p) => {
        setSingleProgressMessage(p.message);
      });

      await addPaperDocument(paper);
      setSingleSuccessPaper(paper);

      // Transition to paper viewer
      if (onNavigateToPdf) {
        setTimeout(() => onNavigateToPdf(paper.id), 800);
      }
    } catch (err: any) {
      setSingleError(err.message || 'Failed to resolve DOI.');
    } finally {
      setIsResolvingSingle(false);
    }
  };

  // 2. Handle Batch DOI Resolution
  const handleResolveBatchDois = async () => {
    const rawLines = batchDoiText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (rawLines.length === 0) {
      alert('Please enter at least one DOI.');
      return;
    }

    const queue = rawLines.map((doi) => ({ doi, status: 'pending' as const }));
    setBatchResults(queue);
    setIsResolvingBatch(true);

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setBatchResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'resolving' } : r))
      );

      try {
        const paper = await resolvePaperByDoi(item.doi);
        await addPaperDocument(paper);
        setBatchResults((prev) =>
          prev.map((r, idx) => (idx === i ? { ...r, status: 'done', title: paper.title } : r))
        );
      } catch (err: any) {
        setBatchResults((prev) =>
          prev.map((r, idx) => (idx === i ? { ...r, status: 'error', error: err.message } : r))
        );
      }
    }

    setIsResolvingBatch(false);
  };

  // 3. Handle Academic Literature Search (OpenAlex)
  const handleSearchPapers = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      let sortParam = '';
      if (sortBy === 'citations') sortParam = '&sort=cited_by_count:desc';
      else if (sortBy === 'year') sortParam = '&sort=publication_year:desc';

      const openAlexSearchUrl = `https://api.openalex.org/works?search=${encodeURIComponent(searchQuery)}&per_page=20${sortParam}&mailto=user@litsift.app`;
      const res = await fetch(openAlexSearchUrl);
      if (!res.ok) throw new Error(`Search request failed (Status ${res.status})`);

      const data = await res.json();
      const results: SearchResultItem[] = (data.results || []).map((w: any) => {
        const isOa = w.open_access?.is_oa || false;
        let oaStatus: OpenAccessStatus = 'closed';
        if (isOa) {
          const rawOa = (w.open_access?.oa_status || '').toLowerCase();
          if (rawOa.includes('gold')) oaStatus = 'gold';
          else if (rawOa.includes('green')) oaStatus = 'green';
          else if (rawOa.includes('hybrid')) oaStatus = 'hybrid';
          else if (rawOa.includes('bronze')) oaStatus = 'bronze';
          else oaStatus = 'gold';
        }

        const rawAbstract = reconstructAbstract(w.abstract_inverted_index);
        const authors = (w.authorships || []).map((a: any) => a.author?.display_name || 'Unknown');

        return {
          id: w.id,
          doi: w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, '') : '',
          title: (w.title || 'Untitled Work').replace(/<\/?[^>]+(>|$)/g, ''),
          authors,
          journal: w.primary_location?.source?.display_name || w.host_venue?.display_name || 'Academic Venue',
          year: w.publication_year,
          citationCount: w.cited_by_count,
          isOa,
          oaStatus,
          abstractSnippet: rawAbstract ? (rawAbstract.length > 240 ? `${rawAbstract.slice(0, 240)}...` : rawAbstract) : 'Abstract not indexed.',
          pdfUrl: w.open_access?.oa_url || undefined,
          landingPageUrl: w.doi || undefined,
        };
      });

      // Apply OA filter if active
      const filtered = oaFilterOnly ? results.filter((r) => r.isOa) : results;
      setSearchResults(filtered);
    } catch (err: any) {
      setSearchError(err.message || 'Error conducting literature search.');
    } finally {
      setIsSearching(false);
    }
  };

  // 4. Import Search Result directly into Workspace
  const handleImportSearchResult = async (item: SearchResultItem) => {
    if (!item.doi) {
      alert('Paper does not have a valid DOI for resolution.');
      return;
    }

    setImportingDoiMap((prev) => ({ ...prev, [item.doi]: true }));

    try {
      const paper = await resolvePaperByDoi(item.doi);
      await addPaperDocument(paper);
      if (onNavigateToPdf) onNavigateToPdf(paper.id);
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImportingDoiMap((prev) => ({ ...prev, [item.doi]: false }));
    }
  };

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        background: 'var(--bg-primary, #1e1e2e)',
        color: 'var(--text-primary, #cdd6f4)',
        padding: '32px 40px',
      }}
    >
      <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Page Hero Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle, #313244)',
            paddingBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(137, 180, 250, 0.25), rgba(180, 190, 254, 0.15))',
                border: '1px solid rgba(137, 180, 250, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary, #89b4fa)',
              }}
            >
              <Search size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary, #cdd6f4)' }}>
                Paper Discovery & Ingestion Hub
              </h1>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #6c7086)', margin: 0 }}>
                Query scientific registries, fetch Open Access PDFs & extract structured article sections into your LitSift workspace.
              </p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-secondary, #181825)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle, #313244)',
            }}
          >
            <button
              onClick={() => setActiveTab('doi_ingest')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'doi_ingest' ? 'rgba(137, 180, 250, 0.2)' : 'transparent',
                color: activeTab === 'doi_ingest' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Link size={14} />
              <span>DOI Ingestion</span>
            </button>

            <button
              onClick={() => setActiveTab('search')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'search' ? 'rgba(137, 180, 250, 0.2)' : 'transparent',
                color: activeTab === 'search' ? 'var(--accent-primary, #89b4fa)' : 'var(--text-secondary, #a6adc8)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Search size={14} />
              <span>Search Literature</span>
            </button>
          </div>
        </header>

        {/* TAB 1: DOI INGESTION (SINGLE & BATCH) */}
        {activeTab === 'doi_ingest' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Mode Selector */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={() => setIsBatchMode(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${!isBatchMode ? 'var(--accent-primary, #89b4fa)' : 'var(--border-subtle, #313244)'}`,
                  background: !isBatchMode ? 'rgba(137, 180, 250, 0.12)' : 'var(--bg-secondary, #181825)',
                  color: !isBatchMode ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Single DOI Resolution
              </button>

              <button
                onClick={() => setIsBatchMode(true)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${isBatchMode ? 'var(--accent-primary, #89b4fa)' : 'var(--border-subtle, #313244)'}`,
                  background: isBatchMode ? 'rgba(137, 180, 250, 0.12)' : 'var(--bg-secondary, #181825)',
                  color: isBatchMode ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Batch DOI Ingestion
              </button>
            </div>

            {/* Sub-mode: Single DOI */}
            {!isBatchMode ? (
              <div
                style={{
                  background: 'var(--bg-secondary, #181825)',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '12px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Enter Scientific DOI or Paper URL
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="e.g. 10.1038/s41467-020-17849-0 or https://doi.org/10.1371/journal.pone.0281234"
                      value={singleDoiInput}
                      onChange={(e) => setSingleDoiInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isResolvingSingle) handleResolveSingleDoi();
                      }}
                      disabled={isResolvingSingle}
                      style={{
                        flex: 1,
                        background: 'var(--bg-primary, #1e1e2e)',
                        border: '1px solid var(--border-subtle, #313244)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        color: 'var(--text-primary, #cdd6f4)',
                        fontSize: '13.5px',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />

                    <button
                      onClick={() => handleResolveSingleDoi()}
                      disabled={isResolvingSingle || !singleDoiInput.trim()}
                      style={{
                        background: 'var(--accent-primary, #89b4fa)',
                        color: '#11111b',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0 20px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: isResolvingSingle || !singleDoiInput.trim() ? 'not-allowed' : 'pointer',
                        opacity: isResolvingSingle || !singleDoiInput.trim() ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {isResolvingSingle ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Resolving...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          <span>Fetch Paper ⚡</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Quick Sample DOIs */}
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted, #6c7086)', display: 'block', marginBottom: '8px' }}>
                    💡 Instant Test DOIs:
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px' }}>
                    {SAMPLE_DOIS.map((sample) => (
                      <button
                        key={sample.doi}
                        onClick={() => {
                          setSingleDoiInput(sample.doi);
                          handleResolveSingleDoi(sample.doi);
                        }}
                        disabled={isResolvingSingle}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--bg-tertiary, #11111b)',
                          border: '1px solid var(--border-subtle, #313244)',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          fontSize: '12px',
                          color: 'var(--text-secondary, #a6adc8)',
                          cursor: isResolvingSingle ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-primary, #89b4fa)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle, #313244)';
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{sample.label}</span>
                        <span
                          style={{
                            background: 'rgba(137, 180, 250, 0.12)',
                            color: 'var(--accent-primary, #89b4fa)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontFamily: 'monospace',
                          }}
                        >
                          {sample.tag}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Progress / Status feedback */}
                {isResolvingSingle && (
                  <div
                    style={{
                      background: 'var(--bg-tertiary, #11111b)',
                      border: '1px solid var(--border-subtle, #313244)',
                      borderRadius: '8px',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      color: 'var(--accent-primary, #89b4fa)',
                      fontSize: '12px',
                    }}
                  >
                    <Loader2 size={16} className="animate-spin" />
                    <span>{singleProgressMessage || 'Connecting to OpenAlex & Unpaywall APIs...'}</span>
                  </div>
                )}

                {singleSuccessPaper && (
                  <div
                    style={{
                      background: 'rgba(166, 227, 161, 0.1)',
                      border: '1px solid rgba(166, 227, 161, 0.3)',
                      borderRadius: '8px',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      color: '#a6e3a1',
                      fontSize: '13px',
                    }}
                  >
                    <CheckCircle2 size={20} />
                    <div style={{ flex: 1 }}>
                      <strong>{singleSuccessPaper.title}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary, #a6adc8)', marginTop: '2px' }}>
                        {singleSuccessPaper.oaStatus !== 'closed'
                          ? `🟢 Open Access PDF downloaded and organized in workspace.`
                          : `🔒 Paywalled paper: Structured abstract & metadata successfully imported.`}
                      </div>
                    </div>
                  </div>
                )}

                {singleError && (
                  <div
                    style={{
                      background: 'rgba(243, 139, 168, 0.1)',
                      border: '1px solid rgba(243, 139, 168, 0.3)',
                      borderRadius: '8px',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      color: '#f38ba8',
                      fontSize: '12px',
                    }}
                  >
                    <AlertCircle size={18} />
                    <div>{singleError}</div>
                  </div>
                )}
              </div>
            ) : (
              /* Sub-mode: Batch DOI */
              <div
                style={{
                  background: 'var(--bg-secondary, #181825)',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '12px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Paste Multiple DOIs (One per line or comma-separated)
                  </label>
                  <textarea
                    rows={6}
                    placeholder={`10.1038/s41467-020-17849-0\n10.1371/journal.pone.0281234\n10.1126/science.abf8454`}
                    value={batchDoiText}
                    onChange={(e) => setBatchDoiText(e.target.value)}
                    disabled={isResolvingBatch}
                    style={{
                      width: '100%',
                      background: 'var(--bg-primary, #1e1e2e)',
                      border: '1px solid var(--border-subtle, #313244)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      color: 'var(--text-primary, #cdd6f4)',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {batchDoiText.split(/[\n,;]+/).filter((s) => s.trim()).length} DOIs identified
                  </span>

                  <button
                    onClick={handleResolveBatchDois}
                    disabled={isResolvingBatch || !batchDoiText.trim()}
                    style={{
                      background: 'var(--accent-primary, #89b4fa)',
                      color: '#11111b',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 24px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: isResolvingBatch || !batchDoiText.trim() ? 'not-allowed' : 'pointer',
                      opacity: isResolvingBatch || !batchDoiText.trim() ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {isResolvingBatch ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Resolving Batch Queue...</span>
                      </>
                    ) : (
                      <>
                        <Layers size={16} />
                        <span>Resolve All DOIs ⚡</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Batch Progress Table */}
                {batchResults.length > 0 && (
                  <div
                    style={{
                      border: '1px solid var(--border-subtle, #313244)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      marginTop: '8px',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-tertiary, #11111b)', borderBottom: '1px solid var(--border-subtle, #313244)' }}>
                          <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>Status</th>
                          <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>DOI</th>
                          <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>Paper Title / Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchResults.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                            <td style={{ padding: '8px 12px' }}>
                              {item.status === 'resolving' && <Loader2 size={14} className="animate-spin" color="#89b4fa" />}
                              {item.status === 'done' && <CheckCircle2 size={14} color="#a6e3a1" />}
                              {item.status === 'error' && <AlertCircle size={14} color="#f38ba8" />}
                              {item.status === 'pending' && <span style={{ color: 'var(--text-muted)' }}>⏳ Queued</span>}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{item.doi}</td>
                            <td style={{ padding: '8px 12px', color: item.error ? '#f38ba8' : 'var(--text-primary)' }}>
                              {item.title || item.error || (item.status === 'resolving' ? 'Fetching metadata & PDF...' : '—')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ACADEMIC SEARCH ENGINE */}
        {activeTab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Search Input Bar */}
            <div
              style={{
                background: 'var(--bg-secondary, #181825)',
                border: '1px solid var(--border-subtle, #313244)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Search keywords, topics, authors, or titles (e.g. phage burst size S. aureus, CRISPR Cas9 specificity)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isSearching) handleSearchPapers();
                  }}
                  style={{
                    flex: 1,
                    background: 'var(--bg-primary, #1e1e2e)',
                    border: '1px solid var(--border-subtle, #313244)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: 'var(--text-primary, #cdd6f4)',
                    fontSize: '13.5px',
                    outline: 'none',
                  }}
                  autoFocus
                />

                <button
                  onClick={handleSearchPapers}
                  disabled={isSearching || !searchQuery.trim()}
                  style={{
                    background: 'var(--accent-primary, #89b4fa)',
                    color: '#11111b',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0 24px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isSearching || !searchQuery.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {isSearching ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      <span>Search Literature</span>
                    </>
                  )}
                </button>
              </div>

              {/* Filters Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={oaFilterOnly}
                    onChange={(e) => setOaFilterOnly(e.target.checked)}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  <span>🟢 Open Access Only (PDFs guaranteed downloadable)</span>
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e: any) => setSortBy(e.target.value)}
                    style={{
                      background: 'var(--bg-tertiary, #11111b)',
                      border: '1px solid var(--border-subtle, #313244)',
                      color: 'var(--text-primary)',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  >
                    <option value="relevance">Relevance</option>
                    <option value="citations">Most Cited First</option>
                    <option value="year">Newest First</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Search Results List */}
            {searchResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Found {searchResults.length} Research Papers
                </div>

                {searchResults.map((item) => {
                  const isAlreadyImported = pdfs.some((p) => p.doi === item.doi || p.name === item.title);
                  const isImporting = item.doi ? Boolean(importingDoiMap[item.doi]) : false;

                  return (
                    <div
                      key={item.id}
                      style={{
                        background: 'var(--bg-secondary, #181825)',
                        border: '1px solid var(--border-subtle, #313244)',
                        borderRadius: '10px',
                        padding: '16px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        transition: 'border-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(137, 180, 250, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle, #313244)';
                      }}
                    >
                      {/* Top Badges */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {item.isOa ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(166, 227, 161, 0.15)',
                                color: '#a6e3a1',
                                border: '1px solid rgba(166, 227, 161, 0.3)',
                                padding: '2px 6px',
                                borderRadius: '8px',
                                fontSize: '10px',
                                fontWeight: 700,
                              }}
                            >
                              <ShieldCheck size={11} /> {item.oaStatus.toUpperCase()} OPEN ACCESS
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
                                padding: '2px 6px',
                                borderRadius: '8px',
                                fontSize: '10px',
                                fontWeight: 700,
                              }}
                            >
                              <ShieldAlert size={11} /> ABSTRACT ONLY
                            </span>
                          )}

                          {item.citationCount !== undefined && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Cited by {item.citationCount}
                            </span>
                          )}
                        </div>

                        {item.doi && (
                          <a
                            href={`https://doi.org/${item.doi}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '11px',
                              color: 'var(--accent-primary, #89b4fa)',
                              fontFamily: 'monospace',
                              textDecoration: 'none',
                            }}
                          >
                            DOI: {item.doi} <ArrowUpRight size={10} />
                          </a>
                        )}
                      </div>

                      {/* Title */}
                      <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary, #cdd6f4)', lineHeight: 1.4 }}>
                        {item.title}
                      </h3>

                      {/* Authors & Journal */}
                      <div style={{ fontSize: '12px', color: 'var(--text-muted, #6c7086)' }}>
                        <span>{item.authors.slice(0, 4).join(', ')}{item.authors.length > 4 ? ' et al.' : ''}</span>
                        <span> • <strong>{item.journal}</strong></span>
                        {item.year && <span> ({item.year})</span>}
                      </div>

                      {/* Abstract Snippet */}
                      <p style={{ fontSize: '12.5px', color: 'var(--text-secondary, #a6adc8)', margin: 0, lineHeight: 1.5 }}>
                        {item.abstractSnippet}
                      </p>

                      {/* Bottom Action */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                        {isAlreadyImported ? (
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              color: '#a6e3a1',
                              fontWeight: 600,
                            }}
                          >
                            <CheckCircle2 size={14} /> Already in Workspace
                          </span>
                        ) : (
                          <button
                            onClick={() => handleImportSearchResult(item)}
                            disabled={isImporting}
                            style={{
                              background: 'rgba(137, 180, 250, 0.15)',
                              border: '1px solid rgba(137, 180, 250, 0.35)',
                              color: 'var(--accent-primary, #89b4fa)',
                              borderRadius: '6px',
                              padding: '6px 14px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: isImporting ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background = 'rgba(137, 180, 250, 0.25)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = 'rgba(137, 180, 250, 0.15)';
                            }}
                          >
                            {isImporting ? (
                              <>
                                <Loader2 size={13} className="animate-spin" />
                                <span>Importing...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles size={13} />
                                <span>Import to Workspace ⚡</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {searchError && (
              <div
                style={{
                  background: 'rgba(243, 139, 168, 0.1)',
                  border: '1px solid rgba(243, 139, 168, 0.3)',
                  borderRadius: '8px',
                  padding: '14px',
                  color: '#f38ba8',
                  fontSize: '12px',
                }}
              >
                {searchError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
