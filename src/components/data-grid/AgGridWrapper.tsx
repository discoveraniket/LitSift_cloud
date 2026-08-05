import React, { useMemo, useState, useCallback } from 'react';
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
}

export const AgGridWrapper: React.FC<AgGridWrapperProps> = ({
  filterPdfId,
}) => {
  const { columns, rows, updateCell, confirmAIEdits, rejectAIEdits, addColumn } = useGridStore();
  const [newColName, setNewColName] = useState('');
  const [showAddColInput, setShowAddColInput] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

  // Filter rows if in scoped view
  const rowData = useMemo(() => {
    if (filterPdfId) {
      return rows.filter((r) => r.pdfId === filterPdfId);
    }
    return rows;
  }, [rows, filterPdfId]);

  // Construct AG Grid column definitions
  const colDefs = useMemo<ColDef<GridRow>[]>(() => {
    const dynamicCols: ColDef<GridRow>[] = columns.map((col) => ({
      field: col.field,
      headerName: col.headerName,
      editable: true, // All cells are double-clickable and editable
      sortable: true,
      filter: true,
      resizable: true,
      autoHeight: true, // Allow cell height to expand for full content
      cellStyle: (params) => {
        const isFocusedRow = params.node.rowIndex === focusedRowIndex;
        if (params.data?.aiStatus === 'Pending Review') {
          return {
            backgroundColor: 'rgba(249, 226, 175, 0.18)',
            color: '#f9e2af',
            opacity: 1,
            fontStyle: 'normal',
            whiteSpace: isFocusedRow ? 'normal' : 'nowrap',
            wordBreak: isFocusedRow ? 'break-word' : 'normal',
          };
        }
        if (params.data?.isDraftRow) {
          return {
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            opacity: 0.6,
            fontStyle: 'italic',
            whiteSpace: isFocusedRow ? 'normal' : 'nowrap',
            wordBreak: isFocusedRow ? 'break-word' : 'normal',
          };
        }
        return {
          backgroundColor: 'transparent',
          color: 'var(--text-primary)',
          opacity: 1,
          fontStyle: 'normal',
          whiteSpace: isFocusedRow ? 'normal' : 'nowrap',
          wordBreak: isFocusedRow ? 'break-word' : 'normal',
        };
      },
    }));

    // Slim, fixed & pinned row index column (#)
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

    // Add Column Header Button (Pinned at the far right of column headers)
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
  }, [columns, confirmAIEdits, rejectAIEdits, addColumn, showAddColInput, newColName, focusedRowIndex]);

  const handleCellValueChanged = (event: CellValueChangedEvent<GridRow>) => {
    if (event.data && event.colDef.field) {
      updateCell(event.data.id, event.colDef.field, event.newValue);
    }
  };

  // Expand row height dynamically on selection/focus
  const handleCellFocused = useCallback((event: CellFocusedEvent<GridRow>) => {
    setFocusedRowIndex(event.rowIndex);
  }, []);

  const getRowHeight = useCallback(
    (params: any) => {
      if (params.node.rowIndex === focusedRowIndex) {
        return 60; // Expanded height for focused row so all content is readable
      }
      return 28; // Compact row height for unselected rows
    },
    [focusedRowIndex]
  );

  return (
    <div className="ag-theme-quartz-dark" style={{ height: '100%', width: '100%' }}>
      <AgGridReact
        rowData={rowData}
        columnDefs={colDefs}
        defaultColDef={{
          width: 180, // Standardized Excel cell width
          resizable: true,
          sortable: true,
          filter: true,
          editable: true,
        }}
        rowDragManaged={true}
        suppressMoveWhenRowDragging={true}
        onCellValueChanged={handleCellValueChanged}
        onCellFocused={handleCellFocused}
        getRowHeight={getRowHeight}
        animateRows={true}
      />
    </div>
  );
};
