import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent, CellFocusedEvent, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { useGridStore } from '../../store/useGridStore';
import { GridRow } from '../../types/grid';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([AllCommunityModule]);

interface AgGridWrapperProps {
  filterPdfId?: string;
  activePdfTitle?: string;
  isPreviewMode?: boolean;
}

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
    setSelectedRows,
    selectedColumnField,
    setSelectedColumnField,
    setFocusedCell,
    setActiveEvidence,
    setActiveCitation,
  } = useGridStore();

  const [newColName, setNewColName] = useState('');
  const [showAddColInput, setShowAddColInput] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const gridApiRef = useRef<any>(null);

  // Filter rows if in scoped view (show rows matching active PDF with safe fallback)
  const rowData = useMemo(() => {
    if (filterPdfId && filterPdfId !== 'master-grid') {
      const filtered = rows.filter(
        (r) =>
          r.pdfId === filterPdfId ||
          (activePdfTitle &&
            activePdfTitle !== 'No Paper Selected' &&
            activePdfTitle !== 'Master Workspace' &&
            r.pdfTitle.toLowerCase() === activePdfTitle.toLowerCase())
      );
      return filtered.length > 0 ? filtered : rows;
    }
    return rows; // Master view shows all
  }, [rows, filterPdfId, activePdfTitle]);

  // Construct AG Grid column definitions using stable headerComponent reference
  const colDefs = useMemo<ColDef<GridRow>[]>(() => {
    const dynamicCols: ColDef<GridRow>[] = columns.map((col) => {
      const isColSelected = isPreviewMode && selectedColumnField === col.field;
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
        sortable: !isPreviewMode,
        filter: !isPreviewMode,
        suppressHeaderMenuButton: isPreviewMode,
        resizable: true,
        autoHeight: true,
        headerClass: isColSelected ? 'ag-header-cell-selected' : '',
        cellStyle: (params): any => {
          const isFocusedRow = params.node.rowIndex === focusedRowIndex;
          if (isColSelected) {
            return {
              backgroundColor: 'rgba(137, 180, 250, 0.18)',
              color: 'var(--text-primary)',
              borderLeft: '1px solid var(--accent-primary)',
              borderRight: '1px solid var(--accent-primary)',
              whiteSpace: isFocusedRow ? 'pre-wrap' : 'nowrap',
              wordBreak: isFocusedRow ? 'break-word' : 'normal',
              opacity: 1,
              fontStyle: 'normal',
            };
          }
          if (params.data?.aiStatus === 'Pending Review') {
            return {
              backgroundColor: 'rgba(249, 226, 175, 0.18)',
              color: '#f9e2af',
              opacity: 1,
              fontStyle: 'normal',
              whiteSpace: isFocusedRow ? 'pre-wrap' : 'nowrap',
              wordBreak: isFocusedRow ? 'break-word' : 'normal',
            };
          }
          if (params.data?.isDraftRow) {
            return {
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              opacity: 0.6,
              fontStyle: 'italic',
              whiteSpace: isFocusedRow ? 'pre-wrap' : 'nowrap',
              wordBreak: isFocusedRow ? 'break-word' : 'normal',
            };
          }
          return {
            backgroundColor: 'transparent',
            color: 'var(--text-primary)',
            opacity: 1,
            fontStyle: 'normal',
            whiteSpace: isFocusedRow ? 'pre-wrap' : 'nowrap',
            wordBreak: isFocusedRow ? 'break-word' : 'normal',
          };
        },
      };
    });

    const rowNumCol: ColDef<GridRow> = {
      headerName: '#',
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
      cellStyle: {
        fontWeight: 600,
        fontSize: '11px',
        color: 'var(--text-secondary)',
        textAlign: 'center',
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
  }, [columns, addColumn, renameColumn, showAddColInput, newColName, focusedRowIndex, isPreviewMode, selectedColumnField]);

  const handleCellValueChanged = (event: CellValueChangedEvent<GridRow>) => {
    if (event.data && event.colDef.field) {
      updateCell(event.data.id, event.colDef.field, event.newValue);
    }
  };

  const handleCellFocused = useCallback(
    (event: CellFocusedEvent<GridRow>) => {
      setFocusedRowIndex(event.rowIndex);
      if (event.column && event.rowIndex !== null) {
        const colId = typeof event.column === 'string' ? event.column : event.column.getColId();
        const row = rowData[event.rowIndex];
        if (row && colId) {
          setFocusedCell({ rowId: row.id, field: colId });

          const citation = row.citationMap ? row.citationMap[colId] : null;
          if (citation) {
            setActiveCitation(citation);
            setActiveEvidence({
              pageNumber: citation.pageNumber || 1,
              snippetText: citation.snippetQuote || '',
              bbox: citation.bbox,
            });
          } else if (row.evidenceMap && row.evidenceMap[colId]) {
            setActiveEvidence(row.evidenceMap[colId]);
            setActiveCitation(null);
          } else {
            setActiveEvidence(null);
            setActiveCitation(null);
          }
        }
      }
    },
    [rowData, setFocusedCell, setActiveEvidence, setActiveCitation]
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

  const onSelectionChanged = (event: any) => {
    const selectedRows: GridRow[] = event.api.getSelectedRows();
    const ids = selectedRows.map((r) => r.id);
    setSelectedRows(ids);
  };

  // Header click handler for preview mode column selection
  const onColumnHeaderClicked = (event: any) => {
    if (!isPreviewMode) return;
    const field = event.column?.getColId();
    if (field && field !== 'pdfTitle' && field !== '#' && field !== '+ Column') {
      if (selectedColumnField === field) {
        setSelectedColumnField(undefined); // Toggle off if clicked twice
      } else {
        setSelectedColumnField(field);
      }
    }
  };

  // Ensure AG Grid reactively updates and repaints all modified cells & new columns
  useEffect(() => {
    if (gridApiRef.current?.api) {
      gridApiRef.current.api.redrawRows();
      gridApiRef.current.api.refreshCells({ force: true });
    }
  }, [rows, columns]);

  return (
    <div className="ag-theme-quartz-dark" style={{ height: '100%', width: '100%' }}>
      <AgGridReact
        rowData={rowData}
        getRowId={(params) => params.data.id}
        columnDefs={colDefs}
        defaultColDef={{
          width: 180,
          resizable: true,
          sortable: !isPreviewMode,
          filter: !isPreviewMode,
          editable: true,
        }}
        rowDragManaged={true}
        suppressMoveWhenRowDragging={true}
        onCellValueChanged={handleCellValueChanged}
        onCellFocused={handleCellFocused}
        onColumnHeaderClicked={onColumnHeaderClicked}
        getRowHeight={getRowHeight}
        animateRows={true}
        rowSelection="multiple"
        onSelectionChanged={onSelectionChanged}
        rowClassRules={{
          'row-pending-review': (params) => params.data?.aiStatus === 'Pending Review',
          'row-confirmed': (params) => params.data?.aiStatus === 'Confirmed',
          'row-draft': (params) => !!params.data?.isDraftRow,
        }}
        ref={gridApiRef}
      />
    </div>
  );
};
