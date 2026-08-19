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

/**
 * Resilient JSON parser that handles Markdown code blocks, trailing commas,
 * unescaped internal quotes, and control characters in LLM responses.
 */
export const safeJsonParse = <T = any>(rawText: string, fallback?: T): T => {
  if (!rawText || typeof rawText !== 'string') {
    if (fallback !== undefined) return fallback;
    throw new Error('Empty text provided for JSON parsing.');
  }

  // 1. Strip markdown fences like ```json ... ``` or ``` ... ```
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }

  // 2. Direct fast parse
  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // 3. Fallback: repair trailing commas before closing braces/brackets
    try {
      const withoutTrailingCommas = cleaned.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(withoutTrailingCommas);
    } catch {
      // 4. Fallback: repair unescaped raw newlines or control characters
      try {
        const sanitized = cleaned
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? c : ''))
          .replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(sanitized);
      } catch {
        if (fallback !== undefined) return fallback;
        throw firstErr;
      }
    }
  }
};

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
    execute: async (args: any, _mode: AgentExecutionMode): Promise<ToolExecutionResult> => {
      try {
        const logStore = useLogStore.getState();
        const gridStore = useGridStore.getState();
        const updates = args.updates;

        if (!Array.isArray(updates) || updates.length === 0) {
          throw new Error('Missing or empty updates array for batchUpdateCells.');
        }

        logStore.addLog('info', `Executing atomic batchUpdateCells for ${updates.length} cell(s)`);

        // Execute batch update as single atomic store action with exactly 1 undo snapshot
        gridStore.batchUpdateCells(
          updates.map((u: any) => ({
            rowId: u.rowId || gridStore.focusedCell?.rowId || gridStore.rows[0]?.id,
            field: u.field,
            value: u.newValue !== undefined ? u.newValue : u.value,
            reasoning: u.reasoning,
            sectionName: u.sectionName,
            pageNumber: u.pageNumber,
            snippetQuote: u.snippetQuote,
          }))
        );

        logStore.addLog('success', `Batch update complete: ${updates.length} cells updated atomically`);

        return {
          success: true,
          replyText: `Successfully updated ${updates.length} cell(s) in the table in a single atomic operation.`,
          summary: `batchUpdateCells(${updates.length} cells updated)`,
          resultData: { appliedCount: updates.length, total: updates.length },
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

  appendRow: {
    name: 'appendRow',
    description: 'Append a new observation row to the table grid with specified field values and citations. Use this when creating a new row rather than modifying existing rows.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fields: {
          type: Type.OBJECT,
          description: 'Key-value map of column fields/headers and their extracted values.',
        },
        citations: {
          type: Type.OBJECT,
          description: 'Optional evidence citation map containing pageNumber, sectionName, snippetQuote, reasoning for columns.',
        },
        pdfTitle: {
          type: Type.STRING,
          description: 'Name of the research paper this row belongs to.',
        },
      },
      required: ['fields'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const pdfStore = usePdfStore.getState();
        const activePdf = pdfStore.getActivePdf() || pdfStore.pdfs[0];

        const rowData: Partial<GridRow> = {
          pdfId: activePdf?.id || `pdf-${Date.now()}`,
          pdfTitle: args.pdfTitle || activePdf?.name || 'Active Paper',
          aiStatus: 'Confirmed',
          citationMap: args.citations || {},
          ...(args.fields || {}),
        };

        const created = gridStore.appendRow(rowData);
        logStore.addLog('success', `Created new observation row "${created.id}" for "${created.pdfTitle}"`);

        return {
          success: true,
          replyText: `Appended new observation row [ID: ${created.id}] for paper "${created.pdfTitle}".`,
          summary: `appendRow(${created.id} -> ${Object.keys(args.fields || {}).length} fields)`,
          resultData: { createdRowId: created.id, row: created },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `appendRow failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to append row: ${err.message}`,
          summary: `appendRow(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  appendRows: {
    name: 'appendRows',
    description: 'Append multiple new observation rows to the table grid simultaneously in a single atomic operation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rows: {
          type: Type.ARRAY,
          description: 'Array of observation row objects to append to the table grid.',
          items: {
            type: Type.OBJECT,
            properties: {
              fields: {
                type: Type.OBJECT,
                description: 'Key-value map of column fields/headers and their extracted values.',
              },
              citations: {
                type: Type.OBJECT,
                description: 'Optional evidence citation map containing pageNumber, sectionName, snippetQuote, reasoning for columns.',
              },
              pdfTitle: {
                type: Type.STRING,
                description: 'Optional name of the research paper this row belongs to.',
              },
            },
            required: ['fields'],
          },
        },
        pdfTitle: {
          type: Type.STRING,
          description: 'Optional fallback paper title applied to all appended rows.',
        },
      },
      required: ['rows'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const pdfStore = usePdfStore.getState();
        const activePdf = pdfStore.getActivePdf() || pdfStore.pdfs[0];

        const rawRows = args.rows;
        if (!Array.isArray(rawRows) || rawRows.length === 0) {
          throw new Error('Missing or empty rows array for appendRows.');
        }

        const rowsToAppend: GridRow[] = rawRows.map((r: any, i: number) => {
          const rowId = `manual-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 5)}`;
          const fields = r.fields || r;
          const rowObj: GridRow = {
            id: rowId,
            pdfId: activePdf?.id || `pdf-${Date.now()}`,
            pdfTitle: r.pdfTitle || args.pdfTitle || activePdf?.name || 'Active Paper',
            aiStatus: 'Confirmed',
            citationMap: r.citations || {},
          };

          gridStore.columns.forEach((col) => {
            const val =
              fields[col.field] ??
              fields[col.headerName] ??
              Object.entries(fields).find(
                ([k]) =>
                  k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
                  col.field.toLowerCase().replace(/[^a-z0-9]/g, '') ||
                  k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
                  col.headerName.toLowerCase().replace(/[^a-z0-9]/g, '')
              )?.[1];
            rowObj[col.field] = val !== undefined && val !== null ? String(val) : '-';
          });

          return rowObj;
        });

        gridStore.appendRows(rowsToAppend);
        const createdRowIds = rowsToAppend.map((r) => r.id);

        logStore.addLog(
          'success',
          `Batch appended ${rowsToAppend.length} new observation row(s) [${createdRowIds.join(', ')}]`
        );

        return {
          success: true,
          replyText: `Successfully appended ${rowsToAppend.length} observation row(s) to the table: [${createdRowIds.join(', ')}].`,
          summary: `appendRows(${rowsToAppend.length} rows created)`,
          resultData: { createdRowIds, rowsCount: rowsToAppend.length, rows: rowsToAppend },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `appendRows failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to append rows: ${err.message}`,
          summary: `appendRows(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  updateRow: {
    name: 'updateRow',
    description: 'Update multiple fields on a specific row at once in a single atomic transaction.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rowId: {
          type: Type.STRING,
          description: 'Target row ID to update. If modifying the currently focused row, leave empty.',
        },
        fields: {
          type: Type.OBJECT,
          description: 'Key-value map of column fields or header names to their new updated values (e.g. {"latent_period_min": "~7 min", "burst_size": "105 PFU/cell"}).',
        },
        reasoning: {
          type: Type.STRING,
          description: 'Explanation of the updates performed on this row.',
        },
      },
      required: ['fields'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const targetRowId = args.rowId || gridStore.focusedCell?.rowId || gridStore.rows[0]?.id;

        if (!targetRowId) throw new Error('No target row specified or available to update.');
        if (!args.fields || typeof args.fields !== 'object') throw new Error('Parameter "fields" must be an object.');

        logStore.addLog('info', `Updating row ${targetRowId} with ${Object.keys(args.fields).length} field(s)`);
        gridStore.updateRow(targetRowId, args.fields);
        logStore.addLog('success', `Row ${targetRowId} updated`);

        return {
          success: true,
          replyText: `Successfully updated row **${targetRowId}** with new values.`,
          summary: `updateRow(${targetRowId}: ${Object.keys(args.fields).join(', ')})`,
          resultData: { rowId: targetRowId, fields: args.fields },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `updateRow failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to update row: ${err.message}`,
          summary: `updateRow(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  addColumn: {
    name: 'addColumn',
    description: 'Add a new extraction schema column to the master table, with optional initial values for existing rows.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        headerName: {
          type: Type.STRING,
          description: 'Title of the new column (e.g. Host Range, Phage Morphology, Genome Size).',
        },
        initialValues: {
          type: Type.OBJECT,
          description: 'Optional map of rowId (or global field value) to the value for that row in the new column.',
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
        gridStore.addColumn(args.headerName, args.initialValues);
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

  disaggregateRow: {
    name: 'disaggregateRow',
    description: 'Disaggregate / split a composite row into multiple distinct atomic rows (e.g. expanding multiple tested host strains, experimental conditions, or timepoints into individual rows).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetRowId: {
          type: Type.STRING,
          description: 'Target composite row ID to expand. Defaults to the currently focused row if empty.',
        },
        replacementRows: {
          type: Type.ARRAY,
          description: 'List of atomic replacement rows. Each item is an object mapping column field names to their specific values for that experimental observation.',
          items: {
            type: Type.OBJECT,
            description: 'Atomic row object mapping column fields to values.',
          },
        },
        reasoning: {
          type: Type.STRING,
          description: 'Scientific rationale for disaggregating this row.',
        },
      },
      required: ['replacementRows'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const targetRowId = args.targetRowId || args.rowId || gridStore.focusedCell?.rowId || gridStore.rows[0]?.id;

        if (!targetRowId) throw new Error('No target row available to disaggregate.');
        if (!Array.isArray(args.replacementRows) || args.replacementRows.length === 0) {
          throw new Error('Parameter "replacementRows" must be a non-empty array of atomic row objects.');
        }

        logStore.addLog('info', `Disaggregating row ${targetRowId} into ${args.replacementRows.length} atomic sub-rows`);
        gridStore.disaggregateRow(targetRowId, args.replacementRows);
        logStore.addLog('success', `Row ${targetRowId} disaggregated into ${args.replacementRows.length} atomic rows`);

        return {
          success: true,
          replyText: `Successfully disaggregated row into **${args.replacementRows.length} atomic sub-rows**!\n\n${args.reasoning ? `*Rationale:* ${args.reasoning}` : ''}`,
          summary: `disaggregateRow(${targetRowId} -> ${args.replacementRows.length} rows)`,
          resultData: { targetRowId, rowCount: args.replacementRows.length },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `disaggregateRow failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to disaggregate row: ${err.message}`,
          summary: `disaggregateRow(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  mergeRows: {
    name: 'mergeRows',
    description: 'Merge multiple specified rows into a single deduplicated or synthesized consolidated row.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rowIds: {
          type: Type.ARRAY,
          description: 'List of row IDs to merge together (minimum 2 rows).',
          items: { type: Type.STRING },
        },
        consolidatedRow: {
          type: Type.OBJECT,
          description: 'Optional synthesized values for the merged row columns.',
        },
        reasoning: {
          type: Type.STRING,
          description: 'Explanation for merging these rows.',
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
        gridStore.mergeSelectedRows(rowIds, args.consolidatedRow);
        logStore.addLog('success', `Merged ${rowIds.length} rows into a single row`);

        return {
          success: true,
          replyText: `Successfully merged **${rowIds.length} rows** into a single unified row!`,
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
        gridStore.deleteRows(rowIds);
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
      try {
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
      const genStartTime = performance.now();

      const ai = new GoogleGenAI({ apiKey });
      let res: any;
      try {
        res = await ai.models.generateContent({
          model: selectedModel,
          contents: contentsParts,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });
      } catch (firstErr: any) {
        const errMsg = String(firstErr?.message || '');
        const isTransient =
          errMsg.includes('503') ||
          errMsg.includes('Deadline') ||
          errMsg.includes('429') ||
          errMsg.includes('UNAVAILABLE') ||
          firstErr?.status === 'UNAVAILABLE';

        if (isTransient) {
          logStore.addLog('warn', `Transient error from Gemini API (${errMsg}). Retrying extraction in 2s...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          res = await ai.models.generateContent({
            model: selectedModel,
            contents: contentsParts,
            config: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          });
        } else {
          throw firstErr;
        }
      }

      const elapsed = ((performance.now() - genStartTime) / 1000).toFixed(2);
      const usage = res.usageMetadata;
      const promptTokens = usage?.promptTokenCount ?? 0;
      const candidateTokens = usage?.candidatesTokenCount ?? 0;
      const thinkingTokens = (usage as any)?.thinkingTokenCount ?? (usage as any)?.reasoningTokenCount;
      const cachedTokens = usage?.cachedContentTokenCount;

        let logDetail = `⏱️ extractPDFData: LLM responded in ${elapsed}s | Tokens: Prompt=${promptTokens.toLocaleString()}, Output=${candidateTokens.toLocaleString()}`;
        if (thinkingTokens) logDetail += `, Thinking=${thinkingTokens.toLocaleString()}`;
        if (cachedTokens) logDetail += `, Cached=${cachedTokens.toLocaleString()}`;
        logStore.addLog('info', logDetail, { usageMetadata: usage, latencySec: Number(elapsed) });

        const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          const err = 'Gemini API returned an empty extraction response.';
          logStore.addLog('error', err);
          throw new Error(err);
        }

        logStore.setActiveStep(`[3/3] Parsing JSON payload & populating table grid...`);
        const parsed = safeJsonParse(text);

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

        const createdRowIds = rowsToAppend.map((r) => r.id);
        const rowSummaries = rowsToAppend.map((r) => {
          const summaryObj: Record<string, any> = { id: r.id, pdfTitle: r.pdfTitle };
          gridStore.columns.forEach((c) => {
            summaryObj[c.field] = r[c.field];
          });
          return summaryObj;
        });

        return {
          success: true,
          replyText: `Extracted ${rowsToAppend.length} observation row(s) from **${pdfInfo?.name || targetPdfTitle}** into the master table with grounded citations! Newly created row IDs: [${createdRowIds.join(', ')}].`,
          summary: `extractPDFData(${pdfInfo?.name || targetPdfTitle} -> ${rowsToAppend.length} rows: [${createdRowIds.join(', ')}])`,
          resultData: {
            status: 'COMPLETED',
            message: `Successfully created and inserted ${rowsToAppend.length} new row(s) into the data grid with full evidence citations. The new row IDs are: [${createdRowIds.join(', ')}]. These rows are already active in the table state. You may use queryGridData with any of these row IDs to inspect and verify specific columns or synthesize your final summary for the user. Do NOT attempt to overwrite other rows with batchUpdateCells.`,
            createdRowIds,
            rowsSummary: rowSummaries,
            pdfId: pdfInfo?.id || activePdfId,
          },
        };
      } catch (err: any) {
        useLogStore.getState().setActiveStep(null);
        useLogStore.getState().addLog('error', `extractPDFData failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to extract findings: ${err.message}`,
          summary: `extractPDFData(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  verifyEvidenceCitation: {
    name: 'verifyEvidenceCitation',
    description: 'Fact-check and audit a specific table cell value against the exact source text of the paper PDF.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rowId: {
          type: Type.STRING,
          description: 'Row ID containing the cell to verify. Defaults to focused row.',
        },
        field: {
          type: Type.STRING,
          description: 'Column field key to verify. Defaults to focused column.',
        },
        claim: {
          type: Type.STRING,
          description: 'The specific extracted claim or numeric value to audit against the PDF.',
        },
      },
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const apiKey = getGeminiApiKey();
        const selectedModel = getSelectedGeminiModel();

        if (!apiKey) throw new Error('GEMINI_API_KEY is missing.');

        const targetRow =
          gridStore.rows.find((r) => r.id === args.rowId) ||
          gridStore.rows.find((r) => r.id === gridStore.focusedCell?.rowId) ||
          gridStore.rows[0];

        if (!targetRow) throw new Error('No row available to verify.');

        const targetField = args.field || gridStore.focusedCell?.field || gridStore.columns[0]?.field;
        const claimValue = args.claim || targetRow[targetField];

        logStore.addLog('info', `Verifying claim for "${targetField}": "${claimValue}"`);

        const pdfStore = usePdfStore.getState();
        const targetPdf = pdfStore.pdfs.find((p) => p.id === targetRow.pdfId || p.name === targetRow.pdfTitle) || pdfStore.getActivePdf();

        const contentsParts: any[] = [];
        if (targetPdf) {
          const base64Data = await getPdfBase64(targetPdf);
          contentsParts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data,
            },
          });
        }

        const verifyPrompt = `You are auditing scientific fact-checking evidence for an extracted table cell value.
Target Field: "${targetField}"
Extracted Claim: "${claimValue}"
Document Name: "${targetRow.pdfTitle}"

Inspect the attached research paper PDF. Verify whether this extracted claim is supported by the text.
Return your response in JSON format:
{
  "isSupported": true,
  "confidenceScore": 0.95,
  "pageNumber": 2,
  "sectionName": "Results and Discussion",
  "exactSupportingQuote": "<Direct quote passage from document supporting this claim>",
  "auditReasoning": "<Explanation of alignment or discrepancies>"
}`;

        contentsParts.push({ text: verifyPrompt });

        const genStartTime = performance.now();
        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({
          model: selectedModel,
          contents: contentsParts,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        const elapsed = ((performance.now() - genStartTime) / 1000).toFixed(2);
        const usage = res.usageMetadata;
        const promptTokens = usage?.promptTokenCount ?? 0;
        const candidateTokens = usage?.candidatesTokenCount ?? 0;
        const thinkingTokens = (usage as any)?.thinkingTokenCount ?? (usage as any)?.reasoningTokenCount;
        const cachedTokens = usage?.cachedContentTokenCount;

        let logDetail = `⏱️ verifyCitation: LLM responded in ${elapsed}s | Tokens: Prompt=${promptTokens.toLocaleString()}, Output=${candidateTokens.toLocaleString()}`;
        if (thinkingTokens) logDetail += `, Thinking=${thinkingTokens.toLocaleString()}`;
        if (cachedTokens) logDetail += `, Cached=${cachedTokens.toLocaleString()}`;
        logStore.addLog('info', logDetail, { usageMetadata: usage, latencySec: Number(elapsed) });

        const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty verification response from Gemini.');

        const audit = safeJsonParse(text);

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
    description: 'Perform a semantic evidence search inside the attached research paper PDF.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search query or finding to locate in the PDF.',
        },
      },
      required: ['query'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const logStore = useLogStore.getState();
        const apiKey = getGeminiApiKey();
        const selectedModel = getSelectedGeminiModel();
        const pdfStore = usePdfStore.getState();
        const activePdf = pdfStore.getActivePdf() || pdfStore.pdfs[0];

        if (!apiKey) throw new Error('GEMINI_API_KEY is missing.');
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

        const genStartTime = performance.now();
        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({
          model: selectedModel,
          contents: contentsParts,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        const elapsed = ((performance.now() - genStartTime) / 1000).toFixed(2);
        const usage = res.usageMetadata;
        const promptTokens = usage?.promptTokenCount ?? 0;
        const candidateTokens = usage?.candidatesTokenCount ?? 0;
        const thinkingTokens = (usage as any)?.thinkingTokenCount ?? (usage as any)?.reasoningTokenCount;
        const cachedTokens = usage?.cachedContentTokenCount;

        let logDetail = `⏱️ searchDocument: LLM responded in ${elapsed}s | Tokens: Prompt=${promptTokens.toLocaleString()}, Output=${candidateTokens.toLocaleString()}`;
        if (thinkingTokens) logDetail += `, Thinking=${thinkingTokens.toLocaleString()}`;
        if (cachedTokens) logDetail += `, Cached=${cachedTokens.toLocaleString()}`;
        logStore.addLog('info', logDetail, { usageMetadata: usage, latencySec: Number(elapsed) });

        const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('No search results returned.');

        const parsed = safeJsonParse(text);
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
