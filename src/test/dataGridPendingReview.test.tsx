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
});
