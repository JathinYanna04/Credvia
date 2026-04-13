import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getFounderIdeaOwnership, buildFounderIdeaContextSnapshot } = vi.hoisted(() => ({
  getFounderIdeaOwnership: vi.fn(),
  buildFounderIdeaContextSnapshot: vi.fn(),
}));

vi.mock('@/lib/ai/features/founder-feedback/context', () => ({
  getFounderIdeaOwnership,
  buildFounderIdeaContextSnapshot,
  buildFounderIdeaPromptContext: vi.fn(),
}));

import { getFounderIdeaFeedbackState } from '@/lib/ai/features/founder-feedback/service';

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
  };

  return builder;
}

function createSupabaseMock(args: {
  runResult: { data: unknown; error: unknown };
  reviewResult: { data: unknown; error: unknown };
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'ai_runs') {
        return createBuilder(args.runResult);
      }

      if (table === 'founder_idea_reviews') {
        return createBuilder(args.reviewResult);
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Parameters<typeof getFounderIdeaFeedbackState>[0]['supabase'];
}

function buildRunRow(
  status: 'queued' | 'running' | 'succeeded' | 'failed',
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `run-${status}`,
    feature: 'founder_idea_feedback',
    subject_type: 'startup_idea',
    subject_id: 'idea-1',
    requested_by: 'founder-1',
    status,
    prompt_version: 'founder-v1',
    prompt_key: 'founder-feedback-core',
    input_hash: 'hash-1',
    run_identity: 'identity-1',
    max_attempts: 3,
    attempt_count: status === 'failed' ? 3 : 1,
    latency_ms: null,
    provider: null,
    model: null,
    model_version: null,
    request_id: null,
    trace_id: null,
    error_code: status === 'failed' ? 'AI_OUTPUT_REPAIR_FAILED' : null,
    error_message: status === 'failed' ? 'The model output did not pass schema validation after repair attempts.' : null,
    metadata: null,
    provider_metadata: null,
    processor_id: null,
    lease_token: null,
    lease_expires_at: null,
    next_retry_at: '2026-04-08T00:00:00.000Z',
    created_at: '2026-04-08T00:00:00.000Z',
    started_at: status === 'running' ? '2026-04-08T00:00:03.000Z' : null,
    completed_at: status === 'succeeded' ? '2026-04-08T00:00:08.000Z' : null,
    failed_at: status === 'failed' ? '2026-04-08T00:00:08.000Z' : null,
    ...overrides,
  };
}

function buildReviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    run_id: 'run-succeeded',
    post_id: 'idea-1',
    founder_user_id: 'founder-1',
    verdict: 'needs_work',
    confidence: 0.72,
    summary: 'One-liner: Signal exists but proof of distribution repeatability is still weak.',
    strengths: ['Clear pain statement'],
    risks: ['No repeatable channel'],
    suggestions: ['Missing answer: Why switch now?'],
    market_signals: ['Founders ask for faster validation loops'],
    metadata: {
      rewrite: 'Title: Better\nBody: Better',
      reasoning: ['Evidence is directional but not conclusive'],
      evidence: [
        {
          claim: 'Pain is clear',
          evidence: 'Problem statement references onboarding failures',
          source: 'idea',
          confidence: 0.8,
        },
      ],
      promptVersion: 'founder-v1',
      promptKey: 'founder-feedback-core',
      inputHash: 'hash-1',
    },
    created_at: '2026-04-08T00:00:10.000Z',
    ...overrides,
  };
}

const baseSnapshot = {
  postId: 'idea-1',
  founderUserId: 'founder-1',
  updatedAt: '2026-04-08T00:00:00.000Z',
  revisionCount: 1,
  lastRevisionAt: '2026-04-08T00:00:00.000Z',
  commentCount: 0,
  stage: 'problem_validation',
  validationScore: 65,
};

describe('getFounderIdeaFeedbackState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFounderIdeaOwnership.mockResolvedValue({
      postId: 'idea-1',
      founderUserId: 'founder-1',
      updatedAt: '2026-04-08T00:00:00.000Z',
    });
    buildFounderIdeaContextSnapshot.mockResolvedValue(baseSnapshot);
  });

  it('returns clean empty state when no run and no review exist', async () => {
    const supabase = createSupabaseMock({
      runResult: { data: null, error: null },
      reviewResult: { data: null, error: null },
    });

    const state = await getFounderIdeaFeedbackState({
      supabase,
      postId: 'idea-1',
      founderUserId: 'founder-1',
    });

    expect(state).toBeTruthy();
    expect(state?.state).toBe('empty');
    expect(state?.terminal).toBe(true);
    expect(state?.shouldPoll).toBe(false);
    expect(state?.latestRun).toBeNull();
    expect(state?.review).toBeNull();
    expect(state?.stale).toBe(false);
    expect(state?.recoveredFromLegacyOutputFailure).toBe(false);
  });

  it('returns pending state when queued run exists and review is missing', async () => {
    const supabase = createSupabaseMock({
      runResult: { data: buildRunRow('queued'), error: null },
      reviewResult: { data: null, error: null },
    });

    const state = await getFounderIdeaFeedbackState({
      supabase,
      postId: 'idea-1',
      founderUserId: 'founder-1',
    });

    expect(state?.state).toBe('queued');
    expect(state?.terminal).toBe(false);
    expect(state?.shouldPoll).toBe(true);
    expect(state?.latestRun?.status).toBe('queued');
    expect(state?.review).toBeNull();
  });

  it('treats queued run with non-retryable config error as terminal failure', async () => {
    const supabase = createSupabaseMock({
      runResult: {
        data: buildRunRow('queued', {
          error_code: 'AI_PROVIDER_NOT_CONFIGURED',
          error_message: 'Provider groq is selected but no API key is configured.',
        }),
        error: null,
      },
      reviewResult: { data: null, error: null },
    });

    const state = await getFounderIdeaFeedbackState({
      supabase,
      postId: 'idea-1',
      founderUserId: 'founder-1',
    });

    expect(state?.state).toBe('failed');
    expect(state?.terminal).toBe(true);
    expect(state?.shouldPoll).toBe(false);
    expect(state?.latestRun?.status).toBe('failed');
    expect(state?.latestRun?.errorCode).toBe('AI_PROVIDER_NOT_CONFIGURED');
  });

  it('returns pending state when running run exists and review is missing', async () => {
    const supabase = createSupabaseMock({
      runResult: { data: buildRunRow('running'), error: null },
      reviewResult: { data: null, error: null },
    });

    const state = await getFounderIdeaFeedbackState({
      supabase,
      postId: 'idea-1',
      founderUserId: 'founder-1',
    });

    expect(state?.state).toBe('processing');
    expect(state?.terminal).toBe(false);
    expect(state?.shouldPoll).toBe(true);
    expect(state?.latestRun?.status).toBe('running');
    expect(state?.review).toBeNull();
  });

  it('returns partial state when run succeeded but review row is not yet persisted', async () => {
    const supabase = createSupabaseMock({
      runResult: { data: buildRunRow('succeeded'), error: null },
      reviewResult: { data: null, error: null },
    });

    const state = await getFounderIdeaFeedbackState({
      supabase,
      postId: 'idea-1',
      founderUserId: 'founder-1',
    });

    expect(state?.state).toBe('partial');
    expect(state?.terminal).toBe(true);
    expect(state?.shouldPoll).toBe(false);
    expect(state?.latestRun?.status).toBe('succeeded');
    expect(state?.review).toBeTruthy();
    expect(state?.review?.partial).toBe(true);
    expect(state?.review?.partialReason).toBe('missing_persisted_review');
  });

  it('returns partial review state when output-repair failure exists without persisted review', async () => {
    const supabase = createSupabaseMock({
      runResult: { data: buildRunRow('failed'), error: null },
      reviewResult: { data: null, error: null },
    });

    const state = await getFounderIdeaFeedbackState({
      supabase,
      postId: 'idea-1',
      founderUserId: 'founder-1',
    });

    expect(state?.state).toBe('partial');
    expect(state?.terminal).toBe(true);
    expect(state?.shouldPoll).toBe(false);
    expect(state?.latestRun?.status).toBe('failed');
    expect(state?.review).toBeTruthy();
    expect(state?.review?.partial).toBe(true);
    expect(state?.review?.partialReason).toBe('output_recovery');
    expect(state?.recoveredFromLegacyOutputFailure).toBe(true);
  });

  it('returns completed review state and handles null metadata safely', async () => {
    const supabase = createSupabaseMock({
      runResult: { data: buildRunRow('succeeded'), error: null },
      reviewResult: {
        data: buildReviewRow({
          strengths: null,
          risks: null,
          suggestions: null,
          market_signals: null,
          metadata: null,
        }),
        error: null,
      },
    });

    const state = await getFounderIdeaFeedbackState({
      supabase,
      postId: 'idea-1',
      founderUserId: 'founder-1',
    });

    expect(state?.state).toBe('succeeded');
    expect(state?.terminal).toBe(true);
    expect(state?.shouldPoll).toBe(false);
    expect(state?.latestRun?.status).toBe('succeeded');
    expect(state?.review?.id).toBe('review-1');
    expect(state?.review?.strengths).toEqual([]);
    expect(state?.review?.risks).toEqual([]);
    expect(state?.review?.suggestions).toEqual([]);
    expect(state?.review?.marketSignals).toEqual([]);
    expect(state?.review?.version.promptVersion).toBeNull();
  });
});
