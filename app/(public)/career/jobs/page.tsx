'use client';

import { useEffect, useState } from 'react';
import { JobBrowseCard } from '@/components/career-match/JobBrowseCard';
import { JobFilters, type JobFiltersValue } from '@/components/career-match/JobFilters';
import type { CareerJob } from '@/components/career-match/types';
import { Button } from '@/components/ui/button';

const defaultFilters: JobFiltersValue = {
  q: '',
  location: '',
  remote: '',
  skill: '',
  sort: 'recent',
};

export default function CareerJobsPage() {
  const [filters, setFilters] = useState<JobFiltersValue>(defaultFilters);
  const [jobs, setJobs] = useState<CareerJob[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setJobs(undefined);
    setError(null);

    const params = new URLSearchParams();
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.location.trim()) params.set('location', filters.location.trim());
    if (filters.remote) params.set('remote', filters.remote);
    if (filters.skill.trim()) params.set('skill', filters.skill.trim());
    params.set('sort', filters.sort);

    fetch(`/api/v1/jobs?${params.toString()}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: CareerJob[];
          error?: { message?: string };
        };

        if (!response.ok) {
          throw new Error(payload.error?.message ?? 'Could not load startup jobs.');
        }

        setJobs(payload.data ?? []);
      })
      .catch((fetchError) => {
        setJobs([]);
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load startup jobs.');
      });
  }, [filters, refreshKey]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Career jobs</h1>
        <p className="max-w-3xl text-sm text-text-secondary">
          Browse live startup roles in Credvia&apos;s canonical career jobs view. This page stays public even when the main career hub requires sign-in.
        </p>
      </header>

      <div className="sticky top-[64px] z-20 -mx-4 border-b border-border-subtle bg-[rgba(246,247,251,0.96)] px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
        <JobFilters value={filters} onChange={setFilters} />
      </div>

      {error ? (
        <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button variant="secondary" onClick={() => setRefreshKey((current) => current + 1)}>
            Retry
          </Button>
        </div>
      ) : null}

      <section className="space-y-4">
        {jobs === undefined ? (
          <>
            <div className="h-40 animate-pulse rounded-3xl bg-bg-surface" />
            <div className="h-40 animate-pulse rounded-3xl bg-bg-surface" />
          </>
        ) : null}
        {jobs?.length === 0 ? (
          <div className="surface-panel p-5 text-sm text-text-secondary">
            No startup jobs match these filters yet.
          </div>
        ) : null}
        {jobs?.map((job) => <JobBrowseCard key={job.id} job={job} detailHrefBase="/career/jobs" />)}
      </section>
    </div>
  );
}
