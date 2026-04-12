import { AiRuntimeError } from '@/lib/ai/errors';

const TRANSIENT_PERSISTENCE_ERROR_PATTERNS = [
  'und_err_connect_timeout',
  'und_err_socket',
  'econnreset',
  'etimedout',
  'socket',
  'fetch failed',
  'network',
  'connection closed',
  'timeout',
  'temporarily unavailable',
];

function isTransientPersistenceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return TRANSIENT_PERSISTENCE_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

async function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withSupabasePersistenceRetry<T>(args: {
  operationName: string;
  runId: string;
  maxAttempts?: number;
  operation: () => Promise<T>;
}): Promise<T> {
  const maxAttempts = Math.max(1, args.maxAttempts ?? 3);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await args.operation();
    } catch (error) {
      lastError = error;
      const retryable = attempt < maxAttempts && isTransientPersistenceError(error);

      if (!retryable) {
        break;
      }

      const backoffMs = Math.min(2000, 150 * (2 ** (attempt - 1)));
      await sleep(backoffMs);
    }
  }

  if (isTransientPersistenceError(lastError)) {
    throw new AiRuntimeError(
      'ANALYSIS_SERVICE_UNAVAILABLE',
      `${args.operationName} is temporarily unavailable.`,
      503,
      {
        runId: args.runId,
        operation: args.operationName,
        transient: true,
      },
      'Retry this request shortly.',
    );
  }

  throw new AiRuntimeError(
    'INTERNAL_ERROR',
    `${args.operationName} failed.`,
    500,
    {
      runId: args.runId,
      operation: args.operationName,
      cause: lastError instanceof Error ? lastError.message : String(lastError),
    },
  );
}
