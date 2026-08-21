import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeSearchText,
  highlightSnippetInContainer,
  clearActiveHighlights,
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

      // Verify that clearActiveHighlights removes all classes
      clearActiveHighlights(container);
      expect(container.querySelectorAll('.evidence-highlight-active').length).toBe(0);
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
});
