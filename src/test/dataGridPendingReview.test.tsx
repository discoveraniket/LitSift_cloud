import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { AgGridWrapper } from '../components/data-grid/AgGridWrapper';
import { useGridStore } from '../store/useGridStore';

describe('Data Grid Multi-Cell Staged Updates & Pending Review UX', () => {
  beforeEach(() => {
    useGridStore.setState({
      columns: [
        { field: 'optimal_temp', headerName: 'Optimal Temperature (°C)' },
        { field: 'optimal_ph', headerName: 'Optimal pH' },
        { field: 'host_species', headerName: 'Host Bacterial Species' },
      ],
      rows: [
        {
          id: 'row-test-1',
          pdfId: 'pdf-sample',
          pdfTitle: 'Sample Paper.pdf',
          optimal_temp: '',
          optimal_ph: '',
          host_species: '',
          aiStatus: 'Confirmed',
          pendingReviewFields: [],
        },
      ],
      selectedCells: [],
      focusedCell: null,
    });
  });

  it('correctly maps header names and varied casings to target fields during batchUpdateCells', () => {
    const store = useGridStore.getState();

    store.batchUpdateCells([
      {
        rowId: 'row-test-1',
        field: 'Optimal Temperature (°C)', // Header name
        value: 'Not reported (Range 4 - 60 °C)',
        isAiPending: true,
        reasoning: 'Extracted from section 3.2',
      },
      {
        rowId: 'row-test-1',
        field: 'Optimal pH', // Header name with space
        value: 'Not reported (Range 4 - 11)',
        isAiPending: true,
        reasoning: 'Extracted from section 3.2',
      },
      {
        rowId: 'row-test-1',
        field: 'host_species', // Field key
        value: 'Escherichia coli',
        isAiPending: true,
        reasoning: 'Extracted from abstract',
      },
    ]);

    const updatedRow = useGridStore.getState().rows[0];

    // Check all fields are populated correctly
    expect(updatedRow.optimal_temp).toBe('Not reported (Range 4 - 60 °C)');
    expect(updatedRow.optimal_ph).toBe('Not reported (Range 4 - 11)');
    expect(updatedRow.host_species).toBe('Escherichia coli');

    // Check pendingReviewFields contains all columns
    expect(updatedRow.pendingReviewFields).toContain('optimal_temp');
    expect(updatedRow.pendingReviewFields).toContain('optimal_ph');
    expect(updatedRow.pendingReviewFields).toContain('host_species');

    // Check row is marked as Pending Review
    expect(updatedRow.aiStatus).toBe('Pending Review');
  });

  it('renders data grid without blanking out columns when updates use header names', () => {
    useGridStore.getState().batchUpdateCells([
      {
        rowId: 'row-test-1',
        field: 'Optimal Temperature (°C)',
        value: '37 °C',
        isAiPending: true,
      },
      {
        rowId: 'row-test-1',
        field: 'Optimal pH',
        value: '7.4',
        isAiPending: true,
      },
    ]);

    render(<AgGridWrapper />);
    expect(useGridStore.getState().rows[0].optimal_temp).toBe('37 °C');
    expect(useGridStore.getState().rows[0].optimal_ph).toBe('7.4');
  });
  it('splits selected row into distinct rows without incorrectly flagging them as AI pending review, and supports Undo/Redo', () => {
    // 1. Setup a confirmed row with two host bacterial species
    useGridStore.setState({
      rows: [
        {
          id: 'row-to-split',
          pdfId: 'pdf-sample',
          pdfTitle: 'Sample Paper.pdf',
          optimal_temp: '37 °C',
          optimal_ph: '7.0',
          host_species: 'Klebsiella pneumoniae\n• Pseudomonas aeruginosa',
          aiStatus: 'Confirmed',
          pendingReviewFields: [],
        },
      ],
    });

    expect(useGridStore.getState().rows.length).toBe(1);

    // 2. Perform Split
    useGridStore.getState().splitSelectedRow('row-to-split');

    let splitRows = useGridStore.getState().rows;
    expect(splitRows.length).toBe(2);

    // Verify split content
    expect(splitRows[0].host_species).toBe('Klebsiella pneumoniae');
    expect(splitRows[1].host_species).toBe('Pseudomonas aeruginosa');

    // Verify they are NOT flagged as Pending Review (anomaly fix #2)
    expect(splitRows[0].aiStatus).toBe('Confirmed');
    expect(splitRows[1].aiStatus).toBe('Confirmed');

    // 3. Verify Undo directly restores original row (anomaly fix #1 & #4)
    useGridStore.getState().undo();
    expect(useGridStore.getState().rows.length).toBe(1);
    expect(useGridStore.getState().rows[0].id).toBe('row-to-split');
    expect(useGridStore.getState().rows[0].host_species).toBe('Klebsiella pneumoniae\n• Pseudomonas aeruginosa');

    // 4. Verify Redo restores the split rows
    useGridStore.getState().redo();
    splitRows = useGridStore.getState().rows;
    expect(splitRows.length).toBe(2);
    expect(splitRows[0].host_species).toBe('Klebsiella pneumoniae');
    expect(splitRows[1].host_species).toBe('Pseudomonas aeruginosa');

    // 5. Verify rejectAIEdits does NOT delete the confirmed split rows (anomaly fix #3)
    useGridStore.getState().rejectAIEdits();
    expect(useGridStore.getState().rows.length).toBe(2);
  });
  it('merges confirmed rows into a confirmed row without accept/reject highlight, and selects the merged row', () => {
    useGridStore.setState({
      rows: [
        {
          id: 'row-merge-1',
          pdfId: 'pdf-sample',
          pdfTitle: 'Sample Paper.pdf',
          optimal_temp: '37 °C',
          optimal_ph: '7.0',
          host_species: 'Klebsiella pneumoniae',
          aiStatus: 'Confirmed',
          pendingReviewFields: [],
        },
        {
          id: 'row-merge-2',
          pdfId: 'pdf-sample',
          pdfTitle: 'Sample Paper.pdf',
          optimal_temp: '37 °C',
          optimal_ph: '7.5',
          host_species: 'Pseudomonas aeruginosa',
          aiStatus: 'Confirmed',
          pendingReviewFields: [],
        },
      ],
      selectedRowIds: ['row-merge-1', 'row-merge-2'],
    });

    expect(useGridStore.getState().rows.length).toBe(2);

    // Merge rows
    useGridStore.getState().mergeSelectedRows(['row-merge-1', 'row-merge-2']);

    const rows = useGridStore.getState().rows;
    expect(rows.length).toBe(1);

    const merged = rows[0];
    expect(merged.host_species).toContain('Klebsiella pneumoniae');
    expect(merged.host_species).toContain('Pseudomonas aeruginosa');

    // Confirm that the merged row does NOT receive Pending Review status
    expect(merged.aiStatus).toBe('Confirmed');
    expect(merged.pendingReviewFields).toEqual([]);

    // Confirm the new merged row is automatically selected for immediate visual feedback
    expect(useGridStore.getState().selectedRowIds).toEqual([merged.id]);
  });
});
