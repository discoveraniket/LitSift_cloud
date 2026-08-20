import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Download,
  Upload,
  FileText,
  Table,
  MessageSquare,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  FileArchive,
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

interface WorkspaceModalProps {
  isOpen: boolean;
  initialTab?: 'export' | 'import';
  pendingFile?: File | null;
  onClose: () => void;
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  initialTab = 'export',
  pendingFile = null,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialTab);
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

  // Sync tab and pending file when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setExportSuccess(null);
      setImportError(null);
      if (pendingFile) {
        handleFileSelection(pendingFile);
      }
    }
  }, [isOpen, initialTab, pendingFile]);

  if (!isOpen) return null;

  const handleFileSelection = async (file: File) => {
    setImportError(null);
    setInspectSummary(null);
    try {
      const summary = await inspectWorkspaceFile(file);
      setInspectSummary(summary);
      setActiveTab('import');
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
      setExportSuccess(`Successfully exported "${filename}"`);
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
        onClose();
      }, 600);
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
        onClose();
      }, 600);
    } catch (err: any) {
      setIsImporting(false);
      setImportError(`Operation failed: ${err.message}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '640px',
          maxWidth: '92vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '10px',
          background: 'var(--bg-secondary, #181825)',
          border: '1px solid var(--border-subtle, #313244)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderBottom: '1px solid var(--border-subtle, #313244)',
            background: 'var(--bg-tertiary, #11111b)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileArchive size={18} color="var(--accent-primary, #89b4fa)" />
            <h2 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary, #cdd6f4)' }}>
              Workspace Project Management
            </h2>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(0,0,0,0.2)',
            padding: '0 12px',
            gap: '8px',
          }}
        >
          <button
            onClick={() => {
              setActiveTab('export');
              setImportError(null);
            }}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'export' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'export' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'export' ? 600 : 400,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Download size={14} /> Export Workspace (.litsift)
          </button>

          <button
            onClick={() => {
              setActiveTab('import');
              setExportSuccess(null);
            }}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'import' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'import' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'import' ? 600 : 400,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Upload size={14} /> Import Workspace
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          {/* ================= TAB 1: EXPORT WORKSPACE ================= */}
          {activeTab === 'export' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    padding: '8px 12px',
                    background: 'var(--bg-tertiary, #11111b)',
                    border: '1px solid var(--border-subtle, #313244)',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #cdd6f4)',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Package Content Breakdown Cards */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Bundle Contents Preview
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px',
                  }}
                >
                  {/* Card 1: PDFs */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-secondary, #b4befe)' }}>
                      <FileText size={15} />
                      <span style={{ fontSize: '11px', fontWeight: 600 }}>PDF Papers</span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {pdfs.length}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Embedded raw binaries
                    </div>
                  </div>

                  {/* Card 2: Extracted Rows */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-success, #a6e3a1)' }}>
                      <Table size={15} />
                      <span style={{ fontSize: '11px', fontWeight: 600 }}>Table Records</span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {validRows.length} <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>({columns.length} cols)</span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      With citations & bboxes
                    </div>
                  </div>

                  {/* Card 3: Agent Messages */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-warning, #f9e2af)' }}>
                      <MessageSquare size={15} />
                      <span style={{ fontSize: '11px', fontWeight: 600 }}>AI Chat Logs</span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {messages.length}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Per-paper thoughts & history
                    </div>
                  </div>
                </div>
              </div>

              {/* Info Notice */}
              <div
                style={{
                  background: 'rgba(137, 180, 250, 0.08)',
                  border: '1px solid rgba(137, 180, 250, 0.2)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                <Sparkles size={15} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>All-in-One Portable Bundle:</strong> The generated <code>.litsift</code> file contains all original PDF files, custom schema columns, synthesized rows with exact citations, and AI chat logs. Anyone who opens this file can continue exactly where you left off.
                </div>
              </div>

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
                  borderRadius: '6px',
                  padding: '10px 16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '4px',
                  opacity: isExporting ? 0.7 : 1,
                  boxShadow: '0 2px 8px rgba(137, 180, 250, 0.3)',
                }}
              >
                <Download size={15} />
                {isExporting ? 'Packaging Workspace Bundle...' : '💾 Export & Download .litsift File'}
              </button>
            </div>
          )}

          {/* ================= TAB 2: IMPORT WORKSPACE ================= */}
          {activeTab === 'import' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".litsift,.json"
                style={{ display: 'none' }}
              />

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
                    borderRadius: '8px',
                    padding: '28px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Upload size={28} color="var(--accent-primary)" />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Drop <code>.litsift</code> project file here or click to browse
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Supports <code>.litsift</code> or exported LitSift JSON bundles
                  </div>
                </div>
              )}

              {/* Inspection Summary Card */}
              {inspectSummary && !isImporting && (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
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

                  {/* Summary Metric Pills */}
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
                      <Table size={12} /> {inspectSummary.rowCount} Extracted Rows ({inspectSummary.columnCount} cols)
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
                      <MessageSquare size={12} /> {inspectSummary.chatMessageCount} Chat Messages
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

                  {/* Paper file list peek */}
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
                        marginTop: '4px',
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
                        <AlertTriangle size={15} /> Active Session Detected
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        You currently have <strong>{pdfs.length} papers</strong> and <strong>{validRows.length} extracted rows</strong> in your active workspace. Choose how you would like to proceed:
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
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
                        marginTop: '4px',
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
          )}
        </div>
      </div>
    </div>
  );
};
