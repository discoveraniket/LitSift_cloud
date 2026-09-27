import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractDoiFromRow,
  fetchCorrespondingAuthor,
  enrichGridDatasetWithAuthors,
} from '../services/enrichmentService';
import { useGridStore } from '../store/useGridStore';
import { GridRow, SchemaColumn } from '../types/grid';
import { PaperDocumentInfo } from '../types/paper';

describe('Dataset Author Enrichment Service Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useGridStore.setState({
      columns: [],
      rows: [],
      selectedRowIds: [],
      selectedCells: [],
    });
  });

  describe('extractDoiFromRow', () => {
    it('extracts DOI from an explicit "DOI" column', () => {
      const columns: SchemaColumn[] = [
        { field: 'title', headerName: 'Title' },
        { field: 'doi', headerName: 'DOI' },
      ];
      const row: GridRow = {
        id: 'r1',
        pdfId: 'p1',
        pdfTitle: 'Sample Paper',
        aiStatus: 'Confirmed',
        doi: '10.1038/s41467-020-17849-0',
      };

      const result = extractDoiFromRow(row, columns, []);
      expect(result).toBe('10.1038/s41467-020-17849-0');
    });

    it('extracts and normalizes DOI from full URL', () => {
      const columns: SchemaColumn[] = [
        { field: 'article_doi', headerName: 'Article DOI' },
      ];
      const row: GridRow = {
        id: 'r1',
        pdfId: 'p1',
        pdfTitle: 'Sample Paper',
        aiStatus: 'Confirmed',
        article_doi: 'https://doi.org/10.1371/journal.pone.0281234',
      };

      const result = extractDoiFromRow(row, columns, []);
      expect(result).toBe('10.1371/journal.pone.0281234');
    });

    it('extracts DOI from loaded paper lookup via pdfId', () => {
      const columns: SchemaColumn[] = [
        { field: 'finding', headerName: 'Key Finding' },
      ];
      const row: GridRow = {
        id: 'r1',
        pdfId: 'paper-123',
        pdfTitle: 'Cell Paper',
        aiStatus: 'Confirmed',
      };
      const pdfs: PaperDocumentInfo[] = [
        {
          id: 'paper-123',
          name: 'Cell Paper',
          doi: '10.1016/j.cell.2020.08.020',
          oaStatus: 'gold',
          sourceType: 'doi_structured',
          status: 'Ready',
          uploadedAt: Date.now(),
        },
      ];

      const result = extractDoiFromRow(row, columns, pdfs);
      expect(result).toBe('10.1016/j.cell.2020.08.020');
    });

    it('scans cell content for embedded DOI patterns', () => {
      const columns: SchemaColumn[] = [
        { field: 'citation_source', headerName: 'Source Citation' },
      ];
      const row: GridRow = {
        id: 'r1',
        pdfId: 'p1',
        pdfTitle: 'Paper',
        aiStatus: 'Confirmed',
        citation_source: 'Published in Nature, DOI: 10.1038/nature12345, page 10',
      };

      const result = extractDoiFromRow(row, columns, []);
      expect(result).toBe('10.1038/nature12345');
    });
  });

  describe('fetchCorrespondingAuthor', () => {
    it('extracts corresponding author from OpenAlex and PMC XML email', async () => {
      const mockOpenAlex = {
        title: 'Phage Therapy in Bacterial Infections',
        ids: { pmcid: 'PMC7452342' },
        authorships: [
          {
            author: { display_name: 'Dr. First Author', orcid: 'https://orcid.org/0000-0001' },
            author_position: 'first',
            is_corresponding: false,
            institutions: [{ display_name: 'Oxford University' }],
          },
          {
            author: { display_name: 'Prof. Lead Researcher', orcid: 'https://orcid.org/0000-0002' },
            author_position: 'last',
            is_corresponding: true,
            institutions: [{ display_name: 'Harvard Medical School' }],
          },
        ],
      };

      const mockXml = `
        <article>
          <front>
            <article-meta>
              <author-notes>
                <corresp id="cor1">*Correspondence: <email>lead.researcher@harvard.edu</email></corresp>
              </author-notes>
            </article-meta>
          </front>
        </article>
      `;

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('openalex.org')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockOpenAlex,
          });
        }
        if (url.includes('fullTextXML')) {
          return Promise.resolve({
            ok: true,
            text: async () => mockXml,
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
        });
      });

      const details = await fetchCorrespondingAuthor('10.1038/s41467-020-17849-0');

      expect(details.name).toBe('Prof. Lead Researcher');
      expect(details.email).toBe('lead.researcher@harvard.edu');
      expect(details.institution).toBe('Harvard Medical School');
      expect(details.orcid).toBe('https://orcid.org/0000-0002');
    });
  });

  describe('enrichGridDatasetWithAuthors', () => {
    it('adds missing author columns and updates table rows', async () => {
      // Setup grid with 2 rows referencing DOIs
      useGridStore.setState({
        columns: [
          { field: 'finding', headerName: 'Scientific Finding', editable: true },
          { field: 'doi', headerName: 'DOI', editable: true },
        ],
        rows: [
          {
            id: 'row-1',
            pdfId: 'p1',
            pdfTitle: 'Study 1',
            aiStatus: 'Confirmed',
            finding: 'Phage burst size is 120 PFU/cell',
            doi: '10.1038/s41467-020-17849-0',
          },
        ],
      });

      const mockOpenAlex = {
        title: 'Study 1',
        ids: { pmcid: 'PMC12345' },
        authorships: [
          {
            author: { display_name: 'Dr. Jane Smith', orcid: 'https://orcid.org/0000-0001' },
            is_corresponding: true,
            institutions: [{ display_name: 'Broad Institute' }],
          },
        ],
      };

      const mockXml = '<article><email>jsmith@broadinstitute.org</email></article>';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('openalex.org')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockOpenAlex,
          });
        }
        if (url.includes('fullTextXML')) {
          return Promise.resolve({
            ok: true,
            text: async () => mockXml,
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
        });
      });

      const progressSpy = vi.fn();
      const result = await enrichGridDatasetWithAuthors(progressSpy);

      expect(result.success).toBe(true);
      expect(result.enrichedRows).toBe(1);
      expect(progressSpy).toHaveBeenCalled();

      const updatedColumns = useGridStore.getState().columns;
      const updatedRows = useGridStore.getState().rows;

      // Verify columns were added
      expect(updatedColumns.some((c) => c.headerName === 'Corresponding Author')).toBe(true);
      expect(updatedColumns.some((c) => c.headerName === 'Author Email')).toBe(true);
      expect(updatedColumns.some((c) => c.headerName === 'Author Institution')).toBe(true);

      // Verify row values populated
      const r1 = updatedRows.find((r) => r.id === 'row-1');
      expect(r1).toBeDefined();
      expect(r1?.corresponding_author).toBe('Dr. Jane Smith');
      expect(r1?.author_email).toBe('jsmith@broadinstitute.org');
      expect(r1?.author_institution).toBe('Broad Institute');

      // Verify citations for auto-scroll and highlight
      expect(r1?.citationMap).toBeDefined();
      expect(r1?.citationMap?.corresponding_author?.snippetQuote).toBe('Dr. Jane Smith');
      expect(r1?.citationMap?.corresponding_author?.pageNumber).toBe(1);
      expect(r1?.citationMap?.author_email?.snippetQuote).toBe('jsmith@broadinstitute.org');
    });

    it('returns error if no rows have DOIs', async () => {
      useGridStore.setState({
        columns: [{ field: 'finding', headerName: 'Finding', editable: true }],
        rows: [
          {
            id: 'row-1',
            pdfId: 'p1',
            pdfTitle: 'Study 1',
            aiStatus: 'Confirmed',
            finding: 'No DOI anywhere in this row',
          },
        ],
      });

      const result = await enrichGridDatasetWithAuthors();
      expect(result.success).toBe(false);
      expect(result.message).toContain('No DOIs could be identified');
    });
  });
});
