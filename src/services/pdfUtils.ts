import { PdfDocumentInfo, usePdfStore } from '../store/usePdfStore';

export async function getPdfBase64(pdfInfo: PdfDocumentInfo): Promise<string> {
  if (pdfInfo.base64) {
    return pdfInfo.base64;
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
        resolve(base64String);
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
 * Builds a structured, high-density Markdown representation of a paper document
 * from its metadata, abstract, PMC XML / BioC JSON body sections, and semantic tables.
 * Applies selective section filtering:
 * - PRESERVES scientific & repository sections: Data Availability, Supplementary Material, Ethics Statement, Acknowledgments
 * - EXCLUDES pure administrative boilerplate: Author Contributions, Funding, Competing Interests, References
 * - Compacts table cell representations without losing data
 * - Compresses multi-space and consecutive empty line clutter
 */
export function buildPaperMarkdownContext(paper: any): string {
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

