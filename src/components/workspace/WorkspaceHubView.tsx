import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Upload,
  FileText,
  Table,
  MessageSquare,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileArchive,
  Database,
  Sparkles,
  Search,
  ArrowRight,
  ShieldCheck,
  FolderOpen,
} from 'lucide-react';
import { usePdfStore } from '../../store/usePdfStore';
import { useGridStore } from '../../store/useGridStore';
import { useAgentStore } from '../../store/useAgentStore';
import {
  exportWorkspaceBundle,
  inspectWorkspaceFile,
  restoreWorkspaceBundle,
  WorkspaceBundleSummary,
} from '../../services/workspaceService';
import { GuidedDemoView } from './GuidedDemoView';

interface WorkspaceHubViewProps {
  initialSection?: 'export' | 'import';
  pendingFile?: File | null;
  onNavigateToGrid?: () => void;
  onNavigateToPdf?: (pdfId: string) => void;
  onOpenPaperDiscovery?: () => void;
}

export const WorkspaceHubView: React.FC<WorkspaceHubViewProps> = ({
  pendingFile = null,
  onNavigateToGrid,
  onNavigateToPdf,
  onOpenPaperDiscovery,
}) => {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return `LitSift_Research_${today}`;
  });

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Import State
  const [dragOver, setDragOver] = useState(false);
  const [inspectSummary, setInspectSummary] = useState<WorkspaceBundleSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ status: string; percent: number }>({
    status: '',
    percent: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Current session metrics
  const pdfs = usePdfStore((state) => state.pdfs);
  const rows = useGridStore((state) => state.rows);
  const columns = useGridStore((state) => state.columns);
  const messages = useAgentStore((state) => state.messages);

  const validRows = rows.filter((r) => !r.isDraftRow);
  const hasActiveSessionData = pdfs.length > 0 || validRows.length > 0;

  // Handle pending file passed via drag-and-drop
  useEffect(() => {
    if (pendingFile) {
      handleFileSelection(pendingFile);
    }
  }, [pendingFile]);

  const handleFileSelection = async (file: File) => {
    setImportError(null);
    setInspectSummary(null);
    try {
      const summary = await inspectWorkspaceFile(file);
      setInspectSummary(summary);
    } catch (err: any) {
      setImportError(err.message || 'Failed to parse workspace file.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(null);
    try {
      const { filename } = await exportWorkspaceBundle(workspaceName);
      setExportSuccess(`Successfully packaged & downloaded "${filename}"`);
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!inspectSummary) return;
    setIsImporting(true);
    try {
      await restoreWorkspaceBundle(inspectSummary.bundle, (status, percent) => {
        setImportProgress({ status, percent });
      });
      setTimeout(() => {
        setIsImporting(false);
        setInspectSummary(null);
        if (onNavigateToGrid) onNavigateToGrid();
      }, 700);
    } catch (err: any) {
      setIsImporting(false);
      setImportError(err.message || 'Failed to restore workspace.');
    }
  };

  const handleSaveCurrentAndOpenNew = async () => {
    if (!inspectSummary) return;
    setIsImporting(true);
    setImportProgress({ status: 'Saving current workspace backup...', percent: 5 });

    try {
      // 1. Export current workspace first
      await exportWorkspaceBundle(`Backup_Before_Import_${new Date().toISOString().slice(0, 10)}`);

      // 2. Restore new bundle
      await restoreWorkspaceBundle(inspectSummary.bundle, (status, percent) => {
        setImportProgress({ status, percent });
      });

      setTimeout(() => {
        setIsImporting(false);
        setInspectSummary(null);
        if (onNavigateToGrid) onNavigateToGrid();
      }, 700);
    } catch (err: any) {
      setIsImporting(false);
      setImportError(`Operation failed: ${err.message}`);
    }
  };

  if (isDemoMode) {
    return (
      <div style={{ height: '100%', width: '100%', position: 'relative' }}>
        <button
          onClick={() => setIsDemoMode(false)}
          style={{
            position: 'absolute',
            top: '16px',
            left: '20px',
            zIndex: 10,
            background: 'var(--bg-secondary, #181825)',
            border: '1px solid var(--border-subtle, #313244)',
            color: 'var(--text-secondary, #a6adc8)',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          ← Back to Hub
        </button>
        <GuidedDemoView
          onPaperLoaded={(paperId) => {
            setIsDemoMode(false);
            onNavigateToPdf?.(paperId);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="workspace-hub-view"
      style={{
        height: '100%',
        overflowY: 'auto',
        background: 'var(--bg-primary, #1e1e2e)',
        color: 'var(--text-primary, #cdd6f4)',
        padding: '28px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: '860px',
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Hidden File Input for Import */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".litsift,.json"
          style={{ display: 'none' }}
        />

        {/* Header Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle, #313244)',
            paddingBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileArchive size={22} color="var(--accent-primary, #89b4fa)" />
              <h1
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  letterSpacing: '0.3px',
                  margin: 0,
                  color: 'var(--text-primary)',
                }}
              >
                Workspace Project Hub
              </h1>
              <span
                style={{
                  fontSize: '10px',
                  background: 'rgba(137, 180, 250, 0.15)',
                  color: 'var(--accent-primary)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 600,
                }}
              >
                .litsift Portable Bundle
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Save, share, and restore complete research synthesis states with embedded PDF binaries, data grids, and AI copilot discussions.
            </div>
          </div>

          {/* Quick Storage Status Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--bg-secondary, #181825)',
              border: '1px solid var(--border-subtle, #313244)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '11px',
            }}
          >
            <Database size={13} color="var(--accent-success, #a6e3a1)" />
            <span>Local Storage: <strong>IndexedDB Active</strong></span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ color: 'var(--accent-primary)' }}>{pdfs.length} Papers Open</span>
          </div>
        </div>

        {/* ================= HERO ONBOARDING PORTALS (When fresh session) ================= */}
        {pdfs.length === 0 && validRows.length === 0 && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(137, 180, 250, 0.08), rgba(203, 166, 247, 0.05))',
              border: '1px solid rgba(137, 180, 250, 0.25)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                ✨ Welcome to LitSift Cloud
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                A Human-in-the-Loop literature synthesis workbench. How would you like to get started?
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '14px',
              }}
            >
              {/* Card 1: Guided Demo */}
              <div
                onClick={() => setIsDemoMode(true)}
                style={{
                  background: 'var(--bg-secondary, #181825)',
                  border: '1px solid var(--accent-primary, #89b4fa)',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: '0 4px 16px rgba(137, 180, 250, 0.1)',
                  transition: 'transform 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-primary)', fontWeight: 700, fontSize: '13px' }}>
                    <Sparkles size={16} />
                    Try Guided Demo
                  </div>
                  <span style={{ fontSize: '9.5px', background: 'rgba(137, 180, 250, 0.2)', color: 'var(--accent-primary)', padding: '2px 6px', borderRadius: '8px', fontWeight: 600 }}>
                    Recommended
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Test drive the 3-step collaborative synthesis with a landmark open-access PMC study & pre-built schema.
                </div>
                <button
                  style={{
                    marginTop: 'auto',
                    background: 'var(--accent-primary, #89b4fa)',
                    color: '#11111b',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  Start Demo <ArrowRight size={12} />
                </button>
              </div>

              {/* Card 2: New Paper Discovery */}
              <div
                onClick={() => onOpenPaperDiscovery?.()}
                style={{
                  background: 'var(--bg-secondary, #181825)',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-success, #a6e3a1)', fontWeight: 700, fontSize: '13px' }}>
                  <Search size={16} />
                  Start New Synthesis
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Search literature across PubMed, arXiv & Europe PMC, or load custom DOIs into your workspace.
                </div>
                <button
                  style={{
                    marginTop: 'auto',
                    background: 'var(--bg-primary, #1e1e2e)',
                    border: '1px solid var(--border-subtle, #313244)',
                    color: 'var(--text-primary, #cdd6f4)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Discover Papers
                </button>
              </div>

              {/* Card 3: Open Bundle */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'var(--bg-secondary, #181825)',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-warning, #f9e2af)', fontWeight: 700, fontSize: '13px' }}>
                  <FolderOpen size={16} />
                  Open Project Bundle
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Restore an existing <code>.litsift</code> project file or JSON workspace state from your computer.
                </div>
                <button
                  style={{
                    marginTop: 'auto',
                    background: 'var(--bg-primary, #1e1e2e)',
                    border: '1px solid var(--border-subtle, #313244)',
                    color: 'var(--text-primary, #cdd6f4)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Browse File
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Vertical Stack Dashboard */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          {/* ================= CARD 1: IMPORT & RESTORE CENTER ================= */}
          <div
            style={{
              background: 'var(--bg-secondary, #181825)',
              border: '1px solid var(--border-subtle, #313244)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={18} color="var(--accent-primary)" />
                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Import & Restore Project</h2>
              </div>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Load .litsift bundle</span>
            </div>

            {/* Dropzone */}
            {!inspectSummary && !isImporting && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: dragOver ? '2px dashed var(--accent-primary)' : '2px dashed var(--border-subtle)',
                  background: dragOver ? 'rgba(137, 180, 250, 0.08)' : 'var(--bg-tertiary, #11111b)',
                  borderRadius: '10px',
                  padding: '40px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    background: 'rgba(137, 180, 250, 0.12)',
                    borderRadius: '50%',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Upload size={28} color="var(--accent-primary)" />
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Drag & Drop <code style={{ color: 'var(--accent-primary)' }}>.litsift</code> project file here
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  or click to browse your computer
                </div>
              </div>
            )}

            {/* Inspection Summary Card */}
            {inspectSummary && !isImporting && (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {inspectSummary.workspaceName}
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      Exported on {new Date(inspectSummary.exportedAt).toLocaleString()} • Version {inspectSummary.version}
                    </div>
                  </div>

                  <button
                    onClick={() => setInspectSummary(null)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '10.5px',
                      cursor: 'pointer',
                    }}
                  >
                    Change File
                  </button>
                </div>

                {/* Metric Pills */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      background: 'rgba(137, 180, 250, 0.12)',
                      color: 'var(--accent-primary)',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <FileText size={12} /> {inspectSummary.paperCount} PDF Papers
                  </span>

                  <span
                    style={{
                      background: 'rgba(166, 227, 161, 0.12)',
                      color: 'var(--accent-success)',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Table size={12} /> {inspectSummary.rowCount} Rows ({inspectSummary.columnCount} cols)
                  </span>

                  <span
                    style={{
                      background: 'rgba(249, 226, 175, 0.12)',
                      color: 'var(--accent-warning)',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <MessageSquare size={12} /> {inspectSummary.chatMessageCount} Messages
                  </span>

                  {inspectSummary.totalPdfSizeBytes > 0 && (
                    <span
                      style={{
                        background: 'rgba(203, 166, 247, 0.12)',
                        color: 'var(--accent-secondary)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <HardDrive size={12} /> {(inspectSummary.totalPdfSizeBytes / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  )}
                </div>

                {/* Papers list peek */}
                {inspectSummary.papers.length > 0 && (
                  <div
                    style={{
                      maxHeight: '90px',
                      overflowY: 'auto',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                    }}
                  >
                    {inspectSummary.papers.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          fontSize: '10.5px',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <FileText size={11} color="var(--accent-primary)" />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Safe Transition Decision Panel */}
                {hasActiveSessionData ? (
                  <div
                    style={{
                      background: 'rgba(249, 226, 175, 0.08)',
                      border: '1px solid rgba(249, 226, 175, 0.3)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-warning)', fontSize: '11.5px', fontWeight: 600 }}>
                      <AlertTriangle size={14} /> Active Workspace Open ({pdfs.length} papers, {validRows.length} rows)
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      To make sure you don't lose open progress, choose an option:
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                      {/* Option 1: Safe Save Current & Open New */}
                      <button
                        onClick={handleSaveCurrentAndOpenNew}
                        style={{
                          flex: 1,
                          background: 'var(--accent-primary)',
                          color: 'var(--bg-primary)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                        }}
                      >
                        <Download size={13} /> 💾 Save Current & Open New
                      </button>

                      {/* Option 2: Discard and open directly */}
                      <button
                        onClick={handleExecuteImport}
                        style={{
                          background: 'rgba(243, 139, 168, 0.15)',
                          border: '1px solid var(--accent-danger)',
                          color: 'var(--accent-danger)',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        🚀 Discard & Open
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Clean workspace immediate open */
                  <button
                    onClick={handleExecuteImport}
                    style={{
                      background: 'var(--accent-primary)',
                      color: 'var(--bg-primary)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Layers size={14} /> Restore Workspace Now
                  </button>
                )}
              </div>
            )}

            {/* In-Progress Loading Indicator */}
            {isImporting && (
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: '8px',
                  padding: '24px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)' }}>
                  {importProgress.status || 'Restoring Workspace...'}
                </div>

                <div
                  style={{
                    width: '100%',
                    height: '6px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${importProgress.percent}%`,
                      height: '100%',
                      background: 'var(--accent-primary)',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Error Box */}
            {importError && (
              <div
                style={{
                  background: 'rgba(243, 139, 168, 0.12)',
                  border: '1px solid var(--accent-danger)',
                  color: 'var(--accent-danger)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertTriangle size={14} />
                <span>{importError}</span>
              </div>
            )}
          </div>

          {/* ================= CARD 2: EXPORT STUDIO ================= */}
          <div
            style={{
              background: 'var(--bg-secondary, #181825)',
              border: '1px solid var(--border-subtle, #313244)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={18} color="var(--accent-primary)" />
                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Export Workspace Package</h2>
              </div>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Single-file bundle</span>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Workspace Project Name
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Enter workspace name..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary, #11111b)',
                  border: '1px solid var(--border-subtle, #313244)',
                  borderRadius: '8px',
                  color: 'var(--text-primary, #cdd6f4)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Bundle Contents Preview Breakdown */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Included in Export Bundle
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {/* Card 1: PDFs */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-secondary)' }}>
                    <FileText size={13} />
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>PDF Papers</span>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {pdfs.length}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Raw binary embedded
                  </div>
                </div>

                {/* Card 2: Extracted Rows */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-success)' }}>
                    <Table size={13} />
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>Table Rows</span>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {validRows.length} <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text-muted)' }}>({columns.length} cols)</span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Citations & bboxes
                  </div>
                </div>

                {/* Card 3: Chat Threads */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-warning)' }}>
                    <MessageSquare size={13} />
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>AI Chat Logs</span>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {messages.length}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Thoughts & tool logs
                  </div>
                </div>
              </div>
            </div>

            {/* List of Active Papers Peek */}
            {pdfs.length > 0 && (
              <div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Included Research Documents:
                </div>
                <div
                  style={{
                    maxHeight: '110px',
                    overflowY: 'auto',
                    background: 'var(--bg-tertiary, #11111b)',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                  }}
                >
                  {pdfs.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        fontSize: '10.5px',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '2px 0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <FileText size={11} color="var(--accent-secondary)" style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: 'rgba(255,255,255,0.05)',
                          color: p.status === 'Extracted' ? 'var(--accent-success)' : 'var(--text-muted)',
                        }}
                      >
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {exportSuccess && (
              <div
                style={{
                  background: 'rgba(166, 227, 161, 0.12)',
                  border: '1px solid var(--accent-success)',
                  color: 'var(--accent-success)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CheckCircle2 size={14} />
                <span>{exportSuccess}</span>
              </div>
            )}

            {/* Export Action Button */}
            <button
              onClick={handleExport}
              disabled={isExporting}
              style={{
                background: 'var(--accent-primary, #89b4fa)',
                color: 'var(--bg-primary, #1e1e2e)',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 20px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: isExporting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '4px',
                boxShadow: '0 2px 10px rgba(137, 180, 250, 0.3)',
              }}
            >
              <Download size={15} />
              {isExporting ? 'Packaging Workspace Bundle...' : '💾 Export & Download .litsift File'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
