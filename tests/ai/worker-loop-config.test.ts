import { describe, expect, it } from 'vitest';
import {
  MAX_JITTER_MS,
  MAX_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
  resolveWorkerLoopConfig,
} from '@/scripts/ai-worker-loop-config.mjs';

describe('worker loop config resolver', () => {
  it('clamps overly aggressive values into safe bounds', () => {
    const config = resolveWorkerLoopConfig({
      AI_WORKER_POLL_INTERVAL_MS: '100',
      AI_WORKER_POLL_JITTER_MS: '99999',
      AI_WORKER_BATCH_SIZE: '50',
      AI_WORKER_LEASE_SECONDS: '45',
      AI_WORKER_PARALLELISM: '99',
    } as NodeJS.ProcessEnv);

    expect(config.pollIntervalMs).toBe(MIN_POLL_INTERVAL_MS);
    expect(config.pollJitterMs).toBe(MAX_JITTER_MS);
    expect(config.batchSize).toBe(2);
    expect(config.parallelism).toBe(2);
  });

  it('clamps low and invalid values to production-safe minimums', () => {
    const config = resolveWorkerLoopConfig({
      AI_WORKER_POLL_INTERVAL_MS: 'not-a-number',
      AI_WORKER_POLL_JITTER_MS: '-50',
      AI_WORKER_BATCH_SIZE: '0',
      AI_WORKER_LEASE_SECONDS: 'not-a-number',
      AI_WORKER_PARALLELISM: '0',
    } as NodeJS.ProcessEnv);

    expect(config.pollIntervalMs).toBeGreaterThanOrEqual(MIN_POLL_INTERVAL_MS);
    expect(config.pollIntervalMs).toBeLessThanOrEqual(MAX_POLL_INTERVAL_MS);
    expect(config.pollJitterMs).toBe(0);
    expect(config.batchSize).toBe(1);
    expect(config.leaseSeconds).toBe(45);
    expect(config.parallelism).toBe(1);
  });

  it('ensures parallelism never exceeds batch size', () => {
    const config = resolveWorkerLoopConfig({
      AI_WORKER_BATCH_SIZE: '1',
      AI_WORKER_PARALLELISM: '2',
    } as NodeJS.ProcessEnv);

    expect(config.batchSize).toBe(1);
    expect(config.parallelism).toBe(1);
  });
});
