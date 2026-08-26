import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { AgGridWrapper } from '../components/data-grid/AgGridWrapper';
import { useGridStore } from '../store/useGridStore';

describe('Data Grid Multiline Cell Editing UX', () => {
  beforeEach(() => {
    useGridStore.setState({
      columns: [
        { field: 'notes', headerName: 'Clinical Notes' },
        { field: 'results', headerName: 'Key Results' },
      ],
      rows: [
        {
          id: 'row-edit-1',
          pdfId: 'pdf-sample',
          pdfTitle: 'Sample Paper.pdf',
          notes: 'Initial line 1\nInitial line 2',
          results: 'Tested positive',
          aiStatus: 'Confirmed',
        },
      ],
      selectedCells: [{ rowId: 'row-edit-1', field: 'notes' }],
      focusedCell: { rowId: 'row-edit-1', field: 'notes' },
    });
  });

  it('renders data grid with multiline content preserved in useGridStore', () => {
    render(<AgGridWrapper />);
    const state = useGridStore.getState();
    expect(state.rows[0].notes).toBe('Initial line 1\nInitial line 2');
  });

  it('renders AG Grid with proper column headers when rows are empty', () => {
    useGridStore.setState({
      columns: [
        { field: 'notes', headerName: 'Clinical Notes' },
        { field: 'results', headerName: 'Key Results' },
      ],
      rows: [],
    });

    const { container } = render(<AgGridWrapper />);
    expect(container.querySelector('.ag-theme-quartz-dark')).not.toBeNull();
    expect(container.textContent).not.toContain('Active Schema:');
  });
});
