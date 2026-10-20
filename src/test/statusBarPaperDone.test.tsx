import { render, screen, fireEvent, act } from '@testing-library/react';
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

import { StatusBar } from '../components/layout/StatusBar';
import { LeftExplorerPanel } from '../components/explorer/LeftExplorerPanel';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';
import { PaperDocumentInfo } from '../types/paper';

describe('Bottom Toolbar (StatusBar) Paper Mark Done Suite', () => {
  const paper1: PaperDocumentInfo = {
    id: 'paper-1',
    name: 'Phage Isolation Protocol 2026.pdf',
    title: 'Phage Isolation Protocol 2026',
    status: 'Ready',
    oaStatus: 'gold',
    sourceType: 'doi_structured',
    uploadedAt: 1000,
  };

  const paper2: PaperDocumentInfo = {
    id: 'paper-2',
    name: 'Bacteriophage Characterization.pdf',
    title: 'Bacteriophage Characterization',
    status: 'Ready',
    oaStatus: 'gold',
    sourceType: 'doi_structured',
    uploadedAt: 2000,
  };

  beforeEach(() => {
    useGridStore.setState({ rows: [], columns: [] });
    usePdfStore.setState({
      pdfs: [paper1, paper2],
      activePdfId: 'paper-1',
    });
  });

  it('renders "Mark Done" in bottom toolbar when active paper is pending', () => {
    render(<StatusBar showBottomPanel={true} />);

    const markDoneBtn = screen.getByRole('button', { name: /Mark Done/i });
    expect(markDoneBtn).toBeInTheDocument();
    expect(markDoneBtn).not.toBeDisabled();
  });

  it('toggles active paper to Done and moves paper to Extracted group in Left panel', async () => {
    const { rerender } = render(
      <div>
        <LeftExplorerPanel
          activeSidebarView="explorer"
          onSelectPdf={vi.fn()}
          onOpenMasterGrid={vi.fn()}
        />
        <StatusBar showBottomPanel={true} />
      </div>
    );

    // Initial state: Both papers in Pending section
    expect(screen.getByText(/Pending \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Extracted \(0\)/i)).toBeInTheDocument();

    const markDoneBtn = screen.getByRole('button', { name: /Mark Done/i });
    expect(markDoneBtn).toBeInTheDocument();

    // Click "Mark Done" in the bottom toolbar
    await act(async () => {
      fireEvent.click(markDoneBtn);
    });

    // Rerender to reflect updated Zustand state
    rerender(
      <div>
        <LeftExplorerPanel
          activeSidebarView="explorer"
          onSelectPdf={vi.fn()}
          onOpenMasterGrid={vi.fn()}
        />
        <StatusBar showBottomPanel={true} />
      </div>
    );

    // Verify paper-1 moved to Extracted (Done) section
    expect(screen.getByText(/Pending \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Extracted \(1\)/i)).toBeInTheDocument();

    // Verify bottom toolbar button now indicates "Done"
    const doneBtn = screen.getByRole('button', { name: /^Done$/i });
    expect(doneBtn).toBeInTheDocument();

    // Click "Done" again to toggle back to Pending
    await act(async () => {
      fireEvent.click(doneBtn);
    });

    rerender(
      <div>
        <LeftExplorerPanel
          activeSidebarView="explorer"
          onSelectPdf={vi.fn()}
          onOpenMasterGrid={vi.fn()}
        />
        <StatusBar showBottomPanel={true} />
      </div>
    );

    // Verify paper-1 moved back to Pending section
    expect(screen.getByText(/Pending \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Extracted \(0\)/i)).toBeInTheDocument();
  });

  it('renders disabled Mark Done button when no active paper is selected', () => {
    usePdfStore.setState({ activePdfId: '', pdfs: [] });
    render(<StatusBar showBottomPanel={true} />);

    const markDoneBtn = screen.getByRole('button', { name: /Mark Done/i });
    expect(markDoneBtn).toBeDisabled();
  });
});
