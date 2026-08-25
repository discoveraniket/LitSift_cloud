import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent, CellFocusedEvent, CellClickedEvent, CellDoubleClickedEvent, CellEditRequestEvent, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { useGridStore } from '../../store/useGridStore';
import { usePdfStore } from '../../store/usePdfStore';
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
        sortable: !isPreviewMode,
        filter: !isPreviewMode,
        suppressHeaderMenuButton: isPreviewMode,
        resizable: true,
        autoHeight: true,
        headerClass: isColSelected ? 'ag-header-cell-selected' : '',
        cellStyle: (params): any => {
          const isFocusedRow = params.node.rowIndex === focusedRowIndexRef.current;
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

  const handleCellValueChanged = (event: CellValueChangedEvent<GridRow>) => {
    if (event.data && event.colDef.field) {
      updateCell(event.data.id, event.colDef.field, event.newValue);
    }
  };

  const handleCellSelectOrFocus = useCallback(
    (rowIndex: number | null, column: any, directRowData?: GridRow, isMultiToggle = false) => {
      if ((rowIndex === null && !directRowData) || !column) return;

      // Commit in-progress edit before switching focus/selection
      if (gridApiRef.current?.api) {
        const editingCells = gridApiRef.current.api.getEditingCells();
        if (editingCells && editingCells.length > 0) {
          gridApiRef.current.api.stopEditing(false);
        }
      }

      if (rowIndex !== null) setFocusedRowIndex(rowIndex);
      const colId = typeof column === 'string' ? column : column.getColId();
      const row = directRowData || (rowIndex !== null ? rowData[rowIndex] : null);
      if (row && colId) {
        // If clicking the row index helper column (#), select the entire row instead of a fake "0" field
        if (colId === 'rowNum' || colId === '0' || colId === '#') {
          if (isMultiToggle) {
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

        if (isMultiToggle) {
          toggleCellSelection({ rowId: row.id, field: colId });
        } else {
          setSelectedCells([{ rowId: row.id, field: colId }]);
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

        const citation = row.citationMap ? row.citationMap[colId] : null;
        if (citation) {
          setActiveCitation(citation);
          setActiveEvidence({
            pageNumber: citation.pageNumber || 1,
            snippetText: citation.snippetQuote || '',
            keywordText: keyword,
            sectionName: citation.sectionName,
            paragraphNumber: citation.paragraphNumber,
          });
        } else if (row.evidenceMap && row.evidenceMap[colId]) {
          setActiveEvidence({
            ...row.evidenceMap[colId],
            keywordText: keyword,
          });
          setActiveCitation(null);
        } else {
          setActiveEvidence(null);
          setActiveCitation(null);
        }
      }
    },
    [rowData, setSelectedCells, toggleCellSelection, setSelectedRows, setActiveEvidence, setActiveCitation]
  );

  const handleCellFocused = useCallback(
    (event: CellFocusedEvent<GridRow>) => {
      if (event.rowIndex !== null) {
        setFocusedRowIndex(event.rowIndex);
      }
    },
    []
  );

  const handleCellClicked = useCallback(
    (event: CellClickedEvent<GridRow>) => {
      const mouseEvent = event.event as MouseEvent;
      const isMultiKey = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey || mouseEvent?.shiftKey);
      handleCellSelectOrFocus(event.rowIndex, event.column, event.data, isMultiKey);
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
        enterNavigatesVerticallyAfterEdit={true}
        enterNavigatesVertically={true}
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
