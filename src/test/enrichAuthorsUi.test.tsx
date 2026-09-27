import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnrichAuthorsModal } from '../components/explorer/EnrichAuthorsModal';
import { LeftExplorerPanel } from '../components/explorer/LeftExplorerPanel';
import { StatusBar } from '../components/layout/StatusBar';
import { useGridStore } from '../store/useGridStore';
import * as enrichmentService from '../services/enrichmentService';

describe('Enrich Corresponding Authors UI Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useGridStore.setState({
      columns: [
        { field: 'finding', headerName: 'Scientific Finding', editable: true },
        { field: 'doi', headerName: 'DOI', editable: true },
      ],
      rows: [
        {
          id: 'row-1',
          pdfId: 'p1',
          pdfTitle: 'Sample Paper',
          aiStatus: 'Confirmed',
          finding: 'High affinity binding',
          doi: '10.1038/s41467-020-17849-0',
        },
      ],
    });
  });

  it('renders EnrichAuthorsModal with detected DOIs and target columns', () => {
    const handleClose = vi.fn();

    render(<EnrichAuthorsModal isOpen={true} onClose={handleClose} />);

    expect(screen.getByText('Enrich Corresponding Authors')).toBeInTheDocument();
    expect(screen.getByText(/1 row \(2 columns\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1 unique paper/i)).toBeInTheDocument();
    expect(screen.getByText('Corresponding Author')).toBeInTheDocument();
    expect(screen.getByText('Author Email')).toBeInTheDocument();
    expect(screen.getByText('Start Enrichment')).toBeInTheDocument();
  });

  it('executes enrichment on button click and displays success confirmation', async () => {
    vi.spyOn(enrichmentService, 'enrichGridDatasetWithAuthors').mockImplementation(async (onProgress) => {
      onProgress?.({
        current: 1,
        total: 1,
        message: 'Querying registries...',
        percent: 50,
      });
      return {
        success: true,
        totalRows: 1,
        enrichedRows: 1,
        uniquePapers: 1,
        addedColumns: ['Corresponding Author', 'Author Email'],
        message: 'Successfully enriched 1 of 1 rows with corresponding author details.',
      };
    });

    render(<EnrichAuthorsModal isOpen={true} onClose={() => {}} />);

    const startBtn = screen.getByRole('button', { name: /Start Enrichment/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Successfully enriched 1 of 1 rows with corresponding author details.')
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Your live data grid was updated in place/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument();
  });

  it('triggers onOpenEnrichAuthors from LeftExplorerPanel CSV section', () => {
    const onOpenEnrichAuthors = vi.fn();

    render(
      <LeftExplorerPanel
        activeSidebarView="workspace"
        onSelectPdf={() => {}}
        onOpenMasterGrid={() => {}}
        onOpenEnrichAuthors={onOpenEnrichAuthors}
      />
    );

    const enrichBtn = screen.getByText('Enrich Corresponding Authors');
    expect(enrichBtn).toBeInTheDocument();
    fireEvent.click(enrichBtn);

    expect(onOpenEnrichAuthors).toHaveBeenCalledTimes(1);
  });

  it('triggers onOpenEnrichAuthors from StatusBar bottom table toolbar', () => {
    const onOpenEnrichAuthors = vi.fn();

    render(
      <StatusBar
        showBottomPanel={true}
        onOpenEnrichAuthors={onOpenEnrichAuthors}
      />
    );

    const enrichBtn = screen.getByRole('button', { name: /✉ Enrich Authors/i });
    expect(enrichBtn).toBeInTheDocument();
    fireEvent.click(enrichBtn);

    expect(onOpenEnrichAuthors).toHaveBeenCalledTimes(1);
  });
});
