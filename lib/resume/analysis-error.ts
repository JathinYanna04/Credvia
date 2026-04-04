export type ResumeAnalysisExecutionCode =
  | 'PROFILE_MISSING'
  | 'PROFILE_FETCH_FAILED'
  | 'SKILLS_FETCH_FAILED'
  | 'JOBS_FETCH_FAILED'
  | 'JOB_SKILLS_FETCH_FAILED'
  | 'COMPANIES_FETCH_FAILED'
  | 'MATCH_UPSERT_FAILED';

export interface ResumeAnalysisExecutionContext {
  code: ResumeAnalysisExecutionCode;
  operation: string;
  table:
    | 'resume_profiles'
    | 'resume_skills'
    | 'startup_jobs'
    | 'job_skills'
    | 'startup_companies'
    | 'job_matches';
  resumeId?: string;
  userId?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export class ResumeAnalysisExecutionError extends Error {
  constructor(public readonly context: ResumeAnalysisExecutionContext) {
    super(context.message);
    this.name = 'ResumeAnalysisExecutionError';
  }
}

export function resumeAnalysisExecutionErrorDetails(error: ResumeAnalysisExecutionError) {
  return {
    code: error.context.code,
    operation: error.context.operation,
    table: error.context.table,
    resumeId: error.context.resumeId ?? null,
    userId: error.context.userId ?? null,
    message: error.context.message,
    details: error.context.details ?? null,
    hint: error.context.hint ?? null,
  };
}
