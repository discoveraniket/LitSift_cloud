import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeDoi, reconstructAbstract, resolvePaperByDoi } from '../services/doiService';

describe('DOI Resolution & Ingestion Service Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. normalizeDoi', () => {
    it('normalizes standard DOI strings', () => {
      expect(normalizeDoi('10.1038/s41467-020-17849-0')).toBe('10.1038/s41467-020-17849-0');
    });

    it('strips https://doi.org/ and http://dx.doi.org/ prefixes', () => {
      expect(normalizeDoi('https://doi.org/10.1038/s41467-020-17849-0')).toBe('10.1038/s41467-020-17849-0');
      expect(normalizeDoi('http://dx.doi.org/10.1371/journal.pone.0281234')).toBe('10.1371/journal.pone.0281234');
    });

    it('strips doi: prefixes and trailing whitespace', () => {
      expect(normalizeDoi('doi:10.1016/j.cell.2020.08.020  ')).toBe('10.1016/j.cell.2020.08.020');
    });
  });

  describe('2. reconstructAbstract', () => {
    it('reconstructs ordered paragraph text from OpenAlex inverted index', () => {
      const invertedIndex = {
        Bacteriophages: [0],
        offer: [1],
        a: [2],
        promising: [3],
        therapy: [4],
      };

      const result = reconstructAbstract(invertedIndex);
      expect(result).toBe('Bacteriophages offer a promising therapy');
    });

    it('handles empty or undefined index gracefully', () => {
      expect(reconstructAbstract(undefined)).toBe('');
      expect(reconstructAbstract({})).toBe('');
    });
  });

  describe('3. resolvePaperByDoi', () => {
    it('throws descriptive error on malformed DOI syntax', async () => {
      await expect(resolvePaperByDoi('invalid-doi')).rejects.toThrow('Invalid DOI format');
    });

    it('resolves Open Access paper with metadata and downloads mock PDF binary', async () => {
      const mockOpenAlex = {
        title: 'Engineered Phages Against S. Aureus',
        authorships: [
          { author: { display_name: 'Dr. Sarah Jenkins' }, institutions: [{ display_name: 'MIT' }] },
        ],
        host_venue: { display_name: 'Nature Communications' },
        publication_year: 2020,
        cited_by_count: 84,
        abstract_inverted_index: {
          Synthetic: [0],
          biology: [1],
          enables: [2],
          phage: [3],
          engineering: [4],
        },
        ids: { pmcid: 'PMC7424911' },
      };

      const mockUnpaywall = {
        is_oa: true,
        oa_status: 'gold',
        title: 'Engineered Phages Against S. Aureus',
        best_oa_location: {
          url_for_pdf: 'https://example.com/mock-paper.pdf',
          url_for_landing_page: 'https://doi.org/10.1038/s41467-020-17849-0',
        },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('api.openalex.org')) {
          return {
            ok: true,
            json: async () => mockOpenAlex,
          } as Response;
        }
        if (urlStr.includes('api.unpaywall.org')) {
          return {
            ok: true,
            json: async () => mockUnpaywall,
          } as Response;
        }
        if (urlStr.includes('mock-paper.pdf')) {
          return {
            ok: true,
            headers: new Headers({ 'content-type': 'application/pdf' }),
            blob: async () => new Blob(['%PDF-1.4 mock stream data'], { type: 'application/pdf' }),
          } as Response;
        }
        return { ok: false } as Response;
      });

      const paper = await resolvePaperByDoi('10.1038/s41467-020-17849-0');

      expect(paper.doi).toBe('10.1038/s41467-020-17849-0');
      expect(paper.title).toBe('Engineered Phages Against S. Aureus');
      expect(paper.oaStatus).toBe('gold');
      expect(paper.sourceType).toBe('doi_full_pdf');
      expect(paper.authors?.[0].name).toBe('Dr. Sarah Jenkins');
      expect(paper.year).toBe(2020);
      expect(paper.citationCount).toBe(84);
      expect(paper.abstractText).toBe('Synthetic biology enables phage engineering');
      expect(paper.file).toBeDefined();

      fetchSpy.mockRestore();
    });

    it('resolves paywalled paper as abstract-only document when not open access', async () => {
      const mockOpenAlex = {
        title: 'Cell Wall Dynamics',
        authorships: [{ author: { display_name: 'Jane Doe' } }],
        primary_location: { source: { display_name: 'Science' } },
        publication_year: 2021,
        abstract_inverted_index: {
          Structure: [0],
          of: [1],
          bacterial: [2],
          wall: [3],
        },
      };

      const mockUnpaywall = {
        is_oa: false,
        oa_status: 'closed',
        title: 'Cell Wall Dynamics',
        best_oa_location: null,
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('api.openalex.org')) {
          return { ok: true, json: async () => mockOpenAlex } as Response;
        }
        if (urlStr.includes('api.unpaywall.org')) {
          return { ok: true, json: async () => mockUnpaywall } as Response;
        }
        return { ok: false } as Response;
      });

      const paper = await resolvePaperByDoi('10.1126/science.abf8454');

      expect(paper.doi).toBe('10.1126/science.abf8454');
      expect(paper.title).toBe('Cell Wall Dynamics');
      expect(paper.oaStatus).toBe('closed');
      expect(paper.sourceType).toBe('doi_abstract_only');
      expect(paper.abstractText).toBe('Structure of bacterial wall');
      expect(paper.url).toBe('');

      fetchSpy.mockRestore();
    });
  });
});
