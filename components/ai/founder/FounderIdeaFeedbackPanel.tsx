'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiCopyButton } from '@/components/ai/AiCopyButton';
import { AiEvidenceList, type AiEvidenceItem } from '@/components/ai/AiEvidenceList';
import { AiEmptyState } from '@/components/ai/AiEmptyState';
import { AiErrorState } from '@/components/ai/AiErrorState';
import { AiMetadataRow } from '@/components/ai/AiMetadataRow';
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
  state?: 'empty' | 'queued' | 'processing' | 'succeeded' | 'failed' | 'stale';
  terminal?: boolean;
  shouldPoll?: boolean;
  latestRun: AiRunSummary | null;
  review: FounderIdeaReviewView | null;
  stale: boolean;
  recoveredFromLegacyOutputFailure?: boolean;
}

interface FounderFeedbackError {
  code?: string;
  message?: string;
  suggestedAction?: string;
}

interface FounderFeedbackResponse {
  data?: FounderFeedbackState;
  error?: FounderFeedbackError;
}

interface FounderFeedbackCreateResponse {
  data?: {
    run: AiRunSummary;
    reused: boolean;
  };
  error?: FounderFeedbackError;
}

type FeedbackLoadResult =
  | { kind: 'success'; data: FounderFeedbackState }
  | { kind: 'unauthorized'; message: string; code: string | null }
  | { kind: 'temporary'; message: string; code: string | null }
  | { kind: 'error'; message: string; code: string | null }
  | { kind: 'aborted' };

type PollStopReason =
  | 'succeeded'
  | 'failed'
  | 'unauthenticated'
  | 'network-degraded'
  | 'max-attempts'
  | 'hidden-tab'
  | 'idle';

type GenerationBlockReason =
  | 'cannot_request'
  | 'already_loading'
  | 'already_polling'
  | 'missing_idea_id';

type GenerationInfoReason = 'stale_recovered_state';

const MAX_POLL_ATTEMPTS = 24;
const MAX_TRANSIENT_POLL_FAILURES = 4;
const FAST_POLL_DELAY_MS = 1500;
const MEDIUM_POLL_DELAY_MS = 3500;
const SLOW_POLL_DELAY_MS = 7000;
const FOUNDER_CONFIG_ERROR_MESSAGE =
  'AI review is not configured yet. Groq is selected, but no API key is available to process this request.';

function getGenerationBlockReason(args: {
  ideaId: string;
  canRequest: boolean;
  isLoading: boolean;
  isPolling: boolean;
}): GenerationBlockReason | null {
  if (!args.ideaId.trim()) {
    return 'missing_idea_id';
  }

  if (!args.canRequest) {
    return 'cannot_request';
  }

  if (args.isLoading) {
    return 'already_loading';
  }

  if (args.isPolling) {
    return 'already_polling';
  }

  return null;
}

function isGenerationButtonDisabled(reason: GenerationBlockReason | null) {
  return reason === 'already_loading' || reason === 'already_polling';
}

function isGenerationActionBlocked(reason: GenerationBlockReason | null) {
  return reason !== null;
}

function getGenerationBlockReasonMessage(reason: GenerationBlockReason | null) {
  if (reason === 'cannot_request') {
    return 'cannot_request: founder permissions are missing for this idea.';
  }

  if (reason === 'already_loading') {
    return 'already_loading: feedback state is still loading.';
  }

  if (reason === 'already_polling') {
    return 'already_polling: a generation run is already queued/running.';
  }

  if (reason === 'missing_idea_id') {
    return 'missing_idea_id: cannot send generation request without a valid idea id.';
  }

  return null;
}

function getGenerationInfoReason(args: {
  hasRecoveredLegacyEmptyState: boolean;
}): GenerationInfoReason | null {
  if (args.hasRecoveredLegacyEmptyState) {
    return 'stale_recovered_state';
  }

  return null;
}

function getGenerationInfoReasonMessage(reason: GenerationInfoReason | null) {
  if (reason === 'stale_recovered_state') {
    return 'A prior malformed output was cleared. You can request a fresh AI review now.';
  }

  return null;
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

function isPollableRunStatus(status: AiRunSummary['status'] | null) {
  return status === 'queued' || status === 'running';
}

function shouldPollState(state: FounderFeedbackState | null) {
  if (!state) {
    return false;
  }

  const hasPollableRun = isPollableRunStatus(state.latestRun?.status ?? null);
  if (!hasPollableRun) {
    return false;
  }

  if (state.shouldPoll === false) {
    return false;
  }

  return true;
}

function nextPollDelay(attempt: number) {
  if (attempt <= 3) {
    return FAST_POLL_DELAY_MS;
  }

  if (attempt <= 10) {
    return MEDIUM_POLL_DELAY_MS;
  }

  return SLOW_POLL_DELAY_MS;
}

function isTemporaryErrorStatus(status: number, code: string | null) {
  return status >= 500 || status === 429 || code === 'ANALYSIS_SERVICE_UNAVAILABLE';
}

function isUnauthorizedStatus(status: number, code: string | null) {
  return status === 401 || code === 'UNAUTHORIZED';
}

function resolveRunErrorMessage(run: AiRunSummary | null | undefined) {
  if (!run) {
    return null;
  }

  const metadata = run.providerMetadata && typeof run.providerMetadata === 'object'
    ? (run.providerMetadata as Record<string, unknown>)
    : {};
  const metadataErrorCode = typeof metadata.errorCode === 'string' ? metadata.errorCode : null;
  const effectiveCode = run.errorCode ?? metadataErrorCode;

  if (effectiveCode === 'AI_OUTPUT_REPAIR_FAILED') {
    const validationIssues = Array.isArray(metadata.validationIssues)
      ? metadata.validationIssues.filter((item): item is string => typeof item === 'string')
      : [];
    const primaryIssue = validationIssues[0] ?? null;

    if (primaryIssue) {
      return `AI review output needed recovery and was returned as partial success. ${primaryIssue}`;
    }

    return 'AI review output needed recovery and was returned as partial success. Retry to regenerate for a fully structured response.';
  }

  if (effectiveCode === 'AI_PROVIDER_NOT_CONFIGURED') {
    return FOUNDER_CONFIG_ERROR_MESSAGE;
  }

  if (effectiveCode === 'RATE_LIMITED') {
    return 'AI review is temporarily rate-limited. Please retry in a few seconds.';
  }

  return run.errorMessage ?? null;
}

function resolveStructuredMode(run: AiRunSummary | null | undefined) {
  const metadata = run?.providerMetadata && typeof run.providerMetadata === 'object'
    ? (run.providerMetadata as Record<string, unknown>)
    : {};

  return typeof metadata.structuredMode === 'string' ? metadata.structuredMode : null;
}

function isRecoveredPartialMode(mode: string | null) {
  return mode === 'best_effort_raw_fallback' || mode === 'local_summary_fallback';
}

function logPollEvent(event: string, meta: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      scope: 'founder-feedback-poll',
      event,
      ...meta,
    }),
  );
}

function terminalReasonFromState(state: FounderFeedbackState): PollStopReason {
  if (state.latestRun?.status === 'failed' || state.state === 'failed') {
    return 'failed';
  }

  if (state.review || state.state === 'succeeded' || state.state === 'stale') {
    return 'succeeded';
  }

  return 'idle';
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
  const [pollingActive, setPollingActive] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [pollFailureStreak, setPollFailureStreak] = useState(0);
  const [pollTick, setPollTick] = useState(0);
  const [pollNotice, setPollNotice] = useState<string | null>(null);
  const [pollStopReason, setPollStopReason] = useState<PollStopReason | null>(null);
  const [visibilityPaused, setVisibilityPaused] = useState(false);

  const stateRef = useRef<FounderFeedbackState | null>(null);
  const pollInFlightRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingActiveRef = useRef(false);
  const pollAttemptRef = useRef(0);
  const pollFailureRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    pollingActiveRef.current = pollingActive;
  }, [pollingActive]);

  useEffect(() => {
    pollAttemptRef.current = pollAttempt;
  }, [pollAttempt]);

  useEffect(() => {
    pollFailureRef.current = pollFailureStreak;
  }, [pollFailureStreak]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info('[founder-feedback] panel mounted', {
      version: 'debug-1',
      ideaId,
      canRequest,
    });
  }, [canRequest, ideaId]);

  const runStatus = state?.latestRun?.status ?? null;
  const structuredMode = resolveStructuredMode(state?.latestRun ?? null);
  const isPartialRecoveredSuccess = Boolean(state?.review && isRecoveredPartialMode(structuredMode));
  const isProcessing = shouldPollState(state);
  const isGenerationLoading = loading || requesting;
  const isGenerationPolling = isProcessing || pollingActive;
  const hasRecoveredLegacyEmptyState = Boolean(
    !loading
    && state?.state === 'empty'
    && !state?.latestRun
    && !state?.review
    && state?.recoveredFromLegacyOutputFailure,
  );
  const generationBlockReason = getGenerationBlockReason({
    ideaId,
    canRequest,
    isLoading: isGenerationLoading,
    isPolling: isGenerationPolling,
  });
  const generationBlockMessage = getGenerationBlockReasonMessage(generationBlockReason);
  const generationInfoReason = getGenerationInfoReason({
    hasRecoveredLegacyEmptyState,
  });
  const generationInfoMessage = getGenerationInfoReasonMessage(generationInfoReason);
  const generationDisabled = isGenerationButtonDisabled(generationBlockReason);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info('[founder-feedback] button render', {
      canRequest,
      isLoading: isGenerationLoading,
      isPolling: isGenerationPolling,
      latestRunStatus: runStatus,
      latestRunErrorCode: state?.latestRun?.errorCode ?? null,
      hasReview: Boolean(state?.review),
      disabled: generationDisabled,
      disabledReason: generationDisabled ? generationBlockReason : null,
      gateReason: generationBlockReason,
      infoReason: generationInfoReason,
    });
  }, [
    canRequest,
    generationBlockReason,
    generationInfoReason,
    generationDisabled,
    isGenerationLoading,
    isGenerationPolling,
    runStatus,
    state?.latestRun?.errorCode,
    state?.review,
  ]);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const abortPollRequest = useCallback(() => {
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(
    (reason: PollStopReason, message?: string) => {
      clearPollTimer();
      abortPollRequest();
      pollInFlightRef.current = false;
      pollingActiveRef.current = false;
      setPollingActive(false);
      setPollStopReason(reason);

      if (message) {
        setPollNotice(message);
      }

      if (reason === 'hidden-tab') {
        setVisibilityPaused(true);
      }

      logPollEvent('stop', {
        reason,
        attempts: pollAttemptRef.current,
        transientFailures: pollFailureRef.current,
      });
    },
    [abortPollRequest, clearPollTimer],
  );

  const startPolling = useCallback(
    (source: 'initial' | 'trigger' | 'resume') => {
      if (!canRequest || pollingActiveRef.current) {
        // eslint-disable-next-line no-console
        console.warn('[founder-feedback] aborted before request', {
          reason: canRequest ? 'already_polling' : 'cannot_request',
          stage: 'start_polling',
          source,
        });
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        setVisibilityPaused(true);
        setPollStopReason('hidden-tab');
        setPollNotice('Polling paused while this tab is in the background.');
        // eslint-disable-next-line no-console
        console.warn('[founder-feedback] aborted before request', {
          reason: 'hidden_tab_visibility',
          stage: 'start_polling',
          source,
        });
        return;
      }

      setVisibilityPaused(false);
      setPollStopReason(null);
      setPollNotice(null);
      setPollAttempt(0);
      setPollFailureStreak(0);
      pollingActiveRef.current = true;
      setPollingActive(true);
      setPollTick((value) => value + 1);

      logPollEvent('start', {
        source,
      });
    },
    [canRequest],
  );

  const fetchFeedbackState = useCallback(
    async (
      source: 'initial' | 'manual' | 'poll',
      signal?: AbortSignal,
    ): Promise<FeedbackLoadResult> => {
      try {
        const response = await fetch(`/api/v1/ideas/${ideaId}/ai-feedback`, {
          cache: 'no-store',
          signal,
          headers: {
            'x-credvia-ai-feedback-source': source,
          },
        });

        const payload = (await response.json().catch(() => null)) as FounderFeedbackResponse | null;

        if (response.ok && payload?.data) {
          return {
            kind: 'success',
            data: payload.data,
          };
        }

        const code = payload?.error?.code ?? null;
        const message = payload?.error?.message ?? 'Could not load founder feedback.';

        if (isUnauthorizedStatus(response.status, code)) {
          return {
            kind: 'unauthorized',
            message: 'Your session is no longer available. Sign in again to continue polling.',
            code,
          };
        }

        if (isTemporaryErrorStatus(response.status, code)) {
          return {
            kind: 'temporary',
            message: 'Temporarily unable to refresh AI review.',
            code,
          };
        }

        return {
          kind: 'error',
          message,
          code,
        };
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return {
            kind: 'aborted',
          };
        }

        return {
          kind: 'temporary',
          message: 'Temporarily unable to refresh AI review.',
          code: null,
        };
      }
    },
    [ideaId],
  );

  const applyLoadedState = useCallback((nextState: FounderFeedbackState) => {
    setState((current) => {
      const preserveLastReview =
        Boolean(current?.review)
        && !nextState.review
        && shouldPollState(nextState);

      return {
        ...nextState,
        review: preserveLastReview ? current?.review ?? null : nextState.review,
      };
    });
    setError(null);
  }, []);

  const refreshState = useCallback(
    async (source: 'initial' | 'manual') => {
      const outcome = await fetchFeedbackState(source);

      if (outcome.kind === 'success') {
        applyLoadedState(outcome.data);
      }

      return outcome;
    },
    [applyLoadedState, fetchFeedbackState],
  );

  useEffect(() => {
    let disposed = false;

    if (!canRequest) {
      setLoading(false);
      setError(null);
      setState(null);
      setPollNotice(null);
      setPollStopReason('idle');
      stopPolling('idle');
      return;
    }

    setLoading(true);
    setError(null);
    setPollNotice(null);

    void (async () => {
      const outcome = await refreshState('initial');
      if (disposed) {
        return;
      }

      if (outcome.kind === 'success') {
        if (shouldPollState(outcome.data)) {
          startPolling('initial');
        } else {
          setPollStopReason(terminalReasonFromState(outcome.data));
        }
      } else if (outcome.kind === 'unauthorized') {
        setPollStopReason('unauthenticated');
        setError(outcome.message);
      } else if (outcome.kind === 'temporary') {
        setPollStopReason('network-degraded');
        setPollNotice('Temporarily unable to refresh AI review.');
      } else if (outcome.kind === 'error') {
        setError(outcome.message);
      }

      setLoading(false);
    })();

    return () => {
      disposed = true;
    };
  }, [canRequest, ideaId, refreshState, startPolling, stopPolling]);

  useEffect(() => {
    if (!pollingActive || visibilityPaused) {
      return;
    }

    clearPollTimer();
    const delayMs = pollAttempt === 0 ? 0 : nextPollDelay(pollAttempt);
    pollTimerRef.current = setTimeout(() => {
      setPollTick((value) => value + 1);
    }, delayMs);

    return () => {
      clearPollTimer();
    };
  }, [clearPollTimer, pollAttempt, pollingActive, visibilityPaused]);

  useEffect(() => {
    if (!pollingActive || visibilityPaused) {
      return;
    }

    if (pollInFlightRef.current) {
      return;
    }

    const controller = new AbortController();
    pollAbortRef.current = controller;
    pollInFlightRef.current = true;

    void (async () => {
      const outcome = await fetchFeedbackState('poll', controller.signal);

      if (outcome.kind === 'aborted') {
        return;
      }

      if (outcome.kind === 'success') {
        applyLoadedState(outcome.data);
        setPollFailureStreak(0);

        const nextAttemptValue = pollAttemptRef.current + 1;
        if (!shouldPollState(outcome.data)) {
          stopPolling(terminalReasonFromState(outcome.data));
          return;
        }

        if (nextAttemptValue >= MAX_POLL_ATTEMPTS) {
          stopPolling(
            'max-attempts',
            'AI analysis is taking longer than expected. Polling paused. Use Resume Polling to continue.',
          );
          return;
        }

        setPollAttempt(nextAttemptValue);
        return;
      }

      if (outcome.kind === 'unauthorized') {
        setError(null);
        stopPolling('unauthenticated', outcome.message);
        return;
      }

      if (outcome.kind === 'temporary') {
        const nextFailureValue = pollFailureRef.current + 1;
        const nextAttemptValue = pollAttemptRef.current + 1;
        setPollFailureStreak(nextFailureValue);

        if (nextFailureValue >= MAX_TRANSIENT_POLL_FAILURES) {
          stopPolling(
            'network-degraded',
            'Temporarily unable to refresh AI review. Polling paused to avoid repeated failures.',
          );
          return;
        }

        if (nextAttemptValue >= MAX_POLL_ATTEMPTS) {
          stopPolling(
            'max-attempts',
            'AI analysis is taking longer than expected. Polling paused. Use Resume Polling to continue.',
          );
          return;
        }

        setPollNotice('Temporarily unable to refresh AI review. Retrying with backoff.');
        setPollAttempt(nextAttemptValue);
        return;
      }

      setError(outcome.message);
      stopPolling('network-degraded', 'Unable to refresh AI review. Retry when ready.');
    })().finally(() => {
      if (pollAbortRef.current === controller) {
        pollAbortRef.current = null;
      }

      pollInFlightRef.current = false;
    });
  }, [applyLoadedState, fetchFeedbackState, pollTick, pollingActive, stopPolling, visibilityPaused]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const onVisibilityChange = () => {
      const hidden = document.visibilityState === 'hidden';

      if (hidden) {
        if (pollingActive) {
          stopPolling('hidden-tab', 'Polling paused while this tab is in the background.');
        }
        return;
      }

      setVisibilityPaused(false);

      if (pollStopReason === 'hidden-tab' && shouldPollState(stateRef.current)) {
        startPolling('resume');
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [pollStopReason, pollingActive, startPolling, stopPolling]);

  useEffect(() => {
    return () => {
      clearPollTimer();
      abortPollRequest();
    };
  }, [abortPollRequest, clearPollTimer]);

  async function resumePolling() {
    setError(null);
    setPollNotice(null);

    const outcome = await refreshState('manual');

    if (outcome.kind === 'success') {
      if (shouldPollState(outcome.data)) {
        startPolling('resume');
        return;
      }

      setPollStopReason(terminalReasonFromState(outcome.data));
      return;
    }

    if (outcome.kind === 'unauthorized') {
      stopPolling('unauthenticated', outcome.message);
      return;
    }

    if (outcome.kind === 'temporary') {
      stopPolling('network-degraded', 'Temporarily unable to refresh AI review.');
      return;
    }

    if (outcome.kind === 'error') {
      setError(outcome.message);
    }
  }

  async function retryRefresh() {
    setError(null);
    const outcome = await refreshState('manual');

    if (outcome.kind === 'success') {
      if (shouldPollState(outcome.data)) {
        startPolling('resume');
      } else {
        setPollStopReason(terminalReasonFromState(outcome.data));
        setPollNotice(null);
      }
      return;
    }

    if (outcome.kind === 'unauthorized') {
      setPollStopReason('unauthenticated');
      setPollNotice(outcome.message);
      return;
    }

    if (outcome.kind === 'temporary') {
      setPollStopReason('network-degraded');
      setPollNotice(outcome.message);
      return;
    }

    if (outcome.kind === 'error') {
      setError(outcome.message);
    }
  }

  async function triggerGeneration(regenerate: boolean) {
    const currentState = stateRef.current;
    const latestRunStatus = currentState?.latestRun?.status ?? null;
    const latestRunErrorCode = currentState?.latestRun?.errorCode ?? null;
    const localRecoveredState = Boolean(
      !loading
      && currentState?.state === 'empty'
      && !currentState?.latestRun
      && !currentState?.review
      && currentState?.recoveredFromLegacyOutputFailure,
    );

    const blockReason = getGenerationBlockReason({
      ideaId,
      canRequest,
      isLoading: loading || requesting,
      isPolling: shouldPollState(currentState) || pollingActiveRef.current,
    });
    const infoReason = getGenerationInfoReason({
      hasRecoveredLegacyEmptyState: localRecoveredState,
    });
    const disabled = isGenerationButtonDisabled(blockReason);
    const requestBlocked = isGenerationActionBlocked(blockReason);

    // eslint-disable-next-line no-console
    console.info('[founder-feedback] click triggered', {
      ideaId,
      regenerate,
    });

    // eslint-disable-next-line no-console
    console.info('[founder-feedback] click', {
      ideaId,
      canRequest,
      disabled,
      latestRunStatus,
      latestRunErrorCode,
      gateReason: blockReason,
      infoReason,
    });

    if (requestBlocked) {
      const message = getGenerationBlockReasonMessage(blockReason);
      // eslint-disable-next-line no-console
      console.warn('[founder-feedback] aborted before request', {
        reason: blockReason,
        ideaId,
      });

      if (message) {
        setPollNotice(message);
      }

      return;
    }

    setRequesting(true);
    setError(null);

    try {
      const shouldForceNewRun = regenerate
        || stateRef.current?.state === 'failed'
        || stateRef.current?.latestRun?.status === 'failed';
      const requestPayload = {
        regenerate: shouldForceNewRun,
        forceNewRun: shouldForceNewRun,
      };

      // eslint-disable-next-line no-console
      console.info('[founder-feedback] post triggered', {
        ideaId,
        url: `/api/v1/ideas/${ideaId}/ai-feedback`,
        payload: requestPayload,
      });

      // eslint-disable-next-line no-console
      console.info('[founder-feedback] about to POST /ai-feedback', {
        ideaId,
        url: `/api/v1/ideas/${ideaId}/ai-feedback`,
        method: 'POST',
        payload: requestPayload,
      });

      const response = await fetch(`/api/v1/ideas/${ideaId}/ai-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      // eslint-disable-next-line no-console
      console.info('[founder-feedback] POST completed', {
        status: response.status,
      });

      const responsePayload = (await response.json().catch(() => null)) as FounderFeedbackCreateResponse | null;

      if (!response.ok || !responsePayload?.data?.run) {
        // eslint-disable-next-line no-console
        console.warn('[founder-feedback] aborted before request', {
          reason: 'post_response_invalid',
          status: response.status,
          errorCode: responsePayload?.error?.code ?? null,
        });
        throw new Error(responsePayload?.error?.message ?? 'Could not start founder feedback generation.');
      }

      const optimisticState: FounderFeedbackState = {
        state: 'queued',
        terminal: false,
        shouldPoll: true,
        latestRun: responsePayload.data?.run ?? null,
        review: stateRef.current?.review ?? null,
        stale: stateRef.current?.stale ?? false,
      };

      applyLoadedState(optimisticState);
      startPolling('trigger');

      const refreshOutcome = await refreshState('manual');
      if (refreshOutcome.kind === 'success' && !shouldPollState(refreshOutcome.data)) {
        stopPolling(terminalReasonFromState(refreshOutcome.data));
      }
    } catch (requestError) {
      // eslint-disable-next-line no-console
      console.warn('[founder-feedback] aborted before request', {
        reason: 'request_exception',
        message: requestError instanceof Error ? requestError.message : String(requestError),
      });
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
    if (pollNotice) {
      return pollNotice;
    }

    if (isPartialRecoveredSuccess) {
      return 'AI review completed with partial structure recovery after output-format issues.';
    }

    if (state?.state === 'failed') {
      return resolveRunErrorMessage(state.latestRun) ?? 'The latest run failed. Retry when ready.';
    }

    if (pollStopReason === 'unauthenticated') {
      return 'Session is unavailable. Sign in again, then resume polling.';
    }

    if (pollStopReason === 'network-degraded') {
      return 'Temporarily unable to refresh AI review. Use Resume Polling when ready.';
    }

    if (pollStopReason === 'max-attempts') {
      return 'Polling paused after a bounded window to avoid endless network activity.';
    }

    if (runStatus === 'queued') {
      return 'Queued for analysis. You can keep working while this run processes.';
    }

    if (runStatus === 'running') {
      return 'AI analysis is running. Previous output remains visible until this run completes.';
    }

    if (runStatus === 'failed') {
      return resolveRunErrorMessage(state?.latestRun) ?? 'The latest run failed. Retry when ready.';
    }

    if (runStatus === 'succeeded') {
      return state?.review ? 'Latest AI review is ready.' : 'Run completed. Waiting for review payload to settle.';
    }

    return null;
  }, [
    isPartialRecoveredSuccess,
    pollNotice,
    pollStopReason,
    runStatus,
    state?.latestRun?.errorCode,
    state?.latestRun?.errorMessage,
    state?.latestRun?.providerMetadata,
    state?.review,
  ]);

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
                title={generationBlockMessage ?? generationInfoMessage ?? undefined}
                aria-disabled={generationDisabled}
              >
                {requesting || isProcessing ? 'Working...' : primaryActionLabel}
              </Button>
            ) : null}
          </div>
        </div>

        {generationBlockMessage ? (
          <div
            className="rounded-2xl border border-border-subtle bg-bg-base/70 px-4 py-3 text-xs text-text-secondary"
            data-testid="founder-feedback-generation-block-reason"
          >
            Generation gate: {generationBlockMessage}
          </div>
        ) : null}

        {!generationBlockMessage && generationInfoMessage ? (
          <div
            className="rounded-2xl border border-border-subtle/70 bg-bg-base/40 px-4 py-3 text-xs text-text-secondary"
            data-testid="founder-feedback-generation-info-reason"
          >
            {generationInfoMessage}
          </div>
        ) : null}

        {statusInlineMessage ? (
          <div className="rounded-2xl border border-border-subtle bg-bg-base/70 px-4 py-3 text-sm text-text-secondary">
            {statusInlineMessage}
          </div>
        ) : null}

        {canRequest && (
          pollStopReason === 'unauthenticated'
          || pollStopReason === 'network-degraded'
          || pollStopReason === 'max-attempts'
          || pollStopReason === 'hidden-tab'
        ) ? (
          <div className="rounded-2xl border border-border-subtle bg-bg-base/70 px-4 py-3 text-sm text-text-secondary">
            <p>
              {pollStopReason === 'unauthenticated'
                ? 'Session issue detected during polling.'
                : pollStopReason === 'hidden-tab'
                  ? 'Polling is paused because the tab is hidden.'
                  : 'Polling is paused to avoid repeated failed requests.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void resumePolling();
                }}
              >
                Resume Polling
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void retryRefresh();
                }}
              >
                Retry Refresh
              </Button>
            </div>
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
                title={generationBlockMessage ?? generationInfoMessage ?? undefined}
                aria-disabled={generationDisabled}
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
            {isPartialRecoveredSuccess ? (
              <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                Partial success: output formatting recovery was applied to build this review. Regenerate for a cleaner structured run.
              </div>
            ) : null}

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
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void triggerGeneration(true);
                  }}
                  title={generationBlockMessage ?? generationInfoMessage ?? undefined}
                  aria-disabled={generationDisabled}
                >
                  {requesting || isProcessing ? 'Regenerating...' : 'Regenerate'}
                </Button>
              ) : null}
              {reportText ? <AiCopyButton value={reportText} label="Copy report" /> : null}
            </div>
          </div>
        ) : null}

        {!loading && runStatus === 'failed' && !state?.review && canRequest ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            {resolveRunErrorMessage(state?.latestRun) ?? 'Founder feedback generation failed.'}
          </div>
        ) : null}
      </div>
    </section>
  );
}
