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
    expect(names).toHaveLength(17);
    expect(names).toContain('updateCell');
    expect(names).toContain('batchUpdateCells');
    expect(names).toContain('updateRow');
    expect(names).toContain('appendRows');
    expect(names).toContain('addColumns');
    expect(names).not.toContain('addColumn');
    expect(names).toContain('renameColumn');
    expect(names).toContain('deleteColumn');
    expect(names).toContain('disaggregateRow');
    expect(names).toContain('mergeRows');
    expect(names).toContain('deleteRows');
    expect(names).toContain('extractPDFData');
    expect(names).toContain('extractAllWorkspacePapers');
    expect(names).toContain('verifyEvidenceCitation');
    expect(names).toContain('queryGridData');
    expect(names).toContain('proposeExtractionSchema');
    expect(names).toContain('searchAcademicLiterature');
    expect(names).toContain('stagePaperToWorkspace');

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

  it('executes updateCell tool and updates the grid store with reasoning, citation, and cell-level pending verification', async () => {
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
    expect(updatedRow?.pendingReviewFields).toContain('methodology');
    expect(updatedRow?.citationMap?.methodology?.reasoning).toBe('Verified in section 3');
    expect(updatedRow?.citationMap?.methodology?.pageNumber).toBe(3);
  });

  it('executes batchUpdateCells across multiple cells with cell-level pending review', async () => {
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
    expect(state.rows.find((r) => r.id === 'row-1')?.pendingReviewFields).toContain('methodology');
    expect(state.rows.find((r) => r.id === 'row-2')?.sampleSize).toBe('250');
    expect(state.rows.find((r) => r.id === 'row-2')?.pendingReviewFields).toContain('sampleSize');
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

  it('executes queryGridData without mutating table state and handles "all", "*", or empty queries gracefully', async () => {
    // 1. Filtered query
    const queryRes = await agentToolsRegistry.queryGridData.execute(
      { filterField: 'sampleSize', filterValue: '100' },
      'human_in_loop'
    );
    expect(queryRes.success).toBe(true);
    expect(queryRes.resultData.matches).toHaveLength(1);
    expect(queryRes.resultData.matches[0].id).toBe('row-2');

    // 2. Universal "all" query should return all rows rather than matching literal string "all"
    const allQueryRes = await agentToolsRegistry.queryGridData.execute(
      { searchQuery: 'all' },
      'human_in_loop'
    );
    expect(allQueryRes.success).toBe(true);
    expect(allQueryRes.resultData.matches).toHaveLength(2);

    // 3. Universal "*" wildcard query
    const starQueryRes = await agentToolsRegistry.queryGridData.execute(
      { searchQuery: '*' },
      'human_in_loop'
    );
    expect(starQueryRes.success).toBe(true);
    expect(starQueryRes.resultData.matches).toHaveLength(2);

    // 4. Empty arguments `{}` should also return all rows
    const emptyQueryRes = await agentToolsRegistry.queryGridData.execute({}, 'human_in_loop');
    expect(emptyQueryRes.success).toBe(true);
    expect(emptyQueryRes.resultData.matches).toHaveLength(2);
  });

  it('executes appendRows tool to add single or batch observations atomically', async () => {
    const appendSingleRes = await agentToolsRegistry.appendRows.execute(
      {
        rows: [{ fields: { methodology: 'Single Method', sampleSize: '150' } }],
        pdfTitle: 'Appended Paper.pdf',
      },
      'human_in_loop'
    );
    expect(appendSingleRes.success).toBe(true);
    expect(appendSingleRes.resultData.createdRowIds).toHaveLength(1);

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
    const allRows = useGridStore.getState().rows;
    expect(allRows).toHaveLength(5); // 2 initial + 1 single + 2 batch
    expect(allRows[2].aiStatus).toBe('Pending Review');
    expect(allRows[3].aiStatus).toBe('Pending Review');
    expect(allRows[4].aiStatus).toBe('Pending Review');

    // 3. Re-appending identical row should trigger idempotency check and prevent duplicate entries
    const duplicateRes = await agentToolsRegistry.appendRows.execute(
      {
        rows: [{ fields: { methodology: 'Single Method', sampleSize: '150' } }],
        pdfTitle: 'Appended Paper.pdf',
      },
      'human_in_loop'
    );
    expect(duplicateRes.success).toBe(true);
    expect(duplicateRes.resultData.rowsCount).toBe(0);
    // Table length should still be 5
    expect(useGridStore.getState().rows).toHaveLength(5);
  });

  it('handles errors gracefully in updateCell when invalid inputs are passed', async () => {
    const result = await agentToolsRegistry.updateCell.execute(
      { newValue: null as any },
      'human_in_loop'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('clears cell-level pending verification on confirmAIEdits, rejectAIEdits, or manual edit', () => {
    const store = useGridStore.getState();
    // Simulate pending cell
    useGridStore.setState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        r.id === 'row-1' ? { ...r, pendingReviewFields: ['methodology'] } : r
      ),
    }));

    expect(useGridStore.getState().rows.find((r) => r.id === 'row-1')?.pendingReviewFields).toContain('methodology');

    // Confirm AI edits clears pendingReviewFields
    store.confirmAIEdits();
    expect(useGridStore.getState().rows.find((r) => r.id === 'row-1')?.pendingReviewFields).toHaveLength(0);

    // Add pending field and test manual cell update
    useGridStore.setState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        r.id === 'row-1' ? { ...r, pendingReviewFields: ['methodology'] } : r
      ),
    }));
    store.updateCell('row-1', 'methodology', 'Manual override text');
    expect(useGridStore.getState().rows.find((r) => r.id === 'row-1')?.pendingReviewFields).toHaveLength(0);
  });

  it('repairs truncated JSON with unclosed strings and unclosed brackets in safeJsonParse', async () => {
    const { safeJsonParse } = await import('../services/agentToolRegistry');

    // Case 1: Truncated inside a string
    const truncated1 = '{"rows": [{"fields": {"article_doi": "10.1128/mSphere.01215-20", "phage_name": "vB_Pae_AM';
    const parsed1 = safeJsonParse(truncated1);
    expect(parsed1).toBeDefined();
    expect(parsed1.rows).toHaveLength(1);
    expect(parsed1.rows[0].fields.article_doi).toBe('10.1128/mSphere.01215-20');
    expect(parsed1.rows[0].fields.phage_name).toBe('vB_Pae_AM');

    // Case 2: Markdown fence with trailing comma
    const fencedWithTrailingComma = '```json\n{"rows": [{"id": 1, "name": "Test",}],}\n```';
    const parsed2 = safeJsonParse(fencedWithTrailingComma);
    expect(parsed2.rows[0].name).toBe('Test');
  });

  it('executes addColumns tool supporting both batch array and single header inputs', async () => {
    // 1. Batch array of columns
    const batchRes = await agentToolsRegistry.addColumns.execute(
      { headerNames: ['Host Range Test', 'Burst Size (pfu)', 'Latent Time'] },
      'human_in_loop'
    );
    expect(batchRes.success).toBe(true);
    const store = useGridStore.getState();
    expect(store.columns.some((c) => c.field === 'host_range_test')).toBe(true);
    expect(store.columns.some((c) => c.field === 'burst_size_pfu')).toBe(true);
    expect(store.columns.some((c) => c.field === 'latent_time')).toBe(true);

    // 2. Single column string input fallback
    const singleRes = await agentToolsRegistry.addColumns.execute(
      { headerName: 'Plaque Morphology' },
      'human_in_loop'
    );
    expect(singleRes.success).toBe(true);
    expect(useGridStore.getState().columns.some((c) => c.field === 'plaque_morphology')).toBe(true);
  });

  it('validates and executes searchAcademicLiterature tool parameters gracefully', async () => {
    const res = await agentToolsRegistry.searchAcademicLiterature.execute(
      { query: '' },
      'human_in_loop'
    );
    expect(res.success).toBe(true);
    expect(res.summary).toContain('searchAcademicLiterature(0 hits)');
  });

  it('validates stagePaperToWorkspace tool requires doi parameter', async () => {
    const res = await agentToolsRegistry.stagePaperToWorkspace.execute(
      {},
      'human_in_loop'
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain('Parameter "doi" is required');
  });
});
