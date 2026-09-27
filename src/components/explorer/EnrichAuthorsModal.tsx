import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Mail,
  UserCheck,
  Building,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  ArrowRight,
} from 'lucide-react';
import { useGridStore } from '../../store/useGridStore';
import { usePdfStore } from '../../store/usePdfStore';
import {
  enrichGridDatasetWithAuthors,
  extractDoiFromRow,
  EnrichmentProgress,
  EnrichmentResult,
} from '../../services/enrichmentService';

interface EnrichAuthorsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EnrichAuthorsModal: React.FC<EnrichAuthorsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const allRows = useGridStore((state) => state.rows);
  const rows = useMemo(() => allRows.filter((r) => !r.isDraftRow), [allRows]);
  const columns = useGridStore((state) => state.columns);
  const pdfs = usePdfStore((state) => state.pdfs);

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<EnrichmentProgress | null>(null);
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Identify detected DOIs in live dataset
  const detectedDois = useMemo(() => {
    const list: string[] = [];
    rows.forEach((r) => {
      const doi = extractDoiFromRow(r, columns, pdfs);
      if (doi && !list.includes(doi)) {
        list.push(doi);
      }
    });
    return list;
  }, [rows, columns, pdfs]);

  if (!isOpen) return null;

  const handleStartEnrichment = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const res = await enrichGridDatasetWithAuthors((p) => {
        setProgress(p);
      });

      if (!res.success) {
        setErrorMsg(res.message);
      } else {
        setResult(res);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred during author enrichment.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setProgress(null);
      setResult(null);
      setErrorMsg(null);
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: '560px',
          maxWidth: '92vw',
          backgroundColor: 'var(--bg-secondary, #181825)',
          border: '1px solid var(--border-subtle, #313244)',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          color: 'var(--text-primary, #cdd6f4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: 'rgba(249, 226, 175, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-warning, #f9e2af)',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
                Enrich Corresponding Authors
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #a6adc8)', margin: '2px 0 0' }}>
                OpenAlex & PubMed Central / Europe PMC Metadata Integration
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #a6adc8)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Dataset Status Summary Box */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface, #1e1e2e)',
            border: '1px solid var(--border-subtle, #313244)',
            borderRadius: '8px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
              <Database size={13} /> Active Workspace Dataset:
            </span>
            <span style={{ fontWeight: 600, color: 'var(--accent-primary, #89b4fa)' }}>
              {rows.length} {rows.length === 1 ? 'row' : 'rows'} ({columns.length} columns)
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Detected DOIs for Enrichment:</span>
            <span
              style={{
                fontWeight: 600,
                color: detectedDois.length > 0 ? 'var(--accent-success, #a6e3a1)' : 'var(--accent-danger, #f38ba8)',
              }}
            >
              {detectedDois.length} unique papers
            </span>
          </div>

          {detectedDois.length === 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: 'rgba(243, 139, 168, 0.12)',
                color: 'var(--accent-danger, #f38ba8)',
                fontSize: '11px',
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>
                No DOI column or valid DOIs (e.g. <code>10.xxxx/...</code>) found in your dataset rows. Please ensure your table has a DOI column.
              </span>
            </div>
          )}
        </div>

        {/* New Columns Preview */}
        <div style={{ fontSize: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary, #bac2de)' }}>
            Columns to be added or populated:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-surface, #1e1e2e)',
                border: '1px solid var(--border-subtle, #313244)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <UserCheck size={14} color="var(--accent-primary, #89b4fa)" />
              <div>
                <div style={{ fontWeight: 600 }}>Corresponding Author</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Full name of lead / contact PI</div>
              </div>
            </div>

            <div
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-surface, #1e1e2e)',
                border: '1px solid var(--border-subtle, #313244)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Mail size={14} color="var(--accent-success, #a6e3a1)" />
              <div>
                <div style={{ fontWeight: 600 }}>Author Email</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>PMC XML & correspondence email</div>
              </div>
            </div>

            <div
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-surface, #1e1e2e)',
                border: '1px solid var(--border-subtle, #313244)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Building size={14} color="var(--accent-warning, #f9e2af)" />
              <div>
                <div style={{ fontWeight: 600 }}>Author Institution</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Affiliation / University</div>
              </div>
            </div>

            <div
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-surface, #1e1e2e)',
                border: '1px solid var(--border-subtle, #313244)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Sparkles size={14} color="var(--accent-secondary, #cba6f7)" />
              <div>
                <div style={{ fontWeight: 600 }}>Author ORCID</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Permanent author ID</div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Progress Bar */}
        {isLoading && progress && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span>{progress.message}</span>
              <span>{progress.percent}%</span>
            </div>
            <div
              style={{
                height: '6px',
                backgroundColor: 'var(--bg-surface, #1e1e2e)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress.percent}%`,
                  backgroundColor: 'var(--accent-primary, #89b4fa)',
                  borderRadius: '3px',
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Success Message */}
        {result && (
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'rgba(166, 227, 161, 0.12)',
              border: '1px solid var(--accent-success, #a6e3a1)',
              borderRadius: '8px',
              color: 'var(--accent-success, #a6e3a1)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '12px',
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600 }}>{result.message}</div>
              <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>
                Your live data grid was updated in place. You can undo this at any time with Ctrl+Z.
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMsg && (
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: 'rgba(243, 139, 168, 0.12)',
              border: '1px solid var(--accent-danger, #f38ba8)',
              borderRadius: '8px',
              color: 'var(--accent-danger, #f38ba8)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
          <button
            onClick={handleClose}
            disabled={isLoading}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-tertiary, #313244)',
              color: 'var(--text-primary, #cdd6f4)',
              border: '1px solid var(--border-subtle, #45475a)',
              fontSize: '12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {result ? 'Done' : 'Cancel'}
          </button>

          {!result && (
            <button
              onClick={handleStartEnrichment}
              disabled={isLoading || detectedDois.length === 0}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                backgroundColor: 'var(--accent-primary, #89b4fa)',
                color: 'var(--bg-secondary, #181825)',
                border: 'none',
                fontWeight: 600,
                fontSize: '12px',
                cursor: isLoading || detectedDois.length === 0 ? 'not-allowed' : 'pointer',
                opacity: isLoading || detectedDois.length === 0 ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={13} className="spin" />
                  <span>Enriching Dataset...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Start Enrichment</span>
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
