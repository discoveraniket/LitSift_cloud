import { describe, it, expect } from 'vitest';
import { resolveEffectiveGroundingMode, buildPaperMarkdownContext, getGroundingPayloadDetails } from '../services/pdfUtils';
import { usePdfStore } from '../store/usePdfStore';

describe('Grounding Mode & Payload Visibility Suite', () => {
  const paperWithPdfAndText = {
    id: 'paper-1',
    name: 'FullPaper.pdf',
    title: 'Comprehensive Genomic Study',
    base64: 'JVBERi0xLjQK...',
    abstractText: 'This is the paper abstract summarizing key points.',
    sections: [
      { id: 's1', title: 'Methods', content: 'Methods description here.' },
      { id: 's2', title: 'Results', content: 'Results description here.' },
    ],
    tables: [
      { id: 't1', label: 'Table 1', caption: 'Summary table', headers: ['A', 'B'], rows: [['1', '2']] },
    ],
  };

  const paperWithTextOnly = {
    id: 'paper-2',
    name: 'doi-paper',
    title: 'Text Only Article',
    abstractText: 'Abstract for text-only article.',
    sections: [
      { id: 's1', title: 'Introduction', content: 'Background details.' },
    ],
  };

  const paperWithAbstractOnly = {
    id: 'paper-3',
    name: 'abstract-only',
    title: 'Abstract Only Article',
    abstractText: 'Abstract summary without full body text.',
  };

  const emptyPaper = {
    id: 'paper-4',
    name: 'Empty Paper',
    title: 'Empty Paper',
  };

  describe('resolveEffectiveGroundingMode', () => {
    it('resolves auto mode based on asset precedence: PDF > Structured Text > Abstract Only > None', () => {
      expect(resolveEffectiveGroundingMode(paperWithPdfAndText)).toBe('pdf');
      expect(resolveEffectiveGroundingMode(paperWithTextOnly)).toBe('structured_text');
      expect(resolveEffectiveGroundingMode(paperWithAbstractOnly)).toBe('abstract_only');
      expect(resolveEffectiveGroundingMode(emptyPaper)).toBe('none');
      expect(resolveEffectiveGroundingMode(null)).toBe('none');
    });

    it('honors explicit user grounding preferences', () => {
      // User forces structured_text on a paper that has a PDF
      expect(
        resolveEffectiveGroundingMode({ ...paperWithPdfAndText, groundingMode: 'structured_text' })
      ).toBe('structured_text');

      // User forces abstract_only on a paper that has a PDF & sections
      expect(
        resolveEffectiveGroundingMode({ ...paperWithPdfAndText, groundingMode: 'abstract_only' })
      ).toBe('abstract_only');

      // User detaches/excludes the document from context
      expect(
        resolveEffectiveGroundingMode({ ...paperWithPdfAndText, groundingMode: 'none' })
      ).toBe('none');

      // User explicitly requests PDF on a text-only paper (falls back to structured_text)
      expect(
        resolveEffectiveGroundingMode({ ...paperWithTextOnly, groundingMode: 'pdf' })
      ).toBe('structured_text');
    });
  });

  describe('buildPaperMarkdownContext with abstractOnly option', () => {
    it('returns only header and abstract when abstractOnly is true', () => {
      const abstractMarkdown = buildPaperMarkdownContext(paperWithPdfAndText, { abstractOnly: true });
      expect(abstractMarkdown).toContain('# Comprehensive Genomic Study');
      expect(abstractMarkdown).toContain('## Abstract\nThis is the paper abstract summarizing key points.');
      expect(abstractMarkdown).not.toContain('## Methods');
      expect(abstractMarkdown).not.toContain('## Extracted Tables');
      expect(abstractMarkdown).toContain('Abstract-only context mode selected');
    });

    it('returns full sections and tables when abstractOnly is false', () => {
      const fullMarkdown = buildPaperMarkdownContext(paperWithPdfAndText, { abstractOnly: false });
      expect(fullMarkdown).toContain('# Comprehensive Genomic Study');
      expect(fullMarkdown).toContain('## Abstract');
      expect(fullMarkdown).toContain('## Methods');
      expect(fullMarkdown).toContain('## Extracted Tables');
    });
  });

  describe('getGroundingPayloadDetails', () => {
    it('provides correct payload details for PDF mode', () => {
      const details = getGroundingPayloadDetails(paperWithPdfAndText);
      expect(details.effectiveMode).toBe('pdf');
      expect(details.modeLabel).toBe('PDF Multimodal (Binary)');
      expect(details.sizeEstimate).toContain('PDF');
      expect(details.previewContent).toContain('[MULTIMODAL PDF BINARY ATTACHMENT]');
    });

    it('provides correct payload details for Abstract-Only mode', () => {
      const details = getGroundingPayloadDetails({ ...paperWithPdfAndText, groundingMode: 'abstract_only' });
      expect(details.effectiveMode).toBe('abstract_only');
      expect(details.modeLabel).toBe('Abstract-Only Text');
      expect(details.sizeEstimate).toContain('tokens');
      expect(details.previewContent).toContain('## Abstract');
      expect(details.previewContent).not.toContain('## Methods');
    });

    it('provides correct payload details for None / Detached mode', () => {
      const details = getGroundingPayloadDetails({ ...paperWithPdfAndText, groundingMode: 'none' });
      expect(details.effectiveMode).toBe('none');
      expect(details.modeLabel).toBe('Detached (No Document Context)');
      expect(details.sizeEstimate).toContain('0 tokens');
      expect(details.previewContent).toContain('[EXCLUDED FROM PROMPT CONTEXT]');
    });
  });

  describe('usePdfStore setPaperGroundingMode', () => {
    it('updates paper groundingMode in the store', async () => {
      const store = usePdfStore.getState();
      const mockPaper = {
        id: 'store-paper-test',
        name: 'test.pdf',
        title: 'Store Test Paper',
        oaStatus: 'unknown' as const,
        sourceType: 'pdf_upload' as const,
        uploadedAt: Date.now(),
        status: 'Ready' as const,
      };

      await store.addPaperDocument(mockPaper);
      expect(usePdfStore.getState().getPdf('store-paper-test')?.groundingMode).toBe('auto');

      await store.setPaperGroundingMode('store-paper-test', 'abstract_only');
      expect(usePdfStore.getState().getPdf('store-paper-test')?.groundingMode).toBe('abstract_only');
    });
  });
});
