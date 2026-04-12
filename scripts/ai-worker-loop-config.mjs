export const MIN_POLL_INTERVAL_MS = 8000;
export const MAX_POLL_INTERVAL_MS = 12000;
export const MAX_JITTER_MS = 2000;

function toFiniteNumber(rawValue, fallbackValue) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

export function resolveWorkerLoopConfig(env = process.env) {
  const configuredPollIntervalMs = toFiniteNumber(env.AI_WORKER_POLL_INTERVAL_MS, 10000);
  const pollIntervalMs = Math.min(
    MAX_POLL_INTERVAL_MS,
    Math.max(MIN_POLL_INTERVAL_MS, configuredPollIntervalMs),
  );

  const configuredPollJitterMs = toFiniteNumber(env.AI_WORKER_POLL_JITTER_MS, MAX_JITTER_MS);
  const pollJitterMs = Math.min(
    MAX_JITTER_MS,
    Math.max(0, configuredPollJitterMs),
  );

  const configuredBatchSize = toFiniteNumber(env.AI_WORKER_BATCH_SIZE, 1);
  const batchSize = Math.min(2, Math.max(1, configuredBatchSize));

  const leaseSeconds = toFiniteNumber(env.AI_WORKER_LEASE_SECONDS, 45);

  const configuredParallelism = toFiniteNumber(env.AI_WORKER_PARALLELISM, 1);
  const parallelism = Math.min(batchSize, Math.min(2, Math.max(1, configuredParallelism)));

  return {
    pollIntervalMs,
    pollJitterMs,
    batchSize,
    leaseSeconds,
    parallelism,
  };
}
