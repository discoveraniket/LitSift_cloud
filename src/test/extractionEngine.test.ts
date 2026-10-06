import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proposeSchemaFromGoal, extractWithFixedSchema, clearSchemaProposalCache } from '../services/extractionEngine';
import type { PaperDocumentInfo } from '../types/paper';
import type { SchemaColumn } from '../types/grid';
import * as providerConfig from '../services/providerConfig';
import * as openRouterService from '../services/openRouterService';
import * as lmStudioService from '../services/lmStudioService';

vi.mock('../services/providerConfig', () => ({
  getActiveProvider: vi.fn(),
  getLmStudioModel: vi.fn(),
  getOpenRouterModel: vi.fn(),
  getOpenRouterApiKey: vi.fn(),
  DEFAULT_OPENROUTER_MODEL: 'test-model',
}));

vi.mock('../services/openRouterService', () => ({
  executeOpenRouterStructuredGeneration: vi.fn(),
}));

vi.mock('../services/lmStudioService', () => ({
  executeLmStudioStructuredGeneration: vi.fn(),
}));

describe('Extraction Engine Suite', () => {
  const mockPaper: PaperDocumentInfo = {
    id: 'paper-sample',
    name: 'Phage_Characteristics.pdf',
    title: 'Characterization of Phage V12',
    abstractText: 'We isolated phage V12 having a burst size of 85 and latency of 25 min.',
    sourceType: 'pdf_upload',
    oaStatus: 'gold',
    status: 'Ready',
    uploadedAt: 100,
  };

  const mockLockedSchema: SchemaColumn[] = [
    { field: 'phage_name', headerName: 'Phage Name' },
    { field: 'burst_size', headerName: 'Burst Size' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    clearSchemaProposalCache();
  });

  describe('proposeSchemaFromGoal', () => {
    it('throws error when user goal is empty', async () => {
      await expect(proposeSchemaFromGoal('')).rejects.toThrow('Please specify an extraction goal');
    });

    it('returns structured proposed columns via active provider', async () => {
      vi.mocked(providerConfig.getActiveProvider).mockReturnValue('openrouter');
      vi.mocked(openRouterService.executeOpenRouterStructuredGeneration).mockResolvedValue({
        data: {} as any,
        rawText: '',
        parsed: {
          proposedColumns: [
            { field: 'phage_name', headerName: 'Phage Name', description: 'Name of the bacteriophage' },
            { field: 'burst_size', headerName: 'Burst Size (pfu/cell)', description: 'Virions per cell' },
          ],
          rationale: 'Captures the quantitative kinetic properties.',
        },
      });

      const result = await proposeSchemaFromGoal('Extract phage name and burst size', mockPaper);
      expect(result.proposedColumns).toHaveLength(2);
      expect(result.proposedColumns[0].field).toBe('phage_name');
      expect(result.rationale).toBe('Captures the quantitative kinetic properties.');
    });

    it('reuses in-memory cache for repeated identical schema proposal queries without making redundant LLM calls', async () => {
      vi.mocked(providerConfig.getActiveProvider).mockReturnValue('openrouter');
      vi.mocked(openRouterService.executeOpenRouterStructuredGeneration).mockResolvedValue({
        data: {} as any,
        rawText: '',
        parsed: {
          proposedColumns: [
            { field: 'phage_name', headerName: 'Phage Name', description: 'Phage strain' },
          ],
          rationale: 'Cached rationale',
        },
      });

      // Call 1
      const res1 = await proposeSchemaFromGoal('Extract phage name', mockPaper);
      expect(res1.proposedColumns).toHaveLength(1);
      expect(openRouterService.executeOpenRouterStructuredGeneration).toHaveBeenCalledTimes(1);

      // Call 2 with identical goal & paper - should hit cache
      const res2 = await proposeSchemaFromGoal('Extract phage name', mockPaper);
      expect(res2.proposedColumns).toHaveLength(1);
      // Still called only 1 time!
      expect(openRouterService.executeOpenRouterStructuredGeneration).toHaveBeenCalledTimes(1);
    });
  });

  describe('extractWithFixedSchema', () => {
    it('throws error when lockedSchema is empty', async () => {
      await expect(
        extractWithFixedSchema({ paper: mockPaper, lockedSchema: [] })
      ).rejects.toThrow('No locked schema columns provided');
    });

    it('extracts findings conforming strictly to the locked schema', async () => {
      vi.mocked(providerConfig.getActiveProvider).mockReturnValue('lmstudio');
      vi.mocked(lmStudioService.executeLmStudioStructuredGeneration).mockResolvedValue({
        data: {} as any,
        rawText: JSON.stringify({
          observations: [
            {
              phage_name: 'Phage V12',
              burst_size: '85',
              citations: {
                phage_name: {
                  snippetQuote: 'isolated phage V12',
                  sectionName: 'Abstract',
                  pageNumber: 1,
                  reasoning: 'Mentioned',
                  confidence: 0.99,
                },
                burst_size: {
                  snippetQuote: 'burst size of 85',
                  sectionName: 'Abstract',
                  pageNumber: 1,
                  reasoning: 'Reported value',
                  confidence: 0.98,
                },
              },
            },
          ],
          summary: 'Phage V12 exhibits typical kinetic profile.',
        }),
        parsed: {},
      });

      const result = await extractWithFixedSchema({
        paper: mockPaper,
        lockedSchema: mockLockedSchema,
        userGoal: 'Extract kinetics',
      });

      expect(result.paperId).toBe('paper-sample');
      expect(result.observations).toHaveLength(1);
      expect(result.observations[0].fields['phage_name']).toBe('Phage V12');
      expect(result.observations[0].fields['burst_size']).toBe('85');
      expect(result.observations[0].citations['burst_size'].snippetQuote).toBe('burst size of 85');
      expect(result.summary).toBe('Phage V12 exhibits typical kinetic profile.');
    });

    it('populates unmentioned fields with "Not reported" fallback', async () => {
      vi.mocked(providerConfig.getActiveProvider).mockReturnValue('lmstudio');
      vi.mocked(lmStudioService.executeLmStudioStructuredGeneration).mockResolvedValue({
        data: {} as any,
        rawText: JSON.stringify({
          observations: [
            {
              phage_name: 'Phage V12',
              // burst_size omitted by LLM
              citations: {},
            },
          ],
          summary: 'Extracted phage name.',
        }),
        parsed: {},
      });

      const result = await extractWithFixedSchema({
        paper: mockPaper,
        lockedSchema: mockLockedSchema,
      });

      expect(result.observations).toHaveLength(1);
      expect(result.observations[0].fields['burst_size']).toBe('Not reported');
      expect(result.observations[0].citations['burst_size'].snippetQuote).toBe('Not reported in document');
    });
  });
});
