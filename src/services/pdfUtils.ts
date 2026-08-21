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

/**
 * Builds a structured, high-density Markdown representation of a paper document
 * from its metadata, abstract, PMC XML body sections, and semantic tables.
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
  if (paper.abstractText) {
    parts.push(`## Abstract\n${paper.abstractText.trim()}`);
  }

  // 3. Structured Body Sections (e.g. from PMC XML)
  if (paper.sections && paper.sections.length > 0) {
    paper.sections.forEach((sec: any) => {
      const headingLevel = sec.heading?.toLowerCase().includes('sub') ? '###' : '##';
      parts.push(`\n${headingLevel} ${sec.heading || 'Section'}\n${(sec.content || '').trim()}`);
    });
  }

  // 4. Tables
  if (paper.tables && paper.tables.length > 0) {
    parts.push(`\n## Extracted Tables\n`);
    paper.tables.forEach((tbl: any) => {
      parts.push(`### ${tbl.title || `Table ${tbl.id}`}`);
      if (tbl.caption) parts.push(`*Caption: ${tbl.caption}*\n`);
      if (tbl.rows && tbl.rows.length > 0) {
        const colCount = Math.max(...tbl.rows.map((r: any[]) => r.length), 1);
        const headerRow = tbl.rows[0];
        parts.push(`| ${headerRow.map((c: any) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`);
        parts.push(`| ${Array(colCount).fill('---').join(' | ')} |`);
        for (let i = 1; i < tbl.rows.length; i++) {
          parts.push(`| ${tbl.rows[i].map((c: any) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`);
        }
        parts.push('');
      }
    });
  }

  // 5. Figures
  if (paper.figures && paper.figures.length > 0) {
    parts.push(`\n## Figures & Captions\n`);
    paper.figures.forEach((fig: any) => {
      parts.push(`### ${fig.title || `Figure ${fig.id}`}`);
      if (fig.caption) parts.push(`*Caption: ${fig.caption}*\n`);
    });
  }

  return parts.join('\n');
}

