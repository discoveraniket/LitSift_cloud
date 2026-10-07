import { describe, it, expect } from 'vitest';
import {
  buildSmartWindowedContext,
  formatTableToMarkdown,
} from '../services/smartContextWindowing';
import type { PaperDocumentInfo, PaperTable, PaperSection } from '../types/paper';

describe('Smart Context Windowing Suite', () => {
  const mockTable: PaperTable = {
    id: 'tbl-1',
    label: 'Table 1',
    caption: 'Kinetic parameters of isolated bacteriophages',
    headers: ['Phage', 'Burst Size (pfu/cell)', 'Latent Period (min)'],
    rows: [
      ['Phage V12', '85 ± 4', '25'],
      ['Phage K9', '120 ± 10', '40'],
    ],
  };

  const mockSections: PaperSection[] = [
    {
      id: 'sec-intro',
      title: 'Introduction',
      content: 'Bacteriophages are viruses that infect bacteria. They have high potential.',
    },
    {
      id: 'sec-results',
      title: 'Results: Phage Characterization and Burst Kinetics',
      content: 'Phage V12 demonstrated a burst size of 85 virions per cell with a 25 min latency period.',
    },
    {
      id: 'sec-methods',
      title: 'Materials and Methods: One-Step Growth Assay',
      content: 'Assays were carried out according to standard Ellis and Delbruck protocols at 37 C.',
    },
    {
      id: 'sec-coi',
      title: 'Conflict of Interest',
      content: 'The authors declare no competing financial or personal interests.',
    },
    {
      id: 'sec-refs',
      title: 'References',
      content: '1. Adams MH. Bacteriophages. Interscience Publishers, 1959.',
    },
  ];

  const mockPaper: PaperDocumentInfo = {
    id: 'paper-test-01',
    name: 'Phage_Study.pdf',
    title: 'Characterization and Kinetics of Novel Lytic Phages',
    doi: '10.1016/j.phage.2026.01',
    journal: 'Journal of Virology',
    year: 2026,
    abstractText: 'We isolated two novel phages V12 and K9 showing high lytic efficiency against E. coli.',
    sections: mockSections,
    tables: [mockTable],
    oaStatus: 'gold',
    sourceType: 'pdf_upload',
    status: 'Ready',
    uploadedAt: 123456789,
  };

  describe('formatTableToMarkdown', () => {
    it('formats PaperTable into clean GitHub Markdown table with captions', () => {
      const md = formatTableToMarkdown(mockTable);
      expect(md).toContain('### Table 1: Kinetic parameters of isolated bacteriophages');
      expect(md).toContain('| Phage | Burst Size (pfu/cell) | Latent Period (min) |');
      expect(md).toContain('| --- | --- | --- |');
      expect(md).toContain('| Phage V12 | 85 ± 4 | 25 |');
    });

    it('handles tables where headers array is empty by promoting first row', () => {
      const noHeaderTable: PaperTable = {
        id: 'tbl-2',
        caption: 'Unheaded table',
        headers: [],
        rows: [
          ['ColA', 'ColB'],
          ['Val1', 'Val2'],
        ],
      };
      const md = formatTableToMarkdown(noHeaderTable);
      expect(md).toContain('| ColA | ColB |');
      expect(md).toContain('| Val1 | Val2 |');
    });
  });

  describe('buildSmartWindowedContext', () => {
    it('includes header metadata, abstract, and extracted tables', () => {
      const result = buildSmartWindowedContext(mockPaper);
      expect(result.contextText).toContain('# Characterization and Kinetics of Novel Lytic Phages');
      expect(result.contextText).toContain('10.1016/j.phage.2026.01');
      expect(result.contextText).toContain('## Abstract');
      expect(result.contextText).toContain('## Extracted Tables');
      expect(result.tablesIncludedCount).toBe(1);
      expect(result.sectionsIncluded).toContain('Abstract');
      expect(result.sectionsIncluded).toContain('Tables (1)');
    });

    it('prioritizes Results sections over generic text and includes Methods when enabled', () => {
      const result = buildSmartWindowedContext(mockPaper, { includeMethods: true });
      expect(result.contextText).toContain('Phage V12 demonstrated a burst size of 85');
      expect(result.sectionsIncluded).toContain('Results: Phage Characterization and Burst Kinetics');
      expect(result.sectionsIncluded).toContain('Materials and Methods: One-Step Growth Assay');
    });

    it('strictly excludes non-scientific administrative boilerplate (Conflict of Interest, References)', () => {
      const result = buildSmartWindowedContext(mockPaper);
      expect(result.contextText).not.toContain('Conflict of Interest');
      expect(result.contextText).not.toContain('The authors declare no competing financial');
      expect(result.contextText).not.toContain('References');
      expect(result.contextText).not.toContain('Adams MH. Bacteriophages');
      expect(result.sectionsIncluded).not.toContain('Conflict of Interest');
      expect(result.sectionsIncluded).not.toContain('References');
    });

    it('enforces character budget and marks isTruncated when budget is tight', () => {
      const tightBudgetResult = buildSmartWindowedContext(mockPaper, {
        maxCharacters: 600,
      });
      expect(tightBudgetResult.characterCount).toBeLessThanOrEqual(700);
      expect(tightBudgetResult.isTruncated).toBe(true);
      expect(tightBudgetResult.estimatedTokens).toBe(Math.ceil(tightBudgetResult.characterCount / 4));
    });

    it('falls back to paper.extractedText when paper.sections is undefined', () => {
      const paperWithFlatText: PaperDocumentInfo = {
        ...mockPaper,
        sections: undefined,
        tables: undefined,
        extractedText: 'Direct unstructured OCR text containing Results and Discussions.',
      };
      const result = buildSmartWindowedContext(paperWithFlatText);
      expect(result.contextText).toContain('Direct unstructured OCR text');
      expect(result.sectionsIncluded).toContain('Document Text');
    });
  });
});
