'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { JobMatchCard } from '@/components/career-match/JobMatchCard';
import type { CareerMatch, CareerResumeSummary } from '@/components/career-match/types';
import { humanizeParseStatus, parseStatusVariant } from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function CareerSavedPage() {
  const [resume, setResume] = useState<CareerResumeSummary | null | undefined>(undefined);
  const [matches, setMatches] = useState<CareerMatch[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
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
          throw new Error(payload.error?.message ?? 'Could not load your saved roles.');
        }

        setResume(payload.data.resume);
        setMatches(payload.data.matches);
      })
      .catch((fetchError) => {
        setResume(null);
        setMatches([]);
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load your saved roles.');
      });
  }, [refreshKey]);

  const savedMatches = useMemo(
    () => matches?.filter((match) => match.saved) ?? [],
    [matches],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Saved Jobs / Applications</h1>
        <p className="max-w-3xl text-sm text-text-secondary">
          Keep a lightweight shortlist of the roles you want to revisit, apply to, or compare later.
        </p>
      </header>

      {authExpired ? (
        <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <span>Your session expired. Sign in again to see your saved roles.</span>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : null}

      {resume ? (
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

      {savedMatches.length === 0 && !authExpired ? (
        <div className="surface-panel space-y-3 p-5 text-sm text-text-secondary">
          <p>No saved roles yet.</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href="/career/jobs">Browse jobs</Link>
            </Button>
            <Button asChild>
              <Link href="/career-match">Review matches</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <section className="space-y-4">
        {savedMatches.map((match, index) => (
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
