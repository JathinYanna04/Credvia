import {
  resolveAiRuntimeConfigOrThrow,
  type ResolvedAiRuntimeConfig,
  type AiProvider,
} from '@/lib/ai/config';
import { AiRuntimeError } from '@/lib/ai/errors';
import { logError, logInfo } from '@/lib/utils/logger';

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

interface RateLimitMetadata {
  headers: Record<string, string> | null;
  retryAfterSeconds: number | null;
}

const RATE_LIMIT_USER_MESSAGE = 'AI review is temporarily rate-limited. Please retry in a few seconds.';
const DEFAULT_MAX_TOKENS = 900;
const MIN_MAX_TOKENS = 800;
const MAX_MAX_TOKENS = 1000;
const MAX_PROMPT_TOKENS = 5000;

const RETRYABLE_ERROR_PATTERNS = [
  'und_err_connect_timeout',
  'und_err_socket',
  'econnreset',
  'etimedout',
  'socket',
  'network',
  'fetch failed',
  'connection closed',
  'timeout',
];

function computeRetryBackoffMs(attempt: number) {
  const cappedBase = Math.min(3000, 200 * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 120);
  return cappedBase + jitter;
}

function toTokenEstimate(charCount: number) {
  return Math.max(0, Math.ceil(charCount / 4));
}

function resolveRequestedMaxTokens(rawMaxTokens: number | undefined) {
  const parsed = Number(rawMaxTokens);
  const normalized = Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_MAX_TOKENS;

  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, normalized));
}

function toApiKeyFingerprint(apiKey: string) {
  const trimmed = apiKey.trim();

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

async function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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

function trimTrailingSlashes(input: string) {
  return input.replace(/\/+$/, '');
}

function normalizeOpenAiCompatibleBaseUrl(provider: 'openai' | 'groq', baseUrl: string) {
  if (provider === 'groq') {
    return 'https://api.groq.com/openai/v1';
  }

  return trimTrailingSlashes(baseUrl);
}

function redactAuthorizationHeader(value: string) {
  if (value.startsWith('Bearer ')) {
    return 'Bearer ***';
  }

  return '***';
}

function serializeHeadersForLog(headers: unknown): Record<string, string> | null {
  if (!headers || typeof headers !== 'object') {
    return null;
  }

  const record: Record<string, string> = {};
  const candidate = headers as Headers;

  if (typeof candidate.forEach !== 'function') {
    return null;
  }

  candidate.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });

  return Object.keys(record).length > 0 ? record : null;
}

function parseRetryAfterSeconds(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const asSeconds = Number.parseInt(trimmed, 10);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds;
  }

  const asDate = Date.parse(trimmed);
  if (Number.isNaN(asDate)) {
    return null;
  }

  const diffMs = asDate - Date.now();
  if (diffMs <= 0) {
    return 0;
  }

  return Math.ceil(diffMs / 1000);
}

function extractRateLimitMetadata(
  responseHeaders: Record<string, string> | null,
): RateLimitMetadata {
  if (!responseHeaders) {
    return {
      headers: null,
      retryAfterSeconds: null,
    };
  }

  const candidateKeys = [
    'retry-after',
    'x-ratelimit-limit-requests',
    'x-ratelimit-remaining-requests',
    'x-ratelimit-reset-requests',
    'x-ratelimit-limit-tokens',
    'x-ratelimit-remaining-tokens',
    'x-ratelimit-reset-tokens',
  ] as const;

  const extracted: Record<string, string> = {};
  for (const key of candidateKeys) {
    const value = responseHeaders[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      extracted[key] = value;
    }
  }

  return {
    headers: Object.keys(extracted).length > 0 ? extracted : null,
    retryAfterSeconds: parseRetryAfterSeconds(extracted['retry-after']),
  };
}

function toProviderError(
  provider: AiProvider,
  model: string,
  status: number,
  requestId: string | null,
  context?: Record<string, unknown>,
) {
  const isRateLimited = status === 429;
  const message = isRateLimited
    ? RATE_LIMIT_USER_MESSAGE
    : `Provider ${provider} rejected the request (${status}).`;

  return new AiRuntimeError(
    isRateLimited ? 'RATE_LIMITED' : 'AI_PROVIDER_UNAVAILABLE',
    message,
    503,
    {
      provider,
      model,
      status,
      requestId,
      ...(context ?? {}),
    },
    isRateLimited
      ? RATE_LIMIT_USER_MESSAGE
      : 'Retry the request or switch provider credentials.',
  );
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableError(error: unknown) {
  if (error instanceof AiRuntimeError) {
    const status = Number((error.details as { status?: unknown } | undefined)?.status ?? 0);
    if (isRetryableStatus(status) || error.status === 504) {
      return true;
    }

    const message = error.message.toLowerCase();
    return RETRYABLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return RETRYABLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
  }

  return false;
}

function resolveRetryDelayMs(error: AiRuntimeError, attempt: number) {
  const details = (error.details as Record<string, unknown> | undefined) ?? {};
  const status = Number(details.status ?? 0);
  const retryAfterSeconds = Number(details.retryAfterSeconds ?? 0);
  const hasRetryAfter = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0;

  // For provider 429 responses, honor Retry-After exactly when present.
  if (status === 429 && hasRetryAfter) {
    return retryAfterSeconds * 1000;
  }

  return Math.min(120000, computeRetryBackoffMs(attempt));
}

function normalizeProviderError(
  error: unknown,
  provider: AiProvider,
  model: string,
  timeoutMs: number,
) {
  if (error instanceof AiRuntimeError) {
    return error;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new AiRuntimeError(
      'AI_PROVIDER_UNAVAILABLE',
      `Provider request timed out after ${timeoutMs}ms.`,
      504,
      { provider, model, timeoutMs },
    );
  }

  return new AiRuntimeError(
    'AI_PROVIDER_UNAVAILABLE',
    `Provider invocation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    503,
    { provider, model },
  );
}

function extractRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  return typeof record.id === 'string' ? record.id : null;
}

async function invokeWithRetries(
  args: {
    provider: AiProvider;
    model: string;
    maxRetries: number;
    timeoutMs: number;
    traceId?: string;
  },
  invokeAttempt: (attempt: number) => Promise<ProviderInvocationResult>,
): Promise<ProviderInvocationResult> {
  const startedAt = Date.now();
  const totalAttempts = Math.max(1, args.maxRetries + 1);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();

    logInfo('ai-provider', 'AI provider invocation started', {
      traceId: args.traceId ?? null,
      provider: args.provider,
      model: args.model,
      attempt,
      maxRetries: args.maxRetries,
    });

    try {
      const result = await invokeAttempt(attempt);
      const totalDurationMs = Date.now() - startedAt;

      logInfo('ai-provider', 'AI provider invocation succeeded', {
        traceId: args.traceId ?? null,
        provider: args.provider,
        model: result.modelVersion,
        requestId: result.requestId,
        attempt,
        durationMs: Date.now() - attemptStartedAt,
        totalDurationMs,
      });

      return {
        ...result,
        latencyMs: totalDurationMs,
        providerMetadata: {
          ...result.providerMetadata,
          attemptCount: attempt,
        },
      };
    } catch (error) {
      const normalized = normalizeProviderError(error, args.provider, args.model, args.timeoutMs);
      const retryable = attempt < totalAttempts && isRetryableError(normalized);
      lastError = normalized;

      if (retryable) {
        const retryDelayMs = resolveRetryDelayMs(normalized, attempt);
        const details = (normalized.details as Record<string, unknown> | undefined) ?? {};
        const retryAfterSeconds = Number(
          details.retryAfterSeconds ?? 0,
        );
        const rateLimitHeaders = details.rateLimitHeaders
          && typeof details.rateLimitHeaders === 'object'
          ? (details.rateLimitHeaders as Record<string, unknown>)
          : null;

        logInfo('ai-provider', 'AI provider invocation retrying', {
          traceId: args.traceId ?? null,
          provider: args.provider,
          model: args.model,
          attempt,
          nextAttempt: attempt + 1,
          retryDelayMs,
          retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
          rateLimitRemainingTokens:
            typeof rateLimitHeaders?.['x-ratelimit-remaining-tokens'] === 'string'
              ? rateLimitHeaders['x-ratelimit-remaining-tokens']
              : null,
          rateLimitRemainingRequests:
            typeof rateLimitHeaders?.['x-ratelimit-remaining-requests'] === 'string'
              ? rateLimitHeaders['x-ratelimit-remaining-requests']
              : null,
          failureCode: normalized.code,
          failureMessage: normalized.message,
        });

        await sleep(retryDelayMs);

        continue;
      }

      logError('ai-provider', 'AI provider invocation failed', {
        traceId: args.traceId ?? null,
        provider: args.provider,
        model: args.model,
        attempt,
        durationMs: Date.now() - attemptStartedAt,
        failureCode: normalized.code,
        failureMessage: normalized.message,
      });

      throw normalized;
    }
  }

  throw normalizeProviderError(lastError, args.provider, args.model, args.timeoutMs);
}

async function callOpenAiCompatibleProvider(
  provider: 'openai' | 'groq',
  runtimeConfig: ResolvedAiRuntimeConfig,
  input: ProviderInvocationInput,
): Promise<ProviderInvocationResult> {
  const { baseUrl, timeoutMs, model } = runtimeConfig;
  const endpointPath = '/chat/completions';
  const configuredBaseUrl = trimTrailingSlashes(baseUrl);
  const effectiveBaseUrl = normalizeOpenAiCompatibleBaseUrl(provider, configuredBaseUrl);
  const requestUrl = `${effectiveBaseUrl}${endpointPath}`;

  return invokeWithRetries(
    {
      provider,
      model,
      maxRetries: runtimeConfig.maxRetries,
      timeoutMs,
      traceId: input.traceId,
    },
    async () => {
      const timeout = withTimeoutSignal(timeoutMs);
      const requestHeaders = {
        Authorization: `Bearer ${runtimeConfig.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      const requestPayload = {
        model,
        temperature: input.temperature ?? 0.2,
        max_tokens: resolveRequestedMaxTokens(input.maxTokens),
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
      };
      const systemPromptLength = requestPayload.messages[0]?.content?.length ?? 0;
      const userPromptLength = requestPayload.messages[1]?.content?.length ?? 0;
      const totalPromptCharacters = systemPromptLength + userPromptLength;
      const estimatedPromptTokens = toTokenEstimate(totalPromptCharacters);
      const oversizedContext = estimatedPromptTokens > MAX_PROMPT_TOKENS;
      const totalTokensExpected = estimatedPromptTokens + requestPayload.max_tokens;

      if (provider === 'groq' && configuredBaseUrl !== effectiveBaseUrl) {
        logInfo('ai-provider', 'Normalized Groq base URL to canonical OpenAI-compatible endpoint', {
          traceId: input.traceId ?? null,
          configuredBaseUrl,
          effectiveBaseUrl,
        });
      }

      logInfo('ai-provider', 'AI provider HTTP request dispatched', {
        traceId: input.traceId ?? null,
        provider,
        model,
        method: 'POST',
        url: requestUrl,
        endpoint: endpointPath,
        headers: {
          ...requestHeaders,
          Authorization: redactAuthorizationHeader(requestHeaders.Authorization),
        },
        requestBudget: {
          systemPromptLength,
          userPromptLength,
          totalPromptCharacters,
          estimatedPromptTokens,
          maxTokensRequested: requestPayload.max_tokens,
          totalTokensExpected,
          oversizedContext,
        },
        payload: requestPayload,
      });

      try {
        const response = await fetch(requestUrl, {
          method: 'POST',
          signal: timeout.signal,
          headers: requestHeaders,
          body: JSON.stringify(requestPayload),
        });

        const responseClone = typeof (response as { clone?: unknown }).clone === 'function'
          ? response.clone()
          : null;
        const rawResponseBody = responseClone
          ? await responseClone.text().catch(() => null)
          : null;
        const payload = (await response.json().catch(() => null)) as OpenAiLikeResponse | null;
        const responseHeaders = serializeHeadersForLog((response as { headers?: Headers }).headers);
        const requestIdFromHeaders = typeof (response as { headers?: Headers }).headers?.get === 'function'
          ? ((response as { headers?: Headers }).headers?.get('x-request-id')
            ?? (response as { headers?: Headers }).headers?.get('request-id'))
          : null;
        const requestId = requestIdFromHeaders ?? extractRequestId(payload);
        const responseBodyForLog = rawResponseBody
          ?? (payload ? JSON.stringify(payload) : null);
        const rateLimitMetadata = extractRateLimitMetadata(responseHeaders);

        if (!response.ok || !payload) {
          logError('ai-provider', 'AI provider HTTP error response', {
            traceId: input.traceId ?? null,
            provider,
            model,
            method: 'POST',
            url: requestUrl,
            endpoint: endpointPath,
            status: response.status,
            statusText: response.statusText,
            requestId,
            responseHeaders,
            retryAfterSeconds: rateLimitMetadata.retryAfterSeconds,
            rateLimitHeaders: rateLimitMetadata.headers,
            rateLimitRemainingTokens:
              rateLimitMetadata.headers?.['x-ratelimit-remaining-tokens'] ?? null,
            rateLimitRemainingRequests:
              rateLimitMetadata.headers?.['x-ratelimit-remaining-requests'] ?? null,
            responseBody: responseBodyForLog,
          });

          throw toProviderError(provider, model, response.status, requestId, {
            method: 'POST',
            endpoint: endpointPath,
            url: requestUrl,
            statusText: response.statusText,
            retryAfterSeconds: rateLimitMetadata.retryAfterSeconds,
            rateLimitHeaders: rateLimitMetadata.headers,
            rateLimitRemainingTokens:
              rateLimitMetadata.headers?.['x-ratelimit-remaining-tokens'] ?? null,
            rateLimitRemainingRequests:
              rateLimitMetadata.headers?.['x-ratelimit-remaining-requests'] ?? null,
          });
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
              requestId,
            },
          );
        }

        const normalizedModel = payload.model ?? model;

        logInfo('ai-provider', 'AI provider HTTP response received', {
          traceId: input.traceId ?? null,
          provider,
          model: normalizedModel,
          method: 'POST',
          url: requestUrl,
          endpoint: endpointPath,
          status: response.status,
          requestId,
          finishReason: payload.choices?.[0]?.finish_reason ?? null,
          usage: payload.usage ?? null,
        });

        return {
          provider,
          model,
          modelVersion: normalizedModel,
          outputText,
          requestId,
          latencyMs: 0,
          providerMetadata: {
            requestId,
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
        throw normalizeProviderError(error, provider, model, timeoutMs);
      } finally {
        timeout.clear();
      }
    },
  );
}

async function callAnthropicProvider(
  runtimeConfig: ResolvedAiRuntimeConfig,
  input: ProviderInvocationInput,
): Promise<ProviderInvocationResult> {
  const provider: AiProvider = 'anthropic';
  const { baseUrl, timeoutMs, model } = runtimeConfig;

  return invokeWithRetries(
    {
      provider,
      model,
      maxRetries: runtimeConfig.maxRetries,
      timeoutMs,
      traceId: input.traceId,
    },
    async () => {
      const timeout = withTimeoutSignal(timeoutMs);
      const requestUrl = `${baseUrl}/messages`;
      const requestHeaders = {
        'x-api-key': runtimeConfig.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      };
      const requestPayload = {
        model,
        temperature: input.temperature ?? 0.2,
        max_tokens: resolveRequestedMaxTokens(input.maxTokens),
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
      };

      logInfo('ai-provider', 'AI provider HTTP request dispatched', {
        traceId: input.traceId ?? null,
        provider,
        model,
        method: 'POST',
        url: requestUrl,
        headers: {
          ...requestHeaders,
          'x-api-key': '***',
        },
        payload: requestPayload,
      });

      try {
        const response = await fetch(requestUrl, {
          method: 'POST',
          signal: timeout.signal,
          headers: requestHeaders,
          body: JSON.stringify(requestPayload),
        });

        const payload = (await response.json().catch(() => null)) as AnthropicResponse | null;

        if (!response.ok || !payload) {
          logError('ai-provider', 'AI provider HTTP error response', {
            traceId: input.traceId ?? null,
            provider,
            model,
            method: 'POST',
            url: requestUrl,
            status: response.status,
            statusText: response.statusText,
            requestId: payload?.id ?? null,
            responseBody: payload,
          });

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

        const normalizedModel = payload.model ?? model;

        logInfo('ai-provider', 'AI provider HTTP response received', {
          traceId: input.traceId ?? null,
          provider,
          model: normalizedModel,
          method: 'POST',
          url: requestUrl,
          status: response.status,
          requestId: payload.id ?? null,
          finishReason: payload.stop_reason ?? null,
          usage: payload.usage ?? null,
        });

        return {
          provider,
          model,
          modelVersion: normalizedModel,
          outputText,
          requestId: payload.id ?? null,
          latencyMs: 0,
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
        throw normalizeProviderError(error, provider, model, timeoutMs);
      } finally {
        timeout.clear();
      }
    },
  );
}

export async function invokeProviderForStructuredOutput(
  input: ProviderInvocationInput,
): Promise<ProviderInvocationResult> {
  const runtimeConfig = resolveAiRuntimeConfigOrThrow();

  logInfo('ai-provider', 'AI provider selected', {
    traceId: input.traceId ?? null,
    provider: runtimeConfig.provider,
    model: runtimeConfig.model,
    baseUrl: runtimeConfig.baseUrl,
    apiKeySource: runtimeConfig.apiKeySource,
    apiKeyFingerprint: toApiKeyFingerprint(runtimeConfig.apiKey),
    runtimeProcess: process.title,
    runtimePid: process.pid,
    runtimeEnv: process.env.NODE_ENV ?? null,
    timeoutMs: runtimeConfig.timeoutMs,
    maxRetries: runtimeConfig.maxRetries,
  });

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
