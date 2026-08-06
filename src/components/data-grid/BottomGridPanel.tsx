import React, { useEffect } from 'react';
import { AgGridWrapper } from './AgGridWrapper';
import { useGridStore } from '../../store/useGridStore';

interface BottomGridPanelProps {
  activePdfId?: string;
  activePdfTitle: string;
}

export const BottomGridPanel: React.FC<BottomGridPanelProps> = ({ activePdfId = 'pdf-1', activePdfTitle }) => {
  const {
    rows,
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

  const hasPendingEdits = rows.some((r) => r.aiStatus === 'Pending Review');

  const handleUnifiedDelete = () => {
    if (selectedColumnField) {
      deleteColumn(selectedColumnField);
    } else if (selectedRowIds.length > 0) {
      selectedRowIds.forEach((id) => deleteRow(id));
    } else if (focusedCell) {
      updateCell(focusedCell.rowId, focusedCell.field, '');
    }
  };

  // Global Keyboard shortcuts: Delete/Backspace for delete, Ctrl+Z for Undo, Ctrl+Y / Ctrl+Shift+Z for Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger global shortcuts if editing text in an input/textarea
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
    <footer className="panel bottom-grid">
      <div className="table-container">
        <AgGridWrapper filterPdfId={activePdfId} activePdfTitle={activePdfTitle} isPreviewMode={true} />
      </div>

      <div className="grid-toolbar bottom-toolbar">
        <span className="grid-scope-label">
          SCOPED TABLE (Active PDF: {activePdfTitle})
        </span>

        <div className="grid-actions">
          <button className="grid-action-btn primary">⚡ Extract Data</button>

          {/* Icon-Only Smart Delete Button */}
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
                : `Select a column, row, or cell to delete`
            }
            style={{ padding: '0 10px', fontSize: '13px' }}
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

          {/* Undo and Redo Buttons */}
          <button className="grid-action-btn" onClick={() => undo()} title="Undo last action (Ctrl+Z)">
            ↩ Undo
          </button>
          <button className="grid-action-btn" onClick={() => redo()} title="Redo action (Ctrl+Y)">
            ↪ Redo
          </button>

          {/* Clear Entire Table Button */}
          <button
            className="grid-action-btn danger"
            onClick={() => useGridStore.getState().clearTable()}
            title="Clear all rows in the master grid (Can be undone via Ctrl+Z)"
          >
            🧹 Clear Table
          </button>

          {/* Dynamic AI Review status / buttons */}
          {hasPendingEdits ? (
            <>
              <button className="grid-action-btn success" onClick={() => confirmAIEdits()}>
                ✓ Confirm All AI Edits
              </button>
              <button className="grid-action-btn danger" onClick={() => rejectAIEdits()}>
                ✗ Reject All AI Edits
              </button>
            </>
          ) : (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--accent-success)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0 6px',
                fontWeight: 600,
              }}
            >
              ✓ All Edits Approved
            </span>
          )}
        </div>
      </div>
    </footer>
  );
};
