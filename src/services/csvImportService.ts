import { useGridStore } from '../store/useGridStore';
import { useAgentStore } from '../store/useAgentStore';
import { useLogStore } from '../store/useLogStore';
import type { SchemaColumn } from '../types/grid';

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  rawRowCount: number;
  filename?: string;
  isTemplate: boolean;
}

export interface HeaderAlignmentResult {
  matched: Array<{
    incomingHeader: string;
    existingField: string;
    existingHeaderName: string;
  }>;
  unmatched: string[];
}

/**
 * Sanitizes a column header string into a clean, deterministic schema field identifier.
 * e.g. "Burst Size (PFU/cell)" -> "burst_size_pfu_cell"
 */
export function sanitizeField(headerName: string): string {
  const cleaned = headerName
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_');
  return cleaned || 'col_' + Math.random().toString(36).substring(2, 7);
}

/**
 * Robust CSV string parser handling quoted strings, internal commas, and linebreaks.
 */
export function parseCsv(text: string, filename?: string): ParsedCsvResult {
  if (!text) {
    return { headers: [], rows: [], rawRowCount: 0, filename, isTemplate: true };
  }

  // Strip UTF-8 BOM if present
  const cleanText = text.replace(/^\uFEFF/, '').trim();
  if (!cleanText) {
    return { headers: [], rows: [], rawRowCount: 0, filename, isTemplate: true };
  }

  const lines: string[] = [];
  let currentLine = '';
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      currentLine += char;
      if (insideQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // Skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip CRLF
      }
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length === 0) {
    return { headers: [], rows: [], rawRowCount: 0, filename, isTemplate: true };
  }

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;

    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      const nc = line[j + 1];

      if (c === '"') {
        if (inQuote && nc === '"') {
          cur += '"';
          j++;
        } else {
          inQuote = !inQuote;
        }
      } else if (c === ',' && !inQuote) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    fields.push(cur.trim());
    return fields;
  };

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map((h) => h.replace(/^["']|["']$/g, '').trim()).filter(Boolean);

  const rawRows = lines.slice(1);
  const rows: Record<string, string>[] = [];

  for (const rowLine of rawRows) {
    const values = parseLine(rowLine);
    // Ignore completely empty rows
    const hasAnyContent = values.some((v) => v.trim().length > 0);
    if (!hasAnyContent) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] !== undefined ? values[idx].replace(/^["']|["']$/g, '').trim() : '';
    });
    rows.push(rowObj);
  }

  // A file is detected as a Schema Template if it has headers but 0 data rows,
  // or exactly 1 row where all fields are blank
  const isTemplate =
    rows.length === 0 ||
    (rows.length === 1 && Object.values(rows[0]).every((val) => !val || val.trim() === ''));

  return {
    headers,
    rows: isTemplate ? [] : rows,
    rawRowCount: rows.length,
    filename,
    isTemplate,
  };
}

/**
 * Checks how incoming CSV headers align with the existing grid schema to avoid duplicate columns.
 */
export function alignHeadersWithSchema(
  incomingHeaders: string[],
  existingColumns: SchemaColumn[]
): HeaderAlignmentResult {
  const matched: HeaderAlignmentResult['matched'] = [];
  const unmatched: string[] = [];

  for (const incoming of incomingHeaders) {
    const incomingSanitized = sanitizeField(incoming);

    const match = existingColumns.find((col) => {
      if (col.field === incomingSanitized) return true;
      if (col.headerName.toLowerCase().trim() === incoming.toLowerCase().trim()) return true;
      if (sanitizeField(col.headerName) === incomingSanitized) return true;
      return false;
    });

    if (match) {
      matched.push({
        incomingHeader: incoming,
        existingField: match.field,
        existingHeaderName: match.headerName,
      });
    } else {
      unmatched.push(incoming);
    }
  }

  return { matched, unmatched };
}

/**
 * Applies a Schema Template (column definitions) directly into the workspace data grid.
 */
export function applyCsvTemplateToStore(
  selectedHeaders: string[],
  options?: { clearExistingRows?: boolean; filename?: string }
): void {
  const logStore = useLogStore.getState();
  const agentStore = useAgentStore.getState();

  const newColumns: SchemaColumn[] = [];
  const seenFields = new Set<string>();

  for (const h of selectedHeaders) {
    const field = sanitizeField(h);
    if (!seenFields.has(field)) {
      seenFields.add(field);
      newColumns.push({
        field,
        headerName: h.trim(),
        editable: true,
      });
    }
  }

  if (newColumns.length === 0) return;

  // Update store schema columns
  useGridStore.setState((state) => ({
    ...state,
    columns: newColumns,
    rows: options?.clearExistingRows ? [] : state.rows,
  }));

  const label = options?.filename ? ` from "${options.filename}"` : '';
  logStore.addLog(
    'success',
    `Applied CSV Schema Template${label}: ${newColumns.map((c) => c.headerName).join(', ')}`
  );

  // Notify agent chat
  const templateMsg = `📋 **Applied Custom Schema Template${label} (${newColumns.length} columns):**\n\n${newColumns.map((c, i) => `${i + 1}. **${c.headerName}** (\`${c.field}\`)`).join('\n')}\n\n💡 *Next Step:* Click **[⚡ Extract Findings]** on an open paper or ask me: *"Extract data from this paper into our new schema."*`;

  agentStore.addAgentResponse(templateMsg);
}

/**
 * Ingests an empirical CSV dataset into the workspace (either replacing or appending).
 */
export function applyCsvDatasetToStore(
  parsed: ParsedCsvResult,
  mode: 'replace' | 'append'
): void {
  const gridStore = useGridStore.getState();
  const logStore = useLogStore.getState();
  const agentStore = useAgentStore.getState();

  if (mode === 'replace') {
    gridStore.importCsvDataset(parsed.headers, parsed.rows);
  } else {
    gridStore.appendCsvDataset(parsed.headers, parsed.rows);
  }

  const label = parsed.filename ? ` "${parsed.filename}"` : '';
  const actionText = mode === 'replace' ? 'Replaced data grid with' : 'Appended';

  logStore.addLog(
    'success',
    `${actionText} ${parsed.rows.length} row(s) from CSV${label} (${parsed.headers.length} columns)`
  );

  agentStore.addAgentResponse(
    `📥 **Successfully ${mode === 'replace' ? 'loaded' : 'appended'} CSV dataset${label}:**\n- **Rows:** ${parsed.rows.length}\n- **Columns:** ${parsed.headers.join(', ')}\n\nObservations are now active in the data grid.`
  );
}
