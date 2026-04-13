import { z } from 'zod';

export const ModerationRiskLabelSchema = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);

export const ModerationSuggestedActionSchema = z.enum([
  'dismiss',
  'hide',
  'remove',
]);

export const ModerationEvidenceItemSchema = z.object({
  excerpt: z.string().min(1).max(600),
  reason: z.string().min(1).max(320),
  severity: z.enum(['low', 'medium', 'high']),
});

export const ModerationAiReviewOutputSchema = z.object({
  riskLabel: ModerationRiskLabelSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(20).max(1200),
  suggestedAction: ModerationSuggestedActionSchema,
  suggestedReason: z.string().min(4).max(500),
  evidence: z.array(ModerationEvidenceItemSchema).min(1).max(10),
});

export const ModerationReviewRequestSchema = z
  .object({
    reportId: z.string().uuid(),
    regenerate: z.boolean().optional(),
  })
  .strict();

export type ModerationAiReviewOutput = z.infer<typeof ModerationAiReviewOutputSchema>;
