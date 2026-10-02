/**
 * LM Studio Client Service
 * High-performance, native fetch-based client for LM Studio's local OpenAI-compatible API.
 */

import { getEffectiveLmStudioUrl, getLmStudioModel, getLmStudioReasoningEffort } from './providerConfig';
import { safeJsonParse } from './agentToolRegistry';
import { createStructuredResponseFormat } from './schemaConverter';

export interface LmStudioModelInfo {
  id: string;
  name?: string;
  owned_by?: string;
}

export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

export interface StreamTurnResult {
  text: string;
  thought?: string;
  functionCalls: Array<{
    id?: string;
    name: string;
    args: Record<string, any>;
    function?: {
      name: string;
      arguments: string;
    };
  }>;
  toolCalls?: Array<{
    id?: string;
    name: string;
    args: Record<string, any>;
    function?: {
      name: string;
      arguments: string;
    };
  }>;
  rawToolCalls?: any[];
  usage?: {
    promptTokens?: number;
    candidateTokens?: number;
    totalTokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Fetch available/loaded models from LM Studio local server.
 */
export async function listLmStudioModels(baseUrl?: string): Promise<LmStudioModelInfo[]> {
  const url = `${getEffectiveLmStudioUrl(baseUrl)}/models`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to query LM Studio models: HTTP ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const models = data?.data || [];
  return models.map((m: any) => ({
    id: m.id,
    name: m.id,
    owned_by: m.owned_by,
  }));
}

/**
 * Quick health and connection verification with LM Studio server.
 */
export async function checkLmStudioConnection(baseUrl?: string): Promise<{
  ok: boolean;
  models: LmStudioModelInfo[];
  activeModel?: string;
  error?: string;
}> {
  try {
    const models = await listLmStudioModels(baseUrl);
    return {
      ok: true,
      models,
      activeModel: models[0]?.id,
    };
  } catch (err: any) {
    return {
      ok: false,
      models: [],
      error: err.message || 'Cannot connect to LM Studio server.',
    };
  }
}

/**
 * Execute a streaming chat turn with LM Studio, capturing text, thought reasoning,
 * and accumulating streaming tool call deltas.
 */
export async function streamLmStudioChatTurn(options: {
  messages: OpenAiMessage[];
  tools?: any[];
  model?: string;
  temperature?: number;
  baseUrl?: string;
  signal?: AbortSignal;
  onStream?: (chunk: {
    textChunk?: string;
    thoughtChunk?: string;
    fullText: string;
    fullThoughtText: string;
  }) => void;
}): Promise<StreamTurnResult> {
  const effectiveBase = getEffectiveLmStudioUrl(options.baseUrl);
  const targetModel = options.model || getLmStudioModel() || '';
  const reasoningEffort = getLmStudioReasoningEffort();

  const payload: Record<string, any> = {
    model: targetModel,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
    stream: true,
  };

  // Add tools if provided
  if (options.tools && options.tools.length > 0) {
    payload.tools = options.tools;
    payload.tool_choice = 'auto';
  }

  // Include reasoning_effort if supported
  if (reasoningEffort) {
    payload.reasoning_effort = reasoningEffort;
  }

  const endpoint = `${effectiveBase}/chat/completions`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!res.ok) {
    let errBody = '';
    try {
      errBody = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`LM Studio error (HTTP ${res.status}): ${errBody || res.statusText}`);
  }

  if (!res.body) {
    throw new Error('LM Studio returned empty response body.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let fullAnswerText = '';
  let fullThoughtText = '';
  let insideThinkTag = false;

  // Tool calls accumulator indexed by delta index
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
    sseBuffer = lines.pop() || ''; // Keep partial line

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(':')) continue; // Skip comments and empty lines
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

      // 1. Check for dedicated reasoning_content delta (DeepSeek / Qwen reasoning format)
      if (delta.reasoning_content) {
        const thoughtChunk = delta.reasoning_content;
        fullThoughtText += thoughtChunk;
        options.onStream?.({
          thoughtChunk,
          fullText: fullAnswerText,
          fullThoughtText,
        });
      }

      // 2. Check for standard content delta
      if (delta.content) {
        let contentChunk = delta.content as string;

        // Parse inline <think> tags robustly even if tags span or co-exist in chunks
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

      // 3. Accumulate tool_calls deltas
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
 * Execute a structured generation request with LM Studio (used by extractPDFData & verifyEvidenceCitation).
 */
export async function executeLmStudioStructuredGeneration<T = any>(options: {
  schemaName: string;
  schema: any;
  messages: OpenAiMessage[];
  model?: string;
  temperature?: number;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<{ data: T; parsed: T; usage?: any; rawText: string }> {
  const effectiveBase = getEffectiveLmStudioUrl(options.baseUrl);
  const targetModel = options.model || getLmStudioModel() || '';

  const formatPayload = createStructuredResponseFormat(options.schemaName, options.schema);

  const requestBody: Record<string, any> = {
    model: targetModel,
    messages: options.messages,
    temperature: options.temperature ?? 0.1,
    response_format: formatPayload,
    stream: false,
  };

  const endpoint = `${effectiveBase}/chat/completions`;

  let res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: options.signal,
  });

  // Fallback: If local server rejects "json_schema" response_format, retry with standard "json_object"
  if (!res.ok && res.status === 400) {
    const fallbackBody = {
      ...requestBody,
      response_format: { type: 'json_object' },
    };

    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(fallbackBody),
      signal: options.signal,
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LM Studio structured generation failed (HTTP ${res.status}): ${errText || res.statusText}`);
  }

  const json = await res.json();
  const rawText = json.choices?.[0]?.message?.content || '';
  if (!rawText) {
    throw new Error('LM Studio returned empty content for structured extraction.');
  }

  const parsed = safeJsonParse<T>(rawText);
  return {
    data: parsed,
    parsed,
    usage: json.usage,
    rawText,
  };
}
