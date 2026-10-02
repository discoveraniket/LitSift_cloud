/**
 * LLM Provider Configuration & State Management
 * Supports switching between Google Gemini (Cloud) and LM Studio (Local OpenAI-compatible).
 */

export type LlmProvider = 'gemini' | 'lmstudio';
export type ReasoningEffort = 'low' | 'medium' | 'high';

const STORAGE_KEYS = {
  PROVIDER: 'LITSIFT_LLM_PROVIDER',
  LMSTUDIO_URL: 'LITSIFT_LMSTUDIO_URL',
  LMSTUDIO_MODEL: 'LITSIFT_LMSTUDIO_MODEL',
  LMSTUDIO_REASONING_EFFORT: 'LITSIFT_LMSTUDIO_REASONING_EFFORT',
  LMSTUDIO_USE_PROXY: 'LITSIFT_LMSTUDIO_USE_PROXY',
};

export const DEFAULT_LMSTUDIO_URL = 'http://localhost:1234/v1';
export const DEFAULT_PROXY_URL = '/api/lmstudio/v1';

export function getActiveProvider(): LlmProvider {
  if (typeof window === 'undefined') return 'gemini';
  const val = localStorage.getItem(STORAGE_KEYS.PROVIDER);
  return val === 'lmstudio' ? 'lmstudio' : 'gemini';
}

export function setActiveProvider(provider: LlmProvider): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
}

export function getLmStudioBaseUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_LMSTUDIO_URL;
  return localStorage.getItem(STORAGE_KEYS.LMSTUDIO_URL) || DEFAULT_LMSTUDIO_URL;
}

export function setLmStudioBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.LMSTUDIO_URL, url.trim().replace(/\/+$/, ''));
}

export function getLmStudioModel(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEYS.LMSTUDIO_MODEL) || '';
}

export function setLmStudioModel(modelId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.LMSTUDIO_MODEL, modelId);
}

export function getLmStudioReasoningEffort(): ReasoningEffort {
  if (typeof window === 'undefined') return 'low';
  const val = localStorage.getItem(STORAGE_KEYS.LMSTUDIO_REASONING_EFFORT);
  return val === 'medium' || val === 'high' ? val : 'low';
}

export function setLmStudioReasoningEffort(effort: ReasoningEffort): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.LMSTUDIO_REASONING_EFFORT, effort);
}

/**
 * Returns the effective API endpoint to use in fetch requests.
 * If useProxy is true or running in browser with localhost, automatically uses Vite proxy
 * to prevent browser CORS issues.
 */
export function getEffectiveLmStudioUrl(userBaseUrl?: string): string {
  const base = (userBaseUrl || getLmStudioBaseUrl()).trim().replace(/\/+$/, '');

  // If in browser and pointing to local server, Vite proxy provides guaranteed CORS-free access
  if (typeof window !== 'undefined') {
    const isLocalhost =
      base.startsWith('http://localhost:1234') ||
      base.startsWith('http://127.0.0.1:1234');

    if (isLocalhost) {
      // e.g. http://localhost:1234/v1 -> /api/lmstudio/v1
      return base.replace(/^http:\/\/(localhost|127\.0\.0\.1):1234/, '/api/lmstudio');
    }
  }

  return base;
}

export function getActiveModelLabel(): string {
  const provider = getActiveProvider();
  if (provider === 'lmstudio') {
    const model = getLmStudioModel();
    return model ? `LM: ${model}` : 'LM Studio';
  }
  if (typeof window === 'undefined') return 'gemini-3.6-flash';
  return localStorage.getItem('LITSIFT_SELECTED_MODEL') || 'gemini-3.6-flash';
}

