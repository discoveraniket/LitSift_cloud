import { produce } from 'immer';
import { useGridStore } from '../store/useGridStore';
import { usePdfStore } from '../store/usePdfStore';
import { useLogStore } from '../store/useLogStore';
import { useAgentStore } from '../store/useAgentStore';
import { getGeminiApiKey, getSelectedGeminiModel } from './geminiService';
import { getPdfBase64, buildPaperMarkdownContext, resolveEffectiveGroundingMode } from './pdfUtils';
import { GoogleGenAI, Type } from '@google/genai';
import { GridRow } from '../types/grid';
import {
  getActiveProvider,
  getLmStudioModel,
  getOpenRouterModel,
  getOpenRouterApiKey,
  DEFAULT_OPENROUTER_MODEL,
} from './providerConfig';
import { executeLmStudioStructuredGeneration, OpenAiMessage } from './lmStudioService';
import { executeOpenRouterStructuredGeneration } from './openRouterService';
import { proposeSchemaFromGoal, extractWithFixedSchema } from './extractionEngine';
import { stageExtractedRowsToGrid } from './extractionGridBridge';
import { searchAcademicLiterature, stagePaperByDoi } from './academicSearchService';
import { executeBatchExtraction } from './batchExtractionRunner';

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
 * Repairs truncated JSON responses by closing unterminated strings,
 * stripping dangling colons/commas, and balancing unclosed brackets and braces.
 */
export function repairTruncatedJson(str: string): string {
  let inString = false;
  let isEscaped = false;
  const stack: string[] = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      if (char === '\\' && !isEscaped) {
        isEscaped = true;
      } else {
        if (char === '"' && !isEscaped) {
          inString = false;
        }
        isEscaped = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' || char === ']') {
        const last = stack[stack.length - 1];
        if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
          stack.pop();
        }
      }
    }
  }

  let repaired = str;
  // If terminated inside a string, close the string quote
  if (inString) {
    repaired += '"';
  }

  // Remove any dangling colon or comma at end of line/content
  repaired = repaired.replace(/,\s*$/, '').replace(/:\s*$/, ': null');

  // Close unclosed structures in reverse order
  while (stack.length > 0) {
    const openChar = stack.pop();
    if (openChar === '{') {
      repaired = repaired.replace(/,\s*$/, '') + '}';
    } else if (openChar === '[') {
      repaired = repaired.replace(/,\s*$/, '') + ']';
    }
  }

  return repaired;
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

  const parseCandidate = (candidate: string): T | null => {
    try {
      return JSON.parse(candidate);
    } catch {
      // Repair trailing commas
      try {
        const withoutTrailingCommas = candidate.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(withoutTrailingCommas);
      } catch {
        // Repair control characters
        const sanitized = candidate
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? c : ''))
          .replace(/,\s*([}\]])/g, '$1');
        try {
          return JSON.parse(sanitized);
        } catch {
          // Repair truncated JSON
          try {
            const repaired = repairTruncatedJson(sanitized);
            return JSON.parse(repaired);
          } catch {
            return null;
          }
        }
      }
    }
  };

  const cleaned = rawText.trim();

  // Strategy 1: Direct fast parse
  let result = parseCandidate(cleaned);
  if (result !== null) return result;

  // Strategy 2: Extract markdown code blocks (e.g. ```json ... ``` anywhere in output)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    result = parseCandidate(codeBlockMatch[1].trim());
    if (result !== null) return result;
  }

  // Strategy 3: Outermost JSON object { ... }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    result = parseCandidate(cleaned.slice(firstBrace, lastBrace + 1));
    if (result !== null) return result;
  }

  // Strategy 4: Outermost JSON array [ ... ]
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    result = parseCandidate(cleaned.slice(firstBracket, lastBracket + 1));
    if (result !== null) return result;
  }

  if (fallback !== undefined) return fallback;
  throw new Error(`Failed to parse JSON from model output: ${rawText.slice(0, 100)}...`);
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
      required: ['newValue', 'reasoning', 'sectionName', 'snippetQuote'],
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
            `Column "${field}" does not exist in the table schema. Please call addColumns(["${field}"]) first.`
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
              if (colHeader && colHeader !== targetField) {
                row[colHeader] = newValue;
              }
              if (mode === 'human_in_loop') {
                if (!row.pendingReviewFields) row.pendingReviewFields = [];
                if (!row.pendingReviewFields.includes(targetField)) {
                  row.pendingReviewFields.push(targetField);
                }
                if (colHeader && !row.pendingReviewFields.includes(colHeader)) {
                  row.pendingReviewFields.push(colHeader);
                }
                row.aiStatus = 'Pending Review';
              } else {
                if (row.pendingReviewFields) {
                  row.pendingReviewFields = row.pendingReviewFields.filter((f: string) => f !== targetField && f !== colHeader);
                }
              }
              if (!row.citationMap) row.citationMap = {};
              const citObj = {
                pageNumber: resolvedPage,
                sectionName: resolvedSection,
                snippetQuote: resolvedSnippet,
                reasoning: resolvedReasoning,
                confidence: 0.98,
              };
              row.citationMap[targetField] = citObj;
              if (colHeader) {
                row.citationMap[colHeader] = citObj;
              }
              if (state.focusedCell?.rowId === row.id && (state.focusedCell?.field === targetField || state.focusedCell?.field === colHeader)) {
                state.activeCitation = citObj;
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
            required: ['field', 'newValue', 'reasoning', 'sectionName', 'snippetQuote'],
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
        const allCols = gridStore.columns;
        gridStore.batchUpdateCells(
          updates.map((u: any) => {
            const cleanField = (u.field || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetCol = allCols.find(
              (c) =>
                c.field === u.field ||
                c.headerName.toLowerCase() === (u.field || '').toLowerCase() ||
                c.field.toLowerCase() === (u.field || '').toLowerCase() ||
                c.field.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanField ||
                c.headerName.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanField
            );
            const resolvedField = targetCol ? targetCol.field : u.field;

            return {
              rowId: u.rowId || gridStore.focusedCell?.rowId || gridStore.rows[0]?.id,
              field: resolvedField,
              value: u.newValue !== undefined ? u.newValue : u.value,
              reasoning: u.reasoning,
              sectionName: u.sectionName,
              pageNumber: u.pageNumber,
              snippetQuote: u.snippetQuote,
              isAiPending: _mode === 'human_in_loop',
            };
          })
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

  appendRows: {
    name: 'appendRows',
    description:
      'Append multiple new observation rows to the table grid simultaneously in a single atomic operation. For any parameters not measured or reported in the document, use "Not reported".',
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
                description: 'Key-value map of column fields/headers and their extracted values. Use "Not reported" for missing/unmeasured parameters.',
              },
              citations: {
                type: Type.OBJECT,
                description: 'Required evidence citation map containing pageNumber, sectionName, snippetQuote, reasoning for columns.',
              },
              pdfTitle: {
                type: Type.STRING,
                description: 'Optional name of the research paper this row belongs to.',
              },
            },
            required: ['fields', 'citations'],
          },
        },
        pdfTitle: {
          type: Type.STRING,
          description: 'Optional fallback paper title applied to all appended rows.',
        },
      },
      required: ['rows'],
    },
    execute: async (args: any, mode: AgentExecutionMode): Promise<ToolExecutionResult> => {
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
            aiStatus: mode === 'human_in_loop' ? 'Pending Review' : 'Confirmed',
            pendingReviewFields: mode === 'human_in_loop' ? gridStore.columns.map((c) => c.field) : [],
            citationMap: {},
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
            let cellStr = val !== undefined && val !== null ? String(val).trim() : 'Not reported';
            if (cellStr === '-' || cellStr === '' || cellStr.toLowerCase() === 'none' || cellStr.toLowerCase() === 'n/a') {
              cellStr = 'Not reported';
            }
            rowObj[col.field] = cellStr;
          });

          const rawCitations = r.citations || {};
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

            const isUnreported = rowObj[col.field] === 'Not reported';

            if (citation && typeof citation === 'object') {
              const citObj = {
                pageNumber: Number(citation.pageNumber) || 1,
                sectionName: citation.sectionName || (isUnreported ? 'N/A' : 'Extracted Section'),
                paragraphNumber: citation.paragraphNumber || undefined,
                lineNumber: citation.lineNumber || undefined,
                snippetQuote: citation.snippetQuote || (isUnreported ? 'Not reported in document' : rowObj[col.field]),
                reasoning: citation.reasoning || (isUnreported ? `The parameter "${col.headerName}" was not reported in the document.` : `Extracted value "${rowObj[col.field]}" from document`),
                confidence: citation.confidence || (isUnreported ? 0.99 : 0.95),
              };
              normalizedCitationMap[col.field] = citObj;
              normalizedCitationMap[col.headerName] = citObj;
            } else if (isUnreported) {
              const fallbackCit = {
                pageNumber: 1,
                sectionName: 'N/A',
                snippetQuote: 'Not reported in document',
                reasoning: `The parameter "${col.headerName}" was not investigated or reported in this paper.`,
                confidence: 0.99,
              };
              normalizedCitationMap[col.field] = fallbackCit;
              normalizedCitationMap[col.headerName] = fallbackCit;
            }
          });

          rowObj.citationMap = normalizedCitationMap;
          return rowObj;
        });

        // Idempotency safeguard: Do not re-append duplicate rows for the same paper
        // if an existing row has identical values across non-empty fields.
        const nonDuplicateRows = rowsToAppend.filter((newRow) => {
          const isExactDuplicate = gridStore.rows.some((existingRow) => {
            const samePaper =
              existingRow.pdfTitle.trim().toLowerCase() === newRow.pdfTitle.trim().toLowerCase() ||
              (existingRow.pdfId && newRow.pdfId && existingRow.pdfId === newRow.pdfId);
            if (!samePaper) return false;

            // Check if all populated schema columns match identically
            const hasDifferences = gridStore.columns.some((col) => {
              const oldVal = String(existingRow[col.field] ?? '').trim().toLowerCase();
              const newVal = String(newRow[col.field] ?? '').trim().toLowerCase();
              return oldVal !== newVal;
            });
            return !hasDifferences;
          });
          return !isExactDuplicate;
        });

        if (nonDuplicateRows.length === 0 && rowsToAppend.length > 0) {
          logStore.addLog(
            'info',
            `appendRows skipped: Observation(s) already exist in data grid with identical values (deduplication safeguard).`
          );
          return {
            success: true,
            replyText: `Identical observation row(s) already exist in the data grid for **"${rowsToAppend[0]?.pdfTitle}"**. Existing rows were preserved without duplicate entries.`,
            summary: `appendRows(0 rows appended, duplicate avoided)`,
            resultData: { createdRowIds: [], rowsCount: 0, rows: [] },
          };
        }

        gridStore.appendRows(nonDuplicateRows);
        const createdRowIds = nonDuplicateRows.map((r) => r.id);

        logStore.addLog(
          'success',
          `Batch appended ${nonDuplicateRows.length} new observation row(s) [${createdRowIds.join(', ')}]`
        );

        return {
          success: true,
          replyText: `Successfully appended ${nonDuplicateRows.length} observation row(s) to the table: [${createdRowIds.join(', ')}].`,
          summary: `appendRows(${nonDuplicateRows.length} rows created)`,
          resultData: { createdRowIds, rowsCount: nonDuplicateRows.length, rows: nonDuplicateRows },
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
          description:
            'Key-value map of column fields or header names to their new updated values. For parameters verified to not be measured or reported in the document, use "Not reported".',
        },
        citations: {
          type: Type.OBJECT,
          description: 'Required evidence citation map containing pageNumber, sectionName, snippetQuote, reasoning for all updated columns.',
        },
        reasoning: {
          type: Type.STRING,
          description: 'Explanation of the updates performed on this row.',
        },
      },
      required: ['fields', 'citations', 'reasoning'],
    },
    execute: async (args: any, mode: AgentExecutionMode): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
        const targetRowId = args.rowId || gridStore.focusedCell?.rowId || gridStore.rows[0]?.id;

        if (!targetRowId) throw new Error('No target row specified or available to update.');
        if (!args.fields || typeof args.fields !== 'object') throw new Error('Parameter "fields" must be an object.');

        logStore.addLog('info', `Updating row ${targetRowId} with ${Object.keys(args.fields).length} field(s)`);
        gridStore.updateRow(
          targetRowId,
          args.fields,
          args.citations,
          mode === 'human_in_loop' ? 'Pending Review' : 'Confirmed'
        );
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

  addColumns: {
    name: 'addColumns',
    description: 'Add one or more extraction schema columns to the master table in a single action. Can accept an array of column headers or a single header name, with optional initial values.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        headerNames: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'List of column titles to add to the table schema (e.g. ["Phage Name", "Host Bacteria", "Burst Size (pfu/cell)", "Latent Period (min)"]). Can also be a single column.',
        },
        initialValues: {
          type: Type.OBJECT,
          description: 'Optional map of rowId (or global field value) to the value for that row in the new columns.',
        },
      },
      required: ['headerNames'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();

        let rawHeaders: string[] = [];
        if (Array.isArray(args.headerNames)) {
          rawHeaders = args.headerNames;
        } else if (typeof args.headerNames === 'string') {
          rawHeaders = [args.headerNames];
        } else if (typeof args.headerName === 'string') {
          rawHeaders = [args.headerName];
        } else if (Array.isArray(args.headers)) {
          rawHeaders = args.headers;
        }

        const validHeaders = rawHeaders
          .map((h) => (typeof h === 'string' ? h.trim() : ''))
          .filter((h) => h.length > 0);

        if (validHeaders.length === 0) {
          throw new Error('Parameter "headerNames" must contain at least one non-empty column title.');
        }

        logStore.addLog('info', `Adding ${validHeaders.length} column(s) to schema: ${validHeaders.join(', ')}`);
        gridStore.addColumns(validHeaders, args.initialValues);
        logStore.addLog('success', `Added ${validHeaders.length} column(s): ${validHeaders.join(', ')}`);

        return {
          success: true,
          replyText: `Added ${validHeaders.length} column(s) to the extraction table schema: ${validHeaders.map((h) => `**"${h}"**`).join(', ')}!`,
          summary: `addColumns(${validHeaders.length} column${validHeaders.length === 1 ? '' : 's'}: ${validHeaders.join(', ')})`,
          resultData: { headerNames: validHeaders },
        };
      } catch (err: any) {
        useLogStore.getState().addLog('error', `addColumns failed: ${err.message}`);
        return {
          success: false,
          replyText: `Failed to add column(s): ${err.message}`,
          summary: `addColumns(failed: ${err.message})`,
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
          description: 'List of atomic replacement rows. Each item is an object mapping column field names to their specific values for that experimental observation. For parameters verified to not be reported in the document, use "Not reported".',
          items: {
            type: Type.OBJECT,
            description: 'Atomic row object mapping column fields to values.',
          },
        },
        citations: {
          type: Type.ARRAY,
          description: 'Required array of evidence citation maps corresponding to each replacement row (containing pageNumber, sectionName, snippetQuote, reasoning for columns).',
          items: {
            type: Type.OBJECT,
            description: 'Citation map for the replacement row.',
          },
        },
        reasoning: {
          type: Type.STRING,
          description: 'Scientific rationale for disaggregating this row.',
        },
      },
      required: ['replacementRows', 'citations', 'reasoning'],
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
        gridStore.disaggregateRow(targetRowId, args.replacementRows, args.citations);
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
          description: 'Optional synthesized values for the merged row columns. For parameters verified to not be reported in the document, use "Not reported".',
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
    description: 'Extract structured findings and evidence citations from the attached research paper PDF into the table grid matching the user research goal and approved schema.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        pdfId: {
          type: Type.STRING,
          description: 'PDF title or ID to extract findings from.',
        },
        userGoal: {
          type: Type.STRING,
          description: 'Optional specific research objective or focus for the extraction (e.g. target strains, treatment conditions).',
        },
      },
    },
    execute: async (args: any, _mode: AgentExecutionMode): Promise<ToolExecutionResult> => {
      try {
        const gridStore = useGridStore.getState();
        const logStore = useLogStore.getState();
      const targetPdfTitle = args.pdfId || 'Active Research Paper';
      const provider = getActiveProvider();
      const isOpenRouter = provider === 'openrouter';
      const isLmStudio = provider === 'lmstudio';
      const isGemini = provider === 'gemini';

      if (isGemini && !getGeminiApiKey()) {
        throw new Error('GEMINI_API_KEY is not configured in settings or environment.');
      }
      if (isOpenRouter && !getOpenRouterApiKey()) {
        throw new Error('OpenRouter API key is not configured in settings.');
      }

      const modelDisplayName = isOpenRouter
        ? `OpenRouter (${getOpenRouterModel() || DEFAULT_OPENROUTER_MODEL})`
        : isLmStudio
        ? `LM Studio (${getLmStudioModel() || 'Local Model'})`
        : `Gemini (${getSelectedGeminiModel()})`;

      logStore.setActiveStep(`[1/3] Reading PDF document & schema columns...`);
      useAgentStore.getState().setActivityStatus('executing_tool', `[1/3] Reading PDF document & schema columns...`, 'extractPDFData');
      logStore.addLog('info', `Starting extraction for "${targetPdfTitle}" using ${modelDisplayName}`);

      const pdfStore = usePdfStore.getState();
      const pdfInfo = pdfStore.pdfs.find((p) => p.id === targetPdfTitle || p.name === targetPdfTitle) || pdfStore.getActivePdf();

      let headers = gridStore.columns.map((c) => c.field);
      if (headers.length === 0) {
        logStore.setActiveStep(`Formulating extraction schema proposal for "${targetPdfTitle}"...`);
        const proposal = await proposeSchemaFromGoal(
          args.userGoal || `Extract empirical scientific parameters from ${pdfInfo?.title || targetPdfTitle}`,
          pdfInfo
        );
        const colList = proposal.proposedColumns
          .map((c, i) => `${i + 1}. **${c.headerName}** (\`${c.field}\`): ${c.description}`)
          .join('\n');

        return {
          success: false,
          replyText: `✋ **Schema Review Required Before Extraction**\n\nNo schema columns are defined in the Data Grid yet. Based on research document *"${pdfInfo?.title || targetPdfTitle}"*, I have drafted the following extraction schema for your review:\n\n${colList}\n\n💡 *Rationale:* ${proposal.rationale}\n\nPlease review and confirm these columns. Once approved, LitSift will extract findings strictly across these fields.`,
          summary: `proposeSchema(${proposal.proposedColumns.length} columns drafted for review)`,
          resultData: { proposedColumns: proposal.proposedColumns },
          error: 'Schema requires user approval before extraction.',
        };
      }

      if (!pdfInfo) {
        throw new Error(`Paper document "${targetPdfTitle}" was not found in the workspace.`);
      }

      logStore.setActiveStep(`[2/3] Extracting findings via ${modelDisplayName}...`);
      useAgentStore.getState().setActivityStatus(
        'executing_tool',
        `[2/3] Extracting schema findings via ${modelDisplayName}...`,
        'extractPDFData'
      );

      const extractionResult = await extractWithFixedSchema({
        paper: pdfInfo,
        lockedSchema: gridStore.columns,
        userGoal: args.userGoal || `Extract parameters for "${pdfInfo.title || targetPdfTitle}"`,
      });

      logStore.setActiveStep(`[3/3] Staging extracted findings into table grid...`);
      useAgentStore.getState().setActivityStatus(
        'executing_tool',
        `[3/3] Staging extracted findings into table grid...`,
        'extractPDFData'
      );

      const stagedRows = stageExtractedRowsToGrid(
        pdfInfo,
        extractionResult.observations,
        gridStore.columns
      );

      logStore.setActiveStep(null);
      logStore.addLog(
        'success',
        `Extraction completed in ${extractionResult.durationSec}s. ${stagedRows.length} row(s) staged for review.`
      );

      const createdRowIds = stagedRows.map((r: GridRow) => r.id);
      return {
        success: true,
        replyText: `Extracted ${stagedRows.length} observation row(s) from **${pdfInfo.title || targetPdfTitle}** into the master table with grounded citations! Newly created row IDs: [${createdRowIds.join(', ')}].`,
        summary: `extractPDFData(${pdfInfo.name || targetPdfTitle} -> ${stagedRows.length} rows: [${createdRowIds.join(', ')}])`,
        resultData: {
          status: 'COMPLETED',
          message: `Successfully created and inserted ${stagedRows.length} new row(s) into the data grid with full evidence citations. The new row IDs are: [${createdRowIds.join(', ')}].`,
          createdRowIds,
          pdfId: pdfInfo.id,
          tokensUsed: extractionResult.tokensUsed,
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
        const provider = getActiveProvider();
        const apiKey = getGeminiApiKey();
        const selectedModel = getSelectedGeminiModel();

        if (provider === 'gemini' && !apiKey) throw new Error('GEMINI_API_KEY is missing.');
        if (provider === 'openrouter' && !getOpenRouterApiKey()) throw new Error('OpenRouter API key is missing.');

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
        const effectiveMode = targetPdf ? resolveEffectiveGroundingMode(targetPdf) : 'none';

        if (targetPdf && effectiveMode === 'pdf') {
          try {
            const rawBase64 = await getPdfBase64(targetPdf);
            const base64Data = rawBase64 && rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
            if (base64Data) {
              contentsParts.push({
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64Data.trim(),
                },
              });
            }
          } catch (e: any) {
            logStore.addLog('warn', `PDF binary read note for "${targetPdf.name}": ${e.message}`);
          }
        }

        if (contentsParts.length === 0 && targetPdf && effectiveMode !== 'none') {
          const isAbstractOnlyMode = effectiveMode === 'abstract_only';
          const docMarkdown = buildPaperMarkdownContext(targetPdf, { abstractOnly: isAbstractOnlyMode });
          if (docMarkdown.trim().length > 0) {
            contentsParts.push({
              text: `[DOCUMENT CONTENT (${isAbstractOnlyMode ? 'Abstract Only' : 'Structured Text'}): "${targetPdf.title || targetPdf.name}"]\n${docMarkdown}`,
            });
          }
        }

        const verifyPrompt = `You are auditing scientific fact-checking evidence for an extracted table cell value.
Target Field: "${targetField}"
Extracted Claim: "${claimValue}"
Document Name: "${targetRow.pdfTitle}"

Inspect the attached research paper content (PDF or text). Verify whether this extracted claim is supported by the text.
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
        let text: string | undefined = '';

        if (provider === 'openrouter') {
          const orModelName = getOpenRouterModel() || DEFAULT_OPENROUTER_MODEL;
          logStore.setActiveStep(`Auditing citation with OpenRouter (${orModelName})...`);
          const fullPromptText = contentsParts.map((p) => p.text || '').filter(Boolean).join('\n\n');
          const openAiMessages: OpenAiMessage[] = [
            {
              role: 'system',
              content: 'You are an expert scientific fact-checking agent. Return valid JSON only.',
            },
            {
              role: 'user',
              content: fullPromptText,
            },
          ];

          const orResult = await executeOpenRouterStructuredGeneration({
            schemaName: 'verificationAudit',
            schema: {
              type: 'OBJECT',
              properties: {
                isSupported: { type: 'BOOLEAN' },
                confidenceScore: { type: 'NUMBER' },
                pageNumber: { type: 'INTEGER' },
                sectionName: { type: 'STRING' },
                exactSupportingQuote: { type: 'STRING' },
                auditReasoning: { type: 'STRING' },
              },
              required: ['pageNumber', 'sectionName', 'exactSupportingQuote', 'auditReasoning'],
            },
            messages: openAiMessages,
            temperature: 0.1,
          });

          const elapsed = ((performance.now() - genStartTime) / 1000).toFixed(2);
          logStore.addLog('info', `⏱️ verifyCitation: OpenRouter responded in ${elapsed}s`, { latencySec: Number(elapsed) });
          text = orResult.rawText;
        } else if (provider === 'lmstudio') {
          const localModelName = getLmStudioModel() || 'Local Model';
          logStore.setActiveStep(`Auditing citation with LM Studio (${localModelName})...`);
          const fullPromptText = contentsParts.map((p) => p.text || '').filter(Boolean).join('\n\n');
          const openAiMessages: OpenAiMessage[] = [
            {
              role: 'system',
              content: 'You are an expert scientific fact-checking agent. Return valid JSON only.',
            },
            {
              role: 'user',
              content: fullPromptText,
            },
          ];

          const lmsResult = await executeLmStudioStructuredGeneration({
            schemaName: 'verificationAudit',
            schema: {
              type: 'OBJECT',
              properties: {
                isSupported: { type: 'BOOLEAN' },
                confidenceScore: { type: 'NUMBER' },
                pageNumber: { type: 'INTEGER' },
                sectionName: { type: 'STRING' },
                exactSupportingQuote: { type: 'STRING' },
                auditReasoning: { type: 'STRING' },
              },
              required: ['pageNumber', 'sectionName', 'exactSupportingQuote', 'auditReasoning'],
            },
            messages: openAiMessages,
            temperature: 0.1,
          });

          const elapsed = ((performance.now() - genStartTime) / 1000).toFixed(2);
          logStore.addLog('info', `⏱️ verifyCitation: LM Studio responded in ${elapsed}s`, { latencySec: Number(elapsed) });
          text = lmsResult.rawText;
        } else {
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

          text = res.candidates?.[0]?.content?.parts?.[0]?.text;
        }

        if (!text) throw new Error('Empty verification response from LLM.');

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
          description: 'Optional query or keyword to filter rows across all columns. Leave empty or pass "all" / "*" to retrieve the full table state.',
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

        const cleanQuery = typeof searchQuery === 'string' ? searchQuery.trim() : '';
        const isSelectAllQuery =
          !cleanQuery ||
          cleanQuery === '*' ||
          cleanQuery.toLowerCase() === 'all' ||
          cleanQuery.toLowerCase() === 'list';

        if (filterField && filterValue) {
          matchingRows = matchingRows.filter((r) =>
            String(r[filterField] || '').toLowerCase().includes(filterValue.toLowerCase())
          );
        } else if (cleanQuery && !isSelectAllQuery) {
          const q = cleanQuery.toLowerCase();
          matchingRows = matchingRows.filter((r) =>
            Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
          );
        }

        const colList = gridStore.columns.map((c) => `"${c.headerName}"`).join(', ');
        const colsDesc =
          gridStore.columns.length > 0
            ? `${gridStore.columns.length} active columns: [${colList}]`
            : `0 schema columns defined`;

        const rowsContent =
          matchingRows.length === 0
            ? `*(0 data rows populated in the grid yet)*`
            : matchingRows
                .map(
                  (r, i) =>
                    `${i + 1}. **${r.pdfTitle}** | ${gridStore.columns
                      .map(
                        (c) =>
                          `${c.headerName}: ${
                            r[c.field] !== undefined && r[c.field] !== ''
                              ? `"${r[c.field]}"`
                              : '(Empty / Unextracted)'
                          }`
                      )
                      .join(', ')}`
                )
                .join('\n');

        return {
          success: true,
          replyText: `📊 **Table State (${colsDesc}; ${matchingRows.length} data rows):**\n\n${rowsContent}`,
          summary: `queryGridData(${matchingRows.length} rows, ${gridStore.columns.length} cols)`,
          resultData: {
            totalRows: gridStore.rows.length,
            columnCount: gridStore.columns.length,
            columns: gridStore.columns.map((c) => c.headerName),
            matches: matchingRows,
          },
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

  proposeExtractionSchema: {
    name: 'proposeExtractionSchema',
    description: 'Propose and draft a scientific table schema (3-8 columns) based on user research goals. Present it for human review before extraction.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        researchGoal: {
          type: Type.STRING,
          description: 'The user research question or specific parameters to extract (e.g. "phage burst size, host, latency")',
        },
      },
      required: ['researchGoal'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const pdfStore = usePdfStore.getState();
        const activePdf = pdfStore.getActivePdf() || pdfStore.pdfs[0];
        const proposal = await proposeSchemaFromGoal(
          args.researchGoal || 'Extract empirical scientific parameters',
          activePdf
        );
        const colList = proposal.proposedColumns
          .map((c, i) => `${i + 1}. **${c.headerName}** (\`${c.field}\`): ${c.description}`)
          .join('\n');

        return {
          success: true,
          replyText: `📋 **Proposed Extraction Schema for Human Review:**\n\n${colList}\n\n💡 *Rationale:* ${proposal.rationale}\n\nPlease review and confirm these columns. Once approved, LitSift will extract findings strictly across these fields.`,
          summary: `proposeSchema(${proposal.proposedColumns.length} columns)`,
          resultData: proposal,
        };
      } catch (err: any) {
        return {
          success: false,
          replyText: `Failed to propose schema: ${err.message}`,
          summary: `proposeSchema(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  searchAcademicLiterature: {
    name: 'searchAcademicLiterature',
    description: 'Search open international academic registries (OpenAlex & Europe PMC) for research papers matching a scientific topic or related to an existing paper. Returns candidate papers with titles, DOIs, abstracts, and Open Access status for user review.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search keywords, topic, or boolean search query (e.g. "Klebsiella phage biofilm kinetics"). Optional if relatedToDoi is specified.',
        },
        relatedToDoi: {
          type: Type.STRING,
          description: 'Optional DOI of an active paper to find related papers from its citation graph and co-citation network.',
        },
        limit: {
          type: Type.NUMBER,
          description: 'Maximum number of candidate papers to retrieve (default: 5, max: 10).',
        },
        openAccessOnly: {
          type: Type.BOOLEAN,
          description: 'Whether to restrict results to Open Access papers with available text/PDF (default: true).',
        },
        yearFrom: {
          type: Type.NUMBER,
          description: 'Optional earliest publication year filter (e.g. 2020).',
        },
      },
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const query = args.query || '';
        const relatedToDoi = args.relatedToDoi;
        const limit = typeof args.limit === 'number' ? args.limit : 5;
        const openAccessOnly = args.openAccessOnly !== false;
        const yearFrom = typeof args.yearFrom === 'number' ? args.yearFrom : undefined;

        const response = await searchAcademicLiterature({
          query,
          relatedToDoi,
          limit,
          openAccessOnly,
          yearFrom,
        });

        if (response.candidates.length === 0) {
          return {
            success: true,
            replyText: `🔍 **Literature Search Results:**\n\nNo papers found matching "${query || relatedToDoi}". Try broadening your search terms or unchecking the Open Access filter.`,
            summary: `searchAcademicLiterature(0 hits)`,
            resultData: response,
          };
        }

        const candidateList = response.candidates
          .map((c, i) => {
            const authorsStr = c.authors.length > 0 ? c.authors.slice(0, 3).join(', ') + (c.authors.length > 3 ? ' et al.' : '') : 'Unknown Authors';
            const yearStr = c.year ? ` (${c.year})` : '';
            const oaBadge = c.isOa ? `[${c.oaStatus.toUpperCase()} OA]` : '[Closed Access]';
            const inWs = c.isAlreadyInWorkspace ? ' *(Already in Workspace)*' : '';
            return `${i + 1}. **${c.title}**${yearStr}\n   - *Authors:* ${authorsStr} | *Journal:* ${c.journal}\n   - *DOI:* \`${c.doi || 'N/A'}\` | ${oaBadge}${inWs}\n   - *Abstract:* ${c.abstractSnippet}`;
          })
          .join('\n\n');

        return {
          success: true,
          replyText: `🔍 **Discovered ${response.candidates.length} Research Paper(s):**\n\n${candidateList}\n\n💡 *Next Step:* Click **[+ Add to Workspace]** on any candidate card below, or ask me to stage specific papers to extract findings from them.`,
          summary: `searchAcademicLiterature(${response.candidates.length} papers found)`,
          resultData: response,
        };
      } catch (err: any) {
        return {
          success: false,
          replyText: `Failed to search academic literature: ${err.message}`,
          summary: `searchAcademicLiterature(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  stagePaperToWorkspace: {
    name: 'stagePaperToWorkspace',
    description: 'Import and stage an academic paper by DOI into the workspace. Resolves full metadata, abstract, and Open Access PDF/text for extraction.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        doi: {
          type: Type.STRING,
          description: 'The canonical DOI of the research paper to stage (e.g. "10.1038/s41467-020-17849-0").',
        },
      },
      required: ['doi'],
    },
    execute: async (args: any): Promise<ToolExecutionResult> => {
      try {
        const { doi } = args;
        if (!doi) {
          throw new Error('Parameter "doi" is required.');
        }

        const paper = await stagePaperByDoi(doi);
        return {
          success: true,
          replyText: `📄 Successfully staged **"${paper.title || paper.name}"** (DOI: \`${paper.doi}\`) into your workspace!\n\nIt is now active and ready for viewing, schema synthesis, and parameter extraction.`,
          summary: `stagePaperToWorkspace(${paper.title || doi})`,
          resultData: {
            paperId: paper.id,
            title: paper.title,
            doi: paper.doi,
            oaStatus: paper.oaStatus,
          },
        };
      } catch (err: any) {
        return {
          success: false,
          replyText: `Failed to stage paper: ${err.message}`,
          summary: `stagePaperToWorkspace(failed: ${err.message})`,
          error: err.message,
        };
      }
    },
  },

  extractAllWorkspacePapers: {
    name: 'extractAllWorkspacePapers',
    description: 'Extract scientific parameters and findings from all research papers loaded in the workspace into the master data grid conforming to the approved schema. Automatically skips papers that have already been extracted.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        userGoal: {
          type: Type.STRING,
          description: 'Optional specific research objective or focus for the extraction (e.g. target strains, treatment conditions, burst size).',
        },
      },
    },
    execute: async (args: any, _mode: AgentExecutionMode): Promise<ToolExecutionResult> => {
      const pdfStore = usePdfStore.getState();
      const gridStore = useGridStore.getState();
      const logStore = useLogStore.getState();
      const agentStore = useAgentStore.getState();

      const provider = getActiveProvider();
      const isOpenRouter = provider === 'openrouter';
      const isGemini = provider === 'gemini';

      if (isGemini && !getGeminiApiKey()) {
        throw new Error('GEMINI_API_KEY is not configured in settings or environment.');
      }
      if (isOpenRouter && !getOpenRouterApiKey()) {
        throw new Error('OpenRouter API key is not configured in settings.');
      }

      if (pdfStore.pdfs.length === 0) {
        return {
          success: false,
          replyText: '📄 **No research papers loaded in workspace.**\n\nPlease upload PDF files or discover papers before requesting multi-paper extraction.',
          summary: 'extractAllWorkspacePapers(no papers in workspace)',
          error: 'No research papers in workspace.',
        };
      }

      // Check if schema columns are defined; if not, propose schema based on the first paper
      if (gridStore.columns.length === 0) {
        const anchorPaper = pdfStore.getActivePdf() || pdfStore.pdfs[0];
        logStore.setActiveStep(`Formulating extraction schema proposal for "${anchorPaper.name}"...`);
        const proposal = await proposeSchemaFromGoal(
          args.userGoal || `Extract empirical scientific parameters across research papers`,
          anchorPaper
        );
        const colList = proposal.proposedColumns
          .map((c, i) => `${i + 1}. **${c.headerName}** (\`${c.field}\`): ${c.description}`)
          .join('\n');

        return {
          success: false,
          replyText: `✋ **Schema Review Required Before Batch Extraction**\n\nNo schema columns are defined in the Data Grid yet. Based on *"${anchorPaper.title || anchorPaper.name}"*, I have drafted the following extraction schema for your review:\n\n${colList}\n\n💡 *Rationale:* ${proposal.rationale}\n\nPlease review and confirm these columns. Once approved, LitSift will extract findings across all workspace papers strictly conforming to these fields.`,
          summary: `proposeSchema(${proposal.proposedColumns.length} columns drafted for review)`,
          resultData: { proposedColumns: proposal.proposedColumns },
          error: 'Schema requires user approval before extraction.',
        };
      }

      // Filter out papers that have already been extracted into the data grid
      const existingRows = gridStore.rows;
      const unextractedPapers = pdfStore.pdfs.filter((paper) => {
        const alreadyExtracted = existingRows.some((r) => {
          const doiMatch = paper.doi && r.articleDoi && r.articleDoi.trim().toLowerCase() === paper.doi.trim().toLowerCase();
          const titleMatch = r.pdfTitle && (
            r.pdfTitle.trim().toLowerCase() === (paper.title || '').trim().toLowerCase() ||
            r.pdfTitle.trim().toLowerCase() === (paper.name || '').trim().toLowerCase()
          );
          return Boolean(doiMatch || titleMatch);
        });
        return !alreadyExtracted;
      });

      const skippedCount = pdfStore.pdfs.length - unextractedPapers.length;

      if (unextractedPapers.length === 0) {
        return {
          success: true,
          replyText: `ℹ️ **All ${pdfStore.pdfs.length} paper(s) in the workspace have already been extracted into the data grid.**\n\nNo unextracted papers remain. All observation rows and grounded citations are already staged in the Data Grid.`,
          summary: `extractAllWorkspacePapers(all ${pdfStore.pdfs.length} papers already extracted)`,
          resultData: {
            totalPapers: pdfStore.pdfs.length,
            skippedCount,
            extractedCount: 0,
          },
        };
      }

      logStore.addLog(
        'info',
        `Starting multi-paper batch extraction for ${unextractedPapers.length} paper(s) (skipping ${skippedCount} previously extracted)...`
      );

      try {
        const batchResult = await executeBatchExtraction({
          papers: unextractedPapers,
          lockedSchema: gridStore.columns,
          signal: agentStore.abortController?.signal,
          onProgress: (prog) => {
            agentStore.setActiveBatchProgress(prog);
            logStore.setActiveStep(prog.message);
          },
        });

        agentStore.setActiveBatchProgress(null);
        logStore.setActiveStep(null);

        const skippedNote = skippedCount > 0 ? ` (skipped ${skippedCount} previously extracted paper${skippedCount > 1 ? 's' : ''})` : '';
        const failNote = batchResult.failedPapers > 0 ? ` (${batchResult.failedPapers} paper(s) encountered errors)` : '';

        return {
          success: true,
          replyText: `✅ **Batch extraction complete!**\n\nSuccessfully extracted **${batchResult.totalRowsExtracted} new observation row(s)** across **${batchResult.successfulPapers} of ${unextractedPapers.length} paper(s)**${skippedNote}${failNote}. All findings have been staged into the Data Grid for your review.`,
          summary: `extractAllWorkspacePapers(${batchResult.successfulPapers}/${unextractedPapers.length} papers -> ${batchResult.totalRowsExtracted} rows)`,
          resultData: {
            totalRowsExtracted: batchResult.totalRowsExtracted,
            successfulPapers: batchResult.successfulPapers,
            failedPapers: batchResult.failedPapers,
            skippedCount,
          },
        };
      } catch (err: any) {
        agentStore.setActiveBatchProgress(null);
        logStore.setActiveStep(null);
        logStore.addLog('error', `Batch extraction failed: ${err.message}`);
        return {
          success: false,
          replyText: `⚠️ Batch extraction halted: ${err.message}`,
          summary: `extractAllWorkspacePapers(failed: ${err.message})`,
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
      parameters.properties.field.description = `Target column field key. Must be one of: ${activeFields.join(', ')}. Columns: ${activeCols.map((c) => `${c.field} ("${c.headerName}")`).join(', ')}`;
    }

    // Dynamically inject active column fields as an enum for batch operations
    if (tool.name === 'batchUpdateCells' && activeFields.length > 0 && parameters.properties?.updates?.items?.properties?.field) {
      parameters.properties.updates.items.properties.field.enum = activeFields;
      parameters.properties.updates.items.properties.field.description = `Target column field key. Must be one of: ${activeFields.join(', ')}. Columns: ${activeCols.map((c) => `${c.field} ("${c.headerName}")`).join(', ')}`;
    }

    // Dynamically inject strict schema properties for updateRow
    if (tool.name === 'updateRow' && activeCols.length > 0 && parameters.properties?.fields) {
      const fieldProperties: Record<string, any> = {};
      activeCols.forEach((col) => {
        fieldProperties[col.field] = {
          type: Type.STRING,
          description: `Extracted value for "${col.headerName}". If not reported or unmeasured, use "Not reported".`,
        };
      });
      parameters.properties.fields = {
        type: Type.OBJECT,
        description: `Key-value map of schema columns to extracted values. Columns: ${activeCols.map((c) => `${c.field} ("${c.headerName}")`).join(', ')}`,
        properties: fieldProperties,
      };
    }

    // Dynamically inject strict schema properties and required fields for appendRows
    if (tool.name === 'appendRows' && activeCols.length > 0 && parameters.properties?.rows?.items?.properties?.fields) {
      const fieldProperties: Record<string, any> = {};
      activeCols.forEach((col) => {
        fieldProperties[col.field] = {
          type: Type.STRING,
          description: `Extracted value for "${col.headerName}". If not reported or unmeasured, use "Not reported".`,
        };
      });
      parameters.properties.rows.items.properties.fields = {
        type: Type.OBJECT,
        description: `Key-value map containing an entry for EVERY schema column. Columns: ${activeCols.map((c) => `${c.field} ("${c.headerName}")`).join(', ')}`,
        properties: fieldProperties,
        required: activeFields,
      };
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
