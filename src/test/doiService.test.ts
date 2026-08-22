import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeDoi,
  reconstructAbstract,
  resolvePaperByDoi,
  findExistingPaperByDoi,
  parseJatsXml,
  parseBioCJson,
} from '../services/doiService';

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

  describe('4. findExistingPaperByDoi (Local Duplicate Detection)', () => {
    const mockPdfs: any[] = [
      {
        id: 'doi-10_1038_s41467_020_17849_0',
        name: 'Nature Communications Paper',
        title: 'Nature Communications Paper',
        doi: '10.1038/s41467-020-17849-0',
      },
      {
        id: 'doi-10_1371_journal_pone_0281234',
        name: 'PLOS ONE Paper',
        title: 'PLOS ONE Paper',
        doi: '10.1371/journal.pone.0281234',
      },
    ];

    it('finds existing paper by exact DOI string', () => {
      const match = findExistingPaperByDoi('10.1038/s41467-020-17849-0', mockPdfs);
      expect(match).toBeDefined();
      expect(match?.title).toBe('Nature Communications Paper');
    });

    it('finds existing paper when URL prefix or uppercase is provided', () => {
      const match = findExistingPaperByDoi('HTTPS://DOI.ORG/10.1038/s41467-020-17849-0', mockPdfs);
      expect(match).toBeDefined();
      expect(match?.id).toBe('doi-10_1038_s41467_020_17849_0');
    });

    it('finds existing paper by matching deterministic ID', () => {
      const match = findExistingPaperByDoi('doi:10.1371/journal.pone.0281234', mockPdfs);
      expect(match).toBeDefined();
      expect(match?.title).toBe('PLOS ONE Paper');
    });

    it('returns undefined for non-existing DOI or empty input', () => {
      expect(findExistingPaperByDoi('10.9999/non-existent-doi', mockPdfs)).toBeUndefined();
      expect(findExistingPaperByDoi('', mockPdfs)).toBeUndefined();
      expect(findExistingPaperByDoi('10.1038/s41467-020-17849-0', [])).toBeUndefined();
    });
  });

  describe('5. parseJatsXml (Hierarchical Deduplication & Citation Cleaning)', () => {
    it('deduplicates parent vs nested child sections and strips inline citation xref tags', () => {
      const sampleJatsXml = `
        <article>
          <body>
            <sec id="sec-results">
              <title>Results</title>
              <p>We isolated 5 broad-spectrum lytic phages <xref ref-type="bibr" rid="B1">[1]</xref>.</p>
              <sec id="sec-morph">
                <title>Phage Morphology</title>
                <p>TEM confirmed Myoviridae morphology <xref ref-type="bibr" rid="B2">[2, 3]</xref>.</p>
              </sec>
            </sec>
            <sec id="sec-methods">
              <title>Methods</title>
              <p>Bacterial strains were cultured at 37°C.</p>
            </sec>
          </body>
          <back>
            <table-wrap id="tbl1">
              <label>Table 1</label>
              <caption><p>Burst sizes</p></caption>
              <table>
                <thead>
                  <tr><th>Phage</th><th>Burst Size</th></tr>
                </thead>
                <tbody>
                  <tr><td>Phage A</td><td>120 PFU</td></tr>
                </tbody>
              </table>
            </table-wrap>
          </back>
        </article>
      `;

      const parsed = parseJatsXml(sampleJatsXml);

      expect(parsed.sections).toHaveLength(3);
      // Section 1: Parent Results (contains ONLY its direct intro paragraph, stripped of [1])
      expect(parsed.sections[0].title).toBe('Results');
      expect(parsed.sections[0].content).toBe('We isolated 5 broad-spectrum lytic phages .');

      // Section 2: Child section with hierarchical title, stripped of [2, 3]
      expect(parsed.sections[1].title).toBe('Results > Phage Morphology');
      expect(parsed.sections[1].content).toBe('TEM confirmed Myoviridae morphology .');

      // Section 3: Methods
      expect(parsed.sections[2].title).toBe('Methods');
      expect(parsed.sections[2].content).toBe('Bacterial strains were cultured at 37°C.');

      // Tables
      expect(parsed.tables).toHaveLength(1);
      expect(parsed.tables[0].label).toBe('Table 1');
      expect(parsed.tables[0].headers).toEqual(['Phage', 'Burst Size']);
      expect(parsed.tables[0].rows).toEqual([['Phage A', '120 PFU']]);
    });
  });

  describe('6. parseBioCJson & Network Fallback Pipeline', () => {
    it('parses BioC JSON document passages into structured sections and tables', () => {
      const mockBioCData = {
        source: 'PMC',
        documents: [
          {
            id: 'PMC888888',
            passages: [
              {
                infons: { section_type: 'TITLE', type: 'title' },
                text: 'Genomics of Phage vB_EcoM',
              },
              {
                infons: { section_type: 'ABSTRACT', type: 'abstract' },
                text: 'Lytic phages represent an alternative to antibiotics in poultry.',
              },
              {
                infons: { section_type: 'INTRO', type: 'title' },
                text: 'Introduction',
              },
              {
                infons: { section_type: 'INTRO', type: 'paragraph' },
                text: 'Avian pathogenic E. coli causes massive economic losses [1, 2].',
              },
              {
                infons: { section_type: 'RESULTS', type: 'title' },
                text: 'Results and Discussion',
              },
              {
                infons: { section_type: 'RESULTS', type: 'paragraph' },
                text: 'Phage genomes ranged from 170 kb to 356 kb with GC content of 43.7%.',
              },
              {
                infons: { section_type: 'TABLE', type: 'table', title: 'Table 1: Phage Characteristics' },
                text: "Phage\tGenome (kb)\tGC (%)\nvB_EcoM_fRPOT1\t170.5\t43.68\nvB_EcoM_fRPOT2\t356.2\t43.76",
              },
            ],
          },
        ],
      };

      const result = parseBioCJson(mockBioCData);

      expect(result.abstractText).toBe('Lytic phages represent an alternative to antibiotics in poultry.');
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].title).toBe('Introduction');
      expect(result.sections[0].content).toBe('Avian pathogenic E. coli causes massive economic losses.');
      expect(result.sections[1].title).toBe('Results and Discussion');
      expect(result.sections[1].content).toContain('GC content of 43.7%');

      // Table parsing from tab-delimited text
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].headers).toEqual(['Phage', 'Genome (kb)', 'GC (%)']);
      expect(result.tables[0].rows).toHaveLength(2);
      expect(result.tables[0].rows[0]).toEqual(['vB_EcoM_fRPOT1', '170.5', '43.68']);
    });
  });
});
