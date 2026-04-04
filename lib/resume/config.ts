import { z } from 'zod';
import { parseTrustedCidrs } from '@/lib/network/cidrs';

const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().trim().url().default('http://localhost:3000'),
  RESUME_EXTRACTOR_URL: z.string().trim().url().optional(),
  RESUME_EXTRACTOR_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
  RESUME_EXTRACTOR_RETRY_COUNT: z.coerce.number().int().min(0).max(3).default(1),
  TRUSTED_SOURCE_CIDRS: z.string().trim().optional(),
  ALLOWED_PROXY_CIDRS: z.string().trim().optional(),
});

export type AppResumeEnv = z.infer<typeof appEnvSchema> & {
  trustedSourceCidrs: ReturnType<typeof parseTrustedCidrs>;
};

let cachedEnv: AppResumeEnv | null = null;

export function getAppResumeEnv() {
  if (cachedEnv && process.env.NODE_ENV !== 'test') {
    return cachedEnv;
  }

  const parsed = appEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid app runtime env: ${parsed.error.issues[0]?.message ?? 'unknown error'}`);
  }

  if (parsed.data.NODE_ENV === 'production' && !parsed.data.RESUME_EXTRACTOR_URL) {
    throw new Error('Missing RESUME_EXTRACTOR_URL in production. Set it to the remote extractor service URL.');
  }

  const cidrSource =
    parsed.data.TRUSTED_SOURCE_CIDRS ?? parsed.data.ALLOWED_PROXY_CIDRS ?? '';

  const resolved = {
    ...parsed.data,
    trustedSourceCidrs: parseTrustedCidrs(cidrSource),
  };

  if (process.env.NODE_ENV !== 'test') {
    cachedEnv = resolved;
  }

  return resolved;
}

export function resetAppResumeEnvForTests() {
  cachedEnv = null;
}
