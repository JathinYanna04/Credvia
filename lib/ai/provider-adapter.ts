import {
  resolveAiRuntimeConfigOrThrow,
  type ResolvedAiRuntimeConfig,
  type AiProvider,
} from '@/lib/ai/config';
import { AiRuntimeError } from '@/lib/ai/errors';
import { logInfo } from '@/lib/utils/logger';

export interface ProviderInvocationInput {
  systemPrompt: string;
  userPrompt: string;
  responseFormatInstructions: string;
  temperature?: number;
  traceId?: string;
  maxTokens?: number;
}

export interface ProviderInvocationResult {
  provider: AiProvider;
  model: string;
  modelVersion: string;
  outputText: string;
  requestId: string | null;
  latencyMs: number;
  providerMetadata: Record<string, unknown>;
}

interface OpenAiLikeResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface AnthropicResponse {
  id?: string;
  model?: string;
  stop_reason?: string | null;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

function normalizeContent(
  content: string | Array<{ type?: string; text?: string }> | undefined,
) {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((entry) => (entry.type === 'text' && typeof entry.text === 'string' ? entry.text : ''))
    .join('')
    .trim();
}

function withTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function toProviderError(
  provider: AiProvider,
  model: string,
  status: number,
  requestId: string | null,
) {
  return new AiRuntimeError(
    'AI_PROVIDER_UNAVAILABLE',
    `Provider ${provider} rejected the request (${status}).`,
    503,
    {
      provider,
      model,
      status,
      requestId,
    },
    'Retry the request or switch provider credentials.',
  );
}

function extractRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  return typeof record.id === 'string' ? record.id : null;
}

async function callOpenAiCompatibleProvider(
  provider: 'openai' | 'groq',
  runtimeConfig: ResolvedAiRuntimeConfig,
  input: ProviderInvocationInput,
): Promise<ProviderInvocationResult> {
  const baseUrl = runtimeConfig.baseUrl;
  const timeoutMs = runtimeConfig.timeoutMs;
  const model = runtimeConfig.model;
  const start = Date.now();
  const timeout = withTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: timeout.signal,
      headers: {
        Authorization: `Bearer ${runtimeConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 1800,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              input.systemPrompt.trim(),
              'Return strict JSON only. Do not include markdown fences.',
              input.responseFormatInstructions.trim(),
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
          {
            role: 'user',
            content: input.userPrompt,
          },
        ],
      }),
    });

    const payload = (await response.json().catch(() => null)) as OpenAiLikeResponse | null;

    if (!response.ok || !payload) {
      throw toProviderError(provider, model, response.status, extractRequestId(payload));
    }

    const outputText = normalizeContent(payload.choices?.[0]?.message?.content);

    if (!outputText) {
      throw new AiRuntimeError(
        'AI_OUTPUT_INVALID',
        'Provider returned an empty output payload.',
        502,
        {
          provider,
          model,
          requestId: payload.id ?? null,
        },
      );
    }

    const latencyMs = Date.now() - start;
    const normalizedModel = payload.model ?? model;

    logInfo('ai-provider', 'AI provider invocation succeeded', {
      traceId: input.traceId ?? null,
      provider,
      model: normalizedModel,
      requestId: payload.id ?? null,
      latencyMs,
    });

    return {
      provider,
      model,
      modelVersion: normalizedModel,
      outputText,
      requestId: payload.id ?? null,
      latencyMs,
      providerMetadata: {
        requestId: payload.id ?? null,
        finishReason: payload.choices?.[0]?.finish_reason ?? null,
        usage: payload.usage
          ? {
              inputTokens: payload.usage.prompt_tokens ?? null,
              outputTokens: payload.usage.completion_tokens ?? null,
              totalTokens: payload.usage.total_tokens ?? null,
            }
          : null,
      },
    };
  } catch (error) {
    if (error instanceof AiRuntimeError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiRuntimeError(
        'AI_PROVIDER_UNAVAILABLE',
        `Provider request timed out after ${timeoutMs}ms.`,
        504,
        { provider, model, timeoutMs },
      );
    }

    throw new AiRuntimeError(
      'AI_PROVIDER_UNAVAILABLE',
      `Provider invocation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      503,
      { provider, model },
    );
  } finally {
    timeout.clear();
  }
}

async function callAnthropicProvider(
  runtimeConfig: ResolvedAiRuntimeConfig,
  input: ProviderInvocationInput,
): Promise<ProviderInvocationResult> {
  const provider: AiProvider = 'anthropic';
  const baseUrl = runtimeConfig.baseUrl;
  const timeoutMs = runtimeConfig.timeoutMs;
  const model = runtimeConfig.model;
  const start = Date.now();
  const timeout = withTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      signal: timeout.signal,
      headers: {
        'x-api-key': runtimeConfig.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 1800,
        system: [
          input.systemPrompt.trim(),
          'Return strict JSON only. Do not include markdown fences.',
          input.responseFormatInstructions.trim(),
        ]
          .filter(Boolean)
          .join('\n\n'),
        messages: [
          {
            role: 'user',
            content: input.userPrompt,
          },
        ],
      }),
    });

    const payload = (await response.json().catch(() => null)) as AnthropicResponse | null;

    if (!response.ok || !payload) {
      throw toProviderError(provider, model, response.status, extractRequestId(payload));
    }

    const outputText = normalizeContent(payload.content);

    if (!outputText) {
      throw new AiRuntimeError(
        'AI_OUTPUT_INVALID',
        'Provider returned an empty output payload.',
        502,
        {
          provider,
          model,
          requestId: payload.id ?? null,
        },
      );
    }

    const latencyMs = Date.now() - start;
    const normalizedModel = payload.model ?? model;

    logInfo('ai-provider', 'AI provider invocation succeeded', {
      traceId: input.traceId ?? null,
      provider,
      model: normalizedModel,
      requestId: payload.id ?? null,
      latencyMs,
    });

    return {
      provider,
      model,
      modelVersion: normalizedModel,
      outputText,
      requestId: payload.id ?? null,
      latencyMs,
      providerMetadata: {
        requestId: payload.id ?? null,
        finishReason: payload.stop_reason ?? null,
        usage: payload.usage
          ? {
              inputTokens: payload.usage.input_tokens ?? null,
              outputTokens: payload.usage.output_tokens ?? null,
            }
          : null,
      },
    };
  } catch (error) {
    if (error instanceof AiRuntimeError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiRuntimeError(
        'AI_PROVIDER_UNAVAILABLE',
        `Provider request timed out after ${timeoutMs}ms.`,
        504,
        { provider, model, timeoutMs },
      );
    }

    throw new AiRuntimeError(
      'AI_PROVIDER_UNAVAILABLE',
      `Provider invocation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      503,
      { provider, model },
    );
  } finally {
    timeout.clear();
  }
}

export async function invokeProviderForStructuredOutput(
  input: ProviderInvocationInput,
): Promise<ProviderInvocationResult> {
  const runtimeConfig = resolveAiRuntimeConfigOrThrow();

  if (runtimeConfig.warnings.length > 0) {
    logInfo('ai-provider', 'AI provider configuration warnings', {
      provider: runtimeConfig.provider,
      apiKeySource: runtimeConfig.apiKeySource,
      warnings: runtimeConfig.warnings,
    });
  }

  if (runtimeConfig.provider === 'openai' || runtimeConfig.provider === 'groq') {
    return callOpenAiCompatibleProvider(runtimeConfig.provider, runtimeConfig, input);
  }

  return callAnthropicProvider(runtimeConfig, input);
}
