import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getActiveProvider,
  setActiveProvider,
  getOpenRouterApiKey,
  setOpenRouterApiKey,
  getOpenRouterModel,
  setOpenRouterModel,
  getOpenRouterBaseUrl,
  setOpenRouterBaseUrl,
  getActiveModelLabel,
  DEFAULT_OPENROUTER_MODEL,
} from '../services/providerConfig';
import {
  checkOpenRouterConnection,
  streamOpenRouterChatTurn,
  executeOpenRouterStructuredGeneration,
  CURATED_OPENROUTER_PRESETS,
} from '../services/openRouterService';

describe('OpenRouter Provider Configuration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('manages switching to openrouter provider and persists in localStorage', () => {
    expect(getActiveProvider()).toBe('gemini');

    setActiveProvider('openrouter');
    expect(getActiveProvider()).toBe('openrouter');
    expect(localStorage.getItem('LITSIFT_LLM_PROVIDER')).toBe('openrouter');
  });

  it('manages OpenRouter API key and model defaults', () => {
    expect(getOpenRouterApiKey()).toBe('');
    setOpenRouterApiKey('sk-or-v1-testkey12345');
    expect(getOpenRouterApiKey()).toBe('sk-or-v1-testkey12345');

    expect(getOpenRouterModel()).toBe(DEFAULT_OPENROUTER_MODEL);
    setOpenRouterModel('qwen/qwen3.8-27b:free');
    expect(getOpenRouterModel()).toBe('qwen/qwen3.8-27b:free');

    setOpenRouterBaseUrl('https://custom.openrouter.proxy/v1');
    expect(getOpenRouterBaseUrl()).toBe('https://custom.openrouter.proxy/v1');
  });

  it('formats active model label accurately for OpenRouter', () => {
    setActiveProvider('openrouter');
    setOpenRouterModel('qwen/qwen3.8-27b:free');
    expect(getActiveModelLabel()).toBe('OR: qwen/qwen3.8-27b:free');

    setOpenRouterModel('');
    expect(getActiveModelLabel()).toBe(`OR: ${DEFAULT_OPENROUTER_MODEL}`);
  });

  it('includes qwen/qwen3.8-27b:free in curated presets with 262K context', () => {
    const qwenPreset = CURATED_OPENROUTER_PRESETS.find((p) => p.id === 'qwen/qwen3.8-27b:free');
    expect(qwenPreset).toBeDefined();
    expect(qwenPreset?.context).toContain('262K');
    expect(qwenPreset?.pricing).toContain('Free');
  });
});

describe('OpenRouter HTTP and Streaming Service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('fails checkOpenRouterConnection early when API key is missing', async () => {
    const result = await checkOpenRouterConnection('');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('API key is required');
  });

  it('validates OpenRouter connection and extracts tool-capable models', async () => {
    const mockModels = {
      data: [
        {
          id: 'qwen/qwen3.8-27b:free',
          name: 'Qwen 3.8 27B',
          context_length: 262144,
          supported_parameters: ['tools', 'reasoning', 'temperature'],
        },
        {
          id: 'some/basic-model',
          name: 'Basic Model',
          context_length: 8192,
          supported_parameters: ['temperature'],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockModels,
    } as any);

    const result = await checkOpenRouterConnection('sk-or-v1-validkey');
    expect(result.ok).toBe(true);
    expect(result.models).toHaveLength(2);
    expect(result.models[0].id).toBe('qwen/qwen3.8-27b:free');
    expect(result.models[0].supportsTools).toBe(true);
    expect(result.models[0].supportsReasoning).toBe(true);
    expect(result.models[1].supportsTools).toBe(false);
  });

  it('streams OpenRouter chat turn with headers, captures reasoning_content, and accumulates tool calls', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Step 1: Reading research paper."}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":" Step 2: Preparing extraction."}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_qwen_1","type":"function","function":{"name":"extractPDFData","arguments":"{\\"targetPdfTitle\\": \\"Nature 2026\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":220,"completion_tokens":55}}\n\n',
      'data: [DONE]\n\n',
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    let capturedHeaders: any = null;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedHeaders = init.headers;
      return Promise.resolve({
        ok: true,
        body: stream,
      });
    });

    const result = await streamOpenRouterChatTurn({
      apiKey: 'sk-or-v1-testkey',
      model: 'qwen/qwen3.8-27b:free',
      messages: [{ role: 'user', content: 'Extract findings' }],
      tools: [],
    });

    expect(capturedHeaders['Authorization']).toBe('Bearer sk-or-v1-testkey');
    expect(capturedHeaders['HTTP-Referer']).toBe('https://litsift.local');
    expect(capturedHeaders['X-Title']).toBe('LitSift Literature Synthesis');

    expect(result.thought).toBe('Step 1: Reading research paper. Step 2: Preparing extraction.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe('extractPDFData');
    expect(result.toolCalls![0].args).toEqual({ targetPdfTitle: 'Nature 2026' });
    expect(result.usage?.prompt_tokens).toBe(220);
    expect(result.usage?.completion_tokens).toBe(55);
  });

  it('executes OpenRouter structured generation with automatic fallback to json_object if json_schema is rejected', async () => {
    const jsonOutput = JSON.stringify({
      rows: [{ finding: 'Significant result at p<0.01' }],
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Provider rejected json_schema schema format',
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: jsonOutput } }],
          usage: { prompt_tokens: 180, completion_tokens: 40 },
        }),
      } as any);

    const result = await executeOpenRouterStructuredGeneration({
      apiKey: 'sk-or-v1-testkey',
      model: 'qwen/qwen3.8-27b:free',
      schemaName: 'testExtraction',
      schema: { type: 'OBJECT', properties: { rows: { type: 'ARRAY' } } },
      messages: [{ role: 'user', content: 'Extract data' }],
    });

    expect(result.rawText).toBe(jsonOutput);
    expect(result.parsed.rows[0].finding).toBe('Significant result at p<0.01');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
