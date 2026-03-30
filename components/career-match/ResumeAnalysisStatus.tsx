'use client';

import { Loader2, RefreshCcw } from 'lucide-react';
import type { CareerAnalysisRun, CareerResumeSummary } from '@/components/career-match/types';
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
  analyzing: boolean;
  onAnalyze: () => Promise<void> | void;
}

export function ResumeAnalysisStatus({
  resume,
  latestRun,
  analyzing,
  onAnalyze,
}: ResumeAnalysisStatusProps) {
  const analysisMethod = describeAnalysisMethod(latestRun?.parser_version);
  const usedOcr = Boolean(latestRun?.parser_version?.includes('pdf-ocr') || latestRun?.parser_version?.includes(':ocr'));

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
        </div>
        <Button type="button" variant="secondary" onClick={() => void onAnalyze()} disabled={analyzing}>
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          {resume.parse_status === 'parsed' ? 'Rerun analysis' : 'Analyze resume'}
        </Button>
      </div>

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
            {latestRun ? formatDateTime(latestRun.created_at) : 'Upload and analyze to populate your profile.'}
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
          OCR fallback was used for this resume because the original PDF text extraction was too weak.
        </div>
      ) : null}
    </section>
  );
}
