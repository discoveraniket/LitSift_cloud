import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchAcademicLiterature,
  stagePaperByDoi,
} from '../services/academicSearchService';
import { usePdfStore } from '../store/usePdfStore';
import * as doiService from '../services/doiService';

describe('academicSearchService - Autonomous Paper Discovery & Workspace Staging', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    usePdfStore.setState({
      pdfs: [
        {
          id: 'existing-pdf-1',
          name: 'Klebsiella Phage PG14 Paper',
          title: 'Characterization of Novel Klebsiella Phage PG14 and Its Antibiofilm Efficacy',
          doi: '10.1128/spectrum.01994-22',
          oaStatus: 'gold',
          sourceType: 'doi_full_pdf',
          uploadedAt: Date.now(),
          status: 'Ready',
        },
      ],
      activePdfId: 'existing-pdf-1',
    });
  });

  describe('searchAcademicLiterature', () => {
    it('returns empty results when query is empty and no relatedToDoi provided', async () => {
      const res = await searchAcademicLiterature({ query: '' });
      expect(res.totalFound).toBe(0);
      expect(res.candidates).toEqual([]);
      expect(res.searchStrategy).toBe('keyword');
    });

    it('searches OpenAlex Works API and parses normalized candidate papers', async () => {
      const mockOpenAlexResponse = {
        meta: { count: 12 },
        results: [
          {
            id: 'https://openalex.org/W123456789',
            doi: 'https://doi.org/10.1038/s41467-020-17849-0',
            title: 'Synthetic Biology of Bacteriophages for Precision Antimicrobials',
            authorships: [
              { author: { display_name: 'Alice Smith' } },
              { author: { display_name: 'Bob Jones' } },
            ],
            publication_year: 2021,
            cited_by_count: 85,
            primary_location: {
              source: { display_name: 'Nature Communications' },
            },
            open_access: {
              is_oa: true,
              oa_status: 'gold',
              oa_url: 'https://nature.com/articles/s41467-020-17849-0.pdf',
            },
            abstract_inverted_index: {
              Synthetic: [0],
              phages: [1],
              target: [2],
              pathogens: [3],
            },
          },
          {
            id: 'https://openalex.org/W987654321',
            doi: 'https://doi.org/10.1128/spectrum.01994-22',
            title: 'Characterization of Novel Klebsiella Phage PG14 and Its Antibiofilm Efficacy',
            authorships: [{ author: { display_name: 'Carol White' } }],
            publication_year: 2022,
            cited_by_count: 14,
            primary_location: {
              source: { display_name: 'Microbiology Spectrum' },
            },
            open_access: {
              is_oa: true,
              oa_status: 'gold',
            },
            abstract_inverted_index: {
              Biofilm: [0],
              reduction: [1],
            },
          },
        ],
      };

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOpenAlexResponse,
      } as any);

      const res = await searchAcademicLiterature({
        query: 'phage antimicrobial',
        limit: 5,
        openAccessOnly: true,
      });

      expect(res.candidates).toHaveLength(2);
      expect(res.totalFound).toBe(12);
      expect(res.searchStrategy).toBe('keyword');

      const first = res.candidates[0];
      expect(first.title).toBe('Synthetic Biology of Bacteriophages for Precision Antimicrobials');
      expect(first.doi).toBe('10.1038/s41467-020-17849-0');
      expect(first.authors).toEqual(['Alice Smith', 'Bob Jones']);
      expect(first.journal).toBe('Nature Communications');
      expect(first.year).toBe(2021);
      expect(first.citationCount).toBe(85);
      expect(first.isOa).toBe(true);
      expect(first.oaStatus).toBe('gold');
      expect(first.abstractSnippet).toBe('Synthetic phages target pathogens');
      expect(first.isAlreadyInWorkspace).toBe(false);

      // The second candidate has the existing DOI in usePdfStore
      const second = res.candidates[1];
      expect(second.doi).toBe('10.1128/spectrum.01994-22');
      expect(second.isAlreadyInWorkspace).toBe(true);
    });

    it('filters out closed access papers when openAccessOnly is true', async () => {
      const mockOpenAlexResponse = {
        meta: { count: 2 },
        results: [
          {
            id: 'https://openalex.org/W1',
            doi: 'https://doi.org/10.1016/j.cell.2021.01.001',
            title: 'Closed Access Review of Phages',
            authorships: [{ author: { display_name: 'Dan Brown' } }],
            open_access: { is_oa: false, oa_status: 'closed' },
          },
          {
            id: 'https://openalex.org/W2',
            doi: 'https://doi.org/10.1038/s41564-021-001',
            title: 'Open Access Phage Genome Study',
            authorships: [{ author: { display_name: 'Eve Adams' } }],
            open_access: { is_oa: true, oa_status: 'green' },
          },
        ],
      };

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOpenAlexResponse,
      } as any);

      const res = await searchAcademicLiterature({
        query: 'phage genomics',
        openAccessOnly: true,
      });

      expect(res.candidates).toHaveLength(1);
      expect(res.candidates[0].title).toBe('Open Access Phage Genome Study');
      expect(res.candidates[0].oaStatus).toBe('green');
    });

    it('searches related works via citation graph when relatedToDoi is provided', async () => {
      // 1. Seed paper lookup
      const seedResponse = {
        id: 'https://openalex.org/W_SEED',
        doi: 'https://doi.org/10.1128/spectrum.01994-22',
        related_works: [
          'https://openalex.org/W_REL_1',
          'https://openalex.org/W_REL_2',
        ],
      };

      // 2. Related works metadata lookup
      const relatedWorksResponse = {
        meta: { count: 2 },
        results: [
          {
            id: 'https://openalex.org/W_REL_1',
            doi: 'https://doi.org/10.1016/j.virusres.2023.199000',
            title: 'Isolation and Genomic Characterization of Klebsiella Bacteriophage KP15',
            authorships: [{ author: { display_name: 'Frank Miller' } }],
            publication_year: 2023,
            open_access: { is_oa: true, oa_status: 'gold' },
            abstract_inverted_index: {
              Phage: [0],
              KP15: [1],
              lyses: [2],
              Klebsiella: [3],
            },
          },
        ],
      };

      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => seedResponse,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => relatedWorksResponse,
        } as any);

      const res = await searchAcademicLiterature({
        relatedToDoi: '10.1128/spectrum.01994-22',
        limit: 3,
      });

      expect(res.searchStrategy).toBe('related_works');
      expect(res.candidates).toHaveLength(1);
      expect(res.candidates[0].title).toBe('Isolation and Genomic Characterization of Klebsiella Bacteriophage KP15');
      expect(res.candidates[0].doi).toBe('10.1016/j.virusres.2023.199000');
      expect(res.candidates[0].abstractSnippet).toBe('Phage KP15 lyses Klebsiella');
    });

    it('falls back to Europe PMC when OpenAlex returns no hits', async () => {
      // 1. OpenAlex returns empty
      const emptyOpenAlex = {
        meta: { count: 0 },
        results: [],
      };

      // 2. Europe PMC returns hits
      const mockEpmcResponse = {
        hitCount: 5,
        resultList: {
          result: [
            {
              id: 'PMC8889999',
              doi: '10.3389/fmicb.2022.888999',
              title: 'Novel Bacteriophage Cocktail Against Resistant Pathogens',
              authorString: 'Grace Hopper, Ada Lovelace',
              journalTitle: 'Frontiers in Microbiology',
              pubYear: '2022',
              citedByCount: 30,
              isOpenAccess: 'Y',
              abstractText: 'Cocktails of phages demonstrate high synergy against clinical isolates.',
              pmcid: 'PMC8889999',
            },
          ],
        },
      };

      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => emptyOpenAlex,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockEpmcResponse,
        } as any);

      const res = await searchAcademicLiterature({
        query: 'cocktail bactericide',
      });

      expect(res.searchStrategy).toBe('fallback_epmc');
      expect(res.candidates).toHaveLength(1);
      expect(res.candidates[0].title).toBe('Novel Bacteriophage Cocktail Against Resistant Pathogens');
      expect(res.candidates[0].doi).toBe('10.3389/fmicb.2022.888999');
      expect(res.candidates[0].authors).toEqual(['Grace Hopper', 'Ada Lovelace']);
      expect(res.candidates[0].isOa).toBe(true);
      expect(res.candidates[0].pmcid).toBe('PMC8889999');
    });

    it('handles network failure gracefully without throwing unhandled exceptions', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network offline'));

      const res = await searchAcademicLiterature({
        query: 'any topic',
      });

      expect(res.candidates).toEqual([]);
      expect(res.totalFound).toBe(0);
    });
  });

  describe('stagePaperByDoi', () => {
    it('returns existing paper immediately from store when already staged', async () => {
      const resolveSpy = vi.spyOn(doiService, 'resolvePaperByDoi');

      const paper = await stagePaperByDoi('10.1128/spectrum.01994-22');

      expect(paper.id).toBe('existing-pdf-1');
      expect(paper.doi).toBe('10.1128/spectrum.01994-22');
      expect(resolveSpy).not.toHaveBeenCalled();
      expect(usePdfStore.getState().activePdfId).toBe('existing-pdf-1');
    });

    it('resolves new paper via resolvePaperByDoi and stages into usePdfStore', async () => {
      const mockNewPaper = {
        id: 'new-pdf-101',
        name: 'New Phage Paper',
        title: 'New Phage Characterization 2024',
        doi: '10.1038/s41598-024-00001-x',
        oaStatus: 'gold' as const,
        status: 'Ready' as const,
      };

      vi.spyOn(doiService, 'resolvePaperByDoi').mockResolvedValueOnce(mockNewPaper as any);

      const staged = await stagePaperByDoi('10.1038/s41598-024-00001-x');

      expect(staged.id).toBe('new-pdf-101');
      expect(staged.title).toBe('New Phage Characterization 2024');

      const store = usePdfStore.getState();
      expect(store.pdfs.some((p) => p.id === 'new-pdf-101')).toBe(true);
      expect(store.activePdfId).toBe('new-pdf-101');
    });

    it('throws error for invalid or empty DOI strings', async () => {
      await expect(stagePaperByDoi('')).rejects.toThrow('Please provide a valid DOI string to stage.');
    });
  });
});
