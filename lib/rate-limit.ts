import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

function createLimiter(
  tokens: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
) {
  return redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(tokens, window) })
    : null;
}

export const rateLimits = {
  post_create: createLimiter(5, '10 m'),
  idea_revision: createLimiter(8, '30 m'),
  idea_follow: createLimiter(60, '10 m'),
  resume_upload: createLimiter(6, '30 m'),
  resume_analyze: createLimiter(10, '30 m'),
  startup_source_sync: createLimiter(6, '60 m'),
  match_recompute: createLimiter(10, '30 m'),
  match_save: createLimiter(60, '10 m'),
  comment_create: createLimiter(15, '5 m'),
  vote: createLimiter(60, '1 m'),
  search: createLimiter(30, '1 m'),
  report: createLimiter(5, '15 m'),
  auth_signup: createLimiter(3, '60 m'),
};

export async function enforceRateLimit(
  limit: keyof typeof rateLimits,
  identifier: string,
) {
  const limiter = rateLimits[limit];

  if (!limiter) {
    return { success: true, remaining: Number.POSITIVE_INFINITY };
  }

  return limiter.limit(identifier);
}
