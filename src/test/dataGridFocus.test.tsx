import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { AgGridWrapper } from '../components/data-grid/AgGridWrapper';
import { RightAgentPanel } from '../components/agent/RightAgentPanel';
import { useGridStore } from '../store/useGridStore';
import { usePdfStore } from '../store/usePdfStore';

describe('Data Grid Keyboard Navigation & Cell Focus Synchronization', () => {
  beforeEach(() => {
    useGridStore.setState({
      columns: [
        { field: 'phage_isolation_sample', headerName: 'Phage isolation Sample' },
        { field: 'host_bacterial_species', headerName: 'Host Bacterial Species' },
        { field: 'study_type', headerName: 'Study Type' },
      ],
      rows: [
        {
          id: 'row-1',
          pdfId: 'pdf-1',
          pdfTitle: 'Sample Phage Paper',
          aiStatus: 'Confirmed',
          phage_isolation_sample: 'sewage',
          host_bacterial_species: 'Proteus mirabilis',
          study_type: 'MDR phage isolation',
          citationMap: {
            phage_isolation_sample: {
              pageNumber: 2,
              snippetQuote: 'Phages were isolated from municipal sewage samples.',
              reasoning: 'The study identifies municipal sewage as the source material for phage screening.',
              confidence: 0.95,
              sectionName: 'Materials and Methods',
            },
            host_bacterial_species: {
              pageNumber: 3,
              snippetQuote: 'Proteus mirabilis clinical strains were used as bacterial hosts.',
              reasoning: 'The author explicitly tested bacterial host specificity against Proteus mirabilis.',
              confidence: 0.98,
              sectionName: 'Host Range',
            },
          },
        },
      ],
      selectedCells: [{ rowId: 'row-1', field: 'phage_isolation_sample' }],
      focusedCell: { rowId: 'row-1', field: 'phage_isolation_sample' },
      activeCitation: {
        pageNumber: 2,
        snippetQuote: 'Phages were isolated from municipal sewage samples.',
        reasoning: 'The study identifies municipal sewage as the source material for phage screening.',
        confidence: 0.95,
        sectionName: 'Materials and Methods',
      },
    });

    usePdfStore.setState({
      pdfs: [
        {
          id: 'pdf-1',
          name: 'Sample Phage Paper',
          title: 'Sample Phage Paper',
          file: new File([], 'sample.pdf'),
          uploadedAt: Date.now(),
          oaStatus: 'gold',
          sourceType: 'pdf_upload',
          status: 'Extracted',
        },
      ],
      activePdfId: 'pdf-1',
    });
  });

  it('renders initial reasoning card for the initially selected cell', () => {
    render(<RightAgentPanel activePdfTitle="Sample Phage Paper" />);

    expect(screen.getByText('Cell Grounding Context')).toBeInTheDocument();
    expect(
      screen.getByText('The study identifies municipal sewage as the source material for phage screening.')
    ).toBeInTheDocument();
    expect(screen.getByText('"Phages were isolated from municipal sewage samples."')).toBeInTheDocument();
  });

  it('updates selected cell, focused cell, and reasoning card when navigating to a new cell', () => {
    const { rerender } = render(
      <div>
        <AgGridWrapper filterPdfId="pdf-1" activePdfTitle="Sample Phage Paper" />
        <RightAgentPanel activePdfTitle="Sample Phage Paper" />
      </div>
    );

    // Simulate cell focus change (as occurs when pressing Right Arrow key)
    act(() => {
      useGridStore.getState().setSelectedCells([{ rowId: 'row-1', field: 'host_bacterial_species' }]);
      const row = useGridStore.getState().rows[0];
      const nextCit = row.citationMap?.host_bacterial_species;
      if (nextCit) {
        useGridStore.getState().setActiveCitation(nextCit);
        useGridStore.getState().setActiveEvidence({
          pageNumber: nextCit.pageNumber || 1,
          snippetText: nextCit.snippetQuote || '',
          keywordText: 'Proteus mirabilis',
          sectionName: nextCit.sectionName,
          paragraphNumber: nextCit.paragraphNumber,
        });
      }
    });

    rerender(
      <div>
        <AgGridWrapper filterPdfId="pdf-1" activePdfTitle="Sample Phage Paper" />
        <RightAgentPanel activePdfTitle="Sample Phage Paper" />
      </div>
    );

    const store = useGridStore.getState();
    // Verify only one cell is selected and it is the new cell
    expect(store.selectedCells).toHaveLength(1);
    expect(store.selectedCells[0]).toEqual({ rowId: 'row-1', field: 'host_bacterial_species' });
    expect(store.focusedCell).toEqual({ rowId: 'row-1', field: 'host_bacterial_species' });

    // Verify reasoning card updated to new cell's rationale and quote
    expect(
      screen.getByText('The author explicitly tested bacterial host specificity against Proteus mirabilis.')
    ).toBeInTheDocument();
    expect(screen.getByText('"Proteus mirabilis clinical strains were used as bacterial hosts."')).toBeInTheDocument();
    expect(screen.getByText('98% Match')).toBeInTheDocument();
  });

  it('supports selecting a multi-cell range with setSelectedCells preserving explicit focusedCell', () => {
    act(() => {
      useGridStore.getState().setSelectedCells(
        [
          { rowId: 'row-1', field: 'phage_isolation_sample' },
          { rowId: 'row-1', field: 'host_bacterial_species' },
          { rowId: 'row-1', field: 'study_type' },
        ],
        { rowId: 'row-1', field: 'study_type' }
      );
    });

    const state = useGridStore.getState();
    expect(state.selectedCells).toHaveLength(3);
    expect(state.focusedCell).toEqual({ rowId: 'row-1', field: 'study_type' });
  });

  it('supports toggling individual cells with toggleCellSelection (Ctrl+Click)', () => {
    act(() => {
      useGridStore.getState().setSelectedCells([{ rowId: 'row-1', field: 'phage_isolation_sample' }]);
      useGridStore.getState().toggleCellSelection({ rowId: 'row-1', field: 'study_type' });
    });

    const state = useGridStore.getState();
    expect(state.selectedCells).toHaveLength(2);
    expect(state.selectedCells).toEqual([
      { rowId: 'row-1', field: 'phage_isolation_sample' },
      { rowId: 'row-1', field: 'study_type' },
    ]);
    expect(state.focusedCell).toEqual({ rowId: 'row-1', field: 'study_type' });
  });
});
