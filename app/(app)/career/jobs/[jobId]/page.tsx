'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CareerJob } from '@/components/career-match/types';
import { explainRequirement, formatDate } from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function CareerJobDetailPage({
  params,
}: {
  params: { jobId: string };
}) {
  const [job, setJob] = useState<CareerJob | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setJob(undefined);
    setError(null);

    fetch(`/api/v1/jobs/${params.jobId}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: CareerJob;
          error?: { message?: string };
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? 'Could not load this job.');
        }

        setJob(payload.data);
      })
      .catch((fetchError) => {
        setJob(null);
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load this job.');
      });
  }, [params.jobId, refreshKey]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {error ? (
        <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button variant="secondary" onClick={() => setRefreshKey((current) => current + 1)}>
            Retry
          </Button>
        </div>
      ) : null}

      {job === undefined ? (
        <div className="space-y-4">
          <div className="h-44 animate-pulse rounded-3xl bg-bg-surface" />
          <div className="h-32 animate-pulse rounded-3xl bg-bg-surface" />
        </div>
      ) : null}

      {job ? (
        <>
          <header className="surface-panel space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{job.source_key.toUpperCase()}</Badge>
              {job.remote_policy ? <Badge variant="outline">{job.remote_policy}</Badge> : null}
              {job.seniority ? <Badge variant="outline">{job.seniority}</Badge> : null}
            </div>

            <div>
              <h1 className="text-3xl font-semibold">{job.title}</h1>
              <p className="mt-2 text-sm text-text-secondary">
                {job.company?.company_name ?? 'Unknown company'}
                {job.location ? ` - ${job.location}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={job.apply_url} target="_blank" rel="noreferrer">
                  Apply on company site
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/career/jobs">Back to jobs</Link>
              </Button>
            </div>

            <div className="text-xs text-text-tertiary">
              Posted {formatDate(job.posted_at ?? job.ingested_at)}
            </div>
          </header>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
            <article className="surface-panel p-5">
              <h2 className="text-xl font-semibold">Role details</h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                {job.description_clean ?? job.description_raw ?? 'No normalized job description is available yet.'}
              </p>
            </article>

            <aside className="space-y-5">
              <article className="surface-panel p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Extracted skills</div>
                {job.skills.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.skills.map((skill) => (
                      <Badge key={`${job.id}-${skill.slug}`} variant={skill.required ? 'accent' : 'secondary'}>
                        {skill.name} - {explainRequirement(skill.required)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-text-secondary">No normalized job skills were extracted yet.</p>
                )}
              </article>

              <article className="surface-panel p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Company context</div>
                <div className="mt-3 space-y-2 text-sm text-text-secondary">
                  <p>{job.company?.company_name ?? 'Unknown company'}</p>
                  {job.company?.location ? <p>{job.company.location}</p> : null}
                  {job.company?.website_url ? (
                    <Link href={job.company.website_url} target="_blank" rel="noreferrer" className="text-accent hover:text-text-primary">
                      Visit website
                    </Link>
                  ) : null}
                </div>
              </article>
            </aside>
          </section>
        </>
      ) : null}
    </div>
  );
}
