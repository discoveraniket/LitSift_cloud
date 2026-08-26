import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LeftExplorerPanel } from '../components/explorer/LeftExplorerPanel';
import { ActivityBar } from '../components/layout/ActivityBar';
import { AboutModal } from '../components/layout/AboutModal';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';

describe('VS Code-style Left Panel & Activity Bar UX', () => {
  it('renders ActivityBar with Explorer, Workspace, Debug buttons and About button', () => {
    const handleSelectSidebarView = vi.fn();
    const handleToggleZen = vi.fn();
    const handleOpenSettings = vi.fn();
    const handleOpenAbout = vi.fn();

    render(
      <ActivityBar
        showLeftPanel={true}
        activeSidebarView="explorer"
        onSelectSidebarView={handleSelectSidebarView}
        onToggleZenMode={handleToggleZen}
        onOpenSettings={handleOpenSettings}
        onOpenAbout={handleOpenAbout}
      />
    );

    // Explorer icon
    const explorerBtn = screen.getByTitle('Explorer (Research Papers & Views)');
    expect(explorerBtn).toBeInTheDocument();
    fireEvent.click(explorerBtn);
    expect(handleSelectSidebarView).toHaveBeenCalledWith('explorer');

    // Workspace icon
    const workspaceBtn = screen.getByTitle(/Workspace & Project State/i);
    expect(workspaceBtn).toBeInTheDocument();
    fireEvent.click(workspaceBtn);
    expect(handleSelectSidebarView).toHaveBeenCalledWith('workspace');

    // Debug icon
    const debugBtn = screen.getByTitle(/Agent Debug & Telemetry Logs/i);
    expect(debugBtn).toBeInTheDocument();
    fireEvent.click(debugBtn);
    expect(handleSelectSidebarView).toHaveBeenCalledWith('debug');

    // About button
    const aboutBtn = screen.getByTitle('About LitSift Cloud (Architecture & Shortcuts)');
    expect(aboutBtn).toBeInTheDocument();
    fireEvent.click(aboutBtn);
    expect(handleOpenAbout).toHaveBeenCalledTimes(1);
  });

  it('renders Explorer mode with RESEARCH PAPERS at top and VIEWS at bottom', () => {
    const onSelectPdf = vi.fn();
    const onOpenMasterGrid = vi.fn();

    render(
      <LeftExplorerPanel
        activeSidebarView="explorer"
        onSelectPdf={onSelectPdf}
        onOpenMasterGrid={onOpenMasterGrid}
      />
    );

    expect(screen.getByText('Explorer')).toBeInTheDocument();
    expect(screen.getByText(/RESEARCH PAPERS/i)).toBeInTheDocument();
    expect(screen.getByText(/VIEWS/i)).toBeInTheDocument();
    expect(screen.getByText(/Master Extraction Grid/i)).toBeInTheDocument();
  });

  it('shows single extraction status indicator for extracted vs pending papers without document icon', async () => {
    // Add a test PDF paper
    usePdfStore.setState({
      pdfs: [
        {
          id: 'test-paper-1',
          name: 'Quantum_Computing_2026.pdf',
          title: 'Quantum Computing Frontiers 2026',
          journal: 'Nature Physics',
          year: '2026',
        } as any,
      ],
    });

    // Case 1: Not extracted yet -> Pending indicator
    useGridStore.setState({ rows: [] });

    const { rerender } = render(
      <LeftExplorerPanel
        activeSidebarView="explorer"
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    expect(screen.getByTitle('Extraction Pending / Not started')).toBeInTheDocument();
    expect(screen.getByText('Quantum Computing Frontiers 2026')).toBeInTheDocument();

    // Case 2: Extraction completed with 1 row -> Extracted indicator
    useGridStore.setState({
      rows: [
        {
          id: 'row-1',
          pdfId: 'test-paper-1',
          pdfTitle: 'Quantum_Computing_2026.pdf',
          aiStatus: 'Confirmed',
        } as any,
      ],
    });

    rerender(
      <LeftExplorerPanel
        activeSidebarView="explorer"
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    expect(screen.getByTitle('Extraction Complete (1 row in Data Grid)')).toBeInTheDocument();
  });

  it('renders Workspace view mode with project snapshot metrics and CSV datasets', () => {
    usePdfStore.setState({
      pdfs: [{ id: 'p1', name: 'Paper1.pdf' } as any],
    });
    useGridStore.setState({
      rows: [{ id: 'r1', pdfId: 'p1', pdfTitle: 'Paper1.pdf', aiStatus: 'Confirmed' } as any],
    });

    render(
      <LeftExplorerPanel
        activeSidebarView="workspace"
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('PROJECT SNAPSHOT')).toBeInTheDocument();
    expect(screen.getByText('Papers Loaded')).toBeInTheDocument();
    expect(screen.getByText('Extracted Rows')).toBeInTheDocument();
    expect(screen.getByText('Export State (.litsift)')).toBeInTheDocument();
    expect(screen.getByText('Import State (.litsift)')).toBeInTheDocument();
    expect(screen.getByText('CSV DATASETS')).toBeInTheDocument();
    expect(screen.getByText('Import CSV Dataset')).toBeInTheDocument();
    expect(screen.getByText('Export CSV Dataset')).toBeInTheDocument();
  });

  it('sorts pending papers to top (newest first) and extracted papers to bottom (oldest at bottom)', () => {
    usePdfStore.setState({
      pdfs: [
        { id: 'p1', name: 'Paper_Old_Extracted.pdf', uploadedAt: 1000 } as any,
        { id: 'p2', name: 'Paper_New_Extracted.pdf', uploadedAt: 2000 } as any,
        { id: 'p3', name: 'Paper_Old_Pending.pdf', uploadedAt: 3000 } as any,
        { id: 'p4', name: 'Paper_New_Pending.pdf', uploadedAt: 4000 } as any,
      ],
    });

    // Mark p1 and p2 as extracted
    useGridStore.setState({
      rows: [
        { id: 'r1', pdfId: 'p1', pdfTitle: 'Paper_Old_Extracted.pdf' } as any,
        { id: 'r2', pdfId: 'p2', pdfTitle: 'Paper_New_Extracted.pdf' } as any,
      ],
    });

    render(
      <LeftExplorerPanel
        activeSidebarView="explorer"
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    const renderedTitles = screen.getAllByTitle(/Paper_/i).map((el) => el.getAttribute('title'));
    
    // Expected order:
    // 1. Paper_New_Pending (newest pending)
    // 2. Paper_Old_Pending (older pending)
    // 3. Paper_New_Extracted (newer extracted)
    // 4. Paper_Old_Extracted (oldest extracted at the very bottom)
    expect(renderedTitles).toEqual([
      'Paper_New_Pending.pdf',
      'Paper_Old_Pending.pdf',
      'Paper_New_Extracted.pdf',
      'Paper_Old_Extracted.pdf',
    ]);
  });

  it('renders visual OPEN badge and active styling for the currently active paper', () => {
    usePdfStore.setState({
      pdfs: [
        { id: 'active-paper-1', name: 'Loaded_Phage_Paper.pdf', uploadedAt: 2000 } as any,
        { id: 'other-paper-2', name: 'Other_Study.pdf', uploadedAt: 1000 } as any,
      ],
      activePdfId: 'active-paper-1',
    });

    render(
      <LeftExplorerPanel
        activeSidebarView="explorer"
        onSelectPdf={vi.fn()}
        onOpenMasterGrid={vi.fn()}
      />
    );

    expect(screen.getByText('OPEN')).toBeInTheDocument();
  });

  it('renders AboutModal correctly with shortcuts and information', () => {
    const handleClose = vi.fn();
    const { rerender } = render(<AboutModal isOpen={false} onClose={handleClose} />);
    expect(screen.queryByText('LitSift Cloud')).not.toBeInTheDocument();

    rerender(<AboutModal isOpen={true} onClose={handleClose} />);
    expect(screen.getByText('LitSift Cloud')).toBeInTheDocument();
    expect(screen.getByText(/Agentic Literature Synthesis Workspace • v1.0.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Gemini 2.5 Agent/i)).toBeInTheDocument();
    expect(screen.getByText(/AG Grid Master/i)).toBeInTheDocument();
    expect(screen.getByText('Ctrl + B')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + F')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

