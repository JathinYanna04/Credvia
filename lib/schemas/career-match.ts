import { z } from 'zod';

const CandidateManualOverrideSchema = z
  .object({
    full_name: z.string().trim().min(1).max(160).nullable().optional(),
    current_title: z.string().trim().min(1).max(160).nullable().optional(),
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: z.string().trim().min(3).max(80).nullable().optional(),
    location: z.string().trim().min(1).max(160).nullable().optional(),
    linkedin: z.string().trim().min(1).max(240).nullable().optional(),
    github: z.string().trim().min(1).max(240).nullable().optional(),
    portfolio: z.string().trim().min(1).max(240).nullable().optional(),
    summary: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

const SkillsManualOverrideSchema = z
  .object({
    languages: z.array(z.string().trim().min(1).max(80)).optional(),
    frameworks: z.array(z.string().trim().min(1).max(80)).optional(),
    tools: z.array(z.string().trim().min(1).max(80)).optional(),
    databases: z.array(z.string().trim().min(1).max(80)).optional(),
    cloud: z.array(z.string().trim().min(1).max(80)).optional(),
    others: z.array(z.string().trim().min(1).max(80)).optional(),
    spoken_languages: z.array(z.string().trim().min(1).max(80)).optional(),
  })
  .strict();

const ManualStructuredEntrySchema = z.record(z.string(), z.unknown());

const ResumeManualOverridesSchema = z
  .object({
    candidate: CandidateManualOverrideSchema.optional(),
    skills: SkillsManualOverrideSchema.optional(),
    experience: z.array(ManualStructuredEntrySchema).optional(),
    projects: z.array(ManualStructuredEntrySchema).optional(),
    education: z.array(ManualStructuredEntrySchema).optional(),
    additional: z.record(z.string(), z.array(z.string().trim().min(1).max(200))).optional(),
  })
  .strict();

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
    forceLLM: z.boolean().optional(),
    skipLLM: z.boolean().optional(),
  })
  .strict();

export const ResumeUpdateSchema = z
  .object({
    isActive: z.boolean().optional(),
    manualOverrides: ResumeManualOverridesSchema.optional(),
  })
  .strict()
  .refine((value) => value.isActive === true || value.manualOverrides !== undefined, {
    message: 'Either isActive or manualOverrides must be provided.',
  });

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
