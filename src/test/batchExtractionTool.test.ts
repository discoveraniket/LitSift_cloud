import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentToolsRegistry } from '../services/agentToolRegistry';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';
import { useAgentStore } from '../store/useAgentStore';
import * as batchExtractionRunner from '../services/batchExtractionRunner';
import * as extractionEngine from '../services/extractionEngine';

vi.mock('../services/batchExtractionRunner', () => ({
  executeBatchExtraction: vi.fn(),
}));

vi.mock('../services/extractionEngine', () => ({
  proposeSchemaFromGoal: vi.fn(),
  extractWithFixedSchema: vi.fn(),
}));

vi.mock('../services/providerConfig', async () => {
  const actual = await vi.importActual<any>('../services/providerConfig');
  return {
    ...actual,
    getActiveProvider: vi.fn(() => 'lmstudio'),
    getLmStudioModel: vi.fn(() => 'qwen-2.5-7b'),
  };
});

describe('Phase 5 Batch Extraction Tool & Dual-Scope Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGridStore.setState({
      columns: [
        { field: 'phage_name', headerName: 'Phage Name' },
        { field: 'burst_size', headerName: 'Burst Size' },
      ],
      rows: [],
    });
    usePdfStore.setState({
      pdfs: [],
      activePdfId: '',
    });
    useAgentStore.setState({
      messages: [],
      activePdfId: '',
      agentScope: 'workspace',
      activeBatchProgress: null,
    });
  });

  describe('1. extractAllWorkspacePapers Tool', () => {
    it('returns an error when no research papers exist in the workspace', async () => {
      usePdfStore.setState({ pdfs: [] });

      const result = await agentToolsRegistry.extractAllWorkspacePapers.execute({}, 'human_in_loop');

      expect(result.success).toBe(false);
      expect(result.replyText).toContain('No research papers loaded in workspace');
      expect(batchExtractionRunner.executeBatchExtraction).not.toHaveBeenCalled();
    });

    it('proposes an extraction schema when grid columns are empty', async () => {
      useGridStore.setState({ columns: [] });
      usePdfStore.setState({
        pdfs: [
          {
            id: 'paper-1',
            name: 'PG14 Phage.pdf',
            title: 'PG14 Phage Study',
            sourceType: 'pdf_upload',
            oaStatus: 'gold',
            status: 'Ready',
            uploadedAt: 1,
          },
        ],
      });

      vi.mocked(extractionEngine.proposeSchemaFromGoal).mockResolvedValue({
        proposedColumns: [
          { field: 'phage_name', headerName: 'Phage Name', description: 'Name of the phage' },
          { field: 'burst_size', headerName: 'Burst Size', description: 'Burst size in PFU' },
        ],
        rationale: 'Standard phage characterization fields',
      });

      const result = await agentToolsRegistry.extractAllWorkspacePapers.execute(
        { userGoal: 'Extract phage parameters' },
        'human_in_loop'
      );

      expect(result.success).toBe(false);
      expect(result.replyText).toContain('Schema Review Required Before Batch Extraction');
      expect(result.resultData?.proposedColumns).toHaveLength(2);
      expect(batchExtractionRunner.executeBatchExtraction).not.toHaveBeenCalled();
    });

    it('skips previously extracted papers based on DOI and Title matching', async () => {
      usePdfStore.setState({
        pdfs: [
          {
            id: 'paper-1',
            name: 'PG14.pdf',
            title: 'PG14 Klebsiella Phage',
            doi: '10.1016/j.phage.2023.01',
            sourceType: 'pdf_upload',
            oaStatus: 'gold',
            status: 'Ready',
            uploadedAt: 1,
          },
          {
            id: 'paper-2',
            name: 'Ab10.pdf',
            title: 'Ab10 Acinetobacter Phage',
            doi: '10.3389/fmicb.2023.02',
            sourceType: 'pdf_upload',
            oaStatus: 'gold',
            status: 'Ready',
            uploadedAt: 2,
          },
        ],
      });

      // Existing row matches Paper 1 by DOI
      useGridStore.setState({
        rows: [
          {
            id: 'row-1',
            pdfId: 'paper-1',
            aiStatus: 'Confirmed',
            articleDoi: '10.1016/j.phage.2023.01',
            pdfTitle: 'PG14 Klebsiella Phage',
            phage_name: 'PG14',
            burst_size: '120 PFU/cell',
          },
        ],
      });

      vi.mocked(batchExtractionRunner.executeBatchExtraction).mockResolvedValue({
        totalPapers: 1,
        successfulPapers: 1,
        failedPapers: 0,
        totalRowsExtracted: 1,
        paperResults: [
          {
            paperId: 'paper-2',
            paperTitle: 'Ab10 Acinetobacter Phage',
            observations: [
              {
                fields: { phage_name: 'Ab10', burst_size: '80 PFU/cell' },
                citations: {},
              },
            ],
            summary: 'Extracted Ab10',
            durationSec: 1.5,
          },
        ],
        errors: [],
      });

      const result = await agentToolsRegistry.extractAllWorkspacePapers.execute({}, 'human_in_loop');

      expect(result.success).toBe(true);
      expect(result.replyText).toContain('Batch extraction complete');
      expect(result.replyText).toContain('skipped 1 previously extracted paper');

      // executeBatchExtraction should ONLY have received paper-2
      expect(batchExtractionRunner.executeBatchExtraction).toHaveBeenCalledWith(
        expect.objectContaining({
          papers: [expect.objectContaining({ id: 'paper-2' })],
        })
      );
    });

    it('returns clean message without invoking batch runner if ALL papers are already extracted', async () => {
      usePdfStore.setState({
        pdfs: [
          {
            id: 'paper-1',
            name: 'PG14.pdf',
            title: 'PG14 Klebsiella Phage',
            doi: '10.1016/j.phage.2023.01',
            sourceType: 'pdf_upload',
            oaStatus: 'gold',
            status: 'Ready',
            uploadedAt: 1,
          },
        ],
      });

      useGridStore.setState({
        rows: [
          {
            id: 'row-1',
            pdfId: 'paper-1',
            aiStatus: 'Confirmed',
            articleDoi: '10.1016/j.phage.2023.01',
            pdfTitle: 'PG14 Klebsiella Phage',
            phage_name: 'PG14',
            burst_size: '120 PFU/cell',
          },
        ],
      });

      const result = await agentToolsRegistry.extractAllWorkspacePapers.execute({}, 'human_in_loop');

      expect(result.success).toBe(true);
      expect(result.replyText).toContain('All 1 paper(s) in the workspace have already been extracted');
      expect(batchExtractionRunner.executeBatchExtraction).not.toHaveBeenCalled();
    });

    it('clears activeBatchProgress in agent store after batch completion', async () => {
      usePdfStore.setState({
        pdfs: [
          {
            id: 'paper-new',
            name: 'NewPhage.pdf',
            title: 'New Phage Study',
            sourceType: 'pdf_upload',
            oaStatus: 'gold',
            status: 'Ready',
            uploadedAt: 1,
          },
        ],
      });

      vi.mocked(batchExtractionRunner.executeBatchExtraction).mockImplementation(async (opts) => {
        opts.onProgress?.({
          currentPaperIndex: 1,
          totalPapers: 1,
          currentPaperTitle: 'New Phage Study',
          status: 'extracting',
          message: 'Extracting...',
          percent: 50,
          extractedRowCount: 0,
        });

        // Ensure store was updated during run
        expect(useAgentStore.getState().activeBatchProgress?.percent).toBe(50);

        return {
          totalPapers: 1,
          successfulPapers: 1,
          failedPapers: 0,
          totalRowsExtracted: 2,
          paperResults: [],
          errors: [],
        };
      });

      await agentToolsRegistry.extractAllWorkspacePapers.execute({}, 'human_in_loop');

      // Must be reset to null after finish
      expect(useAgentStore.getState().activeBatchProgress).toBeNull();
    });
  });

  describe('2. Dual-Scope Agent Store Behavior', () => {
    it('initializes in workspace scope by default', () => {
      expect(useAgentStore.getState().agentScope).toBe('workspace');
    });

    it('does not reset chat messages when setActivePdfId is called in workspace scope', async () => {
      useAgentStore.setState({
        agentScope: 'workspace',
        messages: [
          {
            id: 'msg-1',
            pdfId: 'workspace-global',
            sender: 'user',
            text: 'Hello workspace agent',
            timestamp: '12:00',
          },
        ],
      });

      // Switching active PDF tab in workspace scope
      await useAgentStore.getState().setActivePdfId('paper-2', 'Paper 2');

      expect(useAgentStore.getState().activePdfId).toBe('paper-2');
      // Messages should still be intact!
      expect(useAgentStore.getState().messages).toHaveLength(1);
      expect(useAgentStore.getState().messages[0].text).toBe('Hello workspace agent');
    });

    it('switches between workspace and paper scopes smoothly via setAgentScope', async () => {
      useAgentStore.setState({ activePdfId: 'paper-1' });

      await useAgentStore.getState().setAgentScope('paper');
      expect(useAgentStore.getState().agentScope).toBe('paper');

      await useAgentStore.getState().setAgentScope('workspace');
      expect(useAgentStore.getState().agentScope).toBe('workspace');
    });
  });
});
