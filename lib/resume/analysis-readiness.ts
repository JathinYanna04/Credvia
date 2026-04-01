import type { Database } from '@/lib/supabase/types';
import { isSupportedResumeMimeType } from '@/lib/resume/extract';

type ResumeRow = Database['public']['Tables']['resumes']['Row'];
type AnalysisRunRow = Database['public']['Tables']['resume_analysis_runs']['Row'];

export type ResumeAnalysisReadinessCode =
  | 'RESUME_FILE_MISSING'
  | 'RESUME_FILE_UNSUPPORTED'
  | 'RESUME_TEXT_MISSING'
  | 'ANALYSIS_IN_PROGRESS'
  | null;

export interface ResumeAnalysisReadiness {
  ready: boolean;
  code: ResumeAnalysisReadinessCode;
  message: string | null;
}

function isUnreadableResumeError(message: string | null | undefined) {
  const normalized = (message ?? '').toLowerCase();

  return (
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
      message: 'Only PDF and DOCX resumes can be analyzed.',
    };
  }

  if (resume.parse_status === 'parsing' || latestRun?.status === 'running') {
    return {
      ready: false,
      code: 'ANALYSIS_IN_PROGRESS',
      message: 'Resume analysis is already running.',
    };
  }

  if (
    latestRun?.status === 'failed' &&
    isUnreadableResumeError(latestRun.error_message)
  ) {
    return {
      ready: false,
      code: 'RESUME_TEXT_MISSING',
      message: 'This resume could not be read reliably. Try a clearer PDF or DOCX.',
    };
  }

  return {
    ready: true,
    code: null,
    message: null,
  };
}
