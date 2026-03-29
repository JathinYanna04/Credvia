import { z } from 'zod';

export const UpdateProfileSchema = z
  .object({
    username: z.string().regex(/^[a-z0-9_-]{3,30}$/).optional(),
    full_name: z.string().min(2).max(80).optional(),
    headline: z.string().max(160).optional(),
    bio: z.string().max(500).optional(),
    location: z.string().max(100).optional(),
    current_company: z.string().max(100).optional(),
    education: z.string().max(200).optional(),
    onboarding_complete: z.boolean().optional(),
  })
  .strict();

export const FollowSchema = z
  .object({
    followedUserId: z.string().uuid().or(z.string().min(3)),
    following: z.boolean(),
  })
  .strict();
