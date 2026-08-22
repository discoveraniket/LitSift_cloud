import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Link,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { resolvePaperByDoi, findExistingPaperByDoi, DoiResolutionProgress } from '../../services/doiService';
import { usePdfStore } from '../../store/usePdfStore';
import { PaperDocumentInfo } from '../../types/paper';

interface ImportDoiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaperImported: (paper: PaperDocumentInfo) => void;
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

export const ImportDoiModal: React.FC<ImportDoiModalProps> = ({
  isOpen,
  onClose,
  onPaperImported,
}) => {
  const [doiInput, setDoiInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<DoiResolutionProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successPaper, setSuccessPaper] = useState<PaperDocumentInfo | null>(null);

  if (!isOpen) return null;

  const handleFetch = async (targetDoi?: string) => {
    const doiToFetch = targetDoi || doiInput;
    if (!doiToFetch.trim()) {
      setErrorMsg('Please enter a valid DOI (e.g. 10.1038/s41467-020-17849-0)');
      return;
    }

    // 1. Instant Local Workspace Cache Hit
    const existingPdfs = usePdfStore.getState().pdfs;
    const existing = findExistingPaperByDoi(doiToFetch, existingPdfs);
    if (existing) {
      usePdfStore.getState().setActivePdf(existing.id);
      setSuccessPaper(existing);
      setErrorMsg(null);
      setProgress({
        step: 'completed',
        message: '⚡ Paper is already in your workspace! Switching to viewer...',
        progressPercent: 100,
      });

      setTimeout(() => {
        onPaperImported(existing);
        handleClose();
      }, 700);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessPaper(null);
    setProgress({
      step: 'validating',
      message: 'Validating DOI syntax...',
      progressPercent: 10,
    });

    try {
      const resolvedPaper = await resolvePaperByDoi(doiToFetch, (p) => {
        setProgress(p);
      });

      // Save to usePdfStore & IndexedDB
      await usePdfStore.getState().addPaperDocument(resolvedPaper);
      setSuccessPaper(resolvedPaper);

      // Auto-transition to open paper after a brief confirmation
      setTimeout(() => {
        onPaperImported(resolvedPaper);
        handleClose();
      }, 1000);
    } catch (err: any) {
      console.error('DOI fetch failed:', err);
      setErrorMsg(err.message || 'Failed to fetch paper. Please check the DOI and try again.');
      setProgress(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setDoiInput('');
    setIsLoading(false);
    setProgress(null);
    setErrorMsg(null);
    setSuccessPaper(null);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 17, 27, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) handleClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'var(--bg-secondary, #181825)',
          border: '1px solid var(--border-subtle, #313244)',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, #313244)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-tertiary, #11111b)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(137, 180, 250, 0.15)',
                color: 'var(--accent-primary, #89b4fa)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Link size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)', margin: 0 }}>
                Import Paper by DOI
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted, #6c7086)', margin: 0 }}>
                Automatic Open Access resolution, full PDF download & structured abstract extraction
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #6c7086)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Input Box */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-secondary, #a6adc8)',
                marginBottom: '6px',
              }}
            >
              DOI or Paper URL
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={doiInput}
                onChange={(e) => setDoiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isLoading) handleFetch();
                }}
                disabled={isLoading}
                placeholder="e.g. 10.1038/s41467-020-17849-0 or https://doi.org/..."
                style={{
                  flex: 1,
                  background: 'var(--bg-primary, #1e1e2e)',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: 'var(--text-primary, #cdd6f4)',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
                autoFocus
              />
              <button
                onClick={() => handleFetch()}
                disabled={isLoading || !doiInput.trim()}
                style={{
                  background: 'var(--accent-primary, #89b4fa)',
                  color: '#11111b',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isLoading || !doiInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: isLoading || !doiInput.trim() ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'opacity 0.15s ease',
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Resolving...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    <span>Fetch Paper</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Example Chips */}
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #6c7086)', display: 'block', marginBottom: '6px' }}>
              💡 Quick Examples:
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {SAMPLE_DOIS.map((sample) => (
                <button
                  key={sample.doi}
                  onClick={() => {
                    setDoiInput(sample.doi);
                    handleFetch(sample.doi);
                  }}
                  disabled={isLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg-tertiary, #11111b)',
                    border: '1px solid var(--border-subtle, #313244)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '11px',
                    textAlign: 'left',
                    color: 'var(--text-secondary, #a6adc8)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
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

          {/* Real-time Progress Stepper */}
          {isLoading && progress && (
            <div
              style={{
                background: 'var(--bg-tertiary, #11111b)',
                border: '1px solid var(--border-subtle, #313244)',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--accent-primary, #89b4fa)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={13} className="animate-spin" /> {progress.message}
                </span>
                <span style={{ color: 'var(--text-muted, #6c7086)', fontFamily: 'monospace' }}>
                  {progress.progressPercent}%
                </span>
              </div>
              {/* Progress Bar */}
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress.progressPercent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #89b4fa, #a6e3a1)',
                    borderRadius: '3px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Success Notification */}
          {successPaper && (
            <div
              style={{
                background: 'rgba(166, 227, 161, 0.1)',
                border: '1px solid rgba(166, 227, 161, 0.3)',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#a6e3a1',
                fontSize: '12px',
              }}
            >
              <CheckCircle2 size={18} />
              <div>
                <strong>{successPaper.title}</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #a6adc8)' }}>
                  {successPaper.oaStatus !== 'closed'
                    ? `🟢 ${successPaper.oaStatus.toUpperCase()} Open Access Paper successfully loaded!`
                    : '🔒 Paywalled Paper: Abstract and Metadata successfully imported!'}
                </div>
              </div>
            </div>
          )}

          {/* Error Notification */}
          {errorMsg && (
            <div
              style={{
                background: 'rgba(243, 139, 168, 0.1)',
                border: '1px solid rgba(243, 139, 168, 0.3)',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                color: '#f38ba8',
                fontSize: '12px',
              }}
            >
              <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <strong>Resolution Error</strong>
                <div style={{ fontSize: '11px', marginTop: '2px', color: 'var(--text-secondary, #a6adc8)' }}>
                  {errorMsg}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle, #313244)',
            background: 'var(--bg-tertiary, #11111b)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          <button
            onClick={handleClose}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle, #313244)',
              color: 'var(--text-secondary, #a6adc8)',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
