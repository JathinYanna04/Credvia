import { z } from 'zod';
import {
  IdentityPreferencesSchema,
  PersonaDetailRecordSchema,
  PersonaDetailsSchema,
  PersonaSlugSchema,
  ProfileMetadataSchema,
} from '@/lib/personas';

export const UpdateProfileSchema = z
  .object({
    username: z.string().regex(/^[a-z0-9_-]{3,30}$/).optional(),
    full_name: z.string().min(2).max(80).optional(),
    avatar_url: z.string().url().max(300).optional(),
    headline: z.string().max(160).optional(),
    bio: z.string().max(500).optional(),
    location: z.string().max(100).optional(),
    website: z.string().url().max(200).optional(),
    current_company: z.string().max(100).optional(),
    education: z.string().max(200).optional(),
    primary_persona: PersonaSlugSchema.optional(),
    secondary_personas: IdentityPreferencesSchema.shape.secondary_personas.optional(),
    profile_intent: IdentityPreferencesSchema.shape.profile_intent.optional(),
    open_to: IdentityPreferencesSchema.shape.open_to.optional(),
    expertise_tags: IdentityPreferencesSchema.shape.expertise_tags.optional(),
    interest_tags: IdentityPreferencesSchema.shape.interest_tags.optional(),
    open_for_opportunities: z.boolean().optional(),
    open_for_mentorship: z.boolean().optional(),
    open_for_hiring: z.boolean().optional(),
    metadata: ProfileMetadataSchema.optional(),
    persona_details: PersonaDetailsSchema.optional(),
    detail_record: PersonaDetailRecordSchema.optional(),
    onboarding_complete: z.boolean().optional(),
  })
  .strict();

export const OnboardingProfileSchema = z
  .object({
    username: z.string().regex(/^[a-z0-9_-]{3,30}$/),
    full_name: z.string().min(2).max(80),
    avatar_url: z.string().url().max(300).optional(),
    headline: z.string().max(160).optional(),
    bio: z.string().max(500).optional(),
    location: z.string().max(100).optional(),
    website: z.string().url().max(200).optional(),
    primary_persona: PersonaSlugSchema.optional(),
    secondary_personas: IdentityPreferencesSchema.shape.secondary_personas.optional(),
    profile_intent: IdentityPreferencesSchema.shape.profile_intent.optional(),
    open_to: IdentityPreferencesSchema.shape.open_to.optional(),
    expertise_tags: IdentityPreferencesSchema.shape.expertise_tags.optional(),
    interest_tags: IdentityPreferencesSchema.shape.interest_tags.optional(),
    open_for_opportunities: z.boolean().optional(),
    open_for_mentorship: z.boolean().optional(),
    open_for_hiring: z.boolean().optional(),
    metadata: ProfileMetadataSchema.optional(),
    persona_details: PersonaDetailsSchema.optional(),
    detail_record: PersonaDetailRecordSchema.optional(),
  })
  .strict();

export const OnboardingSubmissionSchema = z
  .object({
    skills: z.array(z.string().uuid().or(z.string().min(3))).optional(),
    communityIds: z.array(z.string().uuid().or(z.string().min(3))).optional(),
    topicIds: z.array(z.string().uuid()).optional(),
    profile: OnboardingProfileSchema.partial().default({}),
    onboarding_complete: z.boolean().default(true),
  })
  .strict();

export const PersonaPreferencesSchema = z
  .object({
    primary_persona: PersonaSlugSchema.optional(),
    secondary_personas: IdentityPreferencesSchema.shape.secondary_personas.optional(),
    profile_intent: IdentityPreferencesSchema.shape.profile_intent.optional(),
    expertise_tags: IdentityPreferencesSchema.shape.expertise_tags.optional(),
    interest_tags: IdentityPreferencesSchema.shape.interest_tags.optional(),
    detail_record: PersonaDetailRecordSchema.optional(),
  })
  .strict();

export const OpenToUpdateSchema = z
  .object({
    open_to: IdentityPreferencesSchema.shape.open_to,
    open_for_opportunities: z.boolean().optional(),
    open_for_mentorship: z.boolean().optional(),
    open_for_hiring: z.boolean().optional(),
  })
  .strict();

export const FollowSchema = z
  .object({
    followedUserId: z.string().uuid().or(z.string().min(3)),
    following: z.boolean(),
  })
  .strict();
