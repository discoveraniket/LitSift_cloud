export interface SchemaColumn {
  field: string;
  headerName: string;
  editable?: boolean;
}

export interface GridRow {
  id: string;
  pdfId: string;
  pdfTitle: string;
  aiStatus: 'Confirmed' | 'Pending Review';
  [key: string]: any;
}

export interface GridState {
  columns: SchemaColumn[];
  rows: GridRow[];
  selectedRowIds: string[];
  selectedColumnField?: string;
  focusedCell?: { rowId: string; field: string } | null;
  
  // Actions
  updateCell: (rowId: string, field: string, value: any) => void;
  addRow: (pdfId?: string, pdfTitle?: string) => void;
  deleteRow: (rowId: string) => void;
  addColumn: (headerName: string) => void;
  renameColumn: (field: string, newHeaderName: string) => void;
  deleteColumn: (field: string) => void;
  mergeSelectedRows: (rowIds: string[]) => void;
  splitSelectedRow: (rowId: string, targetField?: string) => void;
  confirmAIEdits: (rowId?: string) => void;
  rejectAIEdits: (rowId?: string) => void;
  undo: () => void;
  redo: () => void;
  setSelectedRows: (rowIds: string[]) => void;
  setSelectedColumnField: (field?: string) => void;
  setFocusedCell: (cell: { rowId: string; field: string } | null) => void;
  reorderRows: (sourceIndex: number, destinationIndex: number) => void;
}
