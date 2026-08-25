import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Upload,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  ArrowRight,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { resolvePaperByDoi } from '../../services/doiService';
import { usePdfStore } from '../../store/usePdfStore';
import { SAMPLE_DOI, SAMPLE_PMC_PAPER } from '../../services/samplePaperService';
import { PaperDocumentInfo } from '../../types/paper';

interface GuidedDemoViewProps {
  onPaperLoaded: (paperId: string, paperTitle: string) => void;
}

interface LogStep {
  id: string;
  message: string;
  status: 'pending' | 'active' | 'done' | 'error';
  percent?: number;
}

export const GuidedDemoView: React.FC<GuidedDemoViewProps> = ({ onPaperLoaded }) => {
  const [doiInput, setDoiInput] = useState(SAMPLE_DOI);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [logSteps, setLogSteps] = useState<LogStep[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFetchPaper = async (targetDoi: string = doiInput) => {
    if (!targetDoi.trim() || isLoading) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const initialSteps: LogStep[] = [
      { id: '1', message: 'Resolving DOI & metadata via Europe PMC / OpenAlex...', status: 'active', percent: 25 },
      { id: '2', message: 'Checking open-access JATS XML full-text...', status: 'pending', percent: 50 },
      { id: '3', message: 'Parsing structured sections, tables & citations...', status: 'pending', percent: 75 },
      { id: '4', message: 'Caching document to local browser IndexedDB storage...', status: 'pending', percent: 100 },
    ];
    setLogSteps(initialSteps);

    try {
      let resolvedPaper: PaperDocumentInfo | null = null;

      // If user kept the default sample DOI, we can resolve live or fallback smoothly
      if (targetDoi.trim().toLowerCase() === SAMPLE_DOI.toLowerCase()) {
        try {
          resolvedPaper = await resolvePaperByDoi(SAMPLE_DOI, (progress) => {
            setLogSteps((prev) =>
              prev.map((step) => {
                if (progress.progressPercent >= (step.percent || 0)) {
                  return { ...step, status: 'done' };
                }
                if (step.status === 'pending') {
                  return { ...step, status: 'active' };
                }
                return step;
              })
            );
          });
        } catch (liveErr) {
          console.info('Live network fallback to preloaded sample:', liveErr);
        }

        if (!resolvedPaper || !resolvedPaper.sections?.length) {
          resolvedPaper = SAMPLE_PMC_PAPER;
        }
      } else {
        // User supplied their own custom DOI/PMCID
        resolvedPaper = await resolvePaperByDoi(targetDoi.trim(), (progress) => {
          setLogSteps((prev) =>
            prev.map((step) => {
              if (progress.progressPercent >= (step.percent || 0)) {
                return { ...step, status: 'done' };
              }
              if (step.status === 'pending') {
                return { ...step, status: 'active' };
              }
              return step;
            })
          );
        });
      }

      // Mark all logs as completed
      setLogSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));

      await usePdfStore.getState().addPdf(resolvedPaper);
      usePdfStore.getState().setActivePdf(resolvedPaper.id);

      setSuccessMsg(`✓ Loaded "${resolvedPaper.title || resolvedPaper.name}"`);

      setTimeout(() => {
        onPaperLoaded(resolvedPaper!.id, resolvedPaper!.name);
      }, 1200);
    } catch (err: any) {
      setLogSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' } : s))
      );
      setErrorMsg(err.message || 'Failed to fetch article. Please check the DOI or upload a PDF.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomPdfUpload = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Please select a valid .pdf document.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    setLogSteps([
      { id: '1', message: `Reading binary stream for "${file.name}"...`, status: 'active', percent: 50 },
      { id: '2', message: 'Saving PDF to local IndexedDB and initializing reader...', status: 'pending', percent: 100 },
    ]);

    try {
      const customPaper: PaperDocumentInfo = {
        id: `pdf-${Date.now()}`,
        name: file.name,
        title: file.name.replace(/\.pdf$/i, ''),
        file,
        url: URL.createObjectURL(file),
        oaStatus: 'gold',
        sourceType: 'pdf_upload',
        status: 'Ready',
        uploadedAt: Date.now(),
      };

      setLogSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));
      await usePdfStore.getState().addPdf(customPaper);
      usePdfStore.getState().setActivePdf(customPaper.id);

      setSuccessMsg(`✓ Successfully loaded "${file.name}"`);

      setTimeout(() => {
        onPaperLoaded(customPaper.id, customPaper.name);
      }, 900);
    } catch (err: any) {
      setErrorMsg(`Failed to load PDF: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #1e1e2e)',
        padding: '24px',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          maxWidth: '680px',
          width: '100%',
          background: 'var(--bg-secondary, #181825)',
          border: '1px solid var(--border-subtle, #313244)',
          borderRadius: '12px',
          padding: '28px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Step Indicator Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle, #313244)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(137, 180, 250, 0.2), rgba(203, 166, 247, 0.2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary, #89b4fa)',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              1
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary, #cdd6f4)' }}>
                Step 1: Load a Research Paper
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary, #a6adc8)' }}>
                Fetch the pre-filled landmark open-access study or load your own paper.
              </div>
            </div>
          </div>

          <span
            style={{
              fontSize: '11px',
              background: 'rgba(166, 227, 161, 0.15)',
              color: 'var(--accent-success, #a6e3a1)',
              padding: '3px 10px',
              borderRadius: '12px',
              fontWeight: 600,
            }}
          >
            Guided Co-Lab
          </span>
        </div>

        {/* Option A: Prefilled DOI Ingest Box */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #a6adc8)' }}>
            Article DOI / PubMed ID (Europe PMC Open Access):
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-primary, #1e1e2e)',
                border: '1px solid var(--border-subtle, #313244)',
                borderRadius: '6px',
                padding: '0 10px',
                gap: '8px',
              }}
            >
              <Search size={14} color="var(--text-muted, #6c7086)" />
              <input
                type="text"
                value={doiInput}
                disabled={isLoading}
                onChange={(e) => setDoiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetchPaper()}
                placeholder="e.g. 10.1016/S0140-6736(20)30183-5 or PMC7095448"
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary, #cdd6f4)',
                  fontSize: '13px',
                  padding: '10px 0',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <button
              onClick={() => handleFetchPaper()}
              disabled={isLoading || !doiInput.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--accent-primary, #89b4fa)',
                color: '#11111b',
                border: 'none',
                borderRadius: '6px',
                padding: '0 18px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="spin-animation" />
                  Fetching...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Fetch Article
                </>
              )}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #6c7086)' }}>
            ✨ Pre-loaded with <em>Huang et al. (The Lancet 2020)</em>. You can click <strong>Fetch Article</strong> immediately.
          </div>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted, #6c7086)', fontSize: '11px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle, #313244)' }} />
          <span>OR DROP YOUR OWN PDF</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle, #313244)' }} />
        </div>

        {/* Option B: Drag & Drop Custom PDF */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleCustomPdfUpload(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragOver ? 'var(--accent-primary, #89b4fa)' : 'var(--border-subtle, #313244)'}`,
            borderRadius: '8px',
            background: isDragOver ? 'rgba(137, 180, 250, 0.08)' : 'rgba(255, 255, 255, 0.02)',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCustomPdfUpload(file);
            }}
          />
          <Upload size={22} color={isDragOver ? 'var(--accent-primary, #89b4fa)' : 'var(--text-muted, #6c7086)'} />
          <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
            Drag & drop a local PDF here, or click to browse
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary, #a6adc8)' }}>
            PDF binaries are processed 100% locally in your browser storage.
          </div>
        </div>

        {/* Live Step Logs Display */}
        {logSteps.length > 0 && (
          <div
            style={{
              background: 'var(--bg-primary, #1e1e2e)',
              border: '1px solid var(--border-subtle, #313244)',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #a6adc8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Resolution Progress:
            </div>
            {logSteps.map((step) => (
              <div
                key={step.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11.5px',
                  color:
                    step.status === 'done'
                      ? 'var(--accent-success, #a6e3a1)'
                      : step.status === 'active'
                      ? 'var(--accent-primary, #89b4fa)'
                      : step.status === 'error'
                      ? 'var(--accent-danger, #f38ba8)'
                      : 'var(--text-muted, #6c7086)',
                }}
              >
                {step.status === 'done' ? (
                  <CheckCircle2 size={13} color="var(--accent-success, #a6e3a1)" />
                ) : step.status === 'active' ? (
                  <Loader2 size={13} className="spin-animation" color="var(--accent-primary, #89b4fa)" />
                ) : step.status === 'error' ? (
                  <AlertCircle size={13} color="var(--accent-danger, #f38ba8)" />
                ) : (
                  <div style={{ width: '13px', height: '13px', borderRadius: '50%', border: '1px solid var(--border-subtle, #313244)' }} />
                )}
                <span>{step.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error / Success Alerts */}
        {errorMsg && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(243, 139, 168, 0.12)',
              border: '1px solid var(--accent-danger, #f38ba8)',
              color: 'var(--accent-danger, #f38ba8)',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          >
            <AlertCircle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(166, 227, 161, 0.15)',
              border: '1px solid var(--accent-success, #a6e3a1)',
              color: 'var(--accent-success, #a6e3a1)',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={15} />
            <span>{successMsg} — Opening in Workspace Reader...</span>
          </div>
        )}
      </div>
    </div>
  );
};
