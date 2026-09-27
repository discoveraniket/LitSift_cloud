import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ArticleReaderView } from '../components/pdf-viewer/ArticleReaderView';
import { CentralViewerPanel } from '../components/pdf-viewer/CentralViewerPanel';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';
import * as doiService from '../services/doiService';
import { PaperDocumentInfo } from '../types/paper';

// Mock child heavy components to isolate fast DOM tests
vi.mock('../components/pdf-viewer/PdfReader', () => ({
  PdfReader: () => <div data-testid="mock-pdf-reader">Mock PDF Reader</div>,
}));
vi.mock('../components/data-grid/AgGridWrapper', () => ({
  AgGridWrapper: () => <div data-testid="mock-ag-grid">Mock Grid</div>,
}));
vi.mock('../components/workspace/WorkspaceHubView', () => ({
  WorkspaceHubView: () => <div data-testid="mock-hub">Mock Hub</div>,
}));
vi.mock('../components/workspace/PaperDiscoveryView', () => ({
  PaperDiscoveryView: () => <div data-testid="mock-discovery">Mock Discovery</div>,
}));

describe('ArticleReaderView & CentralViewerPanel Merged Section Toolbar', () => {
  const samplePaper: PaperDocumentInfo = {
    id: 'paper-sample-1',
    name: 'Genomic Characterization of Phages',
    title: 'Genomic Characterization of Phages',
    oaStatus: 'gold',
    sourceType: 'doi_structured',
    status: 'Ready',
    uploadedAt: Date.now(),
    abstractText: 'This study describes isolation and sequencing of therapeutic bacteriophages.',
    sections: [
      {
        id: 'sec-intro',
        title: '1. Introduction',
        content: 'Bacteriophages are viruses that specifically infect bacterial hosts.',
      },
      {
        id: 'sec-methods',
        title: '2. Materials and Methods',
        content: 'Sewage samples were collected from municipal treatment facilities.',
      },
    ],
    tables: [
      {
        id: 'tbl-1',
        caption: 'Host range of isolated phages',
        headers: ['Phage ID', 'Host Species'],
        rows: [['Phage-1', 'Proteus mirabilis']],
      },
    ],
  };

  const hierarchicalPaper: PaperDocumentInfo = {
    id: 'paper-hierarchical',
    name: 'Pseudomonas Phage Study',
    title: 'Pseudomonas Phage Study',
    oaStatus: 'gold',
    sourceType: 'doi_structured',
    status: 'Ready',
    uploadedAt: Date.now(),
    abstractText: 'Abstract content here.',
    sections: [
      {
        id: 'sec-res-1',
        title: 'RESULTS > Isolated phage AM.P2 morphology',
        content: 'Morphology observations.',
      },
      {
        id: 'sec-res-2',
        title: 'RESULTS > AM.P2 genome analysis',
        content: 'Genome sequencing results.',
      },
      {
        id: 'sec-meth-1',
        title: 'MATERIALS AND METHODS > Bacterial strains',
        content: 'Strain descriptions.',
      },
      {
        id: 'sec-meth-2',
        title: 'MATERIALS AND METHODS > Phage propagation',
        content: 'Propagation protocol.',
      },
      {
        id: 'sec-disc',
        title: 'DISCUSSION',
        content: 'General discussion.',
      },
    ],
    tables: [
      {
        id: 'tbl-1',
        caption: 'Table 1',
        headers: ['A', 'B'],
        rows: [['1', '2']],
      },
    ],
    figures: [
      {
        id: 'fig-1',
        caption: 'Figure 1: Electron micrograph',
        url: 'https://example.com/fig1.jpg',
      },
    ],
  };

  it('renders Document Outline with all sections and calls onActiveSectionChange', () => {
    const handleActiveSectionChange = vi.fn();
    render(
      <ArticleReaderView
        paper={samplePaper}
        onActiveSectionChange={handleActiveSectionChange}
      />
    );

    expect(screen.getByText('Document Outline')).toBeInTheDocument();
    expect(screen.getByText('4 sections')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abstract/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\. Introduction/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\. Materials and Methods/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tables & Datasets \(1\)/i })).toBeInTheDocument();

    // Clicking outline button triggers active section update
    const methodsBtn = screen.getByRole('button', { name: /2\. Materials and Methods/i });
    fireEvent.click(methodsBtn);
    expect(handleActiveSectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sec-methods',
        title: '2. Materials and Methods',
        index: 2,
        total: 4,
      })
    );
  });

  it('renders hierarchical section groups with parent headers and clean child titles', () => {
    render(<ArticleReaderView paper={hierarchicalPaper} />);

    // Parent group headers and standalone items
    expect(screen.getByText('RESULTS')).toBeInTheDocument();
    expect(screen.getByText('MATERIALS AND METHODS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /DISCUSSION/i })).toBeInTheDocument();

    // Child subsections rendered without the redundant parent prefix
    expect(screen.getByRole('button', { name: /Isolated phage AM\.P2 morphology/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AM\.P2 genome analysis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bacterial strains/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Phage propagation/i })).toBeInTheDocument();
  });

  it('filters outline items in real-time using search filter input', () => {
    render(<ArticleReaderView paper={hierarchicalPaper} />);

    const filterInput = screen.getByPlaceholderText('Filter outline...');
    fireEvent.change(filterInput, { target: { value: 'genome' } });

    // Matching section is displayed
    expect(screen.getByRole('button', { name: /AM\.P2 genome analysis/i })).toBeInTheDocument();
    // Non-matching sections are filtered out
    expect(screen.queryByRole('button', { name: /Bacterial strains/i })).not.toBeInTheDocument();
  });

  it('supports collapsing outline and expanding via floating button', () => {
    render(<ArticleReaderView paper={samplePaper} />);

    // Collapse outline
    const collapseBtn = screen.getByTitle('Collapse Document Outline');
    fireEvent.click(collapseBtn);

    // Outline nav is hidden, floating reopen button is visible
    expect(screen.queryByPlaceholderText('Filter outline...')).not.toBeInTheDocument();
    const expandBtn = screen.getByTitle('Expand Document Outline');
    expect(expandBtn).toBeInTheDocument();

    // Click expand button to restore outline
    fireEvent.click(expandBtn);
    expect(screen.getByPlaceholderText('Filter outline...')).toBeInTheDocument();
  });

  it('renders floating toolbar with view mode switcher and find search box in CentralViewerPanel', () => {
    usePdfStore.setState({
      pdfs: [samplePaper],
      activePdfId: samplePaper.id,
    });

    render(
      <CentralViewerPanel
        activeTab={{
          id: `pdf-${samplePaper.id}`,
          type: 'pdf',
          title: samplePaper.name,
          pdfId: samplePaper.id,
        }}
        activePdfId={samplePaper.id}
        activePdfTitle={samplePaper.name}
      />
    );

    // Floating toolbar elements
    expect(screen.getByRole('button', { name: /Reader/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Find in article...')).toBeInTheDocument();
  });

  it('renders Re-fetch Article button in ArticleReaderView', () => {
    render(
      <ArticleReaderView
        paper={{
          ...samplePaper,
          doi: '10.1038/s41467-020-17849-0',
        }}
      />
    );

    const refetchBtn = screen.getByRole('button', { name: /Re-fetch Article/i });
    expect(refetchBtn).toBeInTheDocument();

    const quickRefreshBtn = screen.getByRole('button', { name: /Refresh/i });
    expect(quickRefreshBtn).toBeInTheDocument();
  });

  it('renders minimal database text source badge in article header', () => {
    // 1. Europe PMC structured paper
    const { rerender } = render(
      <ArticleReaderView
        paper={{
          ...samplePaper,
          pmcid: 'PMC7095448',
          textSource: 'Europe PMC (JATS XML)',
        }}
      />
    );

    expect(screen.getByText('Europe PMC')).toBeInTheDocument();

    // 2. OpenAlex abstract-only paper
    rerender(
      <ArticleReaderView
        paper={{
          id: 'paper-oa',
          name: 'OpenAlex Paper',
          title: 'OpenAlex Paper Title',
          status: 'Ready',
          uploadedAt: 1000,
          oaStatus: 'gold',
          sourceType: 'doi_abstract_only',
          doi: '10.1016/j.test.2025.01',
          abstractText: 'Sample abstract text here.',
        }}
      />
    );

    expect(screen.getByText('OpenAlex')).toBeInTheDocument();
  });

  it('re-fetches article for PDF uploaded with PMID filename and prompts user to rename entry when accepted', async () => {
    const pdfPaper: PaperDocumentInfo = {
      id: 'pdf-pmid-upload',
      name: '36374021.pdf',
      title: '36374021.pdf',
      status: 'Ready',
      uploadedAt: Date.now(),
      oaStatus: 'unknown',
      sourceType: 'pdf_upload',
      url: 'blob:http://localhost/test-blob',
      file: new Blob(['%PDF-1.4 test binary'], { type: 'application/pdf' }),
    };

    usePdfStore.setState({
      pdfs: [pdfPaper],
      activePdfId: pdfPaper.id,
    });

    useGridStore.setState({
      columns: [
        { field: 'pdfTitle', headerName: 'Document', editable: false },
        { field: 'keyFindings', headerName: 'Key Findings', editable: true },
      ],
      rows: [
        {
          id: 'row-1',
          pdfId: pdfPaper.id,
          pdfTitle: '36374021.pdf',
          keyFindings: 'Initial extraction before re-fetch',
          aiStatus: 'Confirmed',
        },
      ],
    });

    // Mock resolveIdentifierToDoi
    vi.spyOn(doiService, 'resolveIdentifierToDoi').mockResolvedValue('10.1038/s41598-022-23961-4');

    // Mock resolvePaperByDoi
    vi.spyOn(doiService, 'resolvePaperByDoi').mockResolvedValue({
      id: 'doi-10_1038_s41598-022-23961-4',
      doi: '10.1038/s41598-022-23961-4',
      pmcid: 'PMC9657158',
      title: 'Characterization of novel bacteriophage vB_EcoM_fRPOT1',
      name: 'Characterization of novel bacteriophage vB_EcoM_fRPOT1',
      authors: [{ name: 'Dr. Smith', institution: 'Oxford', isCorresponding: true, email: 'smith@ox.ac.uk' }],
      sections: [{ id: 'sec-1', title: '1. Introduction', content: 'Intro text' }],
      tables: [],
      figures: [],
      sourceType: 'doi_structured',
      status: 'Ready',
      oaStatus: 'gold',
      uploadedAt: Date.now(),
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ArticleReaderView paper={pdfPaper} />);

    const refetchBtn = screen.getByRole('button', { name: /Re-fetch Article/i });
    fireEvent.click(refetchBtn);

    // Wait for async re-fetch and rename confirmation
    await vi.waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('Academic registry resolved the official title')
      );
    });

    // Verify paper in usePdfStore was renamed to official title while preserving PDF upload sourceType
    const updatedPdf = usePdfStore.getState().getPdf(pdfPaper.id);
    expect(updatedPdf?.name).toBe('Characterization of novel bacteriophage vB_EcoM_fRPOT1');
    expect(updatedPdf?.doi).toBe('10.1038/s41598-022-23961-4');
    expect(updatedPdf?.sourceType).toBe('pdf_upload'); // Preserved binary PDF!

    // Verify matching row in useGridStore had its pdfTitle updated to official title
    const updatedRow = useGridStore.getState().rows.find((r) => r.id === 'row-1');
    expect(updatedRow?.pdfTitle).toBe('Characterization of novel bacteriophage vB_EcoM_fRPOT1');
  });

  it('preserves original entry name when user declines rename prompt', async () => {
    const pdfPaper: PaperDocumentInfo = {
      id: 'pdf-decline-rename',
      name: '36374021.pdf',
      title: '36374021.pdf',
      status: 'Ready',
      uploadedAt: Date.now(),
      oaStatus: 'unknown',
      sourceType: 'pdf_upload',
    };

    usePdfStore.setState({
      pdfs: [pdfPaper],
      activePdfId: pdfPaper.id,
    });

    useGridStore.setState({
      columns: [{ field: 'pdfTitle', headerName: 'Document', editable: false }],
      rows: [{ id: 'row-2', pdfId: pdfPaper.id, pdfTitle: '36374021.pdf', aiStatus: 'Confirmed' }],
    });

    vi.spyOn(doiService, 'resolveIdentifierToDoi').mockResolvedValue('10.1038/s41598-022-23961-4');
    vi.spyOn(doiService, 'resolvePaperByDoi').mockResolvedValue({
      id: 'doi-10_1038_s41598-022-23961-4',
      doi: '10.1038/s41598-022-23961-4',
      title: 'Official Academic Title Here',
      name: 'Official Academic Title Here',
      authors: [],
      sections: [{ id: 'sec-1', title: 'Intro', content: 'Content' }],
      tables: [],
      figures: [],
      sourceType: 'doi_structured',
      status: 'Ready',
      oaStatus: 'gold',
      uploadedAt: Date.now(),
    });

    // User clicks Cancel on confirmation dialog
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<ArticleReaderView paper={pdfPaper} />);

    const refetchBtn = screen.getByRole('button', { name: /Re-fetch Article/i });
    fireEvent.click(refetchBtn);

    await vi.waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
    });

    // Verify paper name is NOT renamed, but metadata is enriched
    const paperInStore = usePdfStore.getState().getPdf(pdfPaper.id);
    expect(paperInStore?.name).toBe('36374021.pdf');
    expect(paperInStore?.doi).toBe('10.1038/s41598-022-23961-4');

    // Verify grid row title remains unchanged
    const rowInStore = useGridStore.getState().rows.find((r) => r.id === 'row-2');
    expect(rowInStore?.pdfTitle).toBe('36374021.pdf');
  });

  it('re-fetches article by discovering DOI from linked Data Grid row', async () => {
    const unassociatedPaper: PaperDocumentInfo = {
      id: 'paper-no-doi',
      name: 'custom_experiment.pdf',
      title: 'custom_experiment.pdf',
      status: 'Ready',
      uploadedAt: Date.now(),
      oaStatus: 'unknown',
      sourceType: 'pdf_upload',
    };

    usePdfStore.setState({
      pdfs: [unassociatedPaper],
      activePdfId: unassociatedPaper.id,
    });

    // Data grid row has DOI in a DOI column
    useGridStore.setState({
      columns: [
        { field: 'pdfTitle', headerName: 'Document', editable: false },
        { field: 'articleDoi', headerName: 'Article DOI', editable: true },
      ],
      rows: [
        {
          id: 'row-doi-1',
          pdfId: unassociatedPaper.id,
          pdfTitle: 'custom_experiment.pdf',
          articleDoi: '10.1016/j.cell.2020.08.020',
          aiStatus: 'Confirmed',
        },
      ],
    });

    const resolveSpy = vi.spyOn(doiService, 'resolvePaperByDoi').mockResolvedValue({
      id: 'doi-10_1016_j_cell_2020_08_020',
      doi: '10.1016/j.cell.2020.08.020',
      title: 'Discovered Paper Title',
      name: 'Discovered Paper Title',
      authors: [],
      sections: [],
      tables: [],
      figures: [],
      sourceType: 'doi_abstract_only',
      status: 'Ready',
      oaStatus: 'gold',
      uploadedAt: Date.now(),
    });

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<ArticleReaderView paper={unassociatedPaper} />);

    const refetchBtn = screen.getByRole('button', { name: /Re-fetch Article/i });
    fireEvent.click(refetchBtn);

    await vi.waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith('10.1016/j.cell.2020.08.020', expect.any(Function));
    });
  });
});
