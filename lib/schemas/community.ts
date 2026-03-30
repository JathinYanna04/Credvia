import { z } from 'zod';

export const JoinCommunitySchema = z
  .object({
    communityId: z.string().uuid().or(z.string().min(3)),
    joined: z.boolean(),
  })
  .strict();

export const SearchSchema = z
  .object({
    query: z.string().min(2).max(120),
    entityTypes: z.array(z.enum(['post', 'community', 'profile'])).optional(),
  })
  .strict();

export const IdeaSearchSchema = z
  .object({
    query: z.string().max(120).optional(),
    sort: z.enum(['recent', 'traction', 'active']).optional(),
    stage: z.string().max(80).optional(),
    category: z.string().max(80).optional(),
  })
  .strict();
