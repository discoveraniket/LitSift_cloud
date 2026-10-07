import { GoogleGenAI, Type } from '@google/genai';
import type { PaperDocumentInfo } from '../types/paper';
import type { SchemaColumn } from '../types/grid';
import type {
  SchemaProposalResult,
  SinglePaperExtractionResult,
  SinglePaperObservation,
  GroundedEvidence,
  ExecutionProfile,
} from '../types/extraction';
import { getActiveProvider } from './providerConfig';
import { getGeminiApiKey, getSelectedGeminiModel } from './geminiService';
import { executeLmStudioStructuredGeneration, OpenAiMessage } from './lmStudioService';
import { executeOpenRouterStructuredGeneration } from './openRouterService';
import { getPdfBase64, buildPaperMarkdownContext, resolveEffectiveGroundingMode } from './pdfUtils';
import { safeJsonParse } from './agentToolRegistry';
import { getOrCreateDocumentCache } from './geminiCacheService';
import { extractLocalMicroAgentic } from './localMicroAgenticExtractor';

// In-memory cache for proposed schemas to avoid redundant LLM calls across tools
const schemaProposalCache = new Map<string, { result: SchemaProposalResult; timestamp: number }>();
const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function clearSchemaProposalCache(): void {
  schemaProposalCache.clear();
}

export interface ExtractWithFixedSchemaOptions {
  paper: PaperDocumentInfo;
  lockedSchema: SchemaColumn[];
  userGoal?: string;
  executionProfile?: ExecutionProfile;
  signal?: AbortSignal;
}

/**
 * Stage 1: Proposes a schema based on user research intent and optional paper context.
 * Does NOT alter the Data Grid store. The proposed schema is returned for human review.
 */
export async function proposeSchemaFromGoal(
  userGoal: string,
  paperSample?: PaperDocumentInfo
): Promise<SchemaProposalResult> {
  if (!userGoal || !userGoal.trim()) {
    throw new Error('Please specify an extraction goal or parameters to propose a schema.');
  }

  const provider = getActiveProvider();
  const isOpenRouter = provider === 'openrouter';
  const isLmStudio = provider === 'lmstudio';

  const cacheKey = `${provider}_${userGoal.trim().toLowerCase()}_${paperSample?.id || paperSample?.name || 'none'}`;
  const cached = schemaProposalCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SCHEMA_CACHE_TTL_MS) {
    return cached.result;
  }

  const paperContext = paperSample
    ? `\nReference Paper: "${paperSample.title || paperSample.name}"\nAbstract: ${
        paperSample.abstractText ? paperSample.abstractText.slice(0, 800) : 'Not available'
      }`
    : '';

  const proposalPrompt = `You are a scientific literature data architect.
The user wants to extract specific findings from research papers.
User Research Goal:
"${userGoal.trim()}"
${paperContext}

Formulate an optimal structured table extraction schema (between 3 and 8 columns maximum) that captures the user's requested scientific variables.
Rules:
1. "field" must be a concise, lower_snake_case key (e.g. "phage_name", "host_bacteria", "burst_size", "latent_period_min").
2. "headerName" must be a clean, professional table header label with units if applicable (e.g. "Phage Name", "Host Strain", "Burst Size (pfu/cell)", "Latent Period (min)").
3. "description" must explain what empirical data belongs in this column and how to handle missing data.
4. "dataType" should be "string", "number", or "boolean".
5. Provide a brief "rationale" explaining why this column schema effectively fulfills the user's objective.`;

  const schemaDefinition = {
    type: Type.OBJECT,
    properties: {
      proposedColumns: {
        type: Type.ARRAY,
        description: 'Target table schema columns proposed for user review.',
        items: {
          type: Type.OBJECT,
          properties: {
            field: { type: Type.STRING, description: 'clean snake_case column key' },
            headerName: { type: Type.STRING, description: 'Clean display title with units' },
            description: { type: Type.STRING, description: 'Scientific guidance for this column' },
            dataType: { type: Type.STRING, enum: ['string', 'number', 'boolean'] },
          },
          required: ['field', 'headerName', 'description'],
        },
      },
      rationale: {
        type: Type.STRING,
        description: 'Brief explanation of how these columns align with the research goal.',
      },
    },
    required: ['proposedColumns', 'rationale'],
  };

  let finalResult: SchemaProposalResult;

  if (isOpenRouter) {
    const messages: OpenAiMessage[] = [
      {
        role: 'system',
        content: 'You are an expert scientific data architect. Formulate table schema proposals. Return valid JSON only.',
      },
      { role: 'user', content: proposalPrompt },
    ];
    const res = await executeOpenRouterStructuredGeneration<SchemaProposalResult>({
      schemaName: 'schemaProposal',
      schema: schemaDefinition,
      messages,
      temperature: 0.1,
    });
    finalResult = res.parsed;
  } else if (isLmStudio) {
    const messages: OpenAiMessage[] = [
      {
        role: 'system',
        content: 'You are an expert scientific data architect. Formulate table schema proposals. Return valid JSON only.',
      },
      { role: 'user', content: proposalPrompt },
    ];
    const res = await executeLmStudioStructuredGeneration<SchemaProposalResult>({
      schemaName: 'schemaProposal',
      schema: schemaDefinition,
      messages,
      temperature: 0.1,
    });
    finalResult = res.parsed;
  } else {
    // Google Gemini
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }
    const selectedModel = getSelectedGeminiModel();
    const ai = new GoogleGenAI({ apiKey });

    const res = await ai.models.generateContent({
      model: selectedModel,
      contents: [{ text: proposalPrompt }],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: schemaDefinition,
      },
    });

    const rawText = res.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Model returned an empty schema proposal response.');
    }

    finalResult = safeJsonParse<SchemaProposalResult>(rawText);
  }

  schemaProposalCache.set(cacheKey, { result: finalResult, timestamp: Date.now() });
  return finalResult;
}

/**
 * Builds the dynamic extraction response schema strictly conforming to lockedSchema.
 */
function buildGeminiExtractionSchema(lockedSchema: SchemaColumn[]) {
  const columnProperties: Record<string, any> = {};
  const citationProperties: Record<string, any> = {};
  const schemaHeaders = lockedSchema.map((c) => c.field);

  lockedSchema.forEach((col) => {
    const fieldKey = col.field;
    const headerTitle = col.headerName || col.field;

    columnProperties[fieldKey] = {
      type: Type.STRING,
      description: `Scientific finding for "${headerTitle}". If not measured, tested, or reported in the document, return "Not reported".`,
    };

    citationProperties[fieldKey] = {
      type: Type.OBJECT,
      description: `Verbatim grounded evidence citation for "${headerTitle}".`,
      properties: {
        pageNumber: { type: Type.INTEGER, description: 'PDF page number (integer, 1 if reading text)' },
        sectionName: { type: Type.STRING, description: 'Exact section heading, or "N/A" if not reported' },
        paragraphNumber: { type: Type.STRING, description: 'Paragraph or line location, or "N/A" if not reported' },
        snippetQuote: {
          type: Type.STRING,
          description: 'The EXACT UNALTERED VERBATIM sentence quote from the paper, or "Not reported in document" if unmentioned.',
        },
        reasoning: {
          type: Type.STRING,
          description: 'Scientific explanation of why this value was extracted or why it is absent from the text.',
        },
        confidence: { type: Type.NUMBER, description: 'Confidence score between 0.0 and 1.0' },
      },
      required: ['snippetQuote', 'sectionName', 'reasoning'],
    };
  });

  return {
    schema: {
      type: Type.OBJECT,
      properties: {
        observations: {
          type: Type.ARRAY,
          description: 'List of distinct empirical observation rows extracted from the paper.',
          items: {
            type: Type.OBJECT,
            properties: {
              ...columnProperties,
              citations: {
                type: Type.OBJECT,
                description: 'Grounded citation object containing a citation entry for every extracted column.',
                properties: citationProperties,
                required: schemaHeaders,
              },
            },
            required: schemaHeaders,
          },
        },
        summary: {
          type: Type.STRING,
          description: 'Brief 2-3 sentence scientific synthesis of the findings extracted from this paper.',
        },
      },
      required: ['observations', 'summary'],
    },
    schemaHeaders,
  };
}

/**
 * Builds standard extraction prompt.
 */
function buildExtractionPrompt(paper: PaperDocumentInfo, lockedSchema: SchemaColumn[], userGoal?: string): string {
  return `You are an expert scientific literature data extractor.
Target Document: "${paper.title || paper.name}"
${userGoal ? `User Research Context: "${userGoal}"\n` : ''}

Strict Target Columns:
${lockedSchema.map((c, i) => `${i + 1}. "${c.headerName}" (field key: "${c.field}")`).join('\n')}

Core Extraction Rules:
1. SCHEMA IMMUTABILITY: Extract findings ONLY for the specified target columns above. Do NOT invent new columns or rename fields.
2. OBSERVATION DISAGGREGATION: If the paper tests multiple distinct variables, strains, or treatments, emit a DISTINCT ROW in "observations" for each tested observation.
3. MISSING VALUES: If a parameter was not investigated or reported in the paper, return "Not reported". Do NOT guess or hallucinate.
4. GROUNDED CITATIONS: For every column, provide the exact unaltered verbatim quote in "snippetQuote", sectionName, pageNumber, and reasoning.`;
}

/**
 * Executes Frontier Model Extraction using Google Gemini with explicit context caching.
 */
export async function extractGeminiWithCache(
  options: ExtractWithFixedSchemaOptions
): Promise<SinglePaperExtractionResult> {
  const { paper, lockedSchema, userGoal, signal } = options;
  const startTime = performance.now();

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const selectedModel = getSelectedGeminiModel();
  const ai = new GoogleGenAI({ apiKey });
  const { schema: extractionResponseSchema } = buildGeminiExtractionSchema(lockedSchema);
  const extractionPrompt = buildExtractionPrompt(paper, lockedSchema, userGoal);

  // 1. Attempt Explicit Context Caching (3600s TTL)
  let cacheInfo: { cacheName: string; tokenCount?: number } | null = null;
  try {
    cacheInfo = await getOrCreateDocumentCache({
      paper,
      model: selectedModel,
      apiKey,
      signal,
    });
  } catch (err: any) {
    console.warn(`[extractionEngine] Context cache setup skipped:`, err.message);
  }

  let rawText = '';
  let promptTokens = 0;
  let candidateTokens = 0;
  let cachedTokens: number | undefined;
  let thinkingTokens: number | undefined;

  if (cacheInfo && cacheInfo.cacheName) {
    // Cached Path: Send prompt instructions only; heavy document is cached
    try {
      const res = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ text: extractionPrompt }],
        config: {
          cachedContent: cacheInfo.cacheName,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: extractionResponseSchema,
          abortSignal: signal,
        },
      });

      rawText = res.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const usage = res.usageMetadata;
      promptTokens = usage?.promptTokenCount ?? 0;
      candidateTokens = usage?.candidatesTokenCount ?? 0;
      cachedTokens = usage?.cachedContentTokenCount ?? cacheInfo.tokenCount;
      thinkingTokens = (usage as any)?.thinkingTokenCount ?? (usage as any)?.reasoningTokenCount;
    } catch (cacheCallErr: any) {
      console.warn(`[extractionEngine] Cached query failed, retrying inline:`, cacheCallErr.message);
      // Fallback to inline if cached generation errors
      cacheInfo = null;
    }
  }

  if (!cacheInfo || !rawText) {
    // Inline Multimodal / Text Path (used when paper < 32k tokens or caching unavailable)
    const effectiveGrounding = resolveEffectiveGroundingMode(paper);
    const contentsParts: any[] = [];

    if (effectiveGrounding === 'pdf') {
      try {
        const rawBase64 = await getPdfBase64(paper);
        const base64Data = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
        if (base64Data && base64Data.trim().length > 0) {
          contentsParts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data.trim(),
            },
          });
        }
      } catch (e: any) {
        console.warn(`PDF binary read note for "${paper.name}":`, e.message);
      }
    }

    if (contentsParts.length === 0) {
      const isAbstractOnly = effectiveGrounding === 'abstract_only';
      const docMarkdown = buildPaperMarkdownContext(paper, { abstractOnly: isAbstractOnly });
      if (docMarkdown.trim().length > 0) {
        contentsParts.push({
          text: `[DOCUMENT CONTENT: "${paper.title || paper.name}"]\n${docMarkdown}`,
        });
      }
    }

    contentsParts.push({ text: extractionPrompt });

    const res = await ai.models.generateContent({
      model: selectedModel,
      contents: contentsParts,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: extractionResponseSchema,
        abortSignal: signal,
      },
    });

    rawText = res.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = res.usageMetadata;
    promptTokens = usage?.promptTokenCount ?? 0;
    candidateTokens = usage?.candidatesTokenCount ?? 0;
    cachedTokens = usage?.cachedContentTokenCount;
    thinkingTokens = (usage as any)?.thinkingTokenCount ?? (usage as any)?.reasoningTokenCount;
  }

  if (!rawText) {
    throw new Error('Model returned an empty extraction response.');
  }

  const parsed = safeJsonParse(rawText);
  const rawObservations: any[] = Array.isArray(parsed.observations)
    ? parsed.observations
    : Array.isArray(parsed.rows)
    ? parsed.rows
    : Array.isArray(parsed)
    ? parsed
    : [parsed];

  const observations: SinglePaperObservation[] = rawObservations.map((obs) => {
    const fields: Record<string, string> = {};
    const citations: Record<string, GroundedEvidence> = {};

    lockedSchema.forEach((col) => {
      const val = obs[col.field] ?? obs[col.headerName] ?? 'Not reported';
      fields[col.field] = String(val).trim();

      const rawCit = obs.citations?.[col.field] ?? obs.citations?.[col.headerName];
      if (rawCit && typeof rawCit === 'object') {
        citations[col.field] = {
          snippetQuote: rawCit.snippetQuote || fields[col.field],
          sectionName: rawCit.sectionName || 'Extracted Section',
          pageNumber: Number(rawCit.pageNumber) || 1,
          paragraphNumber: rawCit.paragraphNumber || undefined,
          reasoning: rawCit.reasoning || `Extracted value "${fields[col.field]}"`,
          confidence: Number(rawCit.confidence) || 0.95,
        };
      } else {
        const isNotReported = fields[col.field] === 'Not reported';
        citations[col.field] = {
          snippetQuote: isNotReported ? 'Not reported in document' : fields[col.field],
          sectionName: isNotReported ? 'N/A' : 'Observation Section',
          pageNumber: 1,
          reasoning: isNotReported
            ? `Parameter "${col.headerName}" not reported in document.`
            : `Extracted value "${fields[col.field]}"`,
          confidence: isNotReported ? 0.99 : 0.95,
        };
      }
    });

    return { fields, citations };
  });

  const durationSec = Number(((performance.now() - startTime) / 1000).toFixed(2));

  return {
    paperId: paper.id,
    paperTitle: paper.title || paper.name,
    doi: paper.doi,
    observations,
    summary: parsed.summary || `Extracted ${observations.length} observation(s) from "${paper.title || paper.name}".`,
    tokensUsed: {
      promptTokens,
      candidateTokens,
      cachedTokens,
      thinkingTokens,
    },
    durationSec,
  };
}

/**
 * Stage 2: Extracts findings from a single research paper strictly adhering to the approved locked schema.
 * Routes dynamically to:
 * - Frontier Profile (Gemini): Explicit Context Caching + 1-shot Multimodal Extraction.
 * - Local/Open-Weight Profile (LM Studio / OpenRouter): Smart Section Windowing + Micro-Agentic Pipeline.
 */
export async function extractWithFixedSchema(
  options: ExtractWithFixedSchemaOptions
): Promise<SinglePaperExtractionResult> {
  const { lockedSchema } = options;

  if (!lockedSchema || lockedSchema.length === 0) {
    throw new Error('Cannot extract findings: No locked schema columns provided.');
  }

  const provider = getActiveProvider();
  const profile = options.executionProfile ?? 'auto';

  // Determine routing profile
  const useFrontier = profile === 'frontier' || (profile === 'auto' && provider === 'gemini');

  if (useFrontier) {
    return extractGeminiWithCache(options);
  }

  // Local / Open-Weight Micro-Agentic Route
  return extractLocalMicroAgentic(options);
}
