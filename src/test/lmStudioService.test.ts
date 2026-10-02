import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  convertGeminiSchemaToJsonSchema,
  convertToolsToOpenAiFormat,
  createStructuredResponseFormat,
} from '../services/schemaConverter';
import {
  getActiveProvider,
  setActiveProvider,
  getLmStudioBaseUrl,
  setLmStudioBaseUrl,
  getLmStudioModel,
  setLmStudioModel,
  getLmStudioReasoningEffort,
  setLmStudioReasoningEffort,
  getActiveModelLabel,
  DEFAULT_LMSTUDIO_URL,
} from '../services/providerConfig';
import {
  checkLmStudioConnection,
  streamLmStudioChatTurn,
  executeLmStudioStructuredGeneration,
} from '../services/lmStudioService';

describe('Schema Converter Utility', () => {
  it('converts Gemini Type schemas into standard OpenAI JSON schemas', () => {
    const geminiSchema = {
      type: 'OBJECT',
      description: 'Test container',
      properties: {
        title: { type: 'STRING', description: 'Paper title' },
        year: { type: 'INTEGER', description: 'Publication year' },
        score: { type: 'NUMBER', description: 'Relevance score' },
        isOpenAccess: { type: 'BOOLEAN', description: 'Open access flag' },
        tags: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
        category: {
          type: 'STRING',
          enum: ['biology', 'physics', 'computer_science'],
        },
      },
      required: ['title', 'year'],
    };

    const converted = convertGeminiSchemaToJsonSchema(geminiSchema);

    expect(converted.type).toBe('object');
    expect(converted.description).toBe('Test container');
    expect(converted.properties.title).toEqual({ type: 'string', description: 'Paper title' });
    expect(converted.properties.year).toEqual({ type: 'integer', description: 'Publication year' });
    expect(converted.properties.score).toEqual({ type: 'number', description: 'Relevance score' });
    expect(converted.properties.isOpenAccess).toEqual({ type: 'boolean', description: 'Open access flag' });
    expect(converted.properties.tags).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
    expect(converted.properties.category.enum).toEqual(['biology', 'physics', 'computer_science']);
    expect(converted.required).toEqual(['title', 'year']);
  });

  it('converts both raw tools and Gemini functionDeclarations wrappers into OpenAI tools format', () => {
    const rawTools = [
      {
        name: 'queryGridData',
        description: 'Queries data rows',
        parameters: {
          type: 'OBJECT',
          properties: {
            filter: { type: 'STRING' },
          },
        },
      },
    ];

    const convertedRaw = convertToolsToOpenAiFormat(rawTools);
    expect(convertedRaw).toHaveLength(1);
    expect(convertedRaw[0]).toEqual({
      type: 'function',
      function: {
        name: 'queryGridData',
        description: 'Queries data rows',
        parameters: {
          type: 'object',
          properties: {
            filter: { type: 'string' },
          },
        },
      },
    });

    const geminiWrappedTools = [
      {
        functionDeclarations: [
          {
            name: 'updateCell',
            description: 'Updates a specific cell',
            parameters: {
              type: 'OBJECT',
              properties: {
                rowId: { type: 'STRING' },
                field: { type: 'STRING' },
                value: { type: 'STRING' },
              },
              required: ['rowId', 'field', 'value'],
            },
          },
        ],
      },
    ];

    const convertedWrapped = convertToolsToOpenAiFormat(geminiWrappedTools);
    expect(convertedWrapped).toHaveLength(1);
    expect(convertedWrapped[0].function.name).toBe('updateCell');
    expect(convertedWrapped[0].function.parameters.type).toBe('object');
    expect(convertedWrapped[0].function.parameters.required).toEqual(['rowId', 'field', 'value']);
  });

  it('creates structured response_format definition correctly', () => {
    const resFormat = createStructuredResponseFormat('paperExtraction', {
      type: 'OBJECT',
      properties: {
        findings: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['findings'],
    });

    expect(resFormat.type).toBe('json_schema');
    expect(resFormat.json_schema.name).toBe('paperExtraction');
    expect(resFormat.json_schema.strict).toBe(true);
    expect(resFormat.json_schema.schema.type).toBe('object');
    expect(resFormat.json_schema.schema.properties.findings.type).toBe('array');
  });
});

describe('Provider Configuration Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with gemini as default provider', () => {
    expect(getActiveProvider()).toBe('gemini');
  });

  it('persists switching to lmstudio provider', () => {
    setActiveProvider('lmstudio');
    expect(getActiveProvider()).toBe('lmstudio');
    expect(localStorage.getItem('LITSIFT_LLM_PROVIDER')).toBe('lmstudio');

    setActiveProvider('gemini');
    expect(getActiveProvider()).toBe('gemini');
  });

  it('manages LM Studio Base URL and models', () => {
    expect(getLmStudioBaseUrl()).toBe(DEFAULT_LMSTUDIO_URL);

    setLmStudioBaseUrl('http://192.168.1.50:1234/v1');
    expect(getLmStudioBaseUrl()).toBe('http://192.168.1.50:1234/v1');

    setLmStudioModel('qwen2.5-14b-instruct');
    expect(getLmStudioModel()).toBe('qwen2.5-14b-instruct');

    setLmStudioReasoningEffort('high');
    expect(getLmStudioReasoningEffort()).toBe('high');
  });

  it('formats active model label accurately for UI header and badges', () => {
    setActiveProvider('gemini');
    expect(getActiveModelLabel()).toContain('gemini');

    setActiveProvider('lmstudio');
    setLmStudioModel('qwen2.5-14b-instruct');
    expect(getActiveModelLabel()).toBe('LM: qwen2.5-14b-instruct');

    setLmStudioModel('');
    expect(getActiveModelLabel()).toBe('LM Studio');
  });
});

describe('LM Studio HTTP and Streaming Service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('checks LM Studio connection and returns model list on 200 OK', async () => {
    const mockModels = {
      data: [
        { id: 'qwen2.5-14b-instruct', object: 'model' },
        { id: 'deepseek-r1-distill-qwen-14b', object: 'model' },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockModels,
    } as any);

    const result = await checkLmStudioConnection('http://localhost:1234/v1');
    expect(result.ok).toBe(true);
    expect(result.models).toHaveLength(2);
    expect(result.models[0].id).toBe('qwen2.5-14b-instruct');
  });

  it('handles LM Studio connection failure gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const result = await checkLmStudioConnection('http://localhost:1234/v1');
    expect(result.ok).toBe(false);
    expect(result.models).toHaveLength(0);
    expect(result.error).toContain('Connection refused');
  });

  it('parses SSE streaming turns, separates thoughts, and accumulates tool calls', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"Let me examine the paper methods."}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":" The user wants extractions."}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"extractPDFData","arguments":"{\\"targetPdfTitle\\": \\"Paper A\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":150,"completion_tokens":45}}\n\n',
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

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    } as any);

    const streamedEvents: any[] = [];
    const turnResult = await streamLmStudioChatTurn({
      messages: [{ role: 'user', content: 'Extract findings from Paper A' }],
      tools: [],
      onStream: (chunk) => streamedEvents.push(chunk),
    });

    expect(turnResult.thought).toBe('Let me examine the paper methods. The user wants extractions.');
    expect(turnResult.toolCalls).toHaveLength(1);
    expect(turnResult.toolCalls![0].function?.name).toBe('extractPDFData');
    expect(turnResult.toolCalls![0].function?.arguments).toBe('{"targetPdfTitle": "Paper A"}');
    expect(turnResult.usage?.prompt_tokens).toBe(150);
    expect(turnResult.usage?.completion_tokens).toBe(45);
  });

  it('parses inline <think> tags when local model does not use reasoning_content', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"role":"assistant","content":"<think>Evaluating sample size and methodology</think>Based on the paper, the sample size is N=450."}}]}\n\n',
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

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    } as any);

    const turnResult = await streamLmStudioChatTurn({
      messages: [{ role: 'user', content: 'What is the sample size?' }],
    });

    expect(turnResult.thought).toBe('Evaluating sample size and methodology');
    expect(turnResult.text.trim()).toBe('Based on the paper, the sample size is N=450.');
  });

  it('executes structured generation with automatic fallback to json_object if json_schema is rejected', async () => {
    const jsonOutput = JSON.stringify({
      rows: [{ sampleSize: 'N=120', outcome: 'Positive' }],
    });

    // First call rejects with 400 (unsupported response_format schema), second succeeds with 200
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'json_schema response_format not supported by this model',
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: jsonOutput } }],
          usage: { prompt_tokens: 300, completion_tokens: 60 },
        }),
      } as any);

    const result = await executeLmStudioStructuredGeneration({
      schemaName: 'testSchema',
      schema: { type: 'OBJECT', properties: { rows: { type: 'ARRAY' } } },
      messages: [{ role: 'user', content: 'Extract rows' }],
    });

    expect(result.rawText).toBe(jsonOutput);
    expect(result.parsed.rows[0].sampleSize).toBe('N=120');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
