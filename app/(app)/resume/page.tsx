'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ParsedResumeInsights } from '@/components/career-match/ParsedResumeInsights';
import { ResumeAnalysisStatus } from '@/components/career-match/ResumeAnalysisStatus';
import { ResumeUploadCard } from '@/components/career-match/ResumeUploadCard';
import type { CareerResumeDetail, CareerResumeSummary } from '@/components/career-match/types';
import { formatDateTime, humanizeParseStatus, parseStatusVariant } from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function ResumePage() {
  const [resumes, setResumes] = useState<CareerResumeSummary[] | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CareerResumeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    setError(null);
    setAuthExpired(false);
    setResumes(null);

    fetch('/api/v1/resumes')
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: CareerResumeSummary[];
          error?: { message?: string };
        };

        if (response.status === 401) {
          setAuthExpired(true);
          setResumes([]);
          return;
        }

        if (!response.ok) {
          throw new Error(payload.error?.message ?? 'Could not load your resumes.');
        }

        const nextResumes = payload.data ?? [];
        setResumes(nextResumes);
        const activeResume = nextResumes.find((resume) => resume.is_active) ?? nextResumes[0] ?? null;
        setSelectedResumeId((current) => current ?? activeResume?.id ?? null);
      })
      .catch((fetchError) => {
        setResumes([]);
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load your resumes.');
      });
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedResumeId) {
      setDetail(null);
      return;
    }

    setDetail(null);
    setDetailError(null);

    fetch(`/api/v1/resumes/${selectedResumeId}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: CareerResumeDetail;
          error?: { message?: string };
        };

        if (response.status === 401) {
          setAuthExpired(true);
          return;
        }

        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? 'Could not load this resume.');
        }

        setDetail(payload.data);
      })
      .catch((fetchError) => {
        setDetailError(fetchError instanceof Error ? fetchError.message : 'Could not load this resume.');
      });
  }, [selectedResumeId, refreshKey]);

  const selectedResume = useMemo(
    () => resumes?.find((resume) => resume.id === selectedResumeId) ?? null,
    [resumes, selectedResumeId],
  );

  async function handleAnalyze() {
    if (!selectedResumeId) return;

    setAnalyzing(true);
    setDetailError(null);

    try {
      const response = await fetch(`/api/v1/resumes/${selectedResumeId}/analyze`, {
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
        throw new Error(payload.error?.message ?? 'Could not analyze this resume.');
      }

      setRefreshKey((current) => current + 1);
    } catch (analyzeError) {
      setDetailError(analyzeError instanceof Error ? analyzeError.message : 'Could not analyze this resume.');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Resume</h1>
        <p className="max-w-3xl text-sm text-text-secondary">
          Upload a private resume, analyze it into a structured skill profile, and use it to power your Career Match results.
        </p>
      </header>

      <ResumeUploadCard onUploaded={async () => setRefreshKey((current) => current + 1)} />

      {authExpired ? (
        <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <span>Your session expired. Sign in again to manage your resume.</span>
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

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="surface-panel space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">Uploaded resumes</h2>
            <p className="mt-2 text-sm text-text-secondary">
              V1 uses one active resume at a time, but older uploads are still visible here.
            </p>
          </div>

          {resumes === null ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-2xl bg-bg-surface" />
              <div className="h-20 animate-pulse rounded-2xl bg-bg-surface" />
            </div>
          ) : resumes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-secondary">
              No resumes uploaded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {resumes.map((resume) => (
                <button
                  key={resume.id}
                  type="button"
                  onClick={() => setSelectedResumeId(resume.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    resume.id === selectedResumeId
                      ? 'border-accent bg-accent/5'
                      : 'border-border-subtle bg-bg-surface hover:border-border-default'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-medium text-text-primary">{resume.file_name}</div>
                    {resume.is_active ? <Badge variant="accent">Active</Badge> : null}
                    <Badge variant={parseStatusVariant(resume.parse_status)}>
                      {humanizeParseStatus(resume.parse_status)}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-text-tertiary">
                    Uploaded {formatDateTime(resume.uploaded_at)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="space-y-6">
          {selectedResume ? (
            <ResumeAnalysisStatus
              resume={selectedResume}
              latestRun={detail?.analysisRuns?.[0] ?? null}
              analyzing={analyzing}
              onAnalyze={handleAnalyze}
            />
          ) : (
            <div className="surface-panel p-5 text-sm text-text-secondary">
              Upload a resume to see its extracted profile and skill summary.
            </div>
          )}

          {detailError ? (
            <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
              <span>{detailError}</span>
              <Button variant="secondary" onClick={() => setRefreshKey((current) => current + 1)}>
                Retry
              </Button>
            </div>
          ) : null}

          {detail ? <ParsedResumeInsights detail={detail} /> : null}
        </div>
      </section>
    </div>
  );
}
