'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { JobMatchCard } from '@/components/career-match/JobMatchCard';
import type { CareerMatch, CareerResumeSummary } from '@/components/career-match/types';
import { humanizeParseStatus, parseStatusVariant } from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function CareerMatchPage() {
  const [resume, setResume] = useState<CareerResumeSummary | null | undefined>(undefined);
  const [matches, setMatches] = useState<CareerMatch[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setError(null);
    setAuthExpired(false);
    setResume(undefined);
    setMatches(undefined);

    fetch('/api/v1/matches')
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: { resume: CareerResumeSummary | null; matches: CareerMatch[] };
          error?: { message?: string };
        };

        if (response.status === 401) {
          setAuthExpired(true);
          setResume(null);
          setMatches([]);
          return;
        }

        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? 'Could not load your job matches.');
        }

        setResume(payload.data.resume);
        setMatches(payload.data.matches);
      })
      .catch((fetchError) => {
        setResume(null);
        setMatches([]);
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load your job matches.');
      });
  }, [refreshKey]);

  async function handleRefreshMatches() {
    setRefreshing(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/matches/recompute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as { error?: { message?: string } };

      if (response.status === 401) {
        setAuthExpired(true);
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Could not recompute matches right now.');
      }

      setRefreshKey((current) => current + 1);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not recompute matches right now.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Career Match</h1>
          <p className="max-w-3xl text-sm text-text-secondary">
            Ranked startup roles based on your active resume, normalized skills, and deterministic fit scoring.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href="/resume">Manage resume</Link>
          </Button>
          <Button onClick={() => void handleRefreshMatches()} disabled={refreshing || !resume}>
            {refreshing ? 'Refreshing...' : 'Refresh matches'}
          </Button>
        </div>
      </header>

      {authExpired ? (
        <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <span>Your session expired. Sign in again to see private match data.</span>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : null}

      {resume && !authExpired ? (
        <div className="surface-panel flex flex-wrap items-center gap-3 p-5 text-sm text-text-secondary">
          <span>Active resume: <span className="text-text-primary">{resume.file_name}</span></span>
          <Badge variant={parseStatusVariant(resume.parse_status)}>{humanizeParseStatus(resume.parse_status)}</Badge>
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

      {matches === undefined ? (
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-3xl bg-bg-surface" />
          <div className="h-40 animate-pulse rounded-3xl bg-bg-surface" />
        </div>
      ) : null}

      {resume === null && matches?.length === 0 && !authExpired ? (
        <div className="surface-panel space-y-3 p-5 text-sm text-text-secondary">
          <p>Upload a resume first to generate career matches.</p>
          <Button asChild variant="secondary">
            <Link href="/resume">Go to resume upload</Link>
          </Button>
        </div>
      ) : null}

      {resume && matches?.length === 0 && !authExpired ? (
        <div className="surface-panel space-y-3 p-5 text-sm text-text-secondary">
          <p>
            {resume.parse_status === 'parsed'
              ? 'No ranked matches have been generated yet.'
              : resume.parse_status === 'failed'
                ? 'Resume analysis failed, so Credvia is not showing weak or misleading match output yet.'
              : 'Your resume needs analysis before matches can be generated.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href="/resume">Open resume</Link>
            </Button>
            {resume.parse_status === 'parsed' ? (
              <Button onClick={() => void handleRefreshMatches()} disabled={refreshing}>
                {refreshing ? 'Refreshing...' : 'Try recompute again'}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="space-y-4">
        {matches?.map((match, index) => (
          <JobMatchCard
            key={match.id}
            match={match}
            onSavedChange={(saved) => {
              setMatches((current) =>
                current?.map((entry, entryIndex) => (
                  entryIndex === index ? { ...entry, saved } : entry
                )) ?? current,
              );
            }}
          />
        ))}
      </section>
    </div>
  );
}
