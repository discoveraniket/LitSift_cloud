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

  it('runs pre-flight validation to catch missing prompt, API key, PDF document, and schema', async () => {
    const { validateAgentPrerequisites } = await import('../services/geminiService');

    // 1. Empty prompt check
    const emptyPromptRes = await validateAgentPrerequisites('   ');
    expect(emptyPromptRes.valid).toBe(false);
    expect(emptyPromptRes.error).toContain('Please enter a prompt');

    // 2. Missing API key check (when API key is unset)
    const originalEnvKey = process.env.GEMINI_API_KEY;
    const originalLocalKey = localStorage.getItem('LITSIFT_GEMINI_API_KEY');
    delete process.env.GEMINI_API_KEY;
    localStorage.removeItem('LITSIFT_GEMINI_API_KEY');

    const noKeyRes = await validateAgentPrerequisites('Extract phage burst size');
    expect(noKeyRes.valid).toBe(false);
    expect(noKeyRes.error).toContain('GEMINI_API_KEY is not configured');

    // Restore key for remaining checks
    if (originalEnvKey) process.env.GEMINI_API_KEY = originalEnvKey;
    else process.env.GEMINI_API_KEY = 'test-dummy-api-key';
    if (originalLocalKey) localStorage.setItem('LITSIFT_GEMINI_API_KEY', originalLocalKey);

    // 3. Missing research paper PDF check
    const { usePdfStore } = await import('../store/usePdfStore');
    usePdfStore.setState({ pdfs: [], activePdfId: '' });
    const noPdfRes = await validateAgentPrerequisites('Extract phage genome and burst size from paper');
    expect(noPdfRes.valid).toBe(false);
    expect(noPdfRes.error).toContain('No Research Paper PDF Loaded');

    // 4. Missing schema columns check
    useGridStore.setState({ columns: [] });
    usePdfStore.setState({
      pdfs: [
        {
          id: 'pdf-test-1',
          name: 'Phage_Study.pdf',
          url: 'blob:http://localhost/test',
          status: 'Ready',
          file: new File(['mock content'], 'Phage_Study.pdf', { type: 'application/pdf' }),
          oaStatus: 'unknown',
          sourceType: 'pdf_upload',
          uploadedAt: Date.now(),
        },
      ],
      activePdfId: 'pdf-test-1',
    });
    const noSchemaRes = await validateAgentPrerequisites('Extract table data from paper');
    expect(noSchemaRes.valid).toBe(false);
    expect(noSchemaRes.error).toContain('No Schema Columns Defined');

    // Clean up
    if (originalEnvKey) process.env.GEMINI_API_KEY = originalEnvKey;
    if (originalLocalKey) localStorage.setItem('LITSIFT_GEMINI_API_KEY', originalLocalKey);
  });

  it('stores and tracks thought reasoning traces and thinking tokens in AgentMessage', () => {
    const testThought = 'Deliberating table schema and finding relevant paper passages...';
    const testTokens = 840;

    useAgentStore.setState({
      messages: [
        {
          id: 'msg-agent-1',
          sender: 'agent',
          text: 'Extracted phage findings successfully.',
          thought: testThought,
          thinkingTokens: testTokens,
          timestamp: '10:00 AM',
          executionTime: 2.4,
        },
      ],
    });

    const messages = useAgentStore.getState().messages;
    expect(messages.length).toBe(1);
    expect(messages[0].thought).toBe(testThought);
    expect(messages[0].thinkingTokens).toBe(840);
    expect(messages[0].executionTime).toBe(2.4);
  });
});
