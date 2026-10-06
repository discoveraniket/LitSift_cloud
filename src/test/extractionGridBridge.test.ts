import { describe, it, expect, beforeEach } from 'vitest';
import { useGridStore } from '../store/useGridStore';
import { applyApprovedSchemaToGrid, stageExtractedRowsToGrid } from '../services/extractionGridBridge';
import { ProposedColumn, SinglePaperObservation } from '../types/extraction';
import { PaperDocumentInfo } from '../types/paper';
import { SchemaColumn } from '../types/grid';

describe('Extraction Grid Bridge Suite', () => {
  beforeEach(() => {
    useGridStore.getState().clearTable();
  });

  describe('applyApprovedSchemaToGrid', () => {
    it('adds new proposed columns to the grid store', () => {
      const proposed: ProposedColumn[] = [
        { field: 'phage_name', headerName: 'Phage Name', description: 'Name of the phage' },
        { field: 'burst_size', headerName: 'Burst Size', description: 'Virions per cell' },
      ];

      const result = applyApprovedSchemaToGrid(proposed);
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.headerName)).toEqual(['Phage Name', 'Burst Size']);

      const storeCols = useGridStore.getState().columns;
      expect(storeCols).toHaveLength(2);
      expect(storeCols[0].field).toBe('phage_name');
    });

    it('does not duplicate columns that already exist in the grid', () => {
      useGridStore.getState().addColumn('Phage Name');

      const proposed: ProposedColumn[] = [
        { field: 'phage_name', headerName: 'Phage Name', description: 'Name of the phage' },
        { field: 'host_bacteria', headerName: 'Host Bacteria', description: 'Bacterial host' },
      ];

      const result = applyApprovedSchemaToGrid(proposed);
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.headerName)).toEqual(['Phage Name', 'Host Bacteria']);
    });
  });

  describe('stageExtractedRowsToGrid', () => {
    const mockPaper: PaperDocumentInfo = {
      id: 'paper-123',
      name: 'Phage Research Paper',
      title: 'Genomic Characterization of Novel Bacteriophage',
      doi: '10.1038/s41467-020-17849-0',
      sourceType: 'pdf_upload',
      oaStatus: 'gold',
      status: 'Ready',
      uploadedAt: Date.now(),
    };

    const mockLockedSchema: SchemaColumn[] = [
      { field: 'phage_name', headerName: 'Phage Name' },
      { field: 'host_bacteria', headerName: 'Host Bacteria' },
      { field: 'burst_size', headerName: 'Burst Size' },
    ];

    it('stages observations into the grid with Pending Review status and citations', () => {
      const observations: SinglePaperObservation[] = [
        {
          fields: {
            phage_name: 'vB_EcoM_AP1',
            host_bacteria: 'Escherichia coli O157:H7',
            burst_size: '120 pfu/cell',
          },
          citations: {
            phage_name: {
              snippetQuote: 'We isolated bacteriophage vB_EcoM_AP1.',
              sectionName: 'Isolation and Morphology',
              pageNumber: 2,
              reasoning: 'Direct identification in text',
              confidence: 0.99,
            },
            host_bacteria: {
              snippetQuote: 'The host strain was E. coli O157:H7.',
              sectionName: 'Host Range',
              pageNumber: 3,
              reasoning: 'Primary host tested',
              confidence: 0.98,
            },
            burst_size: {
              snippetQuote: 'The burst size was calculated to be 120 virions per infected cell.',
              sectionName: 'One-step Growth Curve',
              pageNumber: 4,
              reasoning: 'Quantitative measurement',
              confidence: 0.95,
            },
          },
        },
      ];

      const staged = stageExtractedRowsToGrid(mockPaper, observations, mockLockedSchema);
      expect(staged).toHaveLength(1);

      const row = staged[0];
      expect(row.aiStatus).toBe('Pending Review');
      expect(row.pdfId).toBe('paper-123');
      expect(row.pdfTitle).toBe('Genomic Characterization of Novel Bacteriophage');
      expect(row.phage_name).toBe('vB_EcoM_AP1');
      expect(row.burst_size).toBe('120 pfu/cell');

      // Citation verification
      expect(row.citationMap).toBeDefined();
      expect(row.citationMap!['burst_size']).toEqual({
        pageNumber: 4,
        sectionName: 'One-step Growth Curve',
        paragraphNumber: undefined,
        snippetQuote: 'The burst size was calculated to be 120 virions per infected cell.',
        reasoning: 'Quantitative measurement',
        confidence: 0.95,
      });

      // Verification in store
      const storeRows = useGridStore.getState().rows;
      expect(storeRows).toHaveLength(1);
      expect(storeRows[0].id).toBe(row.id);
    });

    it('handles missing values gracefully with "Not reported"', () => {
      const observations: SinglePaperObservation[] = [
        {
          fields: {
            phage_name: 'Phage Lambda',
            host_bacteria: 'E. coli K12',
            // burst_size is intentionally omitted
          },
          citations: {
            phage_name: {
              snippetQuote: 'Phage Lambda was used.',
              sectionName: 'Methods',
              pageNumber: 1,
              reasoning: 'Identified',
              confidence: 0.95,
            },
          },
        },
      ];

      const staged = stageExtractedRowsToGrid(mockPaper, observations, mockLockedSchema);
      expect(staged).toHaveLength(1);
      expect(staged[0].burst_size).toBe('Not reported');
      expect(staged[0].citationMap!['burst_size'].snippetQuote).toBe('Not reported in document');
    });
  });
});
