import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePromptVersion } from '@/lib/ai/config';
import { AiRuntimeError } from '@/lib/ai/errors';
import { buildRunIdentity, hashAiInput } from '@/lib/ai/hash';
import {
  buildModerationPromptContext,
  type ModerationPromptContext,
} from '@/lib/ai/features/moderation-review/context';
import {
  buildModerationSystemPrompt,
  buildModerationUserPrompt,
  MODERATION_RESPONSE_FORMAT_INSTRUCTIONS,
} from '@/lib/ai/features/moderation-review/prompt';
import {
  ModerationAiReviewOutputSchema,
  type ModerationAiReviewOutput,
} from '@/lib/ai/features/moderation-review/schema';
import {
  createOrReuseAiRun,
  toAiRunSummary,
  type CreateOrReuseAiRunResult,
} from '@/lib/ai/runs-repo';
import { runStructuredOutput } from '@/lib/ai/structured-runner';
import type { Database } from '@/lib/supabase/types';
import type { AiRunSummary } from '@/lib/types';

function isCommunityAllowed(context: ModerationPromptContext, allowedCommunityIds: string[]) {
  if (!context.communityId) {
    return true;
  }

  return allowedCommunityIds.includes(context.communityId);
}

function toRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function queueModerationReviewRun(args: {
  supabase: SupabaseClient<Database>;
  moderatorUserId: string;
  reportId: string;
  allowedCommunityIds: string[];
  regenerate?: boolean;
  traceId?: string;
}): Promise<CreateOrReuseAiRunResult> {
  const context = await buildModerationPromptContext({
    supabase: args.supabase,
    reportId: args.reportId,
  });

  if (!context) {
    throw new AiRuntimeError('NOT_FOUND', 'Moderation report not found.', 404);
  }

  if (!isCommunityAllowed(context, args.allowedCommunityIds)) {
    throw new AiRuntimeError('FORBIDDEN', 'This report is outside your moderation scope.', 403);
  }

  const promptVersion = resolvePromptVersion('moderation_review');
  const promptKey = 'moderation-review-core';
  const inputHash = hashAiInput({
    reportId: context.reportId,
    reasonCode: context.reasonCode,
    reportStatus: context.reportStatus,
    targetPreview: context.targetPreview,
    priorActions: context.priorActions,
    promptVersion,
  });

  const runIdentity = buildRunIdentity({
    feature: 'moderation_review',
    subjectType: 'report',
    subjectId: context.reportId,
    promptVersion,
    promptKey,
    inputHash,
  });

  return createOrReuseAiRun(args.supabase, {
    feature: 'moderation_review',
    subjectType: 'report',
    subjectId: context.reportId,
    requestedBy: args.moderatorUserId,
    promptVersion,
    promptKey,
    inputHash,
    runIdentity,
    forceRegenerate: args.regenerate,
    traceId: args.traceId,
    metadata: {
      reportContextSnapshot: {
        reasonCode: context.reasonCode,
        reportStatus: context.reportStatus,
        targetType: context.targetType,
        targetId: context.targetId,
      },
    },
  });
}

export async function processModerationReviewRun(args: {
  supabase: SupabaseClient<Database>;
  run: AiRunSummary;
}) {
  if (args.run.feature !== 'moderation_review') {
    throw new AiRuntimeError('AI_FEATURE_UNSUPPORTED', 'Run is not a moderation review run.', 400);
  }

  if (args.run.subjectType !== 'report') {
    throw new AiRuntimeError('AI_SUBJECT_MISMATCH', 'Moderation review requires report subject.', 400);
  }

  if (!args.run.requestedBy) {
    throw new AiRuntimeError('VALIDATION_ERROR', 'Moderation run is missing requester id.', 400);
  }

  const context = await buildModerationPromptContext({
    supabase: args.supabase,
    reportId: args.run.subjectId,
  });

  if (!context) {
    throw new AiRuntimeError('NOT_FOUND', 'Moderation report not found.', 404);
  }

  const structured = await runStructuredOutput({
    schema: ModerationAiReviewOutputSchema,
    systemPrompt: buildModerationSystemPrompt(args.run.promptVersion),
    userPrompt: buildModerationUserPrompt(context),
    responseFormatInstructions: MODERATION_RESPONSE_FORMAT_INSTRUCTIONS,
    maxRepairAttempts: 1,
    traceId: args.run.traceId ?? undefined,
  });

  const output = structured.data as ModerationAiReviewOutput;
  const confidence = Number(output.confidence.toFixed(2));

  const upsertResult = await args.supabase
    .from('moderation_ai_reviews')
    .upsert(
      {
        run_id: args.run.id,
        report_id: context.reportId,
        moderator_user_id: args.run.requestedBy,
        target_type: context.targetType,
        target_id: context.targetId,
        risk_label: output.riskLabel,
        confidence,
        rationale: output.rationale,
        suggested_action: output.suggestedAction,
        suggested_reason: output.suggestedReason,
        evidence: output.evidence,
        metadata: {
          promptVersion: args.run.promptVersion,
          promptKey: args.run.promptKey ?? null,
          inputHash: args.run.inputHash ?? null,
          repairCount: structured.repairCount,
          traceId: args.run.traceId ?? null,
          modelVersion: structured.modelVersion,
          providerRequestId: structured.requestId,
        },
      },
      {
        onConflict: 'run_id',
      },
    )
    .select('*')
    .single();

  if (upsertResult.error || !upsertResult.data) {
    throw new Error(upsertResult.error?.message ?? 'Failed to persist moderation AI review.');
  }

  return {
    provider: structured.provider,
    model: structured.model,
    modelVersion: structured.modelVersion,
    latencyMs: structured.latencyMs,
    providerMetadata: structured.providerMetadata,
  };
}

export async function getModerationReviewState(args: {
  supabase: SupabaseClient<Database>;
  moderatorUserId: string;
  reportId: string;
  allowedCommunityIds: string[];
}) {
  const context = await buildModerationPromptContext({
    supabase: args.supabase,
    reportId: args.reportId,
  });

  if (!context) {
    return null;
  }

  if (!isCommunityAllowed(context, args.allowedCommunityIds)) {
    throw new AiRuntimeError('FORBIDDEN', 'This report is outside your moderation scope.', 403);
  }

  const [runResult, reviewResult] = await Promise.all([
    args.supabase
      .from('ai_runs')
      .select('*')
      .eq('feature', 'moderation_review')
      .eq('subject_type', 'report')
      .eq('subject_id', args.reportId)
      .eq('requested_by', args.moderatorUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    args.supabase
      .from('moderation_ai_reviews')
      .select('*')
      .eq('report_id', args.reportId)
      .eq('moderator_user_id', args.moderatorUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (runResult.error) {
    throw new Error(runResult.error.message);
  }

  if (reviewResult.error) {
    throw new Error(reviewResult.error.message);
  }

  const reviewMetadata = toRecord(reviewResult.data?.metadata);

  return {
    latestRun: runResult.data ? toAiRunSummary(runResult.data) : null,
    review: reviewResult.data
      ? {
          id: reviewResult.data.id,
          runId: reviewResult.data.run_id,
          reportId: reviewResult.data.report_id,
          targetType: reviewResult.data.target_type,
          targetId: reviewResult.data.target_id,
          riskLabel: reviewResult.data.risk_label,
          confidence: reviewResult.data.confidence,
          rationale: reviewResult.data.rationale,
          suggestedAction: reviewResult.data.suggested_action,
          suggestedReason: reviewResult.data.suggested_reason,
          evidence: Array.isArray(reviewResult.data.evidence) ? reviewResult.data.evidence : [],
          version: {
            promptVersion:
              typeof reviewMetadata.promptVersion === 'string' ? reviewMetadata.promptVersion : null,
            promptKey: typeof reviewMetadata.promptKey === 'string' ? reviewMetadata.promptKey : null,
            inputHash: typeof reviewMetadata.inputHash === 'string' ? reviewMetadata.inputHash : null,
          },
          createdAt: reviewResult.data.created_at,
        }
      : null,
  };
}

export async function listLatestModerationReviewsForReports(args: {
  supabase: SupabaseClient<Database>;
  moderatorUserId: string;
  reportIds: string[];
}): Promise<Map<string, Database['public']['Tables']['moderation_ai_reviews']['Row']>> {
  if (args.reportIds.length === 0) {
    return new Map<string, Database['public']['Tables']['moderation_ai_reviews']['Row']>();
  }

  const result = await args.supabase
    .from('moderation_ai_reviews')
    .select('*')
    .eq('moderator_user_id', args.moderatorUserId)
    .in('report_id', args.reportIds)
    .order('created_at', { ascending: false });

  if (result.error) {
    throw new Error(result.error.message);
  }

  const map = new Map<string, Database['public']['Tables']['moderation_ai_reviews']['Row']>();

  for (const row of result.data ?? []) {
    if (!map.has(row.report_id)) {
      map.set(row.report_id, row);
    }
  }

  return map;
}
