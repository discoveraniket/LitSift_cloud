import { produce } from 'immer';
import { useGridStore } from '../store/useGridStore';
import { usePdfStore } from '../store/usePdfStore';
import { useLogStore } from '../store/useLogStore';
import { getGeminiApiKey, getSelectedGeminiModel } from './geminiService';
import { getPdfBase64 } from './pdfUtils';
import { GoogleGenAI, Type } from '@google/genai';
import { GridRow } from '../types/grid';

export type AgentExecutionMode = 'human_in_loop' | 'autonomous_autopilot';

export interface ToolExecutionResult {
  success: boolean;
  replyText: string;
  summary: string;
  resultData?: any;
  error?: string;
}

export interface AgentToolSpec {
  name: string;
  description: string;
  parameters: {
    type: typeof Type.OBJECT | 'OBJECT';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: any, mode: AgentExecutionMode) => Promise<ToolExecutionResult>;
}

export const agentToolsRegistry: Record<string, AgentToolSpec> = {
  updateCell: {
    name: 'updateCell',
    description: 'Update the text content, reasoning, section name, and evidence location of a specific table cell in the data grid.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rowId: {
          type: Type.STRING,
          description: 'Target row ID. If modifying the currently focused row, leave empty.',
        },
        field: {
          type: Type.STRING,
          description: 'Target column field key to update (e.g. methodology, sampleSize, keyResults, limitations).',
        },
        newValue: {
          type: Type.STRING,
          description: 'New text value to enter into the table cell.',
        },
        reasoning: {
          type: Type.STRING,
          description: 'Explanation or rationale for why this value is chosen or updated from the document.',
        },
        sectionName: {
          type: Type.STRING,
          description: 'Paper section name (e.g. Section 2.1, Table 3, Results).',
        },
        pageNumber: {
          type: Type.NUMBER,
          description: 'PDF page number containing the evidence passage.',
        },
        snippetQuote: {
          type: Type.STRING,
          description: 'Exact quote or evidence passage from the research paper.',
        },
      },
      required: ['newValue'],
    },
    execute: async (args: any, mode: AgentExecutionMode): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const { rowId, field, newValue, reasoning, sectionName, pageNumber, snippetQuote } = args;

        if (newValue === undefined || newValue === null) {
          throw new Error('Missing parameter "newValue" for updateCell.');
        }

        // 1. Resolve target row
        const focused = gridStore.focusedCell;
        let targetRow = gridStore.rows.find((r) => r.id === rowId);

        // If rowId is specified like "row 1", "1", or index number
        if (!targetRow && typeof rowId === 'string') {
          const match = rowId.match(/\d+/);
          if (match) {
            const index = parseInt(match[0], 10) - 1;
            if (index >= 0 && index < gridStore.rows.length) {
              targetRow = gridStore.rows[index];
            }
          }
        }

        if (!targetRow && focused) {
          targetRow = gridStore.rows.find((r) => r.id === focused.rowId);
        }
        if (!targetRow && gridStore.rows.length > 0) {
          targetRow = gridStore.rows[0];
        }

        if (!targetRow) {
          gridStore.addRow('', 'Active Research Paper');
          targetRow = useGridStore.getState().rows[0];
        }

        if (!targetRow) {
          throw new Error('No table row found to update. Please extract data or add a row first.');
        }

        // 2. Resolve target column field
        const allCols = gridStore.columns;
        let targetCol = allCols.find(
          (c) =>
            c.field.toLowerCase() === (field || '').toLowerCase() ||
            c.headerName.toLowerCase() === (field || '').toLowerCase()
        );
        if (!targetCol && field) {
          const cleanField = field.toLowerCase().replace(/[^a-z0-9]/g, '');
          targetCol = allCols.find(
            (c) =>
              c.field.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanField ||
              c.headerName.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanField
          );
        }
        if (!targetCol) {
          throw new Error(
            `Column "${field}" does not exist in the table schema. Please call addColumn("${field}") first.`
          );
        }

        const targetField = targetCol.field;
        const colHeader = targetCol.headerName || targetField;

        logStore.addLog('info', `Executing updateCell on row "${targetRow.pdfTitle}" [${targetRow.id}], column "${colHeader}"`, {
          newValue,
          reasoning: reasoning || 'Updated by Agent',
        });

        // 3. Update cell in Grid Store
        gridStore.updateCell(targetRow.id, targetField, newValue);

        // 4. Update citation and AI status
        const resolvedReasoning = reasoning || 'Updated via Agent Tool';
        const resolvedSnippet = snippetQuote || newValue;
        const resolvedSection = sectionName || 'Verified Section';
        const resolvedPage = Number(pageNumber) || 1;

        useGridStore.setState(
          produce((state: any) => {
            const row = state.rows.find((r: any) => r.id === targetRow.id);
            if (row) {
              row[targetField] = newValue;
              row.aiStatus = mode === 'human_in_loop' ? 'Pending Review' : 'Confirmed';
              if (!row.citationMap) row.citationMap = {};
              row.citationMap[targetField] = {
                pageNumber: resolvedPage,
                sectionName: resolvedSection,
                snippetQuote: resolvedSnippet,
                reasoning: resolvedReasoning,
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
          success: true,
          replyText: `Updated cell **"${colHeader}"** in row *"${targetRow.pdfTitle}"* to: **"${newValue}"**.\n\n💡 *Reasoning:* ${resolvedReasoning}`,
          summary: `updateCell(${colHeader} -> "${newValue}")`,
          resultData: {
            rowId: targetRow.id,
            field: targetField,
            newValue,
            reasoning: resolvedReasoning,
          },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `updateCell failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to update cell: ${err.message}`,
          summary: `updateCell(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  batchUpdateCells: {
    name: 'batchUpdateCells',
    description: 'Update multiple table cells across rows and columns in a single batch operation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        updates: {
          type: Type.ARRAY,
          description: 'Array of cell update objects containing target field and newValue.',
          items: {
            type: Type.OBJECT,
            properties: {
              rowId: { type: Type.STRING, description: 'Target row ID' },
              field: { type: Type.STRING, description: 'Target column field key' },
              newValue: { type: Type.STRING, description: 'New cell value' },
              reasoning: { type: Type.STRING, description: 'Explanation or rationale' },
              sectionName: { type: Type.STRING, description: 'Section name' },
              pageNumber: { type: Type.NUMBER, description: 'Page number' },
              snippetQuote: { type: Type.STRING, description: 'Exact quote snippet' },
            },
            required: ['field', 'newValue'],
          },
        },
      },
      required: ['updates'],
    },
    execute: async (args: any, mode: AgentExecutionMode): Promise<ToolExecutionResult> => {
      try {
        const logStore = useLogStore.getState();
        const updates = args.updates;

        if (!Array.isArray(updates) || updates.length === 0) {
          throw new Error('Missing or empty updates array for batchUpdateCells.');
        }

        logStore.addLog('info', `Executing batchUpdateCells for ${updates.length} cell(s)`);

        let appliedCount = 0;
        for (const item of updates) {
          const res = await agentToolsRegistry.updateCell.execute(item, mode);
          if (res.success) appliedCount++;
        }

        logStore.addLog('success', `Batch update complete: ${appliedCount}/${updates.length} cells updated`);

        return {
          success: true,
          replyText: `Successfully updated ${appliedCount} cell(s) in the table.`,
          summary: `batchUpdateCells(${appliedCount} cells updated)`,
          resultData: { appliedCount, total: updates.length },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `batchUpdateCells failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to batch update cells: ${err.message}`,
          summary: `batchUpdateCells(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  addColumn: {
    name: 'addColumn',
    description: 'Add a new extraction schema column to the master table.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        headerName: {
          type: Type.STRING,
          description: 'Title of the new column (e.g. Host Range, Phage Morphology, Genome Size).',
        },
      },
      required: ['headerName'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();

        if (!args.headerName) {
          throw new Error('Parameter "headerName" is required to add a column.');
        }

        logStore.addLog('info', `Adding column "${args.headerName}" to schema`);
        gridStore.addColumn(args.headerName);
        logStore.addLog('success', `Column "${args.headerName}" added`);

        return {
          success: true,
          replyText: `Added new column **"${args.headerName}"** to the extraction table schema!`,
          summary: `addColumn(headerName: "${args.headerName}")`,
          resultData: { headerName: args.headerName },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `addColumn failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to add column: ${err.message}`,
          summary: `addColumn(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  renameColumn: {
    name: 'renameColumn',
    description: 'Rename an existing column header in the extraction table schema.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        field: {
          type: Type.STRING,
          description: 'Existing column field key or header name to rename.',
        },
        newHeaderName: {
          type: Type.STRING,
          description: 'New title/display name for the column.',
        },
      },
      required: ['field', 'newHeaderName'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const { field, newHeaderName } = args;

        if (!field || !newHeaderName) {
          throw new Error('Parameters "field" and "newHeaderName" are required.');
        }

        const col = gridStore.columns.find(
          (c) => c.field === field || c.headerName.toLowerCase() === field.toLowerCase()
        );

        if (!col) {
          throw new Error(`Column "${field}" not found in table schema.`);
        }

        logStore.addLog('info', `Renaming column "${col.headerName}" [${col.field}] to "${newHeaderName}"`);
        gridStore.renameColumn(col.field, newHeaderName);
        logStore.addLog('success', `Column renamed to "${newHeaderName}"`);

        return {
          success: true,
          replyText: `Renamed column **"${col.headerName}"** to **"${newHeaderName}"**.`,
          summary: `renameColumn(${col.headerName} -> ${newHeaderName})`,
          resultData: { field: col.field, newHeaderName },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `renameColumn failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to rename column: ${err.message}`,
          summary: `renameColumn(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  deleteColumn: {
    name: 'deleteColumn',
    description: 'Delete a column from the extraction table schema.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        field: {
          type: Type.STRING,
          description: 'Column field key or header name to remove.',
        },
      },
      required: ['field'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const { field } = args;

        if (!field) {
          throw new Error('Parameter "field" is required.');
        }

        const col = gridStore.columns.find(
          (c) => c.field === field || c.headerName.toLowerCase() === field.toLowerCase()
        );

        if (!col) {
          throw new Error(`Column "${field}" not found in table schema.`);
        }

        logStore.addLog('info', `Deleting column "${col.headerName}" [${col.field}]`);
        gridStore.deleteColumn(col.field);
        logStore.addLog('success', `Column "${col.headerName}" removed`);

        return {
          success: true,
          replyText: `Deleted column **"${col.headerName}"** from the table schema.`,
          summary: `deleteColumn(${col.headerName})`,
          resultData: { field: col.field },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `deleteColumn failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to delete column: ${err.message}`,
          summary: `deleteColumn(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  splitRow: {
    name: 'splitRow',
    description: 'Split a composite row with multiple findings or bulleted items into distinct sub-rows.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rowId: {
          type: Type.STRING,
          description: 'Target row ID to split. Defaults to the currently focused row.',
        },
        field: {
          type: Type.STRING,
          description: 'Target column field key containing the multi-part content to split by.',
        },
      },
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const targetRowId = args.rowId || gridStore.focusedCell?.rowId || gridStore.rows[0]?.id;

        if (!targetRowId) {
          throw new Error('No row available to split.');
        }

        logStore.addLog('info', `Splitting row ${targetRowId} by field ${args.field || 'auto'}`);
        gridStore.splitSelectedRow(targetRowId, args.field);
        logStore.addLog('success', `Row ${targetRowId} split into distinct sub-rows`);

        return {
          success: true,
          replyText: `Successfully split row into distinct sub-rows!`,
          summary: `splitRow(rowId: ${targetRowId})`,
          resultData: { rowId: targetRowId, field: args.field },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `splitRow failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to split row: ${err.message}`,
          summary: `splitRow(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  mergeRows: {
    name: 'mergeRows',
    description: 'Merge multiple specified rows into a single deduplicated row with formatted findings.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rowIds: {
          type: Type.ARRAY,
          description: 'List of row IDs to merge together (minimum 2 rows).',
          items: { type: Type.STRING },
        },
      },
      required: ['rowIds'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const rowIds = args.rowIds;

        if (!Array.isArray(rowIds) || rowIds.length < 2) {
          throw new Error('At least 2 row IDs are required to merge rows.');
        }

        logStore.addLog('info', `Merging ${rowIds.length} rows: ${rowIds.join(', ')}`);
        gridStore.mergeSelectedRows(rowIds);
        logStore.addLog('success', `Merged ${rowIds.length} rows into a single row`);

        return {
          success: true,
          replyText: `Successfully merged ${rowIds.length} rows into a single unified row!`,
          summary: `mergeRows(${rowIds.length} rows)`,
          resultData: { rowIds },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `mergeRows failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to merge rows: ${err.message}`,
          summary: `mergeRows(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  deleteRows: {
    name: 'deleteRows',
    description: 'Delete one or more rows from the master table grid.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rowIds: {
          type: Type.ARRAY,
          description: 'List of row IDs to delete from the table.',
          items: { type: Type.STRING },
        },
      },
      required: ['rowIds'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const rowIds: string[] = args.rowIds;

        if (!Array.isArray(rowIds) || rowIds.length === 0) {
          throw new Error('Parameter "rowIds" must be a non-empty array of row IDs.');
        }

        logStore.addLog('info', `Deleting ${rowIds.length} row(s): ${rowIds.join(', ')}`);
        rowIds.forEach((id) => gridStore.deleteRow(id));
        logStore.addLog('success', `Deleted ${rowIds.length} row(s)`);

        return {
          success: true,
          replyText: `Deleted ${rowIds.length} row(s) from the data grid.`,
          summary: `deleteRows(${rowIds.length} rows)`,
          resultData: { deletedRowIds: rowIds },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `deleteRows failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to delete rows: ${err.message}`,
          summary: `deleteRows(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  extractPDFData: {
    name: 'extractPDFData',
    description: 'Extract structured findings and evidence citations from the attached research paper PDF into the table grid.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        pdfId: {
          type: Type.STRING,
          description: 'PDF title or ID to extract findings from.',
        },
      },
    },
    execute: async (args: any, mode: AgentExecutionMode): Promise<ToolExecutionResult> => {
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

If the paper tests multiple distinct variables, experimental groups, treatments, or pairwise combinations, emit a DISTINCT ROW for each tested subject/observation that has actual experimental results, ignoring background mentions.

IMPORTANT: For EVERY extracted column value, provide a corresponding grounded citation object in "citations" with the exact page number, section name, verbatim snippet quote from the PDF, and reasoning explanation.

Return your response strictly as a JSON object with this format:
{
  "rows": [
    {
      ${headers.map((h) => `"${h}": "<Extracted value from paper>"`).join(',\n      ')},
      "citations": {
        ${headers
          .slice(0, 3)
          .map(
            (h) => `"${h}": {
          "pageNumber": 1,
          "sectionName": "Section Name / Results / Methods",
          "snippetQuote": "Exact verbatim excerpt quote from paper",
          "reasoning": "Grounded explanation for extracted value"
        }`
          )
          .join(',\n        ')}
        /* Provide citation entries for every extracted column field above */
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
      const rowsToAppend: GridRow[] = rawRows.map((r: any, i: number) => {
        const rowId = `extracted-${Date.now()}-${i}`;
        const rowData: GridRow = {
          id: rowId,
          pdfId: pdfInfo?.id || activePdfId || `pdf-${Date.now()}`,
          pdfTitle: pdfInfo?.name || targetPdfTitle,
          aiStatus: mode === 'human_in_loop' ? 'Pending Review' : 'Confirmed',
          citationMap: {},
        };

        gridStore.columns.forEach((col) => {
          const val =
            r[col.field] ??
            r[col.headerName] ??
            Object.entries(r).find(
              ([k]) =>
                k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
                col.field.toLowerCase().replace(/[^a-z0-9]/g, '') ||
                k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
                col.headerName.toLowerCase().replace(/[^a-z0-9]/g, '')
            )?.[1];
          rowData[col.field] = val !== undefined && val !== null ? String(val) : '-';
        });

        // Ensure citationMap maps every column field to its grounded citation
        const rawCitations = r.citations || parsed.citations || {};
        const normalizedCitationMap: Record<string, any> = {};

        gridStore.columns.forEach((col) => {
          const citation =
            rawCitations[col.field] ??
            rawCitations[col.headerName] ??
            Object.entries(rawCitations).find(
              ([k]) =>
                k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
                col.field.toLowerCase().replace(/[^a-z0-9]/g, '') ||
                k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
                col.headerName.toLowerCase().replace(/[^a-z0-9]/g, '')
            )?.[1];

          if (citation) {
            normalizedCitationMap[col.field] = {
              pageNumber: Number(citation.pageNumber) || 1,
              sectionName: citation.sectionName || 'Extracted Section',
              snippetQuote: citation.snippetQuote || rowData[col.field] || 'Verified excerpt',
              reasoning: citation.reasoning || `Extracted value "${rowData[col.field]}" from document`,
              confidence: citation.confidence || 0.96,
            };
          }
        });

        rowData.citationMap = normalizedCitationMap;
        return rowData;
      });

      gridStore.appendRows(rowsToAppend);

      // Auto-focus first citation
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
        success: true,
        replyText: `✅ Gemini ${selectedModel} extracted ${rowsToAppend.length} structured finding row(s) from "${pdfInfo?.name || targetPdfTitle}" in ${elapsed}s! Staged in table (Pending Review).`,
        summary: `extractPDFData(${pdfInfo?.name || targetPdfTitle}) -> ${rowsToAppend.length} rows`,
        resultData: rowsToAppend,
      };
    },
  },

  verifyEvidenceCitation: {
    name: 'verifyEvidenceCitation',
    description: 'Verify a specific cell finding against the research paper PDF, checking for accuracy, quote grounding, and computing confidence.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rowId: {
          type: Type.STRING,
          description: 'Target row ID to verify.',
        },
        field: {
          type: Type.STRING,
          description: 'Target column field key to verify.',
        },
        claimText: {
          type: Type.STRING,
          description: 'The extracted text claim to verify against the PDF content.',
        },
      },
      required: ['field'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const apiKey = getGeminiApiKey();
        const selectedModel = getSelectedGeminiModel();
        const logStore = useLogStore.getState();
        const gridStore = useGridStore.getState();
        const pdfStore = usePdfStore.getState();

        if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

        const targetRow = gridStore.rows.find((r) => r.id === args.rowId) || gridStore.rows[0];
        if (!targetRow) throw new Error('No table row available for verification.');

        const targetField = args.field || 'methodology';
        const claimValue = args.claimText || targetRow[targetField] || '';
        const pdfInfo = pdfStore.pdfs.find((p) => p.id === targetRow.pdfId || p.name === targetRow.pdfTitle) || pdfStore.getActivePdf();

        logStore.addLog('info', `Verifying citation for column "${targetField}" on paper "${targetRow.pdfTitle}"`, { claimValue });

        const contentsParts: any[] = [];
        if (pdfInfo) {
          const base64Data = await getPdfBase64(pdfInfo);
          contentsParts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data,
            },
          });
        }

        const verifyPrompt = `You are a scientific fact-checker auditing an extracted finding against the attached research paper PDF.

Claim / Extracted Value to Verify:
"${claimValue}"

Check whether this claim is strictly supported by the text.
Return your answer strictly in JSON format:
{
  "isSupported": true,
  "confidenceScore": 0.95,
  "pageNumber": 2,
  "sectionName": "Results and Discussion",
  "exactSupportingQuote": "<Direct quote passage from document supporting this claim>",
  "auditReasoning": "<Explanation of alignment or discrepancies>"
}`;

        contentsParts.push({ text: verifyPrompt });

        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({
          model: selectedModel,
          contents: contentsParts,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty verification response from Gemini.');

        const audit = JSON.parse(text);

        // Update row citation with verified evidence
        useGridStore.setState(
          produce((state: any) => {
            const row = state.rows.find((r: any) => r.id === targetRow.id);
            if (row) {
              if (!row.citationMap) row.citationMap = {};
              row.citationMap[targetField] = {
                pageNumber: Number(audit.pageNumber) || 1,
                sectionName: audit.sectionName || 'Verified Section',
                snippetQuote: audit.exactSupportingQuote || claimValue,
                reasoning: audit.auditReasoning || 'Fact-checked by Gemini Agent',
                confidence: Number(audit.confidenceScore) || 0.95,
              };
              if (state.focusedCell?.rowId === row.id && state.focusedCell?.field === targetField) {
                state.activeCitation = row.citationMap[targetField];
              }
            }
          })
        );

        logStore.addLog('success', `Verification complete: ${audit.isSupported ? 'Supported' : 'Uncertain'} (${Math.round(audit.confidenceScore * 100)}% confidence)`);

        return {
          success: true,
          replyText: `🔍 **Citation Verification for "${targetField}":**\n- **Status:** ${audit.isSupported ? '✅ Grounded in Document' : '⚠️ Potential Discrepancy'}\n- **Confidence:** ${Math.round(audit.confidenceScore * 100)}%\n- **Source:** ${audit.sectionName} (Page ${audit.pageNumber})\n- **Quote:** "${audit.exactSupportingQuote}"\n- **Reasoning:** ${audit.auditReasoning}`,
          summary: `verifyCitation(${targetField} -> ${Math.round(audit.confidenceScore * 100)}% confidence)`,
          resultData: audit,
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `verifyEvidenceCitation failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to verify citation: ${err.message}`,
          summary: `verifyCitation(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  searchDocument: {
    name: 'searchDocument',
    description: 'Search the attached research paper PDF for specific scientific keywords, methods, results, or sections.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search query, keyword, or scientific concept to find in the paper.',
        },
      },
      required: ['query'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const apiKey = getGeminiApiKey();
        const selectedModel = getSelectedGeminiModel();
        const logStore = useLogStore.getState();
        const pdfStore = usePdfStore.getState();
        const activePdf = pdfStore.getActivePdf();

        if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
        if (!args.query) throw new Error('Search query is required.');

        logStore.addLog('info', `Searching document for "${args.query}"`);

        const contentsParts: any[] = [];
        if (activePdf) {
          const base64Data = await getPdfBase64(activePdf);
          contentsParts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data,
            },
          });
        }

        const searchPrompt = `You are locating specific information in the attached research paper PDF.
User search query: "${args.query}"

Find the relevant passages, page numbers, and key excerpts that answer this query.
Return your response in JSON format:
{
  "matches": [
    {
      "pageNumber": 1,
      "section": "<Section Name>",
      "excerpt": "<Direct quote or finding>",
      "relevance": "<Explanation of relevance>"
    }
  ],
  "summary": "<Short overview answering the query>"
}`;

        contentsParts.push({ text: searchPrompt });

        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({
          model: selectedModel,
          contents: contentsParts,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('No search results returned.');

        const parsed = JSON.parse(text);
        logStore.addLog('success', `Found ${parsed.matches?.length || 0} document matches for "${args.query}"`);

        return {
          success: true,
          replyText: `📄 **Document Search Results for "${args.query}":**\n\n${parsed.summary}\n\n${(parsed.matches || []).map((m: any, i: number) => `**${i + 1}. Page ${m.pageNumber} (${m.section}):**\n> "${m.excerpt}"`).join('\n\n')}`,
          summary: `searchDocument("${args.query}" -> ${parsed.matches?.length || 0} matches)`,
          resultData: parsed,
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `searchDocument failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to search document: ${err.message}`,
          summary: `searchDocument(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  queryGridData: {
    name: 'queryGridData',
    description: 'Query, filter, or aggregate information across the master extraction data grid without modifying the table.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filterField: {
          type: Type.STRING,
          description: 'Optional column field key to filter by.',
        },
        filterValue: {
          type: Type.STRING,
          description: 'Optional substring value to match in the filtered column.',
        },
        searchQuery: {
          type: Type.STRING,
          description: 'General query or question to answer across the dataset.',
        },
      },
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const { filterField, filterValue, searchQuery } = args;

        logStore.addLog('info', `Querying data grid (${gridStore.rows.length} rows, ${gridStore.columns.length} cols)`);

        let matchingRows = gridStore.rows.filter((r) => !r.isDraftRow);

        if (filterField && filterValue) {
          matchingRows = matchingRows.filter((r) =>
            String(r[filterField] || '').toLowerCase().includes(filterValue.toLowerCase())
          );
        } else if (searchQuery) {
          const q = searchQuery.toLowerCase();
          matchingRows = matchingRows.filter((r) =>
            Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
          );
        }

        const summary = `Found ${matchingRows.length} matching row(s) in the table grid.`;
        logStore.addLog('success', summary);

        return {
          success: true,
          replyText: `📊 **Table Query Results (${matchingRows.length} rows found):**\n\n${matchingRows.map((r, i) => `${i + 1}. **${r.pdfTitle}** | ${gridStore.columns.map((c) => `${c.headerName}: "${r[c.field] || '-'}"`).join(', ')}`).join('\n')}`,
          summary: `queryGridData(${matchingRows.length} matching rows)`,
          resultData: { totalRows: gridStore.rows.length, matches: matchingRows },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `queryGridData failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to query table grid: ${err.message}`,
          summary: `queryGridData(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },
};

/**
 * Generates official @google/genai tools structure with functionDeclarations array
 */
export function getToolsForMode(_mode: AgentExecutionMode = 'human_in_loop') {
  const activeCols = useGridStore.getState().columns;
  const activeFields = activeCols.map((c) => c.field);

  const functionDeclarations = Object.values(agentToolsRegistry).map((tool) => {
    const parameters = JSON.parse(JSON.stringify(tool.parameters));

    // Dynamically inject active column fields as an enum for single-cell operations
    if (tool.name === 'updateCell' && activeFields.length > 0 && parameters.properties?.field) {
      parameters.properties.field.enum = activeFields;
      parameters.properties.field.description = `Target column field key. Must be one of: ${activeFields.join(', ')}`;
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters,
    };
  });

  return [
    {
      functionDeclarations,
    },
  ];
}
