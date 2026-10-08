import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseCsv,
  sanitizeField,
  alignHeadersWithSchema,
  applyCsvTemplateToStore,
  applyCsvDatasetToStore,
} from '../services/csvImportService';
import { useGridStore } from '../store/useGridStore';
import { useAgentStore } from '../store/useAgentStore';

describe('csvImportService - Smooth CSV & Schema Template Ingestion Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useGridStore.setState({
      columns: [
        { field: 'phage_name', headerName: 'Phage Name', editable: true },
        { field: 'host_bacteria', headerName: 'Host Bacteria', editable: true },
      ],
      rows: [
        {
          id: 'row-1',
          pdfId: 'pdf-1',
          pdfTitle: 'Initial Paper.pdf',
          phage_name: 'PG14',
          host_bacteria: 'Klebsiella pneumoniae',
          aiStatus: 'Confirmed',
        },
      ],
    });
    useAgentStore.setState({
      messages: [],
    });
  });

  describe('1. parseCsv & Template Detection', () => {
    it('correctly detects a Schema Template (headers only, 0 data rows)', () => {
      const csv = 'Phage Name,Host Species,Burst Size,Latent Period';
      const parsed = parseCsv(csv, 'template.csv');

      expect(parsed.isTemplate).toBe(true);
      expect(parsed.headers).toEqual(['Phage Name', 'Host Species', 'Burst Size', 'Latent Period']);
      expect(parsed.rows).toEqual([]);
      expect(parsed.filename).toBe('template.csv');
    });

    it('correctly detects a Schema Template with blank row', () => {
      const csv = 'Phage Name,Host Species,Burst Size\n   ,   ,   ';
      const parsed = parseCsv(csv, 'template.csv');

      expect(parsed.isTemplate).toBe(true);
      expect(parsed.headers).toEqual(['Phage Name', 'Host Species', 'Burst Size']);
      expect(parsed.rows).toEqual([]);
    });

    it('parses empirical Dataset with multiple rows and complex quotes', () => {
      const csv = `Phage Name,Host Bacteria,"Efficacy Notes, Metrics",Burst Size
PG14,Klebsiella pneumoniae,"Reduced biofilm by 85%, high synergy",120
K11,E. coli,"Complete lysis within 30 min",95`;

      const parsed = parseCsv(csv, 'benchmark_data.csv');

      expect(parsed.isTemplate).toBe(false);
      expect(parsed.headers).toEqual(['Phage Name', 'Host Bacteria', 'Efficacy Notes, Metrics', 'Burst Size']);
      expect(parsed.rows).toHaveLength(2);
      expect(parsed.rows[0]['Phage Name']).toBe('PG14');
      expect(parsed.rows[0]['Efficacy Notes, Metrics']).toBe('Reduced biofilm by 85%, high synergy');
      expect(parsed.rows[0]['Burst Size']).toBe('120');
      expect(parsed.rows[1]['Phage Name']).toBe('K11');
    });

    it('handles empty input gracefully', () => {
      const parsed = parseCsv('');
      expect(parsed.headers).toEqual([]);
      expect(parsed.rows).toEqual([]);
      expect(parsed.isTemplate).toBe(true);
    });
  });

  describe('2. sanitizeField & alignHeadersWithSchema', () => {
    it('sanitizes human headers into valid schema keys', () => {
      expect(sanitizeField('Burst Size (PFU/cell)')).toBe('burst_size_pfucell');
      expect(sanitizeField('Host Bacteria Strain')).toBe('host_bacteria_strain');
      expect(sanitizeField('Latent-Period_min')).toBe('latent_period_min');
    });

    it('aligns incoming headers with existing columns to avoid duplicate schema fields', () => {
      const existing = [
        { field: 'phage_name', headerName: 'Phage Name', editable: true },
        { field: 'burst_size', headerName: 'Burst Size', editable: true },
      ];

      const incoming = ['Phage Name', 'burst_size', 'Plaque Morphology', 'Latent Period'];
      const alignment = alignHeadersWithSchema(incoming, existing);

      expect(alignment.matched).toHaveLength(2);
      expect(alignment.matched[0].incomingHeader).toBe('Phage Name');
      expect(alignment.matched[0].existingField).toBe('phage_name');
      expect(alignment.matched[1].incomingHeader).toBe('burst_size');

      expect(alignment.unmatched).toEqual(['Plaque Morphology', 'Latent Period']);
    });
  });

  describe('3. applyCsvTemplateToStore', () => {
    it('sets schema columns in grid store and notifies agent without losing rows when clearExistingRows is false', () => {
      const headers = ['Morphology', 'Burst Size', 'Host Strain'];
      applyCsvTemplateToStore(headers, { clearExistingRows: false, filename: 'custom_template.csv' });

      const store = useGridStore.getState();
      expect(store.columns).toHaveLength(3);
      expect(store.columns.some((c) => c.field === 'morphology')).toBe(true);
      expect(store.columns.some((c) => c.field === 'burst_size')).toBe(true);
      expect(store.columns.some((c) => c.field === 'host_strain')).toBe(true);
      expect(store.rows).toHaveLength(1); // preserved

      const agentMsgs = useAgentStore.getState().messages;
      expect(agentMsgs.some((m) => m.text.includes('Applied Custom Schema Template'))).toBe(true);
    });

    it('clears existing rows when clearExistingRows is true', () => {
      const headers = ['New Col A', 'New Col B'];
      applyCsvTemplateToStore(headers, { clearExistingRows: true });

      const store = useGridStore.getState();
      expect(store.columns).toHaveLength(2);
      expect(store.rows).toHaveLength(0); // cleared
    });
  });

  describe('4. applyCsvDatasetToStore', () => {
    it('replaces grid dataset when mode is replace', () => {
      const parsed = {
        headers: ['Species', 'Yield'],
        rows: [
          { Species: 'Phage A', Yield: '10^9' },
          { Species: 'Phage B', Yield: '10^8' },
        ],
        rawRowCount: 2,
        filename: 'dataset.csv',
        isTemplate: false,
      };

      applyCsvDatasetToStore(parsed, 'replace');

      const store = useGridStore.getState();
      expect(store.rows).toHaveLength(2);
      expect(store.columns.some((c) => c.headerName === 'Species')).toBe(true);
      expect(store.columns.some((c) => c.headerName === 'Yield')).toBe(true);
    });

    it('appends dataset rows when mode is append', () => {
      const parsed = {
        headers: ['phage_name', 'burst_size'],
        rows: [{ phage_name: 'Novel Phage X', burst_size: '200' }],
        rawRowCount: 1,
        filename: 'append.csv',
        isTemplate: false,
      };

      applyCsvDatasetToStore(parsed, 'append');

      const store = useGridStore.getState();
      expect(store.rows).toHaveLength(2); // 1 initial + 1 appended
    });
  });
});
