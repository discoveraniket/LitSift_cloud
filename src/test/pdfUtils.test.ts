import { describe, it, expect } from 'vitest';
import { buildPaperMarkdownContext } from '../services/pdfUtils';

describe('pdfUtils - LLM Markdown Context Builder Suite', () => {
  it('builds structured markdown with metadata, abstract, scientific sections, and compact tables', () => {
    const mockPaper = {
      title: 'Genomic Characterization of Phage vB_EcoM',
      doi: '10.1128/spectrum.03979-25',
      journal: 'Microbiology Spectrum',
      year: 2026,
      authors: [
        { name: 'Dr. Sarah Jenkins', affiliation: 'MIT' },
        { name: 'Dr. Alex Rivera' },
      ],
      oaStatus: 'gold',
      citationCount: 42,
      abstractText: 'Five broad-spectrum lytic bacteriophages were characterized.',
      sections: [
        {
          id: 'sec-intro',
          title: 'Introduction',
          content: 'Antibiotic resistance poses a critical challenge in poultry farming.',
        },
        {
          id: 'sec-methods',
          title: 'Methods > Phage Isolation',
          content: 'Phages were isolated from environmental wastewater samples.',
        },
        {
          id: 'sec-results',
          title: 'Results > Burst Size Analysis',
          content: 'The GC content ranged from 43.68% to 43.76%.',
        },
        // Administrative Boilerplate Sections that MUST be excluded from LLM prompt:
        {
          id: 'sec-coi',
          title: 'Conflict of Interest',
          content: 'The authors declare that they have no competing interests.',
        },
        {
          id: 'sec-funding',
          title: 'Funding Statement',
          content: 'This work was supported by NIH grant R01-AI12345.',
        },
        {
          id: 'sec-data',
          title: 'Data Availability',
          content: 'Genomic data are deposited under BioProject PRJNA1256089.',
        },
        {
          id: 'sec-auth',
          title: 'Author Contributions',
          content: 'SJ conceived the study; AR performed experiments.',
        },
        {
          id: 'sec-ack',
          title: 'Acknowledgments',
          content: 'We thank the core sequencing facility for technical support.',
        },
        {
          id: 'sec-ref',
          title: 'References',
          content: '1. Smith J et al. Nature 2020.\n2. Doe J et al. Science 2021.',
        },
      ],
      tables: [
        {
          id: 't1',
          label: 'Table 1',
          caption: 'Phage kinetic parameters',
          headers: ['Phage ID', 'Latency (min)', 'Burst Size (PFU/cell)'],
          rows: [
            ['vB_EcoM_fRPOT1', '25', '120'],
            ['vB_EcoM_fRPOT2\n(variant)', '30', '145'],
            ['', '', ''], // empty row to be filtered
          ],
        },
      ],
      figures: [
        {
          id: 'f1',
          label: 'Figure 1',
          caption: 'Transmission electron micrographs of phages.',
        },
      ],
    };

    const markdown = buildPaperMarkdownContext(mockPaper);

    // 1. Header & Academic Metadata
    expect(markdown).toContain('# Genomic Characterization of Phage vB_EcoM');
    expect(markdown).toContain('- **DOI**: 10.1128/spectrum.03979-25');
    expect(markdown).toContain('- **Journal**: Microbiology Spectrum (2026)');
    expect(markdown).toContain('- **Authors**: Dr. Sarah Jenkins (MIT), Dr. Alex Rivera');
    expect(markdown).toContain('- **Open Access Status**: GOLD');
    expect(markdown).toContain('- **Cited by**: 42');

    // 2. Abstract
    expect(markdown).toContain('## Abstract\nFive broad-spectrum lytic bacteriophages were characterized.');

    // 3. Scientific Sections Preserved
    expect(markdown).toContain('## Introduction\nAntibiotic resistance poses a critical challenge in poultry farming.');
    expect(markdown).toContain('### Methods > Phage Isolation\nPhages were isolated from environmental wastewater samples.');
    expect(markdown).toContain('### Results > Burst Size Analysis\nThe GC content ranged from 43.68% to 43.76%.');

    // 4. Administrative Boilerplate Filtered Out
    expect(markdown).not.toContain('Conflict of Interest');
    expect(markdown).not.toContain('Funding Statement');
    expect(markdown).not.toContain('Data Availability');
    expect(markdown).not.toContain('Author Contributions');
    expect(markdown).not.toContain('Acknowledgments');
    expect(markdown).not.toContain('## References');

    // 5. Compact Table Rendering
    expect(markdown).toContain('## Extracted Tables');
    expect(markdown).toContain('### Table 1');
    expect(markdown).toContain('*Caption: Phage kinetic parameters*');
    expect(markdown).toContain('| Phage ID | Latency (min) | Burst Size (PFU/cell) |');
    expect(markdown).toContain('| --- | --- | --- |');
    expect(markdown).toContain('| vB_EcoM_fRPOT1 | 25 | 120 |');
    expect(markdown).toContain('| vB_EcoM_fRPOT2 (variant) | 30 | 145 |');

    // 6. Figures
    expect(markdown).toContain('## Figures & Captions');
    expect(markdown).toContain('### Figure 1');
  });
});
