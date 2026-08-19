export interface EvidenceLocation {
  pageNumber: number;
  snippetText: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface CellCitationMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
}

export interface CellCitation {
  pageNumber: number;
  sectionName: string;
  snippetQuote: string;
  reasoning: string;
  confidence: number;
  bbox?: { x: number; y: number; width: number; height: number };
  history?: CellCitationMessage[];
}

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
  evidenceMap?: Record<string, EvidenceLocation>;
  citationMap?: Record<string, CellCitation>; // Maps column field -> Rich Cell Citation
  [key: string]: any;
}

export interface GridState {
  columns: SchemaColumn[];
  rows: GridRow[];
  selectedRowIds: string[];
  selectedColumnField?: string;
  focusedCell?: { rowId: string; field: string } | null;
  activeEvidence?: EvidenceLocation | null;
  activeCitation?: CellCitation | null;
  
  // Actions
  hydrateFromDb: () => Promise<void>;
  resetActiveSelection: () => void;
  updateCell: (rowId: string, field: string, value: any) => void;
  batchUpdateCells: (updates: Array<{ rowId: string; field: string; value: any; reasoning?: string; sectionName?: string; pageNumber?: number; snippetQuote?: string }>) => void;
  updateCellCitation: (rowId: string, field: string, citation: CellCitation) => void;
  updateRow: (rowId: string, fields: Record<string, any>, citations?: Record<string, any>) => void;
  addRow: (pdfId?: string, pdfTitle?: string) => void;
  appendRow: (row: Partial<GridRow>) => GridRow;
  deleteRow: (rowId: string) => void;
  deleteRows: (rowIds: string[]) => void;
  addColumn: (headerName: string, initialValues?: Record<string, any>, citations?: Record<string, any>) => void;
  renameColumn: (field: string, newHeaderName: string) => void;
  deleteColumn: (field: string) => void;
  mergeSelectedRows: (rowIds: string[], consolidatedRow?: Record<string, any>, citations?: Record<string, any>) => void;
  splitSelectedRow: (rowId: string, targetField?: string) => void;
  disaggregateRow: (targetRowId: string, replacementRows: Array<Record<string, any>>, citations?: Record<string, any>) => void;
  confirmAIEdits: (rowId?: string) => void;
  rejectAIEdits: (rowId?: string) => void;
  undo: () => void;
  redo: () => void;
  setSelectedRows: (rowIds: string[]) => void;
  setSelectedColumnField: (field?: string) => void;
  setFocusedCell: (cell: { rowId: string; field: string } | null) => void;
  setActiveEvidence: (evidence: EvidenceLocation | null) => void;
  setActiveCitation: (citation: CellCitation | null) => void;
  addCellDiscussionMessage: (rowId: string, field: string, userText: string) => void;
  importCsvDataset: (headers: string[], parsedRows: Record<string, any>[]) => void;
  appendCsvDataset: (headers: string[], parsedRows: Record<string, any>[]) => void;
  appendRows: (rows: GridRow[]) => void;
  clearTable: () => void;
  reorderRows: (sourceIndex: number, destinationIndex: number) => void;
}
