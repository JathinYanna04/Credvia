import type {
  OpenToValue,
  PersonaDetailsMap,
  PersonaSlug,
  ProfileIntent,
  ScoreSummary,
} from '@/lib/personas';

export type AccountType = PersonaSlug;

export type PostType =
  | "question"
  | "discussion"
  | "project_showcase"
  | "resource"
  | "opportunity"
  | "resume_review"
  | "looking_for_collaborator"
  | "startup_idea";

export type FeedTab =
  | "for-you"
  | "communities"
  | "following"
  | "trending"
  | "founders"
  | "careers"
  | "mentors"
  | "recruiters";

export type NotificationType =
  | "reply"
  | "mention"
  | "vote"
  | "best_answer"
  | "follow"
  | "idea_revision"
  | "mod_action"
  | "reputation_gain";

export interface StartupIdeaRevisionSummary {
  id: string;
  revisionNumber: number;
  title: string;
  body: string;
  problem: string;
  targetAudience: string;
  solution: string;
  marketCategory: string;
  stage: "idea" | "problem_validation" | "mvp_building" | "early_users";
  monetizationModel?: string;
  changeSummary?: string;
  createdAt: string;
}

export interface CommunitySummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  memberCount: number;
  postCount: number;
  accent: string;
}

export interface ReputationSummary {
  communityId: string;
  communityName: string;
  communitySlug: string;
  score: number;
}

export interface ReputationBreakdownItem {
  label: string;
  value: number;
  description: string;
}

export interface FeedExplanation {
  layer: "real-time" | "rising" | "stable";
  reasons: string[];
}

export interface UserSummary {
  id: string;
  username: string;
  fullName: string;
  headline: string;
  avatarUrl: string;
  primaryPersona?: PersonaSlug;
  secondaryPersonas?: PersonaSlug[];
  profileIntent?: ProfileIntent[];
  openTo?: OpenToValue[];
  expertiseTags?: string[];
  interestTags?: string[];
  personaDetails?: PersonaDetailsMap[PersonaSlug] | null;
  skills: string[];
  location?: string;
  website?: string;
  currentCompany?: string;
  scoreSummary?: ScoreSummary;
  badge?: string;
  contributionProfile?: Record<string, unknown>;
  trustProfile?: Record<string, unknown>;
  growthTrajectory?: Record<string, unknown>;
  behavioralSignals?: Record<string, unknown>;
  reputation: ReputationSummary[];
}

export interface PostSummary {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  version?: string;
  postType: PostType;
  voteScore: number;
  upvoteCount?: number;
  downvoteCount?: number;
  currentUserVote?: -1 | 0 | 1;
  commentCount: number;
  saveCount: number;
  author: UserSummary;
  community: CommunitySummary;
  tags: string[];
  unanswered?: boolean;
  externalUrl?: string;
  startupIdea?: {
    problem: string;
    targetAudience: string;
    solution: string;
    marketCategory: string;
    stage: "idea" | "problem_validation" | "mvp_building" | "early_users";
    monetizationModel?: string;
    validationScore: number;
    uniqueCommenters: number;
    followerCount: number;
    revisionCount: number;
    lastRevisionAt?: string;
    currentRevisionId?: string;
  };
  feedExplanation?: FeedExplanation;
}

export interface CommentSummary {
  id: string;
  author: UserSummary;
  body: string;
  createdAt: string;
  updatedAt: string;
  version?: string;
  voteScore: number;
  upvoteCount?: number;
  downvoteCount?: number;
  currentUserVote?: -1 | 0 | 1;
  isBestAnswer?: boolean;
  replies?: CommentSummary[];
}

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  actor: UserSummary;
  description: string;
  entityId?: string;
  entityType?: string;
  createdAt: string;
  unread: boolean;
}

export interface ApiError {
  code:
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "VALIDATION_ERROR"
    | "AI_FEATURE_UNSUPPORTED"
    | "AI_FEATURE_DISABLED"
    | "AI_SUBJECT_MISMATCH"
    | "AI_PROVIDER_NOT_CONFIGURED"
    | "AI_PROVIDER_UNAVAILABLE"
    | "AI_EXECUTOR_UNAVAILABLE"
    | "AI_OUTPUT_INVALID"
    | "AI_OUTPUT_REPAIR_FAILED"
    | "AI_RUN_STATE_INVALID"
    | "AI_RUN_CLAIM_CONFLICT"
    | "AI_RUN_DUPLICATE"
    | "AI_RUN_NOT_READY"
    | "ANALYSIS_IN_PROGRESS"
    | "RESUME_FILE_MISSING"
    | "RESUME_FILE_UNSUPPORTED"
    | "RESUME_TEXT_MISSING"
    | "EXTRACTION_FAILED"
    | "IMAGE_BASED_PDF"
    | "LOW_TEXT_CONFIDENCE"
    | "OCR_UNAVAILABLE"
    | "OCR_FAILED"
    | "EMPTY_EXTRACTED_TEXT"
    | "RESUME_NOT_READY"
    | "UNSUPPORTED_RESUME_FORMAT"
    | "RESUME_ANALYSIS_RUNS_RLS_BLOCKED"
    | "RATE_LIMITED"
    | "ANALYSIS_SERVICE_UNAVAILABLE"
    | "INTERNAL_ERROR";
  message: string;
  details?: unknown;
  suggestedAction?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  meta?: {
    cursor?: string | null;
    total?: number;
  };
}

export type AiFeature =
  | "founder_idea_feedback"
  | "career_copilot"
  | "moderation_review";

export type AiSubjectType = "startup_idea" | "resume" | "report";

export type AiRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface AiRunSummary {
  id: string;
  feature: AiFeature;
  subjectType: AiSubjectType;
  subjectId: string;
  requestedBy?: string;
  status: AiRunStatus;
  promptVersion: string;
  promptKey?: string;
  inputHash?: string | null;
  runIdentity?: string | null;
  attemptCount?: number;
  maxAttempts?: number;
  latencyMs?: number | null;
  provider?: string | null;
  model?: string | null;
  modelVersion?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  processorId?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  nextRetryAt?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
}

export interface CreateAiRunRequest {
  feature: AiFeature;
  subjectType: AiSubjectType;
  subjectId: string;
  promptVersion: string;
  promptKey?: string;
  forceRegenerate?: boolean;
  maxAttempts?: number;
  traceId?: string;
  idempotencyPayload?: Record<string, unknown>;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAiRunResponse {
  run: AiRunSummary;
  reused?: boolean;
}

export interface AnalyzeResumeRequest {
  rerun?: boolean;
  targetRole?: string;
  jobDescription?: string;
  forceOCR?: boolean;
  forceOcr?: boolean;
}

export interface ExtractResumeRequest {
  retry?: boolean;
  forceOCR?: boolean;
  forceOcr?: boolean;
  forceLLM?: boolean;
  skipLLM?: boolean;
}

export interface ResumeExtractionQualitySummary {
  textLength: number;
  wordCount: number;
  confidenceScore: number;
  confidenceTier: "high" | "medium" | "low";
  detectedSectionCount: number;
  junkRatio: number;
  likelyScannedPdf: boolean;
  humanReadableRatio: number;
  suspiciousTokenCount: number;
  resumeHintCount: number;
  pdfInternalHitCount?: number;
  contaminationScore?: number;
  salvageScore?: number;
}

export interface ResumeExtractionSummary {
  method: string;
  attemptedMethods: string[];
  pageCount?: number;
  pageSourceSummary?: Record<string, number>;
  pageDecisions?: Array<Record<string, unknown>>;
  layoutReconstructionUsed?: boolean;
  usedOcr: boolean;
  ocrNeeded?: boolean;
  ocrStatus?:
    | "skipped_unnecessary"
    | "attempted_no_gain"
    | "failed_preserved_previous"
    | "used_successfully"
    | "unavailable_preserved_previous"
    | null;
  ocrAttempted?: boolean;
  ocrImprovedQuality?: boolean | null;
  ocrConfidence: number | null;
  ocrAvailable?: boolean;
  ocrUnavailableReason?: string | null;
  acceptedWithWarnings?: boolean;
  warningCode?:
    | "LOW_TEXT_CONFIDENCE"
    | "OCR_UNAVAILABLE"
    | "OCR_DID_NOT_IMPROVE"
    | "SALVAGED_FROM_NOISE"
    | "CLEANED_TEXT_LOW_SIGNAL"
    | null;
  warningMessage?: string | null;
  textLength?: number;
  cleanedTextLength?: number;
  contaminationScore?: number;
  salvageScore?: number;
  cleaningActions?: string[];
  readiness?: "good" | "partial" | "poor" | "failed";
  quality: ResumeExtractionQualitySummary;
}

export interface ResumeExtractionErrorDetails {
  reason?: string | null;
  attemptedMethods: string[];
  method: string | null;
  pageCount?: number;
  pageSourceSummary?: Record<string, number>;
  pageDecisions?: Array<Record<string, unknown>>;
  layoutReconstructionUsed?: boolean;
  usedOcr: boolean;
  ocrNeeded?: boolean;
  ocrStatus?:
    | "skipped_unnecessary"
    | "attempted_no_gain"
    | "failed_preserved_previous"
    | "used_successfully"
    | "unavailable_preserved_previous"
    | null;
  ocrAttempted: boolean;
  ocrImprovedQuality: boolean | null;
  ocrConfidence: number | null;
  ocrAvailable?: boolean;
  ocrUnavailableReason?: string | null;
  textLength: number;
  cleanedTextLength?: number;
  wordCount: number;
  readiness: "good" | "partial" | "poor" | "failed";
  confidenceScore: number;
  confidenceTier: "high" | "medium" | "low";
  detectedSectionCount: number;
  junkRatio: number;
  likelyScannedPdf: boolean;
  contaminationScore?: number;
  salvageScore?: number;
  cleaningActions?: string[];
}

export interface AnalyzeResumeResponse {
  analyzed: boolean;
  resumeId: string;
  status?: string;
  matchCount?: number;
  extraction?: ResumeExtractionSummary;
  warning?: string | null;
}
