'use client';

import Link from 'next/link';
import { Loader2, RefreshCcw, ShieldCheck, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ParsedResumeInsights } from '@/components/career-match/ParsedResumeInsights';
import { ResumeAnalysisStatus } from '@/components/career-match/ResumeAnalysisStatus';
import { ResumeUploadCard } from '@/components/career-match/ResumeUploadCard';
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
  const [forceOCR, setForceOCR] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Resume</h1>
        <p className="max-w-3xl text-sm text-text-secondary">
          Upload a private resume, analyze it into a structured skill profile, and use it to power your Career Match results.
        </p>
      </header>

      <ResumeUploadCard
        onUploaded={async () => setRefreshKey((current) => current + 1)}
        onUploadStateChange={setUploading}
      />

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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="surface-panel p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Uploading</div>
          <div className="mt-2 flex items-center gap-2 text-sm text-text-primary">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {uploading ? 'Uploading now' : 'Idle'}
          </div>
        </article>
        <article className="surface-panel p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Extraction</div>
          <div className="mt-2 text-sm text-text-primary">
            {selectedStatus === 'EXTRACTING'
              ? 'Extracting'
              : selectedStatus === 'EXTRACTED_WITH_WARNINGS'
                ? 'Extracted with warnings'
                : selectedStatus === 'EXTRACTION_FAILED'
                  ? 'Failed'
                  : 'Idle'}
          </div>
        </article>
        <article className="surface-panel p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">OCR fallback</div>
          <div className="mt-2 text-sm text-text-primary">
            {selectedResumeId && isActionRunning('force-ocr', selectedResumeId)
              ? 'Running'
              : detail?.profile?.raw_sections?.__meta?.usedOcr
                ? 'Used in latest extraction'
                : 'Not running'}
          </div>
        </article>
        <article className="surface-panel p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Analysis</div>
          <div className="mt-2 flex items-center gap-2 text-sm text-text-primary">
            {analyzing || selectedStatus === 'ANALYZING' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {selectedStatus === 'ANALYZED'
              ? 'Analysis complete'
              : analyzing || selectedStatus === 'ANALYZING'
                ? 'Analysis in progress'
                : 'Awaiting run'}
          </div>
        </article>
      </section>

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
                <div
                  key={resume.id}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    resume.id === selectedResumeId
                      ? 'border-accent bg-accent/5'
                      : 'border-border-subtle bg-bg-surface hover:border-border-default'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedResumeId(resume.id)}
                    className="w-full text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-medium text-text-primary">
                        {resume.file_name}
                      </div>
                      {resume.is_active ? <Badge variant="accent">Active</Badge> : null}
                      <Badge variant={parseStatusVariant(resume.parse_status)}>
                        {humanizeParseStatus(resume.parse_status)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-text-tertiary">
                      Uploaded {formatDateTime(resume.uploaded_at)}
                    </div>
                  </button>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!resume.is_active ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleSetActive(resume.id)}
                        disabled={isActionRunning('set-active', resume.id)}
                      >
                        {isActionRunning('set-active', resume.id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        )}
                        Set active
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => void handleDeleteResume(resume.id)}
                      disabled={isActionRunning('delete', resume.id)}
                    >
                      {isActionRunning('delete', resume.id) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className="space-y-6">
          {selectedResume ? (
            <>
              <section className="surface-panel flex flex-wrap items-center gap-2 p-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleAnalyze()}
                  disabled={!canAnalyzeSelected || isActionRunning('analyze', selectedResume.id)}
                >
                  {isActionRunning('analyze', selectedResume.id) ? (
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
                  disabled={isActionRunning('retry', selectedResume.id)}
                >
                  {isActionRunning('retry', selectedResume.id) ? (
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
                  disabled={isActionRunning('force-ocr', selectedResume.id)}
                >
                  {isActionRunning('force-ocr', selectedResume.id) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Force OCR
                </Button>
                {!selectedResume.is_active ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSetActive(selectedResume.id)}
                    disabled={isActionRunning('set-active', selectedResume.id)}
                  >
                    {isActionRunning('set-active', selectedResume.id) ? (
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
                  onClick={() => void handleDeleteResume(selectedResume.id)}
                  disabled={isActionRunning('delete', selectedResume.id)}
                >
                  {isActionRunning('delete', selectedResume.id) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete
                </Button>
              </section>

              <ResumeAnalysisStatus
                resume={selectedResume}
                latestRun={detail?.analysisRuns?.[0] ?? null}
                extractionMeta={detail?.profile?.raw_sections?.__meta ?? null}
                analysisReadiness={analysisReadiness}
                analyzing={analyzing}
                forceOCR={forceOCR}
                onForceOCRChange={setForceOCR}
                analyzeError={analyzeError}
                onAnalyze={handleAnalyze}
              />
            </>
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
