'use client';

import {
  FileText,
  Loader2,
  PencilLine,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ParsedResumeInsights } from '@/components/career-match/ParsedResumeInsights';
import { ResumeAnalysisStatus } from '@/components/career-match/ResumeAnalysisStatus';
import { ResumeAtsAnalysisPanel } from '@/components/career-match/ResumeAtsAnalysisPanel';
import { ResumeProfileReviewEditor } from '@/components/career-match/ResumeProfileReviewEditor';
import { ResumeUploadCard } from '@/components/career-match/ResumeUploadCard';
import type {
  CareerResumeAtsAnalysis,
  CareerResumeDetail,
  CareerResumeSummary,
  CareerResumeVersionSummary,
} from '@/components/career-match/types';
import {
  canAnalyzeFromStatus,
  formatDateTime,
  humanizeParseStatus,
  parseStatusVariant,
} from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollablePillTabs } from '@/components/ui/ScrollablePillTabs';
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

type ResumeWorkspaceTab =
  | 'overview'
  | 'profile'
  | 'analysis'
  | 'match'
  | 'suggestions'
  | 'versions';

function scoreTone(score: number | null | undefined) {
  if (typeof score !== 'number') return 'secondary' as const;
  if (score >= 80) return 'success' as const;
  if (score >= 60) return 'warning' as const;
  return 'danger' as const;
}

function scoreLabel(score: number | null | undefined) {
  if (typeof score !== 'number') return 'Pending';
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Needs work';
  return 'Weak';
}

function summaryMetric(label: string, value: string | number, helper?: string) {
  return (
    <article key={label} className="surface-panel rounded-2xl p-5">
      <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-text-primary">{value}</div>
      {helper ? <div className="mt-1 text-sm text-text-secondary">{helper}</div> : null}
    </article>
  );
}

export default function ResumePage() {
  const [resumes, setResumes] = useState<CareerResumeSummary[] | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CareerResumeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [reviewEditorOpen, setReviewEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ResumeWorkspaceTab>('overview');
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
  const selectedExtractionMeta = detail?.profile?.raw_sections?.__meta ?? null;
  const discourageForceOcr =
    selectedResume?.mime_type === 'application/pdf' &&
    selectedExtractionMeta?.usedOcr !== true &&
    selectedExtractionMeta?.ocrNeeded === false &&
    selectedExtractionMeta?.extractionQuality?.confidenceTier === 'high';
  const effectiveProfile = detail?.effectiveProfile ?? null;
  const atsAnalysis = detail?.atsAnalysis ?? null;
  const versionSummaries: CareerResumeVersionSummary[] =
    detail?.versions ??
    (resumes ?? []).map((resume) => ({
      id: resume.id,
      file_name: resume.file_name,
      is_active: resume.is_active,
      parse_status: resume.parse_status,
      uploaded_at: resume.uploaded_at,
      updated_at: resume.updated_at,
      score: null,
      confidenceTier: null,
    }));

  const tabItems = [
    { value: 'overview', label: 'Overview' },
    { value: 'profile', label: 'Parsed Profile' },
    { value: 'analysis', label: 'Analysis' },
    { value: 'match', label: 'Job Match', badge: detail?.topMatches.length ?? 0 },
    { value: 'suggestions', label: 'Suggestions', badge: atsAnalysis?.suggestedActions.length ?? 0 },
    { value: 'versions', label: 'Versions', badge: versionSummaries.length },
  ] satisfies Array<{ value: ResumeWorkspaceTab; label: string; badge?: number }>;

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

  function renderOverview(analysis: CareerResumeAtsAnalysis | null) {
    return (
      <div className="space-y-6">
        <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <article className="surface-panel rounded-2xl p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                  Active resume
                </div>
                <div className="mt-2 text-xl font-semibold text-text-primary">
                  {selectedResume ? selectedResume.file_name : 'No resume uploaded yet'}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedResume ? (
                    <Badge variant={parseStatusVariant(selectedResume.parse_status)}>
                      {humanizeParseStatus(selectedResume.parse_status)}
                    </Badge>
                  ) : null}
                  {analysis ? (
                    <Badge variant={scoreTone(analysis.overallScore)}>
                      {analysis.overallScore}/100 ATS
                    </Badge>
                  ) : null}
                  {selectedExtractionMeta?.extractionMethod ? (
                    <Badge variant="secondary">{selectedExtractionMeta.extractionMethod}</Badge>
                  ) : null}
                  {selectedExtractionMeta?.extractionQuality?.confidenceTier ? (
                    <Badge variant="secondary">
                      Confidence {selectedExtractionMeta.extractionQuality.confidenceTier}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-3 text-sm text-text-secondary">
                  {selectedResume
                    ? `${selectedResume.mime_type} • Uploaded ${formatDateTime(selectedResume.uploaded_at)}`
                    : 'Upload one resume to build your ATS profile, analysis summary, and match workspace.'}
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

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleAnalyze()}
                disabled={
                  !canAnalyzeSelected ||
                  !selectedResumeId ||
                  isActionRunning('analyze', selectedResumeId)
                }
              >
                {isActionRunning('analyze', selectedResumeId) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Reanalyze
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab('profile')}
                disabled={!detail}
              >
                <FileText className="h-4 w-4" />
                Review parsed profile
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab('match')}
                disabled={!detail}
              >
                Match to jobs
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
                disabled={
                  !selectedResumeId ||
                  discourageForceOcr ||
                  isActionRunning('force-ocr', selectedResumeId)
                }
              >
                {isActionRunning('force-ocr', selectedResumeId) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Retry with OCR
              </Button>
            </div>

            {discourageForceOcr ? (
              <p className="mt-3 text-xs text-text-tertiary">
                This file already contains readable text. OCR is unlikely to improve results.
              </p>
            ) : null}
          </article>

          <div className="space-y-6">
            <ResumeUploadCard
              title={selectedResume ? 'Upload new version' : 'Upload your resume'}
              description="Upload a private PDF or DOCX. Credvia keeps the original file private and builds a structured ATS profile from it."
              actionLabel={selectedResume ? 'Upload new version' : 'Upload resume'}
              compact
              onUploaded={async () => setRefreshKey((current) => current + 1)}
            />

            <article className="surface-panel rounded-2xl p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                Quick warnings
              </div>
              <div className="mt-3 space-y-2 text-sm text-text-secondary">
                {analysis?.warnings?.length ? (
                  analysis.warnings.slice(0, 4).map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))
                ) : (
                  <div>No urgent ATS warnings detected yet.</div>
                )}
              </div>
            </article>
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
            Upload a resume to start the review workspace.
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryMetric(
            'ATS score',
            analysis?.overallScore ?? 'Pending',
            analysis ? scoreLabel(analysis.overallScore) : 'Run analysis to score this resume.',
          )}
          {summaryMetric(
            'Top skills',
            [
              ...(effectiveProfile?.skills.languages ?? []),
              ...(effectiveProfile?.skills.frameworks ?? []),
              ...(effectiveProfile?.skills.databases ?? []),
            ].length,
            'Structured technical signals currently detected.',
          )}
          {summaryMetric(
            'Education',
            effectiveProfile?.education.length ?? 0,
            'Structured education entries available.',
          )}
          {summaryMetric(
            'Projects',
            effectiveProfile?.projects.length ?? 0,
            'Portfolio-style projects currently parsed.',
          )}
        </section>
      </div>
    );
  }

  function renderProfileTab() {
    return detail ? (
      <div className="space-y-6">
        <section className="surface-panel rounded-2xl p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Parsed profile review</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Review the effective ATS profile. Manual corrections always win over parsed values.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => setReviewEditorOpen(true)}>
              <PencilLine className="h-4 w-4" />
              Edit core fields
            </Button>
          </div>
        </section>
        <ParsedResumeInsights detail={detail} />
      </div>
    ) : (
      <div className="surface-panel rounded-2xl p-6 text-sm text-text-secondary">
        Upload and extract a resume to review the parsed ATS profile.
      </div>
    );
  }

  function renderAnalysisTab() {
    return (
      <div className="space-y-6">
        {selectedResume || detail ? (
          <ResumeAnalysisStatus
            resume={selectedResume ?? detail!.resume}
            latestRun={detail?.analysisRuns?.[0] ?? null}
            extractionMeta={detail?.profile?.raw_sections?.__meta ?? null}
            analysisReadiness={analysisReadiness}
            analyzing={analyzing}
            analyzeError={analyzeError}
          />
        ) : null}
        <ResumeAtsAnalysisPanel analysis={atsAnalysis} />
      </div>
    );
  }

  function renderMatchTab() {
    return (
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-3">
          <article className="surface-panel rounded-2xl p-5">
            <h2 className="text-base font-semibold">Current internal jobs</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Credvia’s saved job cards matched against your active ATS profile.
            </p>
          </article>
          <article className="surface-panel rounded-2xl p-5">
            <h2 className="text-base font-semibold">Paste a job description</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Phase 1 foundation is ready. Direct JD comparison can layer onto this view next.
            </p>
            <Badge variant="secondary" className="mt-3">
              Coming soon
            </Badge>
          </article>
          <article className="surface-panel rounded-2xl p-5">
            <h2 className="text-base font-semibold">Target role archetype</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Compare this resume against role templates such as frontend engineer or product analyst.
            </p>
            <Badge variant="secondary" className="mt-3">
              Coming soon
            </Badge>
          </article>
        </section>

        <section className="surface-panel rounded-2xl p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Job match overview</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Your current internal job matches and ATS fit signals.
              </p>
            </div>
          </div>

          {detail && detail.topMatches.length > 0 ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {detail.topMatches.map((match) => (
                <article
                  key={match.id}
                  className="rounded-2xl border border-border-subtle bg-bg-surface p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-text-primary">
                        {match.job?.title ?? 'Startup role'}
                      </div>
                      <div className="mt-1 text-sm text-text-secondary">
                        {match.job?.company?.company_name ?? 'Unknown company'}
                      </div>
                    </div>
                    <Badge variant={scoreTone(match.overall_score)}>
                      {Math.round(match.overall_score)}% fit
                    </Badge>
                  </div>
                  <div className="mt-4 h-2 w-full rounded-full bg-bg-overlay">
                    <div
                      className="h-2 rounded-full bg-accent"
                      style={{ width: `${Math.min(100, Math.round(match.overall_score))}%` }}
                    />
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">
                        Strengths
                      </div>
                      <ul className="mt-2 space-y-1 text-sm text-text-secondary">
                        {(match.strengths ?? []).slice(0, 3).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                        {(match.strengths ?? []).length === 0 ? (
                          <li>No strengths captured yet.</li>
                        ) : null}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">Missing skills</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-text-secondary">
                        {(match.missing_skills ?? []).slice(0, 6).map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-border-subtle px-2.5 py-1"
                          >
                            {item}
                          </span>
                        ))}
                        {(match.missing_skills ?? []).length === 0 ? (
                          <span>No major skill gaps detected.</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {Array.isArray(match.explanation?.matchedEvidence) &&
                  match.explanation.matchedEvidence.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-xs uppercase tracking-[0.14em] text-text-tertiary">
                        Supporting evidence
                      </div>
                      <div className="mt-2 space-y-2 text-sm text-text-secondary">
                        {match.explanation.matchedEvidence.slice(0, 3).map((item, index) => (
                          <div key={`${match.id}-evidence-${index}`} className="rounded-xl border border-border-subtle bg-bg-overlay/40 p-3">
                            {item.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {Array.isArray(match.explanation?.breakdown) && match.explanation.breakdown.length > 0 ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {match.explanation.breakdown.slice(0, 4).map((item) => (
                        <div key={`${match.id}-${item.key}`} className="rounded-xl border border-border-subtle bg-bg-overlay/40 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-text-primary">{item.label}</div>
                            <Badge variant={scoreTone(item.score)}>{item.score}</Badge>
                          </div>
                          <div className="mt-1 text-xs text-text-tertiary">{item.rationale}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-secondary">
              Run analysis to activate job match scoring for this resume.
            </p>
          )}
        </section>
      </div>
    );
  }

  function renderSuggestionsTab() {
    const suggestions = atsAnalysis?.suggestedActions ?? [];
    return (
      <section className="space-y-6">
        <article className="surface-panel rounded-2xl p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Improvement suggestions</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Actionable resume improvements grouped by impact. Auto-apply can land after the review workspace is stable.
              </p>
            </div>
            <Badge variant="secondary">Phase 1</Badge>
          </div>
        </article>

        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { label: 'Must Fix', key: 'must_fix' },
            { label: 'High Impact', key: 'high' },
            { label: 'Nice to Have', key: 'nice_to_have' },
          ].map((bucket) => {
            const items = suggestions.filter((item) => item.impact === bucket.key);
            return (
              <article key={bucket.key} className="surface-panel rounded-2xl p-5">
                <h3 className="text-base font-semibold">{bucket.label}</h3>
                <div className="mt-4 space-y-3">
                  {items.length > 0 ? (
                    items.map((item) => (
                      <div
                        key={`${bucket.key}-${item.title}`}
                        className="rounded-xl border border-border-subtle bg-bg-surface p-4"
                      >
                        <div className="text-sm font-medium text-text-primary">{item.title}</div>
                        <p className="mt-2 text-sm text-text-secondary">{item.reason}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-text-secondary">
                      No items in this bucket right now.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderVersionsTab() {
    return (
      <section className="surface-panel rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Resume versions</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Track active uploads, parsing confidence, and ATS score progression over time.
            </p>
          </div>
          <Badge variant="secondary">{versionSummaries.length} versions</Badge>
        </div>

        <div className="mt-6 space-y-3">
          {versionSummaries.length > 0 ? (
            versionSummaries.map((version) => (
              <article
                key={version.id}
                className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-bg-surface p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-text-primary">{version.file_name}</div>
                    {version.is_active ? <Badge variant="accent">Active</Badge> : null}
                    <Badge variant={parseStatusVariant(version.parse_status)}>
                      {humanizeParseStatus(version.parse_status)}
                    </Badge>
                    {version.score !== null ? (
                      <Badge variant={scoreTone(version.score)}>{version.score}/100 ATS</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm text-text-secondary">
                    Uploaded {formatDateTime(version.uploaded_at)} • Updated {formatDateTime(version.updated_at)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!version.is_active ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleSetActive(version.id)}
                      disabled={isActionRunning('set-active', version.id)}
                    >
                      Set active
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedResumeId(version.id)}
                  >
                    View
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-text-secondary">No resume versions are available yet.</p>
          )}
        </div>
      </section>
    );
  }

  let tabContent: ReactNode;
  switch (activeTab) {
    case 'profile':
      tabContent = renderProfileTab();
      break;
    case 'analysis':
      tabContent = renderAnalysisTab();
      break;
    case 'match':
      tabContent = renderMatchTab();
      break;
    case 'suggestions':
      tabContent = renderSuggestionsTab();
      break;
    case 'versions':
      tabContent = renderVersionsTab();
      break;
    case 'overview':
    default:
      tabContent = renderOverview(atsAnalysis);
      break;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-3xl bg-bg-surface/70 px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold">Resume Intelligence</h1>
              {selectedResume ? (
                <Badge variant={parseStatusVariant(selectedResume.parse_status)}>
                  {humanizeParseStatus(selectedResume.parse_status)}
                </Badge>
              ) : null}
              {atsAnalysis ? (
                <Badge variant={scoreTone(atsAnalysis.overallScore)}>
                  {scoreLabel(atsAnalysis.overallScore)}
                </Badge>
              ) : null}
            </div>
            <p className="max-w-3xl text-sm text-text-secondary">
              A phased ATS-grade workspace for extraction, structured review, analysis, and job fit insights.
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
              disabled={
                !canAnalyzeSelected ||
                !selectedResumeId ||
                isActionRunning('analyze', selectedResumeId)
              }
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
              onClick={() => void handleRetryExtraction(true)}
              disabled={
                !selectedResumeId ||
                discourageForceOcr ||
                isActionRunning('force-ocr', selectedResumeId)
              }
            >
              {isActionRunning('force-ocr', selectedResumeId) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Force OCR
            </Button>
          </div>
        </div>

        <ScrollablePillTabs
          className="mt-6"
          items={tabItems}
          value={activeTab}
          onValueChange={setActiveTab}
        />
      </header>

      {error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {detailError ? (
        <div className="rounded-2xl border border-warning/20 bg-warning/5 px-4 py-3 text-sm text-warning">
          {detailError}
        </div>
      ) : null}
      {authExpired ? (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          Your session expired. Sign in again and retry.
        </div>
      ) : null}

      {resumes && resumes.length > 0 ? (
        <section className="surface-panel rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            {resumes.map((resume) => (
              <button
                key={resume.id}
                type="button"
                onClick={() => setSelectedResumeId(resume.id)}
                className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                  resume.id === selectedResumeId
                    ? 'border-accent bg-accent/10 text-text-primary'
                    : 'border-border-subtle bg-bg-surface text-text-secondary hover:text-text-primary'
                }`}
              >
                {resume.file_name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {tabContent}

      {detail ? (
        <ResumeProfileReviewEditor
          detail={detail}
          open={reviewEditorOpen}
          onOpenChange={setReviewEditorOpen}
          onSaved={async () => setRefreshKey((current) => current + 1)}
        />
      ) : null}
    </div>
  );
}
