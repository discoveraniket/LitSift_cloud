/**
 * Accurate & Minimalist Document Highlighting Service
 * Handles cross-span fuzzy text matching, soft glassmorphic pulse highlights,
 * and smooth viewport auto-centering across PDF and Reader views.
 */

/**
 * Normalizes text for robust searching:
 * - Lowercases all characters
 * - Converts curly quotes, dashes, and smart punctuation to standard ASCII
 * - Collapses consecutive whitespace to a single space
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
 * Triggers a gentle, high-visibility flash pulse animation on all active evidence highlights.
 * Forces a DOM reflow to ensure the CSS keyframe animation restarts reliably on every invocation,
 * even when the highlight was already present.
 */
export function flashActiveHighlights(container: HTMLElement | null | undefined): void {
  if (!container) return;

  const highlightedEls = container.querySelectorAll<HTMLElement>('.evidence-highlight-active');
  highlightedEls.forEach((el) => {
    el.classList.remove('evidence-highlight-flash');
    // Force DOM reflow to reliably restart CSS keyframe animation
    void el.offsetWidth;
    el.classList.add('evidence-highlight-flash');
  });
}

/**
 * Injects gentle keyword glow inside a matched sentence element or mark.
 * If the exact keyword/cell value is present, wraps it in <mark class="evidence-keyword-glow">.
 */
function applyKeywordGlow(matchedElement: HTMLElement, keyword: string): void {
  if (!matchedElement || !keyword) return;
  const cleanKw = keyword.trim();
  if (cleanKw.length < 2) return;
  const lowerKw = cleanKw.toLowerCase();

  // If the matched element is already the exact keyword mark, apply the class directly
  if ((matchedElement.textContent || '').trim().toLowerCase() === lowerKw) {
    matchedElement.classList.add('evidence-keyword-glow');
    return;
  }

  // Candidate phrases to search for: full string, punctuation-stripped, and individual tokens
  const candidates: string[] = [cleanKw];
  const stripped = cleanKw.replace(/^[-(["']+|[.,;:!?)\]"']+$/g, '');
  if (stripped.length >= 2 && !candidates.includes(stripped)) {
    candidates.push(stripped);
  }

  const tokens = cleanKw.split(/\s+/).filter((t) => t.length >= 3);
  for (const token of tokens) {
    const strippedTok = token.replace(/^[-(["']+|[.,;:!?)\]"']+$/g, '');
    if (strippedTok.length >= 3 && !candidates.includes(strippedTok)) {
      candidates.push(strippedTok);
    }
  }

  const walker = document.createTreeWalker(matchedElement, NodeFilter.SHOW_TEXT);
  let textNode: Text | null = null;

  while ((textNode = walker.nextNode() as Text | null)) {
    if (textNode.parentElement?.classList.contains('evidence-keyword-glow')) continue;

    const val = textNode.nodeValue || '';
    const lowerVal = val.toLowerCase();

    for (const cand of candidates) {
      const lowerCand = cand.toLowerCase();
      const idx = lowerVal.indexOf(lowerCand);

      if (idx !== -1) {
        const parent = textNode.parentNode;
        if (!parent) continue;

        const before = val.substring(0, idx);
        const matched = val.substring(idx, idx + cand.length);
        const after = val.substring(idx + cand.length);

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
}

/**
 * Highlights a verbatim sentence or snippet inside the provided container element.
 * Works seamlessly across PDF.js multi-span text layers and Article Reader HTML DOM.
 * 
 * @param container The DOM container (e.g. .pdf-page-wrapper or article root)
 * @param snippet The exact or partial sentence snippet quote to locate
 * @param keyword Optional exact cell value / keyword to gently glow inside the sentence
 * @returns The primary matched DOM element (for smooth centering), or null if not found
 */
export function highlightSnippetInContainer(
  container: HTMLElement | null | undefined,
  snippet: string,
  keyword?: string
): HTMLElement | null {
  if (!container || !snippet) return null;

  clearActiveHighlights(container);

  const cleanSnippet = normalizeSearchText(snippet);
  if (!cleanSnippet || cleanSnippet.length < 3) return null;

  // -------------------------------------------------------------
  // STRATEGY 1: PDF.js Text Layer Matching (.pdf-text-item spans)
  // -------------------------------------------------------------
  const pdfSpans = Array.from(container.querySelectorAll<HTMLElement>('.pdf-text-item'));

  if (pdfSpans.length > 0) {
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

      // Estimate character ratio in raw text
      const charRatio = fullPageText.length > 0 ? fullPageText.length / Math.max(normPageText.length, 1) : 1;
      const rawStart = Math.floor(matchIdx * charRatio);
      const rawEnd = Math.ceil(matchEnd * charRatio);

      const matchedSpans: HTMLElement[] = [];

      for (const mapItem of spanMap) {
        // Check if span overlaps the match range
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
  }

  // -------------------------------------------------------------
  // STRATEGY 2: Article Reader HTML Matching (Direct Text Nodes & Sentences)
  // -------------------------------------------------------------
  // 2A. Direct exact substring match in text nodes (handles IDs, DOIs, phrases, table cells)
  const directMark = highlightInTextNodes(container, snippet);
  if (directMark) {
    if (keyword && keyword.trim().length >= 2) {
      applyKeywordGlow(directMark, keyword);
    }
    flashActiveHighlights(container);
    return directMark;
  }

  // 2B. Fuzzy / Normalized sentence matching across rich block elements
  const candidateEls = Array.from(
    container.querySelectorAll<HTMLElement>(
      'p, td, th, li, h1, h2, h3, h4, h5, h6, figcaption, dd, dt, .section-paragraph, .abstract-text, div'
    )
  );

  let bestElement: HTMLElement | null = null;
  let highestScore = 0;

  for (const el of candidateEls) {
    // Skip containers that contain large nested trees
    if (el.children.length > 8 && el.tagName.toLowerCase() === 'div') continue;

    const rawText = el.textContent || '';
    const normElText = normalizeSearchText(rawText);
    if (!normElText) continue;

    // Check if this element contains the snippet
    const isExactMatch = normElText.includes(cleanSnippet);
    let isPartialMatch = false;

    if (!isExactMatch) {
      const searchTokens = cleanSnippet.split(' ').filter((w) => w.length > 3);
      if (searchTokens.length >= 2) {
        let matchedTokenCount = 0;
        for (const token of searchTokens) {
          if (normElText.includes(token)) {
            matchedTokenCount++;
          }
        }
        const score = matchedTokenCount / searchTokens.length;
        if (score >= 0.65 && score > highestScore) {
          highestScore = score;
          bestElement = el;
          isPartialMatch = true;
        }
      }
    }

    if (isExactMatch || isPartialMatch) {
      // Highlight ONLY the exact sentence inside the element
      const markedEl = highlightExactSnippetInHtmlElement(el, snippet, cleanSnippet);
      if (markedEl) {
        if (keyword && keyword.trim().length >= 2) {
          applyKeywordGlow(markedEl, keyword);
        }
        flashActiveHighlights(container);
        return markedEl;
      }
      if (isExactMatch) {
        bestElement = el;
        break;
      }
    }
  }

  if (bestElement) {
    const fallbackMark = highlightExactSnippetInHtmlElement(bestElement, snippet, cleanSnippet);
    if (fallbackMark) {
      if (keyword && keyword.trim().length >= 2) {
        applyKeywordGlow(fallbackMark, keyword);
      }
      flashActiveHighlights(container);
      return fallbackMark;
    }

    bestElement.classList.add('evidence-highlight-active');
    if (keyword && keyword.trim().length >= 2) {
      applyKeywordGlow(bestElement, keyword);
    }
    flashActiveHighlights(container);
    return bestElement;
  }

  return null;
}

/**
 * Direct Text Node Matcher:
 * Finds any text node inside container that contains the exact search text (case-insensitive)
 * and wraps the exact matching characters in <mark class="evidence-highlight-active evidence-mark-inline">.
 */
function highlightInTextNodes(container: HTMLElement, query: string): HTMLElement | null {
  if (!query || query.trim().length < 2) return null;
  const trimmed = query.trim();
  const lowerQuery = trimmed.toLowerCase();

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let textNode: Text | null = null;

  while ((textNode = walker.nextNode() as Text | null)) {
    const parentTag = textNode.parentElement?.tagName.toLowerCase();
    if (
      parentTag === 'button' ||
      parentTag === 'nav' ||
      parentTag === 'script' ||
      parentTag === 'style' ||
      textNode.parentElement?.closest('button') ||
      textNode.parentElement?.closest('nav')
    ) {
      continue;
    }

    const val = textNode.nodeValue || '';
    const lowerVal = val.toLowerCase();
    const matchIdx = lowerVal.indexOf(lowerQuery);

    if (matchIdx !== -1) {
      const parent = textNode.parentNode;
      if (!parent) continue;

      const before = val.substring(0, matchIdx);
      const matched = val.substring(matchIdx, matchIdx + trimmed.length);
      const after = val.substring(matchIdx + trimmed.length);

      textNode.nodeValue = before;

      const mark = document.createElement('mark');
      mark.className = 'evidence-highlight-active evidence-highlight-flash evidence-mark-inline';
      mark.textContent = matched;

      const afterNode = document.createTextNode(after);

      parent.insertBefore(mark, textNode.nextSibling);
      parent.insertBefore(afterNode, mark.nextSibling);

      return mark;
    }
  }

  return null;
}

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
      // Find the end anchor near matchStart
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

    while ((textNode = treeWalker.nextNode() as Text | null)) {
      const nodeLen = textNode.nodeValue?.length || 0;
      const nodeStart = currentOffset;
      const nodeEnd = currentOffset + nodeLen;

      if (matchStart >= nodeStart && matchEnd <= nodeEnd) {
        const offsetInNodeStart = matchStart - nodeStart;
        const offsetInNodeEnd = matchEnd - nodeStart;

        const matchedText = textNode.nodeValue?.substring(offsetInNodeStart, offsetInNodeEnd) || '';
        const afterText = textNode.nodeValue?.substring(offsetInNodeEnd) || '';

        textNode.nodeValue = textNode.nodeValue?.substring(0, offsetInNodeStart) || '';

        const mark = document.createElement('mark');
        mark.className = 'evidence-highlight-active evidence-mark-inline';
        mark.textContent = matchedText;

        const afterNode = document.createTextNode(afterText);

        const parent = textNode.parentNode;
        if (parent) {
          parent.insertBefore(mark, textNode.nextSibling);
          parent.insertBefore(afterNode, mark.nextSibling);
          return mark;
        }
      }
      currentOffset += nodeLen;
    }
  }

  return null;
}
