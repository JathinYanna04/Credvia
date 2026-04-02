import type { Database } from '@/lib/supabase/types';
import { isSupportedResumeMimeType } from '@/lib/resume/extract';
import {
  normalizeResumeLifecycleStatus,
  RESUME_LIFECYCLE_STATUSES,
} from '@/lib/resume/lifecycle';

type ResumeRow = Database['public']['Tables']['resumes']['Row'];
type AnalysisRunRow = Database['public']['Tables']['resume_analysis_runs']['Row'];

export type ResumeAnalysisReadinessCode =
  | 'RESUME_FILE_MISSING'
  | 'RESUME_FILE_UNSUPPORTED'
  | 'RESUME_TEXT_MISSING'
  | 'ANALYSIS_IN_PROGRESS'
  | 'RESUME_NOT_READY'
  | null;

export interface ResumeAnalysisReadiness {
  ready: boolean;
  code: ResumeAnalysisReadinessCode;
  message: string | null;
}

function isUnreadableResumeError(message: string | null | undefined) {
  const normalized = (message ?? '').toLowerCase();

  return (
    normalized.includes('empty_extracted_text') ||
    normalized.includes('image_based_pdf') ||
    normalized.includes('low_text_confidence') ||
    normalized.includes('ocr_failed') ||
    normalized.includes('extraction_failed') ||
    normalized.includes('no readable text') ||
    normalized.includes('too short to build a reliable resume profile') ||
    normalized.includes('not human-readable enough') ||
    normalized.includes('raw pdf internals') ||
    normalized.includes('binary-like') ||
    normalized.includes('image-based') ||
    normalized.includes('could not be read reliably')
  );
}

export function getResumeAnalysisReadiness(
  resume: Pick<ResumeRow, 'file_name' | 'file_path' | 'mime_type' | 'parse_status'>,
  latestRun: Pick<AnalysisRunRow, 'status' | 'error_message'> | null,
): ResumeAnalysisReadiness {
  if (!resume.file_path || !resume.file_name) {
    return {
      ready: false,
      code: 'RESUME_FILE_MISSING',
      message: 'Upload a resume file before analysis.',
    };
  }

  if (!isSupportedResumeMimeType(resume.mime_type, resume.file_name)) {
    return {
      ready: false,
      code: 'RESUME_FILE_UNSUPPORTED',
      message: 'Supported formats are PDF, DOCX, TXT, RTF, PNG, and JPG.',
    };
  }

  const normalizedStatus = normalizeResumeLifecycleStatus(resume.parse_status);

  if (
    normalizedStatus === RESUME_LIFECYCLE_STATUSES.EXTRACTING ||
    normalizedStatus === RESUME_LIFECYCLE_STATUSES.ANALYZING ||
    latestRun?.status === 'running' ||
    latestRun?.status === 'extracting' ||
    latestRun?.status === 'parsing' ||
    latestRun?.status === 'analyzing'
  ) {
    return {
      ready: false,
      code: 'ANALYSIS_IN_PROGRESS',
      message: 'Resume processing is already running.',
    };
  }

  if (normalizedStatus === RESUME_LIFECYCLE_STATUSES.READY) {
    return {
      ready: true,
      code: null,
      message: null,
    };
  }

  if (normalizedStatus === RESUME_LIFECYCLE_STATUSES.PARSED) {
    return {
      ready: false,
      code: 'RESUME_NOT_READY',
      message:
        'Resume parsing finished but finalization did not complete. Retry extraction to continue.',
    };
  }

  if (normalizedStatus === RESUME_LIFECYCLE_STATUSES.ANALYZED) {
    return {
      ready: false,
      code: 'RESUME_NOT_READY',
      message:
        'Resume analysis has already completed. Re-run extraction if the file changed, then analyze again.',
    };
  }

  if (normalizedStatus === RESUME_LIFECYCLE_STATUSES.EXTRACTION_FAILED) {
    return {
      ready: false,
      code: 'RESUME_TEXT_MISSING',
      message:
        resume.mime_type === 'application/pdf'
          ? 'This PDF could not be parsed reliably. Retry extraction with Force OCR or upload a clearer file.'
          : 'This file could not be parsed reliably. Retry extraction or upload a clearer file.',
    };
  }

  if (normalizedStatus === RESUME_LIFECYCLE_STATUSES.PARSING_FAILED) {
    return {
      ready: false,
      code: 'RESUME_NOT_READY',
      message: 'Resume parsing failed. Retry extraction to rebuild the profile.',
    };
  }

  if (normalizedStatus === RESUME_LIFECYCLE_STATUSES.ANALYSIS_FAILED) {
    return {
      ready: false,
      code: 'RESUME_NOT_READY',
      message:
        'Resume analysis failed. Re-run extraction to return this resume to a READY state.',
    };
  }

  if (normalizedStatus === RESUME_LIFECYCLE_STATUSES.EXTRACTED_WITH_WARNINGS) {
    return {
      ready: false,
      code: 'RESUME_TEXT_MISSING',
      message:
        'Resume text quality is too low for analysis. Retry extraction with Force OCR or upload a cleaner file.',
    };
  }

  if (
    latestRun?.status === 'failed' &&
    isUnreadableResumeError(latestRun.error_message)
  ) {
    return {
      ready: false,
      code: 'RESUME_TEXT_MISSING',
      message:
        resume.mime_type === 'application/pdf'
          ? 'This PDF could not be parsed reliably. Upload a clearer text PDF or DOCX.'
          : 'This resume could not be parsed reliably. Upload a clearer file and try again.',
    };
  }

  return {
    ready: false,
    code: 'RESUME_NOT_READY',
    message: 'Resume must finish extraction and parsing before analysis can start.',
  };
}
