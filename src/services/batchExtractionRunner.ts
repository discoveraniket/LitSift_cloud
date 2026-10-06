import {
  BatchExtractionOptions,
  BatchExtractionResult,
  SinglePaperExtractionResult,
} from '../types/extraction';
import { extractWithFixedSchema } from './extractionEngine';
import { stageExtractedRowsToGrid } from './extractionGridBridge';
import { getActiveProvider } from './providerConfig';

/**
 * Executes multi-paper extraction sequentially (1 paper at a time).
 * Enforces:
 * 1. Schema Immutability: Every paper conforms strictly to lockedSchema.
 * 2. Rate-Limit Pacing: Configurable delay between papers to keep Gemini under 15 RPM.
 * 3. Fault Isolation: An error on one paper does not abort the rest of the queue.
 * 4. Human Sovereignty: Respects AbortSignal to pause or cancel at any moment.
 */
export async function executeBatchExtraction(
  options: BatchExtractionOptions
): Promise<BatchExtractionResult> {
  const { papers, lockedSchema, signal } = options;

  if (!papers || papers.length === 0) {
    return {
      totalPapers: 0,
      successfulPapers: 0,
      failedPapers: 0,
      totalRowsExtracted: 0,
      paperResults: [],
      errors: [],
    };
  }

  if (!lockedSchema || lockedSchema.length === 0) {
    throw new Error('Cannot run batch extraction without an approved locked schema.');
  }

  const provider = getActiveProvider();
  // Default pacing delay: 2500ms for Gemini (to keep under 15 RPM), 0ms for LM Studio / local
  const defaultDelay = provider === 'gemini' ? 2500 : 0;
  const pacingDelay = options.pacingDelayMs !== undefined ? options.pacingDelayMs : defaultDelay;

  const total = papers.length;
  const paperResults: SinglePaperExtractionResult[] = [];
  const errors: Array<{ paperId: string; paperTitle: string; error: string }> = [];
  let totalRowsExtracted = 0;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      break;
    }

    const paper = papers[i];
    const paperTitle = paper.title || paper.name || `Paper ${i + 1}`;
    const percent = Math.round((i / total) * 100);

    options.onProgress?.({
      currentPaperIndex: i + 1,
      totalPapers: total,
      currentPaperTitle: paperTitle,
      status: 'reading',
      message: `[${i + 1}/${total}] Reading "${paperTitle}"...`,
      percent,
      extractedRowCount: totalRowsExtracted,
    });

    options.onPaperStart?.(paper, i + 1, total);

    try {
      options.onProgress?.({
        currentPaperIndex: i + 1,
        totalPapers: total,
        currentPaperTitle: paperTitle,
        status: 'extracting',
        message: `[${i + 1}/${total}] Extracting parameters for "${paperTitle}"...`,
        percent: Math.min(99, percent + 5),
        extractedRowCount: totalRowsExtracted,
      });

      // 1. Extract findings strictly conforming to locked schema
      const result = await extractWithFixedSchema({
        paper,
        lockedSchema,
        signal,
      });

      // 2. Stage rows into useGridStore with 'Pending Review'
      options.onProgress?.({
        currentPaperIndex: i + 1,
        totalPapers: total,
        currentPaperTitle: paperTitle,
        status: 'staging',
        message: `[${i + 1}/${total}] Staging ${result.observations.length} row(s) into table grid...`,
        percent: Math.min(99, percent + 10),
        extractedRowCount: totalRowsExtracted,
      });

      const stagedRows = stageExtractedRowsToGrid(paper, result.observations, lockedSchema);
      totalRowsExtracted += stagedRows.length;

      paperResults.push(result);
      options.onPaperComplete?.(paper, result, i + 1, total);
    } catch (err: any) {
      const errMsg = err?.message || 'Unknown extraction error';
      errors.push({
        paperId: paper.id,
        paperTitle,
        error: errMsg,
      });

      options.onPaperError?.(paper, err, i + 1, total);
      options.onProgress?.({
        currentPaperIndex: i + 1,
        totalPapers: total,
        currentPaperTitle: paperTitle,
        status: 'error',
        message: `⚠️ Skipped "${paperTitle}": ${errMsg}`,
        percent,
        extractedRowCount: totalRowsExtracted,
      });
    }

    // 3. Pacing Delay (if more papers remain and not aborted)
    if (i < total - 1 && !signal?.aborted && pacingDelay > 0) {
      options.onProgress?.({
        currentPaperIndex: i + 1,
        totalPapers: total,
        currentPaperTitle: paperTitle,
        status: 'delaying',
        message: `⏳ Pacing rate limit (${Math.round(pacingDelay / 1000)}s pause)...`,
        percent: Math.round(((i + 1) / total) * 100),
        extractedRowCount: totalRowsExtracted,
      });

      await new Promise((resolve) => setTimeout(resolve, pacingDelay));
    }
  }

  options.onProgress?.({
    currentPaperIndex: total,
    totalPapers: total,
    currentPaperTitle: 'Batch extraction finished',
    status: 'completed',
    message: `Batch extraction complete! Processed ${paperResults.length} of ${total} papers (${totalRowsExtracted} rows staged).`,
    percent: 100,
    extractedRowCount: totalRowsExtracted,
  });

  return {
    totalPapers: total,
    successfulPapers: paperResults.length,
    failedPapers: errors.length,
    totalRowsExtracted,
    paperResults,
    errors,
  };
}
