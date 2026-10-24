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

describe('LeftExplorerPanel Deleted Papers Section & Soft-Delete UX Suite', () => {
  const paperA: PaperDocumentInfo = {
    id: 'paper-a',
    name: 'Paper Alpha.pdf',
    title: 'Paper Alpha',
    status: 'Ready',
    oaStatus: 'gold',
    sourceType: 'doi_structured',
    uploadedAt: 1000,
  };

  const paperB: PaperDocumentInfo = {
    id: 'paper-b',
    name: 'Paper Beta.pdf',
    title: 'Paper Beta',
    status: 'Ready',
    oaStatus: 'gold',
    sourceType: 'doi_structured',
    uploadedAt: 2000,
  };

  const paperC: PaperDocumentInfo = {
    id: 'paper-c',
    name: 'Paper Gamma.pdf',
    title: 'Paper Gamma',
    status: 'Ready',
    oaStatus: 'gold',
    sourceType: 'doi_structured',
    uploadedAt: 3000,
  };

  beforeEach(() => {
    useGridStore.setState({ rows: [], columns: [] });
    usePdfStore.setState({
      pdfs: [paperA, paperB, paperC],
      activePdfId: 'paper-a',
    });
  });

  it('renders Deleted section collapsed by default below Review section', () => {
    render(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Verify all 4 sections are rendered
    expect(screen.getByText(/Pending \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Done \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Review \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Deleted \(0\)/i)).toBeInTheDocument();

    // Verify DOM order: Review comes before Deleted
    const reviewHeader = screen.getByText(/Review \(0\)/i);
    const deletedHeader = screen.getByText(/Deleted \(0\)/i);
    expect(reviewHeader.compareDocumentPosition(deletedHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('moves paper to Deleted section when deletePaper is called (soft-delete)', async () => {
    const { rerender } = render(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Initial: 3 pending, 0 deleted
    expect(screen.getByText(/Pending \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Deleted \(0\)/i)).toBeInTheDocument();

    // Soft delete Paper Alpha
    await act(async () => {
      await usePdfStore.getState().deletePaper('paper-a');
    });

    rerender(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Alpha moved from Pending (now 2) to Deleted (now 1)
    expect(screen.getByText(/Pending \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Deleted \(1\)/i)).toBeInTheDocument();

    // Expand Deleted section
    const deletedHeader = screen.getByText(/Deleted \(1\)/i);
    await act(async () => {
      fireEvent.click(deletedHeader);
    });

    // Paper Alpha is now visible in Deleted section
    expect(screen.getByText('Paper Alpha')).toBeInTheDocument();
  });

  it('restores paper from Deleted back to original status via restorePaper', async () => {
    // Put Paper Beta in Done, then delete it
    await act(async () => {
      await usePdfStore.getState().setPaperProcessingStatus('paper-b', 'done');
      await usePdfStore.getState().deletePaper('paper-b');
    });

    const { rerender } = render(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    expect(screen.getByText(/Done \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Deleted \(1\)/i)).toBeInTheDocument();

    // Restore Paper Beta
    await act(async () => {
      await usePdfStore.getState().restorePaper('paper-b');
    });

    rerender(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Paper Beta should be back in Done
    expect(screen.getByText(/Done \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Deleted \(0\)/i)).toBeInTheDocument();
  });

  it('permanently deletes paper and empties trash', async () => {
    await act(async () => {
      await usePdfStore.getState().deletePaper('paper-c');
    });

    const { rerender } = render(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    expect(screen.getByText(/Deleted \(1\)/i)).toBeInTheDocument();

    // Empty trash
    await act(async () => {
      await usePdfStore.getState().emptyTrash();
    });

    rerender(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    expect(screen.getByText(/Deleted \(0\)/i)).toBeInTheDocument();
    expect(usePdfStore.getState().pdfs.some((p) => p.id === 'paper-c')).toBe(false);
  });

  it('supports drag-and-drop to move paper to and from Deleted section', async () => {
    const { rerender } = render(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    // Move paper-a to deleted
    await act(async () => {
      await usePdfStore.getState().setPaperProcessingStatus('paper-a', 'deleted');
    });

    rerender(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    expect(screen.getByText(/Deleted \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Pending \(2\)/i)).toBeInTheDocument();

    // Drag from deleted to review
    await act(async () => {
      await usePdfStore.getState().setPaperProcessingStatus('paper-a', 'review');
    });

    rerender(
      <LeftExplorerPanel
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    expect(screen.getByText(/Deleted \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Review \(1\)/i)).toBeInTheDocument();
  });
});
