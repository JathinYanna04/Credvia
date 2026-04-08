import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { resolvePromptVersion } from '@/lib/ai/config';
import {
  buildFounderIdeaContextSnapshot,
  buildFounderIdeaPromptContext,
  getFounderIdeaOwnership,
} from '@/lib/ai/features/founder-feedback/context';
import {
  buildFounderIdeaSystemPrompt,
  buildFounderIdeaUserPrompt,
  FOUNDER_RESPONSE_FORMAT_INSTRUCTIONS,
} from '@/lib/ai/features/founder-feedback/prompt';
import {
  FounderIdeaReviewSchema,
  type FounderIdeaReview,
} from '@/lib/ai/features/founder-feedback/schema';
import { buildRunIdentity, hashAiInput } from '@/lib/ai/hash';
import {
  createOrReuseAiRun,
  getAiRunById,
  listAiRunsByRequester,
  toAiRunSummary,
  type CreateOrReuseAiRunResult,
} from '@/lib/ai/runs-repo';
import { runStructuredOutput } from '@/lib/ai/structured-runner';
import type { AiRunSummary } from '@/lib/types';
import { AiRuntimeError } from '@/lib/ai/errors';

function toRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toFounderReviewPayload(
  row: Database['public']['Tables']['founder_idea_reviews']['Row'],
) {
  const metadata = toRecord(row.metadata);

  return {
    id: row.id,
    runId: row.run_id,
    postId: row.post_id,
    founderUserId: row.founder_user_id,
    verdict: row.verdict,
    confidence: row.confidence,
    summary: row.summary,
    strengths: toStringArray(row.strengths),
    risks: toStringArray(row.risks),
    suggestions: toStringArray(row.suggestions),
    marketSignals: toStringArray(row.market_signals),
    rewrite: typeof metadata.rewrite === 'string' ? metadata.rewrite : null,
    reasoning: toStringArray(metadata.reasoning),
    evidence: Array.isArray(metadata.evidence) ? metadata.evidence : [],
    investorPushback: toStringArray(metadata.investorPushback),
    bestNextExperiment:
      typeof metadata.bestNextExperiment === 'string' ? metadata.bestNextExperiment : null,
    communityRead: typeof metadata.communityRead === 'string' ? metadata.communityRead : null,
    moatConcern: typeof metadata.moatConcern === 'string' ? metadata.moatConcern : null,
    version: {
      promptVersion: typeof metadata.promptVersion === 'string' ? metadata.promptVersion : null,
      promptKey: typeof metadata.promptKey === 'string' ? metadata.promptKey : null,
      inputHash: typeof metadata.inputHash === 'string' ? metadata.inputHash : null,
    },
    createdAt: row.created_at,
  };
}

export async function queueFounderIdeaFeedbackRun(args: {
  supabase: SupabaseClient<Database>;
  postId: string;
  founderUserId: string;
  regenerate?: boolean;
  traceId?: string;
}): Promise<CreateOrReuseAiRunResult> {
  const ownership = await getFounderIdeaOwnership(args.supabase, args.postId);

  if (!ownership) {
    throw new AiRuntimeError('NOT_FOUND', 'Startup idea not found.', 404);
  }

  if (ownership.founderUserId !== args.founderUserId) {
    throw new AiRuntimeError('FORBIDDEN', 'Only the founder can request AI feedback for this idea.', 403);
  }

  const snapshot = await buildFounderIdeaContextSnapshot(args.supabase, args.postId);

  if (!snapshot) {
    throw new AiRuntimeError('NOT_FOUND', 'Startup idea context is unavailable.', 404);
  }

  const promptVersion = resolvePromptVersion('founder_idea_feedback');
  const promptKey = 'founder-feedback-core';
  const inputHash = hashAiInput({
    postId: args.postId,
    snapshot,
    promptVersion,
  });
  const runIdentity = buildRunIdentity({
    feature: 'founder_idea_feedback',
    subjectType: 'startup_idea',
    subjectId: args.postId,
    promptVersion,
    promptKey,
    inputHash,
  });

  return createOrReuseAiRun(args.supabase, {
    feature: 'founder_idea_feedback',
    subjectType: 'startup_idea',
    subjectId: args.postId,
    requestedBy: args.founderUserId,
    promptVersion,
    promptKey,
    inputHash,
    runIdentity,
    forceRegenerate: args.regenerate,
    traceId: args.traceId,
    metadata: {
      contextSnapshot: snapshot,
    },
  });
}

export async function processFounderIdeaFeedbackRun(args: {
  supabase: SupabaseClient<Database>;
  run: AiRunSummary;
}) {
  if (args.run.feature !== 'founder_idea_feedback') {
    throw new AiRuntimeError('AI_FEATURE_UNSUPPORTED', 'Run is not a founder feedback run.', 400);
  }

  if (args.run.subjectType !== 'startup_idea') {
    throw new AiRuntimeError('AI_SUBJECT_MISMATCH', 'Founder feedback requires startup_idea subject.', 400);
  }

  const context = await buildFounderIdeaPromptContext(args.supabase, args.run.subjectId);

  if (!context) {
    throw new AiRuntimeError('NOT_FOUND', 'Startup idea context not found for AI processing.', 404);
  }

  if (args.run.requestedBy && context.founderUserId !== args.run.requestedBy) {
    throw new AiRuntimeError('FORBIDDEN', 'Run requester does not own this startup idea.', 403);
  }

  const structured = await runStructuredOutput({
    schema: FounderIdeaReviewSchema,
    systemPrompt: buildFounderIdeaSystemPrompt(args.run.promptVersion),
    userPrompt: buildFounderIdeaUserPrompt(context),
    responseFormatInstructions: FOUNDER_RESPONSE_FORMAT_INSTRUCTIONS,
    maxRepairAttempts: 1,
    traceId: args.run.traceId ?? undefined,
  });

  const review = structured.data as FounderIdeaReview;
  const confidence = Number(review.confidence.toFixed(2));

  const insertResult = await args.supabase
    .from('founder_idea_reviews')
    .upsert(
      {
        run_id: args.run.id,
        post_id: args.run.subjectId,
        founder_user_id: context.founderUserId,
        verdict: review.verdict,
        confidence,
        summary: review.summary,
        strengths: review.strengths,
        risks: review.risks,
        suggestions: review.suggestions,
        market_signals: review.marketSignals,
        metadata: {
          rewrite: review.rewrite,
          reasoning: review.reasoning,
          evidence: review.evidence,
          investorPushback: review.investorPushback ?? null,
          bestNextExperiment: review.bestNextExperiment ?? null,
          communityRead: review.communityRead ?? null,
          moatConcern: review.moatConcern ?? null,
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

  if (insertResult.error || !insertResult.data) {
    throw new Error(insertResult.error?.message ?? 'Failed to persist founder AI review.');
  }

  return {
    provider: structured.provider,
    model: structured.model,
    modelVersion: structured.modelVersion,
    latencyMs: structured.latencyMs,
    providerMetadata: structured.providerMetadata,
  };
}

export async function getFounderIdeaFeedbackState(args: {
  supabase: SupabaseClient<Database>;
  postId: string;
  founderUserId: string;
}) {
  const ownership = await getFounderIdeaOwnership(args.supabase, args.postId);

  if (!ownership) {
    return null;
  }

  if (ownership.founderUserId !== args.founderUserId) {
    throw new AiRuntimeError('FORBIDDEN', 'Only the founder can view AI feedback for this idea.', 403);
  }

  const [latestRunResult, latestReviewResult, snapshot] = await Promise.all([
    args.supabase
      .from('ai_runs')
      .select('*')
      .eq('feature', 'founder_idea_feedback')
      .eq('subject_type', 'startup_idea')
      .eq('subject_id', args.postId)
      .eq('requested_by', args.founderUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    args.supabase
      .from('founder_idea_reviews')
      .select('*')
      .eq('post_id', args.postId)
      .eq('founder_user_id', args.founderUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    buildFounderIdeaContextSnapshot(args.supabase, args.postId),
  ]);

  if (latestRunResult.error) {
    throw new Error(latestRunResult.error.message);
  }

  if (latestReviewResult.error) {
    throw new Error(latestReviewResult.error.message);
  }

  const latestRun = latestRunResult.data ? toAiRunSummary(latestRunResult.data) : null;
  const review = latestReviewResult.data ? toFounderReviewPayload(latestReviewResult.data) : null;

  const stale = Boolean(
    review
      && snapshot
      && (new Date(review.createdAt).getTime() < new Date(snapshot.lastRevisionAt).getTime()
        || new Date(review.createdAt).getTime() < new Date(snapshot.updatedAt).getTime()),
  );

  return {
    latestRun,
    review,
    stale,
    snapshot,
  };
}

export async function getFounderReviewByRunId(args: {
  supabase: SupabaseClient<Database>;
  runId: string;
}) {
  const run = await getAiRunById(args.supabase, args.runId);

  if (!run || run.feature !== 'founder_idea_feedback') {
    return null;
  }

  const reviewResult = await args.supabase
    .from('founder_idea_reviews')
    .select('*')
    .eq('run_id', args.runId)
    .maybeSingle();

  if (reviewResult.error) {
    throw new Error(reviewResult.error.message);
  }

  return reviewResult.data ? toFounderReviewPayload(reviewResult.data) : null;
}

export async function listFounderRuns(args: {
  supabase: SupabaseClient<Database>;
  founderUserId: string;
}) {
  const runs = await listAiRunsByRequester(args.supabase, args.founderUserId, 200);
  return runs.filter((run) => run.feature === 'founder_idea_feedback');
}
