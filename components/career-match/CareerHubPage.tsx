'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { CareerJob, CareerMatch, CareerResumeSummary } from '@/components/career-match/types';
import { formatDateTime, formatPercent, humanizeParseStatus, parseStatusVariant } from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface HubState {
  resumes: CareerResumeSummary[];
  matches: CareerMatch[];
  jobs: CareerJob[];
}

const emptyState: HubState = {
  resumes: [],
  matches: [],
  jobs: [],
};

export function CareerHubPage() {
  const [data, setData] = useState<HubState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setAuthExpired(false);
    setData(null);

    Promise.all([
      fetch('/api/v1/resumes'),
      fetch('/api/v1/matches'),
      fetch('/api/v1/jobs?sort=recent'),
    ])
      .then(async ([resumeResponse, matchesResponse, jobsResponse]) => {
        if (resumeResponse.status === 401 || matchesResponse.status === 401) {
          if (!cancelled) {
            setAuthExpired(true);
            setData(emptyState);
          }
          return;
        }

        const [resumePayload, matchesPayload, jobsPayload] = await Promise.all([
          resumeResponse.json() as Promise<{ data?: CareerResumeSummary[]; error?: { message?: string } }>,
          matchesResponse.json() as Promise<{
            data?: { resume: CareerResumeSummary | null; matches: CareerMatch[] };
            error?: { message?: string };
          }>,
          jobsResponse.json() as Promise<{ data?: CareerJob[]; error?: { message?: string } }>,
        ]);

        if (!resumeResponse.ok) {
          throw new Error(resumePayload.error?.message ?? 'Could not load your resume summary.');
        }
        if (!matchesResponse.ok) {
          throw new Error(matchesPayload.error?.message ?? 'Could not load your match summary.');
        }
        if (!jobsResponse.ok) {
          throw new Error(jobsPayload.error?.message ?? 'Could not load jobs right now.');
        }

        if (!cancelled) {
          setData({
            resumes: resumePayload.data ?? [],
            matches: matchesPayload.data?.matches ?? [],
            jobs: jobsPayload.data ?? [],
          });
        }
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setData(emptyState);
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load your career hub.');
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const activeResume = useMemo(
    () => data?.resumes.find((resume) => resume.is_active) ?? data?.resumes[0] ?? null,
    [data],
  );
  const topMatch = data?.matches[0] ?? null;
  const savedMatches = data?.matches.filter((match) => match.saved) ?? [];
  const recentJobs = data?.jobs.slice(0, 3) ?? [];

  const nextActions = useMemo(() => {
    const actions: Array<{ label: string; href: string }> = [];

    if (!activeResume) {
      actions.push({ label: 'Upload your first resume', href: '/resume' });
    } else if (activeResume.parse_status !== 'parsed') {
      actions.push({ label: 'Run resume analysis', href: '/resume' });
    }

    if (!topMatch) {
      actions.push({ label: 'Generate your first career matches', href: '/career-match' });
    } else if (topMatch.missing_skills.length > 0) {
      actions.push({ label: `Close skill gaps in ${topMatch.missing_skills[0]}`, href: `/career-match/${topMatch.id}` });
    }

    if (savedMatches.length === 0) {
      actions.push({ label: 'Save roles you want to revisit', href: '/career/jobs' });
    }

    return actions.slice(0, 3);
  }, [activeResume, savedMatches.length, topMatch]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">Career</h1>
          <Badge variant="accent">Grow</Badge>
        </div>
        <p className="max-w-3xl text-sm text-text-secondary">
          Build your resume, discover roles, and track how close you are to the right opportunity.
        </p>
      </header>

      {authExpired ? (
        <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <span>Your session expired. Sign in again to load your private career data.</span>
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

      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Resume status</div>
          <div className="mt-2 text-lg font-semibold text-text-primary">
            {activeResume ? humanizeParseStatus(activeResume.parse_status) : 'Missing'}
          </div>
        </div>
        <div className="rounded-2xl bg-bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Matches</div>
          <div className="mt-2 text-lg font-semibold text-text-primary">{data?.matches.length ?? '...'}</div>
        </div>
        <div className="rounded-2xl bg-bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Saved jobs</div>
          <div className="mt-2 text-lg font-semibold text-text-primary">{savedMatches.length}</div>
        </div>
      </section>

      {data === null ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_360px]">
          <div className="space-y-6">
            <div className="h-64 animate-pulse rounded-3xl bg-bg-surface" />
            <div className="h-60 animate-pulse rounded-3xl bg-bg-surface" />
          </div>
          <div className="space-y-6">
            <div className="h-56 animate-pulse rounded-3xl bg-bg-surface" />
            <div className="h-40 animate-pulse rounded-3xl bg-bg-surface" />
            <div className="h-40 animate-pulse rounded-3xl bg-bg-surface" />
          </div>
        </div>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_360px]">
          <div className="space-y-6">
            <article className="rounded-2xl bg-bg-surface p-5 shadow-sm ring-1 ring-border-subtle">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Resume</div>
                  <h2 className="mt-2 text-2xl font-semibold text-text-primary">
                    {activeResume ? activeResume.file_name : 'No resume uploaded yet'}
                  </h2>
                </div>
                {activeResume ? (
                  <Badge variant={parseStatusVariant(activeResume.parse_status)}>
                    {humanizeParseStatus(activeResume.parse_status)}
                  </Badge>
                ) : (
                  <Badge variant="warning">Missing</Badge>
                )}
              </div>
              <p className="mt-3 text-sm text-text-secondary">
                {activeResume
                  ? `Last updated ${formatDateTime(activeResume.updated_at)}. Keep your resume fresh so your match quality stays trustworthy.`
                  : 'Upload a private PDF or DOCX so Credvia can extract your profile and start ranking roles.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/resume">{activeResume ? 'Open Resume' : 'Upload Resume'}</Link>
                </Button>
                {activeResume ? (
                  <Button asChild variant="secondary">
                    <Link href="/resume">
                      {activeResume.parse_status === 'parsed' ? 'Re-analyze' : 'Improve Resume'}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </article>

            <article className="rounded-2xl bg-bg-surface p-5 shadow-sm ring-1 ring-border-subtle">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Career Match</div>
                  <h2 className="mt-2 text-2xl font-semibold text-text-primary">Personalized for you</h2>
                </div>
                {topMatch ? <Badge variant="accent">{formatPercent(topMatch.overall_score)} fit</Badge> : null}
              </div>
              <p className="mt-3 text-sm text-text-secondary">
                {topMatch
                  ? `${topMatch.job?.title ?? 'A startup role'} at ${topMatch.job?.company?.company_name ?? 'a startup'} is your strongest current fit.`
                  : 'Run matching after your resume is ready to surface your best role fit and the gaps worth closing.'}
              </p>
              {topMatch ? (
                <div className="mt-4 rounded-2xl bg-bg-base p-4">
                  <div className="text-sm font-medium text-text-primary">
                    {topMatch.job?.title ?? 'Startup role'}
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    {topMatch.missing_skills.length > 0
                      ? `Missing: ${topMatch.missing_skills.slice(0, 3).join(', ')}`
                      : 'No major skill gaps flagged right now.'}
                  </div>
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/career-match">View Matches</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/career-match">See Match Quality</Link>
                </Button>
              </div>
            </article>
          </div>

          <div className="space-y-6">
            <article className="rounded-2xl bg-bg-surface p-5 shadow-sm ring-1 ring-border-subtle">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Job Search</div>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Search live startup roles</h2>
              <form action="/career/jobs" className="mt-4 space-y-3">
                <input
                  name="q"
                  placeholder="Search roles, skills, or companies"
                  className="h-12 w-full rounded-2xl border border-border-subtle bg-bg-base px-4 text-sm text-text-primary outline-none transition focus:border-accent"
                />
                <div className="flex flex-wrap gap-2">
                  <Link href="/career/jobs?remote=remote" className="inline-flex h-10 items-center rounded-full bg-bg-base px-3 text-sm font-medium text-text-secondary ring-1 ring-border-subtle">
                    Remote
                  </Link>
                  <Link href="/career/jobs?sort=recent" className="inline-flex h-10 items-center rounded-full bg-bg-base px-3 text-sm font-medium text-text-secondary ring-1 ring-border-subtle">
                    Newest
                  </Link>
                </div>
                <Button type="submit" className="w-full justify-center">
                  Browse Jobs
                </Button>
              </form>
              <div className="mt-4 space-y-2">
                {recentJobs.length > 0 ? (
                  recentJobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/career/jobs/${job.id}`}
                      className="block rounded-2xl bg-bg-base px-4 py-3 text-sm text-text-secondary transition hover:bg-bg-overlay hover:text-text-primary"
                    >
                      <div className="font-medium text-text-primary">{job.title}</div>
                      <div className="mt-1">
                        {job.company?.company_name ?? 'Unknown company'}
                        {job.location ? ` - ${job.location}` : ''}
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-text-secondary">No job previews are available yet.</p>
                )}
              </div>
            </article>

            <article id="saved" className="rounded-2xl bg-bg-surface p-5 shadow-sm ring-1 ring-border-subtle">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Saved Jobs / Applications</div>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">{savedMatches.length} saved roles</h2>
              <p className="mt-3 text-sm text-text-secondary">
                {savedMatches.length > 0
                  ? 'Keep your shortlist here and use it as a lightweight application tracker.'
                  : 'Save strong matches to build your shortlist and revisit them quickly.'}
              </p>
              <Button asChild variant="secondary" className="mt-5">
                <Link href="/career/saved">View Saved</Link>
              </Button>
            </article>

            <article className="rounded-2xl bg-bg-surface p-5 shadow-sm ring-1 ring-border-subtle">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Next Actions</div>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">What to do next</h2>
              <div className="mt-4 space-y-3">
                {nextActions.length > 0 ? (
                  nextActions.map((action) => (
                    <Link
                      key={action.label}
                      href={action.href}
                      className="flex min-h-11 items-center rounded-2xl bg-bg-base px-4 py-3 text-sm font-medium text-text-primary transition hover:bg-bg-overlay"
                    >
                      {action.label}
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-text-secondary">
                    Your core career setup looks healthy. Keep checking new roles and saving the ones worth pursuing.
                  </p>
                )}
              </div>
            </article>
          </div>
        </section>
      )}
    </div>
  );
}
