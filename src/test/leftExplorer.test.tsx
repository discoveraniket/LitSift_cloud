import { render, screen, fireEvent } from '@testing-library/react';
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

describe('LeftExplorerPanel Minimal Multiline & Two-Tier Sorting Suite', () => {
  const paperA: PaperDocumentInfo = {
    id: 'paper-a',
    name: 'Zeta Phage against Klebsiella',
    title: 'Zeta Phage against Klebsiella',
    status: 'Ready',
    uploadedAt: 1000,
  };

  const paperB: PaperDocumentInfo = {
    id: 'paper-b',
    name: 'Alpha Phage against Pseudomonas aeruginosa',
    title: 'Alpha Phage against Pseudomonas aeruginosa',
    status: 'Ready',
    uploadedAt: 2000,
  };

  const paperC: PaperDocumentInfo = {
    id: 'paper-c',
    name: 'Beta Phage against Staphylococcus aureus',
    title: 'Beta Phage against Staphylococcus aureus',
    status: 'Ready',
    uploadedAt: 3000,
  };

  beforeEach(() => {
    usePdfStore.setState({
      pdfs: [paperA, paperB, paperC],
      activePdfId: 'paper-a',
    });

    // Mark paperB as extracted in the data grid
    useGridStore.setState({
      rows: [
        {
          id: 'row-1',
          pdfId: 'paper-b',
          pdfTitle: paperB.title,
          data: { Host: 'Pseudomonas' },
        },
      ],
      columns: [{ id: 'col-1', name: 'Host', type: 'text' }],
    });
  });

  it('renders two-tier alphabetically sorted sections: Pending first, Extracted second', () => {
    const handleSelectPdf = vi.fn();
    render(
      <LeftExplorerPanel
        onSelectPdf={handleSelectPdf}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Group headers
    expect(screen.getByText(/Pending \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Extracted \(1\)/i)).toBeInTheDocument();

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

    // Extracted paper (Alpha) appears after pending papers (Zeta)
    expect(zetaEl.compareDocumentPosition(alphaEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
});
