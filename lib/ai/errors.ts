import type { ApiError } from '@/lib/types';

export type AiRuntimeErrorCode = Extract<
  ApiError['code'],
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'AI_FEATURE_UNSUPPORTED'
  | 'AI_FEATURE_DISABLED'
  | 'AI_SUBJECT_MISMATCH'
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_EXECUTOR_UNAVAILABLE'
  | 'AI_OUTPUT_INVALID'
  | 'AI_OUTPUT_REPAIR_FAILED'
  | 'AI_RUN_STATE_INVALID'
  | 'AI_RUN_CLAIM_CONFLICT'
  | 'AI_RUN_DUPLICATE'
  | 'AI_RUN_NOT_READY'
>;

export class AiRuntimeError extends Error {
  constructor(
    public readonly code: AiRuntimeErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    public readonly suggestedAction?: string,
  ) {
    super(message);
    this.name = 'AiRuntimeError';
  }
}

export function isAiRuntimeError(error: unknown): error is AiRuntimeError {
  return error instanceof AiRuntimeError;
}
