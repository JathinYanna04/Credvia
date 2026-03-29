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
