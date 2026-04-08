'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AiCopyButton } from '@/components/ai/AiCopyButton';
import { AiEvidenceList, type AiEvidenceItem } from '@/components/ai/AiEvidenceList';
import { AiEmptyState } from '@/components/ai/AiEmptyState';
import { AiErrorState } from '@/components/ai/AiErrorState';
import { AiMetadataRow } from '@/components/ai/AiMetadataRow';
import { AiRegenerateControl } from '@/components/ai/AiRegenerateControl';
import { AiScoreMeter } from '@/components/ai/AiScoreMeter';
import { AiShareButton } from '@/components/ai/AiShareButton';
import { AiSkeletonCard } from '@/components/ai/AiSkeletonCard';
import { AiStatusBadge } from '@/components/ai/AiStatusBadge';
import { Button } from '@/components/ui/button';
import type { AiRunSummary } from '@/lib/types';

interface FounderIdeaReviewView {
  id: string;
  runId: string;
  postId: string;
  founderUserId: string;
  verdict: string;
  confidence: number | null;
  summary: string;
  strengths: string[];
  risks: string[];
  suggestions: string[];
  marketSignals: string[];
  rewrite: string | null;
  reasoning: string[];
  evidence: AiEvidenceItem[];
  investorPushback?: string[];
  bestNextExperiment?: string | null;
  communityRead?: string | null;
  moatConcern?: string | null;
  version: {
    promptVersion: string | null;
    promptKey: string | null;
    inputHash: string | null;
  };
  createdAt: string;
}

interface FounderFeedbackState {
  latestRun: AiRunSummary | null;
  review: FounderIdeaReviewView | null;
  stale: boolean;
}

interface FounderFeedbackResponse {
  data?: FounderFeedbackState;
  error?: { message?: string };
}

interface FounderFeedbackCreateResponse {
  data?: {
    run: AiRunSummary;
    reused: boolean;
  };
  error?: {
    message?: string;
  };
}

interface ScoreBreakdownRow {
  label: string;
  score: number;
}

export interface FounderIdeaFeedbackPanelProps {
  ideaId: string;
  canRequest: boolean;
  targetAudience?: string | null;
  marketCategory?: string | null;
  stage?: string | null;
}

function formatVerdict(verdict: string | null | undefined) {
  if (!verdict) {
    return 'n/a';
  }

  return verdict.replaceAll('_', ' ');
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function toPercent(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function stripPrefix(value: string, prefix: string) {
  return value.toLowerCase().startsWith(prefix.toLowerCase())
    ? value.slice(prefix.length).trim()
    : value;
}

function splitSuggestions(review: FounderIdeaReviewView | null) {
  if (!review) {
    return {
      missingAnswers: [] as string[],
      nextSteps: [] as string[],
    };
  }

  const missingAnswers = [...(review.investorPushback ?? [])];
  const nextSteps: string[] = [];

  for (const entry of review.suggestions) {
    const value = entry.trim();
    const lower = value.toLowerCase();

    if (lower.startsWith('missing answer:')) {
      missingAnswers.push(stripPrefix(value, 'missing answer:'));
      continue;
    }

    if (lower.startsWith('next step experiment:')) {
      nextSteps.push(stripPrefix(value, 'next step experiment:'));
      continue;
    }

    if (/[?]$/.test(value) || /^(what|why|who|where|when|which|how)\b/i.test(lower)) {
      missingAnswers.push(value);
      continue;
    }

    nextSteps.push(value);
  }

  if (review.bestNextExperiment) {
    nextSteps.unshift(review.bestNextExperiment);
  }

  return {
    missingAnswers: Array.from(new Set(missingAnswers)).slice(0, 8),
    nextSteps: Array.from(new Set(nextSteps)).slice(0, 8),
  };
}

function buildScoreBreakdown(args: {
  review: FounderIdeaReviewView | null;
  missingAnswersCount: number;
  nextStepsCount: number;
}): ScoreBreakdownRow[] {
  if (!args.review) {
    return [];
  }

  const confidence = toPercent(args.review.confidence);
  const evidenceDepth = Math.min(100, args.review.evidence.length * 16 + args.review.marketSignals.length * 6);
  const differentiation = Math.min(100, args.review.strengths.length * 14 + (args.review.rewrite ? 22 : 0));
  const executionReadiness = Math.max(
    12,
    Math.min(100, 72 + args.nextStepsCount * 5 - args.review.risks.length * 7),
  );
  const proofGap = Math.min(
    100,
    args.missingAnswersCount * 15 + (args.review.verdict === 'high_risk' ? 24 : args.review.verdict === 'needs_work' ? 14 : 6),
  );

  return [
    { label: 'Signal confidence', score: confidence },
    { label: 'Evidence depth', score: evidenceDepth },
    { label: 'Differentiation clarity', score: differentiation },
    { label: 'Execution readiness', score: executionReadiness },
    { label: 'Proof-gap pressure', score: proofGap },
  ];
}

function scoreTone(score: number) {
  if (score >= 75) {
    return 'bg-emerald-400';
  }

  if (score >= 50) {
    return 'bg-amber-400';
  }

  return 'bg-rose-400';
}

export function FounderIdeaFeedbackPanel({
  ideaId,
  canRequest,
  targetAudience = null,
  marketCategory = null,
  stage = null,
}: FounderIdeaFeedbackPanelProps) {
  const [state, setState] = useState<FounderFeedbackState | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runStatus = state?.latestRun?.status ?? null;
  const isProcessing = runStatus === 'queued' || runStatus === 'running';

  const loadState = useCallback(async () => {
    if (!canRequest) {
      setState(null);
      return;
    }

    const response = await fetch(`/api/v1/ideas/${ideaId}/ai-feedback`, {
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as FounderFeedbackResponse | null;

    if (!response.ok || !payload?.data) {
      throw new Error(payload?.error?.message ?? 'Could not load founder feedback.');
    }

    setState(payload.data);
  }, [canRequest, ideaId]);

  useEffect(() => {
    if (!canRequest) {
      setLoading(false);
      setError(null);
      setState(null);
      return;
    }

    setLoading(true);
    setError(null);

    loadState()
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load founder feedback.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [canRequest, loadState]);

  useEffect(() => {
    if (!canRequest || !isProcessing) {
      return;
    }

    const interval = setInterval(() => {
      void loadState().catch(() => {
        // Keep existing UI state and allow manual retry if a poll fails.
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [canRequest, isProcessing, loadState]);

  async function triggerGeneration(regenerate: boolean) {
    if (!canRequest) {
      return;
    }

    setRequesting(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/ideas/${ideaId}/ai-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate }),
      });

      const payload = (await response.json().catch(() => null)) as FounderFeedbackCreateResponse | null;

      if (!response.ok || !payload?.data?.run) {
        throw new Error(payload?.error?.message ?? 'Could not start founder feedback generation.');
      }

      setState((current) => ({
        latestRun: payload.data?.run ?? null,
        review: current?.review ?? null,
        stale: current?.stale ?? false,
      }));

      await loadState();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not start founder feedback generation.');
    } finally {
      setRequesting(false);
    }
  }

  const metadataItems = useMemo(
    () => [
      {
        label: 'Prompt',
        value: state?.review?.version.promptVersion ?? state?.latestRun?.promptVersion ?? null,
      },
      {
        label: 'Model',
        value: state?.latestRun?.modelVersion ?? state?.latestRun?.model ?? null,
      },
      {
        label: 'Run',
        value: state?.latestRun?.id ?? null,
      },
      {
        label: 'Generated',
        value: formatDate(state?.review?.createdAt),
      },
    ],
    [
      state?.latestRun?.id,
      state?.latestRun?.model,
      state?.latestRun?.modelVersion,
      state?.latestRun?.promptVersion,
      state?.review?.createdAt,
      state?.review?.version.promptVersion,
    ],
  );

  const { missingAnswers, nextSteps } = useMemo(
    () => splitSuggestions(state?.review ?? null),
    [state?.review],
  );

  const scoreBreakdown = useMemo(
    () =>
      buildScoreBreakdown({
        review: state?.review ?? null,
        missingAnswersCount: missingAnswers.length,
        nextStepsCount: nextSteps.length,
      }),
    [missingAnswers.length, nextSteps.length, state?.review],
  );

  const reportText = useMemo(() => {
    if (!state?.review) {
      return null;
    }

    return [
      `Verdict: ${formatVerdict(state.review.verdict)}`,
      `Confidence: ${toPercent(state.review.confidence)}%`,
      '',
      `Summary: ${state.review.summary}`,
      '',
      'Strengths:',
      ...state.review.strengths.map((item) => `- ${item}`),
      '',
      'Risks:',
      ...state.review.risks.map((item) => `- ${item}`),
      '',
      'Suggestions:',
      ...state.review.suggestions.map((item) => `- ${item}`),
      '',
      `Rewrite:\n${state.review.rewrite ?? 'n/a'}`,
    ].join('\n');
  }, [state?.review]);

  const statusInlineMessage = useMemo(() => {
    if (runStatus === 'queued') {
      return 'Queued for analysis. You can keep working while this run processes.';
    }

    if (runStatus === 'running') {
      return 'AI analysis is running. Previous output remains visible until this run completes.';
    }

    if (runStatus === 'failed') {
      return state?.latestRun?.errorMessage ?? 'The latest run failed. Retry when ready.';
    }

    if (runStatus === 'succeeded') {
      return 'Latest AI review is ready.';
    }

    return null;
  }, [runStatus, state?.latestRun?.errorMessage]);

  const primaryActionLabel = state?.review ? 'Regenerate AI Review' : 'Get AI Feedback';

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-bg-surface/90 p-5 shadow-[0_18px_70px_rgba(8,13,30,0.45)] sm:p-6">
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-text-tertiary">Founder Intelligence</p>
            <h2 className="mt-2 text-xl font-semibold text-text-primary sm:text-2xl">AI Idea Review</h2>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Strategy-memo style feedback focused on concrete risks, missing proof, and the strongest next experiment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {runStatus ? <AiStatusBadge status={runStatus} /> : null}
            {canRequest ? (
              <Button
                type="button"
                size="sm"
                onClick={() => void triggerGeneration(Boolean(state?.review))}
                disabled={requesting || isProcessing}
              >
                {requesting || isProcessing ? 'Working...' : primaryActionLabel}
              </Button>
            ) : null}
          </div>
        </div>

        {statusInlineMessage ? (
          <div className="rounded-2xl border border-border-subtle bg-bg-base/70 px-4 py-3 text-sm text-text-secondary">
            {statusInlineMessage}
          </div>
        ) : null}

        {error ? <AiErrorState message={error} /> : null}

        {!canRequest ? (
          <div className="rounded-2xl border border-border-subtle bg-bg-base/70 p-4 text-sm text-text-secondary">
            Founder-only panel. Sign in as the startup author to run or regenerate AI review.
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            <AiSkeletonCard lines={3} />
            <AiSkeletonCard lines={4} />
          </div>
        ) : null}

        {!loading && !state?.review && canRequest ? (
          <div className="space-y-4">
            <AiEmptyState
              title="No founder AI review yet"
              message="Run AI Review to generate a sharp verdict, concrete risks, missing answers, and a stronger rewrite."
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void triggerGeneration(false)}
                disabled={requesting || isProcessing}
              >
                {requesting || isProcessing ? 'Starting...' : runStatus === 'failed' ? 'Retry AI Feedback' : 'Get AI Feedback'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled
              >
                Strategy Memo Mode
              </Button>
            </div>
          </div>
        ) : null}

        {state?.review ? (
          <div className="space-y-5">
            {state.stale ? (
              <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                This report is stale because the idea changed after the last run.
              </div>
            ) : null}

            <AiMetadataRow items={metadataItems} />

            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-border-subtle bg-bg-base/80 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-text-tertiary">Hero Verdict</div>
                <p className="mt-2 text-lg font-semibold capitalize text-text-primary">{formatVerdict(state.review.verdict)}</p>
                <p className="mt-1 text-xs text-text-tertiary">Overall score</p>
                <AiScoreMeter value={state.review.confidence} label="Review confidence" />
              </div>

              <div className="rounded-2xl border border-border-subtle bg-bg-base/80 p-4">
                <h3 className="text-sm font-semibold text-text-primary">One-liner + Thesis</h3>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{state.review.summary}</p>
                {(targetAudience || marketCategory || stage) ? (
                  <div className="mt-4 grid gap-3 rounded-2xl border border-border-subtle bg-bg-overlay/40 p-3 text-sm text-text-secondary sm:grid-cols-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">ICP</div>
                      <p className="mt-1 text-text-primary">{targetAudience ?? 'Not specified'}</p>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Category</div>
                      <p className="mt-1 text-text-primary">{marketCategory ?? 'Not specified'}</p>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Stage</div>
                      <p className="mt-1 capitalize text-text-primary">{stage ? stage.replaceAll('_', ' ') : 'Not specified'}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {scoreBreakdown.length > 0 ? (
              <div className="rounded-2xl border border-border-subtle bg-bg-base/80 p-4">
                <h3 className="text-sm font-semibold text-text-primary">Score Breakdown</h3>
                <p className="mt-1 text-xs text-text-tertiary">
                  Heuristic view derived from confidence, evidence density, and recommendation quality.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {scoreBreakdown.map((row) => (
                    <div key={row.label} className="space-y-1 rounded-xl border border-border-subtle bg-bg-overlay/40 p-3">
                      <div className="flex items-center justify-between text-xs text-text-tertiary">
                        <span>{row.label}</span>
                        <span className="font-medium text-text-primary">{row.score}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-bg-base">
                        <div
                          className={`h-full rounded-full transition-all ${scoreTone(row.score)}`}
                          style={{ width: `${row.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {state.review.rewrite ? (
              <div className="rounded-2xl border border-accent/30 bg-bg-base/85 p-4 shadow-[0_0_0_1px_rgba(99,102,241,0.18)]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">Rewrite Block</h3>
                  <div className="flex flex-wrap gap-2">
                    <AiCopyButton value={state.review.rewrite} label="Copy rewrite" />
                    <AiShareButton title="Credvia Founder Rewrite" text={state.review.rewrite} />
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">{state.review.rewrite}</p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-bg-base/80 p-4">
                <h3 className="text-sm font-semibold text-text-primary">Strengths</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                  {state.review.strengths.map((item, index) => (
                    <li key={`strength-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-rose-500/20 bg-bg-base/80 p-4">
                <h3 className="text-sm font-semibold text-text-primary">Risks</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                  {state.review.risks.map((item, index) => (
                    <li key={`risk-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-amber-500/20 bg-bg-base/80 p-4">
                <h3 className="text-sm font-semibold text-text-primary">Missing Answers</h3>
                {missingAnswers.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                    {missingAnswers.map((item, index) => (
                      <li key={`missing-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-text-secondary">No explicit missing-answer prompts were returned.</p>
                )}
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-bg-base/80 p-4">
                <h3 className="text-sm font-semibold text-text-primary">Next Steps</h3>
                {nextSteps.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                    {nextSteps.map((item, index) => (
                      <li key={`next-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-text-secondary">No next-step experiments were returned.</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border-subtle bg-bg-base/80 p-4">
                <h3 className="text-sm font-semibold text-text-primary">Market Signals</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                  {state.review.marketSignals.map((item, index) => (
                    <li key={`signal-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-bg-base/80 p-4">
                <h3 className="text-sm font-semibold text-text-primary">Reasoning Trail</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                  {state.review.reasoning.map((item, index) => (
                    <li key={`reasoning-${index}`}>{item}</li>
                  ))}
                </ul>

                {(state.review.communityRead || state.review.moatConcern) ? (
                  <div className="mt-4 space-y-2 rounded-xl border border-border-subtle bg-bg-overlay/40 p-3 text-sm text-text-secondary">
                    {state.review.communityRead ? (
                      <p>
                        <span className="font-medium text-text-primary">Community read:</span> {state.review.communityRead}
                      </p>
                    ) : null}
                    {state.review.moatConcern ? (
                      <p>
                        <span className="font-medium text-text-primary">Moat concern:</span> {state.review.moatConcern}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <AiEvidenceList items={state.review.evidence} />

            <div className="flex flex-wrap gap-2">
              {canRequest ? (
                <AiRegenerateControl
                  onRegenerate={() => {
                    void triggerGeneration(true);
                  }}
                  loading={requesting || isProcessing}
                  disabled={requesting || isProcessing}
                  label="Regenerate"
                />
              ) : null}
              {reportText ? <AiCopyButton value={reportText} label="Copy report" /> : null}
            </div>
          </div>
        ) : null}

        {!loading && runStatus === 'failed' && !state?.review && canRequest ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            {state?.latestRun?.errorMessage ?? 'Founder feedback generation failed.'}
          </div>
        ) : null}
      </div>
    </section>
  );
}
