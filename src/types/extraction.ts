import { PaperDocumentInfo } from './paper';
import { SchemaColumn } from './grid';

export interface GroundedEvidence {
  snippetQuote: string;
  sectionName: string;
  pageNumber: number;
  paragraphNumber?: string;
  reasoning: string;
  confidence: number;
}

export interface ProposedColumn {
  field: string;
  headerName: string;
  description: string;
  dataType?: 'string' | 'number' | 'boolean';
}

export interface SchemaProposalResult {
  proposedColumns: ProposedColumn[];
  rationale: string;
}

export interface SinglePaperObservation {
  fields: Record<string, string>;
  citations: Record<string, GroundedEvidence>;
}

export interface SinglePaperExtractionResult {
  paperId: string;
  paperTitle: string;
  doi?: string;
  observations: SinglePaperObservation[];
  summary: string;
  tokensUsed?: {
    promptTokens: number;
    candidateTokens: number;
    cachedTokens?: number;
    thinkingTokens?: number;
  };
  durationSec: number;
}

export interface BatchExtractionProgress {
  currentPaperIndex: number;
  totalPapers: number;
  currentPaperTitle: string;
  status: 'reading' | 'extracting' | 'staging' | 'delaying' | 'completed' | 'error';
  message: string;
  percent: number;
  extractedRowCount: number;
}

export type ExecutionProfile = 'auto' | 'frontier' | 'local_microagent';

export interface BatchExtractionOptions {
  papers: PaperDocumentInfo[];
  lockedSchema: SchemaColumn[]; // Strict, immutable approved schema
  pacingDelayMs?: number;       // e.g. 2500ms for Gemini, 0ms for local
  executionProfile?: ExecutionProfile;
  signal?: AbortSignal;
  onPaperStart?: (paper: PaperDocumentInfo, index: number, total: number) => void;
  onPaperComplete?: (paper: PaperDocumentInfo, result: SinglePaperExtractionResult, index: number, total: number) => void;
  onPaperError?: (paper: PaperDocumentInfo, error: Error, index: number, total: number) => void;
  onProgress?: (progress: BatchExtractionProgress) => void;
}

export interface BatchExtractionResult {
  totalPapers: number;
  successfulPapers: number;
  failedPapers: number;
  totalRowsExtracted: number;
  paperResults: SinglePaperExtractionResult[];
  errors: Array<{ paperId: string; paperTitle: string; error: string }>;
}
