import { z } from 'zod';

export const FounderEvidenceItemSchema = z.object({
  claim: z.string().min(1).max(320),
  evidence: z.string().min(1).max(800),
  source: z.enum(['idea', 'revision', 'discussion', 'market']),
  confidence: z.number().min(0).max(1),
});

export const FounderIdeaReviewSchema = z.object({
  verdict: z.enum(['promising', 'needs_work', 'high_risk']),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(40).max(900),
  rewrite: z.string().min(40).max(5000),
  strengths: z.array(z.string().min(4).max(280)).min(2).max(8),
  risks: z.array(z.string().min(4).max(280)).min(2).max(8),
  suggestions: z.array(z.string().min(4).max(320)).min(2).max(10),
  marketSignals: z.array(z.string().min(4).max(320)).min(1).max(8),
  reasoning: z.array(z.string().min(4).max(480)).min(2).max(8),
  evidence: z.array(FounderEvidenceItemSchema).min(2).max(10),
  investorPushback: z.array(z.string().min(8).max(320)).min(2).max(8).optional(),
  bestNextExperiment: z.string().min(12).max(420).optional(),
  communityRead: z.string().min(12).max(420).optional(),
  moatConcern: z.string().min(12).max(420).optional(),
});

export type FounderIdeaReview = z.infer<typeof FounderIdeaReviewSchema>;

export const FounderReviewRequestSchema = z
  .object({
    regenerate: z.boolean().optional(),
  })
  .strict();

export const FounderReviewRouteParamsSchema = z.object({
  id: z.string().uuid(),
});
