import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const appUrl = process.env.CREDVIA_APP_URL?.trim() || 'http://localhost:3000';
const secret = process.env.AI_WORKER_SECRET?.trim();
const pollIntervalMs = Number(process.env.AI_WORKER_POLL_INTERVAL_MS || '3000');
const batchSize = Number(process.env.AI_WORKER_BATCH_SIZE || '5');
const leaseSeconds = Number(process.env.AI_WORKER_LEASE_SECONDS || '45');

function resolveProvider() {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === 'groq' || explicit === 'openai' || explicit === 'anthropic') {
    return explicit;
  }

  const groqKey = process.env.GROQ_API_KEY
    || process.env.AI_GROQ_API_KEY
    || process.env.GROQ_KEY
    || process.env.GROQ_TOKEN
    || process.env.LLM_API_KEY;

  if (groqKey) {
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
    appUrl,
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
    try {
      const response = await fetch(`${appUrl}/api/v1/ai/worker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-worker-secret': secret,
        },
        body: JSON.stringify({}),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        console.error(
          JSON.stringify({
            scope: 'ai-worker-loop',
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
            claimed: result?.claimed ?? 0,
            succeeded: result?.succeeded ?? 0,
            retried: result?.retried ?? 0,
            failed: result?.failed ?? 0,
            timestamp: new Date().toISOString(),
          }),
        );
      }
    } catch (error) {
      console.error('AI worker loop error', error instanceof Error ? error.message : String(error));
    }

    await sleep(pollIntervalMs);
  }
}

await run();
