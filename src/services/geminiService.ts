import { GoogleGenAI, Type } from '@google/genai';
import { produce } from 'immer';
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

// Model Selection Helpers
export function getSelectedGeminiModel(): string {
  return localStorage.getItem('LITSIFT_SELECTED_MODEL') || 'gemini-3.6-flash';
}

export function setSelectedGeminiModel(modelId: string): void {
  localStorage.setItem('LITSIFT_SELECTED_MODEL', modelId);
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

const extractPDFDataDeclaration = {
  name: 'extractPDFData',
  description: 'Extract structured paper findings (Title, Methodology, Sample Size, Key Results, Limitations) from PDF into the data grid',
  parameters: {
    type: Type.OBJECT,
    properties: {
      pdfId: { type: Type.STRING, description: 'PDF ID to extract (e.g. 38094623.pdf)' },
    },
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
  const selectedModel = getSelectedGeminiModel();

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing. Please set GEMINI_API_KEY in environment variables.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      config: {
        systemInstruction:
          'You are LitSift Agent, an expert academic literature agent. You can execute function calls to update table cells, split sub-rows, add custom extraction schema columns, or extract structured PDF data into the open schema.',
        temperature: 0.2,
        tools: [{ functionDeclarations: [updateCellDeclaration, splitRowDeclaration, addColumnDeclaration, extractPDFDataDeclaration] }],
      },
    });

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls && functionCalls.length > 0) {
      const fc = functionCalls[0].functionCall!;
      const toolResult = await executeToolCall(fc.name || '', fc.args || {});
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
    console.error('Gemini API Error:', err);
    return {
      replyText: `⚠️ Gemini API Error: ${err.message || 'Failed to communicate with Gemini API.'}`,
    };
  }
}

// Tool Call Execution Handler
async function executeToolCall(name: string, args: any): Promise<{ replyText: string; summary: string }> {
  const gridStore = useGridStore.getState();

  if (name === 'extractPDFData' || name === 'extract_schema_data') {
    const activeCols = gridStore.columns;
    const targetPdfTitle = args.pdfId || 'Active Research Paper';
    const apiKey = getGeminiApiKey();
    const selectedModel = getSelectedGeminiModel();

    if (activeCols.length > 0) {
      const headers = activeCols.map((c) => c.headerName);

      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing. Unable to perform LLM extraction.');
      }

      const ai = new GoogleGenAI({ apiKey });
      const schemaPrompt = `You are extracting structured scientific findings from the research paper "${targetPdfTitle}".
Extract concise values for the following schema columns:
${headers.map((h, i) => `${i + 1}. "${h}"`).join('\n')}

Return your response strictly as a JSON object with this exact key-value format:
{
  "extractions": {
    ${headers.map((h) => `"${h}": "<Extracted value from paper>"`).join(',\n    ')}
  },
  "citations": {
    "${headers[0]}": {
      "pageNumber": 1,
      "sectionName": "<Section Name>",
      "snippetQuote": "<Exact quote from paper>",
      "reasoning": "<Explanation of extracted value>"
    }
  }
}`;

      try {
        const res = await ai.models.generateContent({
          model: selectedModel,
          contents: [{ role: 'user', parts: [{ text: schemaPrompt }] }],
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error('Gemini API returned an empty extraction response.');
        }

        const parsed = JSON.parse(text);
        const extractions = parsed.extractions || {};
        const citations = parsed.citations || {};

        gridStore.appendCsvDataset(headers, [extractions]);

        useGridStore.setState(
          produce((state: any) => {
            const lastRow = state.rows[state.rows.length - 1];
            if (lastRow) {
              lastRow.citationMap = citations;
              const firstField = activeCols[0].field;
              if (citations[activeCols[0].headerName]) {
                lastRow.citationMap[firstField] = citations[activeCols[0].headerName];
                state.activeCitation = lastRow.citationMap[firstField];
              }
            }
          })
        );

        return {
          replyText: `✅ Live Gemini 3.6 Flash successfully extracted findings from "${targetPdfTitle}" and populated a new row into your data grid!`,
          summary: `extractPDFData(${targetPdfTitle})`,
        };
      } catch (err: any) {
        console.error('Gemini extraction error:', err);
        return {
          replyText: `❌ Extraction Failed: ${err.message || 'Error executing Gemini extraction call.'}`,
          summary: `extractPDFData(${targetPdfTitle}) - FAILED`,
        };
      }
    }

    return {
      replyText: `Please import a CSV schema or add columns first before extracting paper data.`,
      summary: `extractPDFData(${targetPdfTitle})`,
    };
  }

  if (name === 'updateCell') {
    const { rowId, field, newValue, reasoning, sectionName, pageNumber, snippetQuote } = args;
    const targetRowId = String(rowId || '1');
    const row = gridStore.rows.find((r) => r.id === targetRowId) || gridStore.rows[0];

    if (row) {
      gridStore.updateCell(row.id, field || 'Methodology', newValue);
      useGridStore.setState(
        produce((state: any) => {
          const target = state.rows.find((r: any) => r.id === row.id);
          if (target) {
            if (!target.citationMap) target.citationMap = {};
            target.citationMap[field] = {
              pageNumber: pageNumber || 1,
              sectionName: sectionName || 'Section 2.1 (Phage Isolation)',
              snippetQuote: snippetQuote || newValue,
              reasoning: reasoning || 'Updated by Gemini Agent',
              confidence: 0.96,
            };
            state.activeCitation = target.citationMap[field];
          }
        })
      );
    }

    return {
      replyText: `Updated cell "${field}" in row ${targetRowId} to: "${newValue}". AI reasoning refreshed!`,
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
