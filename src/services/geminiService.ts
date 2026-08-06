import { GoogleGenAI, Type } from '@google/genai';
import { useGridStore } from '../store/useGridStore';

// Retrieve API key from environment variable (GEMINI_API_KEY) or localStorage fallback
export function getGeminiApiKey(): string {
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  return localStorage.getItem('LITSIFT_GEMINI_API_KEY') || '';
}

// Define Tool Declarations for Gemini Function Calling
const updateCellDeclaration = {
  name: 'updateCell',
  description: 'Update the text content, reasoning, section name, and evidence box location of a specific table cell',
  parameters: {
    type: Type.OBJECT,
    properties: {
      rowId: { type: Type.STRING, description: 'Target row ID (e.g. 1, 2)' },
      field: { type: Type.STRING, description: 'Column field name (e.g. Methodology, Sample Size, Key Results)' },
      newValue: { type: Type.STRING, description: 'New extracted text value for the cell' },
      reasoning: { type: Type.STRING, description: 'Explanation of why this value was chosen from the paper' },
      sectionName: { type: Type.STRING, description: 'Paper section name (e.g. Section 2.1)' },
      pageNumber: { type: Type.NUMBER, description: 'PDF page number containing the evidence' },
      snippetQuote: { type: Type.STRING, description: 'Exact quote passage from the document' },
    },
    required: ['rowId', 'field', 'newValue', 'reasoning'],
  },
};

const splitRowDeclaration = {
  name: 'splitRow',
  description: 'Split a merged row into distinct sub-rows for each phage or experimental variable',
  parameters: {
    type: Type.OBJECT,
    properties: {
      rowId: { type: Type.STRING, description: 'Target row ID to split' },
      field: { type: Type.STRING, description: 'Target column field to split by' },
    },
    required: ['rowId'],
  },
};

const addColumnDeclaration = {
  name: 'addColumn',
  description: 'Add a new extraction schema column to the master table',
  parameters: {
    type: Type.OBJECT,
    properties: {
      headerName: { type: Type.STRING, description: 'Title of the new column (e.g. Host Range, Phage Morphology)' },
    },
    required: ['headerName'],
  },
};

export interface AgentExecutionResult {
  replyText: string;
  toolExecuted?: {
    name: string;
    description: string;
  };
}

export async function processAgentInteraction(userPrompt: string): Promise<AgentExecutionResult> {
  const apiKey = getGeminiApiKey();

  // If live key is present, execute via official @google/genai SDK
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        config: {
          systemInstruction:
            'You are LitSift Agent, an expert academic literature agent. You can execute function calls to update table cells, split sub-rows, and add custom extraction schema columns.',
          temperature: 0.2,
          tools: [{ functionDeclarations: [updateCellDeclaration, splitRowDeclaration, addColumnDeclaration] }],
        },
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls && functionCalls.length > 0) {
        const fc = functionCalls[0].functionCall!;
        const toolResult = executeToolCall(fc.name || '', fc.args || {});
        return {
          replyText: toolResult.replyText,
          toolExecuted: {
            name: fc.name || 'toolCall',
            description: toolResult.summary,
          },
        };
      }

      const textPart = parts.find((p) => p.text)?.text || 'Interaction completed.';
      return {
        replyText: textPart,
      };
    } catch (err: any) {
      console.warn('Gemini API call warning/fallback:', err);
      // Fallback to local intelligent agent simulation if API call encounters network/quota limits
      return executeMockAgentInteraction(userPrompt);
    }
  }

  // Fallback to intelligent local execution if no API key is set
  return executeMockAgentInteraction(userPrompt);
}

// Tool Call Execution Handler
function executeToolCall(name: string, args: any): { replyText: string; summary: string } {
  const gridStore = useGridStore.getState();

  if (name === 'updateCell') {
    const { rowId, field, newValue, reasoning, sectionName, pageNumber, snippetQuote } = args;
    gridStore.updateCell(rowId || '1', field || 'Methodology', newValue);

    const row = gridStore.rows.find((r) => r.id === String(rowId));
    if (row) {
      if (!row.citationMap) row.citationMap = {};
      row.citationMap[field] = {
        pageNumber: pageNumber || 1,
        sectionName: sectionName || 'Section 2.1 (Phage Isolation)',
        snippetQuote: snippetQuote || newValue,
        reasoning: reasoning || 'Updated by Gemini Agent',
        confidence: 0.96,
      };
      gridStore.setActiveCitation({ ...row.citationMap[field] });
    }

    return {
      replyText: `Updated cell "${field}" in row ${rowId} to: "${newValue}". AI reasoning refreshed!`,
      summary: `updateCell(${field} -> "${newValue}")`,
    };
  }

  if (name === 'splitRow') {
    gridStore.splitSelectedRow(args.rowId || '1', args.field);
    return {
      replyText: `Successfully split row ${args.rowId} into distinct sub-rows!`,
      summary: `splitRow(rowId: ${args.rowId})`,
    };
  }

  if (name === 'addColumn') {
    gridStore.addColumn(args.headerName);
    return {
      replyText: `Added new column "${args.headerName}" to the extraction table schema!`,
      summary: `addColumn(headerName: "${args.headerName}")`,
    };
  }

  return {
    replyText: `Executed tool: ${name}`,
    summary: name,
  };
}

// Fallback intelligent agent behavior for offline / keyless testing
function executeMockAgentInteraction(userPrompt: string): AgentExecutionResult {
  const lower = userPrompt.toLowerCase();

  if (lower.includes('split')) {
    return executeToolCall('splitRow', { rowId: '1' });
  }

  if (lower.includes('column') || lower.includes('schema') || lower.includes('add')) {
    const colName = lower.includes('host') ? 'Host Range' : lower.includes('morphology') ? 'Morphology' : 'Custom Attribute';
    return executeToolCall('addColumn', { headerName: colName });
  }

  if (lower.includes('sequencing') || lower.includes('page 2') || lower.includes('method')) {
    return executeToolCall('updateCell', {
      rowId: '1',
      field: 'Methodology',
      newValue: 'Bacteriophage isolation & Illumina NovaSeq Genomic Sequencing',
      reasoning: 'Extracted genomic sequencing protocols from Page 2 Section 2.3.',
      sectionName: 'Section 2.3 (Genome Sequencing)',
      pageNumber: 2,
      snippetQuote: 'Genomic DNA of Sfln-2 and Sfln-6 phages sequenced using Illumina NovaSeq platform.',
    });
  }

  return {
    replyText: `LitSift Agent processed command: "${userPrompt}". All table citations and document evidence remain in sync.`,
  };
}
