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
  
  // Actions
  updateCell: (rowId: string, field: string, value: any) => void;
  addRow: (pdfId?: string, pdfTitle?: string) => void;
  deleteRow: (rowId: string) => void;
  addColumn: (headerName: string) => void;
  deleteColumn: (field: string) => void;
  confirmAIEdits: (rowId?: string) => void;
  rejectAIEdits: (rowId?: string) => void;
  setSelectedRows: (rowIds: string[]) => void;
  reorderRows: (sourceIndex: number, destinationIndex: number) => void;
}
