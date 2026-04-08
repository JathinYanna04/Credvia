'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AiEmptyState } from '@/components/ai/AiEmptyState';
import { AiErrorState } from '@/components/ai/AiErrorState';
import { AiMetadataRow } from '@/components/ai/AiMetadataRow';
import { AiRegenerateControl } from '@/components/ai/AiRegenerateControl';
import { AiScoreMeter } from '@/components/ai/AiScoreMeter';
import { AiSkeletonCard } from '@/components/ai/AiSkeletonCard';
import { AiStatusBadge } from '@/components/ai/AiStatusBadge';
import { Button } from '@/components/ui/button';
import type { AiRunSummary } from '@/lib/types';

const MODES = [
  { value: 'fit_explanation', label: 'Fit Explanation' },
  { value: 'gap_analysis', label: 'Gap Analysis' },
  { value: 'action_plan', label: 'Action Plan' },
  { value: 'interview_questions', label: 'Interview Questions' },
] as const;

type CareerMode = (typeof MODES)[number]['value'];

interface CareerInsightView {
  id: string;
  sessionId: string;
  runId: string;
  mode: string;
  headline: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  nextSteps: string[];
  suggestedRoles: string[];
  output: unknown;
  version: {
    promptVersion: string | null;
    promptKey: string | null;
    inputHash: string | null;
  };
  createdAt: string;
}

interface SessionView {
  id: string;
  title: string | null;
  updated_at: string;
}

interface SessionState {
  session: SessionView;
  latestRun: AiRunSummary | null;
  insights: CareerInsightView[];
}

interface CareerOverviewResponse {
  data?: {
    sessions: SessionView[];
    insights: CareerInsightView[];
    latestRuns: AiRunSummary[];
  };
  error?: { message?: string };
}

interface CareerSessionResponse {
  data?: SessionState;
  error?: { message?: string };
}

interface CareerCreateResponse {
  data?: {
    run: AiRunSummary;
    reused: boolean;
    sessionId: string;
    mode: CareerMode;
  };
  error?: { message?: string };
}

export interface CareerCopilotPanelProps {
  matchId: string;
  resumeId: string;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function inferScoreFromInsight(insight: CareerInsightView | null) {
  if (!insight || !insight.output || typeof insight.output !== 'object') {
    return null;
  }

  const score = (insight.output as Record<string, unknown>).fitScore;
  return typeof score === 'number' ? score : null;
}

export function CareerCopilotPanel({ matchId, resumeId }: CareerCopilotPanelProps) {
  const [mode, setMode] = useState<CareerMode>('fit_explanation');
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestInsight = sessionState?.insights?.[0] ?? null;
  const runStatus = sessionState?.latestRun?.status ?? null;
  const isProcessing = runStatus === 'queued' || runStatus === 'running';

  const loadOverview = useCallback(async () => {
    const response = await fetch('/api/v1/career/copilot', { cache: 'no-store' });
    const payload = (await response.json().catch(() => null)) as CareerOverviewResponse | null;

    if (!response.ok || !payload?.data) {
      throw new Error(payload?.error?.message ?? 'Could not load Career Copilot overview.');
    }

    setSessions(payload.data.sessions);

    if (!selectedSessionId && payload.data.sessions.length > 0) {
      setSelectedSessionId(payload.data.sessions[0]?.id ?? null);
    }
  }, [selectedSessionId]);

  const loadSession = useCallback(async () => {
    if (!selectedSessionId) {
      setSessionState(null);
      return;
    }

    const response = await fetch(`/api/v1/career/copilot?sessionId=${selectedSessionId}`, {
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as CareerSessionResponse | null;

    if (!response.ok || !payload?.data) {
      throw new Error(payload?.error?.message ?? 'Could not load Career Copilot session.');
    }

    setSessionState(payload.data);
  }, [selectedSessionId]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    loadOverview()
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load Career Copilot.');
      })
      .finally(() => setLoading(false));
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }

    void loadSession().catch((fetchError) => {
      setError(fetchError instanceof Error ? fetchError.message : 'Could not load Career Copilot session.');
    });
  }, [loadSession, selectedSessionId]);

  useEffect(() => {
    if (!isProcessing) {
      return;
    }

    const poll = setInterval(() => {
      void loadSession().catch(() => {
        // Keep rendering the last known state and allow manual refresh.
      });
    }, 3000);

    return () => clearInterval(poll);
  }, [isProcessing, loadSession]);

  async function trigger(modeToRun: CareerMode, regenerate: boolean) {
    setRequesting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/career/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: modeToRun,
          resumeId,
          matchId,
          sessionId: selectedSessionId ?? undefined,
          regenerate,
        }),
      });

      const payload = (await response.json().catch(() => null)) as CareerCreateResponse | null;

      if (!response.ok || !payload?.data?.run) {
        throw new Error(payload?.error?.message ?? 'Could not start Career Copilot run.');
      }

      setSelectedSessionId(payload.data.sessionId);
      await loadOverview();
      await loadSession();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not start Career Copilot run.');
    } finally {
      setRequesting(false);
    }
  }

  const metadataItems = useMemo(
    () => [
      {
        label: 'Prompt',
        value: latestInsight?.version.promptVersion ?? sessionState?.latestRun?.promptVersion ?? null,
      },
      {
        label: 'Model',
        value: sessionState?.latestRun?.modelVersion ?? sessionState?.latestRun?.model ?? null,
      },
      {
        label: 'Generated',
        value: formatDate(latestInsight?.createdAt),
      },
    ],
    [
      latestInsight?.createdAt,
      latestInsight?.version.promptVersion,
      sessionState?.latestRun?.model,
      sessionState?.latestRun?.modelVersion,
      sessionState?.latestRun?.promptVersion,
    ],
  );

  return (
    <section className="surface-panel space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Career Copilot</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Mode-based AI guidance with persisted session history and regenerate support.
          </p>
        </div>
        {runStatus ? <AiStatusBadge status={runStatus} /> : null}
      </div>

      {error ? (
        <AiErrorState message={error} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {MODES.map((entry) => (
          <Button
            key={entry.value}
            type="button"
            variant={mode === entry.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode(entry.value)}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            void trigger(mode, false);
          }}
          disabled={requesting || isProcessing}
        >
          {requesting || isProcessing ? 'Starting...' : 'Run Career Copilot'}
        </Button>
        <AiRegenerateControl
          onRegenerate={() => {
            void trigger(mode, true);
          }}
          loading={requesting || isProcessing}
          disabled={!selectedSessionId || requesting || isProcessing}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <AiSkeletonCard lines={3} />
        </div>
      ) : null}

      {!loading && sessions.length === 0 ? (
        <AiEmptyState
          title="No copilot session yet"
          message="Run any mode to create your first Career Copilot session for this match context."
        />
      ) : null}

      {!loading && sessions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {sessions.slice(0, 8).map((session) => (
            <Button
              key={session.id}
              type="button"
              size="sm"
              variant={selectedSessionId === session.id ? 'secondary' : 'outline'}
              onClick={() => setSelectedSessionId(session.id)}
            >
              {(session.title ?? 'Session').slice(0, 40)}
            </Button>
          ))}
        </div>
      ) : null}

      {latestInsight ? (
        <div className="space-y-4 rounded-2xl border border-border-subtle bg-bg-base p-4">
          <AiMetadataRow items={metadataItems} />

          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-surface p-4">
              <div className="text-xs uppercase tracking-[0.12em] text-text-tertiary">Mode</div>
              <p className="text-sm font-semibold capitalize text-text-primary">
                {latestInsight.mode.replaceAll('_', ' ')}
              </p>
              <AiScoreMeter value={inferScoreFromInsight(latestInsight)} label="Fit Score" />
            </div>
            <div className="space-y-2 rounded-2xl border border-border-subtle bg-bg-surface p-4">
              <h3 className="text-base font-semibold text-text-primary">{latestInsight.headline}</h3>
              <p className="text-sm text-text-secondary">{latestInsight.summary}</p>
            </div>
          </div>

          {latestInsight.strengths.length > 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
              <h4 className="text-sm font-semibold text-text-primary">Strengths</h4>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                {latestInsight.strengths.map((item, index) => (
                  <li key={`strength-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {latestInsight.gaps.length > 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
              <h4 className="text-sm font-semibold text-text-primary">Gaps and Risks</h4>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                {latestInsight.gaps.map((item, index) => (
                  <li key={`gap-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {latestInsight.nextSteps.length > 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
              <h4 className="text-sm font-semibold text-text-primary">Action Steps</h4>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                {latestInsight.nextSteps.map((item, index) => (
                  <li key={`step-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {latestInsight.suggestedRoles.length > 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
              <h4 className="text-sm font-semibold text-text-primary">Suggested Roles</h4>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
                {latestInsight.suggestedRoles.map((item, index) => (
                  <span key={`role-${index}`} className="rounded-full bg-bg-overlay px-3 py-1">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
