import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractLocalMicroAgentic,
  findGroundedQuoteInText,
} from '../services/localMicroAgenticExtractor';
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

describe('Local Micro-Agentic Extractor Suite', () => {
  const mockPaper: PaperDocumentInfo = {
    id: 'paper-micro-1',
    name: 'Phage_Study.pdf',
    title: 'Characterization of Two Phages',
    abstractText: 'We isolated phage V12 and phage K9 from wastewater.',
    sections: [
      {
        id: 'sec-results',
        title: 'Results: Burst Size and Latency',
        content:
          'Phage V12 produced a burst size of 85 virions per cell with 25 min latency. Phage K9 produced a burst size of 120 virions per cell with 40 min latency.',
      },
    ],
    sourceType: 'pdf_upload',
    oaStatus: 'gold',
    status: 'Ready',
    uploadedAt: 100,
  };

  const mockLockedSchema: SchemaColumn[] = [
    { field: 'phage_name', headerName: 'Phage Name' },
    { field: 'burst_size', headerName: 'Burst Size' },
    { field: 'latent_period_min', headerName: 'Latent Period (min)' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findGroundedQuoteInText', () => {
    const sampleWindowedText = `# Characterization of Two Phages
## Results: Burst Size and Latency
Phage V12 produced a burst size of 85 virions per cell with 25 min latency.
Phage K9 produced a burst size of 120 virions per cell with 40 min latency.`;

    it('returns "Not reported in document" when value is Not reported or unmentioned', () => {
      const cit = findGroundedQuoteInText('Not reported', { field: 'genome_size', headerName: 'Genome Size' }, sampleWindowedText);
      expect(cit.snippetQuote).toBe('Not reported in document');
      expect(cit.sectionName).toBe('N/A');
      expect(cit.confidence).toBe(0.99);
    });

    it('locates verbatim matching sentence and section heading for empirical values', () => {
      const cit = findGroundedQuoteInText('85 virions per cell', { field: 'burst_size', headerName: 'Burst Size' }, sampleWindowedText);
      expect(cit.snippetQuote).toContain('Phage V12 produced a burst size of 85 virions per cell');
      expect(cit.sectionName).toBe('Results: Burst Size and Latency');
      expect(cit.confidence).toBeGreaterThanOrEqual(0.94);
    });

    it('locates sentence by numerical match when value is a pure number', () => {
      const cit = findGroundedQuoteInText('120', { field: 'burst_size', headerName: 'Burst Size' }, sampleWindowedText);
      expect(cit.snippetQuote).toContain('Phage K9 produced a burst size of 120 virions per cell');
      expect(cit.sectionName).toBe('Results: Burst Size and Latency');
    });
  });

  describe('extractLocalMicroAgentic pipeline', () => {
    it('executes 1-shot observation extraction and grounds verbatim citations', async () => {
      vi.mocked(providerConfig.getActiveProvider).mockReturnValue('openrouter');

      // 1 single structured call returning observations array
      vi.mocked(openRouterService.executeOpenRouterStructuredGeneration).mockResolvedValueOnce({
        data: {} as any,
        rawText: '',
        parsed: {
          observations: [
            {
              phage_name: 'Phage V12',
              burst_size: '85 virions per cell',
              latent_period_min: '25 min',
            },
            {
              phage_name: 'Phage K9',
              burst_size: '120 virions per cell',
              latent_period_min: '40 min',
            },
          ],
          summary: 'Characterization of phages V12 and K9.',
        },
        usage: { prompt_tokens: 650, completion_tokens: 80 },
      });

      const result = await extractLocalMicroAgentic({
        paper: mockPaper,
        lockedSchema: mockLockedSchema,
        userGoal: 'Extract burst size and latent period for isolated phages',
      });

      expect(result.paperId).toBe('paper-micro-1');
      expect(result.observations).toHaveLength(2);

      // Observation 1: Phage V12
      expect(result.observations[0].fields['phage_name']).toBe('Phage V12');
      expect(result.observations[0].fields['burst_size']).toBe('85 virions per cell');
      expect(result.observations[0].citations['burst_size'].snippetQuote).toContain('Phage V12 produced a burst size of 85');
      expect(result.observations[0].citations['burst_size'].sectionName).toBe('Results: Burst Size and Latency');

      // Observation 2: Phage K9
      expect(result.observations[1].fields['phage_name']).toBe('Phage K9');
      expect(result.observations[1].fields['burst_size']).toBe('120 virions per cell');
      expect(result.observations[1].citations['burst_size'].snippetQuote).toContain('Phage K9 produced a burst size of 120');

      // Token usage in single pass
      expect(result.tokensUsed?.promptTokens).toBe(650);
      expect(result.tokensUsed?.candidateTokens).toBe(80);
      expect(openRouterService.executeOpenRouterStructuredGeneration).toHaveBeenCalledTimes(1);
    });

    it('falls back to single row marked Not reported when model returns 0 observations', async () => {
      vi.mocked(providerConfig.getActiveProvider).mockReturnValue('openrouter');

      // Model returns empty observations
      vi.mocked(openRouterService.executeOpenRouterStructuredGeneration).mockResolvedValueOnce({
        data: {} as any,
        rawText: '',
        parsed: { observations: [] },
        usage: { prompt_tokens: 200, completion_tokens: 10 },
      });

      const result = await extractLocalMicroAgentic({
        paper: mockPaper,
        lockedSchema: mockLockedSchema,
      });

      expect(result.observations).toHaveLength(1);
      expect(result.observations[0].fields['phage_name']).toBe('Not reported');
      expect(result.observations[0].fields['burst_size']).toBe('Not reported');
      expect(result.observations[0].fields['latent_period_min']).toBe('Not reported');
      expect(result.observations[0].citations['latent_period_min'].snippetQuote).toBe('Not reported in document');
      expect(openRouterService.executeOpenRouterStructuredGeneration).toHaveBeenCalledTimes(1);
    });

    it('executes 1-shot pipeline using LM Studio provider when activeProvider is lmstudio', async () => {
      vi.mocked(providerConfig.getActiveProvider).mockReturnValue('lmstudio');

      vi.mocked(lmStudioService.executeLmStudioStructuredGeneration).mockResolvedValueOnce({
        data: {} as any,
        rawText: '',
        parsed: {
          observations: [
            {
              phage_name: 'Phage V12',
              burst_size: '85 virions per cell',
              latent_period_min: '20 min',
            },
          ],
          summary: 'Extracted Phage V12 findings.',
        },
        usage: { prompt_tokens: 300, completion_tokens: 25 },
      });

      const result = await extractLocalMicroAgentic({
        paper: mockPaper,
        lockedSchema: mockLockedSchema,
      });

      expect(result.observations).toHaveLength(1);
      expect(result.observations[0].fields['phage_name']).toBe('Phage V12');
      expect(result.observations[0].fields['burst_size']).toBe('85 virions per cell');
      expect(lmStudioService.executeLmStudioStructuredGeneration).toHaveBeenCalledTimes(1);
    });

    it('aborts promptly when AbortSignal is triggered', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        extractLocalMicroAgentic({
          paper: mockPaper,
          lockedSchema: mockLockedSchema,
          signal: controller.signal,
        })
      ).rejects.toThrow('Extraction aborted by user');
    });
  });
});
