import React, { useEffect } from 'react';
import { useAgentStore } from '../../store/useAgentStore';
import { useGridStore } from '../../store/useGridStore';
import { usePdfStore } from '../../store/usePdfStore';
import { getSelectedGeminiModel } from '../../services/geminiService';
import { ShieldCheck, Zap, Bot, Layers, CheckCircle2, FileSearch } from 'lucide-react';

interface StatusBarProps {
  activePdfTitle?: string;
  showBottomPanel?: boolean;
  isGridMaximized?: boolean;
  onToggleMaximizeGrid?: () => void;
  onOpenEnrichAuthors?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activePdfTitle,
  showBottomPanel = true,
  isGridMaximized = false,
  onToggleMaximizeGrid,
  onOpenEnrichAuthors,
}) => {
  const mode = useAgentStore((state) => state.mode);
  const isThinking = useAgentStore((state) => state.isThinking);
  const sendMessage = useAgentStore((state) => state.sendMessage);
  const currentModel = getSelectedGeminiModel();

  const {
    rows,
    columns,
    confirmAIEdits,
    rejectAIEdits,
    selectedRowIds,
    deleteRow,
    selectedColumnField,
    deleteColumn,
    focusedCell,
    selectedCells,
    updateCell,
    mergeSelectedRows,
    splitSelectedRow,
    undo,
    redo,
  } = useGridStore();

  const pdfs = usePdfStore((state) => state.pdfs);
  const activePdfId = usePdfStore((state) => state.activePdfId);
  const setPaperProcessingStatus = usePdfStore((state) => state.setPaperProcessingStatus);

  const activePdf =
    pdfs.find((p) => p.id === activePdfId) ||
    (activePdfTitle ? pdfs.find((p) => p.name === activePdfTitle || p.title === activePdfTitle) : undefined) ||
    usePdfStore.getState().getActivePdf();

  const activePdfName = activePdfTitle || (activePdf ? activePdf.name : 'Master Workspace');

  const isCurrentPaperDone = activePdf
    ? activePdf.processingStatus === 'done' ||
      (activePdf.processingStatus !== 'pending' &&
        activePdf.processingStatus !== 'review' &&
        rows.some(
          (r) =>
            !r.isDraftRow &&
            (r.pdfId === activePdf.id ||
              r.pdfTitle === activePdf.name ||
              (activePdf.title && r.pdfTitle === activePdf.title))
        ))
    : false;

  const isCurrentPaperReview = activePdf ? activePdf.processingStatus === 'review' : false;

  const handleTogglePaperDone = () => {
    if (!activePdf) return;
    setPaperProcessingStatus(activePdf.id, isCurrentPaperDone ? 'pending' : 'done');
  };

  const handleTogglePaperReview = () => {
    if (!activePdf) return;
    setPaperProcessingStatus(activePdf.id, isCurrentPaperReview ? 'pending' : 'review');
  };

  const focusedColName = focusedCell
    ? columns.find((c) => c.field === focusedCell.field)?.headerName || focusedCell.field
    : null;

  const hasPendingEdits = rows.some(
    (r) => r.aiStatus === 'Pending Review' || (r.pendingReviewFields && r.pendingReviewFields.length > 0)
  );

  const handleExtractData = () => {
    sendMessage(`Extract paper data from ${activePdfName}`);
  };

  const handleUnifiedDelete = () => {
    if (selectedColumnField) {
      deleteColumn(selectedColumnField);
    } else if (selectedRowIds.length > 0) {
      selectedRowIds.forEach((id) => deleteRow(id));
    } else if (selectedCells.length > 0) {
      selectedCells.forEach((c) => updateCell(c.rowId, c.field, ''));
    } else if (focusedCell) {
      updateCell(focusedCell.rowId, focusedCell.field, '');
    }
  };

  // Keyboard shortcuts: Delete/Backspace for delete, Ctrl+Z for Undo, Ctrl+Y for Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleUnifiedDelete();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedColumnField, selectedRowIds, selectedCells, focusedCell, undo, redo]);

  const handleMerge = () => {
    if (selectedRowIds.length >= 2) {
      mergeSelectedRows(selectedRowIds);
    }
  };

  const handleSplit = () => {
    if (selectedRowIds.length === 1) {
      splitSelectedRow(selectedRowIds[0], focusedCell?.field);
    } else if (focusedCell) {
      splitSelectedRow(focusedCell.rowId, focusedCell.field);
    }
  };

  const deleteDisabled =
    !selectedColumnField && selectedRowIds.length === 0 && selectedCells.length === 0 && !focusedCell;

  return (
    <footer className="status-bar">
      <div className="status-bar-left" style={{ gap: '8px' }}>
        {/* Unified Table Controls when Bottom Panel is Active */}
        {showBottomPanel && (
          <div className="status-grid-controls" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button className="grid-action-btn primary" onClick={handleExtractData} title="Run AI Data Extraction">
              ⚡ Extract
            </button>

            <button
              className={`grid-action-btn ${isCurrentPaperDone ? 'success' : ''}`}
              onClick={handleTogglePaperDone}
              disabled={!activePdf}
              title={
                !activePdf
                  ? 'No active paper selected to mark as done'
                  : isCurrentPaperDone
                  ? `Paper "${activePdf.name || activePdf.title}" is marked as Done (click to mark as Pending)`
                  : `Mark active paper "${activePdf.name || activePdf.title}" as Done`
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: isCurrentPaperDone ? 600 : 500,
                color: isCurrentPaperDone ? 'var(--accent-success, #a6e3a1)' : undefined,
                borderColor: isCurrentPaperDone ? 'var(--accent-success, #a6e3a1)' : undefined,
              }}
            >
              <CheckCircle2 size={12} />
              {isCurrentPaperDone ? 'Done' : 'Mark Done'}
            </button>

            <button
              className={`grid-action-btn ${isCurrentPaperReview ? 'active' : ''}`}
              onClick={handleTogglePaperReview}
              disabled={!activePdf}
              title={
                !activePdf
                  ? 'No active paper selected to mark for review'
                  : isCurrentPaperReview
                  ? `Paper "${activePdf.name || activePdf.title}" is under Review (click to mark as Pending)`
                  : `Mark active paper "${activePdf.name || activePdf.title}" for Review`
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: isCurrentPaperReview ? 600 : 500,
                color: isCurrentPaperReview ? 'var(--accent-secondary, #cba6f7)' : undefined,
                borderColor: isCurrentPaperReview ? 'var(--accent-secondary, #cba6f7)' : undefined,
                background: isCurrentPaperReview ? 'rgba(203, 166, 247, 0.18)' : undefined,
              }}
            >
              <FileSearch size={12} />
              {isCurrentPaperReview ? 'Review' : 'Mark Review'}
            </button>

            <button
              className="grid-action-btn danger"
              onClick={handleUnifiedDelete}
              disabled={deleteDisabled}
              title={
                selectedColumnField
                  ? `Delete selected column`
                  : selectedRowIds.length > 0
                  ? `Delete ${selectedRowIds.length} selected row(s)`
                  : selectedCells.length > 0
                  ? `Clear ${selectedCells.length} selected cell(s)`
                  : focusedCell
                  ? `Clear active cell content`
                  : `Select column, row, or cell to delete`
              }
              style={{ padding: '0 8px', fontSize: '12px' }}
            >
              🗑️
            </button>

            <button
              className="grid-action-btn"
              onClick={handleMerge}
              disabled={selectedRowIds.length < 2}
              title={selectedRowIds.length < 2 ? 'Select 2+ rows to merge' : 'Merge selected rows'}
            >
              🔗 Merge ({selectedRowIds.length})
            </button>

            <button
              className="grid-action-btn"
              onClick={handleSplit}
              disabled={selectedRowIds.length !== 1 && !focusedCell}
              title="Split selected row or cell content"
            >
              ✂️ Split
            </button>

            <button className="grid-action-btn" onClick={() => undo()} title="Undo last action (Ctrl+Z)">
              ↩
            </button>
            <button className="grid-action-btn" onClick={() => redo()} title="Redo action (Ctrl+Y)">
              ↪
            </button>

            {onToggleMaximizeGrid && (
              <button
                className={`grid-action-btn ${isGridMaximized ? 'active' : ''}`}
                onClick={onToggleMaximizeGrid}
                title={isGridMaximized ? 'Restore Grid Height' : 'Maximize Grid Height for 15–20 Columns'}
              >
                {isGridMaximized ? '🗗 Restore' : '🗖 Maximize'}
              </button>
            )}

            {onOpenEnrichAuthors && (
              <button
                className="grid-action-btn"
                onClick={onOpenEnrichAuthors}
                title="Enrich dataset with corresponding author details from DOIs"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'var(--accent-warning, #f9e2af)',
                  borderColor: 'rgba(249, 226, 175, 0.3)',
                }}
              >
                ✉ Enrich Authors
              </button>
            )}

            {hasPendingEdits && (
              <>
                <button className="grid-action-btn success" onClick={() => confirmAIEdits()} title="Confirm All AI Edits">
                  ✓ Confirm
                </button>
                <button className="grid-action-btn danger" onClick={() => rejectAIEdits()} title="Reject All AI Edits">
                  ✗ Reject
                </button>
              </>
            )}
          </div>
        )}

        {/* HITL / Autopilot Mode Indicator */}
        <div className={`status-item mode-item ${mode === 'human_in_loop' ? 'hitl' : 'autopilot'}`}>
          {mode === 'human_in_loop' ? <ShieldCheck size={11} /> : <Zap size={11} />}
          <span>{mode === 'human_in_loop' ? 'HITL' : 'Autopilot'}</span>
        </div>

        {/* Live Processing Indicator */}
        {isThinking && (
          <div className="status-item thinking-item">
            <span className="status-dot thinking"></span>
            <span>Extracting...</span>
          </div>
        )}

        {/* Active PDF Paper */}
        <div className="status-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ opacity: 0.6 }}>Paper:</span>
          <span className="status-value">{activePdfName}</span>
          {!showBottomPanel && activePdf && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <button
                className={`grid-action-btn ${isCurrentPaperDone ? 'success' : ''}`}
                onClick={handleTogglePaperDone}
                title={
                  isCurrentPaperDone
                    ? `Paper "${activePdf.name || activePdf.title}" is marked as Done (click to mark as Pending)`
                    : `Mark active paper "${activePdf.name || activePdf.title}" as Done`
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '1px 6px',
                  fontSize: '10.5px',
                  fontWeight: isCurrentPaperDone ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                <CheckCircle2 size={10} />
                {isCurrentPaperDone ? 'Done' : 'Mark Done'}
              </button>
              <button
                className={`grid-action-btn ${isCurrentPaperReview ? 'active' : ''}`}
                onClick={handleTogglePaperReview}
                title={
                  isCurrentPaperReview
                    ? `Paper "${activePdf.name || activePdf.title}" is under Review (click to mark as Pending)`
                    : `Mark active paper "${activePdf.name || activePdf.title}" for Review`
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '1px 6px',
                  fontSize: '10.5px',
                  fontWeight: isCurrentPaperReview ? 600 : 500,
                  cursor: 'pointer',
                  color: isCurrentPaperReview ? 'var(--accent-secondary, #cba6f7)' : undefined,
                  borderColor: isCurrentPaperReview ? 'var(--accent-secondary, #cba6f7)' : undefined,
                  background: isCurrentPaperReview ? 'rgba(203, 166, 247, 0.18)' : undefined,
                }}
              >
                <FileSearch size={10} />
                {isCurrentPaperReview ? 'Review' : 'Mark Review'}
              </button>
            </div>
          )}
        </div>

        {/* Active Cell Focus Context */}
        {focusedCell && focusedColName && (
          <div className="status-item cell-item">
            <span style={{ color: 'var(--accent-primary)' }}>🎯 Cell:</span>
            <span className="status-value highlight">{focusedColName}</span>
          </div>
        )}
      </div>

      <div className="status-bar-right" style={{ gap: '12px' }}>
        {/* Dataset Stats */}
        <div className="status-item">
          <Layers size={11} style={{ opacity: 0.7 }} />
          <span>{rows.length} rows, {columns.length} cols</span>
        </div>

        {/* Active Gemini AI Model */}
        <div className="status-item model-item">
          <Bot size={11} />
          <span>{currentModel}</span>
        </div>
      </div>
    </footer>
  );
};
