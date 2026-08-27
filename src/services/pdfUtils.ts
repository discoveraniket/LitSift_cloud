import { PdfDocumentInfo, usePdfStore, GroundingMode } from '../store/usePdfStore';

export async function getPdfBase64(pdfInfo: PdfDocumentInfo): Promise<string> {
  if (pdfInfo.base64) {
    const raw = pdfInfo.base64.includes(',') ? pdfInfo.base64.split(',')[1] : pdfInfo.base64;
    return raw.trim();
  }

  try {
    let blob: Blob;

    if (pdfInfo.file) {
      blob = pdfInfo.file;
    } else if (pdfInfo.url) {
      const res = await fetch(pdfInfo.url);
      if (!res.ok) {
        throw new Error(`Failed to fetch PDF from ${pdfInfo.url} (Status ${res.status})`);
      }
      blob = await res.blob();
    } else {
      throw new Error(`No PDF binary or URL available for paper "${pdfInfo.name}".`);
    }

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64String = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64String.trim());
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Cache base64 in store
    usePdfStore.getState().setPdfBase64(pdfInfo.id, base64);
    return base64;
  } catch (err: any) {
    console.error(`Error converting PDF (${pdfInfo.name}) to Base64:`, err);
    throw err;
  }
}

const BOILERPLATE_SECTION_REGEX =
  /^(author('?s)?\s*contributions?|competing\s*interests?|conflicts?\s*of\s*interest|coi|funding|financial\s*disclosure|grant\s*support|references|bibliography|disclaimer)/i;

/**
 * Resolves the effective grounding mode for a paper based on user preference and available content.
 */
export function resolveEffectiveGroundingMode(paper: any): GroundingMode {
  if (!paper) return 'none';
  const preference: GroundingMode = paper.groundingMode || 'auto';
  if (preference === 'none') return 'none';

  const hasPdf = Boolean(paper.base64 || paper.file || paper.url);
  const hasSections = Boolean(paper.sections && paper.sections.length > 0);
  const hasAbstract = Boolean(paper.abstractText && paper.abstractText.trim().length > 0);

  if (preference === 'pdf') {
    if (hasPdf) return 'pdf';
    if (hasSections) return 'structured_text';
    if (hasAbstract) return 'abstract_only';
    return 'none';
  }

  if (preference === 'structured_text') {
    if (hasSections || hasAbstract) return 'structured_text';
    if (hasPdf) return 'pdf';
    return 'none';
  }

  if (preference === 'abstract_only') {
    if (hasAbstract) return 'abstract_only';
    if (hasSections) return 'structured_text';
    if (hasPdf) return 'pdf';
    return 'none';
  }

  // Auto fallback order: PDF > Structured Text > Abstract Only > None
  if (hasPdf) return 'pdf';
  if (hasSections) return 'structured_text';
  if (hasAbstract) return 'abstract_only';
  return 'none';
}

/**
 * Builds a structured, high-density Markdown representation of a paper document
 * from its metadata, abstract, PMC XML / BioC JSON body sections, and semantic tables.
 */
export function buildPaperMarkdownContext(paper: any, options?: { abstractOnly?: boolean }): string {
  if (!paper) return '';
  const isAbstractOnly = options?.abstractOnly === true;
  const parts: string[] = [];

  // 1. Header & Academic Metadata
  parts.push(`# ${paper.title || paper.name}`);
  if (paper.doi) parts.push(`- **DOI**: ${paper.doi}`);
  if (paper.journal) parts.push(`- **Journal**: ${paper.journal}${paper.year ? ` (${paper.year})` : ''}`);
  if (paper.authors && paper.authors.length > 0) {
    const authorStr = paper.authors.map((a: any) => (typeof a === 'string' ? a : a.name + (a.affiliation ? ` (${a.affiliation})` : ''))).join(', ');
    parts.push(`- **Authors**: ${authorStr}`);
  }
  if (paper.oaStatus) parts.push(`- **Open Access Status**: ${String(paper.oaStatus).toUpperCase()}`);
  if (paper.citationCount !== undefined) parts.push(`- **Cited by**: ${paper.citationCount}`);

  parts.push('\n---\n');

  // 2. Abstract
  if (paper.abstractText && paper.abstractText.trim()) {
    parts.push(`## Abstract\n${paper.abstractText.trim()}`);
  }

  if (isAbstractOnly) {
    parts.push('\n---\n*Note: Abstract-only context mode selected. Full body sections and tables were excluded to minimize context length.*');
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // 3. Structured Body Sections (excluding administrative boilerplate)
  if (paper.sections && paper.sections.length > 0) {
    paper.sections.forEach((sec: any) => {
      const title = (sec.title || sec.heading || 'Section').trim();

      // Check if this section is administrative / non-scientific boilerplate
      const cleanTitleForCheck = title.split('>').pop()?.trim() || title;
      if (BOILERPLATE_SECTION_REGEX.test(cleanTitleForCheck.replace(/^[^a-zA-Z0-9]+/, ''))) {
        return; // Skip non-scientific boilerplate to save 1,500-3,500 prompt tokens
      }

      const isSub = title.toLowerCase().includes('sub') || title.includes(' > ');
      const headingLevel = isSub ? '###' : '##';
      const cleanContent = (sec.content || '').trim();

      if (cleanContent.length > 0) {
        parts.push(`\n${headingLevel} ${title}\n${cleanContent}`);
      }
    });
  }

  // 4. Tables (Compact formatting)
  if (paper.tables && paper.tables.length > 0) {
    parts.push(`\n## Extracted Tables\n`);
    paper.tables.forEach((tbl: any) => {
      const tableTitle = tbl.label || tbl.title || `Table ${tbl.id}`;
      parts.push(`### ${tableTitle}`);
      if (tbl.caption) parts.push(`*Caption: ${tbl.caption}*\n`);

      const rawHeaders: string[] = tbl.headers && tbl.headers.length > 0 ? tbl.headers : [];
      let rawRows: string[][] = tbl.rows && tbl.rows.length > 0 ? tbl.rows : [];

      if (rawHeaders.length === 0 && rawRows.length > 0) {
        rawHeaders.push(...rawRows[0]);
        rawRows = rawRows.slice(1);
      }

      // Filter out completely empty rows
      const validRows = rawRows.filter((r: any[]) => r && r.some((c) => c !== undefined && c !== null && String(c).trim().length > 0));

      if (rawHeaders.length > 0 || validRows.length > 0) {
        const colCount = Math.max(
          rawHeaders.length,
          ...validRows.map((r: any[]) => r.length),
          1
        );

        const formatCell = (val: any) =>
          val !== undefined && val !== null
            ? String(val).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/\|/g, '\\|').trim()
            : '';

        const headerLine = Array.from({ length: colCount }, (_, i) => formatCell(rawHeaders[i] || `Col ${i + 1}`));
        parts.push(`| ${headerLine.join(' | ')} |`);
        parts.push(`| ${Array(colCount).fill('---').join(' | ')} |`);

        validRows.forEach((row: any[]) => {
          const rowLine = Array.from({ length: colCount }, (_, i) => formatCell(row[i]));
          parts.push(`| ${rowLine.join(' | ')} |`);
        });

        parts.push('');
      }
    });
  }

  // 5. Figures
  if (paper.figures && paper.figures.length > 0) {
    parts.push(`\n## Figures & Captions\n`);
    paper.figures.forEach((fig: any) => {
      parts.push(`### ${fig.label || fig.title || `Figure ${fig.id}`}`);
      if (fig.caption) parts.push(`*Caption: ${fig.caption}*\n`);
    });
  }

  parts.push('\n---\n*Note: Non-scientific administrative boilerplate sections (References, Author Contributions, Funding Statements, Competing Interests) were intentionally omitted from this text representation to optimize context tokens.*');

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export interface GroundingPayloadDetails {
  effectiveMode: GroundingMode;
  modeLabel: string;
  badgeColor: string;
  badgeBg: string;
  sizeEstimate: string;
  previewContent: string;
  hasPdf: boolean;
  hasSections: boolean;
  hasAbstract: boolean;
}

/**
 * Computes payload metadata, token/size estimates, and preview content for the active paper.
 */
export function getGroundingPayloadDetails(paper: any): GroundingPayloadDetails {
  if (!paper) {
    return {
      effectiveMode: 'none',
      modeLabel: 'No Document Attached',
      badgeColor: 'var(--text-muted)',
      badgeBg: 'rgba(255, 255, 255, 0.05)',
      sizeEstimate: '0 tokens',
      previewContent: '(No document currently selected in workspace)',
      hasPdf: false,
      hasSections: false,
      hasAbstract: false,
    };
  }

  const effectiveMode = resolveEffectiveGroundingMode(paper);
  const hasPdf = Boolean(paper.base64 || paper.file || paper.url);
  const hasSections = Boolean(paper.sections && paper.sections.length > 0);
  const hasAbstract = Boolean(paper.abstractText && paper.abstractText.trim().length > 0);

  if (effectiveMode === 'none') {
    return {
      effectiveMode: 'none',
      modeLabel: 'Detached (No Document Context)',
      badgeColor: '#a6adc8',
      badgeBg: 'rgba(166, 173, 200, 0.12)',
      sizeEstimate: '0 tokens (Omitted from prompt)',
      previewContent: `[EXCLUDED FROM PROMPT CONTEXT]\nPaper "${paper.title || paper.name}" will not be attached to LLM requests while grounding is detached.`,
      hasPdf,
      hasSections,
      hasAbstract,
    };
  }

  if (effectiveMode === 'pdf') {
    let fileSizeStr = 'Binary Stream';
    if (paper.file && paper.file.size) {
      const mb = (paper.file.size / (1024 * 1024)).toFixed(2);
      fileSizeStr = `${mb} MB PDF`;
    } else if (paper.base64) {
      const approxBytes = (paper.base64.length * 3) / 4;
      const mb = (approxBytes / (1024 * 1024)).toFixed(2);
      fileSizeStr = `${mb} MB PDF`;
    }

    const preview = `[MULTIMODAL PDF BINARY ATTACHMENT]
• Document: "${paper.title || paper.name}"
• MIME Type: application/pdf
• Payload Type: Inline Base64 Data Stream
• Multimodal Capability: Native Vision (Gemini reads text, multi-column layouts, figures, vector tables, and visual evidence coordinates)
• DOI: ${paper.doi || 'N/A'}
• Journal: ${paper.journal || 'N/A'} ${paper.year ? `(${paper.year})` : ''}
• Authors: ${paper.authors ? paper.authors.map((a: any) => (typeof a === 'string' ? a : a.name)).join(', ') : 'N/A'}`;

    return {
      effectiveMode: 'pdf',
      modeLabel: 'PDF Multimodal (Binary)',
      badgeColor: '#89b4fa',
      badgeBg: 'rgba(137, 180, 250, 0.15)',
      sizeEstimate: `${fileSizeStr} (Multimodal Vision)`,
      previewContent: preview,
      hasPdf,
      hasSections,
      hasAbstract,
    };
  }

  if (effectiveMode === 'abstract_only') {
    const text = buildPaperMarkdownContext(paper, { abstractOnly: true });
    const approxTokens = Math.ceil(text.length / 4);
    const kb = (new Blob([text]).size / 1024).toFixed(1);

    return {
      effectiveMode: 'abstract_only',
      modeLabel: 'Abstract-Only Text',
      badgeColor: '#fab387',
      badgeBg: 'rgba(250, 179, 135, 0.15)',
      sizeEstimate: `~${approxTokens.toLocaleString()} tokens (${kb} KB text)`,
      previewContent: text,
      hasPdf,
      hasSections,
      hasAbstract,
    };
  }

  // Structured Text
  const fullText = buildPaperMarkdownContext(paper, { abstractOnly: false });
  const approxTokens = Math.ceil(fullText.length / 4);
  const kb = (new Blob([fullText]).size / 1024).toFixed(1);
  const sectionCount = paper.sections?.length || 0;
  const tableCount = paper.tables?.length || 0;

  return {
    effectiveMode: 'structured_text',
    modeLabel: 'Full Structured Text',
    badgeColor: '#cba6f7',
    badgeBg: 'rgba(203, 166, 247, 0.15)',
    sizeEstimate: `~${approxTokens.toLocaleString()} tokens (${kb} KB · ${sectionCount} sec, ${tableCount} tbl)`,
    previewContent: fullText,
    hasPdf,
    hasSections,
    hasAbstract,
  };
}

