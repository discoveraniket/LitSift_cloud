import type { PaperDocumentInfo, PaperTable, PaperSection } from '../types/paper';

export interface WindowedContextResult {
  contextText: string;
  sectionsIncluded: string[];
  tablesIncludedCount: number;
  estimatedTokens: number;
  characterCount: number;
  isTruncated: boolean;
}

export interface WindowingOptions {
  maxCharacters?: number;     // Maximum character budget (default: 32,000 ~ 8,000 tokens)
  includeMethods?: boolean;    // Include methods/materials section if budget allows (default: true)
  includeDiscussion?: boolean; // Include discussion section if budget allows (default: false to prioritize Results)
}

const BOILERPLATE_REGEX =
  /^(author('?s)?\s*contributions?|competing\s*interests?|conflicts?\s*of\s*interest|coi|funding|financial\s*disclosure|grant\s*support|references|bibliography|disclaimer|license|data\s*availability|code\s*availability|acknowledg(e?ments?))/i;

const RESULTS_REGEX =
  /(results?|findings?|observations?|phenotype|kinetic|characterization|efficacy|lysis|burst|host\s*range|plaque|morpholog)/i;

const METHODS_REGEX =
  /(methods?|materials?|experimental|procedure|isolation|assay|protocol)/i;

const DISCUSSION_REGEX =
  /(discussion|conclusions?|summary)/i;

/**
 * Formats a PaperTable into a compact GitHub-Flavored Markdown table representation.
 */
export function formatTableToMarkdown(tbl: PaperTable): string {
  const parts: string[] = [];
  const tableTitle = tbl.label || tbl.caption ? (tbl.label ? `${tbl.label}: ${tbl.caption}` : tbl.caption) : `Table ${tbl.id}`;
  parts.push(`### ${tableTitle}`);

  const rawHeaders: string[] = tbl.headers && tbl.headers.length > 0 ? tbl.headers : [];
  let rawRows: string[][] = tbl.rows && tbl.rows.length > 0 ? tbl.rows : [];

  if (rawHeaders.length === 0 && rawRows.length > 0) {
    rawHeaders.push(...rawRows[0]);
    rawRows = rawRows.slice(1);
  }

  const validRows = rawRows.filter((r) => r && r.some((c) => c !== undefined && c !== null && String(c).trim().length > 0));

  if (rawHeaders.length > 0 || validRows.length > 0) {
    const colCount = Math.max(rawHeaders.length, ...validRows.map((r) => r.length), 1);
    const formatCell = (val: any) =>
      val !== undefined && val !== null
        ? String(val).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/\|/g, '\\|').trim()
        : '';

    const headerLine = Array.from({ length: colCount }, (_, i) => formatCell(rawHeaders[i] || `Col ${i + 1}`));
    parts.push(`| ${headerLine.join(' | ')} |`);
    parts.push(`| ${Array(colCount).fill('---').join(' | ')} |`);

    validRows.forEach((row) => {
      const rowLine = Array.from({ length: colCount }, (_, i) => formatCell(row[i]));
      parts.push(`| ${rowLine.join(' | ')} |`);
    });
  }

  return parts.join('\n');
}

/**
 * Builds an information-dense, windowed markdown representation of a paper document.
 * Filters out boilerplate and prioritizes Abstract, Tables, and Results to safely
 * fit within local model context windows without exhausting VRAM or truncating JSON outputs.
 */
export function buildSmartWindowedContext(
  paper: PaperDocumentInfo,
  options?: WindowingOptions
): WindowedContextResult {
  const maxChars = options?.maxCharacters ?? Infinity;
  const includeMethods = options?.includeMethods ?? true;
  const includeDiscussion = options?.includeDiscussion ?? true;

  const parts: string[] = [];
  const sectionsIncluded: string[] = [];
  let tablesIncludedCount = 0;
  let currentLength = 0;
  let isTruncated = false;

  // 1. Header Metadata (~200-400 chars)
  const headerParts: string[] = [`# ${paper.title || paper.name}`];
  if (paper.doi) headerParts.push(`- **DOI**: ${paper.doi}`);
  if (paper.journal) headerParts.push(`- **Journal**: ${paper.journal}${paper.year ? ` (${paper.year})` : ''}`);
  headerParts.push('---\n');
  const headerBlock = headerParts.join('\n');
  parts.push(headerBlock);
  currentLength += headerBlock.length;

  // 2. Abstract (High summary density)
  if (paper.abstractText && paper.abstractText.trim().length > 0) {
    const abstractBlock = `## Abstract\n${paper.abstractText.trim()}\n\n`;
    parts.push(abstractBlock);
    sectionsIncluded.push('Abstract');
    currentLength += abstractBlock.length;
  }

  // 3. Extracted Tables (Highest empirical data density per token)
  if (paper.tables && paper.tables.length > 0) {
    const tableBlocks: string[] = [];
    for (const tbl of paper.tables) {
      const formatted = formatTableToMarkdown(tbl);
      if (formatted.trim().length > 0) {
        if (currentLength + formatted.length + 50 <= maxChars) {
          tableBlocks.push(formatted);
          tablesIncludedCount++;
          currentLength += formatted.length + 2;
        } else {
          isTruncated = true;
          break;
        }
      }
    }
    if (tableBlocks.length > 0) {
      parts.push(`## Extracted Tables\n${tableBlocks.join('\n\n')}\n\n`);
      sectionsIncluded.push(`Tables (${tableBlocks.length})`);
    }
  }

  // 4. Structured Sections Prioritization
  if (paper.sections && paper.sections.length > 0) {
    // Categorize sections
    const resultsSections: PaperSection[] = [];
    const methodsSections: PaperSection[] = [];
    const discussionSections: PaperSection[] = [];
    const otherSections: PaperSection[] = [];

    paper.sections.forEach((sec) => {
      const title = sec.title.trim();
      const cleanTitle = title.split('>').pop()?.trim() || title;

      if (BOILERPLATE_REGEX.test(cleanTitle.replace(/^[^a-zA-Z0-9]+/, ''))) {
        return; // Exclude non-scientific boilerplate
      }

      if (RESULTS_REGEX.test(cleanTitle)) {
        resultsSections.push(sec);
      } else if (METHODS_REGEX.test(cleanTitle)) {
        methodsSections.push(sec);
      } else if (DISCUSSION_REGEX.test(cleanTitle)) {
        discussionSections.push(sec);
      } else {
        otherSections.push(sec);
      }
    });

    // Assemble in strict priority order: Results -> Methods (if enabled) -> Discussion (if enabled) -> Other
    const priorityQueue: PaperSection[] = [
      ...resultsSections,
      ...(includeMethods ? methodsSections : []),
      ...(includeDiscussion ? discussionSections : []),
      ...otherSections,
    ];

    for (const sec of priorityQueue) {
      const cleanContent = (sec.content || '').trim();
      if (!cleanContent) continue;

      const secHeader = `## ${sec.title}\n`;
      const fullSectionText = `${secHeader}${cleanContent}\n\n`;

      if (currentLength + fullSectionText.length <= maxChars) {
        parts.push(fullSectionText);
        sectionsIncluded.push(sec.title);
        currentLength += fullSectionText.length;
      } else {
        // Can we fit a partial section?
        const remainingBudget = maxChars - currentLength - secHeader.length - 50;
        if (remainingBudget > 500) {
          // Truncate at paragraph boundary
          const sliced = cleanContent.slice(0, remainingBudget);
          const lastParagraphIdx = sliced.lastIndexOf('\n\n');
          const finalSlice = lastParagraphIdx > 200 ? sliced.slice(0, lastParagraphIdx) : sliced;

          parts.push(`${secHeader}${finalSlice}\n\n[...section truncated for context window budget...]\n\n`);
          sectionsIncluded.push(`${sec.title} (partial)`);
          currentLength += finalSlice.length + secHeader.length;
        }
        isTruncated = true;
        break;
      }
    }
  } else if ((paper as any).extractedText && (paper as any).extractedText.trim().length > 0) {
    // Fallback for flat extracted text without parsed section boundaries
    const rawText = (paper as any).extractedText.trim();
    const remainingBudget = maxChars - currentLength;

    if (rawText.length <= remainingBudget) {
      parts.push(`## Document Text\n${rawText}\n\n`);
      sectionsIncluded.push('Document Text');
      currentLength += rawText.length;
    } else {
      const slice = rawText.slice(0, Math.max(0, remainingBudget - 100));
      parts.push(`## Document Text\n${slice}\n\n[...text truncated for context window budget...]\n\n`);
      sectionsIncluded.push('Document Text (partial)');
      isTruncated = true;
      currentLength += slice.length;
    }
  }

  const contextText = parts.join('\n').trim();
  const characterCount = contextText.length;
  const estimatedTokens = Math.ceil(characterCount / 4);

  return {
    contextText,
    sectionsIncluded,
    tablesIncludedCount,
    estimatedTokens,
    characterCount,
    isTruncated,
  };
}
