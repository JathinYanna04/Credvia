import nextEnv from '@next/env';
import {
  resolveWorkerLoopAppUrl,
  WorkerLoopOriginResolutionError,
} from './ai-worker-loop-origin.mjs';
import {
  MAX_JITTER_MS,
  MAX_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
  resolveWorkerLoopConfig,
} from './ai-worker-loop-config.mjs';

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

let appUrlResolution;

try {
  appUrlResolution = await resolveWorkerLoopAppUrl({
    env: process.env,
  });
} catch (error) {
  const normalized = error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack ?? null,
      }
    : {
        name: null,
        message: String(error),
        stack: null,
      };

  const details = error instanceof WorkerLoopOriginResolutionError
    ? error.details
    : null;

  console.error(
    JSON.stringify({
      scope: 'ai-worker-loop-startup-fatal',
      errorName: normalized.name,
      errorMessage: normalized.message,
      errorStack: normalized.stack,
      attemptedUrls: Array.isArray(details?.attemptedUrls) ? details.attemptedUrls : [],
      probeResults: details?.probeResults ?? [],
      timestamp: new Date().toISOString(),
    }),
  );

  process.exit(1);
}

const { appUrl } = appUrlResolution;
const workerEndpoint = `${appUrl}/api/v1/ai/worker`;
const secret = process.env.AI_WORKER_SECRET?.trim();
const {
  pollIntervalMs,
  pollJitterMs,
  batchSize,
  leaseSeconds,
  parallelism,
} = resolveWorkerLoopConfig(process.env);

function resolveProvider() {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === 'groq' || explicit === 'openai' || explicit === 'anthropic') {
    return explicit;
  }

  if (process.env.AI_GROQ_API_KEY) {
    return 'groq';
  }

  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }

  return 'unconfigured';
}

console.info(
  JSON.stringify({
    scope: 'ai-worker-loop-startup',
    provider: resolveProvider(),
    workerSecretConfigured: Boolean(secret),
    batchSize,
    leaseSeconds,
    pollIntervalMs,
    pollJitterMs,
    parallelism,
    appUrl,
    appUrlSource: appUrlResolution.source,
    probeTimeoutMs: appUrlResolution.probeTimeoutMs,
    probeResults: appUrlResolution.probeResults,
    workerEndpoint,
    timestamp: new Date().toISOString(),
  }),
);

if (!secret) {
  console.error('AI_WORKER_SECRET is required to run the AI worker loop.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const requestMethod = 'POST';
    const requestBody = {
      batchSize,
      leaseSeconds,
      parallelism,
    };
    const requestHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
      'x-ai-worker-secret': secret,
    };

    const requestHeadersForLog = {
      'Content-Type': requestHeaders['Content-Type'],
      Authorization: 'Bearer ***',
      'x-ai-worker-secret': '***',
    };

    console.info(
      JSON.stringify({
        scope: 'ai-worker-loop-request',
        url: workerEndpoint,
        method: requestMethod,
        headers: requestHeadersForLog,
        body: requestBody,
        timestamp: new Date().toISOString(),
      }),
    );

    try {
      const response = await fetch(workerEndpoint, {
        method: requestMethod,
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        console.error(
          JSON.stringify({
            scope: 'ai-worker-loop',
            url: workerEndpoint,
            method: requestMethod,
            status: response.status,
            errorCode: payload?.error?.code ?? null,
            errorMessage: payload?.error?.message ?? 'Worker request failed.',
            timestamp: new Date().toISOString(),
          }),
        );
      } else {
        const result = payload?.data?.result;
        console.info(
          JSON.stringify({
            scope: 'ai-worker-loop',
            url: workerEndpoint,
            method: requestMethod,
            claimed: result?.claimed ?? 0,
            succeeded: result?.succeeded ?? 0,
            retried: result?.retried ?? 0,
            failed: result?.failed ?? 0,
            timestamp: new Date().toISOString(),
          }),
        );
      }
    } catch (error) {
      const normalizedError = error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack ?? null,
          }
        : {
            name: null,
            message: String(error),
            stack: null,
          };

      console.error(
        JSON.stringify({
          scope: 'ai-worker-loop-error',
          url: workerEndpoint,
          method: requestMethod,
          headers: requestHeadersForLog,
          errorName: normalizedError.name,
          errorMessage: normalizedError.message,
          errorStack: normalizedError.stack,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    const jitterDeltaMs = pollJitterMs > 0
      ? Math.round((Math.random() * 2 - 1) * pollJitterMs)
      : 0;
    const nextPollDelayMs = Math.min(
      MAX_POLL_INTERVAL_MS,
      Math.max(MIN_POLL_INTERVAL_MS, pollIntervalMs + jitterDeltaMs),
    );

    console.info(
      JSON.stringify({
        scope: 'ai-worker-loop-wait',
        pollIntervalMs,
        pollJitterMs,
        jitterDeltaMs,
        nextPollDelayMs,
        timestamp: new Date().toISOString(),
      }),
    );

    await sleep(nextPollDelayMs);
  }
}

await run();
