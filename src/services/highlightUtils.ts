/**
 * Highlight and In-Document Evidence Grounding Utilities
 * 
 * Provides dedicated utilities for locating verbatim sentence citations and cell values
 * across PDF.js multi-span text layers (PDF View) and structured semantic HTML Article Reader views (Text View).
 */

export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B']/g, '')
    .replace(/[\u201C\u201D\u201E\u201F"]/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[.,;:!?()[\]{}]/g, ' ')
    .replace(/[\s\n\r\t]+/g, ' ')
    .trim();
}

/**
 * Normalizes text with line-break de-hyphenation (e.g., "concen- tration" -> "concentration")
 * to seamlessly bridge quotes extracted from PDF layouts to clean HTML paragraphs.
 */
export function normalizeDehyphenatedText(text: string): string {
  if (!text) return '';
  const dehyphenated = text.replace(/(\w+)-\s+(\w+)/g, '$1$2');
  return normalizeSearchText(dehyphenated);
}

/**
 * Clears all active evidence highlights from the given container.
 */
export function clearActiveHighlights(container: HTMLElement | null | undefined): void {
  if (!container) return;

  // 1. Remove highlight, flash, and keyword glow classes from spans and elements
  const highlightedEls = container.querySelectorAll(
    '.evidence-highlight-active, .evidence-highlight-flash, .evidence-keyword-glow'
  );
  highlightedEls.forEach((el) => {
    el.classList.remove('evidence-highlight-active');
    el.classList.remove('evidence-highlight-flash');
    el.classList.remove('evidence-keyword-glow');
    (el as HTMLElement).style.removeProperty('background');
    (el as HTMLElement).style.removeProperty('color');
    (el as HTMLElement).style.removeProperty('border-bottom');
    (el as HTMLElement).style.removeProperty('box-shadow');
    (el as HTMLElement).style.removeProperty('border-radius');
  });

  // 2. Unwrap any dynamically injected mark wrappers
  const inlineMarks = container.querySelectorAll('mark.evidence-mark-inline, mark.evidence-keyword-glow');
  inlineMarks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize();
    }
  });
}

/**
 * Triggers a gentle flash pulse animation on all active evidence highlights.
 */
export function flashActiveHighlights(container: HTMLElement | null | undefined): void {
  if (!container) return;

  const highlightedEls = container.querySelectorAll<HTMLElement>('.evidence-highlight-active');
  highlightedEls.forEach((el) => {
    el.classList.remove('evidence-highlight-flash');
    void el.offsetWidth;
    el.classList.add('evidence-highlight-flash');
  });
}

/**
 * Injects gentle keyword glow inside a matched sentence element or mark.
 */
function applyKeywordGlow(matchedElement: HTMLElement, keyword: string): void {
  if (!matchedElement || !keyword) return;
  const cleanKw = keyword.trim();
  if (cleanKw.length < 2) return;
  const lowerKw = cleanKw.toLowerCase();

  if ((matchedElement.textContent || '').trim().toLowerCase() === lowerKw) {
    matchedElement.classList.add('evidence-keyword-glow');
    return;
  }

  const walker = document.createTreeWalker(matchedElement, NodeFilter.SHOW_TEXT);
  let textNode: Text | null = null;

  while ((textNode = walker.nextNode() as Text | null)) {
    if (textNode.parentElement?.classList.contains('evidence-keyword-glow')) continue;

    const val = textNode.nodeValue || '';
    const lowerVal = val.toLowerCase();
    const idx = lowerVal.indexOf(lowerKw);

    if (idx !== -1) {
      const parent = textNode.parentNode;
      if (!parent) continue;

      const before = val.substring(0, idx);
      const matched = val.substring(idx, idx + cleanKw.length);
      const after = val.substring(idx + cleanKw.length);

      textNode.nodeValue = before;

      const mark = document.createElement('mark');
      mark.className = 'evidence-keyword-glow';
      mark.textContent = matched;

      const afterNode = document.createTextNode(after);

      parent.insertBefore(mark, textNode.nextSibling);
      parent.insertBefore(afterNode, mark.nextSibling);
      return;
    }
  }
}

// ============================================================================
// 1. PDF SEARCH ALGORITHM (Preserved for PDF.js multi-span text layers)
// ============================================================================

/**
 * Highlights a verbatim sentence or snippet inside a PDF.js text layer container (.pdf-page-wrapper).
 * Operates across continuous multi-span text layers with character-ratio index mapping.
 * 
 * @param container The PDF page wrapper DOM element (.pdf-page-wrapper)
 * @param snippet The exact or partial sentence snippet quote to locate
 * @param keyword Optional exact cell value / keyword to gently glow inside the sentence
 * @returns The primary matched DOM element (for smooth centering), or null if not found
 */
export function highlightPdfSnippet(
  container: HTMLElement | null | undefined,
  snippet: string,
  keyword?: string
): HTMLElement | null {
  if (!container || !snippet) return null;

  clearActiveHighlights(container);

  const cleanSnippet = normalizeSearchText(snippet);
  if (!cleanSnippet || cleanSnippet.length < 3) return null;

  const pdfSpans = Array.from(container.querySelectorAll<HTMLElement>('.pdf-text-item'));
  if (pdfSpans.length === 0) return null;

  // Build continuous stream of text and index mapping back to spans
  let fullPageText = '';
  const spanMap: Array<{ start: number; end: number; element: HTMLElement; text: string }> = [];

  for (const span of pdfSpans) {
    const rawSpanText = span.textContent || '';
    if (!rawSpanText) continue;

    const start = fullPageText.length;
    fullPageText += rawSpanText + ' ';
    const end = fullPageText.length;

    spanMap.push({ start, end, element: span, text: rawSpanText });
  }

  const normPageText = normalizeSearchText(fullPageText);

  // 1A. Exact full snippet match
  let matchIdx = normPageText.indexOf(cleanSnippet);

  // 1B. Fuzzy fallback: match significant search window (first 6-10 words)
  if (matchIdx === -1) {
    const words = cleanSnippet.split(' ').filter((w) => w.length > 2);
    if (words.length >= 3) {
      const partialQuery = words.slice(0, Math.min(6, words.length)).join(' ');
      matchIdx = normPageText.indexOf(partialQuery);
    }
  }

  // 1C. Keyword fallback: match the longest 2-3 distinctive words
  if (matchIdx === -1) {
    const longWords = cleanSnippet.split(' ').filter((w) => w.length >= 5);
    if (longWords.length >= 2) {
      const keywordQuery = longWords.slice(0, 3).join(' ');
      matchIdx = normPageText.indexOf(keywordQuery);
    }
  }

  if (matchIdx !== -1) {
    // Find all spans overlapping with the matched index range
    const queryLen = cleanSnippet.length;
    const matchEnd = matchIdx + queryLen;

    const charRatio = fullPageText.length > 0 ? fullPageText.length / Math.max(normPageText.length, 1) : 1;
    const rawStart = Math.floor(matchIdx * charRatio);
    const rawEnd = Math.ceil(matchEnd * charRatio);

    const matchedSpans: HTMLElement[] = [];

    for (const mapItem of spanMap) {
      if (mapItem.end >= rawStart && mapItem.start <= rawEnd) {
        mapItem.element.classList.add('evidence-highlight-active');
        matchedSpans.push(mapItem.element);
      }
    }

    if (matchedSpans.length > 0) {
      if (keyword && keyword.trim().length >= 2) {
        const lowerKw = keyword.trim().toLowerCase();
        for (const span of matchedSpans) {
          if ((span.textContent || '').toLowerCase().includes(lowerKw)) {
            span.classList.add('evidence-keyword-glow');
          }
        }
      }
      flashActiveHighlights(container);
      return matchedSpans[0];
    }
  }

  return null;
}

// ============================================================================
// 2. REDESIGNED TEXT SEARCH ALGORITHM (For HTML Article Reader Views)
// ============================================================================

export interface HighlightArticleOptions {
  keyword?: string;
  sectionName?: string;
  paragraphNumber?: string;
}

/**
 * Checks if an element belongs to a target section or is preceded by a matching heading.
 */
function calculateSectionRelevance(el: HTMLElement, targetSectionName?: string): number {
  if (!targetSectionName || !targetSectionName.trim()) return 0;

  const cleanTarget = targetSectionName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanTarget) return 0;

  // 1. Check direct parent section element (e.g., <section id="sec-results"> or <section id="sec-abstract">)
  const parentSection = el.closest('section');
  if (parentSection) {
    const secId = (parentSection.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (secId && (secId.includes(cleanTarget) || cleanTarget.includes(secId))) {
      return 150;
    }

    const secHeading = parentSection.querySelector('h1, h2, h3, h4')?.textContent?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
    if (secHeading && (secHeading.includes(cleanTarget) || cleanTarget.includes(secHeading))) {
      return 150;
    }
  }

  // 2. Check preceding heading in document order
  let prev = el.previousElementSibling;
  while (prev) {
    if (/^H[1-4]$/i.test(prev.tagName)) {
      const headingText = (prev.textContent || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (headingText && (headingText.includes(cleanTarget) || cleanTarget.includes(headingText))) {
        return 120;
      }
      break;
    }
    prev = prev.previousElementSibling;
  }

  return 0;
}

/**
 * Highlights a verbatim sentence or snippet inside the HTML Article Reader DOM.
 * Features Section-First Scoped Matching, Multi-Match Disambiguation, De-hyphenation,
 * and robust keyword glowing.
 * 
 * @param container The Article Reader root container DOM element
 * @param snippet The exact or partial sentence snippet quote to locate
 * @param options Optional sectionName, keyword, and paragraphNumber for disambiguation
 * @returns The primary matched DOM element (for smooth centering), or null if not found
 */
export function highlightArticleSnippet(
  container: HTMLElement | null | undefined,
  snippet: string,
  options?: HighlightArticleOptions
): HTMLElement | null {
  if (!container || !snippet) return null;

  clearActiveHighlights(container);

  const cleanSnippet = normalizeSearchText(snippet);
  const dehyphenatedSnippet = normalizeDehyphenatedText(snippet);
  if (!cleanSnippet || cleanSnippet.length < 2) return null;

  const keyword = options?.keyword?.trim();
  const sectionName = options?.sectionName?.trim();

  // --------------------------------------------------------------------------
  // STEP 1: SECTION-FIRST SCOPED MATCHING
  // If sectionName is provided, search inside matching <section> containers first
  // --------------------------------------------------------------------------
  if (sectionName) {
    const cleanTargetSec = sectionName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const allSections = Array.from(container.querySelectorAll<HTMLElement>('section'));

    const matchingSections = allSections.filter((sec) => {
      const secId = (sec.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const secHeading = sec.querySelector('h1, h2, h3, h4')?.textContent?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      return (
        (secId && (secId.includes(cleanTargetSec) || cleanTargetSec.includes(secId))) ||
        (secHeading && (secHeading.includes(cleanTargetSec) || cleanTargetSec.includes(secHeading)))
      );
    });

    for (const secEl of matchingSections) {
      const scopedCandidates = Array.from(
        secEl.querySelectorAll<HTMLElement>('p, td, li, h2, h3, h4, .section-paragraph, .abstract-text')
      );

      for (const el of scopedCandidates) {
        const rawText = el.textContent || '';
        const normEl = normalizeSearchText(rawText);
        const normElDehyphen = normalizeDehyphenatedText(rawText);

        if (
          normEl.includes(cleanSnippet) ||
          normEl.includes(dehyphenatedSnippet) ||
          normElDehyphen.includes(cleanSnippet) ||
          normElDehyphen.includes(dehyphenatedSnippet)
        ) {
          const markedEl = highlightExactSnippetInHtmlElement(el, snippet, cleanSnippet);
          if (markedEl) {
            if (keyword && keyword.length >= 2) applyKeywordGlow(markedEl, keyword);
            flashActiveHighlights(container);
            return markedEl;
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // STEP 2: MULTI-MATCH RANKING & DISAMBIGUATION ACROSS THE ENTIRE ARTICLE
  // When identical or similar phrases exist across multiple sections (e.g. Abstract & Results),
  // collect all matches and score them by section alignment so the intended occurrence is chosen.
  // --------------------------------------------------------------------------
  const allCandidates = Array.from(
    container.querySelectorAll<HTMLElement>('p, td, li, h2, h3, h4, .section-paragraph, .abstract-text')
  );

  interface ScoredCandidate {
    element: HTMLElement;
    score: number;
    isExact: boolean;
  }

  const scoredMatches: ScoredCandidate[] = [];

  for (const el of allCandidates) {
    const rawText = el.textContent || '';
    const normEl = normalizeSearchText(rawText);
    const normElDehyphen = normalizeDehyphenatedText(rawText);
    if (!normEl) continue;

    const isExact =
      normEl.includes(cleanSnippet) ||
      normEl.includes(dehyphenatedSnippet) ||
      normElDehyphen.includes(cleanSnippet) ||
      normElDehyphen.includes(dehyphenatedSnippet);

    let matchScore = 0;

    if (isExact) {
      matchScore = 100;
    } else {
      // Fuzzy n-gram token overlap fallback
      const searchTokens = cleanSnippet.split(' ').filter((w) => w.length > 3);
      if (searchTokens.length >= 2) {
        let matchedTokenCount = 0;
        for (const token of searchTokens) {
          if (normEl.includes(token) || normElDehyphen.includes(token)) {
            matchedTokenCount++;
          }
        }
        const ratio = matchedTokenCount / searchTokens.length;
        if (ratio >= 0.6) {
          matchScore = Math.round(ratio * 70);
        }
      }
    }

    // Keyword fallback when snippet is short or paraphased
    if (matchScore === 0 && keyword && keyword.length >= 3) {
      const lowerKw = keyword.toLowerCase();
      if (rawText.toLowerCase().includes(lowerKw)) {
        matchScore = 40;
      }
    }

    if (matchScore > 0) {
      // Add section relevance bonus (e.g. +150 if inside matching Results section)
      const secBonus = calculateSectionRelevance(el, sectionName);
      matchScore += secBonus;

      scoredMatches.push({
        element: el,
        score: matchScore,
        isExact,
      });
    }
  }

  // Sort candidates by total score descending (highest score first)
  scoredMatches.sort((a, b) => b.score - a.score);

  if (scoredMatches.length > 0) {
    const bestCandidate = scoredMatches[0].element;
    const markedEl = highlightExactSnippetInHtmlElement(bestCandidate, snippet, cleanSnippet);

    if (markedEl) {
      if (keyword && keyword.length >= 2) applyKeywordGlow(markedEl, keyword);
      flashActiveHighlights(container);
      return markedEl;
    }

    // Direct element fallback if inline mark injection was obstructed
    bestCandidate.classList.add('evidence-highlight-active');
    if (keyword && keyword.length >= 2) applyKeywordGlow(bestCandidate, keyword);
    flashActiveHighlights(container);
    return bestCandidate;
  }

  return null;
}

/**
 * Helper to inject inline <mark> around the exact matching phrase inside an HTML element.
 */
function highlightExactSnippetInHtmlElement(
  el: HTMLElement,
  rawSnippet: string,
  cleanSnippet: string
): HTMLElement | null {
  const rawText = el.textContent || '';
  if (!rawText || !cleanSnippet) return null;

  const lowerRaw = rawText.toLowerCase();
  const trimmedSnippet = rawSnippet ? rawSnippet.trim().toLowerCase() : '';

  let matchStart = -1;
  let matchEnd = -1;

  // 1. Direct exact substring match
  if (trimmedSnippet && lowerRaw.includes(trimmedSnippet)) {
    matchStart = lowerRaw.indexOf(trimmedSnippet);
    matchEnd = matchStart + trimmedSnippet.length;
  }

  // 2. Multi-word start anchor (2-3 words, e.g. "the gc content" or "gc content")
  if (matchStart === -1) {
    const words = cleanSnippet.split(' ').filter((w) => w.length > 0);
    if (words.length === 0) return null;

    const startPhrases = [
      words.slice(0, Math.min(3, words.length)).join(' '),
      words.slice(0, Math.min(2, words.length)).join(' '),
      words.length > 2 ? words.slice(1, 3).join(' ') : '',
    ].filter((p) => p.length > 2);

    for (const phrase of startPhrases) {
      const phrasePattern = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s.,:;%\\-]*');
      const regex = new RegExp(phrasePattern, 'i');
      const match = regex.exec(rawText);
      if (match && match.index !== undefined) {
        matchStart = match.index;
        if (phrase !== startPhrases[0] && words[0].length <= 3) {
          const prevText = rawText.slice(Math.max(0, matchStart - words[0].length - 2), matchStart);
          if (prevText.toLowerCase().includes(words[0])) {
            matchStart = rawText.toLowerCase().lastIndexOf(words[0], matchStart);
          }
        }
        break;
      }
    }

    // Fallback: match by the longest distinctive word
    if (matchStart === -1 && words.length > 0) {
      const sortedWords = [...words].sort((a, b) => b.length - a.length);
      const longestWord = sortedWords[0];
      if (longestWord.length >= 4) {
        const idx = lowerRaw.indexOf(longestWord);
        if (idx !== -1) matchStart = idx;
      }
    }

    if (matchStart !== -1) {
      const endWords = words.slice(Math.max(0, words.length - 2)).join(' ');
      const endPattern = endWords.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s.,:;%\\-]*');
      const endRegex = new RegExp(endPattern, 'i');
      const sub = rawText.slice(matchStart);
      const endMatch = endRegex.exec(sub);

      if (endMatch && endMatch.index !== undefined) {
        matchEnd = matchStart + endMatch.index + endMatch[0].length;
        while (matchEnd < rawText.length && /[.!?,"')\]}]/.test(rawText[matchEnd])) {
          matchEnd++;
        }
      } else {
        matchEnd = Math.min(rawText.length, matchStart + rawSnippet.length);
      }
    }
  }

  if (matchStart !== -1 && matchEnd > matchStart) {
    const treeWalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let textNode: Text | null = null;
    let lastTextNode: Text | null = null;

    let startNode: Text | null = null;
    let startOffsetInNode = 0;
    let endNode: Text | null = null;
    let endOffsetInNode = 0;

    while ((textNode = treeWalker.nextNode() as Text | null)) {
      lastTextNode = textNode;
      const nodeLen = textNode.nodeValue?.length || 0;
      const nodeStart = currentOffset;
      const nodeEnd = currentOffset + nodeLen;

      if (!startNode && matchStart >= nodeStart && matchStart < nodeEnd) {
        startNode = textNode;
        startOffsetInNode = matchStart - nodeStart;
      }

      if (!endNode && matchEnd > nodeStart && matchEnd <= nodeEnd) {
        endNode = textNode;
        endOffsetInNode = matchEnd - nodeStart;
      }

      currentOffset += nodeLen;
    }

    if (startNode && !endNode && lastTextNode) {
      endNode = lastTextNode;
      endOffsetInNode = lastTextNode.nodeValue?.length || 0;
    }

    if (startNode && endNode) {
      if (startNode === endNode) {
        const val = startNode.nodeValue || '';
        const before = val.substring(0, startOffsetInNode);
        const matched = val.substring(startOffsetInNode, endOffsetInNode);
        const after = val.substring(endOffsetInNode);

        startNode.nodeValue = before;

        const mark = document.createElement('mark');
        mark.className = 'evidence-highlight-active evidence-mark-inline';
        mark.textContent = matched;

        const afterNode = document.createTextNode(after);

        const parent = startNode.parentNode;
        if (parent) {
          parent.insertBefore(mark, startNode.nextSibling);
          parent.insertBefore(afterNode, mark.nextSibling);
          return mark;
        }
      } else {
        try {
          const range = document.createRange();
          range.setStart(startNode, startOffsetInNode);
          range.setEnd(endNode, endOffsetInNode);

          const mark = document.createElement('mark');
          mark.className = 'evidence-highlight-active evidence-mark-inline';

          const fragment = range.extractContents();
          mark.appendChild(fragment);
          range.insertNode(mark);

          return mark;
        } catch {
          // fallback to paragraph level
        }
      }
    }
  }

  return null;
}
