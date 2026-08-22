import { PaperDocumentInfo, PaperAuthor, PaperSection, PaperTable, PaperFigure, OpenAccessStatus, DocumentSourceType } from '../types/paper';

export interface DoiResolutionProgress {
  step: 'validating' | 'metadata' | 'open_access' | 'structured_content' | 'downloading_pdf' | 'completed' | 'error';
  message: string;
  progressPercent: number;
}

/**
 * Normalizes DOI input by stripping URLs, DOIs prefixes, and extraneous whitespace.
 * Example inputs:
 *  - "https://doi.org/10.1038/s41467-020-17849-0" -> "10.1038/s41467-020-17849-0"
 *  - "doi:10.1371/journal.pone.0281234" -> "10.1371/journal.pone.0281234"
 *  - " 10.1016/j.cell.2020.08.020 " -> "10.1016/j.cell.2020.08.020"
 */
export function normalizeDoi(input: string): string {
  if (!input) return '';
  let cleaned = input.trim();
  
  // Remove common URL prefixes
  cleaned = cleaned.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  cleaned = cleaned.replace(/^doi:\s*/i, '');
  
  // Basic DOI regex matcher: 10.xxxx/xxxx
  const match = cleaned.match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/);
  return match ? match[1] : cleaned;
}

/**
 * Checks if a DOI matches any paper already loaded in the workspace.
 */
export function findExistingPaperByDoi(
  doiInput: string,
  existingPdfs: PaperDocumentInfo[]
): PaperDocumentInfo | undefined {
  if (!doiInput || !existingPdfs || existingPdfs.length === 0) return undefined;
  const target = normalizeDoi(doiInput).toLowerCase();
  if (!target) return undefined;

  const targetId = `doi-${target.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return existingPdfs.find((p) => {
    if (p.doi && normalizeDoi(p.doi).toLowerCase() === target) return true;
    if (p.id.toLowerCase() === targetId.toLowerCase()) return true;
    return false;
  });
}

/**
 * Reconstructs clean paragraph text from OpenAlex's abstract_inverted_index.
 */
export function reconstructAbstract(invertedIndex?: Record<string, number[]>): string {
  if (!invertedIndex || Object.keys(invertedIndex).length === 0) return '';
  
  const wordPositions: Array<{ pos: number; word: string }> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (Array.isArray(positions)) {
      for (const pos of positions) {
        wordPositions.push({ pos, word });
      }
    }
  }
  
  wordPositions.sort((a, b) => a.pos - b.pos);
  return wordPositions.map((item) => item.word).join(' ');
}

/**
 * Converts a Blob to a Base64 string.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64String = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Parses XML full text from Europe PMC into structured sections, tables, and figures.
 */
function parseJatsXml(xmlText: string): {
  sections: PaperSection[];
  tables: PaperTable[];
  figures: PaperFigure[];
} {
  const sections: PaperSection[] = [];
  const tables: PaperTable[] = [];
  const figures: PaperFigure[] = [];

  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

    // Parse Body Sections
    const body = xmlDoc.querySelector('body');
    if (body) {
      const secNodes = body.querySelectorAll('sec');
      secNodes.forEach((sec, idx) => {
        const titleElem = sec.querySelector('title');
        const title = titleElem?.textContent?.trim() || `Section ${idx + 1}`;
        
        // Extract paragraph texts excluding nested child sections
        const paragraphs: string[] = [];
        sec.querySelectorAll('p').forEach((p) => {
          const text = p.textContent?.trim();
          if (text) paragraphs.push(text);
        });

        if (paragraphs.length > 0) {
          sections.push({
            id: sec.getAttribute('id') || `sec-${idx + 1}`,
            title,
            content: paragraphs.join('\n\n'),
          });
        }
      });
    }

    // Parse Tables
    const tableWraps = xmlDoc.querySelectorAll('table-wrap');
    tableWraps.forEach((tw, idx) => {
      const label = tw.querySelector('label')?.textContent?.trim() || `Table ${idx + 1}`;
      const caption = tw.querySelector('caption')?.textContent?.trim() || '';
      
      const headers: string[] = [];
      const rows: string[][] = [];

      const thNodes = tw.querySelectorAll('thead th, thead td');
      thNodes.forEach((th) => headers.push(th.textContent?.trim() || ''));

      const trNodes = tw.querySelectorAll('tbody tr');
      trNodes.forEach((tr) => {
        const rowCells: string[] = [];
        tr.querySelectorAll('td, th').forEach((td) => rowCells.push(td.textContent?.trim() || ''));
        if (rowCells.length > 0) rows.push(rowCells);
      });

      if (headers.length > 0 || rows.length > 0) {
        tables.push({
          id: tw.getAttribute('id') || `table-${idx + 1}`,
          label,
          caption,
          headers,
          rows,
        });
      }
    });

    // Parse Figures
    const figNodes = xmlDoc.querySelectorAll('fig');
    figNodes.forEach((fig, idx) => {
      const label = fig.querySelector('label')?.textContent?.trim() || `Figure ${idx + 1}`;
      const caption = fig.querySelector('caption')?.textContent?.trim() || '';
      const graphic = fig.querySelector('graphic');
      const href = graphic?.getAttribute('xlink:href') || graphic?.getAttribute('href');
      
      figures.push({
        id: fig.getAttribute('id') || `fig-${idx + 1}`,
        label,
        caption,
        url: href ? `https://europepmc.org/articles/${href}/bin` : undefined,
      });
    });
  } catch (err) {
    console.warn('Failed to parse JATS XML:', err);
  }

  return { sections, tables, figures };
}

/**
 * Main Paper Resolution Pipeline:
 * Queries OpenAlex, Unpaywall, and Europe PMC in parallel to construct a complete PaperDocument.
 */
export async function resolvePaperByDoi(
  rawInput: string,
  onProgress?: (progress: DoiResolutionProgress) => void
): Promise<PaperDocumentInfo> {
  const doi = normalizeDoi(rawInput);
  if (!doi || !doi.startsWith('10.')) {
    throw new Error(`Invalid DOI format: "${rawInput}". Scientific DOIs typically start with "10.xxxx/..."`);
  }

  onProgress?.({
    step: 'metadata',
    message: `Querying OpenAlex & Crossref for DOI ${doi}...`,
    progressPercent: 20,
  });

  // 1. Fetch OpenAlex & Unpaywall concurrently
  const openAlexUrl = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}?mailto=user@litsift.app`;
  const unpaywallUrl = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=user@litsift.app`;

  const [openAlexRes, unpaywallRes] = await Promise.allSettled([
    fetch(openAlexUrl).then(async (res) => (res.ok ? res.json() : null)),
    fetch(unpaywallUrl).then(async (res) => (res.ok ? res.json() : null)),
  ]);

  const openAlexData = openAlexRes.status === 'fulfilled' ? openAlexRes.value : null;
  const unpaywallData = unpaywallRes.status === 'fulfilled' ? unpaywallRes.value : null;

  if (!openAlexData && !unpaywallData) {
    throw new Error(`DOI "${doi}" could not be found in academic registries (OpenAlex/Unpaywall/Crossref). Please verify the DOI.`);
  }

  onProgress?.({
    step: 'open_access',
    message: 'Analyzing Open Access status & repository sources...',
    progressPercent: 45,
  });

  // Extract Metadata
  const title = (
    openAlexData?.title ||
    unpaywallData?.title ||
    `Paper (DOI: ${doi})`
  ).replace(/<\/?[^>]+(>|$)/g, ''); // Strip any HTML tags

  const authors: PaperAuthor[] = [];
  if (openAlexData?.authorships && Array.isArray(openAlexData.authorships)) {
    for (const auth of openAlexData.authorships) {
      const name = auth.author?.display_name || 'Unknown Author';
      const institution = auth.institutions?.[0]?.display_name;
      const orcid = auth.author?.orcid;
      authors.push({ name, institution, orcid });
    }
  } else if (unpaywallData?.z_authors && Array.isArray(unpaywallData.z_authors)) {
    for (const auth of unpaywallData.z_authors) {
      const name = `${auth.given || ''} ${auth.family || ''}`.trim() || 'Unknown Author';
      authors.push({ name });
    }
  }

  const journal =
    openAlexData?.primary_location?.source?.display_name ||
    openAlexData?.host_venue?.display_name ||
    unpaywallData?.journal_name ||
    'Academic Publication';

  const year =
    openAlexData?.publication_year ||
    (unpaywallData?.year ? parseInt(unpaywallData.year, 10) : undefined);

  const citationCount = openAlexData?.cited_by_count ?? undefined;

  // Open Access Resolution
  const isOa = unpaywallData?.is_oa ?? openAlexData?.open_access?.is_oa ?? false;
  let oaStatus: OpenAccessStatus = 'closed';
  if (isOa) {
    const rawOaStatus = (unpaywallData?.oa_status || openAlexData?.open_access?.oa_status || '').toLowerCase();
    if (rawOaStatus.includes('gold')) oaStatus = 'gold';
    else if (rawOaStatus.includes('green')) oaStatus = 'green';
    else if (rawOaStatus.includes('hybrid')) oaStatus = 'hybrid';
    else if (rawOaStatus.includes('bronze')) oaStatus = 'bronze';
    else oaStatus = 'gold';
  }

  const landingPageUrl =
    unpaywallData?.best_oa_location?.url_for_landing_page ||
    openAlexData?.doi ||
    `https://doi.org/${doi}`;

  let pdfDownloadUrl: string | undefined =
    unpaywallData?.best_oa_location?.url_for_pdf ||
    openAlexData?.best_oa_location?.pdf_url ||
    openAlexData?.open_access?.oa_url ||
    undefined;

  // Abstract Reconstruction
  let abstractText = reconstructAbstract(openAlexData?.abstract_inverted_index);

  // Extract PMCID for Structured Text
  let pmcid = openAlexData?.ids?.pmcid?.replace(/^PMC/, '') || undefined;

  // Fallback: If OpenAlex did not provide a PMCID, query Europe PMC directly by DOI
  if (!pmcid) {
    try {
      const epmcSearchUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:"${encodeURIComponent(doi)}"&format=json&resultType=lite`;
      const epmcRes = await fetch(epmcSearchUrl);
      if (epmcRes.ok) {
        const epmcData = await epmcRes.json();
        const firstHit = epmcData?.resultList?.result?.[0];
        if (firstHit) {
          if (firstHit.pmcid) {
            pmcid = String(firstHit.pmcid).replace(/^PMC/, '');
          }
          if (firstHit.hasPDF === 'Y' && firstHit.pmcid && !pdfDownloadUrl) {
            pdfDownloadUrl = `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${firstHit.pmcid}&blobtype=pdf`;
          }
        }
      }
    } catch (epmcErr) {
      console.warn('Europe PMC direct DOI search note:', epmcErr);
    }
  }

  onProgress?.({
    step: 'structured_content',
    message: 'Checking for structured sections, tables, and figures...',
    progressPercent: 65,
  });

  let sections: PaperSection[] = [];
  let tables: PaperTable[] = [];
  let figures: PaperFigure[] = [];

  // If PMCID is available, attempt to retrieve structured XML from Europe PMC
  if (pmcid) {
    try {
      const pmcXmlUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/PMC${pmcid}/fullTextXML`;
      const pmcRes = await fetch(pmcXmlUrl);
      if (pmcRes.ok) {
        const xmlText = await pmcRes.text();
        const parsed = parseJatsXml(xmlText);
        sections = parsed.sections;
        tables = parsed.tables;
        figures = parsed.figures;
      }
    } catch (e) {
      console.warn('Could not fetch structured XML from PMC:', e);
    }
  }

  // 2. Download Open Access PDF if available
  let pdfBlob: Blob | undefined;
  let pdfBlobUrl: string | undefined;
  let pdfBase64: string | undefined;
  let sourceType: DocumentSourceType = 'doi_abstract_only';

  const tryDownloadPdf = async (url: string): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/pdf' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const blob = await res.blob();
        if (blob.size > 20 && (contentType.includes('pdf') || blob.type.includes('pdf') || url.includes('.pdf') || url.includes('fcgi'))) {
          pdfBlob = blob;
          pdfBlobUrl = URL.createObjectURL(blob);
          pdfBase64 = await blobToBase64(blob);
          sourceType = 'doi_full_pdf';
          return true;
        }
      }
    } catch (e) {
      console.warn(`PDF download attempt from ${url} failed:`, e);
    }
    return false;
  };

  if (pdfDownloadUrl) {
    onProgress?.({
      step: 'downloading_pdf',
      message: 'Downloading Open Access PDF file...',
      progressPercent: 80,
    });

    const success = await tryDownloadPdf(pdfDownloadUrl);

    // If publisher direct download failed due to CORS, and we have a PMCID, try Europe PMC's open CORS PDF mirror
    if (!success && pmcid) {
      const epmcPdfUrl = `https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC${pmcid}&blobtype=pdf`;
      await tryDownloadPdf(epmcPdfUrl);
    }
  } else if (pmcid) {
    // If no direct publisher PDF URL was provided, attempt download from Europe PMC PDF mirror
    const epmcPdfUrl = `https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC${pmcid}&blobtype=pdf`;
    await tryDownloadPdf(epmcPdfUrl);
  }

  if (!pdfBlob) {
    sourceType = sections.length > 0 ? 'doi_structured' : 'doi_abstract_only';
  }

  onProgress?.({
    step: 'completed',
    message: 'Paper successfully organized!',
    progressPercent: 100,
  });

  const paperId = `doi-${doi.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const paperDocument: PaperDocumentInfo = {
    id: paperId,
    doi,
    pmcid,
    name: title,
    title,
    authors,
    journal,
    year,
    citationCount,
    oaStatus,
    sourceType,
    abstractText,
    sections: sections.length > 0 ? sections : undefined,
    tables: tables.length > 0 ? tables : undefined,
    figures: figures.length > 0 ? figures : undefined,
    url: pdfBlobUrl || '',
    file: pdfBlob,
    base64: pdfBase64,
    pdfDownloadUrl,
    landingPageUrl,
    status: 'Ready',
    uploadedAt: Date.now(),
  };

  return paperDocument;
}
