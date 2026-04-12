import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeProviderForStructuredOutput } from '@/lib/ai/provider-adapter';
import { AiRuntimeError } from '@/lib/ai/errors';

describe('provider adapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
      AI_OPENAI_MODEL: 'gpt-test',
      AI_PROVIDER_TIMEOUT_MS: '2000',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('normalizes OpenAI-style response metadata', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'req_123',
        model: 'gpt-test-2026-01-01',
        usage: {
          prompt_tokens: 12,
          completion_tokens: 34,
          total_tokens: 46,
        },
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '{"ok":true}',
            },
          },
        ],
      }),
    }));

    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeProviderForStructuredOutput({
      systemPrompt: 'You are a JSON API.',
      userPrompt: 'Return {"ok": true}',
      responseFormatInstructions: 'Respond as JSON.',
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-test');
    expect(result.modelVersion).toBe('gpt-test-2026-01-01');
    expect(result.outputText).toBe('{"ok":true}');
    expect(result.requestId).toBe('req_123');
    expect(result.providerMetadata.usage).toEqual({
      inputTokens: 12,
      outputTokens: 34,
      totalTokens: 46,
    });
  });

  it('uses Groq as default provider when AI_PROVIDER is not set and Groq credentials exist', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: '',
      AI_GROQ_API_KEY: 'test-groq-key',
      OPENAI_API_KEY: 'test-openai-key',
      AI_GROQ_MODEL: 'llama-3.3-70b-versatile',
      AI_PROVIDER_TIMEOUT_MS: '2000',
    };

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'req_groq_1',
        model: 'llama-3.3-70b-versatile',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '{"ok":true}',
            },
          },
        ],
      }),
    }));

    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeProviderForStructuredOutput({
      systemPrompt: 'You are a JSON API.',
      userPrompt: 'Return {"ok": true}',
      responseFormatInstructions: 'Respond as JSON.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.any(Object),
    );
    expect(result.provider).toBe('groq');
    expect(result.model).toBe('llama-3.3-70b-versatile');
    expect(result.requestId).toBe('req_groq_1');
  });

  it('normalizes groq base URL to the canonical OpenAI-compatible endpoint', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      AI_GROQ_API_KEY: 'test-groq-key',
      GROQ_BASE_URL: 'https://api.groq.com/v1',
      AI_GROQ_MODEL: 'llama-3.3-70b-versatile',
      AI_PROVIDER_TIMEOUT_MS: '2000',
    };

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'req_groq_2',
        model: 'llama-3.3-70b-versatile',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '{"ok":true}',
            },
          },
        ],
      }),
    }));

    vi.stubGlobal('fetch', fetchMock);

    await invokeProviderForStructuredOutput({
      systemPrompt: 'You are a JSON API.',
      userPrompt: 'Return {"ok": true}',
      responseFormatInstructions: 'Respond as JSON.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.any(Object),
    );
  });

  it('normalizes provider failures without exposing raw payload details', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      AI_GROQ_API_KEY: 'test-groq-key',
      AI_GROQ_MODEL: 'llama-3.3-70b-versatile',
      AI_PROVIDER_TIMEOUT_MS: '2000',
      AI_PROVIDER_MAX_RETRIES: '0',
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({
        'retry-after': '7',
        'x-ratelimit-remaining-requests': '0',
        'x-request-id': 'req_hdr_429',
      }),
      json: async () => ({
        id: 'req_err_1',
        error: {
          message: 'rate limited',
          type: 'rate_limit_error',
        },
      }),
    })));

    try {
      await invokeProviderForStructuredOutput({
        systemPrompt: 'You are a JSON API.',
        userPrompt: 'Return {"ok": true}',
        responseFormatInstructions: 'Respond as JSON.',
      });
      throw new Error('Expected invokeProviderForStructuredOutput to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AiRuntimeError);
      const runtimeError = error as AiRuntimeError;
      expect(runtimeError.code).toBe('RATE_LIMITED');
      expect(runtimeError.message).toBe('AI review is temporarily rate-limited. Please retry in a few seconds.');
      expect(runtimeError.details).toEqual(
        expect.objectContaining({
          provider: 'groq',
          status: 429,
          requestId: 'req_hdr_429',
          retryAfterSeconds: 7,
          rateLimitHeaders: expect.objectContaining({
            'retry-after': '7',
            'x-ratelimit-remaining-requests': '0',
          }),
        }),
      );
      expect((runtimeError.details as Record<string, unknown>)?.payload).toBeUndefined();
    }
  });

  it('times out provider calls with typed timeout failure', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
      AI_OPENAI_MODEL: 'gpt-test',
      AI_PROVIDER_TIMEOUT_MS: '15',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        const signal = init?.signal;

        if (!signal) {
          return;
        }

        signal.addEventListener(
          'abort',
          () => {
            const abortError = new Error('The operation was aborted.');
            abortError.name = 'AbortError';
            reject(abortError);
          },
          { once: true },
        );
      })),
    );

    await expect(
      invokeProviderForStructuredOutput({
        systemPrompt: 'You are a JSON API.',
        userPrompt: 'Return {"ok": true}',
        responseFormatInstructions: 'Respond as JSON.',
      }),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      status: 504,
    });
  });

  it('fails with AI_OUTPUT_INVALID when provider returns empty content', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
      AI_OPENAI_MODEL: 'gpt-test',
      AI_PROVIDER_TIMEOUT_MS: '2000',
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'req_empty_1',
        model: 'gpt-test-2026-03-01',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '',
            },
          },
        ],
      }),
    })));

    await expect(
      invokeProviderForStructuredOutput({
        systemPrompt: 'You are a JSON API.',
        userPrompt: 'Return {"ok": true}',
        responseFormatInstructions: 'Respond as JSON.',
      }),
    ).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
    });
  });

  it('retries transient provider responses and succeeds on subsequent attempt', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
      AI_OPENAI_MODEL: 'gpt-test',
      AI_PROVIDER_MAX_RETRIES: '2',
      AI_PROVIDER_TIMEOUT_MS: '2000',
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ id: 'req_retry_1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'req_retry_2',
          model: 'gpt-test-2026-02-01',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: '{"ok":true}',
              },
            },
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18,
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeProviderForStructuredOutput({
      systemPrompt: 'You are a JSON API.',
      userPrompt: 'Return {"ok": true}',
      responseFormatInstructions: 'Respond as JSON.',
      traceId: 'trace-provider-retry',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.requestId).toBe('req_retry_2');
    expect(result.providerMetadata).toEqual(
      expect.objectContaining({
        attemptCount: 2,
      }),
    );
  });

  it('returns deterministic provider-unavailable error for 403 permission failures', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      AI_GROQ_API_KEY: 'test-groq-key',
      AI_GROQ_MODEL: 'llama-3.3-70b-versatile',
      AI_PROVIDER_TIMEOUT_MS: '2000',
      AI_PROVIDER_MAX_RETRIES: '2',
    };

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers({
        'x-request-id': 'req-403-1',
      }),
      json: async () => ({
        id: 'req-403-body',
        error: {
          message: 'permission denied',
          type: 'permission_error',
        },
      }),
    }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      invokeProviderForStructuredOutput({
        systemPrompt: 'You are a JSON API.',
        userPrompt: 'Return {"ok": true}',
        responseFormatInstructions: 'Respond as JSON.',
      }),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      status: 503,
      details: expect.objectContaining({
        status: 403,
        requestId: 'req-403-1',
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 500 provider failures up to maxRetries and then fails', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
      AI_OPENAI_MODEL: 'gpt-test',
      AI_PROVIDER_TIMEOUT_MS: '2000',
      AI_PROVIDER_MAX_RETRIES: '2',
    };

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({
        'x-request-id': 'req-500-1',
      }),
      json: async () => ({
        id: 'req-500-body',
        error: {
          message: 'provider internal failure',
        },
      }),
    }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      invokeProviderForStructuredOutput({
        systemPrompt: 'You are a JSON API.',
        userPrompt: 'Return {"ok": true}',
        responseFormatInstructions: 'Respond as JSON.',
      }),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      status: 503,
      details: expect.objectContaining({
        status: 500,
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
