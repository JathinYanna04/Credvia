'use client';

import Link from 'next/link';
import { Loader2, RefreshCcw, ShieldCheck, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ParsedResumeInsights } from '@/components/career-match/ParsedResumeInsights';
import { ResumeAnalysisStatus } from '@/components/career-match/ResumeAnalysisStatus';
import { ResumeUploadCard } from '@/components/career-match/ResumeUploadCard';
import { ResumeExtractorPanel } from '@/components/resume/ResumeExtractorPanel';
import {
  canAnalyzeFromStatus,
  formatDateTime,
  humanizeParseStatus,
  parseStatusVariant,
} from '@/components/career-match/utils';
import type { CareerResumeDetail, CareerResumeSummary } from '@/components/career-match/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { normalizeResumeLifecycleStatus } from '@/lib/resume/lifecycle';
import type {
  AnalyzeResumeRequest,
  AnalyzeResumeResponse,
  ApiResponse,
} from '@/lib/types';

type ResumeAnalyzeErrorState = {
  code: string;
  message: string;
  details?: unknown;
  suggestedAction?: string;
};

export default function ResumePage() {
  const [resumes, setResumes] = useState<CareerResumeSummary[] | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CareerResumeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const forceOCR = false;
  const [actionInFlight, setActionInFlight] = useState<
    | {
        resumeId: string;
        action: 'analyze' | 'retry' | 'force-ocr' | 'delete' | 'set-active';
      }
    | null
  >(null);
  const [analyzeError, setAnalyzeError] = useState<ResumeAnalyzeErrorState | null>(null);

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
        const activeResume =
          nextResumes.find((resume) => resume.is_active) ?? nextResumes[0] ?? null;
        setSelectedResumeId((current) => current ?? activeResume?.id ?? null);
      })
      .catch((fetchError) => {
        setResumes([]);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Could not load your resumes.',
        );
      });
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedResumeId) {
      setDetail(null);
      return;
    }

    setDetail(null);
    setDetailError(null);
    setAnalyzeError(null);

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
        setDetailError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Could not load this resume.',
        );
      });
  }, [selectedResumeId, refreshKey]);

  const selectedResume = useMemo(
    () => resumes?.find((resume) => resume.id === selectedResumeId) ?? null,
    [resumes, selectedResumeId],
  );

  const analysisReadiness =
    detail?.analysisReadiness ??
    ({
      ready: true,
      code: null,
      message: null,
    } as const);

  const selectedStatus = normalizeResumeLifecycleStatus(selectedResume?.parse_status ?? null);
  const canAnalyzeSelected = selectedResume
    ? canAnalyzeFromStatus(selectedResume.parse_status)
    : false;

  function isActionRunning(
    action: 'analyze' | 'retry' | 'force-ocr' | 'delete' | 'set-active',
    resumeId: string | null,
  ) {
    if (!resumeId || !actionInFlight) {
      return false;
    }

    return actionInFlight.resumeId === resumeId && actionInFlight.action === action;
  }

  async function withResumeAction(
    action: 'analyze' | 'retry' | 'force-ocr' | 'delete' | 'set-active',
    resumeId: string,
    execute: () => Promise<void>,
  ) {
    setActionInFlight({ action, resumeId });
    try {
      await execute();
    } finally {
      setActionInFlight((current) =>
        current?.resumeId === resumeId && current.action === action ? null : current,
      );
    }
  }

  async function handleAnalyze() {
    if (!selectedResumeId || !selectedResume) return;

    if (!canAnalyzeSelected) {
      setDetailError(analysisReadiness.message ?? 'Resume is not ready for analysis.');
      return;
    }

    await withResumeAction('analyze', selectedResumeId, async () => {
      setAnalyzing(true);
      setDetailError(null);
      setAnalyzeError(null);

      try {
        const analyzeRequest: AnalyzeResumeRequest = {
          rerun: selectedStatus === 'ANALYZED',
        };

        const response = await fetch(`/api/v1/resumes/${selectedResumeId}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analyzeRequest),
        });
        const payload = (await response.json()) as ApiResponse<AnalyzeResumeResponse>;

        if (response.status === 401) {
          setAuthExpired(true);
          return;
        }

        if (!response.ok) {
          setAnalyzeError({
            code: payload.error?.code ?? 'ANALYSIS_FAILED',
            message: payload.error?.message ?? 'Could not analyze this resume.',
            details: payload.error?.details,
            suggestedAction: payload.error?.suggestedAction,
          });
          return;
        }

        setRefreshKey((current) => current + 1);
      } catch (analyzeFailure) {
        setAnalyzeError({
          code: 'ANALYSIS_FAILED',
          message:
            analyzeFailure instanceof Error
              ? analyzeFailure.message
              : 'Could not analyze this resume.',
        });
      } finally {
        setAnalyzing(false);
      }
    });
  }

  async function handleRetryExtraction(useForceOCR: boolean) {
    if (!selectedResumeId) return;

    await withResumeAction(
      useForceOCR ? 'force-ocr' : 'retry',
      selectedResumeId,
      async () => {
        setDetailError(null);
        setAnalyzeError(null);

        try {
          const response = await fetch(`/api/v1/resumes/${selectedResumeId}/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              retry: true,
              forceOCR: useForceOCR || forceOCR,
            }),
          });

          const payload = (await response.json()) as ApiResponse<{ extracted: boolean }>;

          if (response.status === 401) {
            setAuthExpired(true);
            return;
          }

          if (!response.ok) {
            setAnalyzeError({
              code: payload.error?.code ?? 'EXTRACTION_FAILED',
              message: payload.error?.message ?? 'Could not retry extraction.',
              details: payload.error?.details,
              suggestedAction: payload.error?.suggestedAction,
            });
            return;
          }

          setRefreshKey((current) => current + 1);
        } catch (retryFailure) {
          setAnalyzeError({
            code: 'EXTRACTION_FAILED',
            message:
              retryFailure instanceof Error
                ? retryFailure.message
                : 'Could not retry extraction.',
          });
        }
      },
    );
  }

  async function handleSetActive(resumeId: string) {
    await withResumeAction('set-active', resumeId, async () => {
      try {
        const response = await fetch(`/api/v1/resumes/${resumeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: true }),
        });

        const payload = (await response.json()) as ApiResponse<{ updated: boolean }>;

        if (response.status === 401) {
          setAuthExpired(true);
          return;
        }

        if (!response.ok) {
          setDetailError(payload.error?.message ?? 'Could not set this resume as active.');
          return;
        }

        setRefreshKey((current) => current + 1);
      } catch (setActiveError) {
        setDetailError(
          setActiveError instanceof Error
            ? setActiveError.message
            : 'Could not set this resume as active.',
        );
      }
    });
  }

  async function handleDeleteResume(resumeId: string) {
    const confirmed = window.confirm(
      'Delete this resume and all derived profile data? This cannot be undone.',
    );

    if (!confirmed) {
      return;
    }

    await withResumeAction('delete', resumeId, async () => {
      try {
        const response = await fetch(`/api/v1/resumes/${resumeId}`, {
          method: 'DELETE',
        });

        const payload = (await response.json()) as ApiResponse<{ deleted: boolean }>;

        if (response.status === 401) {
          setAuthExpired(true);
          return;
        }

        if (!response.ok) {
          setDetailError(payload.error?.message ?? 'Could not delete this resume.');
          return;
        }

        if (selectedResumeId === resumeId) {
          setSelectedResumeId(null);
        }

        setRefreshKey((current) => current + 1);
      } catch (deleteError) {
        setDetailError(
          deleteError instanceof Error
            ? deleteError.message
            : 'Could not delete this resume.',
        );
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl bg-bg-surface/70 px-6 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">Resume Intelligence</h1>
            {selectedResume ? (
              <Badge variant={parseStatusVariant(selectedResume.parse_status)}>
                {humanizeParseStatus(selectedResume.parse_status)}
              </Badge>
            ) : null}
          </div>
          <p className="max-w-2xl text-sm text-text-secondary">
            A clean ATS-ready view of your candidate profile, structured experience, and parsing confidence.
          </p>
          {selectedResume ? (
            <div className="text-xs text-text-tertiary">
              Last updated {formatDateTime(selectedResume.updated_at ?? selectedResume.uploaded_at)}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleAnalyze()}
            disabled={!canAnalyzeSelected || !selectedResumeId || isActionRunning('analyze', selectedResumeId)}
          >
            {isActionRunning('analyze', selectedResumeId) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Analyze
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleRetryExtraction(false)}
            disabled={!selectedResumeId || isActionRunning('retry', selectedResumeId)}
          >
            {isActionRunning('retry', selectedResumeId) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Retry extraction
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleRetryExtraction(true)}
            disabled={!selectedResumeId || isActionRunning('force-ocr', selectedResumeId)}
          >
            {isActionRunning('force-ocr', selectedResumeId) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Force OCR
          </Button>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl bg-bg-surface/70 px-6 py-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Active resume</div>
                <div className="mt-2 text-lg font-semibold text-text-primary">
                  {selectedResume ? selectedResume.file_name : 'No resume uploaded yet'}
                </div>
                <div className="mt-1 text-xs text-text-tertiary">
                  {selectedResume ? `${selectedResume.mime_type} - Uploaded ${formatDateTime(selectedResume.uploaded_at)}` : 'Upload a resume to start parsing.'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!selectedResume?.is_active && selectedResumeId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSetActive(selectedResumeId)}
                    disabled={isActionRunning('set-active', selectedResumeId)}
                  >
                    {isActionRunning('set-active', selectedResumeId) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    Set active
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => selectedResumeId && void handleDeleteResume(selectedResumeId)}
                  disabled={!selectedResumeId || isActionRunning('delete', selectedResumeId)}
                >
                  {selectedResumeId && isActionRunning('delete', selectedResumeId) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete
                </Button>
              </div>
            </div>

            <div className="mt-5">
              <ResumeUploadCard
                title={selectedResume ? 'Replace resume' : 'Upload your resume'}
                description="Upload one private resume file. Credvia keeps the original file private and parses it into a structured ATS profile."
                actionLabel={selectedResume ? 'Replace resume' : 'Upload resume'}
                compact
                onUploaded={async () => setRefreshKey((current) => current + 1)}
              />
            </div>
          </section>

          {selectedResume || detail ? (
            <ResumeAnalysisStatus
              resume={selectedResume ?? detail!.resume}
              latestRun={detail?.analysisRuns?.[0] ?? null}
              extractionMeta={detail?.profile?.raw_sections?.__meta ?? null}
              analysisReadiness={analysisReadiness}
              analyzing={analyzing}
              analyzeError={analyzeError}
            />
          ) : (
            <div className="rounded-2xl bg-bg-surface/70 px-5 py-4 text-sm text-text-secondary shadow-sm">
              Upload a resume to see its extracted profile and skill summary.
            </div>
          )}

          {detail ? <ParsedResumeInsights detail={detail} /> : null}
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl bg-bg-surface/70 px-5 py-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Uploaded resumes</h2>
                <p className="mt-1 text-sm text-text-secondary">Select the active resume to analyze.</p>
              </div>
            </div>
            {resumes === null ? (
              <div className="mt-4 space-y-3">
                <div className="h-10 animate-pulse rounded-xl bg-bg-surface" />
                <div className="h-10 animate-pulse rounded-xl bg-bg-surface" />
              </div>
            ) : resumes.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-secondary">
                No resumes uploaded yet.
              </div>
            ) : (
              <div className="mt-4 divide-y divide-border-subtle text-sm">
                {resumes.map((resume) => (
                  <button
                    key={resume.id}
                    type="button"
                    onClick={() => setSelectedResumeId(resume.id)}
                    className={`flex w-full items-center justify-between gap-3 px-2 py-3 text-left transition-colors ${
                      resume.id === selectedResumeId ? 'bg-accent/10 text-text-primary' : 'hover:bg-bg-surface'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{resume.file_name}</div>
                      <div className="mt-1 text-xs text-text-tertiary">
                        Uploaded {formatDateTime(resume.uploaded_at)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-text-tertiary">
                      {resume.is_active ? <Badge variant="accent">Active</Badge> : null}
                      <Badge variant={parseStatusVariant(resume.parse_status)}>
                        {humanizeParseStatus(resume.parse_status)}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-bg-surface/70 px-5 py-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Match insights</div>
            {detail && detail.topMatches.length > 0 ? (
              <div className="mt-4 space-y-3">
                {detail.topMatches.slice(0, 3).map((match) => (
                  <Link
                    key={match.id}
                    href={`/career-match/${match.id}`}
                    className="block rounded-xl bg-bg-surface px-4 py-3 hover:bg-bg-overlay"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-text-primary">
                        {match.job?.title ?? 'Startup role'}
                      </div>
                      <div className="text-xs text-text-tertiary">{Math.round(match.overall_score)}%</div>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-bg-overlay">
                      <div
                        className="h-1.5 rounded-full bg-accent"
                        style={{ width: `${Math.min(100, Math.round(match.overall_score))}%` }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-text-tertiary">
                      {match.job?.company?.company_name ?? 'Unknown company'}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-text-secondary">
                Match insights will appear once analysis completes.
              </p>
            )}
          </section>
        </aside>
      </section>

      {process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_RESUME_DEBUG === 'true' ? (
        <ResumeExtractorPanel />
      ) : null}

      {authExpired ? (
        <div className="rounded-2xl bg-bg-surface/70 px-5 py-4 text-sm text-text-secondary shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Your session expired. Sign in again to manage your resume.</span>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl bg-bg-surface/70 px-5 py-4 text-sm text-text-secondary shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button variant="secondary" onClick={() => setRefreshKey((current) => current + 1)}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      {detailError ? (
        <div className="rounded-2xl bg-bg-surface/70 px-5 py-4 text-sm text-text-secondary shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{detailError}</span>
            <Button variant="secondary" onClick={() => setRefreshKey((current) => current + 1)}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
