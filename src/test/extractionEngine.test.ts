import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  proposeSchemaFromGoal,
  extractWithFixedSchema,
  clearSchemaProposalCache,
} from '../services/extractionEngine';
import type { PaperDocumentInfo } from '../types/paper';
import type { SchemaColumn } from '../types/grid';
import * as providerConfig from '../services/providerConfig';
import * as openRouterService from '../services/openRouterService';
import * as geminiService from '../services/geminiService';
import * as geminiCacheService from '../services/geminiCacheService';

const mockGenerateContent = vi.fn();

vi.mock('../services/providerConfig', () => ({
  getActiveProvider: vi.fn(),
  getLmStudioModel: vi.fn(),
  getOpenRouterModel: vi.fn(),
  getOpenRouterApiKey: vi.fn(),
  DEFAULT_OPENROUTER_MODEL: 'test-model',
}));

vi.mock('../services/geminiService', () => ({
  getGeminiApiKey: vi.fn(),
  getSelectedGeminiModel: vi.fn(() => 'gemini-2.5-flash'),
}));

vi.mock('../services/geminiCacheService', () => ({
  getOrCreateDocumentCache: vi.fn(),
  deleteDocumentCache: vi.fn(),
  clearAllDocumentCaches: vi.fn(),
  getActiveCacheEntry: vi.fn(),
}));

vi.mock('../services/openRouterService', () => ({
  executeOpenRouterStructuredGeneration: vi.fn(),
}));

vi.mock('../services/lmStudioService', () => ({
  executeLmStudioStructuredGeneration: vi.fn(),
}));

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    GoogleGenAI: vi.fn().mockImplementation(function (this: any) {
      this.models = {
        generateContent: mockGenerateContent,
      };
    }),
  };
});

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

  describe('extractWithFixedSchema (Asymmetric Routing)', () => {
    it('throws error when lockedSchema is empty', async () => {
      await expect(
        extractWithFixedSchema({ paper: mockPaper, lockedSchema: [] })
      ).rejects.toThrow('No locked schema columns provided');
    });

    it('routes to Gemini Frontier profile with explicit context caching', async () => {
      vi.mocked(providerConfig.getActiveProvider).mockReturnValue('gemini');
      vi.mocked(geminiService.getGeminiApiKey).mockReturnValue('valid-gemini-key');
      vi.mocked(geminiCacheService.getOrCreateDocumentCache).mockResolvedValue({
        cacheName: 'cachedContents/litsift_paper_sample_123',
        tokenCount: 42000,
      });

      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    observations: [
                      {
                        phage_name: 'Phage V12',
                        burst_size: '85',
                        citations: {
                          phage_name: {
                            snippetQuote: 'isolated phage V12',
                            sectionName: 'Abstract',
                            pageNumber: 1,
                            reasoning: 'Mentioned in abstract',
                            confidence: 0.99,
                          },
                          burst_size: {
                            snippetQuote: 'burst size of 85',
                            sectionName: 'Abstract',
                            pageNumber: 1,
                            reasoning: 'Quantified burst size',
                            confidence: 0.98,
                          },
                        },
                      },
                    ],
                    summary: 'Extracted Phage V12 findings.',
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 150,
          candidatesTokenCount: 80,
          cachedContentTokenCount: 42000,
        },
      });

      const result = await extractWithFixedSchema({
        paper: mockPaper,
        lockedSchema: mockLockedSchema,
        executionProfile: 'frontier',
      });

      expect(result.paperId).toBe('paper-sample');
      expect(result.observations).toHaveLength(1);
      expect(result.observations[0].fields['phage_name']).toBe('Phage V12');
      expect(result.observations[0].fields['burst_size']).toBe('85');
      expect(result.tokensUsed?.cachedTokens).toBe(42000);

      // Verify cachedContent was passed to Gemini generateContent config
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            cachedContent: 'cachedContents/litsift_paper_sample_123',
          }),
        })
      );
    });

    it('falls back seamlessly to inline Gemini multimodal when context cache returns null (<32k tokens)', async () => {
      vi.mocked(providerConfig.getActiveProvider).mockReturnValue('gemini');
      vi.mocked(geminiService.getGeminiApiKey).mockReturnValue('valid-gemini-key');
      // Below threshold -> returns null
      vi.mocked(geminiCacheService.getOrCreateDocumentCache).mockResolvedValue(null);

      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    observations: [
                      {
                        phage_name: 'Phage V12',
                        burst_size: '85',
                        citations: {},
                      },
                    ],
                    summary: 'Extracted Phage V12 inline.',
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 1200,
          candidatesTokenCount: 60,
        },
      });

      const result = await extractWithFixedSchema({
        paper: mockPaper,
        lockedSchema: mockLockedSchema,
        executionProfile: 'frontier',
      });

      expect(result.observations).toHaveLength(1);
      expect(result.observations[0].fields['phage_name']).toBe('Phage V12');
      // No cachedContent in config for inline path
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.not.objectContaining({
            cachedContent: expect.anything(),
          }),
        })
      );
    });

    it('routes to Local Micro-Agentic profile when active provider is lmstudio or openrouter', async () => {
      vi.mocked(providerConfig.getActiveProvider).mockReturnValue('openrouter');

      // 1 single structured call returning observations array
      vi.mocked(openRouterService.executeOpenRouterStructuredGeneration).mockResolvedValueOnce({
        data: {} as any,
        rawText: '',
        parsed: {
          observations: [
            {
              phage_name: 'Phage V12',
              burst_size: '85 virions/cell',
            },
          ],
          summary: 'Extracted Phage V12 findings.',
        },
        usage: { prompt_tokens: 620, completion_tokens: 45 },
      });

      const result = await extractWithFixedSchema({
        paper: mockPaper,
        lockedSchema: mockLockedSchema,
        executionProfile: 'local_microagent',
      });

      expect(result.paperId).toBe('paper-sample');
      expect(result.observations).toHaveLength(1);
      expect(result.observations[0].fields['phage_name']).toBe('Phage V12');
      expect(result.observations[0].fields['burst_size']).toBe('85 virions/cell');
      expect(result.tokensUsed?.promptTokens).toBe(620);
    });
  });
});
