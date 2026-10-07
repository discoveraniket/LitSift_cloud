import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOrCreateDocumentCache,
  deleteDocumentCache,
  clearAllDocumentCaches,
  clearLocalCacheRegistry,
  getActiveCacheEntry,
} from '../services/geminiCacheService';
import type { PaperDocumentInfo } from '../types/paper';

const mockCreate = vi.fn();
const mockDelete = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    GoogleGenAI: vi.fn().mockImplementation(function (this: any) {
      this.caches = {
        create: mockCreate,
        delete: mockDelete,
      };
    }),
  };
});

describe('Gemini Context Caching Service Suite', () => {
  const mockPaper: PaperDocumentInfo = {
    id: 'paper-cache-test-1',
    name: 'Phage_Genomics.pdf',
    title: 'Complete Genome and Structural Analysis of Phage PhiX',
    base64: 'JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDw...',
    sourceType: 'pdf_upload',
    oaStatus: 'gold',
    status: 'Ready',
    uploadedAt: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalCacheRegistry();
  });

  it('returns null if apiKey is missing', async () => {
    const result = await getOrCreateDocumentCache({
      paper: mockPaper,
      model: 'gemini-2.5-flash',
      apiKey: '',
    });
    expect(result).toBeNull();
  });

  it('creates an explicit context cache with base64 PDF and caches the resource name', async () => {
    mockCreate.mockResolvedValueOnce({
      name: 'cachedContents/test_cache_resource_123',
      expireTime: new Date(Date.now() + 3600 * 1000).toISOString(),
      usageMetadata: { totalTokenCount: 45000 },
    });

    const result = await getOrCreateDocumentCache({
      paper: mockPaper,
      model: 'gemini-2.5-flash',
      apiKey: 'valid-api-key',
      ttlSeconds: 3600,
    });

    expect(result).not.toBeNull();
    expect(result?.cacheName).toBe('cachedContents/test_cache_resource_123');
    expect(result?.tokenCount).toBe(45000);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Verify stored active cache entry
    const activeEntry = getActiveCacheEntry(mockPaper.id, 'gemini-2.5-flash');
    expect(activeEntry?.cacheName).toBe('cachedContents/test_cache_resource_123');

    // Calling again should return cached entry without repeating ai.caches.create
    const secondResult = await getOrCreateDocumentCache({
      paper: mockPaper,
      model: 'gemini-2.5-flash',
      apiKey: 'valid-api-key',
    });
    expect(secondResult?.cacheName).toBe('cachedContents/test_cache_resource_123');
    expect(mockCreate).toHaveBeenCalledTimes(1); // Still 1 call!
  });

  it('gracefully handles minimum token threshold error (<32k tokens) by returning null', async () => {
    mockCreate.mockRejectedValueOnce(
      new Error('INVALID_ARGUMENT: Cached content is too short. Minimum token count is 32768.')
    );

    const result = await getOrCreateDocumentCache({
      paper: mockPaper,
      model: 'gemini-2.5-flash',
      apiKey: 'valid-api-key',
    });

    // Graceful fallback without throwing error
    expect(result).toBeNull();
  });

  it('deletes active cache resource on remote and in local registry', async () => {
    mockCreate.mockResolvedValueOnce({
      name: 'cachedContents/to_delete_456',
      expireTime: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    await getOrCreateDocumentCache({
      paper: mockPaper,
      model: 'gemini-2.5-flash',
      apiKey: 'valid-api-key',
    });

    expect(getActiveCacheEntry(mockPaper.id, 'gemini-2.5-flash')).not.toBeNull();

    mockDelete.mockResolvedValueOnce({});
    const deleted = await deleteDocumentCache(mockPaper.id, 'gemini-2.5-flash', 'valid-api-key');

    expect(deleted).toBe(true);
    expect(getActiveCacheEntry(mockPaper.id, 'gemini-2.5-flash')).toBeNull();
    expect(mockDelete).toHaveBeenCalledWith({ name: 'cachedContents/to_delete_456' });
  });

  it('clears all cached document resources across registry', async () => {
    mockCreate.mockResolvedValueOnce({
      name: 'cachedContents/cache_all_1',
      expireTime: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    await getOrCreateDocumentCache({
      paper: mockPaper,
      model: 'gemini-2.5-flash',
      apiKey: 'valid-api-key',
    });

    await clearAllDocumentCaches('valid-api-key');
    expect(getActiveCacheEntry(mockPaper.id, 'gemini-2.5-flash')).toBeNull();
  });
});
