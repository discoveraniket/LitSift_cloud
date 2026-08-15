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
    description: 'Update the text content, reasoning, section name, and evidence box location of a specific table cell',
    parameters: {
      type: 'OBJECT',
      properties: {
        rowId: { type: 'STRING', description: 'Target row ID (e.g. 1, 2)' },
        field: { type: 'STRING', description: 'Column field name (e.g. Methodology, Sample Size, Key Results)' },
        newValue: { type: 'STRING', description: 'New extracted text value for the cell' },
        reasoning: { type: 'STRING', description: 'Explanation of why this value was chosen from the paper' },
        sectionName: { type: 'STRING', description: 'Paper section name (e.g. Section 2.1)' },
        pageNumber: { type: 'NUMBER', description: 'PDF page number containing the evidence' },
        snippetQuote: { type: 'STRING', description: 'Exact quote passage from the document' },
      },
      required: ['rowId', 'field', 'newValue', 'reasoning'],
    },
    execute: async (args: any, mode: AgentExecutionMode) => {
      const gridStore = useGridStore.getState();
      const logStore = useLogStore.getState();
      const { rowId, field, newValue, reasoning, sectionName, pageNumber, snippetQuote } = args;
      const targetRowId = String(rowId || '1');
      const row = gridStore.rows.find((r) => r.id === targetRowId) || gridStore.rows[0];

      logStore.addLog('info', `Executing updateCell on row "${targetRowId}", column "${field}"`, { newValue, reasoning });

      if (row) {
        gridStore.updateCell(row.id, field || 'Methodology', newValue);
        useGridStore.setState(
          produce((state: any) => {
            const target = state.rows.find((r: any) => r.id === row.id);
            if (target) {
              if (mode === 'human_in_loop') {
                target.aiStatus = 'Pending Review';
              } else {
                target.aiStatus = 'Confirmed';
              }
              if (!target.citationMap) target.citationMap = {};
              target.citationMap[field] = {
                pageNumber: pageNumber || 1,
                sectionName: sectionName || 'Section 2.1',
                snippetQuote: snippetQuote || newValue,
                reasoning: reasoning || 'Updated by Gemini Agent',
                confidence: 0.96,
              };
              state.activeCitation = target.citationMap[field];
            }
          })
        );
      }

      logStore.addLog('success', `Cell "${field}" updated successfully`);
      return {
        replyText: `Updated cell "${field}" in row ${targetRowId} to: "${newValue}". Reasoning & citations recorded!`,
        summary: `updateCell(${field} -> "${newValue}")`,
      };
    },
  },

  splitRow: {
    name: 'splitRow',
    description: 'Split a merged row into distinct sub-rows for each phage or experimental variable',
    parameters: {
      type: 'OBJECT',
      properties: {
        rowId: { type: 'STRING', description: 'Target row ID to split' },
        field: { type: 'STRING', description: 'Target column field to split by' },
      },
      required: ['rowId'],
    },
    execute: async (args: any) => {
      const gridStore = useGridStore.getState();
      const logStore = useLogStore.getState();
      logStore.addLog('info', `Splitting row ${args.rowId} by field ${args.field || 'auto'}`);
      gridStore.splitSelectedRow(args.rowId || '1', args.field);
      logStore.addLog('success', `Row ${args.rowId} split into distinct sub-rows`);
      return {
        replyText: `Successfully split row ${args.rowId} into distinct sub-rows!`,
        summary: `splitRow(rowId: ${args.rowId})`,
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
    description: 'Extract structured paper findings (Title, Methodology, Sample Size, Key Results, Limitations) from PDF into the data grid',
    parameters: {
      type: 'OBJECT',
      properties: {
        pdfId: { type: 'STRING', description: 'PDF ID to extract (e.g. 38094623.pdf)' },
      },
    },
    execute: async (args: any, mode: AgentExecutionMode) => {
      const gridStore = useGridStore.getState();
      const logStore = useLogStore.getState();
      const targetPdfTitle = args.pdfId || 'Active Research Paper';
      const apiKey = getGeminiApiKey();
      const selectedModel = getSelectedGeminiModel();

      logStore.addLog('info', `Starting extraction workflow for: "${targetPdfTitle}" using model "${selectedModel}"`);

      // Auto-initialize standard columns if grid is currently empty
      if (gridStore.columns.length === 0) {
        logStore.addLog('info', 'No schema columns found. Auto-initializing default columns: Methodology, Sample Size, Key Results, Limitations');
        gridStore.addColumn('Methodology');
        gridStore.addColumn('Sample Size');
        gridStore.addColumn('Key Results');
        gridStore.addColumn('Limitations');
      }

      const activeCols = useGridStore.getState().columns;
      const headers = activeCols.map((c) => c.headerName);

      if (!apiKey) {
        const err = 'GEMINI_API_KEY is missing. Please set your API key in Settings (⚙️).';
        logStore.addLog('error', err);
        throw new Error(err);
      }

      const pdfStore = usePdfStore.getState();
      let pdfInfo = pdfStore.getActivePdf() || pdfStore.pdfs.find((p) => p.name === targetPdfTitle || p.id === targetPdfTitle);
      if (!pdfInfo && pdfStore.pdfs.length > 0) {
        pdfInfo = pdfStore.pdfs[0];
      }

      const contentsParts: any[] = [];
      if (pdfInfo) {
        try {
          logStore.setActiveStep(`[1/3] Reading & encoding PDF "${pdfInfo.name}" to Base64...`);
          const base64Data = await getPdfBase64(pdfInfo);
          const sizeKb = Math.round(base64Data.length * 0.75 / 1024);
          logStore.addLog('info', `PDF encoded successfully (${sizeKb} KB)`);
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
      
      // Normalize rows: support both multi-row "rows" array and legacy "extractions" single object
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
        activeCols.forEach((col) => {
          if (citations[col.headerName] && !rowData.citationMap[col.field]) {
            rowData.citationMap[col.field] = citations[col.headerName];
          }
        });

        return rowData;
      });

      logStore.addLog('info', `Parsed ${rowsToAppend.length} structured row(s)`, rowsToAppend);

      gridStore.appendCsvDataset(headers, rowsToAppend);

      // Set active citation to the first extracted cell of the newest row
      useGridStore.setState(
        produce((state: any) => {
          const newestRow = state.rows[state.rows.length - 1];
          if (newestRow && newestRow.citationMap) {
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
  return Object.values(agentToolsRegistry).map((tool) => {
    const spec: any = {
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    };

    if (mode === 'autonomous_autopilot') {
      spec.execute = (args: any) => tool.execute(args, mode);
    }

    return spec;
  });
}
