/**
 * OpenRouter Client Service
 * High-performance, native fetch client for OpenRouter's OpenAI-compatible API gateway.
 * Supports qwen/qwen3.8-27b:free, DeepSeek-R1, Claude 3.7, and 300+ frontier models.
 */

import {
  getOpenRouterApiKey,
  getOpenRouterBaseUrl,
  getOpenRouterModel,
  DEFAULT_OPENROUTER_MODEL,
  getModelReasoningCapability,
  getThinkingEnabled,
  getLmStudioReasoningEffort,
} from './providerConfig';
import { safeJsonParse } from './agentToolRegistry';
import { createStructuredResponseFormat } from './schemaConverter';
import { OpenAiMessage, StreamTurnResult } from './lmStudioService';

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  context_length?: number;
  pricing?: {
    prompt: string | number;
    completion: string | number;
  };
  supportsTools: boolean;
  supportsReasoning: boolean;
}

export const CURATED_OPENROUTER_PRESETS: Array<{
  id: string;
  name: string;
  badge: string;
  context: string;
  pricing: string;
  description: string;
}> = [
  {
    id: 'qwen/qwen3.8-27b:free',
    name: 'Qwen 3.8 27B (Free)',
    badge: 'Recommended',
    context: '262K tokens',
    pricing: 'Free ($0.00)',
    description: 'Dense 27B vision-language model with native tool-calling & reasoning.',
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1 (Free)',
    badge: 'Reasoning',
    context: '64K-128K tokens',
    pricing: 'Free ($0.00)',
    description: 'State-of-the-art chain-of-thought mathematical and logical deduction.',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B (Free)',
    badge: 'Fast',
    context: '128K tokens',
    pricing: 'Free ($0.00)',
    description: 'Meta 70B open weight instruction tuned model for high-throughput synthesis.',
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    badge: 'Frontier',
    context: '200K tokens',
    pricing: '$3.00 / M prompt',
    description: 'Anthropic frontier model with hybrid reasoning and flawless tool execution.',
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3',
    badge: 'Affordable',
    context: '64K tokens',
    pricing: '$0.14 / M prompt',
    description: 'Ultra-low cost high intelligence general scientific model.',
  },
];

/**
 * Extract clean, human-readable error messages from OpenRouter response payloads.
 */
export function extractOpenRouterErrorMessage(status: number, rawBody: string, statusText: string): string {
  let detail = rawBody || statusText || 'Unknown error';
  try {
    const parsed = JSON.parse(rawBody);
    const rawMsg = parsed?.error?.metadata?.raw || parsed?.error?.message;
    if (rawMsg) {
      detail = rawMsg;
    }
  } catch {
    // rawBody is plain text or HTML
  }
  return `OpenRouter API call failed (HTTP ${status}): ${detail}`;
}

/**
 * Fetch models from OpenRouter and verify API key connectivity.
 */
export async function checkOpenRouterConnection(
  apiKeyParam?: string,
  baseUrlParam?: string
): Promise<{
  ok: boolean;
  models: OpenRouterModelInfo[];
  error?: string;
}> {
  const apiKey = apiKeyParam ?? getOpenRouterApiKey();
  const baseUrl = (baseUrlParam ?? getOpenRouterBaseUrl()).trim().replace(/\/+$/, '');

  if (!apiKey) {
    return {
      ok: false,
      models: [],
      error: 'OpenRouter API key is required. Paste your key in Settings.',
    };
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://litsift.local',
        'X-Title': 'LitSift Literature Synthesis',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        models: [],
        error: extractOpenRouterErrorMessage(res.status, errText, res.statusText),
      };
    }

    const data = await res.json();
    const rawList: any[] = data?.data || [];

    const models: OpenRouterModelInfo[] = rawList.map((m) => {
      const params: string[] = m.supported_parameters || [];
      const hasTools = params.includes('tools') || params.includes('function_calling');
      const hasReasoning = params.includes('reasoning') || params.includes('include_reasoning');
      return {
        id: m.id,
        name: m.name || m.id,
        context_length: m.context_length,
        pricing: m.pricing,
        supportsTools: hasTools,
        supportsReasoning: hasReasoning,
      };
    });

    return {
      ok: true,
      models,
    };
  } catch (err: any) {
    return {
      ok: false,
      models: [],
      error: `Connection to OpenRouter failed: ${err.message || 'Network error'}`,
    };
  }
}

/**
 * Streaming Chat Completion with OpenRouter supporting tool deltas and reasoning content.
 */
export async function streamOpenRouterChatTurn(options: {
  messages: OpenAiMessage[];
  tools?: any[];
  model?: string;
  temperature?: number;
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  onStream?: (chunk: {
    textChunk?: string;
    thoughtChunk?: string;
    fullText: string;
    fullThoughtText: string;
    toolCallChunk?: { name?: string; argumentsChunk?: string };
  }) => void;
}): Promise<StreamTurnResult> {
  const apiKey = options.apiKey ?? getOpenRouterApiKey();
  const baseUrl = (options.baseUrl ?? getOpenRouterBaseUrl()).trim().replace(/\/+$/, '');
  const model = options.model || getOpenRouterModel() || DEFAULT_OPENROUTER_MODEL;

  if (!apiKey) {
    throw new Error('OpenRouter API key is missing. Please set your key in Settings.');
  }

  const requestBody: Record<string, any> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
    stream: true,
  };

  // Apply model-aware reasoning configuration
  const capability = getModelReasoningCapability(model);
  if (capability === 'binary') {
    if (!getThinkingEnabled()) {
      requestBody.reasoning = { effort: 'none' };
    } else {
      requestBody.reasoning = { exclude: false };
    }
  } else if (capability === 'tiered') {
    const effort = getLmStudioReasoningEffort();
    if (effort) {
      requestBody.reasoning = { effort };
    }
  }

  if (options.tools && options.tools.length > 0) {
    requestBody.tools = options.tools;
    requestBody.tool_choice = 'auto';
  }

  const endpoint = `${baseUrl}/chat/completions`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://litsift.local',
      'X-Title': 'LitSift Literature Synthesis',
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(requestBody),
    signal: options.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(extractOpenRouterErrorMessage(res.status, errText, res.statusText));
  }

  if (!res.body) {
    throw new Error('OpenRouter returned an empty response body stream.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let fullAnswerText = '';
  let fullThoughtText = '';
  let insideThinkTag = false;

  const accumulatedToolCalls: Record<number, { id: string; name: string; arguments: string }> = {};

  let sseBuffer = '';
  let finalUsage: any = null;

  while (true) {
    if (options.signal?.aborted) {
      reader.cancel();
      break;
    }

    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split('\n');
    sseBuffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(':')) continue;
      if (!line.startsWith('data:')) continue;

      const dataStr = line.slice(5).trim();
      if (dataStr === '[DONE]') continue;

      let chunkJson: any;
      try {
        chunkJson = JSON.parse(dataStr);
      } catch {
        continue;
      }

      if (chunkJson.usage) {
        finalUsage = chunkJson.usage;
      }

      const choice = chunkJson.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (!delta) continue;

      // 1. Capture dedicated reasoning content (DeepSeek / Qwen OpenRouter reasoning tokens)
      if (delta.reasoning_content || delta.reasoning) {
        const thoughtChunk = (delta.reasoning_content || delta.reasoning) as string;
        fullThoughtText += thoughtChunk;
        options.onStream?.({
          thoughtChunk,
          fullText: fullAnswerText,
          fullThoughtText,
        });
      }

      // 2. Capture standard content delta with robust inline think tag parsing
      if (delta.content) {
        let contentChunk = delta.content as string;

        while (contentChunk.length > 0) {
          if (!insideThinkTag) {
            const thinkStartIdx = contentChunk.indexOf('<think>');
            if (thinkStartIdx !== -1) {
              const before = contentChunk.slice(0, thinkStartIdx);
              if (before) {
                fullAnswerText += before;
                options.onStream?.({
                  textChunk: before,
                  fullText: fullAnswerText,
                  fullThoughtText,
                });
              }
              insideThinkTag = true;
              contentChunk = contentChunk.slice(thinkStartIdx + 7);
            } else {
              fullAnswerText += contentChunk;
              options.onStream?.({
                textChunk: contentChunk,
                fullText: fullAnswerText,
                fullThoughtText,
              });
              contentChunk = '';
            }
          } else {
            const thinkEndIdx = contentChunk.indexOf('</think>');
            if (thinkEndIdx !== -1) {
              const thoughtPart = contentChunk.slice(0, thinkEndIdx);
              if (thoughtPart) {
                fullThoughtText += thoughtPart;
                options.onStream?.({
                  thoughtChunk: thoughtPart,
                  fullText: fullAnswerText,
                  fullThoughtText,
                });
              }
              insideThinkTag = false;
              contentChunk = contentChunk.slice(thinkEndIdx + 8);
            } else {
              fullThoughtText += contentChunk;
              options.onStream?.({
                thoughtChunk: contentChunk,
                fullText: fullAnswerText,
                fullThoughtText,
              });
              contentChunk = '';
            }
          }
        }
      }

      // 3. Accumulate tool call deltas
      if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!accumulatedToolCalls[idx]) {
            accumulatedToolCalls[idx] = {
              id: tc.id || `call_${idx}_${Date.now()}`,
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            };
          } else {
            if (tc.id) accumulatedToolCalls[idx].id = tc.id;
            if (tc.function?.name) accumulatedToolCalls[idx].name += tc.function.name;
            if (tc.function?.arguments) accumulatedToolCalls[idx].arguments += tc.function.arguments;
          }
          options.onStream?.({
            fullText: fullAnswerText,
            fullThoughtText,
            toolCallChunk: {
              name: accumulatedToolCalls[idx].name,
              argumentsChunk: tc.function?.arguments,
            },
          });
        }
      }
    }
  }

  // Finalize parsed function calls
  const parsedFunctionCalls: Array<{
    id?: string;
    name: string;
    args: Record<string, any>;
    function?: {
      name: string;
      arguments: string;
    };
  }> = [];

  for (const item of Object.values(accumulatedToolCalls)) {
    if (!item.name) continue;
    let parsedArgs: Record<string, any> = {};
    try {
      parsedArgs = safeJsonParse(item.arguments, {});
    } catch {
      parsedArgs = {};
    }

    parsedFunctionCalls.push({
      id: item.id,
      name: item.name,
      args: parsedArgs,
      function: {
        name: item.name,
        arguments: item.arguments,
      },
    });
  }

  return {
    text: fullAnswerText.trim(),
    thought: fullThoughtText.trim() || undefined,
    functionCalls: parsedFunctionCalls,
    toolCalls: parsedFunctionCalls,
    usage: finalUsage
      ? {
          promptTokens: finalUsage.prompt_tokens,
          candidateTokens: finalUsage.completion_tokens,
          totalTokens: finalUsage.total_tokens,
          prompt_tokens: finalUsage.prompt_tokens,
          completion_tokens: finalUsage.completion_tokens,
          total_tokens: finalUsage.total_tokens,
        }
      : undefined,
  };
}

/**
 * Execute structured generation request with OpenRouter (used by extractPDFData & verifyEvidenceCitation).
 */
export async function executeOpenRouterStructuredGeneration<T = any>(options: {
  schemaName: string;
  schema: any;
  messages: OpenAiMessage[];
  model?: string;
  temperature?: number;
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<{ data: T; parsed: T; usage?: any; rawText: string }> {
  const apiKey = options.apiKey ?? getOpenRouterApiKey();
  const baseUrl = (options.baseUrl ?? getOpenRouterBaseUrl()).trim().replace(/\/+$/, '');
  const targetModel = options.model || getOpenRouterModel() || DEFAULT_OPENROUTER_MODEL;

  if (!apiKey) {
    throw new Error('OpenRouter API key is missing. Please set your key in Settings.');
  }

  const formatPayload = createStructuredResponseFormat(options.schemaName, options.schema);

  const requestBody: Record<string, any> = {
    model: targetModel,
    messages: options.messages,
    temperature: options.temperature ?? 0.1,
    response_format: formatPayload,
    stream: false,
  };

  // Apply model-aware reasoning configuration
  const capability = getModelReasoningCapability(targetModel);
  if (capability === 'binary') {
    if (!getThinkingEnabled()) {
      requestBody.reasoning = { effort: 'none' };
    }
  } else if (capability === 'tiered') {
    const effort = getLmStudioReasoningEffort();
    if (effort) {
      requestBody.reasoning = { effort };
    }
  }

  const endpoint = `${baseUrl}/chat/completions`;

  let res: Response | null = null;
  const MAX_RETRIES = 2;
  const DELAYS = [3000, 6000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://litsift.local',
        'X-Title': 'LitSift Literature Synthesis',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: options.signal,
    });

    if (res.status === 429 && attempt < MAX_RETRIES && !options.signal?.aborted) {
      await new Promise((r) => setTimeout(r, DELAYS[attempt]));
      continue;
    }
    break;
  }

  if (!res) {
    throw new Error('OpenRouter structured generation failed to receive response.');
  }

  // Fallback: If provider rejects "json_schema" response_format, retry with standard "json_object"
  if (!res.ok && res.status === 400) {
    const fallbackBody = {
      ...requestBody,
      response_format: { type: 'json_object' },
    };

    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://litsift.local',
        'X-Title': 'LitSift Literature Synthesis',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(fallbackBody),
      signal: options.signal,
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(extractOpenRouterErrorMessage(res.status, errText, res.statusText));
  }

  const json = await res.json();
  const rawText = json.choices?.[0]?.message?.content || '';
  if (!rawText) {
    throw new Error('OpenRouter returned empty content for structured extraction.');
  }

  const parsed = safeJsonParse<T>(rawText);
  return {
    data: parsed,
    parsed,
    usage: json.usage,
    rawText,
  };
}
