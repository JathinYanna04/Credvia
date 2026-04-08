import { z } from 'zod';

export const AiFeatureSchema = z.enum([
  'founder_idea_feedback',
  'career_copilot',
  'moderation_review',
]);

export const AiSubjectTypeSchema = z.enum([
  'startup_idea',
  'resume',
  'report',
]);

export const AiRunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
]);

export type AiFeature = z.infer<typeof AiFeatureSchema>;
export type AiSubjectType = z.infer<typeof AiSubjectTypeSchema>;
export type AiRunStatus = z.infer<typeof AiRunStatusSchema>;

export interface CanonicalAiRunIdentity {
  feature: AiFeature;
  subjectType: AiSubjectType;
  subjectId: string;
  promptVersion: string;
  promptKey: string;
  inputHash: string;
  runIdentity: string;
}

export interface CanonicalAiRunContract extends CanonicalAiRunIdentity {
  id: string;
  requestedBy: string;
  status: AiRunStatus;
  traceId: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  latencyMs: number | null;
  provider: string | null;
  model: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export interface ClaimedAiRunLease {
  runId: string;
  leaseToken: string;
  leaseExpiresAt: string;
  processorId: string;
}

export const AI_FEATURE_TO_SUBJECT: Record<AiFeature, AiSubjectType> = {
  founder_idea_feedback: 'startup_idea',
  career_copilot: 'resume',
  moderation_review: 'report',
};
