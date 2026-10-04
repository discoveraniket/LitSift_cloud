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
  getModelReasoningCapability,
  getThinkingEnabled,
  setThinkingEnabled,
  setLmStudioReasoningEffort,
} from '../services/providerConfig';
import {
  checkOpenRouterConnection,
  streamOpenRouterChatTurn,
  executeOpenRouterStructuredGeneration,
  extractOpenRouterErrorMessage,
  fetchOpenRouterGenerationStats,
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

  it('classifies model reasoning capabilities correctly into binary, tiered, or none', () => {
    // Binary thinking models (Qwen, QwQ, DeepSeek-R1)
    expect(getModelReasoningCapability('qwen/qwen3.8-27b:free')).toBe('binary');
    expect(getModelReasoningCapability('qwen/qwen-2.5-coder-32b-instruct')).toBe('binary');
    expect(getModelReasoningCapability('deepseek/deepseek-r1')).toBe('binary');
    expect(getModelReasoningCapability('deepseek-r1-distill-qwen-14b')).toBe('binary');
    expect(getModelReasoningCapability('qwq-32b-preview')).toBe('binary');
    expect(getModelReasoningCapability('my-thinking-model')).toBe('binary');
    expect(getModelReasoningCapability('deepseek-reasoner')).toBe('binary');

    // Tiered effort models (OpenAI o1, o3, o3-mini, etc.)
    expect(getModelReasoningCapability('openai/o1')).toBe('tiered');
    expect(getModelReasoningCapability('openai/o1-mini')).toBe('tiered');
    expect(getModelReasoningCapability('openai/o3-mini')).toBe('tiered');
    expect(getModelReasoningCapability('openai/o4')).toBe('tiered');
    expect(getModelReasoningCapability('custom-reasoning-effort')).toBe('tiered');

    // Non-reasoning standard models
    expect(getModelReasoningCapability('meta-llama/llama-3.3-70b-instruct')).toBe('none');
    expect(getModelReasoningCapability('google/gemini-2.5-flash')).toBe('none');
    expect(getModelReasoningCapability('anthropic/claude-3.5-sonnet')).toBe('none');
    expect(getModelReasoningCapability('')).toBe('none');
  });

  it('manages thinkingEnabled toggle state and persistence', () => {
    expect(getThinkingEnabled()).toBe(true); // Default is true

    setThinkingEnabled(false);
    expect(getThinkingEnabled()).toBe(false);
    expect(localStorage.getItem('LITSIFT_THINKING_ENABLED')).toBe('false');

    setThinkingEnabled(true);
    expect(getThinkingEnabled()).toBe(true);
    expect(localStorage.getItem('LITSIFT_THINKING_ENABLED')).toBe('true');
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

  it('extracts human-readable message from OpenRouter nested error JSON', () => {
    const rawPayload = JSON.stringify({
      error: {
        message: 'Provider returned error',
        code: 429,
        metadata: {
          raw: 'qwen/qwen3.8-27b:free is temporarily rate-limited upstream. Please retry shortly.',
        },
      },
    });

    const msg = extractOpenRouterErrorMessage(429, rawPayload, 'Too Many Requests');
    expect(msg).toContain('OpenRouter API call failed (HTTP 429)');
    expect(msg).toContain('qwen/qwen3.8-27b:free is temporarily rate-limited upstream');
  });

  it('retries executeOpenRouterStructuredGeneration on 429 before succeeding', async () => {
    const jsonOutput = JSON.stringify({ summary: 'Success after retry' });

    // Mock 1st call 429, 2nd call 200
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: jsonOutput } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      } as any);

    // Fast timer mock or small delay
    const result = await executeOpenRouterStructuredGeneration({
      apiKey: 'sk-or-v1-testkey',
      model: 'qwen/qwen3.8-27b:free',
      schemaName: 'testRetry',
      schema: { type: 'OBJECT', properties: { summary: { type: 'STRING' } } },
      messages: [{ role: 'user', content: 'Summarize' }],
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.parsed.summary).toBe('Success after retry');
  });

  it('configures OpenRouter reasoning payload adaptively for binary models (on/off)', async () => {
    let capturedBody: any = null;
    const encoder = new TextEncoder();
    const createStream = () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

    global.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        body: createStream(),
      });
    });

    // 1. Binary model with thinkingEnabled = false
    setThinkingEnabled(false);
    await streamOpenRouterChatTurn({
      apiKey: 'sk-or-v1-testkey',
      model: 'qwen/qwen3.8-27b:free',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(capturedBody.reasoning).toEqual({ effort: 'none' });

    // 2. Binary model with thinkingEnabled = true
    setThinkingEnabled(true);
    await streamOpenRouterChatTurn({
      apiKey: 'sk-or-v1-testkey',
      model: 'qwen/qwen3.8-27b:free',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(capturedBody.reasoning).toEqual({ exclude: false });

    // 3. Tiered model with reasoningEffort = high
    setLmStudioReasoningEffort('high');
    await streamOpenRouterChatTurn({
      apiKey: 'sk-or-v1-testkey',
      model: 'openai/o3-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(capturedBody.reasoning).toEqual({ effort: 'high' });

    // 4. Standard non-reasoning model
    await streamOpenRouterChatTurn({
      apiKey: 'sk-or-v1-testkey',
      model: 'meta-llama/llama-3.3-70b-instruct',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(capturedBody.reasoning).toBeUndefined();
  });

  it('captures performance metrics (TTFT, throughput, cost, provider, generationId)', async () => {
    const sseChunks = [
      'data: {"id":"gen-test-999","choices":[{"delta":{"content":"First chunk"}}],"openrouter_metadata":{"provider_name":"DeepInfra"}}\n\n',
      'data: {"choices":[{"delta":{"content":" and second chunk"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":150,"completion_tokens":25,"total_tokens":175,"cost":0.00045,"prompt_tokens_details":{"cached_tokens":50},"completion_tokens_details":{"reasoning_tokens":10}}}\n\n',
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
        headers: new Headers({ 'x-generation-id': 'gen-test-999' }),
        body: stream,
      });
    });

    const result = await streamOpenRouterChatTurn({
      apiKey: 'sk-or-v1-testkey',
      model: 'qwen/qwen3.8-27b:free',
      messages: [{ role: 'user', content: 'Test metrics' }],
    });

    expect(capturedHeaders['X-Title']).toBe('LitSift Literature Synthesis');
    expect(capturedHeaders['X-OpenRouter-Metadata']).toBeUndefined();
    expect(result.text).toBe('First chunk and second chunk');
    expect(result.generationId).toBe('gen-test-999');
    expect(result.upstreamProvider).toBe('DeepInfra');
    expect(result.cost).toBe(0.00045);
    expect(result.timeToFirstToken).toBeDefined();
    expect(result.tokensPerSecond).toBeDefined();
    expect(result.usage?.cachedTokens).toBe(50);
    expect(result.usage?.thinkingTokens).toBe(10);
  });

  it('fetches OpenRouter generation statistics from /generation endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'gen-abc-123',
          provider_name: 'Together AI',
          total_cost: 0.0012,
          latency: 450,
          generation_time: 320,
          tokens_prompt: 500,
          tokens_completion: 45,
          native_tokens_reasoning: 15,
          native_tokens_cached: 100,
        },
      }),
    } as any);

    const stats = await fetchOpenRouterGenerationStats({
      generationId: 'gen-abc-123',
      apiKey: 'sk-or-v1-testkey',
    });

    expect(stats).not.toBeNull();
    expect(stats?.id).toBe('gen-abc-123');
    expect(stats?.providerName).toBe('Together AI');
    expect(stats?.cost).toBe(0.0012);
    expect(stats?.latencyMs).toBe(450);
    expect(stats?.tokensPrompt).toBe(500);
    expect(stats?.tokensCompletion).toBe(45);
  });
});

