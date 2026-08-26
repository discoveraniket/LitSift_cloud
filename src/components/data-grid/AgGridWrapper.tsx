import React, { useMemo, useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent, CellFocusedEvent, CellClickedEvent, CellDoubleClickedEvent, CellEditRequestEvent, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { useGridStore } from '../../store/useGridStore';
import { usePdfStore } from '../../store/usePdfStore';
import { GridRow } from '../../types/grid';
import { SchemaStarterCard } from './SchemaStarterCard';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([AllCommunityModule]);

interface AgGridWrapperProps {
  filterPdfId?: string;
  activePdfTitle?: string;
  isPreviewMode?: boolean;
}

/**
 * Custom Multiline In-Cell Text Editor
 * - Allows multiline text entry
 * - Shift+Enter and Alt+Enter create newlines (\n) without exiting edit mode
 * - Plain Enter or Ctrl+Enter commits the edit
 * - Escape cancels the edit
 * - Stops click events from propagating so clicking to position cursor / deselect text remains in edit mode
 */
const MultilineCellEditor = forwardRef((props: any, ref) => {
  const [value, setValue] = useState(props.value ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    getValue: () => value,
    isPopup: () => false,
  }));

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    props.onValueChange?.(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();

    if (e.key === 'Enter') {
      if (e.shiftKey || e.altKey) {
        // Explicitly insert newline at cursor position
        e.preventDefault();
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart ?? 0;
          const end = textarea.selectionEnd ?? 0;
          const val = textarea.value;
          const newVal = val.substring(0, start) + '\n' + val.substring(end);
          setValue(newVal);
          props.onValueChange?.(newVal);
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1;
            }
          }, 0);
        }
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter / Cmd+Enter: Commit
        e.preventDefault();
        props.stopEditing();
        return;
      }
      // Plain Enter: Commit edit
      e.preventDefault();
      props.stopEditing();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      props.stopEditing(true); // Cancel
    }
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: '28px',
        display: 'flex',
        alignItems: 'stretch',
        padding: '0px',
        background: 'var(--bg-secondary, #181825)',
        boxSizing: 'border-box',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '26px',
          resize: 'none',
          background: 'var(--bg-tertiary, #11111b)',
          color: 'var(--text-primary, #cdd6f4)',
          border: '1.5px solid var(--accent-primary, #89b4fa)',
          borderRadius: '3px',
          padding: '4px 6px',
          fontFamily: 'inherit',
          fontSize: '11.5px',
          lineHeight: '1.4',
          outline: 'none',
          boxShadow: '0 0 0 2px rgba(137, 180, 250, 0.25)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
});
MultilineCellEditor.displayName = 'MultilineCellEditor';

const EditableHeader: React.FC<any> = (params) => {
  const displayName = params.displayName || params.displayNameGetter?.() || params.column?.getColDef()?.headerName || '';
  const field = params.field || params.column?.getColId() || '';
  const onRename = params.onRename;

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(displayName);

  // Sync title if displayName prop updates from store
  useEffect(() => {
    setTitle(displayName);
  }, [displayName]);

  const handleFinish = () => {
    setIsEditing(false);
    if (title.trim() && title !== displayName) {
      if (onRename) onRename(field, title.trim());
    } else {
      setTitle(displayName);
    }
  };

  if (isEditing) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{ width: '100%', display: 'flex', alignItems: 'center' }}
      >
        <input
          type="text"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleFinish}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleFinish();
            if (e.key === 'Escape') {
              setTitle(displayName);
              setIsEditing(false);
            }
          }}
          style={{
            width: '95%',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--accent-primary)',
            color: 'var(--text-primary)',
            fontSize: '11px',
            padding: '2px 4px',
            borderRadius: '3px',
            outline: 'none',
          }}
        />
      </div>
    );
  }

  return (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      title="Double-click to rename column"
      style={{ cursor: 'pointer', width: '100%', userSelect: 'none' }}
    >
      {displayName}
    </div>
  );
};

export const AgGridWrapper: React.FC<AgGridWrapperProps> = ({
  filterPdfId,
  activePdfTitle,
  isPreviewMode = false,
}) => {
  const {
    columns,
    rows,
    updateCell,
    addColumn,
    renameColumn,
    selectedRowIds,
    setSelectedRows,
    selectedColumnField,
    setSelectedColumnField,
    focusedCell,
    selectedCells,
    setSelectedCells,
    toggleCellSelection,
    isTableSelected,
    setSelectedTable,
    setActiveEvidence,
    setActiveCitation,
  } = useGridStore();

  const [newColName, setNewColName] = useState('');
  const [showAddColInput, setShowAddColInput] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const focusedRowIndexRef = useRef<number | null>(null);
  focusedRowIndexRef.current = focusedRowIndex;
  const gridApiRef = useRef<any>(null);

  // Filter rows if in scoped view (show rows strictly matching active PDF)
  const rowData = useMemo(() => {
    if (filterPdfId && filterPdfId !== 'master-grid') {
      return rows.filter((r) => {
        if (r.pdfId && r.pdfId === filterPdfId) return true;
        if (
          activePdfTitle &&
          activePdfTitle !== 'No Paper Selected' &&
          activePdfTitle !== 'Master Workspace' &&
          r.pdfTitle &&
          r.pdfTitle.trim().toLowerCase() === activePdfTitle.trim().toLowerCase()
        ) {
          return true;
        }
        return false;
      });
    }
    return rows; // Master view shows all
  }, [rows, filterPdfId, activePdfTitle]);

  // Construct AG Grid column definitions using stable headerComponent reference
  const colDefs = useMemo<ColDef<GridRow>[]>(() => {
    const dynamicCols: ColDef<GridRow>[] = columns.map((col) => {
      const isColSelected = selectedColumnField === col.field;
      return {
        field: col.field,
        headerName: col.headerName,
        headerComponent: EditableHeader,
        headerComponentParams: {
          displayName: col.headerName,
          field: col.field,
          onRename: renameColumn,
        },
        editable: true,
        cellEditor: MultilineCellEditor,
        suppressKeyboardEvent: (params) => {
          if (params.editing) {
            const event = params.event;
            if (event.key === 'Enter' && (event.shiftKey || event.altKey)) {
              return true; // Let editor handle Shift+Enter for newline
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
              return true; // Let user navigate inside textarea
            }
          }
          return false;
        },
        sortable: !isPreviewMode,
        filter: !isPreviewMode,
        suppressHeaderMenuButton: isPreviewMode,
        resizable: true,
        autoHeight: true,
        headerClass: isColSelected ? 'ag-header-cell-selected' : '',
        cellStyle: (params): any => {
          if (isColSelected) {
            return {
              backgroundColor: 'rgba(137, 180, 250, 0.18)',
              color: 'var(--text-primary)',
              borderLeft: '1px solid var(--accent-primary)',
              borderRight: '1px solid var(--accent-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              opacity: 1,
              fontStyle: 'normal',
            };
          }
          const isCellPending =
            params.data?.pendingReviewFields?.includes(col.field) ||
            (params.data?.aiStatus === 'Pending Review' &&
              (!params.data?.pendingReviewFields || params.data.pendingReviewFields.length === 0));

          if (isCellPending) {
            return {
              backgroundColor: 'rgba(249, 226, 175, 0.18)',
              color: '#f9e2af',
              opacity: 1,
              fontStyle: 'normal',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            };
          }
          if (params.data?.isDraftRow) {
            return {
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              opacity: 0.6,
              fontStyle: 'italic',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            };
          }
          return {
            backgroundColor: 'transparent',
            color: 'var(--text-primary)',
            opacity: 1,
            fontStyle: 'normal',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          };
        },
      };
    });

    const rowNumCol: ColDef<GridRow> = {
      colId: 'rowNum',
      headerName: '#',
      headerComponent: () => (
        <div
          title="Click to Select Entire Table"
          onClick={() => setSelectedTable(true)}
          style={{
            cursor: 'pointer',
            textAlign: 'center',
            width: '100%',
            userSelect: 'none',
            color: isTableSelected ? 'var(--accent-primary)' : 'inherit',
            fontWeight: isTableSelected ? 700 : 600,
          }}
        >
          {isTableSelected ? '⊞' : '#'}
        </div>
      ),
      width: 50,
      pinned: 'left',
      sortable: false,
      filter: false,
      editable: false,
      resizable: false,
      valueGetter: (params) => {
        if (params.data?.isDraftRow) return '*';
        return (params.node?.rowIndex ?? 0) + 1;
      },
      cellStyle: (params) => {
        const isRowSelected = !!params.data?.id && selectedRowIds.includes(params.data.id);
        return {
          fontWeight: 600,
          fontSize: '11px',
          color: isRowSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
          backgroundColor: isRowSelected ? 'rgba(137, 180, 250, 0.18)' : 'transparent',
          textAlign: 'center',
          cursor: 'pointer',
        };
      },
    };

    const addColCol: ColDef<GridRow> = {
      headerName: '+ Column',
      headerComponent: () => (
        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          {showAddColInput ? (
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Title..."
                value={newColName}
                autoFocus
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newColName.trim()) {
                    addColumn(newColName.trim());
                    setNewColName('');
                    setShowAddColInput(false);
                  }
                }}
                style={{
                  width: '70px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '10px',
                  padding: '1px 4px',
                  borderRadius: '3px',
                }}
              />
              <button
                onClick={() => {
                  if (newColName.trim()) {
                    addColumn(newColName.trim());
                    setNewColName('');
                    setShowAddColInput(false);
                  }
                }}
                style={{
                  background: 'var(--accent-primary)',
                  color: 'var(--bg-secondary)',
                  border: 'none',
                  borderRadius: '3px',
                  fontSize: '9px',
                  padding: '1px 4px',
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddColInput(true)}
              title="Add New Column"
              style={{
                background: 'var(--bg-surface)',
                border: '1px dashed var(--border-subtle)',
                color: 'var(--accent-primary)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              + Add Column
            </button>
          )}
        </div>
      ),
      width: 105,
      resizable: false,
      editable: false,
      sortable: false,
      filter: false,
    };

    return [rowNumCol, ...dynamicCols, addColCol];
  }, [columns, addColumn, renameColumn, showAddColInput, newColName, isPreviewMode, selectedColumnField]);

  const isShiftKeyPressedRef = useRef(false);
  const isCtrlKeyPressedRef = useRef(false);
  const isMouseDownWithModifierRef = useRef(false);
  const anchorCellRef = useRef<{ rowIndex: number; colIndex: number; rowId: string; field: string } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) isShiftKeyPressedRef.current = true;
      if (e.ctrlKey || e.metaKey) isCtrlKeyPressedRef.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.shiftKey) isShiftKeyPressedRef.current = false;
      if (!e.ctrlKey && !e.metaKey) isCtrlKeyPressedRef.current = false;
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        isMouseDownWithModifierRef.current = true;
      } else {
        isMouseDownWithModifierRef.current = false;
      }
    };
    const handleMouseUp = () => {
      isMouseDownWithModifierRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, []);

  const handleCellValueChanged = (event: CellValueChangedEvent<GridRow>) => {
    if (event.data && event.colDef.field) {
      updateCell(event.data.id, event.colDef.field, event.newValue);
    }
  };

  const getColIndex = useCallback(
    (colId: string) => {
      return columns.findIndex((c) => c.field === colId);
    },
    [columns]
  );

  const getRangeCells = useCallback(
    (
      startRowIndex: number,
      startColIndex: number,
      endRowIndex: number,
      endColIndex: number
    ): Array<{ rowId: string; field: string }> => {
      const minRow = Math.max(0, Math.min(startRowIndex, endRowIndex));
      const maxRow = Math.min(rowData.length - 1, Math.max(startRowIndex, endRowIndex));
      const minCol = Math.max(0, Math.min(startColIndex, endColIndex));
      const maxCol = Math.min(columns.length - 1, Math.max(startColIndex, endColIndex));

      const cells: Array<{ rowId: string; field: string }> = [];
      for (let r = minRow; r <= maxRow; r++) {
        const row =
          (gridApiRef.current?.api && typeof gridApiRef.current.api.getDisplayedRowAtIndex === 'function'
            ? gridApiRef.current.api.getDisplayedRowAtIndex(r)?.data
            : null) || rowData[r];
        if (!row) continue;

        for (let c = minCol; c <= maxCol; c++) {
          const col = columns[c];
          if (
            col &&
            col.field &&
            col.field !== 'rowNum' &&
            col.field !== '0' &&
            col.field !== '#' &&
            col.field !== '+ Column' &&
            col.field !== 'addCol'
          ) {
            cells.push({ rowId: row.id, field: col.field });
          }
        }
      }
      return cells;
    },
    [rowData, columns]
  );

  const handleCellSelectOrFocus = useCallback(
    (
      rowIndex: number | null,
      column: any,
      directRowData?: GridRow,
      isCtrl = false,
      isShift = false
    ) => {
      if ((rowIndex === null && !directRowData) || !column) return;

      const colId = typeof column === 'string' ? column : (column.getColId ? column.getColId() : column.colId);

      // Commit in-progress edit before switching focus/selection ONLY if clicking a DIFFERENT cell
      if (gridApiRef.current?.api) {
        const editingCells = gridApiRef.current.api.getEditingCells();
        if (editingCells && editingCells.length > 0) {
          const isCurrentlyEditingThisCell = editingCells.some(
            (ec: any) =>
              ec.rowIndex === rowIndex &&
              (ec.column.getColId ? ec.column.getColId() : (ec.column as any).colId) === colId
          );
          if (!isCurrentlyEditingThisCell) {
            gridApiRef.current.api.stopEditing(false);
          } else {
            // Already editing this cell; user is clicking to position cursor / deselect text
            return;
          }
        }
      }

      if (rowIndex !== null) setFocusedRowIndex(rowIndex);
      const row =
        directRowData ||
        (rowIndex !== null
          ? (gridApiRef.current?.api && typeof gridApiRef.current.api.getDisplayedRowAtIndex === 'function'
              ? gridApiRef.current.api.getDisplayedRowAtIndex(rowIndex)?.data
              : null) || rowData[rowIndex]
          : null);

      if (row && colId) {
        // If clicking the row index helper column (#), select the entire row instead of a fake "0" field
        if (colId === 'rowNum' || colId === '0' || colId === '#') {
          if (isCtrl) {
            const current = useGridStore.getState().selectedRowIds;
            const updated = current.includes(row.id)
              ? current.filter((id) => id !== row.id)
              : [...current, row.id];
            setSelectedRows(updated);
          } else {
            setSelectedRows([row.id]);
          }
          return;
        }

        // If clicking the "+ Column" helper column, ignore cell focus
        if (colId === '+ Column' || colId === 'addCol') {
          return;
        }

        const targetColIndex = getColIndex(colId);
        const targetRowIndex = rowIndex !== null ? rowIndex : rowData.findIndex((r) => r.id === row.id);

        if (isShift && targetColIndex >= 0 && targetRowIndex >= 0) {
          // Range selection from anchor to target
          let anchor = anchorCellRef.current;
          if (!anchor) {
            const fc = useGridStore.getState().focusedCell;
            if (fc) {
              const rIdx = rowData.findIndex((r) => r.id === fc.rowId);
              const cIdx = getColIndex(fc.field);
              if (rIdx >= 0 && cIdx >= 0) {
                anchor = { rowIndex: rIdx, colIndex: cIdx, rowId: fc.rowId, field: fc.field };
                anchorCellRef.current = anchor;
              }
            }
          }
          if (!anchor) {
            anchor = { rowIndex: targetRowIndex, colIndex: targetColIndex, rowId: row.id, field: colId };
            anchorCellRef.current = anchor;
          }

          const rangeCells = getRangeCells(anchor.rowIndex, anchor.colIndex, targetRowIndex, targetColIndex);
          setSelectedCells(rangeCells.length > 0 ? rangeCells : [{ rowId: row.id, field: colId }], {
            rowId: row.id,
            field: colId,
          });
        } else if (isCtrl) {
          // Toggle individual cell
          toggleCellSelection({ rowId: row.id, field: colId });
          if (targetColIndex >= 0 && targetRowIndex >= 0) {
            anchorCellRef.current = { rowIndex: targetRowIndex, colIndex: targetColIndex, rowId: row.id, field: colId };
          }
        } else {
          // Single cell selection (resets anchor)
          setSelectedCells([{ rowId: row.id, field: colId }], { rowId: row.id, field: colId });
          if (targetColIndex >= 0 && targetRowIndex >= 0) {
            anchorCellRef.current = { rowIndex: targetRowIndex, colIndex: targetColIndex, rowId: row.id, field: colId };
          }
        }

        // If row has an associated PDF that is not currently active, switch active PDF in usePdfStore
        const pdfStore = usePdfStore.getState();
        if (row.pdfId || row.pdfTitle || row['Article DOI'] || row.doi) {
          const matchedPdf = pdfStore.pdfs.find(
            (p) =>
              (row.pdfId && p.id === row.pdfId) ||
              (row.pdfTitle && (p.name === row.pdfTitle || p.title === row.pdfTitle)) ||
              (row.doi && p.doi === row.doi) ||
              (row['Article DOI'] && p.doi === row['Article DOI'])
          );
          if (matchedPdf && matchedPdf.id !== pdfStore.activePdfId) {
            pdfStore.setActivePdf(matchedPdf.id);
          }
        }

        const cellValue = row[colId];
        const keyword = cellValue !== undefined && cellValue !== null && typeof cellValue === 'string' ? cellValue.trim() : '';

        const colHeader = columns.find((c) => c.field === colId)?.headerName;
        const citation = row.citationMap
          ? row.citationMap[colId] || (colHeader ? row.citationMap[colHeader] : null)
          : null;

        if (citation) {
          setActiveCitation(citation);
          setActiveEvidence({
            pageNumber: citation.pageNumber || 1,
            snippetText: citation.snippetQuote || '',
            keywordText: keyword,
            sectionName: citation.sectionName,
            paragraphNumber: citation.paragraphNumber,
          });
        } else if (row.evidenceMap && (row.evidenceMap[colId] || (colHeader && row.evidenceMap[colHeader]))) {
          const ev = row.evidenceMap[colId] || (colHeader ? row.evidenceMap[colHeader] : null);
          setActiveEvidence({
            ...ev,
            keywordText: keyword,
          });
          setActiveCitation(null);
        } else {
          setActiveEvidence(null);
          setActiveCitation(null);
        }
      }
    },
    [
      rowData,
      columns,
      getColIndex,
      getRangeCells,
      setSelectedCells,
      toggleCellSelection,
      setSelectedRows,
      setActiveEvidence,
      setActiveCitation,
    ]
  );

  const handleCellFocused = useCallback(
    (event: CellFocusedEvent<GridRow>) => {
      if (event.rowIndex === null || event.rowIndex === undefined || !event.column) {
        return;
      }

      setFocusedRowIndex(event.rowIndex);

      // If mouse is being clicked with modifier (Ctrl/Meta/Shift), let handleCellClicked handle multi-selection
      if (isMouseDownWithModifierRef.current) {
        return;
      }

      const colId = typeof event.column === 'string' ? event.column : (event.column.getColId ? event.column.getColId() : (event.column as any).colId);
      if (!colId || colId === '+ Column' || colId === 'addCol') {
        return;
      }

      // If currently editing this cell, do not interrupt editing
      if (gridApiRef.current?.api) {
        const editingCells = gridApiRef.current.api.getEditingCells();
        if (editingCells && editingCells.length > 0) {
          const isCurrentlyEditingThisCell = editingCells.some(
            (ec: any) =>
              ec.rowIndex === event.rowIndex &&
              (ec.column.getColId ? ec.column.getColId() : (ec.column as any).colId) === colId
          );
          if (isCurrentlyEditingThisCell) {
            return;
          }
        }
      }

      const row =
        (event.api && typeof event.api.getDisplayedRowAtIndex === 'function'
          ? event.api.getDisplayedRowAtIndex(event.rowIndex)?.data
          : null) || rowData[event.rowIndex];

      if (row) {
        const isShift = isShiftKeyPressedRef.current;
        const isCtrl = isCtrlKeyPressedRef.current;
        handleCellSelectOrFocus(event.rowIndex, event.column, row, isCtrl, isShift);
      }
    },
    [rowData, handleCellSelectOrFocus]
  );

  const handleCellClicked = useCallback(
    (event: CellClickedEvent<GridRow>) => {
      const mouseEvent = event.event as MouseEvent;
      const isShift = Boolean(mouseEvent?.shiftKey);
      const isCtrl = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey);
      handleCellSelectOrFocus(event.rowIndex, event.column, event.data, isCtrl, isShift);
    },
    [handleCellSelectOrFocus]
  );

  const getRowHeight = useCallback(
    (params: any) => {
      if (params.node.rowIndex === focusedRowIndex) {
        return 60;
      }
      return 28;
    },
    [focusedRowIndex]
  );

  // Header click handler for column selection and entire table selection
  const onColumnHeaderClicked = (event: any) => {
    const field = event.column?.getColId();
    if (field === 'rowNum' || field === '0' || field === '#') {
      setSelectedTable(true);
      return;
    }
    if (field && field !== 'pdfTitle' && field !== '+ Column' && field !== 'addCol') {
      if (selectedColumnField === field) {
        setSelectedColumnField(undefined); // Toggle off if clicked twice
      } else {
        setSelectedColumnField(field);
      }
    }
  };

  const handleCellDoubleClicked = useCallback(
    (event: CellDoubleClickedEvent<GridRow>) => {
      const field = event.column?.getColId();
      if (
        gridApiRef.current?.api &&
        event.rowIndex !== null &&
        field &&
        field !== 'rowNum' &&
        field !== '0' &&
        field !== '#' &&
        field !== '+ Column' &&
        field !== 'addCol'
      ) {
        gridApiRef.current.api.startEditingCell({
          rowIndex: event.rowIndex,
          colKey: field,
        });
      }
    },
    []
  );

  // Cleanly refresh cells when selection updates without interrupting active cell editors
  useEffect(() => {
    if (gridApiRef.current?.api) {
      const editingCells = gridApiRef.current.api.getEditingCells();
      if (!editingCells || editingCells.length === 0) {
        gridApiRef.current.api.refreshCells({ suppressFlash: true });
      }
    }
  }, [focusedCell, selectedCells]);

  const handleCellEditRequest = useCallback(
    (event: CellEditRequestEvent<GridRow>) => {
      const field = event.colDef.field;
      if (event.data && field) {
        updateCell(event.data.id, field, event.newValue);
      }
    },
    [updateCell]
  );

  if (rowData.length === 0) {
    return (
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
        {columns.length > 0 && (
          <div style={{ height: '32px', flexShrink: 0, borderBottom: '1px solid var(--border-subtle, #313244)', background: 'var(--bg-secondary, #181825)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px', fontSize: '11px', color: 'var(--text-secondary, #a6adc8)' }}>
            <span style={{ fontWeight: 600, color: 'var(--accent-primary, #89b4fa)' }}>Active Schema:</span>
            {columns.map((c) => (
              <span key={c.field} style={{ background: 'var(--bg-primary, #1e1e2e)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle, #313244)' }}>
                {c.headerName}
              </span>
            ))}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>
          <SchemaStarterCard />
        </div>
      </div>
    );
  }

  return (
    <div className="ag-theme-quartz-dark" style={{ height: '100%', width: '100%' }}>
      <AgGridReact
        rowData={rowData}
        getRowId={(params) => params.data.id}
        columnDefs={colDefs}
        readOnlyEdit={true}
        onCellEditRequest={handleCellEditRequest}
        defaultColDef={{
          width: 180,
          resizable: true,
          sortable: !isPreviewMode,
          filter: !isPreviewMode,
          editable: true,
          cellEditor: MultilineCellEditor,
          suppressKeyboardEvent: (params) => {
            if (params.editing) {
              const event = params.event;
              if (event.key === 'Enter' && (event.shiftKey || event.altKey)) {
                return true;
              }
              if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                return true;
              }
            }
            return false;
          },
          cellClassRules: {
            'litsift-cell-active': (params) =>
              selectedCells.some((c) => c.rowId === params.data?.id && c.field === params.colDef.field) ||
              (!!focusedCell && params.data?.id === focusedCell.rowId && params.colDef.field === focusedCell.field),
            'cell-pending-review': (params) => {
              const field = params.colDef.field;
              if (!field || !params.data) return false;
              return Boolean(params.data.pendingReviewFields?.includes(field));
            },
          },
        }}
        rowDragManaged={true}
        suppressMoveWhenRowDragging={true}
        stopEditingWhenCellsLoseFocus={true}
        enterNavigatesVerticallyAfterEdit={false}
        enterNavigatesVertically={false}
        undoRedoCellEditing={true}
        undoRedoCellEditingLimit={20}
        onCellValueChanged={handleCellValueChanged}
        onCellFocused={handleCellFocused}
        onCellClicked={handleCellClicked}
        onCellDoubleClicked={handleCellDoubleClicked}
        onColumnHeaderClicked={onColumnHeaderClicked}
        getRowHeight={getRowHeight}
        animateRows={true}
        rowSelection="multiple"
        suppressRowClickSelection={true}
        rowClassRules={{
          'row-pending-review': (params) =>
            params.data?.aiStatus === 'Pending Review' &&
            (!params.data?.pendingReviewFields || params.data.pendingReviewFields.length === 0),
          'row-confirmed': (params) => params.data?.aiStatus === 'Confirmed',
          'row-draft': (params) => !!params.data?.isDraftRow,
        }}
        ref={gridApiRef}
      />
    </div>
  );
};
