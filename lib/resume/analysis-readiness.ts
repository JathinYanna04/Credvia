import type { Database } from '@/lib/supabase/types';
import { getResumeExtension, isSupportedResumeMimeType } from '@/lib/resume/extract';

type ResumeRow = Database['public']['Tables']['resumes']['Row'];
type AnalysisRunRow = Database['public']['Tables']['resume_analysis_runs']['Row'];
type ResumeAnalysisReadinessCode =
  | 'RESUME_FILE_MISSING'
  | 'RESUME_FILE_UNSUPPORTED'
  | 'RESUME_TEXT_MISSING'
  | 'ANALYSIS_IN_PROGRESS';

export interface ResumeAnalysisReadiness {
  ready: boolean;
  code: ResumeAnalysisReadinessCode | null;
  message: string | null;
}

function getUnreadableResumeMessage(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes('no readable text') ||
    normalized.includes('too short to build a reliable resume profile') ||
    normalized.includes('not human-readable enough') ||
    normalized.includes('raw pdf internals') ||
    normalized.includes('binary-like') ||
    normalized.includes('ocr')
  ) {
    return 'Upload or parse resume content before analysis. Try a text-based DOCX or a more readable PDF.';
  }

  return null;
}

export function getResumeAnalysisReadiness(
  resume: Pick<ResumeRow, 'file_name' | 'file_path' | 'mime_type' | 'parse_status'>,
  latestRun?: Pick<AnalysisRunRow, 'status' | 'error_message'> | null,
): ResumeAnalysisReadiness {
  if (!resume.file_path || !resume.file_name) {
    return {
      ready: false,
      code: 'RESUME_FILE_MISSING',
      message: 'Upload a resume file before analysis.',
    };
  }

  if (!isSupportedResumeMimeType(resume.mime_type, resume.file_name) || !getResumeExtension(resume.file_name)) {
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

  if (latestRun?.status === 'failed' && latestRun.error_message) {
    const unreadableMessage = getUnreadableResumeMessage(latestRun.error_message);
    if (unreadableMessage) {
      return {
        ready: false,
        code: 'RESUME_TEXT_MISSING',
        message: unreadableMessage,
      };
    }
  }

  return {
    ready: true,
    code: null,
    message: null,
  };
}
