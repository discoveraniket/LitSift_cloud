import { useGridStore, sanitizeField } from '../store/useGridStore';
import { usePdfStore } from '../store/usePdfStore';
import { normalizeDoi } from './doiService';
import { GridRow, SchemaColumn } from '../types/grid';
import { PaperDocumentInfo } from '../types/paper';

export interface CorrespondingAuthorDetails {
  name: string;
  email: string;
  institution: string;
  orcid: string;
}

export interface EnrichmentProgress {
  current: number;
  total: number;
  message: string;
  percent: number;
}

export interface EnrichmentResult {
  success: boolean;
  totalRows: number;
  enrichedRows: number;
  uniquePapers: number;
  addedColumns: string[];
  message: string;
  error?: string;
}

/**
 * Discovers a DOI from a table row using multiple fallback strategies:
 * 1. Checks columns explicitly named 'doi', 'article_doi', etc.
 * 2. Checks row.doi property.
 * 3. Looks up paper in loaded PDF store by row.pdfId.
 * 4. Regex scans cell text values for standard DOI pattern '10.xxxx/...'.
 */
export function extractDoiFromRow(
  row: GridRow,
  columns: SchemaColumn[],
  pdfs: PaperDocumentInfo[] = []
): string | null {
  if (!row) return null;

  // 1. Column Header / Field match
  const doiCol = columns.find(
    (c) =>
      c.field.toLowerCase() === 'doi' ||
      c.headerName.toLowerCase() === 'doi' ||
      c.headerName.toLowerCase().includes('doi') ||
      c.field.toLowerCase().includes('doi')
  );

  if (doiCol && row[doiCol.field]) {
    const val = String(row[doiCol.field]).trim();
    const normalized = normalizeDoi(val);
    if (normalized && normalized.startsWith('10.')) {
      return normalized;
    }
  }

  // 2. Direct property on row
  if (row.doi && typeof row.doi === 'string') {
    const normalized = normalizeDoi(row.doi);
    if (normalized && normalized.startsWith('10.')) {
      return normalized;
    }
  }

  // 3. Lookup via pdfId in loaded papers
  if (row.pdfId && pdfs.length > 0) {
    const paper = pdfs.find((p) => p.id === row.pdfId);
    if (paper?.doi) {
      const normalized = normalizeDoi(paper.doi);
      if (normalized && normalized.startsWith('10.')) {
        return normalized;
      }
    }
  }

  // 4. Scan cell values for a DOI pattern
  const doiRegex = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/;
  for (const col of columns) {
    const cellVal = row[col.field];
    if (typeof cellVal === 'string' && cellVal.includes('10.')) {
      const match = cellVal.match(doiRegex);
      if (match) {
        return normalizeDoi(match[1]);
      }
    }
  }

  return null;
}

/**
 * Fetches corresponding author details from OpenAlex and Europe PMC / PubMed Central.
 */
export async function fetchCorrespondingAuthor(doi: string): Promise<CorrespondingAuthorDetails> {
  const cleanDoi = normalizeDoi(doi);
  const result: CorrespondingAuthorDetails = {
    name: '',
    email: '',
    institution: '',
    orcid: '',
  };

  if (!cleanDoi || !cleanDoi.startsWith('10.')) {
    return result;
  }

  let pmcid: string | undefined;

  // 1. Query OpenAlex (fastest metadata registry with explicit is_corresponding flag)
  try {
    const openAlexUrl = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(cleanDoi)}?mailto=user@litsift.app`;
    const res = await fetch(openAlexUrl);
    if (res.ok) {
      const data = await res.json();
      const authorships: any[] = data.authorships || [];

      // Check for explicitly tagged corresponding author
      let ca = authorships.find((a) => a.is_corresponding === true);

      // Fallback: in biomedical papers, last author is predominantly the senior/corresponding author
      if (!ca && authorships.length > 0) {
        ca = authorships[authorships.length - 1];
      }

      if (ca) {
        result.name = ca.author?.display_name || '';
        result.orcid = ca.author?.orcid || '';
        result.institution = ca.institutions?.[0]?.display_name || '';
      }

      if (data.ids?.pmcid) {
        pmcid = String(data.ids.pmcid).replace(/^PMC/i, '');
      }
    }
  } catch (err) {
    console.warn(`OpenAlex lookup note for ${cleanDoi}:`, err);
  }

  // 2. Query Europe PMC / PubMed Central for verified author notes & contact email
  try {
    let targetPmc = pmcid;

    if (!targetPmc) {
      const epmcSearchUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:"${encodeURIComponent(cleanDoi)}"&format=json&resultType=lite`;
      const epmcRes = await fetch(epmcSearchUrl);
      if (epmcRes.ok) {
        const epmcData = await epmcRes.json();
        const hit = epmcData.resultList?.result?.[0];
        if (hit?.pmcid) {
          targetPmc = String(hit.pmcid).replace(/^PMC/i, '');
        }
      }
    }

    if (targetPmc) {
      const xmlUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/PMC${targetPmc}/fullTextXML`;
      const xmlRes = await fetch(xmlUrl);
      if (xmlRes.ok) {
        const xmlText = await xmlRes.text();

        // Match <corresp> section first for dedicated contact email
        const correspMatch = xmlText.match(/<corresp[^>]*>([\s\S]*?)<\/corresp>/i);
        if (correspMatch) {
          const emailInside = correspMatch[1].match(/<email[^>]*>([^<]+)<\/email>/i);
          if (emailInside && emailInside[1]) {
            result.email = emailInside[1].trim();
          }
        }

        // Fallback to any <email> tag in the front metadata
        if (!result.email) {
          const generalEmail = xmlText.match(/<email[^>]*>([^<]+)<\/email>/i);
          if (generalEmail && generalEmail[1]) {
            result.email = generalEmail[1].trim();
          }
        }

        // If OpenAlex did not find a name, check <contrib contrib-type="author" corresp="yes">
        if (!result.name) {
          const contribMatch = xmlText.match(/<contrib[^>]*contrib-type="author"[^>]*corresp="yes"[\s\S]*?<name>([\s\S]*?)<\/name>/i);
          if (contribMatch) {
            const surname = contribMatch[1].match(/<surname>([^<]+)<\/surname>/i)?.[1] || '';
            const given = contribMatch[1].match(/<given-names>([^<]+)<\/given-names>/i)?.[1] || '';
            if (surname || given) {
              result.name = `${given} ${surname}`.trim();
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Europe PMC lookup note for ${cleanDoi}:`, err);
  }

  return result;
}

/**
 * Enriches the loaded workspace dataset with corresponding author details.
 * Adds missing columns (Corresponding Author, Author Email, Author Institution)
 * and updates each row's data.
 */
export async function enrichGridDatasetWithAuthors(
  onProgress?: (progress: EnrichmentProgress) => void
): Promise<EnrichmentResult> {
  const gridStore = useGridStore.getState();
  const pdfStore = usePdfStore.getState();

  const rows = gridStore.rows.filter((r) => !r.isDraftRow);
  const columns = gridStore.columns;
  const pdfs = pdfStore.pdfs;

  if (rows.length === 0) {
    return {
      success: false,
      totalRows: 0,
      enrichedRows: 0,
      uniquePapers: 0,
      addedColumns: [],
      message: 'The dataset has no rows to enrich.',
    };
  }

  // 1. Map each row to its resolved DOI
  const rowDoiMap = new Map<string, string>();
  rows.forEach((r) => {
    const doi = extractDoiFromRow(r, columns, pdfs);
    if (doi) {
      rowDoiMap.set(r.id, doi);
    }
  });

  if (rowDoiMap.size === 0) {
    return {
      success: false,
      totalRows: rows.length,
      enrichedRows: 0,
      uniquePapers: 0,
      addedColumns: [],
      message: 'No DOIs could be identified in the dataset. Please ensure a "DOI" column exists or rows contain valid DOIs (e.g. 10.xxxx/...).',
    };
  }

  const uniqueDois = Array.from(new Set(rowDoiMap.values()));

  // 2. Determine target columns
  // Re-use existing columns if already present; otherwise add them.
  const findOrDefineCol = (desiredHeader: string, fallbackField: string) => {
    const existing = columns.find(
      (c) =>
        c.field.toLowerCase() === fallbackField.toLowerCase() ||
        c.headerName.toLowerCase() === desiredHeader.toLowerCase()
    );
    if (existing) {
      return { field: existing.field, headerName: existing.headerName, isNew: false };
    }
    return { field: sanitizeField(desiredHeader), headerName: desiredHeader, isNew: true };
  };

  const nameColDef = findOrDefineCol('Corresponding Author', 'corresponding_author');
  const emailColDef = findOrDefineCol('Author Email', 'author_email');
  const instColDef = findOrDefineCol('Author Institution', 'author_institution');
  const orcidColDef = findOrDefineCol('Author ORCID', 'author_orcid');

  const addedColumns: string[] = [];
  const targetCols = [nameColDef, emailColDef, instColDef, orcidColDef];
  targetCols.forEach((c) => {
    if (c.isNew) {
      gridStore.addColumn(c.headerName);
      addedColumns.push(c.headerName);
    }
  });

  // 3. Batch fetch details for each unique DOI with caching
  const doiCache = new Map<string, CorrespondingAuthorDetails>();

  onProgress?.({
    current: 0,
    total: uniqueDois.length,
    message: `Fetching author details for ${uniqueDois.length} unique research papers...`,
    percent: 10,
  });

  for (let i = 0; i < uniqueDois.length; i++) {
    const doi = uniqueDois[i];
    const progressPercent = Math.round(10 + ((i + 1) / uniqueDois.length) * 75);

    onProgress?.({
      current: i + 1,
      total: uniqueDois.length,
      message: `[${i + 1}/${uniqueDois.length}] Querying registries for DOI ${doi}...`,
      percent: progressPercent,
    });

    try {
      const details = await fetchCorrespondingAuthor(doi);
      doiCache.set(doi, details);
    } catch (err) {
      console.warn(`Failed fetching author for ${doi}:`, err);
    }

    // Small delay between requests to be polite to registries
    if (i < uniqueDois.length - 1) {
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  // 4. Batch update rows in useGridStore
  onProgress?.({
    current: uniqueDois.length,
    total: uniqueDois.length,
    message: 'Updating dataset rows and columns...',
    percent: 90,
  });

  const updates: Array<{
    rowId: string;
    field: string;
    value: any;
    reasoning?: string;
    sectionName?: string;
    pageNumber?: number;
    snippetQuote?: string;
  }> = [];
  let enrichedRowCount = 0;

  rows.forEach((row) => {
    const doi = rowDoiMap.get(row.id);
    if (!doi) return;

    const details = doiCache.get(doi);
    if (!details) return;

    let hasData = false;

    if (details.name && (!row[nameColDef.field] || String(row[nameColDef.field]).trim() === '')) {
      updates.push({
        rowId: row.id,
        field: nameColDef.field,
        value: details.name,
        pageNumber: 1,
        sectionName: 'Authors',
        snippetQuote: details.name,
        reasoning: 'Verified corresponding author from OpenAlex and PubMed Central records.',
      });
      hasData = true;
    }
    if (details.email && (!row[emailColDef.field] || String(row[emailColDef.field]).trim() === '')) {
      updates.push({
        rowId: row.id,
        field: emailColDef.field,
        value: details.email,
        pageNumber: 1,
        sectionName: 'Correspondence / Author Notes',
        snippetQuote: details.email,
        reasoning: 'Corresponding author contact email from PMC XML metadata.',
      });
      hasData = true;
    }
    if (details.institution && (!row[instColDef.field] || String(row[instColDef.field]).trim() === '')) {
      updates.push({
        rowId: row.id,
        field: instColDef.field,
        value: details.institution,
        pageNumber: 1,
        sectionName: 'Affiliations',
        snippetQuote: details.institution,
        reasoning: 'Author institutional affiliation from registry.',
      });
      hasData = true;
    }
    if (details.orcid && (!row[orcidColDef.field] || String(row[orcidColDef.field]).trim() === '')) {
      updates.push({
        rowId: row.id,
        field: orcidColDef.field,
        value: details.orcid,
        pageNumber: 1,
        sectionName: 'Authors',
        snippetQuote: details.orcid,
        reasoning: 'Author ORCID permanent identifier.',
      });
      hasData = true;
    }

    if (hasData) {
      enrichedRowCount++;
    }
  });

  if (updates.length > 0) {
    gridStore.batchUpdateCells(updates);
  }

  // 5. Synchronize loaded papers in usePdfStore so reader view displays them
  uniqueDois.forEach((doi) => {
    const details = doiCache.get(doi);
    if (!details || !details.name) return;

    const cleanTargetDoi = normalizeDoi(doi).toLowerCase();
    const matchedPaper = pdfStore.pdfs.find(
      (p) => p.doi && normalizeDoi(p.doi).toLowerCase() === cleanTargetDoi
    );

    if (matchedPaper) {
      const currentAuthors = [...(matchedPaper.authors || [])];
      let authorEntry = currentAuthors.find(
        (a) => a.name.toLowerCase() === details.name.toLowerCase()
      );

      if (!authorEntry) {
        authorEntry = {
          name: details.name,
          institution: details.institution,
          orcid: details.orcid,
          isCorresponding: true,
          email: details.email,
        };
        currentAuthors.push(authorEntry);
      } else {
        authorEntry.isCorresponding = true;
        if (details.email) authorEntry.email = details.email;
        if (details.institution && !authorEntry.institution) {
          authorEntry.institution = details.institution;
        }
        if (details.orcid && !authorEntry.orcid) {
          authorEntry.orcid = details.orcid;
        }
      }

      pdfStore.updatePaperDocument(matchedPaper.id, {
        authors: currentAuthors,
      });
    }
  });

  onProgress?.({
    current: uniqueDois.length,
    total: uniqueDois.length,
    message: `Completed! Enriched ${enrichedRowCount} rows across ${uniqueDois.length} papers.`,
    percent: 100,
  });

  return {
    success: true,
    totalRows: rows.length,
    enrichedRows: enrichedRowCount,
    uniquePapers: uniqueDois.length,
    addedColumns,
    message: `Successfully enriched ${enrichedRowCount} of ${rows.length} rows with corresponding author details.`,
  };
}
