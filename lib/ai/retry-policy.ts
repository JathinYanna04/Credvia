interface RetryDecisionInput {
  code: string | null | undefined;
  status?: number | null;
  transient?: boolean | null;
  attemptCount: number;
  maxAttempts: number;
}

interface RetryDecision {
  retry: boolean;
  reason:
    | 'missing-error-code'
    | 'max-attempts-reached'
    | 'rate-limited-retryable'
    | 'non-retryable-error-code'
    | 'non-retryable-status'
    | 'provider-status-non-retryable'
    | 'analysis-not-transient'
    | 'provider-transient-status'
    | 'analysis-transient'
    | 'retryable-default';
}

const NON_RETRYABLE_ERROR_CODES = new Set([
  'AI_PROVIDER_NOT_CONFIGURED',
  'AI_FEATURE_DISABLED',
  'AI_FEATURE_UNSUPPORTED',
  'AI_SUBJECT_MISMATCH',
  'AI_OUTPUT_INVALID',
  'AI_OUTPUT_REPAIR_FAILED',
  'AI_RUN_STATE_INVALID',
  'AI_RUN_NOT_READY',
  'AI_RUN_DUPLICATE',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
] as const);

const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404, 409, 410, 422]);

function toNonEmptyString(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toNormalizedStatus(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function isNonRetryableFailureCode(code: string | null | undefined) {
  const normalized = toNonEmptyString(code);
  if (!normalized) {
    return false;
  }

  return NON_RETRYABLE_ERROR_CODES.has(normalized as (typeof NON_RETRYABLE_ERROR_CODES extends Set<infer T> ? T : never));
}

export function classifyAiRetryDecision(input: RetryDecisionInput): RetryDecision {
  const normalizedCode = toNonEmptyString(input.code);
  const normalizedStatus = toNormalizedStatus(input.status);

  if (!normalizedCode) {
    return {
      retry: input.attemptCount < input.maxAttempts,
      reason: input.attemptCount < input.maxAttempts
        ? 'missing-error-code'
        : 'max-attempts-reached',
    };
  }

  if (input.attemptCount >= input.maxAttempts) {
    return {
      retry: false,
      reason: 'max-attempts-reached',
    };
  }

  if (normalizedCode === 'RATE_LIMITED') {
    return {
      retry: true,
      reason: 'rate-limited-retryable',
    };
  }

  if (isNonRetryableFailureCode(normalizedCode)) {
    return {
      retry: false,
      reason: 'non-retryable-error-code',
    };
  }

  if (normalizedStatus && NON_RETRYABLE_HTTP_STATUSES.has(normalizedStatus)) {
    return {
      retry: false,
      reason: 'non-retryable-status',
    };
  }

  if (normalizedCode === 'AI_PROVIDER_UNAVAILABLE') {
    if (!normalizedStatus || normalizedStatus === 408 || normalizedStatus === 429 || normalizedStatus >= 500) {
      return {
        retry: true,
        reason: 'provider-transient-status',
      };
    }

    return {
      retry: false,
      reason: 'provider-status-non-retryable',
    };
  }

  if (normalizedCode === 'ANALYSIS_SERVICE_UNAVAILABLE') {
    if (input.transient === false) {
      return {
        retry: false,
        reason: 'analysis-not-transient',
      };
    }

    return {
      retry: true,
      reason: 'analysis-transient',
    };
  }

  return {
    retry: true,
    reason: 'retryable-default',
  };
}
