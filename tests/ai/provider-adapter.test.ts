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
      GROQ_API_KEY: 'test-groq-key',
      OPENAI_API_KEY: 'test-openai-key',
      AI_GROQ_MODEL: 'llama-3.3-70b',
      AI_PROVIDER_TIMEOUT_MS: '2000',
    };

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'req_groq_1',
        model: 'llama-3.3-70b',
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
    expect(result.model).toBe('llama-3.3-70b');
    expect(result.requestId).toBe('req_groq_1');
  });

  it('normalizes provider failures without exposing raw payload details', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      GROQ_API_KEY: 'test-groq-key',
      AI_GROQ_MODEL: 'llama-3.3-70b',
      AI_PROVIDER_TIMEOUT_MS: '2000',
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429,
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
      expect(runtimeError.code).toBe('AI_PROVIDER_UNAVAILABLE');
      expect(runtimeError.details).toEqual(
        expect.objectContaining({
          provider: 'groq',
          status: 429,
          requestId: 'req_err_1',
        }),
      );
      expect((runtimeError.details as Record<string, unknown>)?.payload).toBeUndefined();
    }
  });
});
