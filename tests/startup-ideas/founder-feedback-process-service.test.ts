import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRuntimeError } from '@/lib/ai/errors';

const {
  buildFounderIdeaPromptContext,
  getFounderIdeaOwnership,
  buildFounderIdeaContextSnapshot,
} = vi.hoisted(() => ({
  buildFounderIdeaPromptContext: vi.fn(),
  getFounderIdeaOwnership: vi.fn(),
  buildFounderIdeaContextSnapshot: vi.fn(),
}));

const { runStructuredOutput } = vi.hoisted(() => ({
  runStructuredOutput: vi.fn(),
}));

const { invokeProviderForStructuredOutput } = vi.hoisted(() => ({
  invokeProviderForStructuredOutput: vi.fn(),
}));

vi.mock('@/lib/ai/features/founder-feedback/context', () => ({
  buildFounderIdeaPromptContext,
  getFounderIdeaOwnership,
  buildFounderIdeaContextSnapshot,
}));

vi.mock('@/lib/ai/structured-runner', () => ({
  runStructuredOutput,
}));

vi.mock('@/lib/ai/provider-adapter', () => ({
  invokeProviderForStructuredOutput,
}));

import { processFounderIdeaFeedbackRun } from '@/lib/ai/features/founder-feedback/service';

function createSupabaseMock() {
  const single = vi.fn(async () => ({
    data: { id: 'review-1' },
    error: null,
  }));
  const select = vi.fn(() => ({ single }));
  const upsert = vi.fn(() => ({ select }));

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'founder_idea_reviews') {
        return {
          upsert,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown;

  return {
    supabase,
    upsert,
  };
}

function buildFounderContext() {
  return {
    postId: 'idea-1',
    founderUserId: 'founder-1',
    updatedAt: '2026-04-08T00:00:00.000Z',
    revisionCount: 1,
    lastRevisionAt: '2026-04-08T00:00:00.000Z',
    commentCount: 1,
    stage: 'problem_validation',
    validationScore: 63,
    title: 'Launch readiness copilot',
    body: 'AI catches high-risk launch blockers before customer rollout.',
    problem: 'Teams discover launch blockers too late.',
    targetAudience: 'B2B SaaS onboarding teams',
    solution: 'Automated launch QA and risk ranking',
    marketCategory: 'SaaS onboarding operations',
    monetizationModel: 'subscription',
    revisions: [],
    topComments: [],
  };
}

function buildQualitySignal() {
  return {
    confidence: 0.66,
    reasoning: ['Output quality recovered with fallback.'],
    stability: 'medium' as const,
    repairCount: 1,
    providerAttemptCount: 1,
    parseFailureCount: 0,
    validationFailureCount: 1,
    missingFieldCount: 0,
    outputLength: 400,
  };
}

describe('processFounderIdeaFeedbackRun fallback flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildFounderIdeaPromptContext.mockResolvedValue(buildFounderContext());
    getFounderIdeaOwnership.mockResolvedValue({
      postId: 'idea-1',
      founderUserId: 'founder-1',
      updatedAt: '2026-04-08T00:00:00.000Z',
    });
    buildFounderIdeaContextSnapshot.mockResolvedValue(null);
  });

  it('uses minimal schema first and persists normalized founder review', async () => {
    runStructuredOutput
      .mockResolvedValueOnce({
        data: {
          verdict: 'needs_work',
          confidence: 0.58,
          summary: 'One-liner: Pain is real but proof of switching behavior is weak.',
          strengths: ['Concrete pain statement.'],
          risks: ['No repeatable distribution channel yet.'],
          suggestions: [],
          marketSignals: [],
          reasoning: ['Core pain exists but willingness-to-pay is not validated.'],
          evidence: [],
          rewrite: null,
        },
        provider: 'groq',
        model: 'llama-3.3-70b',
        modelVersion: 'llama-3.3-70b',
        requestId: 'req-fallback-1',
        outputText: '{"summary":"fallback"}',
        repairCount: 1,
        latencyMs: 85,
        providerMetadata: { attemptCount: 1 },
        confidence: 0.66,
        confidenceReasoning: ['Fallback succeeded.'],
        qualitySignal: buildQualitySignal(),
      });

    const { supabase, upsert } = createSupabaseMock();

    const result = await processFounderIdeaFeedbackRun({
      supabase: supabase as never,
      run: {
        id: 'run-1',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-1',
        requestedBy: 'founder-1',
        status: 'running',
        promptVersion: 'founder-v1',
        promptKey: 'founder-feedback-core',
        inputHash: 'hash-1',
        createdAt: '2026-04-08T00:00:00.000Z',
        traceId: 'trace-1',
      },
    });

    expect(runStructuredOutput).toHaveBeenCalledTimes(1);
    expect(
      (runStructuredOutput.mock.calls[0]?.[0] as { responseFormatInstructions?: string }).responseFormatInstructions,
    ).toContain('Required keys: verdict, confidence, summary.');
    expect(invokeProviderForStructuredOutput).not.toHaveBeenCalled();

    expect(result.providerMetadata).toEqual(
      expect.objectContaining({
        structuredMode: 'minimal_schema',
      }),
    );

    const insertedPayload = upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    const metadata = insertedPayload.metadata as Record<string, unknown>;

    expect(insertedPayload.summary).toContain('One-liner:');
    expect(insertedPayload.suggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Missing answer:'),
        expect.stringContaining('Next step experiment:'),
      ]),
    );
    expect(typeof metadata.rewrite).toBe('string');
    expect(metadata.structuredMode).toBe('minimal_schema');
  });

  it('returns best-effort review when output validation fails', async () => {
    runStructuredOutput
      .mockRejectedValueOnce(new AiRuntimeError(
        'AI_OUTPUT_REPAIR_FAILED',
        'The model output did not pass schema validation after repair attempts.',
        422,
        {
          provider: 'groq',
          model: 'llama-3.3-70b',
          requestId: 'req-minimal-2',
          validationIssues: ['summary: Required'],
          lastOutputPreview: '{"summary":"One-liner: recovered from raw output"}',
          parseIssues: ['direct: Unexpected token'],
          repairCount: 1,
        },
      ));

    const { supabase, upsert } = createSupabaseMock();

    const result = await processFounderIdeaFeedbackRun({
      supabase: supabase as never,
      run: {
        id: 'run-2',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-1',
        requestedBy: 'founder-1',
        status: 'running',
        promptVersion: 'founder-v1',
        promptKey: 'founder-feedback-core',
        inputHash: 'hash-1',
        createdAt: '2026-04-08T00:00:00.000Z',
        traceId: 'trace-2',
      },
    });

    expect(result.providerMetadata).toEqual(
      expect.objectContaining({
        structuredMode: 'best_effort_raw_fallback',
        outputRecovery: 'best_effort_raw_mapping',
      }),
    );
    expect(invokeProviderForStructuredOutput).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('persists local fallback review when raw fallback retrieval fails', async () => {
    runStructuredOutput.mockRejectedValueOnce(new AiRuntimeError(
      'AI_OUTPUT_REPAIR_FAILED',
      'The model output did not pass schema validation after repair attempts.',
      422,
      {
        provider: 'groq',
        model: 'llama-3.3-70b',
        requestId: 'req-minimal-3',
        validationIssues: ['summary: Required'],
      },
    ));

    invokeProviderForStructuredOutput.mockRejectedValueOnce(new AiRuntimeError(
      'AI_PROVIDER_UNAVAILABLE',
      'Provider invocation failed.',
      503,
      {
        provider: 'groq',
        status: 503,
      },
    ));

    const { supabase, upsert } = createSupabaseMock();

    const result = await processFounderIdeaFeedbackRun({
      supabase: supabase as never,
      run: {
        id: 'run-3',
        feature: 'founder_idea_feedback',
        subjectType: 'startup_idea',
        subjectId: 'idea-1',
        requestedBy: 'founder-1',
        status: 'running',
        promptVersion: 'founder-v1',
        promptKey: 'founder-feedback-core',
        inputHash: 'hash-1',
        createdAt: '2026-04-08T00:00:00.000Z',
        traceId: 'trace-3',
      },
    });

    expect(result.providerMetadata).toEqual(
      expect.objectContaining({
        structuredMode: 'best_effort_raw_fallback',
        outputRecovery: 'local_summary_fallback',
      }),
    );
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
