import { z } from 'zod';
import { AiFeatureSchema, AiSubjectTypeSchema } from '@/lib/ai/contracts';

export const CreateAiRunSchema = z
  .object({
    feature: AiFeatureSchema,
    subjectType: AiSubjectTypeSchema,
    subjectId: z.string().uuid(),
    promptVersion: z.string().trim().min(1).max(80),
    promptKey: z.string().trim().min(1).max(120).optional(),
    forceRegenerate: z.boolean().optional(),
    maxAttempts: z.number().int().min(1).max(10).optional(),
    requestId: z.string().trim().min(1).max(120).optional(),
    traceId: z.string().uuid().optional(),
    idempotencyPayload: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const AiRunIdParamsSchema = z.object({
  id: z.string().uuid(),
});
