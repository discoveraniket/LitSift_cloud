import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked with GitHub Flavored Markdown and line breaks
marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Configure DOMPurify hook to ensure all rendered <a> links safely open in a new tab
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Renders markdown text into sanitized, safe HTML.
 * Protects against XSS injection attacks from untrusted paper content, prompt injections, and AI outputs.
 */
export function renderSafeMarkdown(markdown: string | undefined | null): string {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  try {
    const rawHtml = marked.parse(markdown) as string;
    return DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['target', 'rel'],
    });
  } catch (err) {
    console.error('Error parsing/sanitizing markdown:', err);
    return DOMPurify.sanitize(markdown);
  }
}
