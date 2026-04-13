export const LOCAL_PROBE_CANDIDATES = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

export const PROBE_PATHS = ['/api/v1/ai/worker', '/'];

const DEFAULT_PROBE_TIMEOUT_MS = 1200;

export class WorkerLoopOriginResolutionError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'WorkerLoopOriginResolutionError';
    this.details = details;
  }
}

function normalizeOrigin(input) {
  return input.trim().replace(/\/+$/, '');
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: null,
    message: String(error),
  };
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeOrigin(origin, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available for local origin probing.');
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const attempts = [];

  for (const path of PROBE_PATHS) {
    const url = `${normalizedOrigin}${path}`;

    try {
      const response = await fetchWithTimeout(fetchImpl, url, timeoutMs);
      const status = typeof response?.status === 'number' ? response.status : null;

      attempts.push({
        url,
        reachable: true,
        status,
        errorName: null,
        errorMessage: null,
      });

      return {
        origin: normalizedOrigin,
        reachable: true,
        reachableUrl: url,
        status,
        attempts,
      };
    } catch (error) {
      const normalizedError = normalizeError(error);

      attempts.push({
        url,
        reachable: false,
        status: null,
        errorName: normalizedError.name,
        errorMessage: normalizedError.message,
      });
    }
  }

  return {
    origin: normalizedOrigin,
    reachable: false,
    reachableUrl: null,
    status: null,
    attempts,
  };
}

export async function resolveWorkerLoopAppUrl(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

  const credviaAppUrl = env.CREDVIA_APP_URL?.trim();
  if (credviaAppUrl) {
    return {
      source: 'CREDVIA_APP_URL',
      appUrl: normalizeOrigin(credviaAppUrl),
      probeResults: [],
      probeTimeoutMs: timeoutMs,
    };
  }

  const publicAppUrl = env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicAppUrl) {
    return {
      source: 'NEXT_PUBLIC_APP_URL',
      appUrl: normalizeOrigin(publicAppUrl),
      probeResults: [],
      probeTimeoutMs: timeoutMs,
    };
  }

  const probeResults = [];

  for (const candidate of LOCAL_PROBE_CANDIDATES) {
    const result = await probeOrigin(candidate, {
      fetchImpl,
      timeoutMs,
    });

    probeResults.push(result);

    if (result.reachable) {
      return {
        source: 'auto-probed',
        appUrl: result.origin,
        probeResults,
        probeTimeoutMs: timeoutMs,
      };
    }
  }

  const attemptedUrls = probeResults.flatMap((result) => result.attempts.map((attempt) => attempt.url));

  throw new WorkerLoopOriginResolutionError(
    `Unable to reach local Next.js app. Attempted URLs: ${attemptedUrls.join(', ')}`,
    {
      source: 'auto-probed',
      probeTimeoutMs: timeoutMs,
      candidates: LOCAL_PROBE_CANDIDATES,
      attemptedUrls,
      probeResults,
    },
  );
}
