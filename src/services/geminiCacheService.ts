import { GoogleGenAI } from '@google/genai';
import type { PaperDocumentInfo } from '../types/paper';
import { getPdfBase64, buildPaperMarkdownContext, resolveEffectiveGroundingMode } from './pdfUtils';
import { getGeminiApiKey, getSelectedGeminiModel } from './geminiService';

export interface DocumentCacheEntry {
  cacheName: string;
  model: string;
  paperId: string;
  expiresAt: number;
  tokenCount?: number;
  createdAt: number;
}

// In-memory registry of active Gemini context caches
const activeCaches = new Map<string, DocumentCacheEntry>();

function getCacheKey(paperId: string, model: string): string {
  return `${paperId}::${model}`;
}

export function clearLocalCacheRegistry(): void {
  activeCaches.clear();
}

export function getActiveCacheEntry(paperId: string, model?: string): DocumentCacheEntry | null {
  const targetModel = model || getSelectedGeminiModel();
  const key = getCacheKey(paperId, targetModel);
  const entry = activeCaches.get(key);
  if (!entry) return null;

  // Check if expired
  if (Date.now() >= entry.expiresAt) {
    activeCaches.delete(key);
    return null;
  }

  return entry;
}

/**
 * Creates or retrieves an active explicit context cache for a paper document in Google Gemini.
 * If the document is below the minimum token threshold (~32,768 tokens) or caching fails,
 * this function gracefully returns `null`, enabling seamless fallback to inline multimodal ingestion.
 */
export async function getOrCreateDocumentCache(options: {
  paper: PaperDocumentInfo;
  model?: string;
  apiKey?: string;
  ttlSeconds?: number;
  signal?: AbortSignal;
}): Promise<{ cacheName: string; tokenCount?: number } | null> {
  const { paper, signal } = options;
  const targetModel = options.model || getSelectedGeminiModel();
  const targetApiKey = options.apiKey || getGeminiApiKey();

  if (!targetApiKey) {
    return null;
  }

  const cacheKey = getCacheKey(paper.id, targetModel);
  const existing = activeCaches.get(cacheKey);

  // Return existing valid cache if not expired (with 15s safety margin)
  if (existing && Date.now() < existing.expiresAt - 15000) {
    return {
      cacheName: existing.cacheName,
      tokenCount: existing.tokenCount,
    };
  }

  // Build the heavy document payload for caching
  const effectiveGrounding = resolveEffectiveGroundingMode(paper);
  const parts: any[] = [];

  if (effectiveGrounding === 'pdf') {
    try {
      const rawBase64 = await getPdfBase64(paper);
      const base64Data = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
      if (base64Data && base64Data.trim().length > 0) {
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Data.trim(),
          },
        });
      }
    } catch (err: any) {
      console.warn(`[geminiCacheService] Could not read PDF binary for "${paper.name}":`, err.message);
    }
  }

  if (parts.length === 0) {
    const isAbstractOnly = effectiveGrounding === 'abstract_only';
    const docMarkdown = buildPaperMarkdownContext(paper, { abstractOnly: isAbstractOnly });
    if (docMarkdown && docMarkdown.trim().length > 0) {
      parts.push({
        text: `[DOCUMENT CONTENT: "${paper.title || paper.name}"]\n${docMarkdown}`,
      });
    }
  }

  // If no document content exists, cannot create cache
  if (parts.length === 0) {
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: targetApiKey });
    const ttlSeconds = options.ttlSeconds ?? 3600; // default 1 hour TTL
    const cleanId = paper.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20);
    const displayName = `litsift_${cleanId}_${Date.now()}`;

    const created = await ai.caches.create({
      model: targetModel,
      config: {
        displayName,
        ttl: `${ttlSeconds}s`,
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        abortSignal: signal,
      },
    });

    if (!created || !created.name) {
      return null;
    }

    let expiresAt = Date.now() + ttlSeconds * 1000;
    if (created.expireTime) {
      const parsedTime = new Date(created.expireTime).getTime();
      if (!isNaN(parsedTime)) {
        expiresAt = parsedTime;
      }
    }

    const tokenCount = (created as any).usageMetadata?.totalTokenCount;

    const entry: DocumentCacheEntry = {
      cacheName: created.name,
      model: targetModel,
      paperId: paper.id,
      expiresAt,
      tokenCount,
      createdAt: Date.now(),
    };

    activeCaches.set(cacheKey, entry);

    return {
      cacheName: created.name,
      tokenCount,
    };
  } catch (err: any) {
    // Catch minimum token threshold or unsupported caching errors gracefully
    const msg = String(err?.message || err);
    const isTooShort =
      msg.toLowerCase().includes('too short') ||
      msg.toLowerCase().includes('minimum') ||
      msg.toLowerCase().includes('32768') ||
      msg.toLowerCase().includes('invalid_argument');

    if (isTooShort) {
      // Document is below minimum token size for caching (~32k tokens)
      // This is expected for small papers; caller will use direct inline multimodal
      return null;
    }

    console.warn(`[geminiCacheService] Context cache creation bypassed for "${paper.name}": ${msg}`);
    return null;
  }
}

/**
 * Deletes a cached document resource on Google Gemini infrastructure and clears local registry.
 */
export async function deleteDocumentCache(
  paperId: string,
  model?: string,
  apiKey?: string
): Promise<boolean> {
  const targetModel = model || getSelectedGeminiModel();
  const cacheKey = getCacheKey(paperId, targetModel);
  const entry = activeCaches.get(cacheKey);

  if (!entry) return false;

  activeCaches.delete(cacheKey);

  const targetApiKey = apiKey || getGeminiApiKey();
  if (!targetApiKey) return true;

  try {
    const ai = new GoogleGenAI({ apiKey: targetApiKey });
    await ai.caches.delete({ name: entry.cacheName });
    return true;
  } catch (err: any) {
    console.warn(`[geminiCacheService] Failed to delete cache "${entry.cacheName}":`, err.message);
    return false;
  }
}

/**
 * Clears all active document context caches.
 */
export async function clearAllDocumentCaches(apiKey?: string): Promise<void> {
  const targetApiKey = apiKey || getGeminiApiKey();
  const entries = Array.from(activeCaches.values());
  activeCaches.clear();

  if (!targetApiKey) return;

  const ai = new GoogleGenAI({ apiKey: targetApiKey });
  for (const entry of entries) {
    try {
      await ai.caches.delete({ name: entry.cacheName });
    } catch {
      // Ignore background eviction errors
    }
  }
}
