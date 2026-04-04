import crypto from 'node:crypto';
import type { StrictExtractorResponse } from '@/lib/resume-extractor/schema';
import { extractorResponseSchema } from '@/lib/resume-extractor/schema';
import { getAppResumeEnv } from '@/lib/resume/config';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number | null, error: unknown, attempt: number, maxRetries: number) {
  if (attempt >= maxRetries) {
    return false;
  }

  if (status !== null) {
    return status === 502 || status === 503 || status === 504 || status === 408;
  }

  return error instanceof Error;
}

function buildBackoffDelay(attempt: number) {
  const base = 500 * (2 ** attempt);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

export class RemoteExtractorError extends Error {
  constructor(
    message: string,
    public readonly code: 'EXTRACTOR_UNAVAILABLE' | 'EXTRACTOR_TIMEOUT' | 'EXTRACTOR_MALFORMED',
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RemoteExtractorError';
  }
}

export async function callRemoteExtractor(args: {
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  forceLlm?: boolean;
  skipLlm?: boolean;
  requestId?: string;
}) {
  const env = getAppResumeEnv();
  if (!env.RESUME_EXTRACTOR_URL) {
    throw new RemoteExtractorError(
      'Remote extractor URL is not configured.',
      'EXTRACTOR_UNAVAILABLE',
      { envVar: 'RESUME_EXTRACTOR_URL' },
    );
  }

  const requestId = args.requestId ?? crypto.randomUUID();
  const baseUrl = env.RESUME_EXTRACTOR_URL.replace(/\/$/, '');

  for (let attempt = 0; attempt <= env.RESUME_EXTRACTOR_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.RESUME_EXTRACTOR_TIMEOUT_MS);

    try {
      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(args.fileBuffer)]), args.filename);
      form.set('mime_type', args.mimeType);
      form.set('filename', args.filename);
      form.set('request_id', requestId);
      form.set('force_llm', String(args.forceLlm ?? true));
      form.set('skip_llm', String(args.skipLlm ?? false));

      const response = await fetch(`${baseUrl}/extract`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
        headers: {
          'x-request-id': requestId,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        if (shouldRetry(response.status, null, attempt, env.RESUME_EXTRACTOR_RETRY_COUNT)) {
          await sleep(buildBackoffDelay(attempt));
          continue;
        }

        throw new RemoteExtractorError(
          `Extractor request failed with status ${response.status}.`,
          'EXTRACTOR_UNAVAILABLE',
          {
            status: response.status,
            requestId,
            responseText: text,
          },
        );
      }

      const payload = extractorResponseSchema.parse(await response.json()) as StrictExtractorResponse;
      return { payload, requestId };
    } catch (error) {
      if (error instanceof RemoteExtractorError) {
        clearTimeout(timeout);
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        if (shouldRetry(null, error, attempt, env.RESUME_EXTRACTOR_RETRY_COUNT)) {
          await sleep(buildBackoffDelay(attempt));
          clearTimeout(timeout);
          continue;
        }

        clearTimeout(timeout);
        throw new RemoteExtractorError(
          'Extractor request timed out.',
          'EXTRACTOR_TIMEOUT',
          { requestId, timeoutMs: env.RESUME_EXTRACTOR_TIMEOUT_MS },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        clearTimeout(timeout);
        throw new RemoteExtractorError(
          'Extractor returned a malformed payload.',
          'EXTRACTOR_MALFORMED',
          { requestId, message: error.message },
        );
      }

      if (shouldRetry(null, error, attempt, env.RESUME_EXTRACTOR_RETRY_COUNT)) {
        await sleep(buildBackoffDelay(attempt));
        clearTimeout(timeout);
        continue;
      }

      clearTimeout(timeout);
      throw new RemoteExtractorError(
        error instanceof Error ? error.message : 'Extractor request failed.',
        'EXTRACTOR_UNAVAILABLE',
        { requestId },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new RemoteExtractorError(
    'Extractor request failed after retries.',
    'EXTRACTOR_UNAVAILABLE',
  );
}
