import { produce } from 'immer';
import { useGridStore } from '../store/useGridStore';
import { usePdfStore } from '../store/usePdfStore';
import { useLogStore } from '../store/useLogStore';
import { getGeminiApiKey, getSelectedGeminiModel } from './geminiService';
import { getPdfBase64 } from './pdfUtils';
import { GoogleGenAI } from '@google/genai';

export type AgentExecutionMode = 'human_in_loop' | 'autonomous_autopilot';

export interface ToolExecutionResult {
  replyText: string;
  summary: string;
  resultData?: any;
}

export interface AgentToolSpec {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: any, mode: AgentExecutionMode) => Promise<ToolExecutionResult>;
}

export const agentToolsRegistry: Record<string, AgentToolSpec> = {
  updateCell: {
    name: 'updateCell',
    description: 'Update the text content, reasoning, section name, and evidence location of a specific table cell',
    parameters: {
      type: 'OBJECT',
      properties: {
        rowId: { type: 'STRING', description: 'Target row ID. If modifying the currently focused row, leave empty.' },
        field: { type: 'STRING', description: 'Target column field key to update (e.g. methodology, sampleSize, keyResults, limitations)' },
        newValue: { type: 'STRING', description: 'New extracted text value for the cell' },
        reasoning: { type: 'STRING', description: 'Explanation of why this value was chosen from the paper' },
        sectionName: { type: 'STRING', description: 'Paper section name (e.g. Section 2.1, Table 3)' },
        pageNumber: { type: 'NUMBER', description: 'PDF page number containing the evidence' },
        snippetQuote: { type: 'STRING', description: 'Exact quote passage from the document' },
      },
      required: ['newValue', 'reasoning'],
    },
    execute: async (args: any, mode: AgentExecutionMode) => {
      const gridStore = useGridStore.getState();
      const logStore = useLogStore.getState();
      const { rowId, field, newValue, reasoning, sectionName, pageNumber, snippetQuote } = args;

      // Deterministic target resolution: bind to focusedCell if available
      const focused = gridStore.focusedCell;
      let targetRow = gridStore.rows.find((r) => r.id === rowId);
      if (!targetRow && focused) {
        targetRow = gridStore.rows.find((r) => r.id === focused.rowId);
      }
      if (!targetRow && gridStore.rows.length > 0) {
        targetRow = gridStore.rows[0];
      }

      if (!targetRow) {
        throw new Error('No table row found to update. Extract data from a paper first.');
      }

      // Deterministic column field resolution:
      // Match exact field, or case-insensitive match, or fallback to focusedCell.field
      const allCols = gridStore.columns;
      let targetCol = allCols.find((c) => c.field === field || c.headerName.toLowerCase() === (field || '').toLowerCase());
      if (!targetCol && field) {
        const cleanField = field.toLowerCase().replace(/[^a-z0-9]/g, '');
        targetCol = allCols.find((c) => c.field.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanField);
      }
      if (!targetCol && focused) {
        targetCol = allCols.find((c) => c.field === focused.field);
      }
      const targetField = targetCol?.field || field || allCols[0]?.field || 'methodology';
      const colHeader = targetCol?.headerName || targetField;

      logStore.addLog('info', `Executing updateCell on row "${targetRow.pdfTitle}" [${targetRow.id}], column "${colHeader}"`, {
        newValue,
        reasoning,
      });

      // 1. Update cell value in gridStore
      gridStore.updateCell(targetRow.id, targetField, newValue);

      // 2. Update rich citation and AI review status
      useGridStore.setState(
        produce((state: any) => {
          const row = state.rows.find((r: any) => r.id === targetRow.id);
          if (row) {
            row[targetField] = newValue;
            row.aiStatus = mode === 'human_in_loop' ? 'Pending Review' : 'Confirmed';
            if (!row.citationMap) row.citationMap = {};
            row.citationMap[targetField] = {
              pageNumber: pageNumber || 1,
              sectionName: sectionName || 'Verified Section',
              snippetQuote: snippetQuote || newValue,
              reasoning: reasoning || 'Updated by Gemini Agent',
              confidence: 0.98,
            };
            if (state.focusedCell?.rowId === row.id && state.focusedCell?.field === targetField) {
              state.activeCitation = row.citationMap[targetField];
            }
          }
        })
      );

      logStore.addLog('success', `Cell "${colHeader}" updated to "${newValue}"`);
      return {
        replyText: `Updated cell **"${colHeader}"** in row *"${targetRow.pdfTitle}"* to: **"${newValue}"**.\n\n💡 *Reasoning:* ${reasoning}`,
        summary: `updateCell(${colHeader} -> "${newValue}")`,
        resultData: {
          rowId: targetRow.id,
          field: targetField,
          newValue,
          reasoning,
        },
      };
    },
  },

  splitRow: {
    name: 'splitRow',
    description: 'Split a merged row into distinct sub-rows for each phage or experimental variable',
    parameters: {
      type: 'OBJECT',
      properties: {
        rowId: { type: 'STRING', description: 'Target row ID to split. Defaults to focused row.' },
        field: { type: 'STRING', description: 'Target column field to split by' },
      },
    },
    execute: async (args: any) => {
      const gridStore = useGridStore.getState();
      const logStore = useLogStore.getState();
      const targetRowId = args.rowId || gridStore.focusedCell?.rowId || gridStore.rows[0]?.id;
      if (!targetRowId) throw new Error('No row available to split.');

      logStore.addLog('info', `Splitting row ${targetRowId} by field ${args.field || 'auto'}`);
      gridStore.splitSelectedRow(targetRowId, args.field);
      logStore.addLog('success', `Row ${targetRowId} split into distinct sub-rows`);
      return {
        replyText: `Successfully split row into distinct sub-rows!`,
        summary: `splitRow(rowId: ${targetRowId})`,
      };
    },
  },

  addColumn: {
    name: 'addColumn',
    description: 'Add a new extraction schema column to the master table',
    parameters: {
      type: 'OBJECT',
      properties: {
        headerName: { type: 'STRING', description: 'Title of the new column (e.g. Host Range, Phage Morphology)' },
      },
      required: ['headerName'],
    },
    execute: async (args: any) => {
      const gridStore = useGridStore.getState();
      const logStore = useLogStore.getState();
      logStore.addLog('info', `Adding column "${args.headerName}" to schema`);
      gridStore.addColumn(args.headerName);
      logStore.addLog('success', `Column "${args.headerName}" added`);
      return {
        replyText: `Added new column "${args.headerName}" to the extraction table schema!`,
        summary: `addColumn(headerName: "${args.headerName}")`,
      };
    },
  },

  extractPDFData: {
    name: 'extractPDFData',
    description: 'Extract structured paper findings from PDF into the data grid',
    parameters: {
      type: 'OBJECT',
      properties: {
        pdfId: { type: 'STRING', description: 'PDF title or ID to extract' },
      },
    },
    execute: async (args: any, mode: AgentExecutionMode) => {
      const gridStore = useGridStore.getState();
      const logStore = useLogStore.getState();
      const targetPdfTitle = args.pdfId || 'Active Research Paper';
      const apiKey = getGeminiApiKey();
      const selectedModel = getSelectedGeminiModel();

      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured in settings or environment.');
      }

      logStore.setActiveStep(`[1/3] Reading PDF document & schema columns...`);
      logStore.addLog('info', `Starting extraction for "${targetPdfTitle}" using ${selectedModel}`);

      const pdfStore = usePdfStore.getState();
      const pdfInfo = pdfStore.pdfs.find((p) => p.id === targetPdfTitle || p.name === targetPdfTitle) || pdfStore.getActivePdf();

      const headers = gridStore.columns.map((c) => c.field);
      if (headers.length === 0) {
        throw new Error('No schema columns defined in the table.');
      }

      const contentsParts: any[] = [];

      if (pdfInfo) {
        try {
          const base64Data = await getPdfBase64(pdfInfo);
          contentsParts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data,
            },
          });
        } catch (e: any) {
          logStore.addLog('warn', `PDF binary attachment warning: ${e.message}`);
        }
      }

      const schemaPrompt = `You are extracting structured scientific findings from the attached research paper PDF document ("${pdfInfo?.name || targetPdfTitle}").

Extract concise values for the following schema columns:
${headers.map((h, i) => `${i + 1}. "${h}"`).join('\n')}

If the paper tests multiple distinct variables, experimental groups, treatments, or pairwise combinations (e.g., Sample A × C = E, Sample A × D = F), emit a DISTINCT ROW for each tested subject/observation that has actual experimental results, ignoring background mentions, so that every finding is represented as an atomic, unambiguous entry.

Return your response strictly as a JSON object with this format:
{
  "rows": [
    {
      ${headers.map((h) => `"${h}": "<Extracted value from paper>"`).join(',\n      ')},
      "citations": {
        "${headers[0]}": {
          "pageNumber": 1,
          "sectionName": "<Section Name>",
          "snippetQuote": "<Exact quote from paper>",
          "reasoning": "<Explanation of extracted value>"
        }
      }
    }
  ]
}`;

      contentsParts.push({ text: schemaPrompt });

      logStore.setActiveStep(`[2/3] Transmitting request to Google Gemini (${selectedModel})...`);
      const startTime = Date.now();

      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: selectedModel,
        contents: contentsParts,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logStore.addLog('info', `Received response from Gemini in ${elapsed}s`);

      const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        const err = 'Gemini API returned an empty extraction response.';
        logStore.addLog('error', err);
        throw new Error(err);
      }

      logStore.setActiveStep(`[3/3] Parsing JSON payload & populating table grid...`);
      const parsed = JSON.parse(text);
      
      let rawRows: any[] = [];
      if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        rawRows = parsed.rows;
      } else if (parsed.extractions && typeof parsed.extractions === 'object') {
        rawRows = [{ ...parsed.extractions, citations: parsed.citations || {} }];
      } else if (Array.isArray(parsed)) {
        rawRows = parsed;
      } else {
        rawRows = [parsed];
      }

      const activePdfId = usePdfStore.getState().activePdfId;
      const rowsToAppend = rawRows.map((r: any) => {
        const rowData: Record<string, any> = {
          pdfId: pdfInfo?.id || activePdfId || `pdf-${Date.now()}`,
          pdfTitle: pdfInfo?.name || targetPdfTitle,
          aiStatus: mode === 'human_in_loop' ? 'Pending Review' : 'Confirmed',
        };

        const citations = r.citations || parsed.citations || {};
        rowData.citationMap = citations;

        headers.forEach((h) => {
          if (r[h] !== undefined) {
            rowData[h] = r[h];
          }
        });

        // Ensure citationMap maps to column field keys as well
        Object.keys(citations).forEach((key) => {
          const matchingCol = gridStore.columns.find(
            (c) => c.headerName.toLowerCase() === key.toLowerCase() || c.field.toLowerCase() === key.toLowerCase()
          );
          if (matchingCol && !rowData.citationMap[matchingCol.field]) {
            rowData.citationMap[matchingCol.field] = citations[key];
          }
        });

        return rowData;
      });

      // Append extracted rows to gridStore
      gridStore.appendCsvDataset(headers, rowsToAppend);

      // Auto-focus first citation of first extracted row
      useGridStore.setState(
        produce((state: any) => {
          const newestRow = state.rows[state.rows.length - rowsToAppend.length];
          if (newestRow && newestRow.citationMap) {
            const activeCols = state.columns;
            const firstField = activeCols[0]?.field;
            if (firstField && newestRow.citationMap[firstField]) {
              state.activeCitation = newestRow.citationMap[firstField];
            }
          }
        })
      );

      logStore.setActiveStep(null);
      logStore.addLog('success', `Extraction completed in ${elapsed}s. ${rowsToAppend.length} row(s) staged for review.`);

      return {
        replyText: `✅ Gemini ${selectedModel} extracted ${rowsToAppend.length} structured finding row(s) from "${pdfInfo?.name || targetPdfTitle}" in ${elapsed}s! Staged in table (Pending Review).`,
        summary: `extractPDFData(${pdfInfo?.name || targetPdfTitle}) -> ${rowsToAppend.length} rows`,
        resultData: rowsToAppend,
      };
    },
  },
};

export function getToolsForMode(mode: AgentExecutionMode = 'human_in_loop') {
  const activeCols = useGridStore.getState().columns;
  const activeFields = activeCols.map((c) => c.field);

  return Object.values(agentToolsRegistry).map((tool) => {
    const parameters = JSON.parse(JSON.stringify(tool.parameters));
    
    // Dynamically inject active column fields as an enum for updateCell
    if (tool.name === 'updateCell' && activeFields.length > 0 && parameters.properties?.field) {
      parameters.properties.field.enum = activeFields;
      parameters.properties.field.description = `Target column field key. Must be one of: ${activeFields.join(', ')}`;
    }

    const spec: any = {
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters,
    };

    if (mode === 'autonomous_autopilot') {
      spec.execute = (args: any) => tool.execute(args, mode);
    }

    return spec;
  });
}
