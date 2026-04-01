'use client';

import { Loader2, RefreshCcw } from 'lucide-react';
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
import { Button } from '@/components/ui/button';

export interface ResumeAnalysisStatusProps {
  resume: CareerResumeSummary;
  latestRun: CareerAnalysisRun | null;
  analysisReadiness: CareerResumeAnalysisReadiness;
  extractionMeta?: CareerResumeExtractionMeta | null;
  analyzing: boolean;
  forceOCR: boolean;
  onForceOCRChange: (value: boolean) => void;
  onAnalyze: () => Promise<void> | void;
}

export function ResumeAnalysisStatus({
  resume,
  latestRun,
  analysisReadiness,
  extractionMeta,
  analyzing,
  forceOCR,
  onForceOCRChange,
  onAnalyze,
}: ResumeAnalysisStatusProps) {
  const analysisMethod = describeAnalysisMethod(latestRun?.parser_version);
  const usedOcr = Boolean(
    extractionMeta?.usedOcr === true ||
      latestRun?.parser_version?.includes('pdf-ocr') ||
      latestRun?.parser_version?.includes(':ocr'),
  );

  const confidenceTier = extractionMeta?.extractionQuality?.confidenceTier ?? null;
  const analyzeDisabled = analyzing || !analysisReadiness.ready;

  return (
    <section className="surface-panel space-y-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">Analysis status</h2>
            <Badge variant={parseStatusVariant(resume.parse_status)}>
              {humanizeParseStatus(resume.parse_status)}
            </Badge>
          </div>
          <p className="text-sm text-text-secondary">
            Last upload: {formatDateTime(resume.uploaded_at)}
          </p>
          <label className="mt-2 inline-flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border-default"
              checked={forceOCR}
              onChange={(event) => onForceOCRChange(event.target.checked)}
            />
            Force OCR for this run (slower, useful for scanned PDFs)
          </label>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => void onAnalyze()}
          disabled={analyzeDisabled}
        >
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          {resume.parse_status === 'parsed' ? 'Rerun analysis' : 'Analyze resume'}
        </Button>
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

      {confidenceTier !== null && confidenceTier !== 'high' && !latestRun?.error_message ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          We analyzed your resume, but the text quality was limited. For best results, upload a text-based PDF.
        </div>
      ) : null}
    </section>
  );
}
