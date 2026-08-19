import { describe, it, expect, beforeEach } from 'vitest';
import { getToolsForMode, agentToolsRegistry } from '../services/agentToolRegistry';
import { useGridStore } from '../store/useGridStore';

describe('agentToolRegistry - Complete Phase 3 Tool Suite', () => {
  beforeEach(() => {
    useGridStore.setState({
      columns: [
        { field: 'methodology', headerName: 'Methodology', editable: true },
        { field: 'sampleSize', headerName: 'Sample Size', editable: true },
      ],
      rows: [
        {
          id: 'row-1',
          pdfId: 'pdf-1',
          pdfTitle: 'Test Paper.pdf',
          methodology: 'Initial method',
          sampleSize: '50',
          aiStatus: 'Confirmed',
        },
        {
          id: 'row-2',
          pdfId: 'pdf-1',
          pdfTitle: 'Test Paper.pdf',
          methodology: 'Secondary method',
          sampleSize: '100',
          aiStatus: 'Confirmed',
        },
      ],
      focusedCell: { rowId: 'row-1', field: 'methodology' },
    });
  });

  it('generates tools wrapped in functionDeclarations matching @google/genai schema', () => {
    const tools = getToolsForMode('human_in_loop');

    expect(tools).toHaveLength(1);
    expect(tools[0]).toHaveProperty('functionDeclarations');
    expect(Array.isArray(tools[0].functionDeclarations)).toBe(true);

    const names = tools[0].functionDeclarations.map((d: any) => d.name);
    expect(names).toContain('updateCell');
    expect(names).toContain('batchUpdateCells');
    expect(names).toContain('updateRow');
    expect(names).toContain('appendRow');
    expect(names).toContain('appendRows');
    expect(names).toContain('addColumn');
    expect(names).toContain('renameColumn');
    expect(names).toContain('deleteColumn');
    expect(names).toContain('disaggregateRow');
    expect(names).toContain('mergeRows');
    expect(names).toContain('deleteRows');
    expect(names).toContain('extractPDFData');
    expect(names).toContain('verifyEvidenceCitation');
    expect(names).toContain('searchDocument');
    expect(names).toContain('queryGridData');

    const updateCellDecl = tools[0].functionDeclarations.find((d: any) => d.name === 'updateCell');
    expect(updateCellDecl?.parameters?.type).toBe('OBJECT');
    expect(updateCellDecl?.parameters?.properties?.field?.enum).toEqual(['methodology', 'sampleSize']);
  });

  it('executes disaggregateRow to expand composite observations into atomic rows', async () => {
    const result = await agentToolsRegistry.disaggregateRow.execute(
      {
        targetRowId: 'row-1',
        replacementRows: [
          { methodology: 'Phage A Assay', sampleSize: '25' },
          { methodology: 'Phage B Assay', sampleSize: '35' },
        ],
        reasoning: 'Separated testing into 2 distinct assays',
      },
      'human_in_loop'
    );

    expect(result.success).toBe(true);
    const state = useGridStore.getState();
    expect(state.rows).toHaveLength(3); // row-1 was replaced by 2 rows + row-2
    expect(state.rows[0].methodology).toBe('Phage A Assay');
    expect(state.rows[0].sampleSize).toBe('25');
    expect(state.rows[1].methodology).toBe('Phage B Assay');
    expect(state.rows[1].sampleSize).toBe('35');
    expect(state.rows[0].pdfTitle).toBe('Test Paper.pdf'); // inherited metadata
  });

  it('executes updateRow to update multiple fields on a row in a single atomic transaction', async () => {
    const result = await agentToolsRegistry.updateRow.execute(
      {
        rowId: 'row-1',
        fields: {
          methodology: 'Combined Genomic Protocol',
          sampleSize: '500',
        },
      },
      'human_in_loop'
    );

    expect(result.success).toBe(true);
    const state = useGridStore.getState();
    const row = state.rows.find((r) => r.id === 'row-1');
    expect(row?.methodology).toBe('Combined Genomic Protocol');
    expect(row?.sampleSize).toBe('500');
  });

  it('executes updateCell tool and updates the grid store with reasoning and citation', async () => {
    const result = await agentToolsRegistry.updateCell.execute(
      {
        rowId: 'row-1',
        field: 'methodology',
        newValue: 'Updated Phage Therapy Test',
        reasoning: 'Verified in section 3',
        pageNumber: 3,
        sectionName: 'Methods',
        snippetQuote: 'We tested phage therapy in 50 samples',
      },
      'human_in_loop'
    );

    expect(result.success).toBe(true);
    expect(result.replyText).toContain('Updated Phage Therapy Test');

    const state = useGridStore.getState();
    const updatedRow = state.rows.find((r) => r.id === 'row-1');
    expect(updatedRow?.methodology).toBe('Updated Phage Therapy Test');
    expect(updatedRow?.aiStatus).toBe('Pending Review');
    expect(updatedRow?.citationMap?.methodology?.reasoning).toBe('Verified in section 3');
    expect(updatedRow?.citationMap?.methodology?.pageNumber).toBe(3);
  });

  it('executes batchUpdateCells across multiple cells', async () => {
    const result = await agentToolsRegistry.batchUpdateCells.execute(
      {
        updates: [
          { rowId: 'row-1', field: 'methodology', newValue: 'Method A' },
          { rowId: 'row-2', field: 'sampleSize', newValue: '250' },
        ],
      },
      'human_in_loop'
    );

    expect(result.success).toBe(true);
    const state = useGridStore.getState();
    expect(state.rows.find((r) => r.id === 'row-1')?.methodology).toBe('Method A');
    expect(state.rows.find((r) => r.id === 'row-2')?.sampleSize).toBe('250');
  });

  it('executes renameColumn and deleteColumn tools', async () => {
    // 1. Rename column
    const renameRes = await agentToolsRegistry.renameColumn.execute(
      { field: 'sampleSize', newHeaderName: 'Cohort Count' },
      'human_in_loop'
    );
    expect(renameRes.success).toBe(true);
    expect(useGridStore.getState().columns.find((c) => c.field === 'sampleSize')?.headerName).toBe('Cohort Count');

    // 2. Delete column
    const delColRes = await agentToolsRegistry.deleteColumn.execute(
      { field: 'sampleSize' },
      'human_in_loop'
    );
    expect(delColRes.success).toBe(true);
    expect(useGridStore.getState().columns.some((c) => c.field === 'sampleSize')).toBe(false);
  });

  it('executes mergeRows and deleteRows tools', async () => {
    // 1. Merge rows
    const mergeRes = await agentToolsRegistry.mergeRows.execute(
      { rowIds: ['row-1', 'row-2'] },
      'human_in_loop'
    );
    expect(mergeRes.success).toBe(true);
    expect(useGridStore.getState().rows).toHaveLength(1);

    const mergedRow = useGridStore.getState().rows[0];
    expect(mergedRow.methodology).toContain('Initial method');
    expect(mergedRow.methodology).toContain('Secondary method');

    // 2. Delete rows
    const delRes = await agentToolsRegistry.deleteRows.execute(
      { rowIds: [mergedRow.id] },
      'human_in_loop'
    );
    expect(delRes.success).toBe(true);
    expect(useGridStore.getState().rows).toHaveLength(0);
  });

  it('executes queryGridData without mutating table state', async () => {
    const queryRes = await agentToolsRegistry.queryGridData.execute(
      { filterField: 'sampleSize', filterValue: '100' },
      'human_in_loop'
    );

    expect(queryRes.success).toBe(true);
    expect(queryRes.resultData.matches).toHaveLength(1);
    expect(queryRes.resultData.matches[0].id).toBe('row-2');
  });

  it('executes appendRow and appendRows tools to add observations atomically', async () => {
    const appendSingleRes = await agentToolsRegistry.appendRow.execute(
      {
        fields: { methodology: 'Single Method', sampleSize: '150' },
        pdfTitle: 'Appended Paper.pdf',
      },
      'human_in_loop'
    );
    expect(appendSingleRes.success).toBe(true);
    expect(appendSingleRes.resultData.createdRowId).toBeDefined();

    const appendBatchRes = await agentToolsRegistry.appendRows.execute(
      {
        rows: [
          { fields: { methodology: 'Batch A', sampleSize: '200' } },
          { fields: { methodology: 'Batch B', sampleSize: '300' } },
        ],
        pdfTitle: 'Batch Paper.pdf',
      },
      'human_in_loop'
    );
    expect(appendBatchRes.success).toBe(true);
    expect(appendBatchRes.resultData.rowsCount).toBe(2);
    expect(useGridStore.getState().rows).toHaveLength(5); // 2 initial + 1 single + 2 batch
  });

  it('handles errors gracefully in updateCell when invalid inputs are passed', async () => {
    const result = await agentToolsRegistry.updateCell.execute(
      { newValue: null as any },
      'human_in_loop'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
