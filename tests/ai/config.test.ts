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

  it('defaults to groq when AI_PROVIDER is unset and groq key exists', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      GROQ_API_KEY: 'new-groq-key',
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

  it('prefers GROQ_API_KEY over legacy groq key env vars', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      GROQ_API_KEY: 'canonical-key',
      AI_GROQ_API_KEY: 'legacy-key',
      GROQ_MODEL: 'legacy-model',
      AI_GROQ_MODEL: 'canonical-model',
    };

    const { resolveAiApiKey, resolveAiRuntimeConfigOrThrow, resolveAiModel } = await import('@/lib/ai/config');

    expect(resolveAiApiKey('groq')).toBe('canonical-key');
    expect(resolveAiModel('groq')).toBe('canonical-model');

    const runtime = resolveAiRuntimeConfigOrThrow();
    expect(runtime.apiKeySource).toBe('GROQ_API_KEY');
    expect(runtime.warnings).toEqual([
      'Multiple Groq API key env vars are set. Using GROQ_API_KEY.',
    ]);
  });

  it('uses legacy groq key env var when canonical key is absent', async () => {
    process.env = {
      NODE_ENV: originalEnv.NODE_ENV,
      AI_PROVIDER: 'groq',
      AI_GROQ_API_KEY: 'legacy-key',
    };

    const { resolveAiApiKey, resolveAiRuntimeConfigOrThrow } = await import('@/lib/ai/config');

    expect(resolveAiApiKey('groq')).toBe('legacy-key');
    const runtime = resolveAiRuntimeConfigOrThrow();
    expect(runtime.apiKeySource).toBe('AI_GROQ_API_KEY');
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
      GROQ_API_KEY: 'groq-key',
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
