import React, { useEffect } from 'react';
import { useAgentStore } from '../../store/useAgentStore';
import { useGridStore } from '../../store/useGridStore';
import { usePdfStore } from '../../store/usePdfStore';
import { getSelectedGeminiModel } from '../../services/geminiService';
import { ShieldCheck, Zap, Bot, Layers } from 'lucide-react';

interface StatusBarProps {
  activePdfTitle?: string;
  showBottomPanel?: boolean;
  isGridMaximized?: boolean;
  onToggleMaximizeGrid?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activePdfTitle,
  showBottomPanel = true,
  isGridMaximized = false,
  onToggleMaximizeGrid,
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
    updateCell,
    mergeSelectedRows,
    splitSelectedRow,
    undo,
    redo,
  } = useGridStore();

  const activePdf = usePdfStore((state) => state.getActivePdf());
  const activePdfName = activePdfTitle || (activePdf ? activePdf.name : 'Master Workspace');

  const focusedColName = focusedCell
    ? columns.find((c) => c.field === focusedCell.field)?.headerName || focusedCell.field
    : null;

  const hasPendingEdits = rows.some((r) => r.aiStatus === 'Pending Review');

  const handleExtractData = () => {
    sendMessage(`Extract paper data from ${activePdfName}`);
  };

  const handleUnifiedDelete = () => {
    if (selectedColumnField) {
      deleteColumn(selectedColumnField);
    } else if (selectedRowIds.length > 0) {
      selectedRowIds.forEach((id) => deleteRow(id));
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
  }, [selectedColumnField, selectedRowIds, focusedCell, undo, redo]);

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

  const deleteDisabled = !selectedColumnField && selectedRowIds.length === 0 && !focusedCell;

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
              className="grid-action-btn danger"
              onClick={handleUnifiedDelete}
              disabled={deleteDisabled}
              title={
                selectedColumnField
                  ? `Delete selected column`
                  : selectedRowIds.length > 0
                  ? `Delete ${selectedRowIds.length} selected row(s)`
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
        <div className="status-item">
          <span style={{ opacity: 0.6 }}>Paper:</span>
          <span className="status-value">{activePdfName}</span>
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
