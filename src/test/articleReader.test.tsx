import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ArticleReaderView } from '../components/pdf-viewer/ArticleReaderView';
import { CentralViewerPanel } from '../components/pdf-viewer/CentralViewerPanel';
import { usePdfStore } from '../store/usePdfStore';
import { PaperDocumentInfo } from '../types/paper';

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

  it('renders merged section indicator in CentralViewerPanel floating toolbar', () => {
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

    // Merged section pill in top toolbar
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(screen.getByTitle('Next Section')).toBeInTheDocument();
    expect(screen.getByTitle('Previous Section')).toBeInTheDocument();
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
