'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CareerCopilotPanel } from '@/components/career-match/CareerCopilotPanel';
import { MatchExplanation } from '@/components/career-match/MatchExplanation';
import { SavedMatchButton } from '@/components/career-match/SavedMatchButton';
import { SkillGapPanel } from '@/components/career-match/SkillGapPanel';
import type { CareerMatch } from '@/components/career-match/types';
import { formatDate, formatPercent } from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function CareerMatchDetailPage({
  params,
}: {
  params: { matchId: string };
}) {
  const [match, setMatch] = useState<CareerMatch | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setMatch(undefined);
    setError(null);
    setAuthExpired(false);

    fetch(`/api/v1/matches/${params.matchId}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: CareerMatch;
          error?: { message?: string };
        };

        if (response.status === 401) {
          setAuthExpired(true);
          setMatch(null);
          return;
        }

        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? 'Could not load this career match.');
        }

        setMatch(payload.data);
      })
      .catch((fetchError) => {
        setMatch(null);
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load this career match.');
      });
  }, [params.matchId, refreshKey]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {authExpired ? (
        <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <span>Your session expired. Sign in again to view this match.</span>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button variant="secondary" onClick={() => setRefreshKey((current) => current + 1)}>
            Retry
          </Button>
        </div>
      ) : null}

      {match === undefined ? (
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-3xl bg-bg-surface" />
          <div className="h-32 animate-pulse rounded-3xl bg-bg-surface" />
        </div>
      ) : null}

      {match ? (
        <>
          <header className="surface-panel space-y-5 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="accent">{formatPercent(match.overall_score)} fit</Badge>
                  {match.job?.remote_policy ? <Badge variant="outline">{match.job.remote_policy}</Badge> : null}
                  {match.job?.source_key ? <Badge variant="secondary">{match.job.source_key.toUpperCase()}</Badge> : null}
                </div>
                <div>
                  <h1 className="text-3xl font-semibold">{match.job?.title ?? 'Startup role'}</h1>
                  <p className="mt-2 text-sm text-text-secondary">
                    {match.job?.company?.company_name ?? 'Unknown company'}
                    {match.job?.location ? ` · ${match.job.location}` : ''}
                  </p>
                </div>
                <p className="text-xs text-text-tertiary">
                  Fit computed {formatDate(match.computed_at)}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <SavedMatchButton
                  matchId={match.id}
                  saved={Boolean(match.saved)}
                  onSavedChange={(saved) => setMatch((current) => (current ? { ...current, saved } : current))}
                />
                {match.job?.apply_url ? (
                  <Button asChild>
                    <Link href={match.job.apply_url} target="_blank" rel="noreferrer">
                      Apply on company site
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Skill fit</div>
                <div className="mt-2 text-2xl font-semibold">{formatPercent(match.skill_match_score)}</div>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Title fit</div>
                <div className="mt-2 text-2xl font-semibold">{formatPercent(match.title_fit_score)}</div>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Experience fit</div>
                <div className="mt-2 text-2xl font-semibold">{formatPercent(match.experience_score)}</div>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Location fit</div>
                <div className="mt-2 text-2xl font-semibold">{formatPercent(match.location_fit_score)}</div>
              </div>
            </div>
          </header>

          <SkillGapPanel matchedSkills={match.matched_skills} missingSkills={match.missing_skills} />

          <MatchExplanation
            explanation={match.explanation}
            strengths={match.strengths}
            warnings={match.warnings}
          />

          <CareerCopilotPanel matchId={match.id} resumeId={match.resume_id} />

          <section className="surface-panel space-y-4 p-5">
            <div>
              <h2 className="text-xl font-semibold">Role context</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Normalized job content from the active source, shown exactly as the matching engine sees it.
              </p>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">
              {match.job?.description_clean ?? match.job?.description_raw ?? 'No normalized job content is available yet.'}
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
