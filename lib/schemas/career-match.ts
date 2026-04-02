import { z } from 'zod';

export const ResumeAnalyzeSchema = z
  .object({
    rerun: z.boolean().optional(),
    targetRole: z.string().trim().min(1).max(160).optional(),
    jobDescription: z.string().trim().min(1).max(12000).optional(),
    forceOCR: z.boolean().optional(),
    forceOcr: z.boolean().optional(),
  })
  .strict();

export const ResumeExtractSchema = z
  .object({
    retry: z.boolean().optional(),
    forceOCR: z.boolean().optional(),
    forceOcr: z.boolean().optional(),
  })
  .strict();

export const ResumeUpdateSchema = z
  .object({
    isActive: z.boolean().optional(),
  })
  .strict();

export const JobListSchema = z
  .object({
    q: z.string().max(120).optional(),
    location: z.string().max(120).optional(),
    remote: z.enum(['remote', 'hybrid', 'onsite', 'flexible']).optional(),
    employmentType: z.string().max(80).optional(),
    company: z.string().max(120).optional(),
    skill: z.string().max(120).optional(),
    sort: z.enum(['recent', 'match', 'active']).optional(),
  })
  .strict();

export const MatchRecomputeSchema = z
  .object({
    resumeId: z.string().uuid().optional(),
  })
  .strict();

export const SaveJobMatchSchema = z
  .object({
    saved: z.boolean(),
  })
  .strict();

export const StartupSourceSyncSchema = z
  .object({
    source: z.enum(['yc', 'greenhouse', 'lever', 'all']).optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();
