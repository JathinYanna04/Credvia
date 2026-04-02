type SupabaseErrorLike = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

export interface ResumePersistenceContext {
  operation: string;
  table: 'resumes' | 'resume_analysis_runs' | 'resume_profiles' | 'resume_skills';
  resumeId?: string;
  runId?: string;
  targetStatus?: string;
}

export class ResumePersistenceError extends Error {
  constructor(
    message: string,
    public readonly context: ResumePersistenceContext,
    public readonly sourceError: SupabaseErrorLike,
  ) {
    super(message);
    this.name = 'ResumePersistenceError';
  }

  get isConstraintViolation() {
    return this.sourceError.code === '23514';
  }
}

export function toResumePersistenceError(
  message: string,
  context: ResumePersistenceContext,
  sourceError: SupabaseErrorLike,
) {
  return new ResumePersistenceError(message, context, sourceError);
}

export function resumePersistenceErrorDetails(error: ResumePersistenceError) {
  return {
    operation: error.context.operation,
    table: error.context.table,
    resumeId: error.context.resumeId ?? null,
    runId: error.context.runId ?? null,
    targetStatus: error.context.targetStatus ?? null,
    dbCode: error.sourceError.code ?? null,
    dbHint: error.sourceError.hint ?? null,
    dbDetails: error.sourceError.details ?? null,
    dbMessage: error.sourceError.message,
  };
}
