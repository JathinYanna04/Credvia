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
  FOUNDER_RESPONSE_FALLBACK_FORMAT_INSTRUCTIONS,
  FOUNDER_RESPONSE_FORMAT_INSTRUCTIONS,
} from '@/lib/ai/features/founder-feedback/prompt';
import {
  FounderIdeaReviewSchema,
  mapFounderReviewFromRawOutput,
  normalizeFounderFallbackReview,
  type FounderIdeaReviewFallback,
  type FounderIdeaReview,
} from '@/lib/ai/features/founder-feedback/schema';
import { buildRunIdentity, hashAiInput } from '@/lib/ai/hash';
import {
  createOrReuseAiRun,
  getAiRunById,
  isReusableAiRunStatus,
  listAiRunsByRequester,
  toAiRunSummary,
  type CreateOrReuseAiRunResult,
} from '@/lib/ai/runs-repo';
import { invokeProviderForStructuredOutput } from '@/lib/ai/provider-adapter';
import { runStructuredOutput } from '@/lib/ai/structured-runner';
import type { AiRunSummary } from '@/lib/types';
import { AiRuntimeError, isAiRuntimeError } from '@/lib/ai/errors';
import { isNonRetryableFailureCode } from '@/lib/ai/retry-policy';
import { withSupabasePersistenceRetry } from '@/lib/ai/persistence/retry';
import { logError, logInfo } from '@/lib/utils/logger';

const TRANSIENT_SUPABASE_ERROR_PATTERNS = [
  'und_err_connect_timeout',
  'und_err_socket',
  'econnreset',
  'etimedout',
  'socket',
  'fetch failed',
  'network',
  'connection closed',
  'timeout',
];

const FOUNDER_REVIEW_MAX_TOKENS = 900;
const MAX_FOUNDER_PROMPT_TOKENS = 5000;
const MIN_FOUNDER_USER_PROMPT_CHARS = 1200;

function estimateTokens(charCount: number) {
  return Math.max(0, Math.ceil(charCount / 4));
}

export type FounderIdeaFeedbackStateValue =
  | 'empty'
  | 'queued'
  | 'processing'
  | 'partial'
  | 'succeeded'
  | 'failed'
  | 'stale';

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

function isTransientSupabaseReadError(error: { message?: string } | null | undefined) {
  const message = (error?.message ?? '').toLowerCase();
  return TRANSIENT_SUPABASE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function toTimestamp(value: string | null | undefined) {
  const timestamp = new Date(value ?? '').getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function toNullableString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, 8)
    : [];
}

function buildStructuredFailureSnapshot(error: AiRuntimeError) {
  const details = toRecord(error.details);
  return {
    code: error.code,
    message: error.message,
    provider: toNullableString(details.provider),
    model: toNullableString(details.model),
    requestId: toNullableString(details.requestId),
    repairCount: toNumber(details.repairCount),
    parseFailureCount: toNumber(details.parseFailureCount),
    validationFailureCount: toNumber(details.validationFailureCount),
    parseIssues: toStringList(details.parseIssues),
    validationIssues: toStringList(details.validationIssues),
    lastError: toNullableString(details.lastError),
    lastOutputHash: toNullableString(details.lastOutputHash),
    lastOutputLength: toNumber(details.lastOutputLength),
    lastOutputPreview: toNullableString(details.lastOutputPreview),
  };
}

function buildBestEffortQualitySignal(args: {
  repairCount: number;
  outputLength: number;
  parseFailureCount?: number | null;
  validationFailureCount?: number | null;
}) {
  return {
    confidence: 0.42,
    reasoning: [
      'Structured validation failed; returned best-effort founder review from raw model output.',
    ],
    stability: 'low' as const,
    repairCount: Math.max(0, args.repairCount),
    providerAttemptCount: 1,
    parseFailureCount: Math.max(0, Number(args.parseFailureCount ?? 1)),
    validationFailureCount: Math.max(0, Number(args.validationFailureCount ?? 1)),
    missingFieldCount: 0,
    outputLength: Math.max(0, args.outputLength),
  };
}

function normalizeFounderTerminalRun(latestRun: AiRunSummary | null) {
  if (!latestRun) {
    return null;
  }

  const hasNonRetryableError = isNonRetryableFailureCode(latestRun.errorCode ?? null);
  if (!hasNonRetryableError) {
    return latestRun;
  }

  if (latestRun.status === 'failed') {
    return latestRun;
  }

  return {
    ...latestRun,
    status: 'failed' as const,
  };
}

function deriveFounderFeedbackState(args: {
  latestRun: AiRunSummary | null;
  review: ReturnType<typeof toFounderReviewPayload> | null;
  stale: boolean;
}): FounderIdeaFeedbackStateValue {
  if (args.review?.partial) {
    return 'partial';
  }

  if (args.review) {
    return args.stale ? 'stale' : 'succeeded';
  }

  if (!args.latestRun) {
    return 'empty';
  }

  if (args.latestRun.status === 'queued') {
    return 'queued';
  }

  if (args.latestRun.status === 'running') {
    return 'processing';
  }

  if (args.latestRun.status === 'failed') {
    return 'failed';
  }

  if (args.latestRun.status === 'succeeded') {
    // A succeeded run without a review row is a transient persistence gap.
    return 'processing';
  }

  return 'empty';
}

function toFounderReviewPayload(
  row: Database['public']['Tables']['founder_idea_reviews']['Row'],
) {
  const metadata = toRecord(row.metadata);
  const structuredMode = toNullableString(metadata.structuredMode);
  const outputRecovery = toNullableString(metadata.outputRecovery);
  const partial = Boolean(
    metadata.syntheticFallback === true
    || structuredMode === 'best_effort_raw_fallback'
    || structuredMode === 'local_summary_fallback'
    || outputRecovery === 'best_effort_raw_mapping'
    || outputRecovery === 'local_summary_fallback',
  );

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
    partial,
    partialReason: partial
      ? toNullableString(metadata.partialReason) ?? outputRecovery ?? structuredMode ?? 'output_recovery'
      : null,
  };
}

function ensureOneLinerSummary(summary: string) {
  const trimmed = summary.trim();
  if (trimmed.length === 0) {
    return 'One-liner: AI generated a partial result and recovered only a minimal summary.';
  }

  if (trimmed.toLowerCase().startsWith('one-liner:')) {
    return trimmed;
  }

  return `One-liner: ${trimmed}`;
}

function buildFounderPartialReviewFromRun(args: {
  run: AiRunSummary;
  founderUserId: string;
  postId: string;
  reason: 'output_recovery' | 'missing_persisted_review';
}) {
  const runMetadata = toRecord(args.run.providerMetadata);
  const outputFailureSnapshot = toRecord(runMetadata.outputFailureSnapshot);
  const fallbackSummary = toNullableString(outputFailureSnapshot.lastOutputPreview)
    ?? toNullableString(outputFailureSnapshot.lastError)
    ?? toNullableString(args.run.errorMessage)
    ?? (args.reason === 'output_recovery'
      ? 'AI output was malformed and recovered as a partial result.'
      : 'AI run completed but persisted review payload was not available.');
  const validationIssue = toStringList(outputFailureSnapshot.validationIssues)[0]
    ?? toStringList(runMetadata.validationIssues)[0]
    ?? null;
  const providerConfidence = toNumber(runMetadata.runtimeConfidence);
  const partialSummary = ensureOneLinerSummary(fallbackSummary);

  return {
    id: `partial-${args.run.id}`,
    runId: args.run.id,
    postId: args.postId,
    founderUserId: args.founderUserId,
    verdict: 'needs_work',
    confidence: providerConfidence ?? 0.42,
    summary: partialSummary,
    strengths: [] as string[],
    risks: [
      validationIssue
        ? `Model output required recovery: ${validationIssue}`
        : 'Model output required structural recovery before display.',
    ],
    suggestions: [
      'Missing answer: Which single user signal confirms this idea is moving in the right direction?',
      'Next step experiment: Regenerate AI review and compare with current assumptions.',
    ],
    marketSignals: [] as string[],
    rewrite: null,
    reasoning: [
      args.reason === 'output_recovery'
        ? 'This review was reconstructed from partial model output after schema recovery failed.'
        : 'This review was reconstructed because the run completed without a persisted review row.',
    ],
    evidence: [] as Array<{
      claim: string;
      evidence: string;
      source: 'idea' | 'revision' | 'discussion' | 'market';
      confidence: number;
    }>,
    investorPushback: [] as string[],
    bestNextExperiment: 'Regenerate AI review and validate the strongest claim with a focused customer interview.',
    communityRead: null,
    moatConcern: null,
    version: {
      promptVersion: args.run.promptVersion,
      promptKey: args.run.promptKey ?? null,
      inputHash: args.run.inputHash ?? null,
    },
    createdAt: args.run.completedAt ?? args.run.failedAt ?? args.run.createdAt,
    partial: true,
    partialReason: args.reason,
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

  const result = await createOrReuseAiRun(args.supabase, {
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

  if (result.reused && !isReusableAiRunStatus(result.run.status)) {
    const forced = await createOrReuseAiRun(args.supabase, {
      feature: 'founder_idea_feedback',
      subjectType: 'startup_idea',
      subjectId: args.postId,
      requestedBy: args.founderUserId,
      promptVersion,
      promptKey,
      inputHash,
      runIdentity,
      forceRegenerate: true,
      parentRunId: result.run.id,
      traceId: args.traceId,
      metadata: {
        contextSnapshot: snapshot,
      },
    });

    return {
      ...forced,
      decisionReason: result.run.status === 'failed'
        ? 'skipped_failed_terminal_created_new'
        : 'skipped_cancelled_created_new',
    };
  }

  return result;
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

  logInfo('founder-feedback-run', 'Founder feedback execution started', {
    runId: args.run.id,
    traceId: args.run.traceId ?? null,
    feature: args.run.feature,
    subjectType: args.run.subjectType,
    subjectId: args.run.subjectId,
    promptVersion: args.run.promptVersion,
    promptKey: args.run.promptKey ?? null,
  });

  const systemPrompt = buildFounderIdeaSystemPrompt(args.run.promptVersion);
  const responseFormatInstructions = FOUNDER_RESPONSE_FORMAT_INSTRUCTIONS;
  let userPrompt = buildFounderIdeaUserPrompt(context);

  const promptTokenCeilingChars = MAX_FOUNDER_PROMPT_TOKENS * 4;
  const reservedPromptChars = systemPrompt.length + responseFormatInstructions.length;
  const maxUserPromptChars = Math.max(
    MIN_FOUNDER_USER_PROMPT_CHARS,
    promptTokenCeilingChars - reservedPromptChars,
  );
  const userPromptTrimmed = userPrompt.length > maxUserPromptChars;

  if (userPromptTrimmed) {
    userPrompt = userPrompt.slice(0, maxUserPromptChars);
  }

  const totalPromptCharacters = systemPrompt.length + responseFormatInstructions.length + userPrompt.length;
  const estimatedPromptTokens = estimateTokens(totalPromptCharacters);
  const totalTokensExpected = estimatedPromptTokens + FOUNDER_REVIEW_MAX_TOKENS;

  logInfo('founder-feedback-run', 'Founder feedback request budget', {
    runId: args.run.id,
    traceId: args.run.traceId ?? null,
    requestBudget: {
      estimatedPromptTokens,
      maxTokensRequested: FOUNDER_REVIEW_MAX_TOKENS,
      totalTokensExpected,
      promptTokenCeiling: MAX_FOUNDER_PROMPT_TOKENS,
      userPromptTrimmed,
    },
  });

  const structured = await (async () => {
    try {
      const minimalStructured = await runStructuredOutput({
        schema: FounderIdeaReviewSchema,
        systemPrompt,
        userPrompt,
        responseFormatInstructions,
        maxTokens: FOUNDER_REVIEW_MAX_TOKENS,
        maxRepairAttempts: 1,
        traceId: args.run.traceId ?? undefined,
      });

      return {
        ...minimalStructured,
        data: normalizeFounderFallbackReview(minimalStructured.data as FounderIdeaReviewFallback),
        providerMetadata: {
          ...minimalStructured.providerMetadata,
          structuredMode: 'minimal_schema',
        },
      };
    } catch (error) {
      if (!isAiRuntimeError(error) || error.code !== 'AI_OUTPUT_REPAIR_FAILED') {
        throw error;
      }

      const outputFailure = buildStructuredFailureSnapshot(error);

      logError('founder-feedback-run', 'Founder feedback minimal schema run failed', {
        runId: args.run.id,
        traceId: args.run.traceId ?? null,
        failureCode: outputFailure.code,
        failureMessage: outputFailure.message,
        provider: outputFailure.provider,
        model: outputFailure.model,
        requestId: outputFailure.requestId,
        repairCount: outputFailure.repairCount,
        parseFailureCount: outputFailure.parseFailureCount,
        validationFailureCount: outputFailure.validationFailureCount,
        topValidationIssues: outputFailure.validationIssues,
        topParseIssues: outputFailure.parseIssues,
        outputHash: outputFailure.lastOutputHash,
        outputLength: outputFailure.lastOutputLength,
      });

      logInfo('ai-structured-runner', 'Structured output raw fallback invoked', {
        runId: args.run.id,
        traceId: args.run.traceId ?? null,
        mode: 'best_effort_raw_fallback',
        outputFailureCode: outputFailure.code,
        outputFailureMessage: outputFailure.message,
      });

      let rawOutput = outputFailure.lastOutputPreview;
      let { provider, model, requestId } = outputFailure;
      let rawFallbackProviderMetadata: Record<string, unknown> = {
        structuredMode: 'best_effort_raw_fallback',
        outputFailureSnapshot: outputFailure,
      };
      let rawFallbackLatencyMs = 0;

      try {
        if (!rawOutput || rawOutput.length < 24) {
          const rawProvider = await invokeProviderForStructuredOutput({
            systemPrompt,
            userPrompt,
            responseFormatInstructions: FOUNDER_RESPONSE_FALLBACK_FORMAT_INSTRUCTIONS,
            maxTokens: FOUNDER_REVIEW_MAX_TOKENS,
            traceId: args.run.traceId ?? undefined,
          });

          rawOutput = rawProvider.outputText;
          provider = rawProvider.provider;
          model = rawProvider.modelVersion;
          requestId = rawProvider.requestId;
          rawFallbackLatencyMs = rawProvider.latencyMs;
          rawFallbackProviderMetadata = {
            ...rawFallbackProviderMetadata,
            rawProviderMetadata: rawProvider.providerMetadata,
          };
        }

        const bestEffortReview = mapFounderReviewFromRawOutput({
          rawOutput,
          fallbackSummary: outputFailure.lastError,
        });
        const qualitySignal = buildBestEffortQualitySignal({
          repairCount: Number(outputFailure.repairCount ?? 0),
          outputLength: rawOutput?.length ?? 0,
          parseFailureCount: outputFailure.parseFailureCount,
          validationFailureCount: outputFailure.validationFailureCount,
        });

        return {
          data: bestEffortReview,
          provider: provider ?? 'unknown',
          model: model ?? 'unknown',
          modelVersion: model ?? 'unknown',
          requestId: requestId ?? null,
          outputText: rawOutput ?? '',
          repairCount: Number(outputFailure.repairCount ?? 0),
          latencyMs: rawFallbackLatencyMs,
          providerMetadata: {
            ...rawFallbackProviderMetadata,
            outputRecovery: 'best_effort_raw_mapping',
          },
          confidence: qualitySignal.confidence,
          confidenceReasoning: qualitySignal.reasoning,
          qualitySignal,
        };
      } catch (rawFallbackError) {
        logError('founder-feedback-run', 'Founder feedback raw fallback call failed, returning local best-effort review', {
          runId: args.run.id,
          traceId: args.run.traceId ?? null,
          failureCode: isAiRuntimeError(rawFallbackError) ? rawFallbackError.code : 'INTERNAL_ERROR',
          failureMessage: rawFallbackError instanceof Error ? rawFallbackError.message : String(rawFallbackError),
        });

        const localBestEffortReview = mapFounderReviewFromRawOutput({
          rawOutput,
          fallbackSummary: outputFailure.lastError,
        });
        const qualitySignal = buildBestEffortQualitySignal({
          repairCount: Number(outputFailure.repairCount ?? 0),
          outputLength: rawOutput?.length ?? 0,
          parseFailureCount: outputFailure.parseFailureCount,
          validationFailureCount: outputFailure.validationFailureCount,
        });

        return {
          data: localBestEffortReview,
          provider: provider ?? 'unknown',
          model: model ?? 'unknown',
          modelVersion: model ?? 'unknown',
          requestId: requestId ?? null,
          outputText: rawOutput ?? '',
          repairCount: Number(outputFailure.repairCount ?? 0),
          latencyMs: 0,
          providerMetadata: {
            ...rawFallbackProviderMetadata,
            outputRecovery: 'local_summary_fallback',
            rawFallbackError: rawFallbackError instanceof Error ? rawFallbackError.message : String(rawFallbackError),
          },
          confidence: qualitySignal.confidence,
          confidenceReasoning: qualitySignal.reasoning,
          qualitySignal,
        };
      }
    }
  })();

  const review = structured.data as FounderIdeaReview;
  const confidence = Number(review.confidence.toFixed(2));
  const structuredProviderMetadata = toRecord(structured.providerMetadata);
  const structuredMode = toNullableString(structuredProviderMetadata.structuredMode)
    ?? (toNullableString(structuredProviderMetadata.outputRecovery) ? 'best_effort_raw_fallback' : 'minimal_schema');
  let persistedReviewId: string | null = null;

  await withSupabasePersistenceRetry({
    operationName: 'Founder feedback persistence',
    runId: args.run.id,
    operation: async () => {
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
            metadata: ({
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
              runtimeConfidence: structured.confidence,
              runtimeConfidenceReasoning: structured.confidenceReasoning,
              qualitySignal: structured.qualitySignal,
              structuredMode,
            } as unknown) as Database['public']['Tables']['founder_idea_reviews']['Insert']['metadata'],
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

      persistedReviewId = insertResult.data.id;
    },
  });

  logInfo('founder-feedback-run', 'Founder feedback result persisted', {
    runId: args.run.id,
    traceId: args.run.traceId ?? null,
    feature: args.run.feature,
    subjectId: args.run.subjectId,
    reviewId: persistedReviewId,
  });

  logInfo('founder-feedback-run', 'Founder feedback execution completed', {
    runId: args.run.id,
    traceId: args.run.traceId ?? null,
    feature: args.run.feature,
    subjectId: args.run.subjectId,
    provider: structured.provider,
    model: structured.modelVersion,
    requestId: structured.requestId,
    latencyMs: structured.latencyMs,
  });

  return {
    provider: structured.provider,
    model: structured.model,
    modelVersion: structured.modelVersion,
    latencyMs: structured.latencyMs,
    providerMetadata: {
      ...structured.providerMetadata,
      qualitySignal: structured.qualitySignal,
      runtimeConfidence: structured.confidence,
      runtimeConfidenceReasoning: structured.confidenceReasoning,
      repairCount: structured.repairCount,
    },
    qualitySignal: structured.qualitySignal,
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

  const [latestRunResult, latestReviewResult] = await Promise.all([
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
  ]);

  if (latestRunResult.error) {
    if (isTransientSupabaseReadError(latestRunResult.error)) {
      throw new AiRuntimeError(
        'ANALYSIS_SERVICE_UNAVAILABLE',
        'Founder feedback state is temporarily unavailable.',
        503,
        {
          transient: true,
          source: 'ai_runs',
        },
        'Retry this request shortly.',
      );
    }

    throw new Error(latestRunResult.error.message);
  }

  if (latestReviewResult.error) {
    if (isTransientSupabaseReadError(latestReviewResult.error)) {
      throw new AiRuntimeError(
        'ANALYSIS_SERVICE_UNAVAILABLE',
        'Founder feedback state is temporarily unavailable.',
        503,
        {
          transient: true,
          source: 'founder_idea_reviews',
        },
        'Retry this request shortly.',
      );
    }

    throw new Error(latestReviewResult.error.message);
  }

  let latestRun = latestRunResult.data
    ? normalizeFounderTerminalRun(toAiRunSummary(latestRunResult.data))
    : null;
  let review = latestReviewResult.data ? toFounderReviewPayload(latestReviewResult.data) : null;
  let recoveredFromLegacyOutputFailure = false;

  if (!review && latestRun?.status === 'failed' && latestRun.errorCode === 'AI_OUTPUT_REPAIR_FAILED') {
    review = buildFounderPartialReviewFromRun({
      run: latestRun,
      founderUserId: args.founderUserId,
      postId: args.postId,
      reason: 'output_recovery',
    });
    recoveredFromLegacyOutputFailure = true;
  }

  if (!review && latestRun?.status === 'succeeded') {
    review = buildFounderPartialReviewFromRun({
      run: latestRun,
      founderUserId: args.founderUserId,
      postId: args.postId,
      reason: 'missing_persisted_review',
    });
  }

  let snapshot: Awaited<ReturnType<typeof buildFounderIdeaContextSnapshot>> = null;
  if (review && !review.partial) {
    try {
      snapshot = await buildFounderIdeaContextSnapshot(args.supabase, args.postId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isTransientSupabaseReadError({ message })) {
        throw new AiRuntimeError(
          'ANALYSIS_SERVICE_UNAVAILABLE',
          'Founder feedback context is temporarily unavailable.',
          503,
          {
            transient: true,
            source: 'context_snapshot',
          },
          'Retry this request shortly.',
        );
      }

      throw error;
    }
  }

  const reviewCreatedAt = toTimestamp(review?.createdAt);
  const snapshotUpdatedAt = toTimestamp(snapshot?.updatedAt);
  const snapshotRevisionAt = toTimestamp(snapshot?.lastRevisionAt);
  const stale = Boolean(
    review
      && snapshot
      && reviewCreatedAt > 0
      && (reviewCreatedAt < snapshotRevisionAt || reviewCreatedAt < snapshotUpdatedAt),
  );

  const state = deriveFounderFeedbackState({
    latestRun,
    review,
    stale,
  });
  const shouldPoll = state === 'queued' || state === 'processing';
  const terminal = !shouldPoll;

  return {
    state,
    terminal,
    shouldPoll,
    latestRun,
    review,
    stale,
    recoveredFromLegacyOutputFailure,
    snapshot: snapshot ?? null,
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
