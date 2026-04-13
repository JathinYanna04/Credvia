import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_PROBE_CANDIDATES,
  resolveWorkerLoopAppUrl,
  WorkerLoopOriginResolutionError,
} from '@/scripts/ai-worker-loop-origin.mjs';

describe('worker loop origin resolution', () => {
  it('uses CREDVIA_APP_URL exactly and skips probing', async () => {
    const fetchMock = vi.fn();

    const result = await resolveWorkerLoopAppUrl({
      env: {
        CREDVIA_APP_URL: 'http://localhost:4567',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      },
      fetchImpl: fetchMock,
    });

    expect(result.source).toBe('CREDVIA_APP_URL');
    expect(result.appUrl).toBe('http://localhost:4567');
    expect(result.probeResults).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses NEXT_PUBLIC_APP_URL exactly and skips probing when CREDVIA_APP_URL is absent', async () => {
    const fetchMock = vi.fn();

    const result = await resolveWorkerLoopAppUrl({
      env: {
        NEXT_PUBLIC_APP_URL: 'http://localhost:3333',
      },
      fetchImpl: fetchMock,
    });

    expect(result.source).toBe('NEXT_PUBLIC_APP_URL');
    expect(result.appUrl).toBe('http://localhost:3333');
    expect(result.probeResults).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('auto-probes candidates in order and picks first reachable origin', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://127.0.0.1:3000/api/v1/ai/worker') {
        return {
          status: 401,
        };
      }

      throw new TypeError('fetch failed');
    });

    const result = await resolveWorkerLoopAppUrl({
      env: {},
      fetchImpl: fetchMock,
      timeoutMs: 50,
    });

    expect(result.source).toBe('auto-probed');
    expect(result.appUrl).toBe('http://127.0.0.1:3000');
    expect(result.probeResults.length).toBe(2);
    expect(result.probeResults[0]).toMatchObject({
      origin: 'http://localhost:3000',
      reachable: false,
    });
    expect(result.probeResults[1]).toMatchObject({
      origin: 'http://127.0.0.1:3000',
      reachable: true,
      reachableUrl: 'http://127.0.0.1:3000/api/v1/ai/worker',
      status: 401,
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'http://localhost:3000/api/v1/ai/worker',
      'http://localhost:3000/',
      'http://127.0.0.1:3000/api/v1/ai/worker',
    ]);
  });

  it('falls back to probing root path when worker endpoint probe fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://localhost:3000/') {
        return {
          status: 200,
        };
      }

      throw new TypeError('fetch failed');
    });

    const result = await resolveWorkerLoopAppUrl({
      env: {},
      fetchImpl: fetchMock,
      timeoutMs: 50,
    });

    expect(result.source).toBe('auto-probed');
    expect(result.appUrl).toBe('http://localhost:3000');
    expect(result.probeResults[0]).toMatchObject({
      origin: 'http://localhost:3000',
      reachable: true,
      reachableUrl: 'http://localhost:3000/',
      status: 200,
    });
  });

  it('throws a clear startup error with all attempted probe URLs when none are reachable', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(resolveWorkerLoopAppUrl({
      env: {},
      fetchImpl: fetchMock,
      timeoutMs: 50,
    })).rejects.toBeInstanceOf(WorkerLoopOriginResolutionError);

    try {
      await resolveWorkerLoopAppUrl({
        env: {},
        fetchImpl: fetchMock,
        timeoutMs: 50,
      });
      throw new Error('expected resolveWorkerLoopAppUrl to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkerLoopOriginResolutionError);

      const startupError = error as WorkerLoopOriginResolutionError;
      expect(startupError.message).toContain('Unable to reach local Next.js app');
      expect(startupError.details.attemptedUrls).toEqual([
        ...LOCAL_PROBE_CANDIDATES.flatMap((origin) => [
          `${origin}/api/v1/ai/worker`,
          `${origin}/`,
        ]),
      ]);
      expect(startupError.details.probeResults).toHaveLength(LOCAL_PROBE_CANDIDATES.length);
    }
  });
});
