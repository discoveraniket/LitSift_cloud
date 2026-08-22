import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeSearchText,
  highlightSnippetInContainer,
  clearActiveHighlights,
  flashActiveHighlights,
} from '../services/highlightUtils';

describe('Document Highlighting Service (highlightUtils)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('1. normalizeSearchText', () => {
    it('normalizes smart quotes, dashes, and consecutive whitespace', () => {
      const input = '“Bacteriophage”   therapy—effective against   ‘E. coli’.';
      const output = normalizeSearchText(input);
      expect(output).toBe('bacteriophage therapy-effective against e coli');
    });

    it('handles empty or undefined strings safely', () => {
      expect(normalizeSearchText('')).toBe('');
      expect(normalizeSearchText(null as any)).toBe('');
    });
  });

  describe('2. PDF Multi-Span Matching (.pdf-text-item)', () => {
    it('accurately highlights across multiple split spans in PDF text layer', () => {
      container.innerHTML = `
        <div class="pdf-page-wrapper" data-page-number="2">
          <div class="pdf-text-layer">
            <span class="pdf-text-item">Five lytic bacteriophages</span>
            <span class="pdf-text-item">were isolated from poultry fecal samples</span>
            <span class="pdf-text-item">and characterized thoroughly.</span>
          </div>
        </div>
      `;

      const snippet = 'Five lytic bacteriophages were isolated from poultry fecal samples';
      const matchedEl = highlightSnippetInContainer(container, snippet);

      expect(matchedEl).not.toBeNull();

      const highlightedSpans = container.querySelectorAll('.evidence-highlight-active');
      expect(highlightedSpans.length).toBeGreaterThanOrEqual(1);

      // Verify flash class is applied to attract user attention
      const flashedSpans = container.querySelectorAll('.evidence-highlight-flash');
      expect(flashedSpans.length).toBeGreaterThanOrEqual(1);

      // Verify that clearActiveHighlights removes all highlight and flash classes
      clearActiveHighlights(container);
      expect(container.querySelectorAll('.evidence-highlight-active').length).toBe(0);
      expect(container.querySelectorAll('.evidence-highlight-flash').length).toBe(0);
    });

    it('matches with partial fuzzy fallback when snippet contains smart quotes or minor variations', () => {
      container.innerHTML = `
        <div class="pdf-page-wrapper" data-page-number="3">
          <div class="pdf-text-layer">
            <span class="pdf-text-item">The burst size was calculated</span>
            <span class="pdf-text-item">to be 150 virions per infected cell.</span>
          </div>
        </div>
      `;

      const snippet = '“The burst size was calculated to be 150 virions”';
      const matchedEl = highlightSnippetInContainer(container, snippet);

      expect(matchedEl).not.toBeNull();
      expect(matchedEl?.textContent).toContain('burst size');
    });
  });

  describe('3. Article Reader HTML Matching (<p>, <td>)', () => {
    it('highlights matching sentence inside HTML article paragraphs without highlighting the entire paragraph', () => {
      container.innerHTML = `
        <article class="article-reader-body">
          <h2>Results</h2>
          <p class="section-paragraph">PHASTEST annotated the predicted phage regions. The GC content ranged from 43.68% to 43.76%. The predicted number of CDS ranged from 200 to 212.</p>
        </article>
      `;

      const snippet = 'The GC content ranged from 43.68% to 43.76%.';
      const matchedEl = highlightSnippetInContainer(container, snippet);

      expect(matchedEl).not.toBeNull();
      expect(matchedEl?.tagName.toLowerCase()).toBe('mark');
      expect(matchedEl?.classList.contains('evidence-highlight-active')).toBe(true);
      expect(matchedEl?.classList.contains('evidence-highlight-flash')).toBe(true);
      expect(matchedEl?.textContent).toBe('The GC content ranged from 43.68% to 43.76%.');

      // Verify the parent paragraph is NOT given the highlight class directly
      const pEl = container.querySelector('.section-paragraph');
      expect(pEl?.classList.contains('evidence-highlight-active')).toBe(false);

      // Verify clean unwrapping
      clearActiveHighlights(container);
      expect(container.querySelectorAll('mark').length).toBe(0);
      expect(pEl?.textContent).toContain('PHASTEST annotated');
    });

    it('returns null gracefully when no text matches', () => {
      container.innerHTML = `
        <p>Unrelated topic discussing cosmic radiation in astrophysics.</p>
      `;

      const snippet = 'CRISPR Cas9 off-target cleavage assay';
      const matchedEl = highlightSnippetInContainer(container, snippet);

      expect(matchedEl).toBeNull();
      expect(container.querySelectorAll('.evidence-highlight-active').length).toBe(0);
    });
  });

  describe('4. Gentle Flash Attention Trigger (flashActiveHighlights)', () => {
    it('re-triggers the gentle flash class on existing active highlights when clicked repeatedly', () => {
      container.innerHTML = `
        <article>
          <mark class="evidence-highlight-active evidence-mark-inline">Sample highlighted sentence.</mark>
        </article>
      `;

      const mark = container.querySelector('mark')!;
      expect(mark.classList.contains('evidence-highlight-flash')).toBe(false);

      flashActiveHighlights(container);

      expect(mark.classList.contains('evidence-highlight-flash')).toBe(true);

      // Triggering flash again reliably maintains/re-applies the flash class
      flashActiveHighlights(container);
      expect(mark.classList.contains('evidence-highlight-flash')).toBe(true);
    });
  });

  describe('5. Keyword Glow Enhancement & Fallback', () => {
    it('gently glows exact keyword/cell value inside the highlighted sentence', () => {
      container.innerHTML = `
        <article>
          <p>The complete genome sequence was deposited under BioProject PRJNA1256089 in NCBI.</p>
        </article>
      `;

      const snippet = 'The complete genome sequence was deposited under BioProject PRJNA1256089 in NCBI.';
      const keyword = 'PRJNA1256089';

      const matchedEl = highlightSnippetInContainer(container, snippet, keyword);

      expect(matchedEl).not.toBeNull();
      const keywordMark = container.querySelector('mark.evidence-keyword-glow');
      expect(keywordMark).not.toBeNull();
      expect(keywordMark?.textContent).toBe('PRJNA1256089');

      // Verify clean unwrapping
      clearActiveHighlights(container);
      expect(container.querySelectorAll('mark.evidence-keyword-glow').length).toBe(0);
    });

    it('falls back gracefully to line highlight when keyword does not match exactly inside snippet', () => {
      container.innerHTML = `
        <article>
          <p>The GC content ranged from 43.68% to 43.76% across samples.</p>
        </article>
      `;

      const snippet = 'The GC content ranged from 43.68% to 43.76% across samples.';
      const keyword = 'UnrelatedNonMatchingValue';

      const matchedEl = highlightSnippetInContainer(container, snippet, keyword);

      expect(matchedEl).not.toBeNull();
      expect(container.querySelectorAll('.evidence-highlight-active').length).toBeGreaterThanOrEqual(1);
      expect(container.querySelectorAll('mark.evidence-keyword-glow').length).toBe(0);
    });

    it('accurately wraps sentences spanning across inline tags without turning the entire paragraph into a block', () => {
      container.innerHTML = `
        <article>
          <p>The phage was isolated from wastewater <a href="#">(see Table S1)</a>. Transmission electron microscopy confirmed the <strong>Myoviruses morphology</strong> with distinct tail lengths.</p>
        </article>
      `;

      const snippet = 'Transmission electron microscopy confirmed the Myoviruses morphology with distinct tail lengths.';
      const matchedEl = highlightSnippetInContainer(container, snippet);

      expect(matchedEl).not.toBeNull();
      expect(matchedEl?.tagName.toLowerCase()).toBe('mark');
      expect(matchedEl?.classList.contains('evidence-highlight-active')).toBe(true);

      // Verify that the parent <p> did not receive the evidence-highlight-active block class
      const parentP = container.querySelector('p')!;
      expect(parentP.classList.contains('evidence-highlight-active')).toBe(false);
    });

    it('matches paraphrased quotes using sliding n-gram windows and keyword fallback', () => {
      container.innerHTML = `
        <article>
          <p>Phages were classified as Escherichia phage vB_EcoM_fRPOT1 with genome sizes from 170 to 356 kb.</p>
        </article>
      `;

      // Paraphrased quote starting with slightly different words
      const snippet = 'The authors reported that phages were classified as Escherichia phage vB_EcoM_fRPOT1.';
      const keyword = 'vB_EcoM_fRPOT1';

      const matchedEl = highlightSnippetInContainer(container, snippet, keyword);

      expect(matchedEl).not.toBeNull();
      expect(container.querySelectorAll('.evidence-highlight-active').length).toBeGreaterThanOrEqual(1);
      expect(container.textContent).toContain('vB_EcoM_fRPOT1');
    });
  });
});
