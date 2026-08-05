import { create } from 'zustand';
import { produce } from 'immer';
import { GridState, SchemaColumn, GridRow } from '../types/grid';

const initialColumns: SchemaColumn[] = [
  { field: 'pdfTitle', headerName: 'Document', editable: false },
  { field: 'methodology', headerName: 'Methodology', editable: true },
  { field: 'sampleSize', headerName: 'Sample Size', editable: true },
  { field: 'keyResults', headerName: 'Key Results', editable: true },
  { field: 'limitations', headerName: 'Limitations', editable: true },
];

const initialRows: GridRow[] = [
  {
    id: 'row-1',
    pdfId: 'pdf-1',
    pdfTitle: 'Attention_Is_All_You_Need.pdf',
    methodology: 'Transformer Self-Attention Mechanism',
    sampleSize: '8 x NVIDIA P100 GPUs',
    keyResults: '28.4 BLEU score on WMT 2014 EN-DE',
    limitations: 'High computational resource required for training',
    aiStatus: 'Pending Review',
  },
  {
    id: 'row-2',
    pdfId: 'pdf-2',
    pdfTitle: 'GPT4_Technical_Report.pdf',
    methodology: 'Multimodal Transformer Pretraining',
    sampleSize: 'Undisclosed Cluster Size',
    keyResults: 'Human-level performance on academic benchmarks',
    limitations: 'Hallucinations in complex reasoning tasks',
    aiStatus: 'Confirmed',
  },
  {
    id: 'row-3',
    pdfId: 'pdf-3',
    pdfTitle: 'Llama3_Architecture_Paper.pdf',
    methodology: 'Grouped-Query Attention (GQA)',
    sampleSize: '15T Tokens Training Set',
    keyResults: 'State-of-the-art open-source performance',
    limitations: 'Requires fine-tuning for specific domain tasks',
    aiStatus: 'Pending Review',
  },
];

export const useGridStore = create<GridState>((set) => ({
  columns: initialColumns,
  rows: initialRows,
  selectedRowIds: [],

  updateCell: (rowId, field, value) =>
    set(
      produce((state: GridState) => {
        const row = state.rows.find((r) => r.id === rowId);
        if (row) {
          row[field] = value;
          row.aiStatus = 'Confirmed';
        }
      })
    ),

  addRow: (pdfId = 'pdf-1', pdfTitle = 'Attention_Is_All_You_Need.pdf') =>
    set(
      produce((state: GridState) => {
        const newRowId = `row-${Date.now()}`;
        const newRow: GridRow = {
          id: newRowId,
          pdfId,
          pdfTitle,
          methodology: 'New Extraction Entry',
          sampleSize: 'N/A',
          keyResults: 'Enter results...',
          limitations: 'None specified',
          aiStatus: 'Pending Review',
        };
        state.rows.push(newRow);
      })
    ),

  deleteRow: (rowId) =>
    set(
      produce((state: GridState) => {
        state.rows = state.rows.filter((r) => r.id !== rowId);
      })
    ),

  addColumn: (headerName) =>
    set(
      produce((state: GridState) => {
        const field = headerName.toLowerCase().replace(/\s+/g, '_');
        if (!state.columns.some((c) => c.field === field)) {
          state.columns.push({ field, headerName, editable: true });
          state.rows.forEach((row) => {
            row[field] = '-';
          });
        }
      })
    ),

  deleteColumn: (field) =>
    set(
      produce((state: GridState) => {
        if (field !== 'pdfTitle') {
          state.columns = state.columns.filter((c) => c.field !== field);
          state.rows.forEach((row) => {
            delete row[field];
          });
        }
      })
    ),

  confirmAIEdits: (rowId) =>
    set(
      produce((state: GridState) => {
        if (rowId) {
          const row = state.rows.find((r) => r.id === rowId);
          if (row) row.aiStatus = 'Confirmed';
        } else {
          state.rows.forEach((r) => (r.aiStatus = 'Confirmed'));
        }
      })
    ),

  rejectAIEdits: (rowId) =>
    set(
      produce((state: GridState) => {
        if (rowId) {
          state.rows = state.rows.filter((r) => r.id !== rowId);
        } else {
          state.rows = state.rows.filter((r) => r.aiStatus !== 'Pending Review');
        }
      })
    ),

  setSelectedRows: (rowIds) => set({ selectedRowIds: rowIds }),

  reorderRows: (sourceIndex, destinationIndex) =>
    set(
      produce((state: GridState) => {
        const [movedRow] = state.rows.splice(sourceIndex, 1);
        state.rows.splice(destinationIndex, 0, movedRow);
      })
    ),
}));
