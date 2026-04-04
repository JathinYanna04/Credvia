'use client';

import {
  RefreshCcw,
  ShieldCheck,
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
  CareerResumeDetail,
  CareerResumeSummary,
  CareerResumeVersionSummary,
} from '@/components/career-match/types';
import {
  canAnalyzeFromStatus,
  formatDateTime,
  humanizeParseStatus,
} from '@/components/career-match/utils';
import { AtsImprovements } from '@/components/ats/AtsImprovements';
import { JobMatchCard } from '@/components/match/JobMatchCard';
import { PipelineTimeline } from '@/components/resume/PipelineTimeline';
import { ResumeHeader } from '@/components/resume/ResumeHeader';
import { ResumeSummaryCard } from '@/components/resume/ResumeSummaryCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
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

type ResumeWorkspaceTab = 'overview' | 'profile' | 'ats' | 'match' | 'suggestions';

const tabs: Array<{ value: ResumeWorkspaceTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'profile', label: 'Parsed Profile' },
  { value: 'ats', label: 'ATS' },
  { value: 'match', label: 'Match' },
  { value: 'suggestions', label: 'Suggestions' },
];

function scoreLabel(score: number | null | undefined) {
  if (typeof score !== 'number') return 'Pending';
  if (score >= 80) return 'Ready';
  if (score >= 60) return 'Good';
  return 'Needs improvement';
}

function scoreVariant(score: number | null | undefined) {
  if (typeof score !== 'number') return 'secondary' as const;
  if (score >= 80) return 'success' as const;
  if (score >= 60) return 'warning' as const;
  return 'danger' as const;
}

function WorkspaceMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <Card padding="md">
      <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">{label}</div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-text-primary">{value}</div>
      <p className="mt-2 text-sm text-text-secondary">{helper}</p>
    </Card>
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
        setDetailError(fetchError instanceof Error ? fetchError.message : 'Could not load this resume.');
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
  const canAnalyzeSelected = selectedResume ? canAnalyzeFromStatus(selectedResume.parse_status) : false;
  const effectiveProfile = detail?.effectiveProfile ?? null;
  const atsAnalysis = detail?.atsAnalysis ?? null;
  const diagnostics = effectiveProfile?.diagnostics ?? null;
  const extractionMeta = detail?.profile?.raw_sections?.__meta ?? null;
  const discourageForceOcr =
    selectedResume?.mime_type === 'application/pdf' &&
    extractionMeta?.usedOcr !== true &&
    extractionMeta?.ocrNeeded === false &&
    extractionMeta?.extractionQuality?.confidenceTier === 'high';

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

  function isActionRunning(
    action: 'analyze' | 'retry' | 'force-ocr' | 'delete' | 'set-active',
    resumeId: string | null,
  ) {
    if (!resumeId || !actionInFlight) return false;
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
          message: analyzeFailure instanceof Error ? analyzeFailure.message : 'Could not analyze this resume.',
        });
      } finally {
        setAnalyzing(false);
      }
    });
  }

  async function handleRetryExtraction(useForceOCR: boolean) {
    if (!selectedResumeId) return;

    await withResumeAction(useForceOCR ? 'force-ocr' : 'retry', selectedResumeId, async () => {
      setDetailError(null);
      setAnalyzeError(null);

      try {
        const response = await fetch(`/api/v1/resumes/${selectedResumeId}/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retry: true, forceOCR: useForceOCR }),
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
          message: retryFailure instanceof Error ? retryFailure.message : 'Could not retry extraction.',
        });
      }
    });
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
        setDetailError(setActiveError instanceof Error ? setActiveError.message : 'Could not set this resume as active.');
      }
    });
  }

  async function handleDeleteResume(resumeId: string) {
    const confirmed = window.confirm('Delete this resume and all derived profile data? This cannot be undone.');
    if (!confirmed) return;

    await withResumeAction('delete', resumeId, async () => {
      try {
        const response = await fetch(`/api/v1/resumes/${resumeId}`, { method: 'DELETE' });
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
        setDetailError(deleteError instanceof Error ? deleteError.message : 'Could not delete this resume.');
      }
    });
  }

  function renderOverview() {
    return (
      <div className="page-section">
        <ResumeSummaryCard analysis={atsAnalysis} />

        <PipelineTimeline
          diagnostics={diagnostics ?? extractionMeta ?? null}
          uploaded={Boolean(selectedResume)}
          analysisReady={Boolean(detail?.topMatches || atsAnalysis)}
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <WorkspaceMetric
            label="ATS score"
            value={atsAnalysis?.overallScore ?? '--'}
            helper={atsAnalysis ? scoreLabel(atsAnalysis.overallScore) : 'Run analysis to score this resume.'}
          />
          <WorkspaceMetric
            label="Top skills"
            value={
              [
                ...(effectiveProfile?.skills.languages ?? []),
                ...(effectiveProfile?.skills.frameworks ?? []),
                ...(effectiveProfile?.skills.databases ?? []),
              ].length
            }
            helper="Normalized technical signals detected."
          />
          <WorkspaceMetric
            label="Education"
            value={effectiveProfile?.education.length ?? 0}
            helper="Structured education entries ready."
          />
          <WorkspaceMetric
            label="Projects"
            value={effectiveProfile?.projects.length ?? 0}
            helper="Project evidence available for ATS and matching."
          />
        </div>

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

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card padding="lg" className="space-y-5">
            <SectionHeader
              title="Resume versions"
              description="Switch versions confidently without losing the full ATS and match context."
            />
            <div className="space-y-3">
              {versionSummaries.length > 0 ? (
                versionSummaries.map((version) => (
                  <div
                    key={version.id}
                    className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-bg-surface p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-text-primary">{version.file_name}</div>
                        {version.is_active ? <Badge variant="success">Active</Badge> : null}
                        <Badge variant={scoreVariant(version.score)}>{humanizeParseStatus(version.parse_status)}</Badge>
                      </div>
                      <div className="mt-2 text-sm text-text-secondary">
                        Uploaded {formatDateTime(version.uploaded_at)} · Updated {formatDateTime(version.updated_at)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!version.is_active ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void handleSetActive(version.id)}
                          disabled={isActionRunning('set-active', version.id)}
                          loading={isActionRunning('set-active', version.id)}
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Set active
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" onClick={() => setSelectedResumeId(version.id)}>
                        View
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-secondary">
                  No resume versions are available yet.
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-6">
            <ResumeUploadCard
              title={selectedResume ? 'Upload new version' : 'Upload your resume'}
              description="Upload a private PDF or DOCX. Credvia keeps the original file private and builds a structured ATS profile from it."
              actionLabel={selectedResume ? 'Upload new version' : 'Upload resume'}
              compact
              onUploaded={async () => setRefreshKey((current) => current + 1)}
            />

            <Card padding="lg">
              <SectionHeader title="Quick actions" description="Use the actions below when you want to reprocess or clean up this version." />
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleRetryExtraction(false)}
                  disabled={!selectedResumeId || isActionRunning('retry', selectedResumeId)}
                  loading={selectedResumeId ? isActionRunning('retry', selectedResumeId) : false}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Retry extraction
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleRetryExtraction(true)}
                  disabled={!selectedResumeId || discourageForceOcr || isActionRunning('force-ocr', selectedResumeId)}
                  loading={selectedResumeId ? isActionRunning('force-ocr', selectedResumeId) : false}
                >
                  <Wand2 className="h-4 w-4" />
                  Retry with OCR
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => selectedResumeId && void handleDeleteResume(selectedResumeId)}
                  disabled={!selectedResumeId || isActionRunning('delete', selectedResumeId)}
                  loading={selectedResumeId ? isActionRunning('delete', selectedResumeId) : false}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete version
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  function renderProfileTab() {
    if (!detail) {
      return <Card padding="lg">Upload and extract a resume to review the parsed ATS profile.</Card>;
    }

    return (
      <div className="page-section">
        <Card padding="lg">
          <SectionHeader
            title="Parsed profile review"
            description="This view always uses the effective profile: canonical extraction plus any manual corrections."
            action={
              <Button type="button" variant="secondary" onClick={() => setReviewEditorOpen(true)}>
                Improve Resume
              </Button>
            }
          />
        </Card>
        <ParsedResumeInsights detail={detail} />
      </div>
    );
  }

  function renderAtsTab() {
    return (
      <div className="page-section">
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
        <ResumeAtsAnalysisPanel analysis={atsAnalysis} onFix={() => setReviewEditorOpen(true)} />
      </div>
    );
  }

  function renderMatchTab() {
    return (
      <div className="page-section">
        <Card padding="lg">
          <SectionHeader
            title="Job match overview"
            description="These matches are grounded in your current effective profile, not stale fallback data."
          />
        </Card>
        {detail && detail.topMatches.length > 0 ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {detail.topMatches.map((match) => (
              <JobMatchCard key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <Card padding="lg">
            <p className="text-sm text-text-secondary">Run analysis to activate job match scoring for this resume.</p>
          </Card>
        )}
      </div>
    );
  }

  function renderSuggestionsTab() {
    if (!atsAnalysis) {
      return (
        <Card padding="lg">
          <p className="text-sm text-text-secondary">Run analysis to unlock targeted improvement suggestions.</p>
        </Card>
      );
    }

    return (
      <div className="page-section">
        <AtsImprovements analysis={atsAnalysis} onFix={() => setReviewEditorOpen(true)} />
      </div>
    );
  }

  let tabContent: ReactNode;
  switch (activeTab) {
    case 'profile':
      tabContent = renderProfileTab();
      break;
    case 'ats':
      tabContent = renderAtsTab();
      break;
    case 'match':
      tabContent = renderMatchTab();
      break;
    case 'suggestions':
      tabContent = renderSuggestionsTab();
      break;
    case 'overview':
    default:
      tabContent = renderOverview();
      break;
  }

  const pageTitle = selectedResume?.file_name ?? 'Resume Intelligence';
  const pageSubtitle = selectedResume
    ? `Last updated ${formatDateTime(selectedResume.updated_at ?? selectedResume.uploaded_at)} · ${selectedResume.mime_type}`
    : 'Upload a resume to build one truthful profile for parsing, ATS scoring, and job matching.';

  return (
    <div className="page-section">
      <ResumeHeader
        resumeName={pageTitle}
        subtitle={pageSubtitle}
        statusLabel={scoreLabel(atsAnalysis?.overallScore)}
        statusVariant={scoreVariant(atsAnalysis?.overallScore)}
        onImprove={() => setReviewEditorOpen(true)}
        onReanalyze={() => void handleAnalyze()}
        improveDisabled={!detail}
        reanalyzeDisabled={!canAnalyzeSelected || !selectedResumeId || isActionRunning('analyze', selectedResumeId)}
        reanalyzeLoading={selectedResumeId ? isActionRunning('analyze', selectedResumeId) : false}
      />

      {error ? <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {detailError ? <div className="rounded-2xl border border-warning/20 bg-warning/5 px-4 py-3 text-sm text-warning">{detailError}</div> : null}
      {authExpired ? <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">Your session expired. Sign in again and retry.</div> : null}

      {resumes && resumes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {resumes.map((resume) => (
            <button
              key={resume.id}
              type="button"
              onClick={() => setSelectedResumeId(resume.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                resume.id === selectedResumeId
                  ? 'bg-accent/10 text-accent shadow-sm'
                  : 'bg-bg-surface text-text-secondary hover:bg-bg-overlay hover:text-text-primary'
              }`}
            >
              {resume.file_name}
            </button>
          ))}
        </div>
      ) : null}

      <Card padding="sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                tab.value === activeTab
                  ? 'bg-accent text-white shadow-[0_12px_24px_rgba(99,102,241,0.2)]'
                  : 'text-text-secondary hover:bg-bg-overlay hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {tabContent}

      {!selectedResume && !detail ? (
        <Card padding="lg">
          <SectionHeader
            title="Start with your first resume"
            description="Upload a PDF or DOCX to unlock the review workspace, ATS scoring, and evidence-based job matching."
          />
          <div className="mt-5">
            <ResumeUploadCard
              title="Upload your resume"
              description="Credvia keeps the original file private and builds a structured ATS profile from it."
              actionLabel="Upload resume"
              compact
              onUploaded={async () => setRefreshKey((current) => current + 1)}
            />
          </div>
        </Card>
      ) : null}

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
