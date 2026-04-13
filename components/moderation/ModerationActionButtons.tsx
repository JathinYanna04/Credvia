'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AiStatusBadge } from '@/components/ai/AiStatusBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AiRunStatus } from '@/lib/types';

export interface ModerationActionButtonsProps {
  reportId: string;
  aiReview?: {
    id: string;
    riskLabel: string;
    confidence: number | null;
    rationale: string;
    suggestedAction: 'dismiss' | 'hide' | 'remove';
    suggestedReason: string | null;
    evidence: unknown[];
    createdAt: string;
  } | null;
}

export function ModerationActionButtons({ reportId, aiReview = null }: ModerationActionButtonsProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [localAiReview, setLocalAiReview] = useState(aiReview);
  const [aiRunStatus, setAiRunStatus] = useState<AiRunStatus | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setLocalAiReview(aiReview);
  }, [aiReview]);

  const loadAiState = useCallback(async () => {
    const response = await fetch(`/api/v1/mod/ai/review?reportId=${reportId}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: {
        latestRun?: { status?: AiRunStatus } | null;
        review?: ModerationActionButtonsProps['aiReview'];
      };
    } | null;

    if (payload?.data?.latestRun?.status) {
      setAiRunStatus(payload.data.latestRun.status);
    }

    if (payload?.data?.review) {
      setLocalAiReview(payload.data.review);
    }
  }, [reportId]);

  useEffect(() => {
    if (aiRunStatus !== 'queued' && aiRunStatus !== 'running') {
      return;
    }

    const interval = setInterval(() => {
      void loadAiState();
    }, 3000);

    return () => clearInterval(interval);
  }, [aiRunStatus, loadAiState]);

  async function triggerAiReview(regenerate: boolean) {
    setAnalyzing(true);
    setError(null);

    const response = await fetch('/api/v1/mod/ai/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, regenerate }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(payload?.error?.message ?? 'Could not start moderation AI review.');
      setAnalyzing(false);
      return;
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: { run?: { status?: AiRunStatus } };
    } | null;

    setAiRunStatus(payload?.data?.run?.status ?? 'queued');
    await loadAiState();
    setAnalyzing(false);
  }

  const submit = async (action: 'dismiss' | 'hide' | 'remove') => {
    setLoadingAction(action);
    setError(null);

    const activeReview = localAiReview ?? aiReview;
    const isOverride = Boolean(activeReview && activeReview.suggestedAction !== action);

    const response = await fetch('/api/v1/mod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportId,
        action,
        aiReviewId: activeReview?.id,
        suggestedAction: activeReview?.suggestedAction,
        overrideReason: isOverride ? (overrideReason.trim() || undefined) : undefined,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(payload?.error?.message ?? 'Moderation action failed.');
      setLoadingAction(null);
      return;
    }

    router.refresh();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {aiRunStatus ? <AiStatusBadge status={aiRunStatus} /> : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={analyzing}
          onClick={() => {
            void triggerAiReview(Boolean(localAiReview ?? aiReview));
          }}
        >
          {analyzing ? 'Analyzing...' : (localAiReview ?? aiReview) ? 'Regenerate AI review' : 'Analyze with AI'}
        </Button>
      </div>

      {(localAiReview ?? aiReview) ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-base p-3 text-xs text-text-secondary">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">Risk {(localAiReview ?? aiReview)?.riskLabel}</Badge>
            <Badge variant="secondary">
              {(localAiReview ?? aiReview)?.confidence === null
                ? 'n/a'
                : `${Math.round(((localAiReview ?? aiReview)?.confidence ?? 0) * 100)}% confidence`}
            </Badge>
            <Badge variant="outline">Recommended: {(localAiReview ?? aiReview)?.suggestedAction}</Badge>
          </div>
          <p className="mt-2 text-sm text-text-primary">{(localAiReview ?? aiReview)?.rationale}</p>
          {(localAiReview ?? aiReview)?.suggestedReason ? (
            <p className="mt-2 text-xs text-text-secondary">Suggested reason: {(localAiReview ?? aiReview)?.suggestedReason}</p>
          ) : null}
          <div className="mt-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={Boolean(loadingAction)}
              onClick={() => {
                void submit((localAiReview ?? aiReview)?.suggestedAction ?? 'dismiss');
              }}
            >
              {loadingAction === (localAiReview ?? aiReview)?.suggestedAction
                ? 'Applying recommendation...'
                : `Apply recommended ${(localAiReview ?? aiReview)?.suggestedAction}`}
            </Button>
          </div>
          <input
            type="text"
            className="mt-3 w-full rounded-xl border border-border-subtle bg-bg-surface px-3 py-2 text-xs text-text-primary"
            placeholder="Override reason (optional if you choose a different action)"
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={Boolean(loadingAction)} onClick={() => void submit('dismiss')}>
          {loadingAction === 'dismiss' ? 'Dismissing...' : 'Dismiss'}
        </Button>
        <Button type="button" variant="secondary" disabled={Boolean(loadingAction)} onClick={() => void submit('hide')}>
          {loadingAction === 'hide' ? 'Hiding...' : 'Hide'}
        </Button>
        <Button type="button" disabled={Boolean(loadingAction)} onClick={() => void submit('remove')}>
          {loadingAction === 'remove' ? 'Removing...' : 'Remove'}
        </Button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
