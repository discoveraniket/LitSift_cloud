import { create } from 'zustand';
import { produce } from 'immer';
import { GridState, SchemaColumn, GridRow, CellCitation } from '../types/grid';
import { db } from '../db/litsiftDb';

interface GridSnapshot {
  columns: SchemaColumn[];
  rows: GridRow[];
}

const undoStack: GridSnapshot[] = [];
const redoStack: GridSnapshot[] = [];

const persistToStorage = async (columns: SchemaColumn[], rows: GridRow[]) => {
  try {
    await db.gridTable.put({
      id: 'current',
      columns,
      rows,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('Failed to save grid state to IndexedDB:', err);
  }
};

const saveSnapshot = (state: GridState) => {
  if (undoStack.length >= 100) {
    undoStack.shift();
  }
  undoStack.push({
    columns: JSON.parse(JSON.stringify(state.columns)),
    rows: JSON.parse(JSON.stringify(state.rows)),
  });
  redoStack.length = 0; // Clear redo stack on new edit action
};

export const sanitizeField = (name: string): string => {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!clean) return `col_${Math.random().toString(36).substring(2, 6)}`;
  if (clean === 'document' || clean === 'title' || clean === 'pdf') return 'pdfTitle';
  return clean;
};

export const useGridStore = create<GridState>((set) => ({
  columns: [],
  rows: [],
  selectedRowIds: [],

  hydrateFromDb: async () => {
    try {
      const stored = await db.gridTable.get('current');
      if (stored && stored.columns && stored.rows) {
        set({
          columns: stored.columns,
          rows: stored.rows,
        });
      }
    } catch (err) {
      console.warn('Failed to hydrate grid from IndexedDB:', err);
    }
  },

  resetActiveSelection: () =>
    set({
      focusedCell: null,
      activeCitation: null,
      activeEvidence: null,
      selectedRowIds: [],
      selectedColumnField: undefined,
    }),

  updateCell: (rowId, field, value) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        const row = state.rows.find((r) => r.id === rowId);
        if (row) {
          row[field] = value;
          if (row.isDraftRow) {
            row.isDraftRow = false;
            row.aiStatus = 'Confirmed';
            // Spawn next blank draft row at bottom
            const newDraftRow: GridRow = {
              id: `draft-row-${Date.now()}`,
              pdfId: row.pdfId || '',
              pdfTitle: row.pdfTitle || 'Research_Paper.pdf',
              methodology: '',
              sampleSize: '',
              keyResults: '',
              limitations: '',
              aiStatus: 'Confirmed',
              isDraftRow: true,
            };
            state.rows.push(newDraftRow);
          } else {
            row.aiStatus = 'Confirmed';
          }
        }
      })
    ),

  batchUpdateCells: (updates) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        updates.forEach((u) => {
          const row = state.rows.find((r) => r.id === u.rowId);
          if (row) {
            row[u.field] = u.value;
            row.aiStatus = 'Confirmed';
            if (u.reasoning || u.snippetQuote || u.sectionName || u.pageNumber) {
              if (!row.citationMap) row.citationMap = {};
              row.citationMap[u.field] = {
                pageNumber: Number(u.pageNumber) || 1,
                sectionName: u.sectionName || 'Updated Field',
                snippetQuote: u.snippetQuote || String(u.value),
                reasoning: u.reasoning || `Updated value "${u.value}"`,
                confidence: 0.95,
              };
            }
          }
        });
        persistToStorage(state.columns, state.rows);
      })
    ),

  updateCellCitation: (rowId, field, citation) =>
    set(
      produce((state: GridState) => {
        const row = state.rows.find((r) => r.id === rowId);
        if (row) {
          if (!row.citationMap) row.citationMap = {};
          row.citationMap[field] = citation;
          if (state.focusedCell?.rowId === rowId && state.focusedCell?.field === field) {
            state.activeCitation = citation;
          }
        }
      })
    ),

  updateRow: (rowId, fields, citations) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        const row = state.rows.find((r) => r.id === rowId);
        if (row) {
          Object.entries(fields).forEach(([k, v]) => {
            const matchingCol = state.columns.find(
              (c) => c.field === k || c.headerName.toLowerCase() === k.toLowerCase()
            );
            if (matchingCol) {
              row[matchingCol.field] = v;
            } else {
              row[k] = v;
            }
          });
          row.aiStatus = 'Confirmed';
          if (citations) {
            if (!row.citationMap) row.citationMap = {};
            Object.entries(citations).forEach(([k, cit]) => {
              const matchingCol = state.columns.find(
                (c) => c.field === k || c.headerName.toLowerCase() === k.toLowerCase()
              );
              const fieldKey = matchingCol ? matchingCol.field : k;
              row.citationMap![fieldKey] = cit;
            });
          }
        }
        persistToStorage(state.columns, state.rows);
      })
    ),

  addRow: (pdfId = '', pdfTitle = 'Research_Paper.pdf') =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        const newRowId = `row-${Date.now()}`;
        const newRow: GridRow = {
          id: newRowId,
          pdfId,
          pdfTitle,
          methodology: 'New Extraction Entry',
          sampleSize: 'N/A',
          keyResults: 'Enter results...',
          limitations: 'None specified',
          aiStatus: 'Pending Review',
        };
        state.rows.push(newRow);
      })
    ),

  appendRow: (row) => {
    let createdRow: GridRow = {
      id: row.id || `manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      pdfId: row.pdfId || '',
      pdfTitle: row.pdfTitle || 'Manual Entry',
      aiStatus: row.aiStatus || 'Confirmed',
      citationMap: row.citationMap || {},
      ...row,
    };
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        state.columns.forEach((col) => {
          if (createdRow[col.field] === undefined || createdRow[col.field] === null) {
            createdRow[col.field] = '-';
          }
        });
        state.rows.push(createdRow);
        persistToStorage(state.columns, state.rows);
      })
    );
    return createdRow;
  },

  deleteRow: (rowId) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        state.rows = state.rows.filter((r) => r.id !== rowId);
      })
    ),

  deleteRows: (rowIds) =>
    set(
      produce((state: GridState) => {
        if (!rowIds || rowIds.length === 0) return;
        saveSnapshot(state);
        state.rows = state.rows.filter((r) => !rowIds.includes(r.id));
        state.selectedRowIds = state.selectedRowIds.filter((id) => !rowIds.includes(id));
      })
    ),

  addColumn: (headerName, initialValues, citations) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        const cleanName = headerName.trim();
        const field = sanitizeField(cleanName);
        if (!state.columns.some((c) => c.field === field)) {
          state.columns.push({ field, headerName: cleanName, editable: true });
          state.rows.forEach((row) => {
            const val = initialValues?.[row.id] ?? initialValues?.[row.pdfId] ?? initialValues?.[field] ?? '-';
            row[field] = val;
            if (citations && citations[row.id]) {
              if (!row.citationMap) row.citationMap = {};
              row.citationMap[field] = citations[row.id];
            }
          });
        }
      })
    ),

  renameColumn: (field, newHeaderName) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        const col = state.columns.find((c) => c.field === field);
        if (col && field !== 'pdfTitle') {
          col.headerName = newHeaderName;
        }
      })
    ),

  deleteColumn: (field) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        if (field !== 'pdfTitle') {
          state.columns = state.columns.filter((c) => c.field !== field);
          state.rows.forEach((row) => {
            delete row[field];
          });
          if (state.selectedColumnField === field) {
            state.selectedColumnField = undefined;
          }
        }
      })
    ),

  mergeSelectedRows: (rowIds, consolidatedRow, citations) =>
    set(
      produce((state: GridState) => {
        if (rowIds.length < 2) return;
        const targetRows = state.rows.filter((r) => rowIds.includes(r.id) && !r.isDraftRow);
        if (targetRows.length < 2) return;

        saveSnapshot(state);
        const firstRowIndex = state.rows.findIndex((r) => r.id === targetRows[0].id);
        const mergedRow: GridRow = {
          id: `row-${Date.now()}`,
          pdfId: targetRows[0].pdfId,
          pdfTitle: targetRows[0].pdfTitle,
          aiStatus: 'Pending Review',
          citationMap: citations || {},
        };

        if (consolidatedRow) {
          // Use agent-synthesized consolidated values directly
          state.columns.forEach((col) => {
            const val =
              consolidatedRow[col.field] ??
              consolidatedRow[col.headerName] ??
              targetRows[0][col.field] ??
              '-';
            mergedRow[col.field] = val;
          });
        } else {
          // Fallback: merge column values with deduplication
          state.columns.forEach((col) => {
            const rawVals = targetRows
              .map((r) => r[col.field])
              .filter((v) => v && v !== '-' && v !== '');

            const expandedItems: string[] = [];
            rawVals.forEach((val) => {
              if (typeof val === 'string') {
                const parts = val
                  .split(/\n|•/)
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0);
                expandedItems.push(...parts);
              } else {
                expandedItems.push(String(val));
              }
            });

            const uniqueItems = Array.from(new Set(expandedItems));

            if (uniqueItems.length === 0) {
              mergedRow[col.field] = '-';
            } else if (uniqueItems.length === 1) {
              mergedRow[col.field] = uniqueItems[0];
            } else {
              mergedRow[col.field] = uniqueItems.map((item) => `• ${item}`).join('\n');
            }
          });
        }

        // Remove original rows and insert merged row at first position
        state.rows = state.rows.filter((r) => !rowIds.includes(r.id));
        state.rows.splice(firstRowIndex, 0, mergedRow);
        state.selectedRowIds = [];
      })
    ),

  splitSelectedRow: (rowId, targetField) =>
    set(
      produce((state: GridState) => {
        const rowIndex = state.rows.findIndex((r) => r.id === rowId);
        if (rowIndex === -1) return;
        const sourceRow = state.rows[rowIndex];
        if (sourceRow.isDraftRow) return;

        // Find field to split (either targetField, or first multi-line / bullet / semicolon field)
        let fieldToSplit = targetField;
        if (!fieldToSplit) {
          fieldToSplit = state.columns.find((col) => {
            const val = sourceRow[col.field];
            return typeof val === 'string' && (val.includes('\n') || val.includes('•') || val.includes(';'));
          })?.field;
        }

        if (!fieldToSplit) {
          fieldToSplit = 'methodology'; // default fallback
        }

        const rawVal = sourceRow[fieldToSplit] || '';
        // Split by \n, •, or ;
        const parts = rawVal
          .split(/\n|•|;/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);

        if (parts.length <= 1) {
          // If no delimiters found, cleanly split string in half
          const mid = Math.floor(rawVal.length / 2);
          parts[0] = rawVal.slice(0, mid).trim() || 'Part 1';
          parts[1] = rawVal.slice(mid).trim() || 'Part 2';
        }

        const newRowA: GridRow = {
          ...sourceRow,
          id: `row-${Date.now()}-a`,
          [fieldToSplit]: parts[0],
          aiStatus: 'Pending Review',
        };

        const newRowB: GridRow = {
          ...sourceRow,
          id: `row-${Date.now()}-b`,
          [fieldToSplit]: parts.slice(1).join('\n• '),
          aiStatus: 'Pending Review',
        };

        // Replace original row with split rows
        state.rows.splice(rowIndex, 1, newRowA, newRowB);
      })
    ),

  disaggregateRow: (targetRowId, replacementRows, citations) =>
    set(
      produce((state: GridState) => {
        const rowIndex = state.rows.findIndex((r) => r.id === targetRowId);
        if (rowIndex === -1) return;
        const sourceRow = state.rows[rowIndex];
        if (sourceRow.isDraftRow) return;

        saveSnapshot(state);

        const newRows: GridRow[] = replacementRows.map((rep, i) => {
          const newRowId = `row-${Date.now()}-${i}`;
          const mergedCitationMap: Record<string, CellCitation> = {
            ...(sourceRow.citationMap || {}),
          };
          if (citations) {
            const extraCitations = citations[i] || citations[rep.id] || citations;
            if (typeof extraCitations === 'object') {
              Object.assign(mergedCitationMap, extraCitations);
            }
          }

          const newRow: GridRow = {
            ...sourceRow,
            id: newRowId,
            aiStatus: 'Pending Review',
            citationMap: mergedCitationMap,
          };

          state.columns.forEach((col) => {
            const val =
              rep[col.field] ??
              rep[col.headerName] ??
              Object.entries(rep).find(
                ([k]) =>
                  k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
                  col.field.toLowerCase().replace(/[^a-z0-9]/g, '') ||
                  k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
                  col.headerName.toLowerCase().replace(/[^a-z0-9]/g, '')
              )?.[1];

            if (val !== undefined && val !== null) {
              newRow[col.field] = String(val);
            }
          });

          return newRow;
        });

        // Replace original composite row in-place with the array of atomic sub-rows
        state.rows.splice(rowIndex, 1, ...newRows);
        state.selectedRowIds = [];
      })
    ),

  confirmAIEdits: (rowId) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        if (rowId) {
          const row = state.rows.find((r) => r.id === rowId);
          if (row) row.aiStatus = 'Confirmed';
        } else {
          state.rows.forEach((r) => (r.aiStatus = 'Confirmed'));
        }
      })
    ),

  rejectAIEdits: (rowId) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        if (rowId) {
          state.rows = state.rows.filter((r) => r.id !== rowId);
        } else {
          state.rows = state.rows.filter((r) => r.aiStatus !== 'Pending Review');
        }
      })
    ),

  undo: () =>
    set(
      produce((state: GridState) => {
        if (undoStack.length === 0) return;
        const currentSnap = {
          columns: JSON.parse(JSON.stringify(state.columns)),
          rows: JSON.parse(JSON.stringify(state.rows)),
        };
        redoStack.push(currentSnap);

        const previousSnap = undoStack.pop()!;
        state.columns = previousSnap.columns;
        state.rows = previousSnap.rows;
      })
    ),

  redo: () =>
    set(
      produce((state: GridState) => {
        if (redoStack.length === 0) return;
        const currentSnap = {
          columns: JSON.parse(JSON.stringify(state.columns)),
          rows: JSON.parse(JSON.stringify(state.rows)),
        };
        undoStack.push(currentSnap);

        const nextSnap = redoStack.pop()!;
        state.columns = nextSnap.columns;
        state.rows = nextSnap.rows;
      })
    ),

  setSelectedRows: (rowIds) => set({ selectedRowIds: rowIds }),
  setSelectedColumnField: (field) => set({ selectedColumnField: field }),
  setFocusedCell: (cell) => set({ focusedCell: cell }),
  setActiveEvidence: (evidence) =>
    set({
      activeEvidence: evidence
        ? {
            ...evidence,
            flashNonce: Date.now(),
          }
        : null,
    }),
  setActiveCitation: (citation) => set({ activeCitation: citation }),

  addCellDiscussionMessage: (rowId, field, userText) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        const row = state.rows.find((r) => r.id === rowId);
        if (!row) return;

        if (!row.citationMap) row.citationMap = {};
        if (!row.citationMap[field]) {
          row.citationMap[field] = {
            pageNumber: 1,
            sectionName: 'User Discussion',
            snippetQuote: String(row[field] || ''),
            reasoning: 'Manual/Discussion entry',
            confidence: 0.9,
          };
        }

        const citation = row.citationMap[field];
        if (!citation.history) citation.history = [];

        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        citation.history.push({
          id: `msg-${Date.now()}`,
          sender: 'user',
          text: userText,
          timestamp: now,
        });

        // Simulate agent reasoning & cell value mutation
        const lower = userText.toLowerCase();
        let agentResponseText = '';
        let updatedValue = row[field];

        if (lower.includes('genomic') || lower.includes('sequencing') || lower.includes('page 2')) {
          updatedValue = `${row[field]} & Illumina NovaSeq Genomic Sequencing`;
          citation.reasoning = `Updated methodology based on user clarification and Page 2 genomic sequencing protocols.`;
          agentResponseText = `Understood! Added Genomic Sequencing from Page 2 to the cell value and updated the reasoning explanation.`;
          row.aiStatus = 'Pending Review';
        } else if (lower.includes('split')) {
          agentResponseText = `I recommend using the ✂️ Split Row action button to separate these into distinct rows.`;
        } else {
          agentResponseText = `Duly noted! Updated the cell context to reflect your note: "${userText}".`;
          citation.reasoning = `Refined based on user note: "${userText}".`;
        }

        row[field] = updatedValue;

        citation.history.push({
          id: `msg-${Date.now() + 1}`,
          sender: 'agent',
          text: agentResponseText,
          timestamp: now,
        });

        state.activeCitation = { ...citation };
      })
    ),

  importCsvDataset: (headers, parsedRows) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);

        const newCols: SchemaColumn[] = [];
        const seenFields = new Set<string>();

        headers.forEach((h) => {
          const cleanHeader = h.trim();
          const field = sanitizeField(cleanHeader);
          if (!seenFields.has(field)) {
            seenFields.add(field);
            newCols.push({
              field,
              headerName: cleanHeader,
              editable: true,
            });
          }
        });

        // Map parsed CSV rows into GridRow structure
        const newRows: GridRow[] = parsedRows.map((r, i) => {
          const rowObj: GridRow = {
            id: `imported-${Date.now()}-${i}`,
            pdfId: `pdf-imported-${i}`,
            pdfTitle: r.pdfTitle || r.Document || r.Title || r.filename || '',
            aiStatus: 'Confirmed',
          };

          newCols.forEach((col) => {
            if (r[col.headerName] !== undefined) {
              rowObj[col.field] = r[col.headerName];
            } else if (r[col.field] !== undefined) {
              rowObj[col.field] = r[col.field];
            }
          });

          return rowObj;
        });

        state.columns = newCols;
        state.rows = newRows;
      })
    ),

  appendCsvDataset: (headers, parsedRows) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);

        // Check for new headers and add missing columns to schema without duplicate fields
        headers.forEach((h) => {
          const cleanHeader = h.trim();
          const field = sanitizeField(cleanHeader);
          if (!state.columns.some((c) => c.field === field)) {
            state.columns.push({
              field,
              headerName: cleanHeader,
              editable: true,
            });
          }
        });

        // Append new rows
        const appendedRows: GridRow[] = parsedRows.map((r, i) => {
          const rowObj: GridRow = {
            id: `imported-${Date.now()}-${i}`,
            pdfId: `pdf-imported-${i}`,
            pdfTitle: r.pdfTitle || r.Document || r.Title || r.filename || `Imported_Paper_${i + 1}.pdf`,
            aiStatus: 'Confirmed',
          };

          if (r.citationMap) {
            rowObj.citationMap = r.citationMap;
          }
          if (r.aiStatus) {
            rowObj.aiStatus = r.aiStatus;
          }

          state.columns.forEach((col) => {
            if (r[col.headerName] !== undefined) {
              rowObj[col.field] = r[col.headerName];
            } else if (r[col.field] !== undefined) {
              rowObj[col.field] = r[col.field];
            }
          });

          return rowObj;
        });

        state.rows.push(...appendedRows);
      })
    ),

  appendRows: (newRows) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        state.rows.push(...newRows);
      })
    ),

  clearTable: () =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        state.columns = [];
        state.rows = [];
        state.selectedRowIds = [];
        state.selectedColumnField = undefined;
        state.focusedCell = null;
        state.activeCitation = null;
        state.activeEvidence = null;
      })
    ),

  reorderRows: (sourceIndex, destinationIndex) =>
    set(
      produce((state: GridState) => {
        saveSnapshot(state);
        const [movedRow] = state.rows.splice(sourceIndex, 1);
        state.rows.splice(destinationIndex, 0, movedRow);
      })
    ),
}));

// Robust automatic localStorage synchronization on EVERY state update
useGridStore.subscribe((state) => {
  persistToStorage(state.columns, state.rows);
});
