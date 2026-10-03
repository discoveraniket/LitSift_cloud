/**
 * LLM Provider Configuration & State Management
 * Supports switching between Google Gemini (Cloud), LM Studio (Local), and OpenRouter (Unified Cloud Gateway).
 */

export type LlmProvider = 'gemini' | 'lmstudio' | 'openrouter';
export type ReasoningEffort = 'low' | 'medium' | 'high';

const STORAGE_KEYS = {
  PROVIDER: 'LITSIFT_LLM_PROVIDER',
  LMSTUDIO_URL: 'LITSIFT_LMSTUDIO_URL',
  LMSTUDIO_MODEL: 'LITSIFT_LMSTUDIO_MODEL',
  LMSTUDIO_REASONING_EFFORT: 'LITSIFT_LMSTUDIO_REASONING_EFFORT',
  LMSTUDIO_USE_PROXY: 'LITSIFT_LMSTUDIO_USE_PROXY',
  OPENROUTER_API_KEY: 'LITSIFT_OPENROUTER_API_KEY',
  OPENROUTER_MODEL: 'LITSIFT_OPENROUTER_MODEL',
  OPENROUTER_BASE_URL: 'LITSIFT_OPENROUTER_BASE_URL',
};

export const DEFAULT_LMSTUDIO_URL = 'http://localhost:1234/v1';
export const DEFAULT_PROXY_URL = '/api/lmstudio/v1';

export const DEFAULT_OPENROUTER_MODEL = 'qwen/qwen3.8-27b:free';
export const DEFAULT_OPENROUTER_URL = 'https://openrouter.ai/api/v1';

export function getActiveProvider(): LlmProvider {
  if (typeof window === 'undefined') return 'gemini';
  const val = localStorage.getItem(STORAGE_KEYS.PROVIDER);
  if (val === 'lmstudio') return 'lmstudio';
  if (val === 'openrouter') return 'openrouter';
  return 'gemini';
}

export function setActiveProvider(provider: LlmProvider): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
}

// LM Studio Config
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

// OpenRouter Config
export function getOpenRouterApiKey(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem(STORAGE_KEYS.OPENROUTER_API_KEY) ||
    (typeof process !== 'undefined' && process.env?.OPENROUTER_API_KEY) ||
    ''
  );
}

export function setOpenRouterApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, key.trim());
}

export function getOpenRouterModel(): string {
  if (typeof window === 'undefined') return DEFAULT_OPENROUTER_MODEL;
  return localStorage.getItem(STORAGE_KEYS.OPENROUTER_MODEL) || DEFAULT_OPENROUTER_MODEL;
}

export function setOpenRouterModel(model: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.OPENROUTER_MODEL, model.trim());
}

export function getOpenRouterBaseUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_OPENROUTER_URL;
  return localStorage.getItem(STORAGE_KEYS.OPENROUTER_BASE_URL) || DEFAULT_OPENROUTER_URL;
}

export function setOpenRouterBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.OPENROUTER_BASE_URL, url.trim().replace(/\/+$/, ''));
}

/**
 * Returns the effective API endpoint to use in fetch requests for LM Studio.
 * Automatically maps localhost to Vite reverse proxy to prevent CORS blocks.
 */
export function getEffectiveLmStudioUrl(userBaseUrl?: string): string {
  const base = (userBaseUrl || getLmStudioBaseUrl()).trim().replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    const isLocalhost =
      base.startsWith('http://localhost:1234') ||
      base.startsWith('http://127.0.0.1:1234');

    if (isLocalhost) {
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
  if (provider === 'openrouter') {
    const model = getOpenRouterModel();
    return model ? `OR: ${model}` : `OR: ${DEFAULT_OPENROUTER_MODEL}`;
  }
  if (typeof window === 'undefined') return 'gemini-3.6-flash';
  return localStorage.getItem('LITSIFT_SELECTED_MODEL') || 'gemini-3.6-flash';
}
