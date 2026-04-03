'use client';

import { FileText, Scan, Sparkles, Target, UploadCloud } from 'lucide-react';
import type {
  CareerAnalysisRun,
  CareerResumeAnalysisReadiness,
  CareerResumeExtractionMeta,
  CareerResumeSummary,
} from '@/components/career-match/types';
import {
  describeAnalysisMethod,
  formatDateTime,
  humanizeParseStatus,
  parseStatusVariant,
} from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';
import { normalizeResumeLifecycleStatus } from '@/lib/resume/lifecycle';

export interface ResumeAnalysisStatusProps {
  resume: CareerResumeSummary;
  latestRun: CareerAnalysisRun | null;
  analysisReadiness: CareerResumeAnalysisReadiness;
  extractionMeta?: CareerResumeExtractionMeta | null;
  analyzing: boolean;
  analyzeError?: {
    code: string;
    message: string;
    details?: unknown;
    suggestedAction?: string;
  } | null;
}

export function ResumeAnalysisStatus({
  resume,
  latestRun,
  analysisReadiness,
  extractionMeta,
  analyzing,
  analyzeError,
}: ResumeAnalysisStatusProps) {
  const showDeveloperDetails =
    process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_RESUME_DEBUG === 'true';
  const analysisMethod = describeAnalysisMethod(latestRun?.parser_version);
  const metaOcrAttempted = extractionMeta?.ocrAttempted;
  const metaOcrImproved = extractionMeta?.ocrImprovedQuality;
  const analyzeDetails =
    analyzeError?.details && typeof analyzeError.details === 'object'
      ? (analyzeError.details as Record<string, unknown>)
      : null;
  const confidenceTier = extractionMeta?.extractionQuality?.confidenceTier ?? null;
  const contaminationScore =
    extractionMeta?.extractionQuality?.contaminationScore ??
    (typeof extractionMeta?.contaminationScore === 'number'
      ? extractionMeta.contaminationScore
      : null);
  const salvageScore =
    extractionMeta?.extractionQuality?.salvageScore ??
    (typeof extractionMeta?.salvageScore === 'number' ? extractionMeta.salvageScore : null);
  const extractionWarningCode =
    typeof extractionMeta?.warningCode === 'string' ? extractionMeta.warningCode : null;
  const extractionWarningMessage =
    typeof extractionMeta?.warningMessage === 'string'
      ? extractionMeta.warningMessage
      : null;
  const usedOcr = Boolean(
    extractionMeta?.usedOcr === true ||
      latestRun?.parser_version?.includes('pdf-ocr') ||
      latestRun?.parser_version?.includes(':ocr'),
  );
  const selectedStatus = normalizeResumeLifecycleStatus(resume.parse_status ?? null);
  const ocrAttempted =
    metaOcrAttempted === true || usedOcr || Boolean(analyzeDetails?.ocrAttempted);
  const ocrImprovedQuality =
    typeof metaOcrImproved === 'boolean'
      ? metaOcrImproved
      : typeof analyzeDetails?.ocrImprovedQuality === 'boolean'
        ? analyzeDetails.ocrImprovedQuality
        : null;
  const ocrAvailable =
    typeof extractionMeta?.ocrAvailable === 'boolean'
      ? extractionMeta.ocrAvailable
      : typeof analyzeDetails?.ocrAvailable === 'boolean'
        ? Boolean(analyzeDetails.ocrAvailable)
        : true;
  const ocrUnavailableReason =
    typeof extractionMeta?.ocrUnavailableReason === 'string'
      ? extractionMeta.ocrUnavailableReason
      : typeof analyzeDetails?.ocrUnavailableReason === 'string'
        ? (analyzeDetails.ocrUnavailableReason as string)
        : null;
  const acceptedWithWarnings =
    extractionMeta?.acceptedWithWarnings === true ||
    extractionWarningCode !== null ||
    confidenceTier === 'low';
  const recoveredFromNoise =
    acceptedWithWarnings && typeof contaminationScore === 'number' && contaminationScore >= 70;
  const ocrUnavailableError =
    analyzeError?.code === 'OCR_UNAVAILABLE' || (ocrAttempted && !ocrAvailable);
  const poorPdfExtractionError =
    (analyzeError?.code === 'IMAGE_BASED_PDF' ||
      analyzeError?.code === 'LOW_TEXT_CONFIDENCE' ||
      analyzeError?.code === 'OCR_UNAVAILABLE') &&
    resume.mime_type === 'application/pdf';
  const extractionStage =
    selectedStatus === 'EXTRACTING'
      ? 'processing'
      : selectedStatus === 'EXTRACTED_WITH_WARNINGS'
        ? 'warning'
        : selectedStatus === 'EXTRACTION_FAILED'
          ? 'failed'
          : selectedStatus === 'EXTRACTED' || selectedStatus === 'PARSED' || selectedStatus === 'READY' || selectedStatus === 'ANALYZED'
            ? 'completed'
            : 'waiting';
  const analysisStage =
    analyzing || selectedStatus === 'ANALYZING'
      ? 'processing'
      : selectedStatus === 'ANALYZED'
        ? 'completed'
        : selectedStatus === 'ANALYSIS_FAILED'
          ? 'failed'
          : 'waiting';
  const ocrStage =
    usedOcr
      ? 'completed'
      : ocrAttempted && !ocrAvailable
        ? 'failed'
        : ocrAttempted
          ? 'processing'
          : 'not_needed';
  const stageToneClass = (tone: string) => {
    switch (tone) {
      case 'completed':
        return 'border-success/30 bg-success/10 text-success';
      case 'processing':
        return 'border-info/30 bg-info/10 text-info';
      case 'warning':
        return 'border-warning/30 bg-warning/10 text-warning';
      case 'failed':
        return 'border-danger/30 bg-danger/10 text-danger';
      default:
        return 'border-border-subtle bg-bg-surface text-text-secondary';
    }
  };
  const stageStateLabel = (state: string) => {
    switch (state) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing';
      case 'warning':
        return 'Needs review';
      case 'failed':
        return 'Failed';
      case 'not_needed':
        return 'Not needed';
      default:
        return 'Waiting';
    }
  };
  const uploadStage =
    resume.file_name && resume.file_name.length > 0
      ? selectedStatus === 'UPLOADED' || selectedStatus === 'EXTRACTING'
        ? 'processing'
        : 'completed'
      : 'waiting';
  const matchStage =
    selectedStatus === 'ANALYZED'
      ? 'completed'
      : analysisReadiness.ready
        ? 'waiting'
        : 'warning';

  return (
    <section className="surface-panel space-y-5 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">Parsing pipeline</h2>
            <Badge variant={parseStatusVariant(resume.parse_status)}>
              {humanizeParseStatus(resume.parse_status)}
            </Badge>
          </div>
          <p className="text-sm text-text-secondary">
            Last upload: {formatDateTime(resume.uploaded_at)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className={`rounded-2xl border px-4 py-3 ${stageToneClass(uploadStage)}`}>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em]">
            Upload
            <UploadCloud className="h-4 w-4" />
          </div>
          <div className="mt-2 text-sm">{stageStateLabel(uploadStage)}</div>
          <div className="mt-1 text-xs text-text-tertiary">
            {uploadStage === 'processing' ? 'Upload received' : uploadStage === 'completed' ? 'Resume on file' : 'Waiting for resume'}
          </div>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${stageToneClass(extractionStage)}`}>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em]">
            Extraction
            <FileText className="h-4 w-4" />
          </div>
          <div className="mt-2 text-sm">{stageStateLabel(extractionStage)}</div>
          <div className="mt-1 text-xs text-text-tertiary">
            {extractionStage === 'processing'
              ? 'Parsing the resume file'
              : extractionStage === 'completed'
                ? 'Structured data ready'
                : extractionStage === 'warning'
                  ? 'Parsed with warnings'
                  : extractionStage === 'failed'
                    ? 'Extraction failed'
                    : 'Waiting for upload'}
          </div>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${stageToneClass(ocrStage)}`}>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em]">
            OCR
            <Scan className="h-4 w-4" />
          </div>
          <div className="mt-2 text-sm">{stageStateLabel(ocrStage)}</div>
          <div className="mt-1 text-xs text-text-tertiary">
            {ocrStage === 'completed'
              ? 'OCR used for this file'
              : ocrStage === 'processing'
                ? 'OCR is running'
                : ocrStage === 'failed'
                  ? 'OCR unavailable'
                  : 'OCR skipped'}
          </div>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${stageToneClass(analysisStage)}`}>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em]">
            Analysis
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="mt-2 text-sm">{stageStateLabel(analysisStage)}</div>
          <div className="mt-1 text-xs text-text-tertiary">
            {analysisStage === 'processing'
              ? 'Scoring against matches'
              : analysisStage === 'completed'
                ? 'Match scoring ready'
                : analysisStage === 'failed'
                  ? 'Analysis failed'
                  : 'Ready when extraction completes'}
          </div>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${stageToneClass(matchStage)}`}>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em]">
            Match readiness
            <Target className="h-4 w-4" />
          </div>
          <div className="mt-2 text-sm">{stageStateLabel(matchStage)}</div>
          <div className="mt-1 text-xs text-text-tertiary">
            {matchStage === 'completed'
              ? 'Ready for matching'
              : analysisReadiness.ready
                ? 'Awaiting analysis'
                : 'Action required'}
          </div>
        </div>
      </div>

      {!analysisReadiness.ready && analysisReadiness.message ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {analysisReadiness.message}
          {analysisReadiness.code === 'RESUME_TEXT_MISSING' ? (
            <div className="mt-2 text-xs text-warning/90">
              This file may be image-based, empty, or too low-quality to parse reliably. Upload a clearer PDF or a DOCX resume.
            </div>
          ) : null}
        </div>
      ) : null}

      {analyzeError ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <div>{analyzeError.message}</div>
          <div className="mt-1 text-xs text-danger/90">Code: {analyzeError.code}</div>
          {analyzeError.suggestedAction ? (
            <div className="mt-2 text-xs text-danger/90">
              Suggested action: {analyzeError.suggestedAction}
            </div>
          ) : null}
          {poorPdfExtractionError ? (
            <div className="mt-2 text-xs text-danger/90">
              This file appears low quality for text extraction. A DOCX upload usually parses more reliably.
            </div>
          ) : null}
          {ocrUnavailableError ? (
            <div className="mt-2 text-xs text-danger/90">
              OCR runtime is unavailable in this environment.
              {ocrUnavailableReason ? ` ${ocrUnavailableReason}` : ''}
            </div>
          ) : null}
          {showDeveloperDetails ? (
            <details className="mt-2 rounded-xl border border-danger/30 bg-danger/5 p-2 text-xs text-danger/90">
              <summary className="cursor-pointer">Developer details</summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words">
                {JSON.stringify(analyzeDetails ?? {}, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Current file</div>
          <div className="mt-2 text-sm text-text-primary">{resume.file_name}</div>
          <div className="mt-1 text-xs text-text-tertiary">{resume.mime_type}</div>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Latest run</div>
          <div className="mt-2 text-sm text-text-primary">
            {latestRun ? latestRun.status : 'No analysis run yet'}
          </div>
          <div className="mt-1 text-xs text-text-tertiary">
            {latestRun
              ? formatDateTime(latestRun.created_at)
              : 'Upload and analyze to populate your profile.'}
          </div>
          {analysisMethod ? (
            <div className="mt-2 text-xs text-text-secondary">
              Method: {analysisMethod}
              {usedOcr ? ' with OCR fallback' : ''}
            </div>
          ) : null}
        </div>
      </div>

      {latestRun?.error_message ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {latestRun.error_message}
          {resume.mime_type === 'application/pdf' ? (
            <div className="mt-2 text-xs text-danger/90">
              DOCX usually parses more reliably than PDF if this keeps failing.
            </div>
          ) : null}
        </div>
      ) : null}

      {usedOcr && !latestRun?.error_message ? (
        <div className="rounded-2xl border border-info/30 bg-info/10 px-4 py-3 text-sm text-info">
          OCR fallback was used for this resume because native PDF text extraction was too weak.
        </div>
      ) : null}

      {ocrAttempted ? (
        <div className="rounded-2xl border border-info/30 bg-info/10 px-4 py-3 text-sm text-info">
          OCR was attempted.
          {!ocrAvailable ? ' It was unavailable in this runtime.' : ''}
          {ocrImprovedQuality === true ? ' It improved extraction quality.' : ''}
          {ocrImprovedQuality === false ? ' It did not improve extraction quality enough.' : ''}
        </div>
      ) : null}

      {!usedOcr && resume.mime_type === 'application/pdf' && !latestRun?.error_message ? (
        <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          This looks like a text PDF. OCR was not needed.
        </div>
      ) : null}

      {acceptedWithWarnings && !latestRun?.error_message ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <div>We extracted this resume with warnings.</div>
          <div className="mt-1 text-xs text-warning/90">
            Some formatting or content was noisy, so results may be less accurate.
          </div>
          <div className="mt-1 text-xs text-warning/90">
            You can continue, but a DOCX or cleaner PDF may improve accuracy.
          </div>
          {extractionWarningMessage ? (
            <div className="mt-2 text-xs text-warning/90">{extractionWarningMessage}</div>
          ) : null}
          {recoveredFromNoise ? (
            <div className="mt-2 text-xs text-warning/90">
              Recovered from noisy PDF content. Parsed sections may be incomplete.
              {typeof salvageScore === 'number' ? ` Salvage score: ${salvageScore}.` : ''}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
