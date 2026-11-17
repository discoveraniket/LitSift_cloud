import { render, act, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgGridWrapper, EditableHeader } from '../components/data-grid/AgGridWrapper';
import { useGridStore } from '../store/useGridStore';

describe('Data Grid Column Pinning & Horizontal Navigation UX', () => {
  beforeEach(() => {
    useGridStore.setState({
      columns: [
        { field: 'pdfTitle', headerName: 'Paper Title' },
        { field: 'methodology', headerName: 'Methodology' },
        { field: 'sampleSize', headerName: 'Sample Size' },
        { field: 'results', headerName: 'Key Results' },
      ],
      rows: [
        {
          id: 'row-pin-1',
          pdfId: 'pdf-1',
          pdfTitle: 'Study A.pdf',
          methodology: 'Randomized Controlled Trial',
          sampleSize: 'n = 250',
          results: 'Statistically significant improvement',
          aiStatus: 'Confirmed',
        },
      ],
      selectedCells: [],
      focusedCell: null,
    });
  });

  it('initializes columns as unpinned by default', () => {
    const cols = useGridStore.getState().columns;
    expect(cols[0].pinned).toBeUndefined();
    expect(cols[1].pinned).toBeUndefined();
    expect(cols[2].pinned).toBeUndefined();
  });

  it('toggles column pinned state to "left" via togglePinColumn', () => {
    act(() => {
      useGridStore.getState().togglePinColumn('pdfTitle');
    });

    const cols = useGridStore.getState().columns;
    expect(cols[0].pinned).toBe('left');
    expect(cols[1].pinned).toBeUndefined();

    // Toggle again to unpin
    act(() => {
      useGridStore.getState().togglePinColumn('pdfTitle');
    });

    expect(useGridStore.getState().columns[0].pinned).toBeUndefined();
  });

  it('allows pinning multiple columns simultaneously', () => {
    act(() => {
      useGridStore.getState().togglePinColumn('pdfTitle');
      useGridStore.getState().togglePinColumn('methodology');
    });

    const cols = useGridStore.getState().columns;
    expect(cols[0].pinned).toBe('left');
    expect(cols[1].pinned).toBe('left');
    expect(cols[2].pinned).toBeUndefined();
  });

  it('restores column pinned state on undo and redo', () => {
    // Initial: none pinned
    expect(useGridStore.getState().columns[0].pinned).toBeUndefined();

    // Pin Paper Title
    act(() => {
      useGridStore.getState().togglePinColumn('pdfTitle');
    });
    expect(useGridStore.getState().columns[0].pinned).toBe('left');

    // Undo pin
    act(() => {
      useGridStore.getState().undo();
    });
    expect(useGridStore.getState().columns[0].pinned).toBeUndefined();

    // Redo pin
    act(() => {
      useGridStore.getState().redo();
    });
    expect(useGridStore.getState().columns[0].pinned).toBe('left');
  });

  it('renders EditableHeader with pin button and responds to pin clicks', () => {
    const onTogglePin = vi.fn();
    const onRename = vi.fn();

    const { rerender } = render(
      <EditableHeader
        displayName="Paper Title"
        field="pdfTitle"
        isPinned={false}
        onTogglePin={onTogglePin}
        onRename={onRename}
      />
    );

    expect(screen.getByText('Paper Title')).toBeInTheDocument();
    const pinBtn = screen.getByTitle('Pin column to left');
    expect(pinBtn).toBeInTheDocument();
    expect(pinBtn).not.toHaveClass('is-pinned');

    fireEvent.click(pinBtn);
    expect(onTogglePin).toHaveBeenCalledWith('pdfTitle');

    // Re-render as pinned
    rerender(
      <EditableHeader
        displayName="Paper Title"
        field="pdfTitle"
        isPinned={true}
        onTogglePin={onTogglePin}
        onRename={onRename}
      />
    );

    const unpinBtn = screen.getByTitle('Unpin column from left');
    expect(unpinBtn).toBeInTheDocument();
    expect(unpinBtn).toHaveClass('is-pinned');
  });

  it('renders AgGridWrapper container with AG Grid theme', () => {
    const { container } = render(<AgGridWrapper />);
    expect(container.querySelector('.ag-theme-quartz-dark')).not.toBeNull();
  });
});
