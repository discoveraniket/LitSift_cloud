import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ArticleReaderView } from '../components/pdf-viewer/ArticleReaderView';
import { CentralViewerPanel } from '../components/pdf-viewer/CentralViewerPanel';
import { usePdfStore } from '../store/usePdfStore';
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

    // Parent group headers
    expect(screen.getByText('RESULTS')).toBeInTheDocument();
    expect(screen.getByText('MATERIALS AND METHODS')).toBeInTheDocument();
    expect(screen.getByText('DISCUSSION')).toBeInTheDocument();

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
});
