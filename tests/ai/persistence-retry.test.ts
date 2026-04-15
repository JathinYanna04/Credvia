import { describe, expect, it, vi } from 'vitest';
import { withSupabasePersistenceRetry } from '@/lib/ai/persistence/retry';

describe('persistence retry helper', () => {
  it('retries transient persistence errors and succeeds', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('UND_ERR_CONNECT_TIMEOUT'))
      .mockResolvedValue('ok');

    const result = await withSupabasePersistenceRetry({
      operationName: 'Foundry write',
      runId: 'run-retry-1',
      maxAttempts: 3,
      operation,
    });

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('throws ANALYSIS_SERVICE_UNAVAILABLE when transient persistence never recovers', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error('network connection closed'));

    await expect(
      withSupabasePersistenceRetry({
        operationName: 'Founder review persistence',
        runId: 'run-retry-2',
        maxAttempts: 2,
        operation,
      }),
    ).rejects.toMatchObject({
      code: 'ANALYSIS_SERVICE_UNAVAILABLE',
      status: 503,
    });

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws INTERNAL_ERROR immediately for non-transient persistence failures', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error('violates foreign key constraint'));

    await expect(
      withSupabasePersistenceRetry({
        operationName: 'Career insight persistence',
        runId: 'run-retry-3',
        maxAttempts: 3,
        operation,
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 500,
    });

    expect(operation).toHaveBeenCalledTimes(1);
  });
});
