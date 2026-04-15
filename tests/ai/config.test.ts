import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ai config resolver', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to groq when AI_PROVIDER is unset and app groq key exists', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_GROQ_API_KEY: 'new-groq-key',
      OPENAI_API_KEY: 'openai-key',
      ANTHROPIC_API_KEY: 'anthropic-key',
    };

    const { resolveAiProvider } = await import('@/lib/ai/config');
    expect(resolveAiProvider()).toBe('groq');
  });

  it('respects explicit AI_PROVIDER even when groq credentials exist', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'openai-key',
      GROQ_API_KEY: 'new-groq-key',
    };

    const { resolveAiProvider } = await import('@/lib/ai/config');
    expect(resolveAiProvider()).toBe('openai');
  });

  it('does not auto-select groq from legacy extractor-oriented key aliases', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      LLM_API_KEY: 'legacy-llm-key',
      GROQ_KEY: 'legacy-groq-key',
      GROQ_TOKEN: 'legacy-groq-token',
      RESUME_EXTRACTOR_GROQ_API_KEY: 'extractor-key',
    };

    const { resolveAiProvider } = await import('@/lib/ai/config');
    expect(resolveAiProvider()).toBeNull();
  });

  it('auto-selects groq when GROQ_API_KEY is set', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      GROQ_API_KEY: 'groq-key',
    };

    const { resolveAiProvider } = await import('@/lib/ai/config');
    expect(resolveAiProvider()).toBe('groq');
  });

  it('prefers AI_GROQ_API_KEY over GROQ_API_KEY for app ai runtime', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      AI_GROQ_API_KEY: 'app-key',
      GROQ_API_KEY: 'fallback-key',
      GROQ_MODEL: 'extractor-model',
      RESUME_EXTRACTOR_GROQ_API_KEY: 'extractor-key',
      AI_GROQ_MODEL: 'llama-3.3-70b-versatile',
    };

    const { resolveAiApiKey, resolveAiRuntimeConfigOrThrow, resolveAiModel } = await import('@/lib/ai/config');

    expect(resolveAiApiKey('groq')).toBe('app-key');
    expect(resolveAiModel('groq')).toBe('llama-3.3-70b-versatile');

    const runtime = resolveAiRuntimeConfigOrThrow();
    expect(runtime.apiKeySource).toBe('AI_GROQ_API_KEY');
    expect(runtime.warnings).toContain('Multiple Groq API key env vars are set. Using AI_GROQ_API_KEY.');
    expect(runtime.warnings).toContain(
      'Legacy Groq key env vars are ignored by app AI runtime: RESUME_EXTRACTOR_GROQ_API_KEY.',
    );
  });

  it('maps legacy groq model aliases to supported model IDs', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      AI_GROQ_API_KEY: 'canonical-key',
      AI_GROQ_MODEL: 'llama-3.3-70b',
    };

    const { resolveAiModel } = await import('@/lib/ai/config');

    expect(resolveAiModel('groq')).toBe('llama-3.3-70b-versatile');
  });

  it('defaults groq model to llama-3.3-70b-versatile when unset', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      AI_GROQ_API_KEY: 'canonical-key',
    };

    const { resolveAiModel } = await import('@/lib/ai/config');

    expect(resolveAiModel('groq')).toBe('llama-3.3-70b-versatile');
  });

  it('ignores GROQ_MODEL for app runtime when AI_GROQ_MODEL is unset', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      AI_GROQ_API_KEY: 'canonical-key',
      GROQ_MODEL: 'llama-3.1-8b-instant',
    };

    const { resolveAiModel, resolveAiRuntimeConfigOrThrow } = await import('@/lib/ai/config');

    expect(resolveAiModel('groq')).toBe('llama-3.3-70b-versatile');
    const runtime = resolveAiRuntimeConfigOrThrow();
    expect(runtime.warnings).toContain(
      'GROQ_MODEL is set but ignored by app AI runtime. Use AI_GROQ_MODEL instead.',
    );
  });

  it('falls back to GROQ_API_KEY when AI_GROQ_API_KEY is absent', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      GROQ_API_KEY: 'fallback-key',
    };

    const { resolveAiApiKey, resolveAiRuntimeConfigOrThrow } = await import('@/lib/ai/config');

    expect(resolveAiApiKey('groq')).toBe('fallback-key');

    const runtime = resolveAiRuntimeConfigOrThrow();
    expect(runtime.provider).toBe('groq');
    expect(runtime.apiKeySource).toBe('GROQ_API_KEY');
  });

  it('resolves openai from AI_OPENAI_API_KEY alias', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'openai',
      AI_OPENAI_API_KEY: 'openai-alias-key',
    };

    const { resolveAiApiKey, resolveAiRuntimeConfigOrThrow } = await import('@/lib/ai/config');

    expect(resolveAiApiKey('openai')).toBe('openai-alias-key');
    expect(resolveAiRuntimeConfigOrThrow().apiKeySource).toBe('AI_OPENAI_API_KEY');
  });

  it('resolves anthropic from AI_ANTHROPIC_API_KEY alias', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'anthropic',
      AI_ANTHROPIC_API_KEY: 'anthropic-alias-key',
    };

    const { resolveAiApiKey, resolveAiRuntimeConfigOrThrow } = await import('@/lib/ai/config');

    expect(resolveAiApiKey('anthropic')).toBe('anthropic-alias-key');
    expect(resolveAiRuntimeConfigOrThrow().apiKeySource).toBe('AI_ANTHROPIC_API_KEY');
  });

  it('does not allow app ai runtime to use extractor-oriented legacy groq key env vars', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      RESUME_EXTRACTOR_GROQ_API_KEY: 'extractor-key',
      LLM_API_KEY: 'legacy-llm-key',
      GROQ_KEY: 'legacy-groq-key',
      GROQ_TOKEN: 'legacy-groq-token',
    };

    const { resolveAiRuntimeConfigOrThrow } = await import('@/lib/ai/config');

    expect(() => resolveAiRuntimeConfigOrThrow()).toThrowError();
  });

  it('throws a typed config error when provider is selected without credentials', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
    };

    const { resolveAiRuntimeConfigOrThrow } = await import('@/lib/ai/config');

    try {
      resolveAiRuntimeConfigOrThrow();
      throw new Error('Expected resolveAiRuntimeConfigOrThrow to throw');
    } catch (error) {
      const runtimeError = error as { code?: string; details?: Record<string, unknown> };
      expect(runtimeError.code).toBe('AI_PROVIDER_NOT_CONFIGURED');
      expect(runtimeError.details).toEqual(
        expect.objectContaining({
          provider: 'groq',
        }),
      );
    }
  });

  it('reports worker secret readiness and throws when missing', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      AI_GROQ_API_KEY: 'groq-key',
    };

    const {
      assertAiWorkerSecretConfigured,
      getAiRuntimeDiagnostics,
      isAiWorkerSecretConfigured,
    } = await import('@/lib/ai/config');

    expect(isAiWorkerSecretConfigured()).toBe(false);

    try {
      assertAiWorkerSecretConfigured();
      throw new Error('Expected assertAiWorkerSecretConfigured to throw');
    } catch (error) {
      const runtimeError = error as { code?: string };
      expect(runtimeError.code).toBe('AI_EXECUTOR_UNAVAILABLE');
    }

    const diagnostics = getAiRuntimeDiagnostics();
    expect(diagnostics.provider).toBe('groq');
    expect(diagnostics.workerSecretConfigured).toBe(false);
  });
});
