import { describe, it, expect, beforeEach } from 'vitest';
import { useGridStore } from '../store/useGridStore';
import { useAgentStore } from '../store/useAgentStore';
import { agentToolsRegistry } from '../services/agentToolRegistry';

describe('Agent Multi-Step Execution Store & Tools', () => {
  beforeEach(() => {
    useGridStore.setState({
      columns: [
        { field: 'methodology', headerName: 'Methodology', editable: true },
        { field: 'hostRange', headerName: 'Host Range', editable: true },
      ],
      rows: [
        {
          id: 'row-test-1',
          pdfId: 'pdf-1',
          pdfTitle: 'Sample Phage Paper',
          methodology: 'Bacterial culture',
          hostRange: 'Unknown',
          aiStatus: 'Confirmed',
        },
      ],
      focusedCell: { rowId: 'row-test-1', field: 'hostRange' },
    });

    useAgentStore.setState({
      messages: [],
      isThinking: false,
    });
  });

  it('executes sequential tool actions and updates the store', async () => {
    // Action 1: Add a new schema column
    const colRes = await agentToolsRegistry.addColumn.execute(
      { headerName: 'Phage Morphology' },
      'human_in_loop'
    );
    expect(colRes.success).toBe(true);

    const gridState = useGridStore.getState();
    expect(gridState.columns.some((c) => c.field === 'phage_morphology')).toBe(true);

    // Action 2: Update hostRange cell
    const cellRes = await agentToolsRegistry.updateCell.execute(
      {
        rowId: 'row-test-1',
        field: 'host_range',
        newValue: 'Broad spectrum against E. coli',
        reasoning: 'Table 2 lists broad lytic activity',
        pageNumber: 4,
        sectionName: 'Results',
        snippetQuote: 'Lytic activity was confirmed across 12 E. coli strains.',
      },
      'human_in_loop'
    );
    expect(cellRes.success).toBe(true);

    const updatedRow = useGridStore.getState().rows.find((r) => r.id === 'row-test-1');
    expect(updatedRow?.hostRange).toBe('Broad spectrum against E. coli');
    expect(updatedRow?.citationMap?.hostRange?.pageNumber).toBe(4);
  });

  it('handles abort / cancel interaction in useAgentStore cleanly', () => {
    const controller = new AbortController();
    useAgentStore.setState({
      isThinking: true,
      abortController: controller,
    });

    expect(useAgentStore.getState().isThinking).toBe(true);

    useAgentStore.getState().cancelInteraction();

    expect(useAgentStore.getState().isThinking).toBe(false);
    expect(useAgentStore.getState().abortController).toBeNull();
    expect(controller.signal.aborted).toBe(true);
  });

  it('dynamically reflects newly added columns in getToolsForMode declarations', async () => {
    const { getToolsForMode } = await import('../services/agentToolRegistry');

    // Initial check
    const initialTools = getToolsForMode('human_in_loop');
    const initialEnum = initialTools[0].functionDeclarations.find((d: any) => d.name === 'updateCell')?.parameters?.properties?.field?.enum;
    expect(initialEnum).toContain('methodology');
    expect(initialEnum).not.toContain('genome_size');

    // Add new column
    await agentToolsRegistry.addColumn.execute({ headerName: 'Genome Size' }, 'human_in_loop');

    // Subsequent check - must immediately include genome_size
    const updatedTools = getToolsForMode('human_in_loop');
    const updatedEnum = updatedTools[0].functionDeclarations.find((d: any) => d.name === 'updateCell')?.parameters?.properties?.field?.enum;
    expect(updatedEnum).toContain('genome_size');
  });
});
