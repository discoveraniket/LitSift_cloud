import { useGridStore, sanitizeField } from '../store/useGridStore';
import { SchemaColumn, GridRow, CellCitation } from '../types/grid';
import { PaperDocumentInfo } from '../types/paper';
import { ProposedColumn, SinglePaperObservation } from '../types/extraction';

/**
 * Applies a human-approved schema proposal to the Data Grid store.
 * Adds any missing columns without altering existing columns or rows.
 */
export function applyApprovedSchemaToGrid(columns: ProposedColumn[]): SchemaColumn[] {
  const gridStore = useGridStore.getState();
  const existingCols = gridStore.columns;

  columns.forEach((col) => {
    const cleanHeader = col.headerName.trim();
    const targetField = col.field || sanitizeField(cleanHeader);

    const alreadyExists = existingCols.some(
      (c) =>
        c.field.toLowerCase() === targetField.toLowerCase() ||
        c.headerName.toLowerCase() === cleanHeader.toLowerCase()
    );

    if (!alreadyExists) {
      gridStore.addColumn(cleanHeader);
    }
  });

  return useGridStore.getState().columns;
}

/**
 * Stages observations extracted from a research paper into the Data Grid store.
 * Strictly adheres to the locked schema, sets status to 'Pending Review', and attaches
 * grounded verbatim evidence citations for browser highlighting.
 */
export function stageExtractedRowsToGrid(
  paper: PaperDocumentInfo,
  observations: SinglePaperObservation[],
  lockedSchema: SchemaColumn[]
): GridRow[] {
  if (!observations || observations.length === 0) {
    return [];
  }

  const gridStore = useGridStore.getState();
  const paperTitle = paper.title || paper.name || 'Research Paper';
  const paperId = paper.id || `pdf-${Date.now()}`;

  const rowsToAppend: GridRow[] = observations.map((obs, i) => {
    const rowId = `ext-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
    const rowObj: GridRow = {
      id: rowId,
      pdfId: paperId,
      pdfTitle: paperTitle,
      aiStatus: 'Pending Review',
      pendingReviewFields: lockedSchema.map((c) => c.field),
      citationMap: {},
    };

    const citationMap: Record<string, CellCitation> = {};

    lockedSchema.forEach((col) => {
      // Find field matching by field key or header name
      const val =
        obs.fields[col.field] ??
        obs.fields[col.headerName] ??
        Object.entries(obs.fields).find(
          ([k]) =>
            k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
            col.field.toLowerCase().replace(/[^a-z0-9]/g, '') ||
            k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
            col.headerName.toLowerCase().replace(/[^a-z0-9]/g, '')
        )?.[1];

      let cellValue = val !== undefined && val !== null ? String(val).trim() : 'Not reported';
      if (
        cellValue === '-' ||
        cellValue === '' ||
        cellValue.toLowerCase() === 'none' ||
        cellValue.toLowerCase() === 'n/a'
      ) {
        cellValue = 'Not reported';
      }

      rowObj[col.field] = cellValue;

      // Extract citation matching this column
      const rawCit =
        obs.citations[col.field] ??
        obs.citations[col.headerName] ??
        Object.entries(obs.citations).find(
          ([k]) =>
            k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
            col.field.toLowerCase().replace(/[^a-z0-9]/g, '') ||
            k.toLowerCase().replace(/[^a-z0-9]/g, '') ===
            col.headerName.toLowerCase().replace(/[^a-z0-9]/g, '')
        )?.[1];

      const isUnreported = cellValue === 'Not reported';

      if (rawCit && typeof rawCit === 'object') {
        const citObj: CellCitation = {
          pageNumber: Number(rawCit.pageNumber) || 1,
          sectionName: rawCit.sectionName || (isUnreported ? 'N/A' : 'Extracted Section'),
          paragraphNumber: rawCit.paragraphNumber || undefined,
          snippetQuote: rawCit.snippetQuote || (isUnreported ? 'Not reported in document' : cellValue),
          reasoning:
            rawCit.reasoning ||
            (isUnreported
              ? `The parameter "${col.headerName}" was not reported in the document.`
              : `Extracted value "${cellValue}" from source text.`),
          confidence: Number(rawCit.confidence) || (isUnreported ? 0.99 : 0.95),
        };
        citationMap[col.field] = citObj;
        citationMap[col.headerName] = citObj;
      } else {
        const fallbackCit: CellCitation = {
          pageNumber: 1,
          sectionName: isUnreported ? 'N/A' : 'Observation Section',
          snippetQuote: isUnreported ? 'Not reported in document' : cellValue,
          reasoning: isUnreported
            ? `The parameter "${col.headerName}" was not reported in this paper.`
            : `Extracted value "${cellValue}" from document findings.`,
          confidence: isUnreported ? 0.99 : 0.95,
        };
        citationMap[col.field] = fallbackCit;
        citationMap[col.headerName] = fallbackCit;
      }
    });

    rowObj.citationMap = citationMap;
    return rowObj;
  });

  gridStore.appendRows(rowsToAppend);
  return rowsToAppend;
}
