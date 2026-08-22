import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeSearchText,
  normalizeDehyphenatedText,
  highlightPdfSnippet,
  highlightArticleSnippet,
  clearActiveHighlights,
  flashActiveHighlights,
} from '../services/highlightUtils';

describe('Document Highlighting Service (highlightUtils)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('1. Text Normalization & De-hyphenation', () => {
    it('normalizes smart quotes, dashes, and consecutive whitespace', () => {
      const input = '“Bacteriophage”   therapy—effective against   ‘E. coli’.';
      const output = normalizeSearchText(input);
      expect(output).toBe('bacteriophage therapy-effective against e coli');
    });

    it('de-hyphenates line breaks from PDF extracts to match clean text', () => {
      const pdfExtract = 'The broad- spectrum lytic phage concen- tration reached 10^8 PFU/mL.';
      const output = normalizeDehyphenatedText(pdfExtract);
      expect(output).toBe('the broadspectrum lytic phage concentration reached 10^8 pfu/ml');
    });

    it('handles empty or undefined strings safely', () => {
      expect(normalizeSearchText('')).toBe('');
      expect(normalizeSearchText(null as any)).toBe('');
      expect(normalizeDehyphenatedText('')).toBe('');
    });
  });

  describe('2. PDF Search Algorithm (highlightPdfSnippet)', () => {
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
      const matchedEl = highlightPdfSnippet(container, snippet);

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
      const matchedEl = highlightPdfSnippet(container, snippet);

      expect(matchedEl).not.toBeNull();
      expect(matchedEl?.textContent).toContain('burst size');
    });

    it('returns null gracefully when no text matches in PDF layer', () => {
      container.innerHTML = `
        <div class="pdf-page-wrapper" data-page-number="1">
          <div class="pdf-text-layer">
            <span class="pdf-text-item">Unrelated content.</span>
          </div>
        </div>
      `;
      const matchedEl = highlightPdfSnippet(container, 'Nonexistent query snippet');
      expect(matchedEl).toBeNull();
    });
  });

  describe('3. Redesigned Text Search Algorithm (highlightArticleSnippet)', () => {
    it('highlights matching sentence inside HTML article paragraphs without highlighting the entire paragraph', () => {
      container.innerHTML = `
        <article class="article-reader-body">
          <h2>Results</h2>
          <p class="section-paragraph">PHASTEST annotated the predicted phage regions. The GC content ranged from 43.68% to 43.76%. The predicted number of CDS ranged from 200 to 212.</p>
        </article>
      `;

      const snippet = 'The GC content ranged from 43.68% to 43.76%.';
      const matchedEl = highlightArticleSnippet(container, snippet);

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

    it('SECTION-FIRST SCOPING: selects 2nd occurrence in Results section when duplicate text exists in Abstract', () => {
      container.innerHTML = `
        <article class="article-reader-body">
          <section id="sec-abstract">
            <h2>Abstract</h2>
            <p class="abstract-text">The overall recovery rate was 88.5% in the preliminary screening.</p>
          </section>
          
          <section id="sec-intro">
            <h2>Introduction</h2>
            <p>Background information on phage recovery protocols.</p>
          </section>

          <section id="sec-results">
            <h2>Results and Discussion</h2>
            <p class="results-p">In experimental trials, the overall recovery rate was 88.5% across all tested replicates.</p>
          </section>
        </article>
      `;

      const snippet = 'The overall recovery rate was 88.5%';
      
      // When searching with sectionName: "Results", it MUST match the 2nd occurrence in #sec-results
      const matchedEl = highlightArticleSnippet(container, snippet, {
        sectionName: 'Results and Discussion',
      });

      expect(matchedEl).not.toBeNull();
      
      // Verify that the matched element is inside #sec-results, NOT inside #sec-abstract!
      const parentSection = matchedEl?.closest('section');
      expect(parentSection?.id).toBe('sec-results');
      expect(parentSection?.id).not.toBe('sec-abstract');
    });

    it('MULTI-MATCH DISAMBIGUATION: ranks section relevance score when same text appears multiple times', () => {
      container.innerHTML = `
        <article class="article-reader-body">
          <section id="sec-1">
            <h2>Abstract</h2>
            <p>Sample yield: 94.2%.</p>
          </section>
          <section id="sec-2">
            <h2>Methodology</h2>
            <p>Yield estimation standard operating procedure.</p>
          </section>
          <section id="sec-3">
            <h2>3.2 Experimental Findings</h2>
            <p>Under optimal temperature, sample yield: 94.2% was recorded consistently.</p>
          </section>
        </article>
      `;

      const snippet = 'sample yield: 94.2%';
      const matchedEl = highlightArticleSnippet(container, snippet, {
        sectionName: 'Experimental Findings',
      });

      expect(matchedEl).not.toBeNull();
      const parentSection = matchedEl?.closest('section');
      expect(parentSection?.id).toBe('sec-3');
    });

    it('DE-HYPHENATION BRIDGING: matches PDF quote with line hyphens to clean HTML text', () => {
      container.innerHTML = `
        <article class="article-reader-body">
          <section id="sec-results">
            <h2>Results</h2>
            <p>Transmission electron microscopy confirmed the morphological classification.</p>
          </section>
        </article>
      `;

      // PDF quote had line-break hyphen "morpho- logical"
      const pdfQuote = 'Transmission electron microscopy confirmed the morpho- logical classification.';
      const matchedEl = highlightArticleSnippet(container, pdfQuote, {
        sectionName: 'Results',
      });

      expect(matchedEl).not.toBeNull();
      expect(matchedEl?.classList.contains('evidence-highlight-active')).toBe(true);
    });

    it('gently glows exact keyword/cell value inside the highlighted sentence', () => {
      container.innerHTML = `
        <article>
          <section id="sec-data">
            <h2>Data</h2>
            <p>The complete genome sequence was deposited under BioProject PRJNA1256089 in NCBI.</p>
          </section>
        </article>
      `;

      const snippet = 'The complete genome sequence was deposited under BioProject PRJNA1256089 in NCBI.';
      const keyword = 'PRJNA1256089';

      const matchedEl = highlightArticleSnippet(container, snippet, { keyword });

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

      const matchedEl = highlightArticleSnippet(container, snippet, { keyword });

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
      const matchedEl = highlightArticleSnippet(container, snippet);

      expect(matchedEl).not.toBeNull();
      expect(matchedEl?.tagName.toLowerCase()).toBe('mark');
      expect(matchedEl?.classList.contains('evidence-highlight-active')).toBe(true);

      const parentP = container.querySelector('p')!;
      expect(parentP.classList.contains('evidence-highlight-active')).toBe(false);
    });

    it('returns null gracefully when no text matches', () => {
      container.innerHTML = `
        <p>Unrelated topic discussing cosmic radiation in astrophysics.</p>
      `;

      const snippet = 'CRISPR Cas9 off-target cleavage assay';
      const matchedEl = highlightArticleSnippet(container, snippet);

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
});
