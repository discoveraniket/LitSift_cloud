import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
    INTEGER: 'INTEGER',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
  },
}));

import { LeftExplorerPanel } from '../components/explorer/LeftExplorerPanel';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';
import { PaperDocumentInfo } from '../types/paper';

describe('LeftExplorerPanel Three-Tier (Pending, Done, Review) Sorting Suite', () => {
  const paperA: PaperDocumentInfo = {
    id: 'paper-a',
    name: 'Zeta Phage against Klebsiella',
    title: 'Zeta Phage against Klebsiella',
    status: 'Ready',
    oaStatus: 'gold',
    sourceType: 'doi_structured',
    uploadedAt: 1000,
  };

  const paperB: PaperDocumentInfo = {
    id: 'paper-b',
    name: 'Alpha Phage against Pseudomonas aeruginosa',
    title: 'Alpha Phage against Pseudomonas aeruginosa',
    status: 'Ready',
    oaStatus: 'gold',
    sourceType: 'doi_structured',
    uploadedAt: 2000,
  };

  const paperC: PaperDocumentInfo = {
    id: 'paper-c',
    name: 'Beta Phage against Staphylococcus aureus',
    title: 'Beta Phage against Staphylococcus aureus',
    status: 'Ready',
    oaStatus: 'gold',
    sourceType: 'doi_structured',
    uploadedAt: 3000,
  };

  beforeEach(() => {
    usePdfStore.setState({
      pdfs: [paperA, paperB, paperC],
      activePdfId: 'paper-a',
    });

    // Mark paperB as extracted in the data grid (so it classifies as done by default)
    useGridStore.setState({
      rows: [
        {
          id: 'row-b',
          pdfId: 'paper-b',
          pdfTitle: 'Alpha Phage against Pseudomonas aeruginosa',
          aiStatus: 'Confirmed',
        } as any,
      ],
      columns: [],
    });
  });

  it('renders three-tier sections: Pending first, Done second, Review third (collapsed by default)', () => {
    render(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Group headers
    expect(screen.getByText(/Pending \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Done \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Review \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Deleted \(0\)/i)).toBeInTheDocument();

    // Check all paper titles are present
    expect(screen.getByText('Alpha Phage against Pseudomonas aeruginosa')).toBeInTheDocument();
    expect(screen.getByText('Beta Phage against Staphylococcus aureus')).toBeInTheDocument();
    expect(screen.getByText('Zeta Phage against Klebsiella')).toBeInTheDocument();

    // In Pending group: Beta Phage should come before Zeta Phage (Alphabetical A-Z)
    const betaEl = screen.getByText('Beta Phage against Staphylococcus aureus');
    const zetaEl = screen.getByText('Zeta Phage against Klebsiella');
    const alphaEl = screen.getByText('Alpha Phage against Pseudomonas aeruginosa');

    // betaEl appears before zetaEl in the document
    expect(betaEl.compareDocumentPosition(zetaEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Done paper (Alpha) appears after pending papers (Zeta)
    expect(zetaEl.compareDocumentPosition(alphaEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('toggles Review section expansion when clicking the Review header', async () => {
    // Put paperC into review
    usePdfStore.setState({
      pdfs: [
        paperA,
        paperB,
        { ...paperC, processingStatus: 'review' },
      ],
    });

    render(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Review is collapsed by default, so paperC is not rendered in the DOM yet
    expect(screen.getByText(/Review \(1\)/i)).toBeInTheDocument();
    expect(screen.queryByText('Beta Phage against Staphylococcus aureus')).not.toBeInTheDocument();

    // Click Review header to expand
    const reviewHeader = screen.getByText(/Review \(1\)/i);
    await act(async () => {
      fireEvent.click(reviewHeader);
    });

    // Now paperC is visible
    expect(screen.getByText('Beta Phage against Staphylococcus aureus')).toBeInTheDocument();
  });

  it('highlights currently active paper with OPEN badge and previous paper with LAST badge upon switching', () => {
    const handleSelectPdf = vi.fn();
    const { rerender } = render(
      <LeftExplorerPanel
        onSelectPdf={handleSelectPdf}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Initial active paper is paperA (Zeta)
    expect(screen.getByText('OPEN')).toBeInTheDocument();

    // Switch active paper to paperB (Alpha)
    usePdfStore.setState({ activePdfId: 'paper-b' });
    rerender(
      <LeftExplorerPanel
        onSelectPdf={handleSelectPdf}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Now paperB has OPEN and previous paperA has LAST badge
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.getByText('LAST')).toBeInTheDocument();
  });

  it('allows marking all papers as Done or Pending via UI buttons', async () => {
    const { rerender } = render(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Initial state: Pending (2), Done (1)
    expect(screen.getByText(/Pending \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Done \(1\)/i)).toBeInTheDocument();

    // Click "Mark All Done"
    const markAllDoneBtn = screen.getByTitle(/Mark all pending papers as Done/i);
    await act(async () => {
      markAllDoneBtn.click();
    });

    rerender(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // All 3 papers should now be in Done (3), and Pending should be 0
    expect(screen.getByText(/Pending \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Done \(3\)/i)).toBeInTheDocument();

    // Click "Mark All Pending"
    const markAllPendingBtn = screen.getByTitle(/Mark all done papers as Pending/i);
    await act(async () => {
      markAllPendingBtn.click();
    });

    rerender(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // All 3 papers should now be in Pending (3), and Done should be 0
    expect(screen.getByText(/Pending \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Done \(0\)/i)).toBeInTheDocument();
  });

  it('supports drag and drop to move papers between Pending, Done, and Review', async () => {
    const { rerender } = render(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Initial state: paperA (Zeta) is in Pending
    expect(usePdfStore.getState().pdfs.find((p) => p.id === 'paper-a')?.processingStatus).toBeUndefined();

    // Move paper-a to done
    await act(async () => {
      await usePdfStore.getState().setPaperProcessingStatus('paper-a', 'done');
    });

    rerender(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Now paperA and paperB are Done (2), and only paperC is Pending (1)
    expect(screen.getByText(/Pending \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Done \(2\)/i)).toBeInTheDocument();

    // Move paper-b to review
    await act(async () => {
      await usePdfStore.getState().setPaperProcessingStatus('paper-b', 'review');
    });

    rerender(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Now paperA is Done (1), paperC is Pending (1), and paperB is in Review (1)
    expect(screen.getByText(/Pending \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Done \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Review \(1\)/i)).toBeInTheDocument();
  });
});
