import { z } from 'zod';
import { AiRuntimeError } from '@/lib/ai/errors';
import type { AiFeature } from '@/lib/ai/contracts';

const AiProviderSchema = z.enum(['openai', 'anthropic', 'groq']);

const AiEnvSchema = z.object({
  AI_PROVIDER: z.string().trim().optional(),
  LLM_PROVIDER: z.string().trim().optional(),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
  GROQ_API_KEY: z.string().trim().min(1).optional(),
  AI_GROQ_API_KEY: z.string().trim().min(1).optional(),
  GROQ_KEY: z.string().trim().min(1).optional(),
  GROQ_TOKEN: z.string().trim().min(1).optional(),
  LLM_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_BASE_URL: z.string().trim().url().optional(),
  GROQ_BASE_URL: z.string().trim().url().optional(),
  AI_GROQ_BASE_URL: z.string().trim().url().optional(),
  GROQ_API_BASE_URL: z.string().trim().url().optional(),
  GROQ_API_BASE: z.string().trim().url().optional(),
  GROQ_API_URL: z.string().trim().url().optional(),
  AI_OPENAI_MODEL: z.string().trim().min(1).optional(),
  AI_ANTHROPIC_MODEL: z.string().trim().min(1).optional(),
  AI_GROQ_MODEL: z.string().trim().min(1).optional(),
  GROQ_MODEL: z.string().trim().min(1).optional(),
  AI_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).optional(),
  AI_PROMPT_VERSION_FOUNDER: z.string().trim().min(1).max(80).optional(),
  AI_PROMPT_VERSION_CAREER: z.string().trim().min(1).max(80).optional(),
  AI_PROMPT_VERSION_MODERATION: z.string().trim().min(1).max(80).optional(),
  AI_FEATURE_FOUNDER_ENABLED: z.string().trim().optional(),
  AI_FEATURE_CAREER_ENABLED: z.string().trim().optional(),
  AI_FEATURE_MODERATION_ENABLED: z.string().trim().optional(),
  AI_WORKER_BATCH_SIZE: z.coerce.number().int().positive().max(100).optional(),
  AI_WORKER_LEASE_SECONDS: z.coerce.number().int().positive().max(600).optional(),
  AI_WORKER_MAX_RETRIES: z.coerce.number().int().positive().max(10).optional(),
  AI_WORKER_TIMEOUT_MS: z.coerce.number().int().positive().max(300000).optional(),
  AI_WORKER_BACKOFF_BASE_MS: z.coerce.number().int().positive().max(60000).optional(),
  AI_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().max(60000).optional(),
  AI_WORKER_SECRET: z.string().trim().min(1).optional(),
});

export type AiProvider = z.infer<typeof AiProviderSchema>;
type ParsedAiEnv = z.infer<typeof AiEnvSchema>;

const GROQ_API_KEY_ENV_PRIORITY: ReadonlyArray<keyof ParsedAiEnv> = [
  'GROQ_API_KEY',
  'AI_GROQ_API_KEY',
  'GROQ_KEY',
  'GROQ_TOKEN',
  'LLM_API_KEY',
];

const GROQ_BASE_URL_ENV_PRIORITY: ReadonlyArray<keyof ParsedAiEnv> = [
  'GROQ_BASE_URL',
  'AI_GROQ_BASE_URL',
  'GROQ_API_BASE_URL',
  'GROQ_API_BASE',
  'GROQ_API_URL',
];

const GROQ_MODEL_ENV_PRIORITY: ReadonlyArray<keyof ParsedAiEnv> = [
  'AI_GROQ_MODEL',
  'GROQ_MODEL',
];

export interface AiEnvResolution {
  value: string | null;
  source: string | null;
  populatedSources: string[];
}

export interface ResolvedAiRuntimeConfig {
  provider: AiProvider;
  apiKey: string;
  apiKeySource: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  warnings: string[];
}

export interface AiRuntimeDiagnostics {
  provider: AiProvider | 'unconfigured';
  providerConfigured: boolean;
  workerSecretConfigured: boolean;
  model: string | null;
  timeoutMs: number;
}

function parseAiEnv() {
  return AiEnvSchema.parse({
    AI_PROVIDER: process.env.AI_PROVIDER,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    AI_GROQ_API_KEY: process.env.AI_GROQ_API_KEY,
    GROQ_KEY: process.env.GROQ_KEY,
    GROQ_TOKEN: process.env.GROQ_TOKEN,
    LLM_API_KEY: process.env.LLM_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    GROQ_BASE_URL: process.env.GROQ_BASE_URL,
    AI_GROQ_BASE_URL: process.env.AI_GROQ_BASE_URL,
    GROQ_API_BASE_URL: process.env.GROQ_API_BASE_URL,
    GROQ_API_BASE: process.env.GROQ_API_BASE,
    GROQ_API_URL: process.env.GROQ_API_URL,
    AI_OPENAI_MODEL: process.env.AI_OPENAI_MODEL,
    AI_ANTHROPIC_MODEL: process.env.AI_ANTHROPIC_MODEL,
    AI_GROQ_MODEL: process.env.AI_GROQ_MODEL,
    GROQ_MODEL: process.env.GROQ_MODEL,
    AI_PROVIDER_TIMEOUT_MS: process.env.AI_PROVIDER_TIMEOUT_MS,
    AI_PROMPT_VERSION_FOUNDER: process.env.AI_PROMPT_VERSION_FOUNDER,
    AI_PROMPT_VERSION_CAREER: process.env.AI_PROMPT_VERSION_CAREER,
    AI_PROMPT_VERSION_MODERATION: process.env.AI_PROMPT_VERSION_MODERATION,
    AI_FEATURE_FOUNDER_ENABLED: process.env.AI_FEATURE_FOUNDER_ENABLED,
    AI_FEATURE_CAREER_ENABLED: process.env.AI_FEATURE_CAREER_ENABLED,
    AI_FEATURE_MODERATION_ENABLED: process.env.AI_FEATURE_MODERATION_ENABLED,
    AI_WORKER_BATCH_SIZE: process.env.AI_WORKER_BATCH_SIZE,
    AI_WORKER_LEASE_SECONDS: process.env.AI_WORKER_LEASE_SECONDS,
    AI_WORKER_MAX_RETRIES: process.env.AI_WORKER_MAX_RETRIES,
    AI_WORKER_TIMEOUT_MS: process.env.AI_WORKER_TIMEOUT_MS,
    AI_WORKER_BACKOFF_BASE_MS: process.env.AI_WORKER_BACKOFF_BASE_MS,
    AI_WORKER_POLL_INTERVAL_MS: process.env.AI_WORKER_POLL_INTERVAL_MS,
    AI_WORKER_SECRET: process.env.AI_WORKER_SECRET,
  });
}

function parseProvider(raw: string | undefined | null): AiProvider | null {
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'openai' || normalized === 'anthropic' || normalized === 'groq') {
    return normalized;
  }

  return null;
}

function resolveByPriority(
  env: ParsedAiEnv,
  priority: ReadonlyArray<keyof ParsedAiEnv>,
): AiEnvResolution {
  const populatedSources: string[] = [];

  for (const key of priority) {
    const value = env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      populatedSources.push(String(key));
    }
  }

  const source = populatedSources[0] ?? null;
  const value = source
    ? String(env[source as keyof ParsedAiEnv]).trim()
    : null;

  return {
    value,
    source,
    populatedSources,
  };
}

function resolveGroqApiKey(env: ParsedAiEnv): AiEnvResolution {
  return resolveByPriority(env, GROQ_API_KEY_ENV_PRIORITY);
}

function resolveGroqBaseUrl(env: ParsedAiEnv): AiEnvResolution {
  return resolveByPriority(env, GROQ_BASE_URL_ENV_PRIORITY);
}

function resolveGroqModel(env: ParsedAiEnv): AiEnvResolution {
  return resolveByPriority(env, GROQ_MODEL_ENV_PRIORITY);
}

function getProviderApiKeyEnvNames(provider: AiProvider): string[] {
  if (provider === 'openai') {
    return ['OPENAI_API_KEY'];
  }

  if (provider === 'anthropic') {
    return ['ANTHROPIC_API_KEY'];
  }

  return GROQ_API_KEY_ENV_PRIORITY.map((name) => String(name));
}

function readBoolean(input: string | undefined) {
  if (!input) {
    return true;
  }

  const normalized = input.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off' && normalized !== 'no';
}

export function resolveAiProvider(): AiProvider | null {
  const env = parseAiEnv();

  if (env.AI_PROVIDER && env.AI_PROVIDER.length > 0) {
    const explicitProvider = parseProvider(env.AI_PROVIDER);
    if (!explicitProvider) {
      throw new AiRuntimeError(
        'AI_PROVIDER_NOT_CONFIGURED',
        'AI_PROVIDER must be one of: openai, anthropic, groq.',
        503,
        {
          setting: 'AI_PROVIDER',
        },
      );
    }

    return explicitProvider;
  }

  if (resolveGroqApiKey(env).value) {
    return 'groq';
  }

  if (env.OPENAI_API_KEY) {
    return 'openai';
  }

  if (env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }

  return null;
}

export function resolveAiModel(provider: AiProvider): string {
  const env = parseAiEnv();

  if (provider === 'openai') {
    return env.AI_OPENAI_MODEL ?? 'gpt-4.1-mini';
  }

  if (provider === 'anthropic') {
    return env.AI_ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest';
  }

  return resolveGroqModel(env).value ?? 'llama-3.3-70b';
}

export function resolveAiProviderBaseUrl(provider: AiProvider): string {
  const env = parseAiEnv();

  if (provider === 'openai') {
    return env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  }

  if (provider === 'groq') {
    return resolveGroqBaseUrl(env).value ?? 'https://api.groq.com/openai/v1';
  }

  return 'https://api.anthropic.com/v1';
}

export function resolveAiApiKey(provider: AiProvider): string | null {
  const env = parseAiEnv();

  if (provider === 'openai') {
    return env.OPENAI_API_KEY ?? null;
  }

  if (provider === 'anthropic') {
    return env.ANTHROPIC_API_KEY ?? null;
  }

  return resolveGroqApiKey(env).value;
}

export function resolveAiTimeoutMs() {
  const env = parseAiEnv();
  return env.AI_PROVIDER_TIMEOUT_MS ?? 30000;
}

export function resolvePromptVersion(feature: AiFeature): string {
  const env = parseAiEnv();

  if (feature === 'founder_idea_feedback') {
    return env.AI_PROMPT_VERSION_FOUNDER ?? 'founder-v1';
  }

  if (feature === 'career_copilot') {
    return env.AI_PROMPT_VERSION_CAREER ?? 'career-v1';
  }

  return env.AI_PROMPT_VERSION_MODERATION ?? 'moderation-v1';
}

export function isAiFeatureEnabled(feature: AiFeature): boolean {
  const env = parseAiEnv();

  if (feature === 'founder_idea_feedback') {
    return readBoolean(env.AI_FEATURE_FOUNDER_ENABLED);
  }

  if (feature === 'career_copilot') {
    return readBoolean(env.AI_FEATURE_CAREER_ENABLED);
  }

  return readBoolean(env.AI_FEATURE_MODERATION_ENABLED);
}

export function getAiWorkerConfig() {
  const env = parseAiEnv();

  return {
    batchSize: env.AI_WORKER_BATCH_SIZE ?? 5,
    leaseSeconds: env.AI_WORKER_LEASE_SECONDS ?? 45,
    maxRetries: env.AI_WORKER_MAX_RETRIES ?? 3,
    timeoutMs: env.AI_WORKER_TIMEOUT_MS ?? 45000,
    backoffBaseMs: env.AI_WORKER_BACKOFF_BASE_MS ?? 2000,
    pollIntervalMs: env.AI_WORKER_POLL_INTERVAL_MS ?? 3000,
  } as const;
}

export function isAiWorkerSecretConfigured() {
  const env = parseAiEnv();
  return Boolean(env.AI_WORKER_SECRET && env.AI_WORKER_SECRET.trim().length > 0);
}

export function assertAiWorkerSecretConfigured() {
  if (!isAiWorkerSecretConfigured()) {
    throw new AiRuntimeError(
      'AI_EXECUTOR_UNAVAILABLE',
      'AI worker secret is not configured.',
      503,
      {
        requiredEnvVars: ['AI_WORKER_SECRET'],
      },
      'Set AI_WORKER_SECRET and retry.',
    );
  }
}

export function getAiRuntimeDiagnostics(): AiRuntimeDiagnostics {
  const provider = resolveAiProvider();

  if (!provider) {
    return {
      provider: 'unconfigured',
      providerConfigured: false,
      workerSecretConfigured: isAiWorkerSecretConfigured(),
      model: null,
      timeoutMs: resolveAiTimeoutMs(),
    };
  }

  return {
    provider,
    providerConfigured: isAiProviderConfigured(provider),
    workerSecretConfigured: isAiWorkerSecretConfigured(),
    model: resolveAiModel(provider),
    timeoutMs: resolveAiTimeoutMs(),
  };
}

export function isAiProviderConfigured(provider: AiProvider): boolean {
  const env = parseAiEnv();

  if (provider === 'openai') {
    return Boolean(env.OPENAI_API_KEY);
  }

  if (provider === 'anthropic') {
    return Boolean(env.ANTHROPIC_API_KEY);
  }

  return Boolean(resolveGroqApiKey(env).value);
}

export function resolveAiRuntimeConfigOrThrow(): ResolvedAiRuntimeConfig {
  const env = parseAiEnv();
  const provider = resolveAiProvider();

  if (!provider) {
    throw new AiRuntimeError(
      'AI_PROVIDER_NOT_CONFIGURED',
      'No AI provider credentials were found.',
      503,
      {
        providerSetting: 'AI_PROVIDER',
        recommendedProvider: 'groq',
        requiredEnvVars: [
          'GROQ_API_KEY',
          'OPENAI_API_KEY',
          'ANTHROPIC_API_KEY',
        ],
      },
      'Set AI_PROVIDER=groq and configure GROQ_API_KEY.',
    );
  }

  const apiKey = resolveAiApiKey(provider);
  if (!apiKey) {
    throw new AiRuntimeError(
      'AI_PROVIDER_NOT_CONFIGURED',
      `Provider ${provider} is selected but no API key is configured.`,
      503,
      {
        provider,
        requiredEnvVars: getProviderApiKeyEnvNames(provider),
      },
      `Configure ${getProviderApiKeyEnvNames(provider)[0]} and retry.`,
    );
  }

  const warnings: string[] = [];
  let apiKeySource: string;

  if (provider === 'groq') {
    const resolution = resolveGroqApiKey(env);
    apiKeySource = resolution.source ?? 'GROQ_API_KEY';

    if (resolution.populatedSources.length > 1) {
      warnings.push(
        `Multiple Groq API key env vars are set. Using ${resolution.source}.`,
      );
    }
  } else if (provider === 'openai') {
    apiKeySource = 'OPENAI_API_KEY';
  } else {
    apiKeySource = 'ANTHROPIC_API_KEY';
  }

  return {
    provider,
    apiKey,
    apiKeySource,
    model: resolveAiModel(provider),
    baseUrl: resolveAiProviderBaseUrl(provider),
    timeoutMs: resolveAiTimeoutMs(),
    warnings,
  };
}
