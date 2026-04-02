export const RESUME_LIFECYCLE_STATUSES = {
  UPLOADED: 'UPLOADED',
  EXTRACTING: 'EXTRACTING',
  EXTRACTED: 'EXTRACTED',
  EXTRACTED_WITH_WARNINGS: 'EXTRACTED_WITH_WARNINGS',
  PARSED: 'PARSED',
  READY: 'READY',
  ANALYZING: 'ANALYZING',
  ANALYZED: 'ANALYZED',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  PARSING_FAILED: 'PARSING_FAILED',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
} as const;

export type ResumeLifecycleStatus =
  (typeof RESUME_LIFECYCLE_STATUSES)[keyof typeof RESUME_LIFECYCLE_STATUSES];

export type LegacyResumeStatus =
  | 'uploaded'
  | 'processing'
  | 'ready'
  | 'parsing'
  | 'parsed'
  | 'failed';

export type AnyResumeStatus = ResumeLifecycleStatus | LegacyResumeStatus;

const legacyToCanonicalStatus: Record<LegacyResumeStatus, ResumeLifecycleStatus> = {
  uploaded: RESUME_LIFECYCLE_STATUSES.UPLOADED,
  processing: RESUME_LIFECYCLE_STATUSES.EXTRACTING,
  ready: RESUME_LIFECYCLE_STATUSES.READY,
  parsing: RESUME_LIFECYCLE_STATUSES.ANALYZING,
  parsed: RESUME_LIFECYCLE_STATUSES.ANALYZED,
  failed: RESUME_LIFECYCLE_STATUSES.ANALYSIS_FAILED,
};

export function normalizeResumeLifecycleStatus(
  status: string | null | undefined,
): ResumeLifecycleStatus | null {
  if (!status) {
    return null;
  }

  const upper = status.toUpperCase();

  if (upper in RESUME_LIFECYCLE_STATUSES) {
    return RESUME_LIFECYCLE_STATUSES[
      upper as keyof typeof RESUME_LIFECYCLE_STATUSES
    ];
  }

  if (status in legacyToCanonicalStatus) {
    return legacyToCanonicalStatus[status as LegacyResumeStatus];
  }

  return null;
}

export function isResumeReadyForAnalysis(status: string | null | undefined) {
  return normalizeResumeLifecycleStatus(status) === RESUME_LIFECYCLE_STATUSES.READY;
}

export function isResumeInAnalysis(status: string | null | undefined) {
  return normalizeResumeLifecycleStatus(status) === RESUME_LIFECYCLE_STATUSES.ANALYZING;
}

export function isResumeInExtraction(status: string | null | undefined) {
  const normalized = normalizeResumeLifecycleStatus(status);
  return normalized === RESUME_LIFECYCLE_STATUSES.EXTRACTING;
}

export function isResumeFailureStatus(status: string | null | undefined) {
  const normalized = normalizeResumeLifecycleStatus(status);
  return (
    normalized === RESUME_LIFECYCLE_STATUSES.EXTRACTION_FAILED ||
    normalized === RESUME_LIFECYCLE_STATUSES.PARSING_FAILED ||
    normalized === RESUME_LIFECYCLE_STATUSES.ANALYSIS_FAILED
  );
}

export function shouldAllowExtractionRetry(status: string | null | undefined) {
  const normalized = normalizeResumeLifecycleStatus(status);

  if (!normalized) {
    return true;
  }

  return (
    normalized !== RESUME_LIFECYCLE_STATUSES.EXTRACTING &&
    normalized !== RESUME_LIFECYCLE_STATUSES.ANALYZING
  );
}
