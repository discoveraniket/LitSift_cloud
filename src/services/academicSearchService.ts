import {
  reconstructAbstract,
  resolvePaperByDoi,
  findExistingPaperByDoi,
  normalizeDoi,
} from './doiService';
import { usePdfStore } from '../store/usePdfStore';
import { useLogStore } from '../store/useLogStore';
import type { PaperDocumentInfo, OpenAccessStatus } from '../types/paper';

export interface LiteratureSearchParams {
  query?: string;
  relatedToDoi?: string;
  limit?: number; // default: 5, max: 20
  openAccessOnly?: boolean; // default: true
  yearFrom?: number;
  yearTo?: number;
  sortBy?: 'relevance' | 'cited_by_count' | 'publication_year';
  signal?: AbortSignal;
}

export interface DiscoveredPaperCandidate {
  id: string; // OpenAlex work ID or DOI
  doi: string;
  title: string;
  authors: string[];
  journal: string;
  year?: number;
  citationCount?: number;
  isOa: boolean;
  oaStatus: OpenAccessStatus;
  abstractSnippet: string;
  fullAbstract?: string;
  pdfUrl?: string;
  landingPageUrl?: string;
  pmcid?: string;
  isAlreadyInWorkspace: boolean;
}

export interface AcademicSearchResponse {
  query: string;
  totalFound: number;
  candidates: DiscoveredPaperCandidate[];
  searchStrategy: 'keyword' | 'related_works' | 'fallback_epmc';
}

/**
 * Searches international open academic registries (OpenAlex & Europe PMC)
 * using zero-cost public REST APIs.
 */
export async function searchAcademicLiterature(
  params: LiteratureSearchParams
): Promise<AcademicSearchResponse> {
  const limit = Math.max(1, Math.min(20, params.limit ?? 5));
  const openAccessOnly = params.openAccessOnly !== false; // default true
  const existingPdfs = usePdfStore.getState().pdfs;

  // 1. Related Works via Citation Graph (OpenAlex related_works)
  if (params.relatedToDoi) {
    const cleanDoi = normalizeDoi(params.relatedToDoi);
    if (cleanDoi) {
      try {
        const seedUrl = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(cleanDoi)}?mailto=user@litsift.app`;
        const seedRes = await fetch(seedUrl, { signal: params.signal });

        if (seedRes.ok) {
          const seedData = await seedRes.json();
          const relatedIds: string[] = Array.isArray(seedData.related_works)
            ? seedData.related_works.slice(0, limit * 2)
            : [];

          if (relatedIds.length > 0) {
            // Fetch metadata for related works
            const cleanIds = relatedIds
              .map((id) => id.replace(/^https?:\/\/openalex\.org\//i, ''))
              .slice(0, 15);
            const worksUrl = `https://api.openalex.org/works?filter=openalex_id:${cleanIds.join('|')}&per_page=${limit * 2}&mailto=user@litsift.app`;
            const worksRes = await fetch(worksUrl, { signal: params.signal });

            if (worksRes.ok) {
              const worksData = await worksRes.json();
              const rawWorks = Array.isArray(worksData.results) ? worksData.results : [];
              const candidates = parseOpenAlexWorks(rawWorks, existingPdfs, openAccessOnly).slice(0, limit);

              if (candidates.length > 0) {
                return {
                  query: `Related to DOI: ${cleanDoi}`,
                  totalFound: candidates.length,
                  candidates,
                  searchStrategy: 'related_works',
                };
              }
            }
          }
        }
      } catch (err: any) {
        if (params.signal?.aborted) throw err;
        console.warn(`Related works lookup note for DOI ${cleanDoi}:`, err.message);
      }
    }
  }

  // 2. Keyword Search via OpenAlex Works API
  const queryStr = (params.query || '').trim();
  if (!queryStr) {
    return {
      query: '',
      totalFound: 0,
      candidates: [],
      searchStrategy: 'keyword',
    };
  }

  try {
    let sortParam = '';
    if (params.sortBy === 'cited_by_count') sortParam = '&sort=cited_by_count:desc';
    else if (params.sortBy === 'publication_year') sortParam = '&sort=publication_year:desc';

    const filters: string[] = [];
    if (openAccessOnly) {
      filters.push('is_oa:true');
    }
    if (params.yearFrom) {
      filters.push(`from_publication_date:${params.yearFrom}-01-01`);
    }
    if (params.yearTo) {
      filters.push(`to_publication_date:${params.yearTo}-12-31`);
    }

    const filterParam = filters.length > 0 ? `&filter=${filters.join(',')}` : '';
    const openAlexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(queryStr)}&per_page=${limit * 2}${filterParam}${sortParam}&mailto=user@litsift.app`;

    const res = await fetch(openAlexUrl, { signal: params.signal });
    if (res.ok) {
      const data = await res.json();
      const rawWorks = Array.isArray(data.results) ? data.results : [];
      const candidates = parseOpenAlexWorks(rawWorks, existingPdfs, openAccessOnly).slice(0, limit);

      if (candidates.length > 0) {
        return {
          query: queryStr,
          totalFound: data.meta?.count ?? candidates.length,
          candidates,
          searchStrategy: 'keyword',
        };
      }
    }
  } catch (err: any) {
    if (params.signal?.aborted) throw err;
    console.warn('OpenAlex keyword search note:', err.message);
  }

  // 3. Fallback: Europe PMC REST Search (for biomedical keywords)
  try {
    const oaClause = openAccessOnly ? '+AND+OPEN_ACCESS:Y' : '';
    const epmcUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(queryStr)}${oaClause}&format=json&pageSize=${limit}&resultType=core`;

    const epmcRes = await fetch(epmcUrl, { signal: params.signal });
    if (epmcRes.ok) {
      const epmcData = await epmcRes.json();
      const rawHits = Array.isArray(epmcData.resultList?.result) ? epmcData.resultList.result : [];
      const candidates = parseEuropePmcHits(rawHits, existingPdfs);

      return {
        query: queryStr,
        totalFound: epmcData.hitCount ?? candidates.length,
        candidates: candidates.slice(0, limit),
        searchStrategy: 'fallback_epmc',
      };
    }
  } catch (epmcErr: any) {
    if (params.signal?.aborted) throw epmcErr;
    console.warn('Europe PMC search fallback note:', epmcErr.message);
  }

  return {
    query: queryStr,
    totalFound: 0,
    candidates: [],
    searchStrategy: 'keyword',
  };
}

/**
 * Stages an academic paper by DOI directly into the workspace store and IndexedDB.
 */
export async function stagePaperByDoi(doi: string): Promise<PaperDocumentInfo> {
  const cleanDoi = normalizeDoi(doi);
  if (!cleanDoi) {
    throw new Error('Please provide a valid DOI string to stage.');
  }

  const pdfStore = usePdfStore.getState();
  const logStore = useLogStore.getState();

  // 1. Fast Cache Hit: Already in workspace
  const existing = findExistingPaperByDoi(cleanDoi, pdfStore.pdfs);
  if (existing) {
    pdfStore.setActivePdf(existing.id);
    logStore.addLog('info', `Paper "${existing.title || existing.name}" is already in workspace.`);
    return existing;
  }

  logStore.setActiveStep(`Resolving paper metadata for DOI ${cleanDoi}...`);
  logStore.addLog('info', `Staging paper into workspace from academic registries (DOI: ${cleanDoi})...`);

  // 2. Fetch full metadata, abstract, and Open Access PDF/XML via doiService
  const resolvedPaper = await resolvePaperByDoi(cleanDoi, (progress) => {
    logStore.setActiveStep(progress.message);
  });

  // 3. Add to store & IndexedDB
  await pdfStore.addPaperDocument(resolvedPaper);
  pdfStore.setActivePdf(resolvedPaper.id);

  logStore.setActiveStep(null);
  logStore.addLog(
    'success',
    `Successfully staged "${resolvedPaper.title || resolvedPaper.name}" into workspace!`
  );

  return resolvedPaper;
}

/**
 * Helper: Parses OpenAlex works into normalized DiscoveredPaperCandidate objects.
 */
function parseOpenAlexWorks(
  rawWorks: any[],
  existingPdfs: PaperDocumentInfo[],
  openAccessOnly: boolean
): DiscoveredPaperCandidate[] {
  const candidates: DiscoveredPaperCandidate[] = [];

  for (const w of rawWorks) {
    const isOa = Boolean(w.open_access?.is_oa);
    if (openAccessOnly && !isOa) continue;

    let oaStatus: OpenAccessStatus = 'closed';
    if (isOa) {
      const rawOa = String(w.open_access?.oa_status || '').toLowerCase();
      if (rawOa.includes('gold')) oaStatus = 'gold';
      else if (rawOa.includes('green')) oaStatus = 'green';
      else if (rawOa.includes('hybrid')) oaStatus = 'hybrid';
      else if (rawOa.includes('bronze')) oaStatus = 'bronze';
      else oaStatus = 'gold';
    }

    const rawDoi = w.doi ? normalizeDoi(w.doi) : '';
    const rawAbstract = reconstructAbstract(w.abstract_inverted_index);
    const authors = Array.isArray(w.authorships)
      ? w.authorships.map((a: any) => a.author?.display_name || 'Unknown Author').filter(Boolean)
      : [];

    const cleanTitle = (w.title || 'Untitled Research Work').replace(/<\/?[^>]+(>|$)/g, '').trim();
    const isAlreadyInWorkspace = rawDoi
      ? existingPdfs.some((p) => p.doi && normalizeDoi(p.doi).toLowerCase() === rawDoi.toLowerCase())
      : existingPdfs.some((p) => p.title?.toLowerCase() === cleanTitle.toLowerCase());

    candidates.push({
      id: w.id || rawDoi,
      doi: rawDoi,
      title: cleanTitle,
      authors: authors.slice(0, 5),
      journal:
        w.primary_location?.source?.display_name ||
        w.host_venue?.display_name ||
        'Academic Journal',
      year: w.publication_year || undefined,
      citationCount: typeof w.cited_by_count === 'number' ? w.cited_by_count : undefined,
      isOa,
      oaStatus,
      abstractSnippet: rawAbstract
        ? rawAbstract.length > 280
          ? `${rawAbstract.slice(0, 280)}...`
          : rawAbstract
        : 'Abstract not indexed in registry.',
      fullAbstract: rawAbstract || undefined,
      pdfUrl: w.open_access?.oa_url || w.best_oa_location?.pdf_url || undefined,
      landingPageUrl: w.doi || undefined,
      pmcid: w.ids?.pmcid || undefined,
      isAlreadyInWorkspace,
    });
  }

  return candidates;
}

/**
 * Helper: Parses Europe PMC search hits into normalized DiscoveredPaperCandidate objects.
 */
function parseEuropePmcHits(
  rawHits: any[],
  existingPdfs: PaperDocumentInfo[]
): DiscoveredPaperCandidate[] {
  const candidates: DiscoveredPaperCandidate[] = [];

  for (const h of rawHits) {
    const rawDoi = h.doi ? normalizeDoi(h.doi) : '';
    const cleanTitle = (h.title || 'Untitled Article').replace(/<\/?[^>]+(>|$)/g, '').trim();
    if (!cleanTitle) continue;

    const authors = h.authorString
      ? h.authorString.split(',').map((a: string) => a.trim()).slice(0, 5)
      : [];

    const isAlreadyInWorkspace = rawDoi
      ? existingPdfs.some((p) => p.doi && normalizeDoi(p.doi).toLowerCase() === rawDoi.toLowerCase())
      : existingPdfs.some((p) => p.title?.toLowerCase() === cleanTitle.toLowerCase());

    const isOa = h.isOpenAccess === 'Y';
    const oaStatus: OpenAccessStatus = isOa ? 'gold' : 'closed';
    const year = h.pubYear ? parseInt(h.pubYear, 10) : undefined;

    candidates.push({
      id: h.id || rawDoi,
      doi: rawDoi,
      title: cleanTitle,
      authors,
      journal: h.journalTitle || 'Academic Journal',
      year: Number.isNaN(year) ? undefined : year,
      citationCount: typeof h.citedByCount === 'number' ? h.citedByCount : undefined,
      isOa,
      oaStatus,
      abstractSnippet: h.abstractText
        ? h.abstractText.length > 280
          ? `${h.abstractText.slice(0, 280)}...`
          : h.abstractText
        : 'Abstract not indexed.',
      fullAbstract: h.abstractText || undefined,
      pdfUrl: h.pmcid
        ? `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${h.pmcid}&blobtype=pdf`
        : undefined,
      landingPageUrl: rawDoi ? `https://doi.org/${rawDoi}` : undefined,
      pmcid: h.pmcid || undefined,
      isAlreadyInWorkspace,
    });
  }

  return candidates;
}
