import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeBatchExtraction } from '../services/batchExtractionRunner';
import { PaperDocumentInfo } from '../types/paper';
import { SchemaColumn } from '../types/grid';
import * as extractionEngine from '../services/extractionEngine';
import * as extractionGridBridge from '../services/extractionGridBridge';

vi.mock('../services/extractionEngine', () => ({
  extractWithFixedSchema: vi.fn(),
  proposeSchemaFromGoal: vi.fn(),
}));

vi.mock('../services/extractionGridBridge', () => ({
  stageExtractedRowsToGrid: vi.fn(),
  applyApprovedSchemaToGrid: vi.fn(),
}));

describe('Batch Extraction Runner Suite', () => {
  const mockLockedSchema: SchemaColumn[] = [
    { field: 'phage_name', headerName: 'Phage Name' },
    { field: 'burst_size', headerName: 'Burst Size' },
  ];

  const mockPapers: PaperDocumentInfo[] = [
    {
      id: 'paper-1',
      name: 'Paper 1.pdf',
      title: 'First Phage Study',
      sourceType: 'pdf_upload',
      oaStatus: 'gold',
      status: 'Ready',
      uploadedAt: 1,
    },
    {
      id: 'paper-2',
      name: 'Paper 2.pdf',
      title: 'Second Phage Study',
      sourceType: 'pdf_upload',
      oaStatus: 'gold',
      status: 'Ready',
      uploadedAt: 2,
    },
    {
      id: 'paper-3',
      name: 'Paper 3.pdf',
      title: 'Third Phage Study',
      sourceType: 'pdf_upload',
      oaStatus: 'gold',
      status: 'Ready',
      uploadedAt: 3,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sequentially extracts findings from all papers and stages rows', async () => {
    vi.mocked(extractionEngine.extractWithFixedSchema).mockResolvedValue({
      paperId: 'mock-id',
      paperTitle: 'Mock Title',
      observations: [
        {
          fields: { phage_name: 'Phage A', burst_size: '50' },
          citations: {
            phage_name: { snippetQuote: 'Phage A', sectionName: 'Results', pageNumber: 1, reasoning: '', confidence: 1 },
            burst_size: { snippetQuote: '50', sectionName: 'Results', pageNumber: 1, reasoning: '', confidence: 1 },
          },
        },
      ],
      summary: 'Mock summary',
      durationSec: 0.5,
    });

    vi.mocked(extractionGridBridge.stageExtractedRowsToGrid).mockReturnValue([
      {
        id: 'row-1',
        pdfId: 'paper-1',
        pdfTitle: 'First Phage Study',
        aiStatus: 'Pending Review',
      },
    ]);

    const progressMessages: string[] = [];
    const result = await executeBatchExtraction({
      papers: mockPapers,
      lockedSchema: mockLockedSchema,
      pacingDelayMs: 10, // Short pacing for test
      onProgress: (p) => progressMessages.push(p.message),
    });

    expect(result.totalPapers).toBe(3);
    expect(result.successfulPapers).toBe(3);
    expect(result.failedPapers).toBe(0);
    expect(result.totalRowsExtracted).toBe(3);
    expect(extractionEngine.extractWithFixedSchema).toHaveBeenCalledTimes(3);
    expect(extractionGridBridge.stageExtractedRowsToGrid).toHaveBeenCalledTimes(3);
    expect(progressMessages.length).toBeGreaterThan(0);
  });

  it('provides fault isolation when an intermediate paper throws an error', async () => {
    vi.mocked(extractionEngine.extractWithFixedSchema)
      .mockResolvedValueOnce({
        paperId: 'paper-1',
        paperTitle: 'First Phage Study',
        observations: [{ fields: {}, citations: {} as any }],
        summary: 'Success 1',
        durationSec: 0.1,
      })
      .mockRejectedValueOnce(new Error('Corrupted PDF binary'))
      .mockResolvedValueOnce({
        paperId: 'paper-3',
        paperTitle: 'Third Phage Study',
        observations: [{ fields: {}, citations: {} as any }],
        summary: 'Success 3',
        durationSec: 0.1,
      });

    vi.mocked(extractionGridBridge.stageExtractedRowsToGrid).mockReturnValue([
      { id: 'row-x', pdfId: 'p', pdfTitle: 't', aiStatus: 'Pending Review' },
    ]);

    const errorEvents: string[] = [];
    const result = await executeBatchExtraction({
      papers: mockPapers,
      lockedSchema: mockLockedSchema,
      pacingDelayMs: 0,
      onPaperError: (paper, err) => errorEvents.push(`${paper.id}: ${err.message}`),
    });

    expect(result.totalPapers).toBe(3);
    expect(result.successfulPapers).toBe(2);
    expect(result.failedPapers).toBe(1);
    expect(result.errors).toEqual([
      { paperId: 'paper-2', paperTitle: 'Second Phage Study', error: 'Corrupted PDF binary' },
    ]);
    expect(errorEvents).toEqual(['paper-2: Corrupted PDF binary']);
  });

  it('respects AbortSignal and cleanly halts execution between papers', async () => {
    const controller = new AbortController();

    vi.mocked(extractionEngine.extractWithFixedSchema).mockImplementation(async (opts) => {
      // Abort after first paper completes
      if (opts.paper.id === 'paper-1') {
        controller.abort();
      }
      return {
        paperId: opts.paper.id,
        paperTitle: opts.paper.name,
        observations: [{ fields: {}, citations: {} as any }],
        summary: 'Done',
        durationSec: 0.1,
      };
    });

    vi.mocked(extractionGridBridge.stageExtractedRowsToGrid).mockReturnValue([
      { id: 'row-1', pdfId: 'paper-1', pdfTitle: 'Paper 1', aiStatus: 'Pending Review' },
    ]);

    const result = await executeBatchExtraction({
      papers: mockPapers,
      lockedSchema: mockLockedSchema,
      pacingDelayMs: 50,
      signal: controller.signal,
    });

    expect(result.successfulPapers).toBe(1);
    expect(extractionEngine.extractWithFixedSchema).toHaveBeenCalledTimes(1);
  });
});
