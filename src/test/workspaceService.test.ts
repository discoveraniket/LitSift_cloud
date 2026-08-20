import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  blobToBase64,
  base64ToBlob,
  downloadPdfFile,
  exportWorkspaceBundle,
  inspectWorkspaceFile,
  restoreWorkspaceBundle,
  WorkspaceBundle,
} from '../services/workspaceService';
import { usePdfStore } from '../store/usePdfStore';
import { useGridStore } from '../store/useGridStore';
import { useAgentStore } from '../store/useAgentStore';
import { useLogStore } from '../store/useLogStore';

describe('Workspace Service - Export, Import, Base64 & PDF Download Suite', () => {
  beforeEach(() => {
    usePdfStore.setState({ pdfs: [], activePdfId: '', isHydrated: true });
    useGridStore.setState({ columns: [], rows: [], selectedRowIds: [] });
    useAgentStore.setState({ messages: [], activePdfId: '', isThinking: false });
    useLogStore.setState({ logs: [] });
    vi.clearAllMocks();
  });

  describe('1. Base64 <-> Blob Roundtrip Fidelity', () => {
    it('accurately encodes a binary Blob to base64 Data URL and decodes back with 100% byte fidelity', async () => {
      // Create sample binary content simulating a PDF byte stream
      const sampleBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2]);
      const originalBlob = new Blob([sampleBytes], { type: 'application/pdf' });

      // Convert to Base64 Data URL
      const base64Url = await blobToBase64(originalBlob);
      expect(base64Url).toMatch(/^data:application\/pdf;base64,/);

      // Decode back to Blob
      const restoredBlob = base64ToBlob(base64Url);
      expect(restoredBlob.type).toBe('application/pdf');
      expect(restoredBlob.size).toBe(originalBlob.size);

      // Verify byte-level equality
      const restoredBuffer = await restoredBlob.arrayBuffer();
      const restoredBytes = new Uint8Array(restoredBuffer);
      expect(restoredBytes).toEqual(sampleBytes);
    });
  });

  describe('2. PDF Download Helper', () => {
    it('creates a download link, sets filename, and clicks for download from Blob', () => {
      const clickSpy = vi.fn();
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const elem = originalCreateElement(tagName);
        if (tagName === 'a') {
          elem.click = clickSpy;
        }
        return elem;
      });

      const testBlob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
      downloadPdfFile({ name: 'Clinical_Trial_2026', file: testBlob });

      expect(appendSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });
  });

  describe('3. Workspace Export Bundle Packaging', () => {
    it('packages active store state into a compliant .litsift schema bundle', async () => {
      // Seed stores with sample data
      usePdfStore.setState({
        pdfs: [
          {
            id: 'pdf-101',
            name: 'Paper_Alpha.pdf',
            url: 'blob:http://localhost/mock-url',
            status: 'Extracted',
            file: new Blob(['%PDF-1.4 content'], { type: 'application/pdf' }),
          },
        ],
        activePdfId: 'pdf-101',
      });

      useGridStore.setState({
        columns: [
          { field: 'pdfTitle', headerName: 'Document', editable: false },
          { field: 'methodology', headerName: 'Methodology', editable: true },
        ],
        rows: [
          {
            id: 'row-1',
            pdfId: 'pdf-101',
            pdfTitle: 'Paper_Alpha.pdf',
            methodology: 'Randomized Double-Blind Trial',
            aiStatus: 'Confirmed',
          },
        ],
      });

      useAgentStore.setState({
        messages: [
          {
            id: 'msg-1',
            pdfId: 'pdf-101',
            sender: 'user',
            text: 'Extract methodology',
            timestamp: '12:00 PM',
          },
        ],
      });

      const { bundle, filename } = await exportWorkspaceBundle('Clinical_Meta_Analysis');

      expect(filename).toBe('Clinical_Meta_Analysis.litsift');
      expect(bundle.format).toBe('litsift_workspace');
      expect(bundle.version).toBe('1.0');
      expect(bundle.metadata.workspaceName).toBe('Clinical_Meta_Analysis');
      expect(bundle.metadata.paperCount).toBe(1);
      expect(bundle.metadata.rowCount).toBe(1);
      expect(bundle.metadata.columnCount).toBe(2);
      expect(bundle.metadata.chatMessageCount).toBe(1);

      expect(bundle.pdfs[0].name).toBe('Paper_Alpha.pdf');
      expect(bundle.pdfs[0].base64).toMatch(/^data:application\/pdf;base64,/);
      expect(bundle.grid.rows[0].methodology).toBe('Randomized Double-Blind Trial');
    });
  });

  describe('4. Workspace Bundle Inspection & Validation', () => {
    it('inspects a valid .litsift file and extracts summary metrics without mutating state', async () => {
      const mockBundle: WorkspaceBundle = {
        format: 'litsift_workspace',
        version: '1.0',
        metadata: {
          workspaceName: 'Oncology_Review_2026',
          exportedAt: new Date().toISOString(),
          version: '1.0',
          paperCount: 2,
          rowCount: 5,
          columnCount: 4,
          chatMessageCount: 12,
        },
        pdfs: [
          { id: 'p1', name: 'Paper1.pdf', status: 'Extracted', uploadedAt: 1000, base64: 'data:application/pdf;base64,JVBERi0xLjQK' },
          { id: 'p2', name: 'Paper2.pdf', status: 'Ready', uploadedAt: 2000, base64: 'data:application/pdf;base64,JVBERi0xLjQK' },
        ],
        grid: {
          columns: [{ field: 'col1', headerName: 'Col 1' }],
          rows: [
            { id: 'r1', pdfId: 'p1', pdfTitle: 'Paper1.pdf', aiStatus: 'Confirmed' },
            { id: 'r2', pdfId: 'p2', pdfTitle: 'Paper2.pdf', aiStatus: 'Confirmed' },
          ],
        },
        chatMessages: [
          { id: 'm1', sender: 'agent', text: 'Hello', timestamp: '10:00' },
        ],
      };

      const mockFile = new File([JSON.stringify(mockBundle)], 'Oncology_Review_2026.litsift', {
        type: 'application/json',
      });

      const summary = await inspectWorkspaceFile(mockFile);

      expect(summary.workspaceName).toBe('Oncology_Review_2026');
      expect(summary.paperCount).toBe(2);
      expect(summary.rowCount).toBe(2);
      expect(summary.chatMessageCount).toBe(1);
      expect(summary.papers).toHaveLength(2);
      expect(summary.papers[0].name).toBe('Paper1.pdf');
    });

    it('throws a descriptive error when encountering an invalid or corrupted file', async () => {
      const corruptFile = new File(['Not valid JSON at all!'], 'corrupt.litsift', { type: 'application/json' });
      await expect(inspectWorkspaceFile(corruptFile)).rejects.toThrow(/not valid JSON/i);

      const wrongSchemaFile = new File([JSON.stringify({ someUnrelatedKey: 123 })], 'random.json', { type: 'application/json' });
      await expect(inspectWorkspaceFile(wrongSchemaFile)).rejects.toThrow(/Unrecognized format/i);
    });
  });

  describe('5. Workspace Restoration & Store Hydration', () => {
    it('restores bundle data into stores, reconstitutes blobs, and hydrates chat & table state', async () => {
      const samplePdfBase64 = 'data:application/pdf;base64,' + btoa('%PDF-1.4 Mock Paper Content');

      const bundleToRestore: WorkspaceBundle = {
        format: 'litsift_workspace',
        version: '1.0',
        metadata: {
          workspaceName: 'Genomics_Study',
          exportedAt: new Date().toISOString(),
          version: '1.0',
          paperCount: 1,
          rowCount: 1,
          columnCount: 2,
          chatMessageCount: 1,
          activePdfId: 'pdf-gen-1',
          agentMode: 'autonomous_autopilot',
        },
        pdfs: [
          {
            id: 'pdf-gen-1',
            name: 'Genomics_Paper_2026.pdf',
            status: 'Extracted',
            uploadedAt: Date.now(),
            base64: samplePdfBase64,
          },
        ],
        grid: {
          columns: [
            { field: 'pdfTitle', headerName: 'Paper Title' },
            { field: 'sampleSize', headerName: 'Sample Size' },
          ],
          rows: [
            {
              id: 'row-gen-1',
              pdfId: 'pdf-gen-1',
              pdfTitle: 'Genomics_Paper_2026.pdf',
              sampleSize: 'N=4,500 patients',
              aiStatus: 'Confirmed',
            },
          ],
        },
        chatMessages: [
          {
            id: 'msg-gen-1',
            pdfId: 'pdf-gen-1',
            sender: 'agent',
            text: 'Genomics extraction complete.',
            timestamp: '14:00',
          },
        ],
      };

      const progressUpdates: string[] = [];
      await restoreWorkspaceBundle(bundleToRestore, (status) => {
        progressUpdates.push(status);
      });

      expect(progressUpdates.length).toBeGreaterThan(0);

      // Verify Grid Store restoration
      const gridState = useGridStore.getState();
      expect(gridState.columns).toHaveLength(2);
      expect(gridState.rows).toHaveLength(1);
      expect(gridState.rows[0].sampleSize).toBe('N=4,500 patients');

      // Verify Agent Store restoration
      const agentState = useAgentStore.getState();
      expect(agentState.mode).toBe('autonomous_autopilot');

      // Verify Logs captured success entry
      const logState = useLogStore.getState();
      expect(logState.logs.some((l) => l.message.includes('Genomics_Study'))).toBe(true);
    });
  });
});
